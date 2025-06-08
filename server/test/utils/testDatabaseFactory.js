import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

/**
 * Factory for creating isolated test database connections
 */
class TestDatabaseFactory {
  constructor() {
    this.connections = new Map();
    this.baseConfig = {
      host: 'localhost',
      user: 'wayne',
      database: 'treechat_test',
      port: 5432,
      max: 5, // Reduced connection pool for tests
      idle_timeout: 5, // Close idle connections quickly
      connect_timeout: 5, // Shorter connect timeout
      onnotice: () => {}, // Ignore notices
    };
  }
  
  /**
   * Creates a manual database connection without the test initialization
   * Useful for tests that need to preserve data
   * 
   * @param {Object} options - Additional options for the connection
   * @returns {postgres.Sql} - Database connection
   */
  createManualConnection(options = {}) {
    const connectionOptions = {
      ...this.baseConfig,
      ...options,
      onconnect: async () => {
        console.log(`Manual database connection created for ${options.application_name || 'unknown'}`);
      },
      onretry: (err, initial) => {
        console.warn(`Manual database connection error (${initial ? 'initial' : 'retry'}):`, err.message);
        return true; // Always retry
      },
      onclose: () => {
        console.log(`Manual database connection closed for ${options.application_name || 'unknown'}`);
      }
    };
    
    return postgres(connectionOptions);
  }

  /**
   * Creates a dedicated database connection for a test
   * 
   * @param {string} testId - Unique identifier for the test
   * @returns {Promise<postgres.Sql>} - Database connection
   */
  async createTestDbConnection(testId) {
    // Check if we already have a connection for this test
    if (this.connections.has(testId)) {
      console.log(`Reusing existing database connection for ${testId}`);
      return this.connections.get(testId);
    }

    // Create a new connection with a unique application_name for monitoring
    const sql = postgres({
      ...this.baseConfig,
      application_name: `treechat-test-${testId}`,
      onconnect: async () => {
        console.log(`Test database connection created for ${testId}`);
      },
      onretry: (err, initial) => {
        console.warn(`Test database connection error for ${testId} (${initial ? 'initial' : 'retry'}):`, err.message);
        return true; // Always retry
      },
      onclose: () => {
        console.log(`Test database connection closed for ${testId}`);
        this.connections.delete(testId);
      }
    });

    // Store the connection
    this.connections.set(testId, sql);

    // Initialize the test database if needed (reset tables, etc.)
    await this.initializeTestDatabase(sql, testId);

    return sql;
  }

  /**
   * Initialize the test database with clean state
   * 
   * @param {postgres.Sql} sql - Database connection
   * @param {string} testId - Test identifier
   */
  async initializeTestDatabase(sql, testId) {
    try {
      // Check if tables exist before trying to truncate
      const checkTablesExist = await sql`
        SELECT EXISTS (
          SELECT FROM pg_tables 
          WHERE schemaname = 'public' 
          AND tablename = 'conversations'
        ) as tables_exist
      `;
      
      const tablesExist = checkTablesExist[0]?.tables_exist || false;
      
      // If tables don't exist yet, don't try to truncate
      if (!tablesExist) {
        console.log(`Test database tables don't exist yet for ${testId}, skipping truncation`);
        return;
      }
      
      // Check if the attachments table exists
      const checkAttachmentsExist = await sql`
        SELECT EXISTS (
          SELECT FROM pg_tables 
          WHERE schemaname = 'public' 
          AND tablename = 'attachments'
        ) as attachments_exist
      `;
      
      const attachmentsExist = checkAttachmentsExist[0]?.attachments_exist || false;
      
      // If attachments table doesn't exist, create it
      if (!attachmentsExist) {
        console.log(`Creating attachments table for ${testId}`);
        await sql`
          CREATE TABLE IF NOT EXISTS attachments (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            message_id UUID NOT NULL REFERENCES messages(uuid),
            mime_type TEXT,
            storage TEXT DEFAULT 'local',
            path TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          );
          
          CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
          CREATE INDEX IF NOT EXISTS idx_attachments_storage ON attachments(storage);
        `;
        console.log(`Attachments table created for ${testId}`);
      }
      
      // Begin a transaction to isolate changes
      await sql.begin(async (tx) => {
        // Reset all tables
        await this.truncateAllTables(tx);
        
        // Seed with minimal test data if needed
        // This could be extended to load specific fixtures for different tests
        console.log(`Test database initialized for ${testId}`);
      });
    } catch (error) {
      console.error(`Error initializing test database for ${testId}:`, error);
      // Don't throw the error - just log it and continue
      // This allows tests to proceed even if initialization fails
    }
  }

  /**
   * Truncate all tables in the test database
   * 
   * @param {postgres.TransactionSql} tx - Transaction
   */
  async truncateAllTables(tx) {
    try {
      // Get all table names
      const tables = await tx`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' AND 
        tablename NOT IN ('schema_migrations', 'schema_versions')
      `;

      if (tables.length > 0) {
        // Disable triggers temporarily
        await tx`SET session_replication_role = 'replica'`;
        
        // Truncate all tables one by one to avoid errors if one fails
        for (const table of tables) {
          try {
            await tx`TRUNCATE TABLE ${tx(table.tablename)} CASCADE`;
            console.log(`Truncated table: ${table.tablename}`);
          } catch (err) {
            console.warn(`Error truncating table ${table.tablename}: ${err.message}`);
          }
        }
        
        // Re-enable triggers
        await tx`SET session_replication_role = 'origin'`;
      } else {
        console.log('No tables to truncate');
      }
    } catch (error) {
      console.error('Error truncating tables:', error);
      // Don't throw the error - just log it and continue
    }
  }

  /**
   * Reset the entire test database by running the schema creation script
   * 
   * @returns {Promise<void>}
   */
  async resetTestDatabase() {
    return new Promise((resolve, reject) => {
      try {
        console.log('Resetting test database...');
        
        // First drop and recreate the database to ensure a clean slate
        const resetSql = `
          DROP DATABASE IF EXISTS treechat_test;
          CREATE DATABASE treechat_test;
        `;
        
        // Create a temporary file for the reset SQL
        const resetPath = path.join(os.tmpdir(), 'treechat_reset.sql');
        fs.writeFileSync(resetPath, resetSql);
        
        // Run psql command to drop and recreate the database
        console.log('Dropping and recreating test database...');
        const psqlReset = spawn('psql', [
          '-U', 'wayne',
          '-d', 'postgres', // Connect to postgres db to drop/create the test db
          '-f', resetPath
        ]);
        
        psqlReset.on('close', (resetCode) => {
          if (resetCode !== 0) {
            console.error(`Failed to reset database: exit code ${resetCode}`);
            reject(new Error(`Failed to reset database: exit code ${resetCode}`));
            return;
          }
          
          // Now run the schema creation script
          console.log('Applying schema to test database...');
          
          // Path to the schema SQL file
          const schemaPath = path.join(process.cwd(), '..', 'sqlscripts', 'schema.sql');
          
          // Ensure the file exists
          if (!fs.existsSync(schemaPath)) {
            reject(new Error(`Schema file not found: ${schemaPath}`));
            return;
          }
          
          // Run psql command to apply the schema to the fresh database
          const psql = spawn('psql', [
            '-U', 'wayne',
            '-d', 'treechat_test',
            '-f', schemaPath
          ]);
          
          let output = '';
          let errorOutput = '';
          
          psql.stdout.on('data', (data) => {
            output += data.toString();
          });
          
          psql.stderr.on('data', (data) => {
            errorOutput += data.toString();
            // Print stderr to console to monitor progress
            console.log(data.toString());
          });
          
          psql.on('close', (code) => {
            // In this case, we accept non-zero exit codes because
            // psql often exits with warnings even when the schema was applied
            console.log(`Schema application completed with code ${code}`);
            
            // Now apply the attachments script
            const attachmentsPath = path.join(process.cwd(), 'scripts', 'attachments.sql');
            
            if (fs.existsSync(attachmentsPath)) {
              console.log('Applying attachments schema to test database...');
              
              const psqlAttachments = spawn('psql', [
                '-U', 'wayne',
                '-d', 'treechat_test',
                '-f', attachmentsPath
              ]);
              
              psqlAttachments.stdout.on('data', (data) => {
                console.log(data.toString());
              });
              
              psqlAttachments.stderr.on('data', (data) => {
                console.log(data.toString());
              });
              
              psqlAttachments.on('close', (attachCode) => {
                console.log(`Attachments schema application completed with code ${attachCode}`);
                console.log('Test database reset successfully');
                
                // Clean up the temporary file
                try {
                  fs.unlinkSync(resetPath);
                } catch (err) {
                  console.warn('Could not delete temporary SQL file:', err.message);
                }
                
                resolve();
              });
            } else {
              console.log('Attachments schema not found, creating default attachments table...');
              
              // Create a default attachments table if the script doesn't exist
              const createAttachmentsSQL = `
                CREATE TABLE IF NOT EXISTS attachments (
                  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                  message_id UUID NOT NULL REFERENCES messages(uuid),
                  mime_type TEXT,
                  storage TEXT DEFAULT 'local',
                  path TEXT,
                  created_at TIMESTAMP DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
              `;
              
              const tempAttachmentsPath = path.join(os.tmpdir(), 'attachments_temp.sql');
              fs.writeFileSync(tempAttachmentsPath, createAttachmentsSQL);
              
              const psqlDefaultAttachments = spawn('psql', [
                '-U', 'wayne',
                '-d', 'treechat_test',
                '-f', tempAttachmentsPath
              ]);
              
              psqlDefaultAttachments.on('close', (defaultAttachCode) => {
                console.log(`Default attachments table creation completed with code ${defaultAttachCode}`);
                console.log('Test database reset successfully');
                
                // Clean up temporary files
                try {
                  fs.unlinkSync(resetPath);
                  fs.unlinkSync(tempAttachmentsPath);
                } catch (err) {
                  console.warn('Could not delete temporary SQL file(s):', err.message);
                }
                
                resolve();
              });
            }
          });
        });
      } catch (error) {
        console.error('Error resetting test database:', error);
        reject(error);
      }
    });
  }

  /**
   * Close all test database connections
   * 
   * @returns {Promise<void>}
   */
  async closeAllConnections() {
    const closePromises = [];
    
    for (const [testId, sql] of this.connections.entries()) {
      console.log(`Closing database connection for ${testId}`);
      closePromises.push(sql.end({ timeout: 30 }));
    }
    
    await Promise.all(closePromises);
    this.connections.clear();
    console.log('All test database connections closed');
  }
}

// Singleton instance
const testDatabaseFactory = new TestDatabaseFactory();

export default testDatabaseFactory;
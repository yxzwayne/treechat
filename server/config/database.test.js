import postgres from 'postgres';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a SQL instance for test environment
const sql = postgres({
  host: 'localhost',
  user: 'wayne',
  database: 'treechat_test', // Use test database
  port: 5432,
  max: 5, // Reduced connection pool for tests
  idle_timeout: 10, // Close idle connections quickly
  connect_timeout: 5, // Shorter connect timeout
  onnotice: () => {}, // Ignore notices
  onconnect: async (client) => {
    console.log('Connected to test database: treechat_test');
    
    // Ensure attachments table exists
    try {
      // Check if the attachments table exists
      const tableExists = await sql`
        SELECT EXISTS (
          SELECT FROM pg_tables 
          WHERE schemaname = 'public' 
          AND tablename = 'attachments'
        ) as exists
      `;
      
      if (!tableExists[0]?.exists) {
        console.log('Creating attachments table in test database...');
        
        // Create the attachments table
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
        
        console.log('Attachments table created successfully in test database');
      } else {
        console.log('Attachments table already exists in test database');
      }
    } catch (error) {
      console.error('Error creating attachments table in test database:', error);
    }
  },
  onretry: (err, initial) => {
    console.warn(`Test database connection error (${initial ? 'initial' : 'retry'}):`, err.message);
    return true; // Always retry
  },
  onclose: () => {
    console.log('Test database connection closed');
  }
});

export default sql;
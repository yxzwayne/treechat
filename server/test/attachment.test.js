import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { app } from '../app.js';
import { findAvailablePort, releasePort } from './utils/portFinder.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test data
const testConversation = {
  summary: 'Attachment Test Conversation'
};

const testMessage = {
  sender: 'human',
  content: [{ type: 'text', text: 'Test message for attachment' }],
  text: 'Test message for attachment'
};

// Create a test file for upload testing
const testFilePath = path.join(__dirname, 'test-file.txt');
const testFileContent = 'This is a test file for attachment upload testing';

// Store created resources for cleanup
let server;
let testPort;
let baseUrl;
let conversationId;
let messageId;
let attachmentId;
let sql; // Database connection specific to this test file

// Setup server before tests
beforeAll(async () => {
  // Create a test file for attachments
  await fs.writeFile(testFilePath, testFileContent);
  
  // Create a direct database connection for this test file
  sql = postgres({
    host: 'localhost',
    user: 'wayne',
    database: 'treechat_test',
    port: 5432,
    max: 5,
    idle_timeout: 5,
    connect_timeout: 5,
    onnotice: () => {},
  });
  
  // Reset database tables
  await sql`TRUNCATE TABLE conversations, messages, attachments CASCADE`;
  
  // Manually create conversation and message directly in the database
  conversationId = randomUUID();
  await sql`
    INSERT INTO conversations (uuid, summary)
    VALUES (${conversationId}, ${testConversation.summary})
  `;
  console.log(`Created test conversation directly in DB with ID: ${conversationId}`);
  
  // Create message
  messageId = randomUUID();
  await sql`
    INSERT INTO messages (uuid, conversation_id, sender, content, text)
    VALUES (
      ${messageId},
      ${conversationId},
      'human',
      ${JSON.stringify({ content: [{ type: 'text', text: testMessage.text }] })},
      ${testMessage.text}
    )
  `;
  console.log(`Created test message directly in DB with ID: ${messageId}`);
  
  // Create attachments table if it doesn't exist
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS attachments (
        uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL REFERENCES messages(uuid),
        mime_type TEXT,
        storage TEXT DEFAULT 'local',
        path TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_attachments_storage ON attachments(storage)`;
    console.log('Attachments table created or verified');
  } catch (error) {
    console.error('Error creating attachments table:', error);
  }
  
  // Override the app's sql instance with our test-specific one
  app.context.sql = sql;
  
  // Find an available port
  testPort = await findAvailablePort(3001, 9000, 'attachment-test');
  baseUrl = `http://localhost:${testPort}`;
  console.log(`Using available port for attachment test: ${testPort}`);
  
  try {
    // Stop server from auto-starting on the default port
    if (app.server && app.server.listening) {
      app.server.close();
    }
    
    // Start server on the available port
    server = app.listen(testPort);
    console.log(`Attachment test server started on port ${testPort}`);
  } catch (error) {
    console.error(`Failed to start attachment test server on port ${testPort}:`, error);
    throw error;
  }
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Verify message exists in database
  const messageCheck = await sql`SELECT * FROM messages WHERE uuid = ${messageId}`;
  console.log(`Verification - Message exists in database: ${messageCheck.length > 0}`);
  if (messageCheck.length === 0) {
    console.error('TEST SETUP ERROR: Message was not found in the database after creation');
  }
});

// Cleanup after tests
afterAll(async () => {
  // Remove test file
  try {
    await fs.unlink(testFilePath);
  } catch (error) {
    console.error('Error removing test file:', error);
  }
  
  // Close server and release port
  console.log('Closing attachment test server and database connections');
  try {
    if (server) {
      server.close();
      console.log(`Attachment test server closed on port ${testPort}`);
    }
    
    // Release the port for other tests
    await releasePort(testPort);
    
    // Clean up database
    try {
      await sql`TRUNCATE TABLE conversations, messages, attachments CASCADE`;
    } catch (err) {
      console.error('Error cleaning database:', err);
    }
    
    // Wait a moment for connections to settle
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Close the database connection with a longer timeout
    if (sql) {
      await sql.end({ timeout: 30 });
      console.log('Test database connection closed');
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
});

// Test suite
describe('Attachment API Tests', () => {
  test('Upload attachment', async () => {
    // Verify message exists in database before test
    const messageCheck = await sql`SELECT * FROM messages WHERE uuid = ${messageId}`;
    console.log(`Pre-test check - Message exists: ${messageCheck.length > 0}, ID: ${messageId}`);
    
    // Create a FormData object with the test file
    const formData = new FormData();
    const file = new File([await fs.readFile(testFilePath)], 'test-file.txt', { 
      type: 'text/plain' 
    });
    formData.append('file', file);
    
    // Check if the attachments table exists
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'attachments'
      ) as exists
    `;
    console.log(`Attachments table exists: ${tableExists[0]?.exists}`);
    
    const response = await fetch(`${baseUrl}/api/attachments/message/${messageId}`, {
      method: 'POST',
      body: formData
    });
    
    // If response is not 201, log the error details
    if (response.status !== 201) {
      const errorText = await response.text();
      console.error(`Attachment upload failed with status ${response.status}:`, errorText);
    }
    
    expect(response.status).toBe(201);
    
    const data = await response.json();
    expect(data).toHaveProperty('uuid');
    expect(data.message_id).toBe(messageId);
    // The MIME type may include additional info like charset
    expect(data.mime_type.startsWith('text/plain')).toBe(true);
    
    // Save attachment ID for later tests
    attachmentId = data.uuid;
    console.log(`Created test attachment with ID: ${attachmentId}`);
  });
});
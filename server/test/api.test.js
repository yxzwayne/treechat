import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { app } from '../app.js';
import { findAvailablePort, releasePort } from './utils/portFinder.js';
import testDatabaseConfig from './utils/testDatabaseFactory.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test data
const testConversation = {
  summary: 'Test Conversation'
};

const testMessage = {
  sender: 'human',
  content: [{ type: 'text', text: 'Hello, world!' }],
  text: 'Hello, world!'
};

// Create a test file for upload testing
const testFilePath = path.join(__dirname, 'test-file.txt');
const testFileContent = 'This is a test file for upload testing';

// Store created resources for cleanup
let server;
let testPort;
let baseUrl;
let conversationId;
let messageId;
let attachmentId;
let sql; // Database connection specific to this test file

// Ensure attachment table exists
async function ensureAttachmentsTable() {
  const schemaPath = path.join(process.cwd(), 'scripts', 'attachments.sql');
  const attachmentsSchema = await fs.readFile(schemaPath, 'utf-8');
  
  try {
    await execAsync(`psql -U wayne -d treechat_test -c "
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
    "`);
    
    console.log("Attachments table created successfully");
  } catch (error) {
    console.error("Error creating attachments table:", error);
  }
}

// Setup server before tests
beforeAll(async () => {
  // Create a test file for attachments
  await fs.writeFile(testFilePath, testFileContent);
  
  // Run database reset script to ensure clean state
  try {
    await execAsync('bun run scripts/reset-db.js');
    console.log("Database reset successfully before tests");
  } catch (error) {
    console.error("Error resetting database:", error);
  }
  
  // Create a dedicated database connection for this test file
  sql = await testDatabaseConfig.createTestDbConnection('api-test');
  
  // Ensure the attachments table exists
  await ensureAttachmentsTable();
  
  // Override the app's sql instance with our test-specific one
  app.context.sql = sql;
  
  // Find an available port - use a consistent test ID for deterministic port allocation
  testPort = await findAvailablePort(3001, 9000, 'api-test');
  baseUrl = `http://localhost:${testPort}`;
  console.log(`Using available port for API test: ${testPort}`);
  
  try {
    // Start server on the available port
    server = app.listen(testPort);
    console.log(`API test server started on port ${testPort}`);
  } catch (error) {
    console.error(`Failed to start API test server on port ${testPort}:`, error);
    throw error;
  }
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 100));
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
  console.log('Closing API test server and database connections');
  try {
    if (server) {
      server.close();
      console.log(`API test server closed on port ${testPort}`);
    }
    
    // Release the port for other tests
    await releasePort(testPort);
    
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
describe('API Endpoints', () => {
  // Test conversation endpoints
  test('POST /api/conversations - Create conversation', async () => {
    const response = await fetch(`${baseUrl}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testConversation)
    });
    
    expect(response.status).toBe(201);
    
    const data = await response.json();
    expect(data).toHaveProperty('uuid');
    expect(data.summary).toBe(testConversation.summary);
    
    // Save conversation ID for later tests
    conversationId = data.uuid;
  });
  
  test('GET /api/conversations - Get all conversations', async () => {
    const response = await fetch(`${baseUrl}/api/conversations`);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });
  
  test('GET /api/conversations/:uuid - Get conversation by ID', async () => {
    const response = await fetch(`${baseUrl}/api/conversations/${conversationId}`);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.uuid).toBe(conversationId);
    expect(data.summary).toBe(testConversation.summary);
  });
  
  // Test message endpoints
  test('POST /api/messages - Create message', async () => {
    const response = await fetch(`${baseUrl}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...testMessage,
        conversation_id: conversationId
      })
    });
    
    expect(response.status).toBe(201);
    
    const data = await response.json();
    expect(data).toHaveProperty('uuid');
    expect(data.conversation_id).toBe(conversationId);
    expect(data.text).toBe(testMessage.text);
    
    // Save message ID for later tests
    messageId = data.uuid;
  });
  
  test('GET /api/messages/:uuid - Get message by ID', async () => {
    const response = await fetch(`${baseUrl}/api/messages/${messageId}`);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.uuid).toBe(messageId);
    expect(data.text).toBe(testMessage.text);
  });
  
  test('GET /api/messages/conversation/:conversationId - Get messages by conversation', async () => {
    const response = await fetch(`${baseUrl}/api/messages/conversation/${conversationId}`);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].uuid).toBe(messageId);
  });
  
  // Test attachment endpoints
  test('POST /api/attachments/message/:messageId - Upload attachment', async () => {
    // Create a FormData object with the test file
    const formData = new FormData();
    const file = new File([await fs.readFile(testFilePath)], 'test-file.txt', { 
      type: 'text/plain' 
    });
    formData.append('file', file);
    
    const response = await fetch(`${baseUrl}/api/attachments/message/${messageId}`, {
      method: 'POST',
      body: formData
    });
    
    expect(response.status).toBe(201);
    
    const data = await response.json();
    expect(data).toHaveProperty('uuid');
    expect(data.message_id).toBe(messageId);
    expect(data.mime_type).toBe('text/plain');
    
    // Save attachment ID for later tests
    attachmentId = data.uuid;
  });
  
  test('GET /api/attachments/message/:messageId - Get attachments by message', async () => {
    const response = await fetch(`${baseUrl}/api/attachments/message/${messageId}`);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].message_id).toBe(messageId);
  });
  
  test('GET /api/attachments/:uuid - Get attachment by ID', async () => {
    const response = await fetch(`${baseUrl}/api/attachments/${attachmentId}`);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.uuid).toBe(attachmentId);
    expect(data.message_id).toBe(messageId);
  });
  
  test('GET /api/attachments/:uuid/file - Get attachment file', async () => {
    const response = await fetch(`${baseUrl}/api/attachments/${attachmentId}/file`);
    
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    
    const text = await response.text();
    expect(text).toBe(testFileContent);
  });
  
  // Test metrics endpoint
  test('GET /api/metrics - Get metrics', async () => {
    const response = await fetch(`${baseUrl}/api/metrics`);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('system');
    expect(data).toHaveProperty('services');
    expect(data).toHaveProperty('timestamp');
  });
});

// Test parallel requests
describe('Parallel Requests', () => {
  test('Handle 10 parallel message requests', async () => {
    const requests = [];
    
    for (let i = 0; i < 10; i++) {
      requests.push(fetch(`${baseUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...testMessage,
          text: `Parallel message ${i}`,
          content: [{ type: 'text', text: `Parallel message ${i}` }],
          conversation_id: conversationId
        })
      }));
    }
    
    const responses = await Promise.all(requests);
    
    // Check all requests were successful
    responses.forEach(response => {
      expect(response.status).toBe(201);
    });
  });
});
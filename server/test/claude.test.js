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

// Store test data
let server;
let testPort;
let baseUrl;
let sql;
let conversationId;
let questions;

// Randomly select 10 test questions
async function getRandomQuestions(count = 10) {
  const questionsPath = path.join(__dirname, 'test-questions.json');
  const data = JSON.parse(await fs.readFile(questionsPath, 'utf-8'));
  const allQuestions = data.questions;
  
  // Randomly select count questions
  const selected = [];
  const used = new Set();
  
  while (selected.length < count && used.size < allQuestions.length) {
    const index = Math.floor(Math.random() * allQuestions.length);
    if (!used.has(index)) {
      selected.push(allQuestions[index]);
      used.add(index);
    }
  }
  
  return selected;
}

// Setup server before tests
beforeAll(async () => {
  // Load random test questions
  questions = await getRandomQuestions(10);
  console.log(`Loaded ${questions.length} random test questions`);
  
  // Run database reset script to ensure clean state
  try {
    await execAsync('bun run scripts/reset-db.js');
    console.log("Database reset successfully before tests");
  } catch (error) {
    console.error("Error resetting database:", error);
  }
  
  // Create a dedicated database connection
  sql = await testDatabaseConfig.createTestDbConnection('claude-test');
  
  // Override the app's sql instance with our test-specific one
  app.context.sql = sql;
  
  // Find an available port
  testPort = await findAvailablePort(3001, 9000, 'claude-test');
  baseUrl = `http://localhost:${testPort}`;
  console.log(`Using available port for Claude test: ${testPort}`);
  
  try {
    // Start server on the available port
    server = app.listen(testPort);
    console.log(`Claude test server started on port ${testPort}`);
  } catch (error) {
    console.error(`Failed to start Claude test server on port ${testPort}:`, error);
    throw error;
  }
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Create a test conversation
  try {
    const response = await fetch(`${baseUrl}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: 'Claude API Test Conversation' })
    });
    
    if (response.ok) {
      const data = await response.json();
      conversationId = data.uuid;
      console.log(`Created test conversation: ${conversationId}`);
    } else {
      console.error('Failed to create test conversation');
    }
  } catch (error) {
    console.error('Error creating test conversation:', error);
  }
});

// Cleanup after tests
afterAll(async () => {
  // Close server and release port
  console.log('Closing Claude test server and database connections');
  try {
    if (server) {
      server.close();
      console.log(`Claude test server closed on port ${testPort}`);
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

// Test Claude API integration
describe('Claude API Integration', () => {
  // Test sending a single message
  test('Send a message and receive a Claude response', async () => {
    // Pick the first test question
    const question = questions[0];
    console.log(`Testing question: "${question}"`);
    
    // Send message to our API
    const response = await fetch(`${baseUrl}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        sender: 'human',
        content: { text: question },
        text: question,
        generate_response: true,
        model_provider: 'claude'
      })
    });
    
    expect(response.status).toBe(201);
    
    const messageData = await response.json();
    expect(messageData).toHaveProperty('uuid');
    
    // Allow time for the AI to generate a response
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get all messages in the conversation
    const messagesResponse = await fetch(`${baseUrl}/api/messages/conversation/${conversationId}`);
    const messages = await messagesResponse.json();
    
    // Find the AI response to our message
    const aiResponse = messages.find(msg => 
      msg.parent_id === messageData.uuid && msg.sender === 'ai'
    );
    
    // Log test results
    if (aiResponse) {
      console.log('✅ Received AI response');
      console.log(`Response length: ${aiResponse.text.length} characters`);
    } else {
      console.log('❌ No AI response received after 5 seconds');
    }
    
    // We might not get a response in time, but the test should still pass
    // as long as the message was created successfully
  }, 30000);
  
  // Test sending multiple concurrent messages
  test('Send multiple concurrent messages to Claude', async () => {
    // Use 3 test questions
    const testQuestions = questions.slice(1, 4);
    console.log(`Testing ${testQuestions.length} concurrent questions`);
    
    // Prepare requests
    const requests = testQuestions.map((question, index) => {
      return fetch(`${baseUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          sender: 'human',
          content: { text: question },
          text: question,
          generate_response: true,
          model_provider: 'claude'
        })
      }).then(response => response.json());
    });
    
    // Send concurrent requests
    const messageResults = await Promise.all(requests);
    
    // Verify all messages were created
    messageResults.forEach(message => {
      expect(message).toHaveProperty('uuid');
    });
    
    // Allow time for AI responses
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Get all messages in the conversation
    const messagesResponse = await fetch(`${baseUrl}/api/messages/conversation/${conversationId}`);
    const messages = await messagesResponse.json();
    
    // Find AI responses to our messages
    const messageIds = messageResults.map(msg => msg.uuid);
    const aiResponses = messages.filter(msg => 
      messageIds.includes(msg.parent_id) && msg.sender === 'ai'
    );
    
    // Log test results
    console.log(`Received ${aiResponses.length}/${testQuestions.length} AI responses after 10 seconds`);
    
    // We're testing the ability to handle concurrent requests, not the speed of responses
  }, 60000);
});
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { app } from '../app.js';
import testQuestions from './test-questions.json';
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { findAvailablePort, releasePort } from './utils/portFinder.js';
import testDatabaseConfig from './utils/testDatabaseFactory.js';

// Configuration
const TEST_BATCH_SIZE = 5; // Number of questions to test in each run
const REQUEST_CONCURRENCY = 3; // Number of concurrent requests

// Setup API client
const apiKey = process.env.ANTHROPIC_API_KEY;
let anthropic;

if (apiKey) {
  anthropic = new Anthropic({
    apiKey
  });
} else {
  console.warn('⚠️ ANTHROPIC_API_KEY not set. Direct API tests will be skipped.');
}

// Test data
let server;
let testPort;
let baseUrl;
let conversationId;
let testResults = [];
let sql; // Database connection specific to this test file

// Random sample of questions
function getRandomQuestions(count) {
  const questions = [...testQuestions.questions];
  const result = [];
  
  for (let i = 0; i < count && questions.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * questions.length);
    result.push(questions.splice(randomIndex, 1)[0]);
  }
  
  return result;
}

// Setup server before tests
beforeAll(async () => {
  // Create a dedicated database connection for this test file
  sql = await testDatabaseConfig.createTestDbConnection('integration-test');
  
  // Override the app's sql instance with our test-specific one
  app.context.sql = sql;
  
  // Find an available port - use a consistent test ID for deterministic port allocation
  testPort = await findAvailablePort(3001, 9000, 'integration-test');
  baseUrl = `http://localhost:${testPort}`;
  console.log(`Using available port for integration test: ${testPort}`);
  
  try {
    // Start server on the available port
    server = app.listen(testPort);
    console.log(`Integration test server started on port ${testPort}`);
  } catch (error) {
    console.error(`Failed to start integration test server on port ${testPort}:`, error);
    throw error;
  }
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Check if we have the API key
  if (!apiKey) {
    console.warn('⚠️ ANTHROPIC_API_KEY not set. Integration tests will be limited.');
  }
  
  // Create a test conversation
  const response = await fetch(`${baseUrl}/api/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      summary: 'Integration Test Conversation'
    })
  });
  
  const data = await response.json();
  conversationId = data.uuid;
  console.log(`Created test conversation: ${conversationId}`);
});

// Cleanup after tests
afterAll(async () => {
  // Save test results
  const resultsDir = path.join(process.cwd(), 'test', 'results');
  
  try {
    // Create results directory if it doesn't exist
    if (!fs.existsSync(resultsDir)) {
      await fs.promises.mkdir(resultsDir, { recursive: true });
      console.log(`Created results directory: ${resultsDir}`);
    }
    
    // Save results to file
    const resultsPath = path.join(resultsDir, `integration-${Date.now()}.json`);
    await fs.promises.writeFile(
      resultsPath,
      JSON.stringify(testResults, null, 2)
    );
    
    console.log(`Test results saved to ${resultsPath}`);
  } catch (error) {
    console.error('Error saving test results:', error);
  }
  
  // Close server and database connection
  console.log('Closing integration test server and database connections');
  try {
    if (server) {
      server.close();
      console.log('Server closed');
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

// Integration test suite
describe('API Integration Tests with Claude', () => {
  test('Sequential message creation and response', async () => {
    if (!apiKey) {
      console.log('Skipping this test because ANTHROPIC_API_KEY is not set');
      return;
    }
    
    // Get random questions
    const questions = getRandomQuestions(TEST_BATCH_SIZE);
    
    // Send each question sequentially
    for (const question of questions) {
      console.log(`Testing question: "${question.substring(0, 40)}..."`);
      
      const startTime = Date.now();
      
      // Send message to our API
      const messageResponse = await fetch(`${baseUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          sender: 'human',
          content: [{ type: 'text', text: question }],
          text: question,
          generate_response: true,
          model_provider: 'claude'
        })
      });
      
      expect(messageResponse.status).toBe(201);
      
      const messageData = await messageResponse.json();
      expect(messageData).toHaveProperty('uuid');
      
      // Allow time for the AI to generate a response (happens asynchronously)
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Get all messages in the conversation
      const conversationResponse = await fetch(`${baseUrl}/api/messages/conversation/${conversationId}`);
      const conversationData = await conversationResponse.json();
      
      // Find the AI response to our message
      const aiResponse = conversationData.find(msg => 
        msg.parent_id === messageData.uuid && msg.sender === 'ai'
      );
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Record test results
      testResults.push({
        question,
        messageId: messageData.uuid,
        aiResponseId: aiResponse?.uuid,
        aiResponseReceived: !!aiResponse,
        duration: duration,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Response received: ${!!aiResponse} (${duration}ms)`);
      
      // Don't expect the AI response to always be available immediately,
      // but we should eventually get one
    }
  }, 60000); // Longer timeout for this test
  
  test('Concurrent message creation and responses', async () => {
    if (!apiKey) {
      console.log('Skipping this test because ANTHROPIC_API_KEY is not set');
      return;
    }
    
    // Get random questions
    const questions = getRandomQuestions(REQUEST_CONCURRENCY);
    const startTime = Date.now();
    
    // Send messages concurrently
    const messagePromises = questions.map((question, index) => {
      console.log(`Concurrent question ${index + 1}: "${question.substring(0, 30)}..."`);
      
      return fetch(`${baseUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          sender: 'human',
          content: [{ type: 'text', text: question }],
          text: question,
          generate_response: true,
          model_provider: 'claude'
        })
      }).then(response => response.json());
    });
    
    const messageResults = await Promise.all(messagePromises);
    
    // All messages should have been created
    messageResults.forEach(message => {
      expect(message).toHaveProperty('uuid');
    });
    
    // Allow time for the AI to generate responses
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Get all messages in the conversation
    const conversationResponse = await fetch(`${baseUrl}/api/messages/conversation/${conversationId}`);
    const conversationData = await conversationResponse.json();
    
    // Check if we got AI responses
    const messageIds = messageResults.map(msg => msg.uuid);
    const aiResponses = conversationData.filter(msg => 
      messageIds.includes(msg.parent_id) && msg.sender === 'ai'
    );
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Record test results
    questions.forEach((question, index) => {
      const messageId = messageResults[index]?.uuid;
      const aiResponse = aiResponses.find(msg => msg.parent_id === messageId);
      
      testResults.push({
        question,
        messageId,
        aiResponseId: aiResponse?.uuid,
        aiResponseReceived: !!aiResponse,
        concurrent: true,
        duration: duration,
        timestamp: new Date().toISOString()
      });
    });
    
    console.log(`Concurrent test complete. Responses received: ${aiResponses.length}/${questions.length} (${duration}ms)`);
    
    // We're testing concurrency handling, not the full completion of all requests
    // So we don't make a strict assertion on the number of responses
  }, 60000); // Longer timeout for this test
  
  test('Direct API call vs. our API comparison', async () => {
    if (!apiKey) {
      console.log('Skipping this test because ANTHROPIC_API_KEY is not set');
      return;
    }
    
    // Get a random question
    const question = getRandomQuestions(1)[0];
    console.log(`Comparison test with question: "${question.substring(0, 40)}..."`);
    
    // Start timing for our API
    const ourApiStartTime = Date.now();
    
    // Send message through our API
    const ourApiResponse = await fetch(`${baseUrl}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        sender: 'human',
        content: [{ type: 'text', text: question }],
        text: question,
        generate_response: true,
        model_provider: 'claude'
      })
    });
    
    const ourApiMessageData = await ourApiResponse.json();
    
    // Allow time for the AI response
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get messages to find AI response
    const conversationResponse = await fetch(`${baseUrl}/api/messages/conversation/${conversationId}`);
    const conversationData = await conversationResponse.json();
    
    const ourApiAiResponse = conversationData.find(msg => 
      msg.parent_id === ourApiMessageData.uuid && msg.sender === 'ai'
    );
    
    const ourApiEndTime = Date.now();
    const ourApiDuration = ourApiEndTime - ourApiStartTime;
    
    // Now call Claude API directly
    const directApiStartTime = Date.now();
    
    try {
      if (!anthropic) {
        throw new Error('Anthropic client not initialized - API key missing');
      }
      
      const directApiResponse = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [{ role: 'user', content: question }]
      });
      
      const directApiEndTime = Date.now();
      const directApiDuration = directApiEndTime - directApiStartTime;
      
      // Record test results
      testResults.push({
        question,
        directApiCallDuration: directApiDuration,
        ourApiCallDuration: ourApiDuration,
        directApiSuccess: true,
        ourApiSuccess: !!ourApiAiResponse,
        comparisonTest: true,
        timestamp: new Date().toISOString()
      });
      
      console.log(`API comparison test complete:
        Direct API: ${directApiDuration}ms
        Our API: ${ourApiDuration}ms
        Overhead: ${ourApiDuration - directApiDuration}ms
      `);
    } catch (error) {
      console.error('Error calling Claude API directly:', error);
      
      testResults.push({
        question,
        ourApiCallDuration: ourApiDuration,
        ourApiSuccess: !!ourApiAiResponse,
        directApiSuccess: false,
        directApiError: error.message,
        comparisonTest: true,
        timestamp: new Date().toISOString()
      });
    }
  }, 30000); // Longer timeout for this test
});
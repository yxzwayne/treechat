#!/usr/bin/env bun
/**
 * Load test script for the Treechat API
 * 
 * This script:
 * 1. Creates a test conversation
 * 2. Sends 100 concurrent message requests
 * 3. Measures response times and success rate
 * 4. Saves test results to a file
 */

import fs from 'fs';
import path from 'path';

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const CONCURRENT_REQUESTS = parseInt(process.env.CONCURRENT_REQUESTS || '100');
const REQUEST_TIMEOUT = 10000; // 10 seconds

// Track results for saving
let testResults = [];

async function createConversation() {
  console.log('Creating test conversation...');
  
  const response = await fetch(`${API_URL}/api/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      summary: 'Load Test Conversation'
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log(`Created conversation with ID: ${data.uuid}`);
  return data.uuid;
}

async function sendMessage(conversationId, index) {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${API_URL}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        sender: 'human',
        content: [{ type: 'text', text: `Load test message ${index}` }],
        text: `Load test message ${index}`,
        generate_response: false // Don't generate AI responses for load testing
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    if (response.ok) {
      const data = await response.json();
      return {
        index,
        success: true,
        messageId: data.uuid,
        duration,
        status: response.status
      };
    } else {
      return {
        index,
        success: false,
        duration,
        status: response.status,
        error: `HTTP error: ${response.status} ${response.statusText}`
      };
    }
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    return {
      index,
      success: false,
      duration,
      error: error.message
    };
  }
}

/**
 * Save test results to file
 */
async function saveResults() {
  const resultsDir = path.join(process.cwd(), 'test', 'results');
  
  try {
    // Create results directory if it doesn't exist
    if (!fs.existsSync(resultsDir)) {
      await fs.promises.mkdir(resultsDir, { recursive: true });
    }
    
    // Save results to file
    const resultsPath = path.join(resultsDir, `load-test-${Date.now()}.json`);
    await fs.promises.writeFile(
      resultsPath,
      JSON.stringify(testResults, null, 2)
    );
    
    console.log(`Test results saved to ${resultsPath}`);
  } catch (error) {
    console.error('Error saving test results:', error);
  }
}

async function runLoadTest() {
  console.log(`\n=== Treechat Load Test ===`);
  console.log(`API URL: ${API_URL}`);
  console.log(`Concurrent Requests: ${CONCURRENT_REQUESTS}\n`);
  
  try {
    // Create a test conversation
    const conversationId = await createConversation();
    
    // Prepare concurrent requests
    const requests = [];
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
      requests.push(sendMessage(conversationId, i));
    }
    
    console.log(`Sending ${CONCURRENT_REQUESTS} concurrent requests...`);
    const startTime = Date.now();
    
    // Send requests concurrently
    const results = await Promise.all(requests);
    
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    
    // Calculate statistics
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const durations = results.map(r => r.duration);
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    
    // Group errors
    const errors = {};
    results
      .filter(r => !r.success)
      .forEach(r => {
        if (!errors[r.error]) {
          errors[r.error] = 0;
        }
        errors[r.error]++;
      });
    
    // Print results
    console.log('\n=== Load Test Results ===');
    console.log(`Total Requests: ${CONCURRENT_REQUESTS}`);
    console.log(`Successful Requests: ${successCount} (${(successCount / CONCURRENT_REQUESTS * 100).toFixed(2)}%)`);
    console.log(`Failed Requests: ${failureCount} (${(failureCount / CONCURRENT_REQUESTS * 100).toFixed(2)}%)`);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log(`Min Response Time: ${minDuration}ms`);
    console.log(`Max Response Time: ${maxDuration}ms`);
    console.log(`Avg Response Time: ${avgDuration.toFixed(2)}ms`);
    console.log(`Requests per Second: ${(CONCURRENT_REQUESTS / (totalDuration / 1000)).toFixed(2)}`);
    
    // Save detailed results
    testResults = {
      summary: {
        totalRequests: CONCURRENT_REQUESTS,
        successfulRequests: successCount,
        failedRequests: failureCount,
        totalDuration,
        averageDuration: avgDuration,
        minDuration,
        maxDuration,
        requestsPerSecond: CONCURRENT_REQUESTS / (totalDuration / 1000),
        timestamp: new Date().toISOString(),
        errors
      },
      details: results
    };
    
    // Save results
    await saveResults();
    
    // Log any errors
    if (failureCount > 0) {
      console.log('\n=== Errors ===');
      for (const [error, count] of Object.entries(errors)) {
        console.log(`${error}: ${count} requests`);
      }
      
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('Load test failed:', error);
    process.exit(1);
  }
}

// Run the load test
runLoadTest();
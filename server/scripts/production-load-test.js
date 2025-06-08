#!/usr/bin/env bun
/**
 * Production-grade load test script for the Treechat API
 * 
 * This script:
 * 1. Creates test conversations
 * 2. Sends multiple waves of concurrent message requests
 * 3. Simulates real-world usage patterns
 * 4. Measures response times, throughput, and error rates
 * 5. Logs detailed metrics for analysis
 */

import fs from 'fs';
import path from 'path';
import testQuestions from '../test/test-questions.json';

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000'; // Default URL, but can be overridden with env var
const TOTAL_REQUESTS = 100; // Total number of requests to make
const CONCURRENT_REQUESTS = 10; // Number of concurrent requests per wave
const WAVE_DELAY_MS = 2000; // Delay between waves in milliseconds
const RESPONSE_WAIT_TIME_MS = 5000; // Time to wait for AI responses
const LOGS_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOGS_DIR, `load-test-${Date.now()}.json`);

// Ensure logs directory exists
try {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    console.log(`Created logs directory: ${LOGS_DIR}`);
  }
} catch (error) {
  console.error('Error creating logs directory:', error);
}

// Random sampling of questions
function getRandomQuestions(count) {
  const questions = [...testQuestions.questions];
  const result = [];
  
  for (let i = 0; i < count && questions.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * questions.length);
    result.push(questions.splice(randomIndex, 1)[0]);
    
    // If we run out of questions, reuse them
    if (questions.length === 0) {
      questions.push(...testQuestions.questions);
    }
  }
  
  return result;
}

// Create a new conversation
async function createConversation(summary) {
  try {
    const response = await fetch(`${API_URL}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ summary })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create conversation: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating conversation:', error);
    throw error;
  }
}

// Send a message
async function sendMessage(conversationId, text, generateAiResponse = false) {
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
        content: [{ type: 'text', text }],
        text,
        generate_response: generateAiResponse,
        model_provider: 'claude'
      })
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        duration,
        error: response.statusText,
        text: text.substring(0, 50) + (text.length > 50 ? '...' : '')
      };
    }
    
    const data = await response.json();
    
    return {
      success: true,
      messageId: data.uuid,
      status: response.status,
      duration,
      text: text.substring(0, 50) + (text.length > 50 ? '...' : '')
    };
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    return {
      success: false,
      duration,
      error: error.message,
      text: text.substring(0, 50) + (text.length > 50 ? '...' : '')
    };
  }
}

// Check for AI responses
async function checkAiResponses(conversationId, messageIds) {
  try {
    const response = await fetch(`${API_URL}/api/messages/conversation/${conversationId}`);
    
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to get messages: ${response.status} ${response.statusText}`
      };
    }
    
    const messages = await response.json();
    
    // Find AI responses to our messages
    const aiResponses = messages.filter(msg => 
      messageIds.includes(msg.parent_id) && msg.sender === 'ai'
    );
    
    return {
      success: true,
      totalMessages: messages.length,
      aiResponsesReceived: aiResponses.length,
      aiResponses: aiResponses.map(msg => ({
        id: msg.uuid,
        parentId: msg.parent_id,
        hasText: !!msg.text,
        textLength: msg.text?.length || 0
      }))
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Run a single wave of concurrent requests
async function runWave(waveIndex, conversationIds, questions) {
  console.log(`\nStarting wave ${waveIndex + 1} with ${questions.length} concurrent requests...`);
  
  const waveStartTime = Date.now();
  const promises = [];
  const results = [];
  
  // Prepare requests
  for (let i = 0; i < questions.length; i++) {
    // Distribute messages across conversations
    const conversationIndex = i % conversationIds.length;
    const conversationId = conversationIds[conversationIndex];
    const question = questions[i];
    
    // Send message
    promises.push(
      sendMessage(conversationId, question, true)
        .then(result => {
          console.log(`  [${i+1}/${questions.length}] ${result.success ? '✓' : '✗'} ${result.duration}ms: ${result.text}`);
          results.push({
            ...result,
            waveIndex,
            conversationId,
            requestIndex: i
          });
          return result;
        })
    );
  }
  
  // Wait for all requests to complete
  await Promise.all(promises);
  
  const waveEndTime = Date.now();
  const waveDuration = waveEndTime - waveStartTime;
  
  // Count successes and failures
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  
  console.log(`Wave ${waveIndex + 1} complete:`);
  console.log(`  Duration: ${waveDuration}ms`);
  console.log(`  Success: ${successCount}/${results.length} (${(successCount / results.length * 100).toFixed(2)}%)`);
  console.log(`  Failures: ${failureCount}`);
  
  return {
    waveIndex,
    results,
    successCount,
    failureCount,
    duration: waveDuration,
    timestamp: new Date().toISOString()
  };
}

// Main load test function
async function runLoadTest() {
  console.log(`Starting production load test with ${TOTAL_REQUESTS} total requests`);
  console.log(`API URL: ${API_URL}`);
  console.log(`Concurrent requests per wave: ${CONCURRENT_REQUESTS}`);
  
  const startTime = Date.now();
  const testResults = {
    config: {
      totalRequests: TOTAL_REQUESTS,
      concurrentRequestsPerWave: CONCURRENT_REQUESTS,
      waveDelayMs: WAVE_DELAY_MS,
      apiUrl: API_URL
    },
    waves: [],
    conversations: [],
    summary: {},
    startTime: new Date().toISOString()
  };
  
  try {
    // Create test conversations (1 per 10 concurrent requests)
    const conversationCount = Math.max(1, Math.ceil(CONCURRENT_REQUESTS / 10));
    console.log(`Creating ${conversationCount} test conversations...`);
    
    const conversationPromises = [];
    for (let i = 0; i < conversationCount; i++) {
      conversationPromises.push(
        createConversation(`Load Test Conversation ${i+1}`)
      );
    }
    
    const conversations = await Promise.all(conversationPromises);
    const conversationIds = conversations.map(c => c.uuid);
    
    testResults.conversations = conversations;
    
    console.log(`Created ${conversationIds.length} conversations`);
    
    // Calculate how many waves we need
    const totalWaves = Math.ceil(TOTAL_REQUESTS / CONCURRENT_REQUESTS);
    
    // Run waves
    for (let waveIndex = 0; waveIndex < totalWaves; waveIndex++) {
      // Calculate how many requests in this wave
      const requestsInWave = Math.min(
        CONCURRENT_REQUESTS,
        TOTAL_REQUESTS - (waveIndex * CONCURRENT_REQUESTS)
      );
      
      // Get random questions
      const questions = getRandomQuestions(requestsInWave);
      
      // Run the wave
      const waveResults = await runWave(waveIndex, conversationIds, questions);
      testResults.waves.push(waveResults);
      
      // Get successful message IDs from this wave
      const successfulMessageIds = waveResults.results
        .filter(r => r.success)
        .map(r => r.messageId);
      
      // Wait for AI responses (for each conversation separately)
      if (successfulMessageIds.length > 0) {
        console.log(`Waiting ${RESPONSE_WAIT_TIME_MS / 1000}s for AI responses...`);
        await new Promise(resolve => setTimeout(resolve, RESPONSE_WAIT_TIME_MS));
        
        // Check for AI responses for each conversation
        for (const conversationId of conversationIds) {
          const aiResponseResults = await checkAiResponses(conversationId, successfulMessageIds);
          console.log(`  Conversation ${conversationId.substring(0, 8)}...: ${aiResponseResults.aiResponsesReceived} AI responses`);
          
          waveResults.aiResponses = aiResponseResults;
        }
      }
      
      // Wait before next wave
      if (waveIndex < totalWaves - 1) {
        console.log(`Waiting ${WAVE_DELAY_MS / 1000}s before next wave...`);
        await new Promise(resolve => setTimeout(resolve, WAVE_DELAY_MS));
      }
    }
    
    // Calculate final stats
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    
    // Count total successes and failures
    const totalResults = testResults.waves.flatMap(w => w.results);
    const totalSuccessCount = totalResults.filter(r => r.success).length;
    const totalFailureCount = totalResults.filter(r => !r.success).length;
    
    // Calculate response time statistics
    const responseTimes = totalResults.filter(r => r.success).map(r => r.duration);
    const minResponseTime = Math.min(...responseTimes);
    const maxResponseTime = Math.max(...responseTimes);
    const avgResponseTime = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
    
    testResults.summary = {
      totalDuration,
      totalRequests: totalResults.length,
      successCount: totalSuccessCount,
      failureCount: totalFailureCount,
      successRate: (totalSuccessCount / totalResults.length * 100).toFixed(2) + '%',
      requestsPerSecond: (totalResults.length / (totalDuration / 1000)).toFixed(2),
      minResponseTime,
      maxResponseTime,
      avgResponseTime: avgResponseTime.toFixed(2),
      endTime: new Date().toISOString()
    };
    
    // Print summary
    console.log('\nLoad Test Results:');
    console.log('------------------');
    console.log(`Total Duration: ${totalDuration}ms (${(totalDuration / 1000 / 60).toFixed(2)} minutes)`);
    console.log(`Total Requests: ${totalResults.length}`);
    console.log(`Successful Requests: ${totalSuccessCount} (${testResults.summary.successRate})`);
    console.log(`Failed Requests: ${totalFailureCount}`);
    console.log(`Requests per Second: ${testResults.summary.requestsPerSecond}`);
    console.log(`Min Response Time: ${minResponseTime}ms`);
    console.log(`Max Response Time: ${maxResponseTime}ms`);
    console.log(`Avg Response Time: ${avgResponseTime.toFixed(2)}ms`);
    
    // Save results to file
    const logsDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.writeFileSync(LOG_FILE, JSON.stringify(testResults, null, 2));
    console.log(`\nFull test results saved to ${LOG_FILE}`);
    
  } catch (error) {
    console.error('Load test failed:', error);
    
    // Save partial results
    testResults.error = error.message;
    testResults.endTime = new Date().toISOString();
    
    const logsDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.writeFileSync(LOG_FILE, JSON.stringify(testResults, null, 2));
    console.log(`\nPartial test results saved to ${LOG_FILE}`);
  }
}

// Run the load test
runLoadTest().catch(console.error);
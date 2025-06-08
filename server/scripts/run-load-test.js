#!/usr/bin/env bun
/**
 * Standalone load test runner that handles server startup and shutdown
 */

import { spawn, execSync } from 'child_process';

// Configuration
const CONCURRENT_REQUESTS = process.env.CONCURRENT_REQUESTS || 100;
const SERVER_PORT = process.env.PORT || 3000;

console.log(`\n=== Treechat Load Test Runner ===`);
console.log(`Concurrent requests: ${CONCURRENT_REQUESTS}`);
console.log(`Server port: ${SERVER_PORT}\n`);

let serverProcess = null;

async function startServer() {
  console.log('Starting server...');
  
  // Use spawn for better process control
  serverProcess = spawn('bun', ['run', 'dev'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  let serverOutput = '';
  
  // Capture server output
  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    serverOutput += output;
    console.log(`[Server]: ${output.trim()}`);
  });
  
  serverProcess.stderr.on('data', (data) => {
    const output = data.toString();
    serverOutput += output;
    console.error(`[Server Error]: ${output.trim()}`);
  });
  
  // Wait for server to start
  console.log('Waiting for server to start...');
  
  // More reliable way to wait for server to be ready
  const startTime = Date.now();
  const timeout = 20000; // 20 seconds timeout
  
  while (true) {
    try {
      // Try to connect to the server
      execSync(`curl -s http://localhost:${SERVER_PORT}/api/metrics`, { 
        timeout: 1000,
        stdio: 'ignore'
      });
      console.log('Server is running and ready for load test');
      return true;
    } catch (error) {
      if (Date.now() - startTime > timeout) {
        console.error(`Server failed to start within ${timeout/1000} seconds.`);
        console.error('Server output:', serverOutput);
        return false;
      }
      
      // Wait and try again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

function runLoadTest() {
  console.log(`Running load test with ${CONCURRENT_REQUESTS} concurrent requests...`);
  
  try {
    execSync(`CONCURRENT_REQUESTS=${CONCURRENT_REQUESTS} bun run scripts/load-test.js`, {
      stdio: 'inherit'
    });
    return true;
  } catch (error) {
    console.error('Load test failed.');
    return false;
  }
}

function stopServer() {
  if (serverProcess) {
    console.log('Shutting down test server...');
    
    // Kill the server process and its children
    try {
      // On POSIX systems, negative pid kills the process group
      process.kill(-serverProcess.pid, 'SIGTERM');
    } catch (e) {
      // If that fails, try to kill just the process
      try {
        serverProcess.kill('SIGTERM');
      } catch (e2) {
        console.warn('Could not kill server process:', e2.message);
      }
    }
    
    // Also try to kill any lingering server process on the port
    try {
      execSync(`lsof -ti:${SERVER_PORT} | xargs kill -9`, { stdio: 'ignore' });
    } catch (e) {
      // Ignore errors
    }
  }
}

async function main() {
  try {
    // Start server
    const serverStarted = await startServer();
    if (!serverStarted) {
      console.error('Failed to start server, aborting load test.');
      process.exit(1);
    }
    
    // Run load test
    const loadTestSuccess = runLoadTest();
    
    // Exit with appropriate code
    process.exit(loadTestSuccess ? 0 : 1);
  } catch (error) {
    console.error('Error running load test:', error);
    process.exit(1);
  } finally {
    stopServer();
  }
}

// Run the main function
main();
#!/usr/bin/env bun
/**
 * Stage 1 Verification Script for Treechat
 * 
 * This script:
 * 1. Resets the database
 * 2. Runs all tests
 * 3. Runs a load test with 100+ concurrent requests
 * 4. Reports results
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Configuration
const MIN_CONCURRENT_REQUESTS = 100;
const TEST_TIMEOUT = 120000; // 2 minutes
const RESET_DATABASE = true;

// Print banner
console.log('\n=== Treechat Stage 1 Verification ===\n');
console.log('This script will verify that the Stage 1 requirements have been met:');
console.log('1. Backend server is functioning correctly');
console.log('2. Database connections are stable');
console.log('3. API endpoints work as expected');
console.log('4. System can handle 100+ concurrent requests\n');

/**
 * Run a command and return the output
 * 
 * @param {string} command - Command to run
 * @param {boolean} silent - Whether to print the output
 * @returns {string} - Command output
 */
function runCommand(command, silent = false) {
  try {
    if (!silent) {
      console.log(`> ${command}`);
    }
    
    const output = execSync(command, {
      stdio: silent ? 'pipe' : 'inherit',
      timeout: TEST_TIMEOUT
    });
    
    return output ? output.toString() : '';
  } catch (error) {
    if (!silent) {
      console.error(`Command failed: ${command}`);
      if (error.stdout) console.error(error.stdout.toString());
      if (error.stderr) console.error(error.stderr.toString());
    }
    throw error;
  }
}

/**
 * Reset the database
 */
function resetDatabase() {
  console.log('\n=== Resetting Database ===');
  runCommand('bun run scripts/reset-db.js');
  console.log('Database reset complete.');
}

/**
 * Run all tests
 * 
 * @returns {boolean} - Whether all tests passed
 */
function runTests() {
  console.log('\n=== Running Tests ===');
  try {
    runCommand('bun run scripts/run-tests.js');
    console.log('All tests passed.');
    return true;
  } catch (error) {
    console.error('Some tests failed.');
    return false;
  }
}

/**
 * Run load test
 * 
 * @returns {boolean} - Whether the load test passed
 */
function runLoadTest() {
  console.log('\n=== Running Load Test ===');
  console.log(`Testing with ${MIN_CONCURRENT_REQUESTS}+ concurrent requests...`);
  
  let serverProcess = null;
  
  try {
    // Start the server in the background properly
    console.log('Starting server...');
    
    // Use spawn instead of execSync for better process control
    serverProcess = require('child_process').spawn('bun', ['run', 'dev'], {
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
    
    function checkServerRunning() {
      try {
        // Try to connect to the server
        execSync('curl -s http://localhost:3000/api/metrics', { 
          timeout: 1000,
          stdio: 'ignore'
        });
        return true;
      } catch (error) {
        if (Date.now() - startTime > timeout) {
          console.error(`Server failed to start within ${timeout/1000} seconds.`);
          console.error('Server output:', serverOutput);
          return false;
        }
        
        // Wait and try again
        runCommand('sleep 1', true);
        return checkServerRunning();
      }
    }
    
    const serverReady = checkServerRunning();
    
    if (!serverReady) {
      console.error('Failed to start server for load testing');
      if (serverProcess) {
        serverProcess.kill();
      }
      return false;
    }
    
    console.log('Server is running and ready for load test');
    
    // Run the load test
    try {
      runCommand(`CONCURRENT_REQUESTS=${MIN_CONCURRENT_REQUESTS} bun run scripts/load-test.js`);
      console.log('Load test passed!');
      return true;
    } catch (error) {
      console.error('Load test failed.');
      return false;
    } finally {
      console.log('Shutting down test server...');
      // Kill the server process and its children
      if (serverProcess) {
        // On POSIX systems, negative pid kills the process group
        try {
          process.kill(-serverProcess.pid, 'SIGTERM');
        } catch (e) {
          // If that fails, try to kill just the process
          try {
            serverProcess.kill('SIGTERM');
          } catch (e2) {
            console.warn('Could not kill server process:', e2.message);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error running load test:', error);
    
    if (serverProcess) {
      try {
        serverProcess.kill('SIGTERM');
      } catch (e) {
        console.warn('Could not kill server process:', e.message);
      }
    }
    
    return false;
  }
}

/**
 * Main function
 */
function main() {
  try {
    let success = true;
    
    // Reset database if needed
    if (RESET_DATABASE) {
      resetDatabase();
    }
    
    // Run tests
    const testsPass = runTests();
    if (!testsPass) {
      success = false;
      console.error('\n❌ Tests failed - Stage 1 verification incomplete.');
    }
    
    // Run load test
    const loadTestPass = runLoadTest();
    if (!loadTestPass) {
      success = false;
      console.error('\n❌ Load test failed - Stage 1 verification incomplete.');
    }
    
    // Print final result
    if (success) {
      console.log('\n✅ Stage 1 verification PASSED! ✅');
      console.log('The backend is ready for Stage 2.');
    } else {
      console.log('\n❌ Stage 1 verification FAILED ❌');
      console.log('Please fix the issues and try again.');
    }
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Error during verification:', error);
    process.exit(1);
  }
}

// Run the main function
main();
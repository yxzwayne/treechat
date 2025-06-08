/**
 * Test runner script for Treechat server
 * 
 * This script:
 * 1. Resets the test database
 * 2. Runs all tests in sequence
 * 3. Reports results
 */

import { execSync } from 'child_process';
import testDatabaseFactory from '../test/utils/testDatabaseFactory.js';
import path from 'path';
import fs from 'fs';

// Configuration
const TEST_TIMEOUT = 60000; // 60 seconds per test file
const RESET_DATABASE = true; // Whether to reset the database before tests

// Print banner
console.log('\n=== Treechat Server Test Runner ===\n');

// Error handler
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

/**
 * Reset the test database
 */
async function resetDatabase() {
  console.log('Resetting test database...');
  try {
    await testDatabaseFactory.resetTestDatabase();
    console.log('Test database reset complete.');
  } catch (error) {
    console.error('Failed to reset test database:', error);
    process.exit(1);
  }
}

/**
 * Run a single test file
 * 
 * @param {string} testFile - Path to test file
 * @returns {Promise<boolean>} - Whether the test passed
 */
async function runTest(testFile) {
  console.log(`\nRunning test: ${path.basename(testFile)}`);
  
  try {
    // Run the test with Bun
    execSync(`bun test ${testFile}`, {
      timeout: TEST_TIMEOUT,
      stdio: 'inherit'
    });
    
    console.log(`✅ Test passed: ${path.basename(testFile)}`);
    return true;
  } catch (error) {
    console.error(`❌ Test failed: ${path.basename(testFile)}`);
    console.error(error.message);
    return false;
  }
}

/**
 * Run all tests in the test directory
 */
async function runAllTests() {
  const testDir = path.join(process.cwd(), 'test');
  const testFiles = fs.readdirSync(testDir)
    .filter(file => file.endsWith('.test.js'))
    .map(file => path.join(testDir, file));
  
  console.log(`Found ${testFiles.length} test files.`);
  
  let passed = 0;
  let failed = 0;
  
  // Run tests in sequence
  for (const testFile of testFiles) {
    const success = await runTest(testFile);
    if (success) {
      passed++;
    } else {
      failed++;
    }
    
    // Wait a moment between tests to allow resources to be cleaned up
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Print summary
  console.log('\n=== Test Results ===');
  console.log(`Total tests: ${testFiles.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  // Close all database connections
  await testDatabaseFactory.closeAllConnections();
  
  return failed === 0;
}

/**
 * Main function
 */
async function main() {
  try {
    // Reset database if needed
    if (RESET_DATABASE) {
      await resetDatabase();
    }
    
    // Run all tests
    const success = await runAllTests();
    
    // Exit with appropriate code
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Error running tests:', error);
    process.exit(1);
  }
}

// Run the main function
main();
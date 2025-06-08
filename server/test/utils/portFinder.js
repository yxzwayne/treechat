import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Track reserved ports with a lock file to prevent race conditions between tests
const LOCK_DIR = path.join(os.tmpdir(), 'treechat-ports');
const reservedPorts = new Set();

// Ensure lock directory exists
try {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
} catch (err) {
  console.warn('Could not create port lock directory:', err.message);
}

/**
 * Finds an available port starting from the given port
 * and incrementing until an available one is found.
 * Reserves the port so other tests won't use it.
 * 
 * @param {number} startPort - Port to start checking from
 * @param {number} endPort - Maximum port to check (optional)
 * @param {string} testId - Unique identifier for the test (defaults to random)
 * @returns {Promise<number>} - First available port
 */
export async function findAvailablePort(startPort = 3000, endPort = 9000, testId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`) {
  const MAX_PORTS_TO_CHECK = endPort - startPort;
  
  // Use different port ranges for different test files to reduce conflicts
  // Hash the testId to get a deterministic offset
  const testHash = testId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const rangeOffset = testHash % 1000; // Spread tests across a 1000-port range
  const adjustedStartPort = startPort + rangeOffset;
  
  for (let portOffset = 0; portOffset < MAX_PORTS_TO_CHECK; portOffset++) {
    const port = adjustedStartPort + portOffset;
    
    // Skip already reserved ports
    if (reservedPorts.has(port)) {
      continue;
    }
    
    // Check if port is available
    if (await isPortAvailable(port)) {
      // Reserve the port
      if (await reservePort(port, testId)) {
        console.log(`Port ${port} reserved for ${testId}`);
        reservedPorts.add(port);
        return port;
      }
    }
  }
  
  throw new Error(`No available ports found between ${adjustedStartPort} and ${endPort}`);
}

/**
 * Checks if a specific port is available
 * 
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} - True if port is available
 */
async function isPortAvailable(port) {
  // First check if there's a lock file for this port
  const lockFile = path.join(LOCK_DIR, `port-${port}.lock`);
  if (fs.existsSync(lockFile)) {
    try {
      // Check if the lock is stale (older than 10 minutes)
      const stats = fs.statSync(lockFile);
      const lockAge = Date.now() - stats.mtimeMs;
      if (lockAge < 10 * 60 * 1000) { // 10 minutes
        return false; // Lock is fresh, port is unavailable
      }
      // Lock is stale, remove it and continue checking
      fs.unlinkSync(lockFile);
    } catch (err) {
      console.warn(`Error checking port lock ${port}:`, err.message);
      return false;
    }
  }

  return new Promise(resolve => {
    const server = net.createServer();
    
    server.once('error', err => {
      server.close();
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // If there's another error, consider the port unavailable
        console.warn(`Error checking port ${port}:`, err.message);
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port);
  });
}

/**
 * Reserve a port for a specific test
 * 
 * @param {number} port - Port to reserve
 * @param {string} testId - Identifier of the test reserving the port
 * @returns {Promise<boolean>} - True if reservation was successful
 */
async function reservePort(port, testId) {
  const lockFile = path.join(LOCK_DIR, `port-${port}.lock`);
  
  try {
    // Create lock file with test ID
    fs.writeFileSync(lockFile, testId);
    return true;
  } catch (err) {
    console.warn(`Error reserving port ${port}:`, err.message);
    return false;
  }
}

/**
 * Release a reserved port
 * 
 * @param {number} port - Port to release
 * @returns {Promise<void>}
 */
export async function releasePort(port) {
  const lockFile = path.join(LOCK_DIR, `port-${port}.lock`);
  
  try {
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
      console.log(`Port ${port} released`);
    }
    reservedPorts.delete(port);
  } catch (err) {
    console.warn(`Error releasing port ${port}:`, err.message);
  }
}
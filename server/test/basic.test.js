import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { app } from '../app.js';
import { findAvailablePort } from './utils/portFinder.js';

// Basic health check tests that don't require database connections
describe('Basic API Health Checks', () => {
  let server;
  let testPort;
  let baseUrl;

  beforeAll(async () => {
    try {
      // Find an available port - start at 3001 to avoid conflicts with the dev server
      testPort = await findAvailablePort(3001);
      baseUrl = `http://localhost:${testPort}`;
      console.log(`Using available port for basic test: ${testPort}`);
      
      // Start server on the available port
      server = app.listen(testPort);
      console.log(`Basic test server started on port ${testPort}`);
    } catch (error) {
      console.error(`Failed to start basic test server:`, error);
      throw error;
    }
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  afterAll(() => {
    if (server) {
      server.close();
      console.log(`Basic test server closed on port ${testPort}`);
    }
  });

  test('Health endpoint should return 200', async () => {
    const response = await fetch(`${baseUrl}/health`);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('ok');
  });
  
  test('Root endpoint should return a string', async () => {
    const response = await fetch(`${baseUrl}/`);
    
    expect(response.status).toBe(200);
    
    const text = await response.text();
    expect(text).toBe('Hello Treechat');
  });
});
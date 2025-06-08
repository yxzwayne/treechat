import postgres from 'postgres';

// Create a SQL instance for test environment
const sql = postgres({
  host: 'localhost',
  user: 'wayne',
  database: 'treechat_test', // Use test database
  port: 5432,
  max: 5, // Reduced connection pool for tests
  idle_timeout: 10, // Close idle connections quickly
  connect_timeout: 5, // Shorter connect timeout
  onnotice: () => {}, // Ignore notices
  onconnect: async () => {
    console.log('Connected to test database: treechat_test');
  },
  onretry: (err, initial) => {
    console.warn(`Test database connection error (${initial ? 'initial' : 'retry'}):`, err.message);
    return true; // Always retry
  },
  onclose: () => {
    console.log('Test database connection closed');
  }
});

export default sql;
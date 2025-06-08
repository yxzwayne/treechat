import postgres from 'postgres';

// Create a SQL instance
const sql = postgres({
  host: 'localhost',
  user: 'wayne',
  database: 'treechat',
  port: 5432,
  onnotice: () => {} // Ignore notices
});

export default sql;
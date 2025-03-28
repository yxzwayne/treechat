const postgres = require('postgres');

const sql = postgres({
  host: 'localhost',
  user: 'wayne',  // Changed from username to user
  database: 'treechat',
  port: 5432,
});

module.exports = sql;
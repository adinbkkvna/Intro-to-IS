// PostgreSQL connection pool. Always use parameters ($1, $2) in queries: never build SQL from user text.
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({ connectionString: config.databaseUrl });

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};

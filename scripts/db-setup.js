const fs = require('fs');
const path = require('path');
const db = require('../src/db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('Database schema created.');
  await db.pool.end();
})().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});

// Test helpers. Owner: Adina (Student 4, tester).
// Tests run against the database in DATABASE_URL. Use a separate test database if you can.
process.env.BCRYPT_COST = process.env.BCRYPT_COST || '4';        // fast hashing in tests
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const app = require('../src/app');
const db = require('../src/db');

let server;
let base;

async function start() {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
}

async function stop() {
  await new Promise((resolve) => server.close(resolve));
  await db.pool.end();
}

// A tiny HTTP client that keeps the login cookie, like a browser does.
function client() {
  let cookie = '';
  async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, setCookie: set };
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b === undefined ? {} : b),
    patch: (p, b) => call('PATCH', p, b),
    del: (p) => call('DELETE', p),
  };
}

// A request with a hand-made cookie (to test forged tokens)
async function raw(path, cookie) {
  const res = await fetch(base + path, { headers: { Cookie: cookie } });
  return { status: res.status };
}

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

const port = () => server.address().port;
module.exports = { start, stop, client, raw, db, unique, port };

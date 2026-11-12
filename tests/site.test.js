// Automated tests for the website. Owner: Adina (Student 4, tester).
// Run:  npm test      (the database must be set up and seeded)
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, client, raw, db, unique } = require('./helpers');

const PASSWORD = 'Test12345';
const run = unique();
const email = (name) => `test-${name}-${run}@example.com`;
let futureSession;      // a normal upcoming session
let tinySession;        // a session with capacity 1, created for the "full" test

test.before(async () => {
  await start();
  const s = await db.query(
    `SELECT session_id FROM sessions WHERE start_time > NOW() + INTERVAL '2 hours' ORDER BY start_time LIMIT 1`);
  futureSession = s.rows[0].session_id;
  // capacity-1 session far in the future, so it cannot clash with the seeded sessions
  const t = await db.query(
    `INSERT INTO sessions (class_id, trainer_id, room_id, start_time, end_time, capacity)
     VALUES (1, 1, 1, NOW() + INTERVAL '200 days', NOW() + INTERVAL '200 days 1 hour', 1)
     RETURNING session_id`);
  tinySession = t.rows[0].session_id;
});

test.after(async () => {
  await db.query(`DELETE FROM bookings WHERE member_id IN (SELECT member_id FROM members WHERE email LIKE $1)`, [`test-%-${run}@example.com`]);
  await db.query(`DELETE FROM bookings WHERE session_id = $1`, [tinySession]);
  await db.query(`DELETE FROM sessions WHERE session_id = $1`, [tinySession]);
  await db.query(`DELETE FROM members WHERE email LIKE $1`, [`test-%-${run}@example.com`]);
  await stop();
});

// ---------- registration ----------
test('T01 health check works', async () => {
  const r = await client().get('/api/health');
  assert.equal(r.status, 200);
});

test('T02 registration succeeds and never returns the password hash', async () => {
  const c = client();
  const r = await c.post('/api/auth/register', { full_name: 'Test One', email: email('one'), password: PASSWORD });
  assert.equal(r.status, 201);
  assert.equal(r.data.member.email, email('one'));
  assert.equal(r.data.member.password_hash, undefined);
});

test('T03 weak password is rejected', async () => {
  const r = await client().post('/api/auth/register', { full_name: 'Weak', email: email('weak'), password: 'abc' });
  assert.equal(r.status, 400);
});

test('T04 password without a digit is rejected', async () => {
  const r = await client().post('/api/auth/register', { full_name: 'NoDigit', email: email('nodigit'), password: 'onlyletters' });
  assert.equal(r.status, 400);
});

test('T05 invalid email is rejected', async () => {
  const r = await client().post('/api/auth/register', { full_name: 'Bad Mail', email: 'not-an-email', password: PASSWORD });
  assert.equal(r.status, 400);
});

test('T06 duplicate email is rejected', async () => {
  const r = await client().post('/api/auth/register', { full_name: 'Test One Again', email: email('one'), password: PASSWORD });
  assert.equal(r.status, 409);
});

test('T07 the password is stored as a bcrypt hash, not as text', async () => {
  const { rows } = await db.query('SELECT password_hash FROM members WHERE email = $1', [email('one')]);
  assert.notEqual(rows[0].password_hash, PASSWORD);
  assert.match(rows[0].password_hash, /^\$2[aby]\$/);
});

// ---------- login and authorization ----------
test('T08 login with the right password sets an httpOnly cookie', async () => {
  const r = await client().post('/api/auth/login', { email: email('one'), password: PASSWORD });
  assert.equal(r.status, 200);
  assert.match(r.setCookie, /HttpOnly/i);
  assert.match(r.setCookie, /SameSite=Strict/i);
});

test('T09 wrong password gives a generic error', async () => {
  const r = await client().post('/api/auth/login', { email: email('one'), password: 'WrongPass1' });
  assert.equal(r.status, 401);
  assert.equal(r.data.error, 'Invalid email or password');
});

test('T10 unknown email gives the same generic error', async () => {
  const r = await client().post('/api/auth/login', { email: email('nobody'), password: PASSWORD });
  assert.equal(r.status, 401);
  assert.equal(r.data.error, 'Invalid email or password');
});

test('T11 SQL injection in the email field does not work', async () => {
  const r = await client().post('/api/auth/login', { email: "' OR '1'='1", password: "' OR '1'='1" });
  assert.equal(r.status, 401);
});

test('T12 protected pages need login', async () => {
  const c = client();
  assert.equal((await c.get('/api/me')).status, 401);
  assert.equal((await c.get('/api/sessions')).status, 401);
  assert.equal((await c.post('/api/bookings', { session_id: futureSession })).status, 401);
});

test('T13 a forged or broken token is rejected', async () => {
  assert.equal((await raw('/api/me', 'token=not-a-real-token')).status, 401);
  // a token signed with the wrong secret
  const jwt = require('jsonwebtoken');
  const forged = jwt.sign({ sub: 1, role: 'admin' }, 'wrong-secret');
  assert.equal((await raw('/api/admin/report', `token=${forged}`)).status, 401);
});

test('T14 a normal member cannot open the manager report', async () => {
  const c = client();
  await c.post('/api/auth/login', { email: email('one'), password: PASSWORD });
  assert.equal((await c.get('/api/admin/report')).status, 403);
});

test('T15 the manager can open the report', async () => {
  const c = client();
  const login = await c.post('/api/auth/login', { email: 'admin@gym.local', password: 'Admin12345' });
  assert.equal(login.status, 200);
  const r = await c.get('/api/admin/report');
  assert.equal(r.status, 200);
  assert.ok(r.data.kpi);
});

test('T16 logout removes access', async () => {
  const c = client();
  await c.post('/api/auth/login', { email: email('one'), password: PASSWORD });
  assert.equal((await c.get('/api/me')).status, 200);
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/me')).status, 401);
});

// ---------- profile ----------
test('T17 profile can be updated', async () => {
  const c = client();
  await c.post('/api/auth/login', { email: email('one'), password: PASSWORD });
  const r = await c.patch('/api/me', { full_name: 'Test Renamed', phone: '+7 700 111 22 33' });
  assert.equal(r.status, 200);
  assert.equal(r.data.member.full_name, 'Test Renamed');
  assert.equal(r.data.member.phone, '+7 700 111 22 33');
});

test('T18 password change needs the current password and then works', async () => {
  const c = client();
  await c.post('/api/auth/login', { email: email('one'), password: PASSWORD });
  const bad = await c.post('/api/me/password', { current_password: 'Nope12345', new_password: 'NewPass123' });
  assert.equal(bad.status, 400);
  const ok = await c.post('/api/me/password', { current_password: PASSWORD, new_password: 'NewPass123' });
  assert.equal(ok.status, 200);
  const again = await client().post('/api/auth/login', { email: email('one'), password: 'NewPass123' });
  assert.equal(again.status, 200);
  const old = await client().post('/api/auth/login', { email: email('one'), password: PASSWORD });
  assert.equal(old.status, 401);
});

// ---------- bookings ----------
test('T19 a member can book a session', async () => {
  const c = client();
  await c.post('/api/auth/register', { full_name: 'Booker', email: email('booker'), password: PASSWORD });
  const r = await c.post('/api/bookings', { session_id: futureSession });
  assert.equal(r.status, 201);
});

test('T20 the same session cannot be booked twice', async () => {
  const c = client();
  await c.post('/api/auth/login', { email: email('booker'), password: PASSWORD });
  const r = await c.post('/api/bookings', { session_id: futureSession });
  assert.equal(r.status, 409);
});

test('T21 cancel and re-book works (the Task 9 defect stays fixed)', async () => {
  const c = client();
  await c.post('/api/auth/login', { email: email('booker'), password: PASSWORD });
  const list = await c.get('/api/me/bookings');
  const mine = list.data.bookings.find((b) => b.session_id === futureSession && b.status === 'booked');
  assert.ok(mine);
  assert.equal((await c.del(`/api/bookings/${mine.booking_id}`)).status, 200);
  assert.equal((await c.post('/api/bookings', { session_id: futureSession })).status, 201);
});

test('T22 a full session cannot be booked', async () => {
  const a = client();
  await a.post('/api/auth/register', { full_name: 'First', email: email('first'), password: PASSWORD });
  assert.equal((await a.post('/api/bookings', { session_id: tinySession })).status, 201);
  const b = client();
  await b.post('/api/auth/register', { full_name: 'Second', email: email('second'), password: PASSWORD });
  const r = await b.post('/api/bookings', { session_id: tinySession });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /full/i);
});

test('T23 an inactive member cannot book', async () => {
  const c = client();
  await c.post('/api/auth/register', { full_name: 'Inactive', email: email('inactive'), password: PASSWORD });
  await db.query(`UPDATE members SET status = 'inactive' WHERE email = $1`, [email('inactive')]);
  const r = await c.post('/api/bookings', { session_id: futureSession });
  assert.equal(r.status, 409);
});

test('T24 one member cannot cancel the booking of another member', async () => {
  const owner = client();
  await owner.post('/api/auth/login', { email: email('booker'), password: PASSWORD });
  const mine = (await owner.get('/api/me/bookings')).data.bookings.find((b) => b.status === 'booked');
  const other = client();
  await other.post('/api/auth/login', { email: email('first'), password: PASSWORD });
  assert.equal((await other.del(`/api/bookings/${mine.booking_id}`)).status, 404);
});

// ---------- new in this version (survey-driven) ----------
test('T25 cancelling is closed 2 hours before the class', async () => {
  const c = client();
  await c.post('/api/auth/login', { email: email('booker'), password: PASSWORD });
  const me = (await db.query('SELECT member_id FROM members WHERE email = $1', [email('booker')])).rows[0];
  // own trainer and room, so the overlap trigger cannot clash with the seeded schedule
  const tr = (await db.query(`INSERT INTO trainers (full_name, speciality) VALUES ('Test Trainer', 'Test') RETURNING trainer_id`)).rows[0];
  const rm = (await db.query(`INSERT INTO rooms (name, capacity) VALUES ($1, 5) RETURNING room_id`, ['Test Room ' + run])).rows[0];
  const ss = (await db.query(
    `INSERT INTO sessions (class_id, trainer_id, room_id, start_time, end_time, capacity)
     VALUES (1, $1, $2, NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours', 5) RETURNING session_id`,
    [tr.trainer_id, rm.room_id])).rows[0];
  const bk = (await db.query(`INSERT INTO bookings (member_id, session_id) VALUES ($1, $2) RETURNING booking_id`, [me.member_id, ss.session_id])).rows[0];
  const r = await c.del(`/api/bookings/${bk.booking_id}`);
  assert.equal(r.status, 409);
  assert.match(r.data.error, /2 hours/);
  await db.query('DELETE FROM bookings WHERE session_id = $1', [ss.session_id]);
  await db.query('DELETE FROM sessions WHERE session_id = $1', [ss.session_id]);
  await db.query('DELETE FROM trainers WHERE trainer_id = $1', [tr.trainer_id]);
  await db.query('DELETE FROM rooms WHERE room_id = $1', [rm.room_id]);
});

test('T26 trainer profiles need login and return a list', async () => {
  assert.equal((await client().get('/api/trainers')).status, 401);
  const c = client();
  await c.post('/api/auth/login', { email: email('booker'), password: PASSWORD });
  const r = await c.get('/api/trainers');
  assert.equal(r.status, 200);
  assert.ok(r.data.trainers.length >= 3);
});

test('T27 the first page is the login page', async () => {
  const res = await fetch(`http://127.0.0.1:${require('./helpers').port()}/`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /<form id="form">/);
  assert.match(html, /Log in/);
});

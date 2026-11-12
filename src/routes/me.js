// Profile of the logged-in member. Backend: Aiman (Student 1).
const express = require('express');
const db = require('../db');
const sec = require('../security');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const PROFILE_SQL = `
  SELECT m.member_id, m.full_name, m.email, m.phone, m.role, m.status, m.join_date,
         p.plan_id, p.name AS plan_name, p.price AS plan_price
  FROM members m JOIN membership_plans p ON p.plan_id = m.plan_id
  WHERE m.member_id = $1`;

// GET /api/me
router.get('/', async (req, res) => {
  const { rows } = await db.query(PROFILE_SQL, [req.user.member_id]);
  res.json({ member: rows[0] });
});

// PATCH /api/me  { full_name?, phone?, plan_id? }
router.patch('/', async (req, res) => {
  const { full_name, phone, plan_id } = req.body || {};
  const name = full_name === undefined ? null : String(full_name).trim();
  if (name !== null && (name.length < 2 || name.length > 100)) {
    return res.status(400).json({ error: 'Enter your full name' });
  }
  let ph = phone === undefined ? null : String(phone).trim();
  if (ph !== null && ph !== '' && !/^[0-9+() -]{6,20}$/.test(ph)) {
    return res.status(400).json({ error: 'Enter a valid phone number' });
  }
  if (plan_id !== undefined) {
    const plan = await db.query('SELECT 1 FROM membership_plans WHERE plan_id = $1', [plan_id]);
    if (plan.rows.length === 0) return res.status(400).json({ error: 'Choose a membership plan' });
  }
  await db.query(
    `UPDATE members SET
       full_name = COALESCE($2, full_name),
       phone     = CASE WHEN $3::text IS NULL THEN phone ELSE NULLIF($3, '') END,
       plan_id   = COALESCE($4, plan_id)
     WHERE member_id = $1`,
    [req.user.member_id, name, ph, plan_id === undefined ? null : plan_id]
  );
  const { rows } = await db.query(PROFILE_SQL, [req.user.member_id]);
  res.json({ member: rows[0] });
});

// POST /api/me/password  { current_password, new_password }
router.post('/password', async (req, res) => {
  const { current_password, new_password } = req.body || {};
  const { rows } = await db.query('SELECT password_hash FROM members WHERE member_id = $1', [req.user.member_id]);
  const ok = typeof current_password === 'string' &&
             await sec.checkPassword(current_password, rows[0].password_hash);
  if (!ok) return res.status(400).json({ error: 'Current password is wrong' });
  const problem = sec.passwordProblem(new_password);
  if (problem) return res.status(400).json({ error: problem });
  await db.query('UPDATE members SET password_hash = $2 WHERE member_id = $1',
    [req.user.member_id, await sec.hashPassword(new_password)]);
  res.json({ ok: true });
});

// GET /api/me/bookings
router.get('/bookings', async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.booking_id, b.status, s.session_id, c.name AS class_name, t.full_name AS trainer,
            r.name AS room, s.start_time, s.end_time
     FROM bookings b
     JOIN sessions s ON s.session_id = b.session_id
     JOIN classes  c ON c.class_id   = s.class_id
     JOIN trainers t ON t.trainer_id = s.trainer_id
     JOIN rooms    r ON r.room_id    = s.room_id
     WHERE b.member_id = $1
     ORDER BY s.start_time DESC
     LIMIT 50`,
    [req.user.member_id]
  );
  res.json({ bookings: rows });
});

module.exports = router;

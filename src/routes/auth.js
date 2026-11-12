// Registration, login, logout. Backend: Aiman (Student 1). Password and token rules: Naima (Student 3).
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const sec = require('../security');

const router = express.Router();

// Too many login attempts from one address are blocked for 15 minutes (slows password guessing).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.loginRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/register  { full_name, email, password, plan_id? }
router.post('/register', async (req, res) => {
  const { full_name, email, password, plan_id } = req.body || {};
  const name = typeof full_name === 'string' ? full_name.trim() : '';
  const mail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Enter your full name' });
  if (!EMAIL_RE.test(mail) || mail.length > 100) return res.status(400).json({ error: 'Enter a valid email' });
  const problem = sec.passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });

  const planId = Number.isInteger(plan_id) ? plan_id : 1;
  const plan = await db.query('SELECT 1 FROM membership_plans WHERE plan_id = $1', [planId]);
  if (plan.rows.length === 0) return res.status(400).json({ error: 'Choose a membership plan' });

  const hash = await sec.hashPassword(password);
  try {
    const { rows } = await db.query(
      `INSERT INTO members (full_name, email, password_hash, plan_id)
       VALUES ($1, $2, $3, $4)
       RETURNING member_id, full_name, email, role, plan_id, status`,
      [name, mail, hash, planId]
    );
    sec.setLoginCookie(res, rows[0]);
    return res.status(201).json({ member: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This email is already registered' });
    throw err;
  }
});

// POST /api/auth/login  { email, password }
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const mail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!mail || typeof password !== 'string') {
    return res.status(400).json({ error: 'Enter email and password' });
  }
  const { rows } = await db.query(
    'SELECT member_id, full_name, email, role, plan_id, status, password_hash FROM members WHERE email = $1',
    [mail]
  );
  const member = rows[0];
  // Always compare a hash, even when the email is unknown: same time, same message.
  const ok = await sec.checkPassword(password, member ? member.password_hash : sec.DUMMY_HASH);
  if (!member || !ok) return res.status(401).json({ error: 'Invalid email or password' });

  sec.setLoginCookie(res, member);
  delete member.password_hash;
  res.json({ member });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  sec.clearLoginCookie(res);
  res.json({ ok: true });
});

module.exports = router;

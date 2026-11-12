// Plans, sessions and bookings. Backend: Aiman (Student 1). The rules themselves live in the database (db/schema.sql).
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const CANCEL_HOURS = 2;

// GET /api/plans  (public, used by the registration page)
router.get('/plans', async (req, res) => {
  const { rows } = await db.query(
    'SELECT plan_id, name, price, duration_days FROM membership_plans ORDER BY plan_id'
  );
  res.json({ plans: rows });
});

// GET /api/sessions  upcoming sessions with free places and my own booking
router.get('/sessions', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.session_id, c.name AS class_name, t.full_name AS trainer, r.name AS room,
            s.start_time, s.end_time, s.capacity,
            s.capacity - COUNT(b.*) FILTER (WHERE b.status <> 'cancelled')::int AS free_places,
            MAX(b.booking_id) FILTER (WHERE b.member_id = $1 AND b.status = 'booked') AS my_booking_id
     FROM sessions s
     JOIN classes  c ON c.class_id   = s.class_id
     JOIN trainers t ON t.trainer_id = s.trainer_id
     JOIN rooms    r ON r.room_id    = s.room_id
     LEFT JOIN bookings b ON b.session_id = s.session_id
     WHERE s.start_time > NOW() AND s.start_time < NOW() + INTERVAL '14 days'
     GROUP BY s.session_id, c.name, t.full_name, r.name
     ORDER BY s.start_time
     LIMIT 100`,
    [req.user.member_id]
  );
  res.json({ sessions: rows });
});

// POST /api/bookings  { session_id }
router.post('/bookings', requireAuth, async (req, res) => {
  const sessionId = req.body && req.body.session_id;
  if (!Number.isInteger(sessionId)) return res.status(400).json({ error: 'Choose a session' });

  const s = await db.query('SELECT start_time FROM sessions WHERE session_id = $1', [sessionId]);
  if (s.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
  if (new Date(s.rows[0].start_time) <= new Date()) {
    return res.status(400).json({ error: 'This session has already started' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO bookings (member_id, session_id) VALUES ($1, $2)
       RETURNING booking_id, session_id, status`,
      [req.user.member_id, sessionId]
    );
    res.status(201).json({ booking: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You already booked this session' });
    if (err.code === 'P0001') return res.status(409).json({ error: err.message }); // rule from a trigger
    throw err;
  }
});

// DELETE /api/bookings/:id  cancels my own booking up to 2 hours before the class (survey Q11)
router.delete('/bookings/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid booking' });
  const found = await db.query(
    `SELECT s.start_time FROM bookings b JOIN sessions s ON s.session_id = b.session_id
     WHERE b.booking_id = $1 AND b.member_id = $2 AND b.status = 'booked'`,
    [id, req.user.member_id]
  );
  if (found.rows.length === 0) return res.status(404).json({ error: 'Booking not found or cannot be cancelled' });
  if (new Date(found.rows[0].start_time) < new Date(Date.now() + CANCEL_HOURS * 3600 * 1000)) {
    return res.status(409).json({ error: `Cancelling closes ${CANCEL_HOURS} hours before the class` });
  }
  await db.query(`UPDATE bookings SET status = 'cancelled' WHERE booking_id = $1`, [id]);
  res.json({ ok: true });
});

// GET /api/trainers  who teaches what (survey Q12: trainer info is the most wanted feature)
router.get('/trainers', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.trainer_id, t.full_name, t.speciality, t.bio,
            COUNT(s.*) FILTER (WHERE s.start_time > NOW() AND s.start_time < NOW() + INTERVAL '14 days')::int AS upcoming_sessions
     FROM trainers t LEFT JOIN sessions s ON s.trainer_id = t.trainer_id
     GROUP BY t.trainer_id ORDER BY t.full_name`);
  res.json({ trainers: rows });
});

module.exports = router;

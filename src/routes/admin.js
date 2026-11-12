// Manager report (SIS 9 dashboard data). Only staff and admin. Backend: Aiman (Student 1).
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('staff', 'admin'));

// GET /api/admin/report  fill rate and no-show for finished sessions in the last 14 days
router.get('/report', async (req, res) => {
  const past = `start_time < NOW() AND start_time >= NOW() - INTERVAL '14 days'`;

  const kpi = await db.query(`
    SELECT COUNT(*)::int AS sessions,
           COALESCE(SUM(active_bookings), 0)::int AS active_bookings,
           COALESCE(SUM(capacity), 0)::int AS capacity,
           ROUND(100.0 * SUM(active_bookings) / NULLIF(SUM(capacity), 0), 0)::int AS fill_rate_pct,
           ROUND(100.0 * SUM(no_shows) / NULLIF(SUM(active_bookings), 0), 0)::int AS no_show_pct,
           COUNT(*) FILTER (WHERE fill_rate_pct < 50 OR no_show_pct > 10)::int AS needing_action,
           COUNT(*) FILTER (WHERE fill_rate_pct >= 90)::int AS almost_full
    FROM v_session_fill WHERE ${past}`);

  const slots = await db.query(`
    SELECT time_slot,
           ROUND(100.0 * SUM(active_bookings) / NULLIF(SUM(capacity), 0), 0)::int AS fill_rate_pct,
           ROUND(100.0 * SUM(no_shows) / NULLIF(SUM(active_bookings), 0), 0)::int AS no_show_pct
    FROM v_session_fill WHERE ${past}
    GROUP BY time_slot ORDER BY time_slot`);

  const actions = await db.query(`
    SELECT start_time, class_name, trainer, fill_rate_pct, no_show_pct,
           CASE WHEN fill_rate_pct < 50 THEN 'LOW FILL' ELSE 'OK' END AS fill_flag,
           CASE WHEN no_show_pct > 10 THEN 'HIGH NO-SHOW' ELSE 'OK' END AS no_show_flag
    FROM v_session_fill
    WHERE ${past} AND (fill_rate_pct < 50 OR no_show_pct > 10)
    ORDER BY fill_rate_pct, no_show_pct DESC NULLS LAST
    LIMIT 8`);

  res.json({ kpi: kpi.rows[0], by_time_slot: slots.rows, action_list: actions.rows, target_fill_pct: 70 });
});

module.exports = router;

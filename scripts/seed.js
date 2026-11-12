const db = require('../src/db');
const { hashPassword } = require('../src/security');

(async () => {
  await db.query(`
    INSERT INTO membership_plans (name, price, duration_days) VALUES
      ('Monthly', 25, 30), ('Quarterly', 65, 90), ('Yearly', 240, 365);
    INSERT INTO classes (name, level) VALUES
      ('Yoga', 'beginner'), ('HIIT', 'advanced'), ('Pilates', 'all'), ('Strength', 'all'), ('Cardio', 'all');
    INSERT INTO trainers (full_name, speciality, bio) VALUES
      ('Aigerim T.', 'Yoga, Pilates', 'Demo profile: 6 years of teaching, calm classes for beginners.'),
      ('Marat S.', 'HIIT, Cardio', 'Demo profile: former athlete, high-energy interval training.'),
      ('Dias K.', 'Strength', 'Demo profile: strength coach, technique first, safe weights.');
    INSERT INTO rooms (name, capacity) VALUES ('Studio A', 20), ('Studio B', 15);
  `);

  const adminHash = await hashPassword('Admin12345');
  const memberHash = await hashPassword('Member12345');
  await db.query(
    `INSERT INTO members (full_name, email, password_hash, role, plan_id) VALUES
       ('Gym Manager', 'admin@gym.local', $1, 'admin', 3),
       ('Demo Member', 'member@gym.local', $2, 'member', 1)`,
    [adminHash, memberHash]
  );
  await db.query(
    `INSERT INTO members (full_name, email, password_hash, plan_id)
     SELECT 'Member ' || g, 'member' || g || '@demo.local', $1, 1 + g % 3
     FROM generate_series(1, 28) g`,
    [memberHash]
  );

  // Sessions: 4 slots a day (07:00, 12:00, 18:00, 20:00; survey: 18:00 and 20:00 are the favourite times), Mon-Sat, from 14 days ago to 14 days ahead
  await db.query(`
    INSERT INTO sessions (class_id, trainer_id, room_id, start_time, end_time, capacity)
    SELECT 1 + ((d + h_i) % 5 + 5) % 5, 1 + ((d + h_i) % 3 + 3) % 3, 1 + ((d + h_i) % 2 + 2) % 2,
           CURRENT_DATE + d + h * INTERVAL '1 hour',
           CURRENT_DATE + d + h * INTERVAL '1 hour' + INTERVAL '1 hour',
           CASE WHEN h = 7 THEN 10 ELSE 15 END
    FROM generate_series(-14, 14) d,
         (VALUES (7, 0), (12, 1), (18, 2), (20, 3)) AS t(h, h_i)
    WHERE EXTRACT(DOW FROM CURRENT_DATE + d) <> 0`);

  // Past bookings so the manager report has data (same pattern as the SIS 9 demo: 07:00 weak, 18:00 full)
  await db.query(`
    DO $$
    DECLARE s RECORD; m RECORD; v INT; target INT; n INT;
    BEGIN
      FOR s IN SELECT session_id, capacity, EXTRACT(HOUR FROM start_time) AS hr
               FROM sessions WHERE start_time < NOW() LOOP
        target := CASE WHEN s.hr = 18 THEN s.capacity
                       WHEN s.hr IN (12, 20) THEN (s.capacity * 0.7)::INT
                       ELSE (s.capacity * 0.3)::INT END;
        n := 0;
        FOR m IN SELECT member_id FROM members WHERE status = 'active' AND role = 'member'
                 ORDER BY md5(member_id::text || '-' || s.session_id::text) LOOP
          EXIT WHEN n >= target;
          v := ('x' || substr(md5(m.member_id::text || ':' || s.session_id::text), 1, 6))::bit(24)::int % 100;
          INSERT INTO bookings (member_id, session_id, status)
          VALUES (m.member_id, s.session_id,
                  CASE WHEN v < 10 THEN 'cancelled'
                       WHEN v < 10 + CASE WHEN s.hr = 7 THEN 30 ELSE 8 END THEN 'no_show'
                       ELSE 'attended' END);
          n := n + 1;
        END LOOP;
      END LOOP;
    END $$;`);

  console.log('Demo data created. Log in with admin@gym.local / Admin12345');
  await db.pool.end();
})().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

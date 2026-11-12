
DROP VIEW  IF EXISTS v_session_fill CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS membership_plans CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS trainers CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;

CREATE TABLE membership_plans (
    plan_id        SERIAL PRIMARY KEY,
    name           VARCHAR(50)  NOT NULL,
    price          NUMERIC(8,2) NOT NULL CHECK (price >= 0),
    duration_days  INT          NOT NULL CHECK (duration_days > 0)
);

CREATE TABLE members (
    member_id      SERIAL PRIMARY KEY,
    full_name      VARCHAR(100) NOT NULL,
    email          VARCHAR(100) NOT NULL UNIQUE,
    phone          VARCHAR(20),
    password_hash  VARCHAR(100) NOT NULL,            -- bcrypt hash, never the password
    role           VARCHAR(10)  NOT NULL DEFAULT 'member'
                   CHECK (role IN ('member', 'staff', 'admin')),
    plan_id        INT NOT NULL REFERENCES membership_plans(plan_id),
    status         VARCHAR(10)  NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'inactive')),
    join_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
    payment_id  SERIAL PRIMARY KEY,
    member_id   INT NOT NULL REFERENCES members(member_id),
    amount      NUMERIC(8,2) NOT NULL CHECK (amount > 0),
    paid_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    method      VARCHAR(20) NOT NULL DEFAULT 'cash'
);

CREATE TABLE classes (
    class_id  SERIAL PRIMARY KEY,
    name      VARCHAR(50) NOT NULL,
    level     VARCHAR(20) NOT NULL DEFAULT 'all'
);

CREATE TABLE trainers (
    trainer_id  SERIAL PRIMARY KEY,
    full_name   VARCHAR(100) NOT NULL,
    speciality  VARCHAR(50),
    bio         VARCHAR(200)
);

CREATE TABLE rooms (
    room_id   SERIAL PRIMARY KEY,
    name      VARCHAR(50) NOT NULL UNIQUE,
    capacity  INT NOT NULL CHECK (capacity > 0)
);

CREATE TABLE sessions (
    session_id  SERIAL PRIMARY KEY,
    class_id    INT NOT NULL REFERENCES classes(class_id),
    trainer_id  INT NOT NULL REFERENCES trainers(trainer_id),
    room_id     INT NOT NULL REFERENCES rooms(room_id),
    start_time  TIMESTAMP NOT NULL,
    end_time    TIMESTAMP NOT NULL,
    capacity    INT NOT NULL CHECK (capacity > 0),
    CHECK (end_time > start_time)
);

CREATE TABLE bookings (
    booking_id  SERIAL PRIMARY KEY,
    member_id   INT NOT NULL REFERENCES members(member_id),
    session_id  INT NOT NULL REFERENCES sessions(session_id),
    status      VARCHAR(10) NOT NULL DEFAULT 'booked'
                CHECK (status IN ('booked', 'cancelled', 'attended', 'no_show')),
    booked_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_active_booking
ON bookings (member_id, session_id)
WHERE status <> 'cancelled';

CREATE OR REPLACE FUNCTION fn_no_overbooking() RETURNS trigger AS $$
DECLARE taken INT; cap INT;
BEGIN
    IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
    SELECT capacity INTO cap FROM sessions WHERE session_id = NEW.session_id;
    SELECT COUNT(*) INTO taken FROM bookings
     WHERE session_id = NEW.session_id AND status <> 'cancelled';
    IF taken >= cap THEN
        RAISE EXCEPTION 'This session is full';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_overbooking BEFORE INSERT ON bookings
FOR EACH ROW EXECUTE FUNCTION fn_no_overbooking();

CREATE OR REPLACE FUNCTION fn_active_member_only() RETURNS trigger AS $$
DECLARE m_status VARCHAR(10);
BEGIN
    SELECT status INTO m_status FROM members WHERE member_id = NEW.member_id;
    IF m_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Your membership is not active';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER active_member_only BEFORE INSERT ON bookings
FOR EACH ROW EXECUTE FUNCTION fn_active_member_only();

CREATE OR REPLACE FUNCTION fn_no_session_overlap() RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM sessions s
         WHERE s.session_id <> COALESCE(NEW.session_id, -1)
           AND (s.room_id = NEW.room_id OR s.trainer_id = NEW.trainer_id)
           AND s.start_time < NEW.end_time
           AND s.end_time   > NEW.start_time
    ) THEN
        RAISE EXCEPTION 'Room or trainer clash for this time';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_session_overlap BEFORE INSERT OR UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION fn_no_session_overlap();

CREATE VIEW v_session_fill AS
SELECT
  s.session_id,
  c.name                                    AS class_name,
  t.full_name                               AS trainer,
  s.start_time,
  TO_CHAR(s.start_time, 'HH24:MI')          AS time_slot,
  s.capacity,
  COUNT(*) FILTER (WHERE b.status <> 'cancelled')                 AS active_bookings,
  COUNT(*) FILTER (WHERE b.status = 'no_show')                    AS no_shows,
  ROUND(100.0 * COUNT(*) FILTER (WHERE b.status <> 'cancelled') / s.capacity, 0) AS fill_rate_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE b.status = 'no_show')
        / NULLIF(COUNT(*) FILTER (WHERE b.status <> 'cancelled'), 0), 0)         AS no_show_pct
FROM sessions s
JOIN classes  c ON c.class_id   = s.class_id
JOIN trainers t ON t.trainer_id = s.trainer_id
LEFT JOIN bookings b ON b.session_id = s.session_id
GROUP BY s.session_id, c.name, t.full_name, s.start_time, s.capacity;

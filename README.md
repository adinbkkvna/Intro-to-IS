# FitZone: Gym Booking System (team cutefairy)

Black and red theme. The first page is the login page. Features chosen from our student survey (docs/survey-results.md): trainer profiles, class filter, evening classes, 2-hour cancel rule.

Website where members register, log in, book and cancel gym sessions, and managers see a fill-rate report.
Course: Introduction to Information Systems, KBTU.

## Team and ownership
| Area | Owner | Files |
|---|---|---|
| Security, authorization, passwords | Naima | `src/security.js`, `src/middleware/auth.js`, `src/routes/auth.js`, `SECURITY.md` |
| Database (minimum tables) | Tomiris | `db/schema.sql`, `scripts/` |
| Backend (connection, endpoints) | Aiman | `src/db.js`, `src/app.js`, `src/routes/` |
| Frontend + testing | Adina | `public/`, `tests/` |
| Student survey | Aizere | `docs/survey-results.md` |

## Run it (Windows / Mac)
1. Install Node.js 20+ (nodejs.org) and PostgreSQL + pgAdmin 4.
2. In pgAdmin create an empty database named `gym_site`.
3. In the project folder: copy `.env.example` to `.env`, then put your Postgres password into `DATABASE_URL` and any long random text into `JWT_SECRET`.
4. Commands:
```
npm install
npm run db:setup     # creates tables (deletes old data!)
npm run db:seed      # demo data
npm start            # open http://localhost:3000
npm test             # 27 automated tests
```
Demo accounts (demo only, never use in production): `member@gym.local / Member12345`, `admin@gym.local / Admin12345`.

## API
| Method | Path | Who |
|---|---|---|
| POST | /api/auth/register, /api/auth/login, /api/auth/logout | public / any |
| GET, PATCH | /api/me | logged-in |
| POST | /api/me/password | logged-in |
| GET | /api/me/bookings | logged-in |
| GET | /api/plans | public |
| GET | /api/sessions, /api/trainers | logged-in |
| POST | /api/bookings | member |
| DELETE | /api/bookings/:id | owner only |
| GET | /api/admin/report | staff / admin |

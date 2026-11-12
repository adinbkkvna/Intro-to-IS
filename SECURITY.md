# Security notes (Naima)

| Risk | What we do | Test |
|---|---|---|
| Stolen database | Passwords stored as bcrypt hashes, never as text | T07 |
| Weak passwords | At least 8 characters, a letter and a digit, max 72 | T03, T04 |
| Guessing which emails exist | Same message "Invalid email or password" for wrong email and wrong password | T09, T10 |
| Brute force | Login rate limit (10 tries per 15 minutes per IP) | manual |
| Stolen token via script (XSS) | JWT in an HttpOnly cookie; frontend uses textContent, helmet CSP | T08 |
| CSRF | SameSite=Strict cookie + JSON-only for changes (415 otherwise) | manual |
| SQL injection | Only parameterized queries ($1, $2) | T11 |
| Forged login | Token signed with JWT_SECRET; role is re-read from the database | T13 |
| Access to other people's data | Role check (member / staff / admin); owner check on cancel | T12, T14, T24 |
| Secrets in GitHub | `.env` is in `.gitignore`; only `.env.example` is committed | review |

Known limits (to say honestly): no email verification, no password reset yet, no HTTPS on localhost (use HTTPS when deployed and set cookie `secure`).

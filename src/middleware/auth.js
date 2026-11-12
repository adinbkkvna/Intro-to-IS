// Authentication (who are you?) and authorization (what may you do?). Owner: Naima (Student 3).
const db = require('../db');
const { readToken } = require('../security');

// Needs a valid login cookie. Puts the current member on req.user.
async function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Please log in' });
  // Read the role from the database each time, so a changed role or inactive account works at once.
  const { rows } = await db.query(
    'SELECT member_id, full_name, email, role, status FROM members WHERE member_id = $1',
    [token.sub]
  );
  if (rows.length === 0) return res.status(401).json({ error: 'Please log in' });
  req.user = rows[0];
  next();
}

// Allows only some roles, for example requireRole('staff', 'admin').
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission for this' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };

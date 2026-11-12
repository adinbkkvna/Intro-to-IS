// Security helpers. Owner: Naima (Student 3).
// Passwords: hashed with bcrypt (salted, slow on purpose). Login: signed token in an httpOnly cookie.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');

const COOKIE_NAME = 'token';

// Password policy: at least 8 characters, with a letter and a digit.
function passwordProblem(password) {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < 8) return 'Password must have at least 8 characters';
  if (password.length > 72) return 'Password must have at most 72 characters';
  if (!/[A-Za-z]/.test(password)) return 'Password must contain a letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a digit';
  return null;
}

function hashPassword(password) {
  return bcrypt.hash(password, config.bcryptCost);
}

function checkPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// A fixed hash used when the email does not exist, so the response time is the same
// and an attacker cannot learn which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', 4);

function signToken(member) {
  return jwt.sign({ sub: member.member_id, role: member.role }, config.jwtSecret, {
    expiresIn: `${config.tokenHours}h`,
  });
}

function setLoginCookie(res, member) {
  res.cookie(COOKIE_NAME, signToken(member), {
    httpOnly: true,            // JavaScript in the page cannot read it (protects against XSS theft)
    sameSite: 'strict',        // not sent from other sites (protects against CSRF)
    secure: config.isProd,     // HTTPS only in production
    maxAge: config.tokenHours * 3600 * 1000,
  });
}

function clearLoginCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: config.isProd });
}

function readToken(req) {
  const raw = req.cookies && req.cookies[COOKIE_NAME];
  if (!raw) return null;
  try {
    return jwt.verify(raw, config.jwtSecret);
  } catch {
    return null;
  }
}

module.exports = {
  COOKIE_NAME, passwordProblem, hashPassword, checkPassword, DUMMY_HASH,
  setLoginCookie, clearLoginCookie, readToken,
};

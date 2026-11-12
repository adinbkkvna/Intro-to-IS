// Central configuration. Values come from the .env file (see .env.example).
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

if (!process.env.JWT_SECRET && isProd) {
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gym_site',
  // Secret used to sign login tokens. Use a long random string in .env, never commit it.
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  isProd,
  bcryptCost: Number(process.env.BCRYPT_COST || 12),
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT || 10),
  tokenHours: 2,
};

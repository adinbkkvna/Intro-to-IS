// The Express application (no listen here, so tests can start it themselves).
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const app = express();

app.disable('x-powered-by');
app.use(helmet());                       // safe HTTP headers (Naima)
app.use(express.json({ limit: '10kb' })); // small bodies only
app.use(cookieParser());

// Only accept JSON for changes. Together with SameSite=Strict cookies this blocks simple CSRF forms.
app.use('/api', (req, res, next) => {
  const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'];
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && hasBody) {
    if (!req.is('application/json')) return res.status(415).json({ error: 'Send JSON' });
  }
  next();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/me', require('./routes/me'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/booking'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// The frontend (Adina): plain HTML, CSS and JavaScript in /public
app.use(express.static(path.join(__dirname, '..', 'public')));

// Last-resort error handler: never show internal details to the user.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

module.exports = app;

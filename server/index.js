require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const helmet = require('helmet');
const path = require('path');
const cron = require('node-cron');

const authRoutes = require('./routes/auth');
const oddsRoutes = require('./routes/odds');
const picksRoutes = require('./routes/picks');
const scoresRoutes = require('./routes/scores');
const standingsRoutes = require('./routes/standings');
const adminRoutes = require('./routes/admin');
const { isAuthenticated } = require('./middleware/auth');
const dataStore = require('./utils/dataStore');

const isProd = process.env.NODE_ENV === 'production';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render's (and any single-hop) reverse proxy so that
// req.protocol is 'https' and secure cookies are set correctly.
app.set('trust proxy', 1);

// ── Security ──────────────────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://lh3.googleusercontent.com'],
    },
  },
}));

// ── Body / session ────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// In production, persist sessions to disk so they survive restarts.
// In development, MemoryStore is fine (no disk I/O, no extra setup).
let sessionStore;
if (isProd) {
  const FileStore = require('session-file-store')(session);
  sessionStore = new FileStore({
    path: path.join(__dirname, '../data/sessions'),
    ttl: 7 * 24 * 60 * 60, // seconds — matches cookie maxAge
    retries: 1,
    logFn: () => {},        // suppress verbose file-store logging
  });
}

if (isProd && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable must be set in production');
}

app.use(session({
  store: sessionStore,      // undefined in dev → falls back to MemoryStore
  secret: process.env.SESSION_SECRET || 'change-me-in-development',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: isProd,         // requires HTTPS; safe because trust proxy is set
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use(passport.initialize());
app.use(passport.session());

// ── API routes ────────────────────────────────────────────────────────────────

app.use('/auth', authRoutes);
app.use('/api/odds', isAuthenticated, oddsRoutes);
app.use('/api/picks', isAuthenticated, picksRoutes);
app.use('/api/scores', isAuthenticated, scoresRoutes);
app.use('/api/standings', isAuthenticated, standingsRoutes);
app.use('/api/admin', adminRoutes); // adminOnly applied inside the router

// Public — pool name needed on login/access-denied pages
app.get('/api/pool', (req, res) => {
  res.json(dataStore.getConfig());
});

app.get('/api/config', isAuthenticated, (req, res) => {
  const { poolName } = dataStore.getConfig();
  const allWeeks = dataStore.getAllWeekNumbers();
  const weekNumber = allWeeks.length > 0 ? Math.max(...allWeeks) : null;
  let weekLocked = false;
  if (weekNumber) {
    const week = dataStore.getWeek(weekNumber);
    if (week) weekLocked = !!(week.manualLock || (week.lockTime && new Date(week.lockTime) <= new Date()));
  }
  console.log(`[config] userId=${req.user.id} allWeeks=[${allWeeks}] currentWeek=${weekNumber} weekLocked=${weekLocked}`);
  res.json({ weekNumber, user: req.user, poolName, weekLocked });
});

app.get('/api/weeks/:weekNumber', isAuthenticated, (req, res) => {
  const n = parseInt(req.params.weekNumber);
  const week = dataStore.getWeek(n);
  if (!week) {
    console.log(`[weeks] week${n} not found — data/weeks/week${n}.json missing (run npm run seed?)`);
    return res.status(404).json({ error: 'Week not found' });
  }
  console.log(`[weeks] week${n} — ${week.games.length} games, lockTime=${week.lockTime}, manualLock=${week.manualLock}`);
  res.json(week);
});

app.get('/api/weeks', isAuthenticated, (req, res) => {
  const weekNumbers = dataStore.getAllWeekNumbers();
  res.json(weekNumbers);
});

// ── HTML page routes (auth-gated) ─────────────────────────────────────────────

app.get('/', isAuthenticated, (req, res) =>
  res.sendFile(path.join(__dirname, '../public/index.html')));

app.get('/leaderboard', isAuthenticated, (req, res) =>
  res.sendFile(path.join(__dirname, '../public/leaderboard.html')));

app.get('/settings', isAuthenticated, (req, res) =>
  res.sendFile(path.join(__dirname, '../public/settings.html')));

app.get('/all-picks', isAuthenticated, (req, res) =>
  res.redirect('/leaderboard'));

app.get('/admin', isAuthenticated, (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/');
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/invite', (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/login');
  req.session.inviteToken = token;
  res.redirect('/auth/google');
});

app.get('/access-denied', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/access-denied.html')));

// ── Static files ──────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '../public')));

// ── Score polling cron (every 10 minutes) ────────────────────────────────────

cron.schedule('*/10 * * * *', async () => {
  try {
    await scoresRoutes.pollAndUpdateScores();
  } catch (err) {
    console.error('[cron] Score poll failed:', err.message);
  }
});

// ── Startup ───────────────────────────────────────────────────────────────────

dataStore.ensureDataFiles();

app.listen(PORT, () => {
  console.log(`Football pool running on port ${PORT} — ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
});

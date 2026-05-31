const express = require('express');
const { v4: uuidv4 } = require('uuid');
const dataStore = require('../utils/dataStore');
const { adminOnly } = require('../middleware/adminOnly');

const router = express.Router();
router.use(adminOnly);

// ── Weeks ─────────────────────────────────────────────────────────────────────

router.get('/weeks', (req, res) => {
  const weeks = dataStore.getAllWeekNumbers().map(n => {
    const w = dataStore.getWeek(n);
    return {
      weekNumber: n,
      season: w.season,
      lockTime: w.lockTime,
      gameCount: w.games.length,
      manualLock: w.manualLock || false,
      tiebreakerGameId: w.tiebreakerGameId,
    };
  });
  res.json(weeks);
});

router.get('/weeks/:weekNumber', (req, res) => {
  const week = dataStore.getWeek(parseInt(req.params.weekNumber));
  if (!week) return res.status(404).json({ error: 'Week not found' });
  res.json(week);
});

router.post('/weeks', (req, res) => {
  const { weekNumber, season, games, tiebreakerGameId, lockTime } = req.body;

  if (!weekNumber || !season || !Array.isArray(games) || games.length === 0) {
    return res.status(400).json({ error: 'weekNumber, season, and games required' });
  }
  if (games.length > 30) {
    return res.status(400).json({ error: 'Maximum 30 games per week' });
  }
  if (dataStore.getWeek(weekNumber)) {
    return res.status(409).json({ error: `Week ${weekNumber} already exists` });
  }

  const week = {
    weekNumber,
    season,
    tiebreakerGameId: tiebreakerGameId || null,
    lockTime: lockTime || null,
    manualLock: false,
    games,
    createdAt: new Date().toISOString(),
    lastUpdated: null,
  };
  dataStore.saveWeek(weekNumber, week);
  res.status(201).json(week);
});

router.put('/weeks/:weekNumber', (req, res) => {
  const weekNumber = parseInt(req.params.weekNumber);
  const week = dataStore.getWeek(weekNumber);
  if (!week) return res.status(404).json({ error: 'Week not found' });

  const { manualLock, lockTime, tiebreakerGameId, games } = req.body;
  if (manualLock !== undefined) week.manualLock = Boolean(manualLock);
  if (lockTime !== undefined) week.lockTime = lockTime;
  if (tiebreakerGameId !== undefined) week.tiebreakerGameId = tiebreakerGameId;
  if (Array.isArray(games)) week.games = games;

  dataStore.saveWeek(weekNumber, week);
  res.json(week);
});

// ── Invites ───────────────────────────────────────────────────────────────────

router.get('/invites', (req, res) => {
  res.json(dataStore.getInvites());
});

router.post('/invites', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const normalizedEmail = email.toLowerCase().trim();
  const invites = dataStore.getInvites();

  const open = invites.find(i => i.email === normalizedEmail && !i.usedAt);
  if (open) {
    const inviteUrl = `${process.env.BASE_URL}/invite?token=${open.token}`;
    return res.status(409).json({ error: 'Unused invite already exists for this email', invite: open, inviteUrl });
  }

  const invite = {
    id: uuidv4(),
    token: uuidv4(),
    email: normalizedEmail,
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
    usedAt: null,
    usedBy: null,
  };
  invites.push(invite);
  dataStore.saveInvites(invites);

  const inviteUrl = `${process.env.BASE_URL}/invite?token=${invite.token}`;
  res.status(201).json({ invite, inviteUrl });
});

router.delete('/invites/:id', (req, res) => {
  const invites = dataStore.getInvites();
  const idx = invites.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Invite not found' });
  if (invites[idx].usedAt) return res.status(400).json({ error: 'Cannot revoke a used invite' });
  invites.splice(idx, 1);
  dataStore.saveInvites(invites);
  res.json({ success: true });
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/users', (req, res) => {
  res.json(dataStore.getUsers());
});

router.put('/users/:userId/role', (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Role must be "admin" or "user"' });
  }
  if (req.params.userId === req.user.id && role === 'user') {
    return res.status(400).json({ error: 'Cannot demote yourself' });
  }

  const users = dataStore.getUsers();
  const idx = users.findIndex(u => u.id === req.params.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  users[idx].role = role;
  dataStore.saveUsers(users);
  res.json(users[idx]);
});

router.delete('/users/:userId', (req, res) => {
  if (req.params.userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot remove yourself' });
  }
  const users = dataStore.getUsers();
  const idx = users.findIndex(u => u.id === req.params.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  users.splice(idx, 1);
  dataStore.saveUsers(users);
  res.json({ success: true });
});

module.exports = router;

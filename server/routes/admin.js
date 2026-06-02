const express = require('express');
const { v4: uuidv4 } = require('uuid');
const dataStore = require('../utils/dataStore');
const { adminOnly } = require('../middleware/adminOnly');

const router = express.Router();
router.use(adminOnly);

// ── Pool config ───────────────────────────────────────────────────────────────

router.get('/config', (req, res) => {
  res.json(dataStore.getConfig());
});

router.put('/config', (req, res) => {
  const { poolName } = req.body;
  if (!poolName || typeof poolName !== 'string' || !poolName.trim()) {
    return res.status(400).json({ error: 'poolName is required' });
  }
  const config = { poolName: poolName.trim() };
  dataStore.saveConfig(config);
  res.json(config);
});

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

// ── Staging / development only: manual score entry ──────────────────────────

router.put('/games/:weekNumber/:gameId', (req, res) => {
  const env = process.env.NODE_ENV;
  if (env !== 'staging' && env !== 'development') {
    return res.status(403).json({ error: 'Only available in staging/development' });
  }
  const weekNumber = parseInt(req.params.weekNumber);
  const week = dataStore.getWeek(weekNumber);
  if (!week) return res.status(404).json({ error: 'Week not found' });
  const game = week.games.find(g => g.id === req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const { homeScore, awayScore, status } = req.body;
  const VALID_STATUSES = ['scheduled', 'in_progress', 'final'];
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'status must be scheduled, in_progress, or final' });
  }
  if (homeScore !== undefined) game.homeScore = homeScore === null ? null : Number(homeScore);
  if (awayScore !== undefined) game.awayScore = awayScore === null ? null : Number(awayScore);
  if (status !== undefined) game.status = status;
  week.lastUpdated = new Date().toISOString();
  dataStore.saveWeek(weekNumber, week);
  res.json(game);
});

// ── Staging / development only: create test week ─────────────────────────────

router.post('/test-week', (req, res) => {
  const env = process.env.NODE_ENV;
  if (env !== 'staging' && env !== 'development') {
    return res.status(403).json({ error: 'Only available in staging/development' });
  }
  const allWeekNumbers = dataStore.getAllWeekNumbers();
  const weekNumber = allWeekNumbers.length > 0 ? Math.max(...allWeekNumbers) + 1 : 1;
  if (dataStore.getWeek(weekNumber)) {
    return res.status(409).json({ error: `Week ${weekNumber} already exists` });
  }
  const lockTimeMs = Date.now() + 48 * 60 * 60 * 1000;
  const games = generateTestGames(weekNumber, lockTimeMs);
  const tiebreakerGameId = games[games.length - 1].id;
  const week = {
    weekNumber,
    season: new Date().getFullYear(),
    tiebreakerGameId,
    lockTime: new Date(lockTimeMs).toISOString(),
    manualLock: false,
    games,
    createdAt: new Date().toISOString(),
    lastUpdated: null,
  };
  dataStore.saveWeek(weekNumber, week);
  const tb = games[games.length - 1];
  res.status(201).json({
    weekNumber,
    gameCount: games.length,
    lockTime: week.lockTime,
    tiebreakerGameId,
    tiebreakerGame: `${tb.awayTeam} @ ${tb.homeTeam}`,
  });
});

function generateTestGames(weekNumber, lockTimeMs) {
  const h = hours => new Date(lockTimeMs + hours * 3600000).toISOString();
  const raw = [
    // NCAAF — slot 1: 2h after lock
    { league:'NCAAF', away:'Michigan Wolverines',          home:'Ohio State Buckeyes',        fav:'Ohio State Buckeyes',        spread:-4,    ou:52.5, t:h(2)     },
    { league:'NCAAF', away:'Georgia Bulldogs',             home:'Alabama Crimson Tide',       fav:'Alabama Crimson Tide',       spread:-3.5,  ou:54,   t:h(2)     },
    { league:'NCAAF', away:'Oklahoma Sooners',             home:'Texas Longhorns',            fav:'Texas Longhorns',            spread:-6.5,  ou:58.5, t:h(2)     },
    // NCAAF — slot 2: 5.5h after lock
    { league:'NCAAF', away:'Notre Dame Fighting Irish',    home:'USC Trojans',                fav:'USC Trojans',                spread:-2.5,  ou:55.5, t:h(5.5)   },
    { league:'NCAAF', away:'Iowa Hawkeyes',                home:'Penn State Nittany Lions',   fav:'Penn State Nittany Lions',   spread:-9.5,  ou:41.5, t:h(5.5)   },
    { league:'NCAAF', away:'Florida State Seminoles',     home:'Clemson Tigers',             fav:'Clemson Tigers',             spread:-4.5,  ou:48.5, t:h(5.5)   },
    // NCAAF — slot 3: 9h after lock
    { league:'NCAAF', away:'Washington Huskies',           home:'Oregon Ducks',               fav:'Oregon Ducks',               spread:-5,    ou:53.5, t:h(9)     },
    { league:'NCAAF', away:'Mississippi State Bulldogs',   home:'LSU Tigers',                 fav:'LSU Tigers',                 spread:-12.5, ou:58.5, t:h(9)     },
    // NFL Sunday 1pm: 26h after lock
    { league:'NFL',   away:'Dallas Cowboys',               home:'Philadelphia Eagles',        fav:'Philadelphia Eagles',        spread:-3.5,  ou:47.5, t:h(26)    },
    { league:'NFL',   away:'Pittsburgh Steelers',          home:'Baltimore Ravens',           fav:'Baltimore Ravens',           spread:-4,    ou:43,   t:h(26)    },
    { league:'NFL',   away:'Miami Dolphins',               home:'Buffalo Bills',              fav:'Buffalo Bills',              spread:-6,    ou:49.5, t:h(26)    },
    { league:'NFL',   away:'Green Bay Packers',            home:'Chicago Bears',              fav:'Green Bay Packers',          spread:-5.5,  ou:44,   t:h(26)    },
    // NFL Sunday 4:25pm: 29.5h after lock
    { league:'NFL',   away:'Kansas City Chiefs',           home:'Los Angeles Chargers',       fav:'Kansas City Chiefs',         spread:-7,    ou:51.5, t:h(29.5)  },
    { league:'NFL',   away:'Los Angeles Rams',             home:'San Francisco 49ers',        fav:'San Francisco 49ers',        spread:-3.5,  ou:46.5, t:h(29.5)  },
    // NFL Sunday Night: 33.5h after lock
    { league:'NFL',   away:'Detroit Lions',                home:'Minnesota Vikings',          fav:'Detroit Lions',              spread:-2.5,  ou:50.5, t:h(33.5)  },
    // NFL Monday Night (tiebreaker — always last): 50.25h after lock
    { league:'NFL',   away:'Cincinnati Bengals',           home:'Cleveland Browns',           fav:'Cincinnati Bengals',         spread:-1,    ou:41.5, t:h(50.25) },
  ];
  return raw.map((g, i) => ({
    id: `tw${weekNumber}-${String(i + 1).padStart(2, '0')}`,
    league: g.league,
    awayTeam: g.away,
    homeTeam: g.home,
    favoredTeam: g.fav,
    spread: g.spread,
    overUnder: g.ou,
    commenceTime: g.t,
    status: 'scheduled',
    homeScore: null,
    awayScore: null,
  }));
}

module.exports = router;

const express = require('express');
const dataStore = require('../utils/dataStore');
const { isWeekLocked, isGameLocked } = require('../utils/locks');
const { adminOnly } = require('../middleware/adminOnly');

const router = express.Router();

// GET /api/picks/week/:n — current user's picks for a week
router.get('/week/:weekNumber', (req, res) => {
  const weekNumber = parseInt(req.params.weekNumber);
  const allPicks = dataStore.getWeekPicks(weekNumber);
  const userPicks = allPicks.find(p => p.userId === req.user.id);
  if (!userPicks) return res.json({ submitted: false });
  res.json({ submitted: true, ...userPicks });
});

// POST /api/picks/week/:n — submit picks (one-time, no editing)
router.post('/week/:weekNumber', (req, res) => {
  const weekNumber = parseInt(req.params.weekNumber);
  const week = dataStore.getWeek(weekNumber);

  if (!week) return res.status(404).json({ error: 'Week not found' });
  if (isWeekLocked(week)) return res.status(403).json({ error: 'Picks are locked for this week' });

  const allPicks = dataStore.getWeekPicks(weekNumber);
  if (allPicks.some(p => p.userId === req.user.id)) {
    return res.status(409).json({ error: 'Picks already submitted for this week' });
  }

  const { picks, tiebreakerScore } = req.body;

  if (!Array.isArray(picks) || picks.length !== 15) {
    return res.status(400).json({ error: 'Must submit exactly 15 picks' });
  }
  if (picks.filter(p => p.isKeyPick).length !== 1) {
    return res.status(400).json({ error: 'Must designate exactly 1 key pick' });
  }
  if (tiebreakerScore == null || isNaN(Number(tiebreakerScore))) {
    return res.status(400).json({ error: 'Tiebreaker score is required' });
  }

  const gameMap = Object.fromEntries(week.games.map(g => [g.id, g]));
  for (const pick of picks) {
    const game = gameMap[pick.gameId];
    if (!game) return res.status(400).json({ error: `Unknown game: ${pick.gameId}` });
    if (isGameLocked(game)) {
      return res.status(400).json({ error: `Game is locked: ${game.awayTeam} @ ${game.homeTeam}` });
    }
    if (pick.pickedTeam !== game.homeTeam && pick.pickedTeam !== game.awayTeam) {
      return res.status(400).json({ error: `Invalid team "${pick.pickedTeam}" for that game` });
    }
  }

  const record = {
    userId: req.user.id,
    submittedAt: new Date().toISOString(),
    tiebreakerScore: Number(tiebreakerScore),
    picks,
  };

  allPicks.push(record);
  dataStore.saveWeekPicks(weekNumber, allPicks);
  res.status(201).json({ submitted: true, ...record });
});

// GET /api/picks/week/:n/public — all picks, visible to every authenticated user
// once the pick deadline has passed (enforced server-side).
router.get('/week/:weekNumber/public', (req, res) => {
  const weekNumber = parseInt(req.params.weekNumber);
  const week = dataStore.getWeek(weekNumber);
  if (!week) return res.status(404).json({ error: 'Week not found' });

  const locked = week.manualLock || (week.lockTime && new Date(week.lockTime) <= new Date());
  if (!locked) return res.status(403).json({ error: 'Picks are not yet locked' });

  const allPicks = dataStore.getWeekPicks(weekNumber);
  const users = dataStore.getEffectiveUsers();
  const picksWithNames = allPicks.map(p => ({
    ...p,
    userName: users.find(u => u.id === p.userId)?.name || 'Unknown',
  }));

  res.json({
    weekNumber,
    tiebreakerGameId: week.tiebreakerGameId,
    games: week.games,
    picks: picksWithNames,
  });
});

// GET /api/picks/week/:n/all — admin: every user's picks
router.get('/week/:weekNumber/all', adminOnly, (req, res) => {
  const weekNumber = parseInt(req.params.weekNumber);
  const allPicks = dataStore.getWeekPicks(weekNumber);
  const users = dataStore.getEffectiveUsers();
  const withNames = allPicks.map(p => ({
    ...p,
    userName: users.find(u => u.id === p.userId)?.name || 'Unknown',
  }));
  res.json(withNames);
});

module.exports = router;

const express = require('express');
const axios = require('axios');
const dataStore = require('../utils/dataStore');
const { adminOnly } = require('../middleware/adminOnly');

const router = express.Router();
const BASE = 'https://api.the-odds-api.com/v4';

const ODDS_DISABLED = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'staging';

// Polls The Odds API scores endpoint and updates the current week JSON.
// Called by the cron job every 10 minutes and by the admin manual trigger.
async function pollAndUpdateScores() {
  if (ODDS_DISABLED) return { updated: false, reason: 'odds_api_disabled' };
  const weekNumbers = dataStore.getAllWeekNumbers();
  if (weekNumbers.length === 0) return { updated: false };

  const weekNumber = Math.max(...weekNumbers);
  const week = dataStore.getWeek(weekNumber);
  if (!week) return { updated: false };

  const hasActiveGames = week.games.some(g => g.status !== 'final');
  if (!hasActiveGames) return { updated: false, reason: 'all games final' };

  const sports = [...new Set(
    week.games.map(g => g.league === 'NCAAF' ? 'americanfootball_ncaaf' : 'americanfootball_nfl')
  )];

  let changed = false;

  for (const sport of sports) {
    const response = await axios.get(`${BASE}/sports/${sport}/scores`, {
      params: { apiKey: process.env.ODDS_API_KEY, daysFrom: 3 },
    });

    for (const scoreData of response.data) {
      const game = week.games.find(g => g.id === scoreData.id);
      if (!game) continue;

      if (scoreData.scores) {
        const homeEntry = scoreData.scores.find(s => s.name === game.homeTeam);
        const awayEntry = scoreData.scores.find(s => s.name === game.awayTeam);
        if (homeEntry) game.homeScore = parseFloat(homeEntry.score);
        if (awayEntry) game.awayScore = parseFloat(awayEntry.score);
      }

      const newStatus = scoreData.completed ? 'final' : (scoreData.scores ? 'in_progress' : game.status);
      if (newStatus !== game.status) { game.status = newStatus; changed = true; }
      else if (scoreData.scores) changed = true;
    }
  }

  week.lastUpdated = new Date().toISOString();
  dataStore.saveWeek(weekNumber, week);
  return { updated: changed, weekNumber };
}

// GET /api/scores/week/:n — scores for any week (used by frontend live updates)
router.get('/week/:weekNumber', (req, res) => {
  const weekNumber = parseInt(req.params.weekNumber);
  const week = dataStore.getWeek(weekNumber);
  if (!week) return res.status(404).json({ error: 'Week not found' });
  res.json({
    weekNumber: week.weekNumber,
    lastUpdated: week.lastUpdated || null,
    games: week.games.map(g => ({
      id: g.id,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      status: g.status,
    })),
  });
});

// POST /api/scores/poll — admin: trigger immediate score poll
router.post('/poll', adminOnly, async (req, res) => {
  try {
    const result = await pollAndUpdateScores();
    res.json(result);
  } catch (err) {
    console.error('Manual score poll error:', err.message);
    res.status(502).json({ error: 'Score poll failed', detail: err.message });
  }
});

module.exports = router;
module.exports.pollAndUpdateScores = pollAndUpdateScores;

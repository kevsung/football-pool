const express = require('express');
const { calculateWeeklyStandings, calculateSeasonStandings } = require('../utils/standings');
const dataStore = require('../utils/dataStore');

const router = express.Router();

// GET /api/standings/weekly/:n
router.get('/weekly/:weekNumber', (req, res) => {
  const weekNumber = parseInt(req.params.weekNumber);
  const week = dataStore.getWeek(weekNumber);
  if (!week) return res.status(404).json({ error: 'Week not found' });
  res.json({ weekNumber, standings: calculateWeeklyStandings(weekNumber) });
});

// GET /api/standings/season
router.get('/season', (req, res) => {
  res.json({ standings: calculateSeasonStandings() });
});

module.exports = router;

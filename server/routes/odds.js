const express = require('express');
const axios = require('axios');
const { adminOnly } = require('../middleware/adminOnly');

const router = express.Router();
const BASE = 'https://api.the-odds-api.com/v4';
const SPORTS = ['americanfootball_ncaaf', 'americanfootball_nfl'];

// GET /api/odds/available?sport=all|ncaaf|nfl  (admin only)
router.get('/available', adminOnly, async (req, res) => {
  const { sport = 'all' } = req.query;
  const toFetch = sport === 'nfl'
    ? ['americanfootball_nfl']
    : sport === 'ncaaf'
      ? ['americanfootball_ncaaf']
      : SPORTS;

  const results = [];
  let remaining = null;

  for (const sportKey of toFetch) {
    try {
      const response = await axios.get(`${BASE}/sports/${sportKey}/odds`, {
        params: {
          apiKey: process.env.ODDS_API_KEY,
          regions: 'us',
          markets: 'spreads,totals',
          oddsFormat: 'american',
        },
      });

      remaining = response.headers['x-requests-remaining'];

      for (const event of response.data) {
        if (!hasSpread(event)) continue;
        results.push(formatEvent(event, sportKey));
      }
    } catch (err) {
      console.error(`Odds API error [${sportKey}]:`, err.response?.data || err.message);
    }
  }

  results.sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));
  res.json({ games: results, requestsRemaining: remaining });
});

function hasSpread(event) {
  return event.bookmakers?.some(b => b.markets?.some(m => m.key === 'spreads'));
}

function formatEvent(event, sportKey) {
  const { spreadValue, favoredTeam } = extractSpread(event);
  const overUnder = extractOverUnder(event);

  return {
    id: event.id,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    league: sportKey === 'americanfootball_ncaaf' ? 'NCAAF' : 'NFL',
    commenceTime: event.commence_time,
    spread: spreadValue,
    favoredTeam,
    overUnder,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
  };
}

function extractSpread(event) {
  for (const book of event.bookmakers || []) {
    const market = book.markets?.find(m => m.key === 'spreads');
    if (!market) continue;
    const home = market.outcomes.find(o => o.name === event.home_team);
    const away = market.outcomes.find(o => o.name === event.away_team);
    if (!home || !away) continue;
    const favoredTeam = home.point <= away.point ? event.home_team : event.away_team;
    const spreadValue = home.point <= away.point ? home.point : away.point;
    return { spreadValue, favoredTeam };
  }
  return { spreadValue: 0, favoredTeam: event.home_team };
}

function extractOverUnder(event) {
  for (const book of event.bookmakers || []) {
    const market = book.markets?.find(m => m.key === 'totals');
    if (!market) continue;
    const over = market.outcomes.find(o => o.name === 'Over');
    if (over) return over.point;
  }
  return null;
}

module.exports = router;

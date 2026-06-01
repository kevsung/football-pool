const express = require('express');
const axios = require('axios');
const { adminOnly } = require('../middleware/adminOnly');
const { isFBSTeam } = require('../utils/fbsTeams');

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

  const { windowStart, windowEnd } = getWeekWindow();
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
        const commence = new Date(event.commence_time);

        // 1. Week window: Tuesday 12:00am ET → Monday 11:59pm ET
        if (commence < windowStart || commence > windowEnd) continue;

        // 2. NFL preseason: skip (sport key is americanfootball_nfl_preseason;
        //    we only fetch americanfootball_nfl so this is a belt-and-suspenders check)
        if (sportKey === 'americanfootball_nfl_preseason') continue;

        // 3. NCAAF: both teams must be FBS
        if (sportKey === 'americanfootball_ncaaf') {
          if (!isFBSTeam(event.home_team) || !isFBSTeam(event.away_team)) continue;
        }

        // 4. Both spread and total (over/under) must be available
        if (!hasSpread(event) || !hasTotal(event)) continue;

        results.push(formatEvent(event, sportKey));
      }
    } catch (err) {
      console.error(`Odds API error [${sportKey}]:`, err.response?.data || err.message);
    }
  }

  results.sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));
  res.json({ games: results, requestsRemaining: remaining, windowStart, windowEnd });
});

// ── Week window (Tue 12:00am ET → Mon 11:59pm ET) ─────────────────────────

function getWeekWindow() {
  const now = new Date();
  const year = now.getUTCFullYear();

  // DST: second Sunday in March 2:00am EST (7:00 UTC)
  //      through first Sunday in November 2:00am EDT (6:00 UTC)
  const march1 = new Date(Date.UTC(year, 2, 1));
  const firstSunMarch = march1.getUTCDay() === 0 ? 1 : 8 - march1.getUTCDay();
  const dstStart = new Date(Date.UTC(year, 2, firstSunMarch + 7, 7));

  const nov1 = new Date(Date.UTC(year, 10, 1));
  const firstSunNov = nov1.getUTCDay() === 0 ? 1 : 8 - nov1.getUTCDay();
  const dstEnd = new Date(Date.UTC(year, 10, firstSunNov, 6));

  // ET offset in ms (positive means ET is behind UTC)
  const etOffsetMs = (now >= dstStart && now < dstEnd) ? 4 * 3600000 : 5 * 3600000;

  // Express current time in ET by shifting into a "UTC-like" space where
  // getUTC* methods return ET values
  const etNowMs = now.getTime() - etOffsetMs;
  const etNow = new Date(etNowMs);

  // Day of week in ET (0=Sun, 1=Mon, 2=Tue, ...)
  const etDow = etNow.getUTCDay();
  const daysSinceTue = (etDow - 2 + 7) % 7;

  // Tuesday 00:00:00.000 ET (in the shifted space)
  const tuesdayEt = new Date(etNowMs - daysSinceTue * 86400000);
  tuesdayEt.setUTCHours(0, 0, 0, 0);

  // Monday 23:59:59.999 ET (6 days later)
  const mondayEt = new Date(tuesdayEt.getTime() + 6 * 86400000);
  mondayEt.setUTCHours(23, 59, 59, 999);

  // Shift back to real UTC
  return {
    windowStart: new Date(tuesdayEt.getTime() + etOffsetMs),
    windowEnd:   new Date(mondayEt.getTime() + etOffsetMs),
  };
}

// ── Market helpers ─────────────────────────────────────────────────────────

function hasSpread(event) {
  return event.bookmakers?.some(b => b.markets?.some(m => m.key === 'spreads'));
}

function hasTotal(event) {
  return event.bookmakers?.some(b => b.markets?.some(m => m.key === 'totals'));
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

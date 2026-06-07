const dataStore = require('./dataStore');
const { calculateUserWeekScore } = require('./scoring');

function getTiebreakerDiff(userPickSet, week) {
  const game = week.games.find(g => g.id === week.tiebreakerGameId);
  if (!game || game.homeScore == null || game.awayScore == null) return null;
  if (userPickSet.tiebreakerScore == null) return null;
  return Math.abs((game.homeScore + game.awayScore) - userPickSet.tiebreakerScore);
}

function assignRanks(standings, isTiedFn) {
  let rank = 1;
  for (let i = 0; i < standings.length; i++) {
    if (i > 0 && !isTiedFn(standings[i - 1], standings[i])) rank = i + 1;
    standings[i].rank = rank;
  }
}

function calculateWeeklyStandings(weekNumber) {
  const week = dataStore.getWeek(weekNumber);
  if (!week) return [];

  const allPicks = dataStore.getWeekPicks(weekNumber);
  const users = dataStore.getEffectiveUsers();
  const standings = [];

  for (const userPickSet of allPicks) {
    const user = users.find(u => u.id === userPickSet.userId);
    if (!user) continue;

    const { points, keyWins } = calculateUserWeekScore(userPickSet, week.games);
    const tiebreakerDiff = getTiebreakerDiff(userPickSet, week);

    standings.push({ userId: user.id, name: user.name, points, keyWins, tiebreakerDiff });
  }

  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.keyWins !== a.keyWins) return b.keyWins - a.keyWins;
    // Lower diff wins; null (game not final) goes last
    if (a.tiebreakerDiff === null && b.tiebreakerDiff === null) return 0;
    if (a.tiebreakerDiff === null) return 1;
    if (b.tiebreakerDiff === null) return -1;
    return a.tiebreakerDiff - b.tiebreakerDiff;
  });

  assignRanks(standings, (a, b) =>
    a.points === b.points &&
    a.keyWins === b.keyWins &&
    a.tiebreakerDiff === b.tiebreakerDiff
  );

  return standings;
}

function calculateSeasonStandings() {
  const weekNumbers = dataStore.getAllWeekNumbers();
  const users = dataStore.getEffectiveUsers();

  const stats = {};
  for (const user of users) {
    stats[user.id] = { userId: user.id, name: user.name, points: 0, keyWins: 0, tiebreakerDiffTotal: 0, tiebreakerWeeks: 0, weeksPlayed: 0 };
  }

  for (const weekNumber of weekNumbers) {
    const week = dataStore.getWeek(weekNumber);
    if (!week) continue;

    for (const userPickSet of dataStore.getWeekPicks(weekNumber)) {
      if (!stats[userPickSet.userId]) continue;
      const { points, keyWins } = calculateUserWeekScore(userPickSet, week.games);
      const diff = getTiebreakerDiff(userPickSet, week);

      stats[userPickSet.userId].points += points;
      stats[userPickSet.userId].keyWins += keyWins;
      if (diff !== null) {
        stats[userPickSet.userId].tiebreakerDiffTotal += diff;
        stats[userPickSet.userId].tiebreakerWeeks++;
      }
      stats[userPickSet.userId].weeksPlayed++;
    }
  }

  const standings = Object.values(stats).filter(s => s.weeksPlayed > 0);

  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.keyWins !== a.keyWins) return b.keyWins - a.keyWins;
    // Players with no tiebreaker weeks sort last; among those with weeks, lower total diff wins
    if (a.tiebreakerWeeks === 0 && b.tiebreakerWeeks === 0) return 0;
    if (a.tiebreakerWeeks === 0) return 1;
    if (b.tiebreakerWeeks === 0) return -1;
    return a.tiebreakerDiffTotal - b.tiebreakerDiffTotal;
  });

  assignRanks(standings, (a, b) =>
    a.points === b.points &&
    a.keyWins === b.keyWins &&
    a.tiebreakerWeeks === b.tiebreakerWeeks &&
    a.tiebreakerDiffTotal === b.tiebreakerDiffTotal
  );

  return standings;
}

module.exports = { calculateWeeklyStandings, calculateSeasonStandings };

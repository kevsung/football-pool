// Returns 'win' | 'push' | 'loss' | null (game not final)
function calculatePickResult(pick, game) {
  if (game.status !== 'final' || game.homeScore == null || game.awayScore == null) {
    return null;
  }

  const { homeTeam, favoredTeam, spread } = game;
  const favoredScore = favoredTeam === homeTeam ? game.homeScore : game.awayScore;
  const underdogScore = favoredTeam === homeTeam ? game.awayScore : game.homeScore;

  // spread is negative for the favored team (e.g. -7.5).
  // coverMargin > 0  → favored covered
  // coverMargin = 0  → push
  // coverMargin < 0  → underdog covered
  const coverMargin = (favoredScore - underdogScore) + spread;
  const pickedFavored = pick.pickedTeam === favoredTeam;

  if (coverMargin > 0) return pickedFavored ? 'win' : 'loss';
  if (coverMargin === 0) return 'push';
  return pickedFavored ? 'loss' : 'win';
}

function calculatePickPoints(result, isKeyPick) {
  if (result === 'win') return isKeyPick ? 2 : 1;
  if (result === 'push') return isKeyPick ? 1 : 0;
  return 0;
}

// Returns { points, keyWins }
function calculateUserWeekScore(userPickSet, games) {
  const gameMap = Object.fromEntries(games.map(g => [g.id, g]));
  let points = 0;
  let keyWins = 0;

  for (const pick of userPickSet.picks) {
    const game = gameMap[pick.gameId];
    if (!game) continue;
    const result = calculatePickResult(pick, game);
    points += calculatePickPoints(result, pick.isKeyPick);
    if (result === 'win' && pick.isKeyPick) keyWins++;
  }

  return { points, keyWins };
}

module.exports = { calculatePickResult, calculatePickPoints, calculateUserWeekScore };

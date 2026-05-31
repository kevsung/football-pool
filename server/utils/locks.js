const WARN_MS = 15 * 60 * 1000; // 15 minutes

function isGameLocked(game) {
  return new Date(game.commenceTime) <= new Date();
}

function isGameWarningSoon(game) {
  const diff = new Date(game.commenceTime) - new Date();
  return diff > 0 && diff <= WARN_MS;
}

// Returns 'locked' | 'warning' | 'open'
function getGameLockStatus(game) {
  if (isGameLocked(game)) return 'locked';
  if (isGameWarningSoon(game)) return 'warning';
  return 'open';
}

function isWeekLocked(week) {
  if (!week) return true;
  if (week.manualLock) return true;
  if (week.lockTime && new Date(week.lockTime) <= new Date()) return true;
  return false;
}

module.exports = { isGameLocked, isGameWarningSoon, getGameLockStatus, isWeekLocked };

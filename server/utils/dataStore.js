const fs = require('fs');
const path = require('path');

const DATA_DIR      = path.join(__dirname, '../../data');
const WEEKS_DIR     = path.join(DATA_DIR, 'weeks');
const PICKS_DIR     = path.join(DATA_DIR, 'picks');
const SEED_USERS_FILE = path.join(DATA_DIR, 'seed-users.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJSON(filePath) {
  try {
    const buf = fs.readFileSync(filePath); // read as Buffer to inspect BOM bytes first
    let str;
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
      // UTF-16 LE BOM (FF FE) — written by Notepad "Unicode" mode on Windows
      str = buf.slice(2).toString('utf16le');
    } else if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      // UTF-8 BOM (EF BB BF) — written by some Windows editors
      str = buf.slice(3).toString('utf8');
    } else {
      // Plain UTF-8 / ASCII — the only encoding writeJSON ever produces
      str = buf.toString('utf8');
    }
    const content = str.trim();
    return content ? JSON.parse(content) : null;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function writeJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function ensureDataFiles() {
  ensureDir(DATA_DIR);
  ensureDir(WEEKS_DIR);
  ensureDir(PICKS_DIR);
  const usersFile = path.join(DATA_DIR, 'users.json');
  if (!fs.existsSync(usersFile)) writeJSON(usersFile, []);
  const invitesFile = path.join(DATA_DIR, 'invites.json');
  if (!fs.existsSync(invitesFile)) writeJSON(invitesFile, []);
  const configFile = path.join(DATA_DIR, 'config.json');
  if (!fs.existsSync(configFile)) writeJSON(configFile, { poolName: 'Football Pool' });
}

function getConfig() {
  return readJSON(path.join(DATA_DIR, 'config.json')) || { poolName: 'Football Pool' };
}

function saveConfig(config) {
  writeJSON(path.join(DATA_DIR, 'config.json'), config);
}

function getUsers() {
  return readJSON(path.join(DATA_DIR, 'users.json')) || [];
}

function saveUsers(users) {
  writeJSON(path.join(DATA_DIR, 'users.json'), users);
}

// Returns real users merged with seed users when NODE_ENV=development.
// Use this for display and scoring (leaderboard, picks names).
// Auth and user-management routes use getUsers() to avoid writing seed
// users back into users.json.
function getEffectiveUsers() {
  const real = getUsers();
  if (process.env.NODE_ENV !== 'development') return real;

  let seed;
  try {
    seed = readJSON(SEED_USERS_FILE) || [];
  } catch (_) {
    // seed-users.json unreadable — proceed with real users only
    return real;
  }
  if (seed.length === 0) return real;

  const realIds = new Set(real.map(u => u.id));
  return [...real, ...seed.filter(u => !realIds.has(u.id))];
}

function getUserById(id) {
  return getEffectiveUsers().find(u => u.id === id) || null;
}

function getUserByGoogleId(googleId) {
  return getEffectiveUsers().find(u => u.googleId === googleId) || null;
}

function getInvites() {
  return readJSON(path.join(DATA_DIR, 'invites.json')) || [];
}

function saveInvites(invites) {
  writeJSON(path.join(DATA_DIR, 'invites.json'), invites);
}

function getInviteByToken(token) {
  return getInvites().find(i => i.token === token) || null;
}

function getWeek(weekNumber) {
  return readJSON(path.join(WEEKS_DIR, `week${weekNumber}.json`));
}

function saveWeek(weekNumber, weekData) {
  writeJSON(path.join(WEEKS_DIR, `week${weekNumber}.json`), weekData);
}

function getWeekPicks(weekNumber) {
  return readJSON(path.join(PICKS_DIR, `week${weekNumber}.json`)) || [];
}

function saveWeekPicks(weekNumber, picks) {
  writeJSON(path.join(PICKS_DIR, `week${weekNumber}.json`), picks);
}

function getAllWeekNumbers() {
  if (!fs.existsSync(WEEKS_DIR)) return [];
  return fs.readdirSync(WEEKS_DIR)
    .filter(f => /^week\d+\.json$/.test(f))
    .map(f => parseInt(f.match(/\d+/)[0]))
    .sort((a, b) => a - b);
}

function getCurrentWeekNumber() {
  const nums = getAllWeekNumbers();
  return nums.length > 0 ? Math.max(...nums) : null;
}

module.exports = {
  ensureDataFiles,
  getUsers, saveUsers, getEffectiveUsers, getUserById, getUserByGoogleId,
  getInvites, saveInvites, getInviteByToken,
  getWeek, saveWeek,
  getWeekPicks, saveWeekPicks,
  getAllWeekNumbers, getCurrentWeekNumber,
  getConfig, saveConfig,
};

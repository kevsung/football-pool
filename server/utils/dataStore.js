const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const WEEKS_DIR = path.join(DATA_DIR, 'weeks');
const PICKS_DIR = path.join(DATA_DIR, 'picks');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function getUserById(id) {
  return getUsers().find(u => u.id === id) || null;
}

function getUserByGoogleId(googleId) {
  return getUsers().find(u => u.googleId === googleId) || null;
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
  getUsers, saveUsers, getUserById, getUserByGoogleId,
  getInvites, saveInvites, getInviteByToken,
  getWeek, saveWeek,
  getWeekPicks, saveWeekPicks,
  getAllWeekNumbers, getCurrentWeekNumber,
  getConfig, saveConfig,
};

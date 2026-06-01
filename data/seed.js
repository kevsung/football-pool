#!/usr/bin/env node
/**
 * data/seed.js — Populate the app with 4 weeks of realistic fake data.
 *
 * Run:  node data/seed.js   (from project root)
 *  or:  npm run seed
 *
 * What this script writes
 * ───────────────────────
 *  data/seed-users.json  — 26 fake users (gitignored; never touches users.json)
 *  data/weeks/week*.json — week definitions
 *  data/picks/week*.json — pick submissions for every fake user
 *
 * What this script NEVER touches
 * ───────────────────────────────
 *  data/users.json   — real user accounts (managed by the app at runtime)
 *  data/invites.json — real invite tokens
 *
 * The app merges seed-users.json into the user list automatically when
 * NODE_ENV=development (see server/utils/dataStore.js → getEffectiveUsers).
 *
 * Week coverage
 * ─────────────
 *  Week 1 (Sep 6)  — 12 final, 4 in_progress, 14 scheduled  (lock: past)
 *  Week 2 (Sep 13) — 30 final                                (lock: past)
 *  Week 3 (Sep 20) — 25 final, 5 scheduled                   (lock: past)
 *  Week 4 (Sep 27) — 8 final, 7 in_progress, 15 scheduled   (lock: past)
 *  All 26 fake users have submitted picks for all 4 weeks.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR  = __dirname;
const WEEKS_DIR = path.join(DATA_DIR, 'weeks');
const PICKS_DIR = path.join(DATA_DIR, 'picks');

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function write(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  const rel = path.relative(path.join(DATA_DIR, '..'), file);
  console.log(`  ✔  ${rel}  (${Array.isArray(data) ? data.length + ' items' : 'object'})`);
}

// Deterministic LCG pseudo-random (Numerical Recipes constants)
function makeLCG(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0x100000000; };
}
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function underdogTeam(game) {
  return game.favoredTeam === game.homeTeam ? game.awayTeam : game.homeTeam;
}

// Score validation helper (mirrors server/utils/scoring.js)
function coverMargin(game) {
  if (game.status !== 'final' || game.homeScore == null) return null;
  const fav = game.favoredTeam === game.homeTeam ? game.homeScore : game.awayScore;
  const dog = game.favoredTeam === game.homeTeam ? game.awayScore : game.homeScore;
  return (fav - dog) + game.spread;
}

// ── Users ─────────────────────────────────────────────────────────────────────

const NAMES = [
  ['Sarah','Mitchell'],  ['Mike','Chen'],        ['Jake','Williams'],
  ['Priya','Patel'],     ['Tom','Harrison'],     ['Amanda','Rodriguez'],
  ['Chris',"O'Brien"],  ['Lauren','Kim'],        ['Dave','Thompson'],
  ['Rachel','Green'],    ['Marcus','Johnson'],   ['Emma','Davis'],
  ['Ryan','Murphy'],     ['Sofia','Martinez'],   ['Tyler','Brooks'],
  ['Megan','Walsh'],     ['Jordan','Lee'],       ['Ashley','Cooper'],
  ['Derek','Foster'],    ['Natalie','Brown'],    ['Matt','Sullivan'],
  ['Jasmine','Carter'],  ['Ben','Taylor'],       ['Nicole','Anderson'],
  ['Alex','Rivera'],
];

const users = [
  // Fake admin — no real credentials; allows testing admin features in dev
  {
    id:       uuidv4(),
    googleId: `fake-${uuidv4()}`,
    name:     'Test Admin',
    email:    'admin@example.com',
    role:     'admin',
    joinedAt: '2026-05-31T19:40:29.916Z',
  },
  ...NAMES.map(([first, last]) => ({
    id:       uuidv4(),
    googleId: `fake-${uuidv4()}`,
    name:     `${first} ${last}`,
    email:    `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
    role:     'user',
    joinedAt: '2026-05-31T20:00:00.000Z',
  })),
];

// ── Game factory ──────────────────────────────────────────────────────────────
// g(id, league, away, home, favored, spread, ou, time, status, awayScore, homeScore)

function g(id, league, away, home, favored, spread, ou, time, status, as = null, hs = null) {
  return { id, league, awayTeam: away, homeTeam: home, favoredTeam: favored,
           spread, overUnder: ou, commenceTime: time, status,
           awayScore: as, homeScore: hs };
}

// ══════════════════════════════════════════════════════════════════════════════
// WEEK 1 — Sep 6, 2025   lock: 2025-09-06T16:00:00Z
// 12 final · 4 in_progress · 14 scheduled
// ══════════════════════════════════════════════════════════════════════════════

const W1_GAMES = [
  // Wed
  g('w1-n01','NCAAF','Texas Longhorns','Arkansas Razorbacks','Texas Longhorns',-13.5,56.5,'2025-09-03T23:30:00Z','final',34,17),
  // Thu
  g('w1-n02','NCAAF','Auburn Tigers','Mississippi State Bulldogs','Auburn Tigers',-4.5,45.5,'2025-09-04T23:30:00Z','final',28,21),
  g('w1-f01','NFL','Buffalo Bills','Kansas City Chiefs','Kansas City Chiefs',-5.5,52.5,'2025-09-05T00:15:00Z','final',24,27),
  // Fri
  g('w1-n03','NCAAF','LSU Tigers','Florida State Seminoles','LSU Tigers',-3.5,54.5,'2025-09-05T23:00:00Z','final',24,28),
  // Sat noon — final
  g('w1-n04','NCAAF','Alabama Crimson Tide','Michigan Wolverines','Alabama Crimson Tide',-4.5,51.5,'2025-09-06T16:00:00Z','final',31,24),
  g('w1-n05','NCAAF','Ohio State Buckeyes','Penn State Nittany Lions','Ohio State Buckeyes',-10.5,53.5,'2025-09-06T16:00:00Z','final',38,24),
  g('w1-n06','NCAAF','Notre Dame Fighting Irish','Texas A&M Aggies','Texas A&M Aggies',-4.5,49.5,'2025-09-06T16:00:00Z','final',21,24),
  g('w1-n07','NCAAF','Oklahoma Sooners','Baylor Bears','Oklahoma Sooners',-14.5,58.5,'2025-09-06T16:00:00Z','final',42,21),
  g('w1-n08','NCAAF','Miami Hurricanes','Florida Atlantic Owls','Miami Hurricanes',-20.5,62.5,'2025-09-06T16:00:00Z','final',38,10),
  g('w1-n09','NCAAF','Florida Gators','Kentucky Wildcats','Florida Gators',-3.5,46.5,'2025-09-06T16:00:00Z','final',17,20),
  g('w1-n10','NCAAF','Missouri Tigers','South Carolina Gamecocks','Missouri Tigers',-6.5,50.5,'2025-09-06T16:00:00Z','final',35,14),
  g('w1-n11','NCAAF','Georgia Bulldogs','Clemson Tigers','Georgia Bulldogs',-3.5,48.5,'2025-09-06T16:00:00Z','final',21,14),
  // Sat 3:30 — in_progress
  g('w1-n12','NCAAF','Tennessee Volunteers','NC State Wolfpack','Tennessee Volunteers',-7.5,52.5,'2025-09-06T19:30:00Z','in_progress',21,14),
  g('w1-n13','NCAAF','Minnesota Golden Gophers','Iowa Hawkeyes','Iowa Hawkeyes',-3.5,40.5,'2025-09-06T19:30:00Z','in_progress',7,10),
  g('w1-n14','NCAAF','North Carolina Tar Heels','Virginia Tech Hokies','North Carolina Tar Heels',-6.5,56.5,'2025-09-06T19:30:00Z','in_progress',17,21),
  g('w1-f02','NFL','San Francisco 49ers','Cincinnati Bengals','San Francisco 49ers',-6.5,49.5,'2025-09-07T17:00:00Z','in_progress',17,14),
  // Sat night — scheduled
  g('w1-n15','NCAAF','Utah Utes','BYU Cougars','Utah Utes',-3.5,47.5,'2025-09-07T00:00:00Z','scheduled'),
  g('w1-n16','NCAAF','Ole Miss Rebels','Vanderbilt Commodores','Ole Miss Rebels',-17.5,61.5,'2025-09-07T00:00:00Z','scheduled'),
  g('w1-n17','NCAAF','Kansas State Wildcats','Colorado Buffaloes','Kansas State Wildcats',-2.5,53.5,'2025-09-07T00:30:00Z','scheduled'),
  g('w1-n18','NCAAF','Oregon Ducks','UCLA Bruins','Oregon Ducks',-13.5,60.5,'2025-09-07T02:00:00Z','scheduled'),
  // Sun — scheduled
  g('w1-f03','NFL','Miami Dolphins','New York Jets','Miami Dolphins',-1.5,44.5,'2025-09-07T17:00:00Z','scheduled'),
  g('w1-f04','NFL','Green Bay Packers','Pittsburgh Steelers','Green Bay Packers',-3.5,43.5,'2025-09-07T17:00:00Z','scheduled'),
  g('w1-f05','NFL','Los Angeles Rams','Detroit Lions','Detroit Lions',-4.5,51.5,'2025-09-07T17:00:00Z','scheduled'),
  g('w1-f06','NFL','Jacksonville Jaguars','Chicago Bears','Chicago Bears',-3.5,44.5,'2025-09-07T17:00:00Z','scheduled'),
  g('w1-f07','NFL','Atlanta Falcons','Carolina Panthers','Atlanta Falcons',-6.5,43.5,'2025-09-07T17:00:00Z','scheduled'),
  g('w1-f08','NFL','Minnesota Vikings','Houston Texans','Houston Texans',-4.5,46.5,'2025-09-07T17:00:00Z','scheduled'),
  g('w1-f09','NFL','Baltimore Ravens','Denver Broncos','Baltimore Ravens',-7.5,45.5,'2025-09-07T20:25:00Z','scheduled'),
  g('w1-f10','NFL','Seattle Seahawks','Los Angeles Chargers','Los Angeles Chargers',-2.5,46.5,'2025-09-07T20:25:00Z','scheduled'),
  g('w1-f11','NFL','Dallas Cowboys','Philadelphia Eagles','Philadelphia Eagles',-3.5,47.5,'2025-09-08T00:20:00Z','scheduled'),
  // MNF tiebreaker
  g('w1-f12','NFL','New Orleans Saints','Tampa Bay Buccaneers','Tampa Bay Buccaneers',-4.5,45.5,'2025-09-09T00:15:00Z','scheduled'),
];

// ══════════════════════════════════════════════════════════════════════════════
// WEEK 2 — Sep 13, 2025   lock: 2025-09-13T16:00:00Z
// All 30 games final
// ══════════════════════════════════════════════════════════════════════════════

const W2_GAMES = [
  g('w2-n01','NCAAF','Alabama Crimson Tide','Texas Longhorns','Alabama Crimson Tide',-3.5,55.5,'2025-09-13T16:00:00Z','final',28,24),
  g('w2-n02','NCAAF','Georgia Bulldogs','South Carolina Gamecocks','Georgia Bulldogs',-17.5,52.5,'2025-09-13T16:00:00Z','final',38,14),
  g('w2-n03','NCAAF','Ohio State Buckeyes','Marshall Thundering Herd','Ohio State Buckeyes',-28.5,61.5,'2025-09-13T16:00:00Z','final',52,14),
  g('w2-n04','NCAAF','Michigan Wolverines','Arkansas Razorbacks','Michigan Wolverines',-10.5,49.5,'2025-09-13T16:00:00Z','final',35,14),
  g('w2-n05','NCAAF','Tennessee Volunteers','NC State Wolfpack','Tennessee Volunteers',-10.5,57.5,'2025-09-13T16:00:00Z','final',41,17),
  g('w2-n06','NCAAF','Oregon Ducks','Boise State Broncos','Oregon Ducks',-14.5,58.5,'2025-09-13T16:00:00Z','final',42,21),
  g('w2-n07','NCAAF','Notre Dame Fighting Irish','Indiana Hoosiers','Notre Dame Fighting Irish',-17.5,52.5,'2025-09-13T16:00:00Z','final',35,10),
  g('w2-n08','NCAAF','Oklahoma Sooners','Arkansas State Red Wolves','Oklahoma Sooners',-31.5,62.5,'2025-09-13T16:00:00Z','final',56,14),
  g('w2-n09','NCAAF','LSU Tigers','Georgia Southern Eagles','LSU Tigers',-24.5,58.5,'2025-09-13T16:00:00Z','final',42,14),
  g('w2-n10','NCAAF','Utah Utes','Utah State Aggies','Utah Utes',-14.5,51.5,'2025-09-13T16:00:00Z','final',31,14),
  g('w2-n11','NCAAF','Penn State Nittany Lions','West Virginia Mountaineers','Penn State Nittany Lions',-14.5,47.5,'2025-09-13T19:30:00Z','final',28,10),
  g('w2-n12','NCAAF','Texas A&M Aggies','Florida Gators','Texas A&M Aggies',-7.5,50.5,'2025-09-13T19:30:00Z','final',24,17),
  g('w2-n13','NCAAF','Ole Miss Rebels','Tulsa Golden Hurricane','Ole Miss Rebels',-21.5,63.5,'2025-09-13T19:30:00Z','final',42,14),
  g('w2-n14','NCAAF','Missouri Tigers','Boston College Eagles','Missouri Tigers',-13.5,50.5,'2025-09-13T19:30:00Z','final',38,17),
  g('w2-n15','NCAAF','Clemson Tigers','Appalachian State Mountaineers','Clemson Tigers',-20.5,52.5,'2025-09-13T19:30:00Z','final',35,10),
  g('w2-n16','NCAAF','USC Trojans','San Jose State Spartans','USC Trojans',-21.5,65.5,'2025-09-14T00:00:00Z','final',49,24),
  g('w2-n17','NCAAF','Kansas State Wildcats','Arizona State Sun Devils','Kansas State Wildcats',-4.5,52.5,'2025-09-14T00:00:00Z','final',27,24),
  g('w2-n18','NCAAF','Florida State Seminoles','Memphis Tigers','Florida State Seminoles',-13.5,59.5,'2025-09-14T00:30:00Z','final',35,17),
  g('w2-f01','NFL','Kansas City Chiefs','Los Angeles Chargers','Kansas City Chiefs',-7.5,50.5,'2025-09-14T17:00:00Z','final',27,17),
  g('w2-f02','NFL','Philadelphia Eagles','Atlanta Falcons','Philadelphia Eagles',-5.5,47.5,'2025-09-14T17:00:00Z','final',24,14),
  g('w2-f03','NFL','Buffalo Bills','Miami Dolphins','Buffalo Bills',-3.5,46.5,'2025-09-14T17:00:00Z','final',17,10),
  g('w2-f04','NFL','Detroit Lions','Green Bay Packers','Detroit Lions',-2.5,49.5,'2025-09-14T17:00:00Z','final',27,20),
  g('w2-f05','NFL','Cincinnati Bengals','Pittsburgh Steelers','Cincinnati Bengals',-3.5,43.5,'2025-09-14T17:00:00Z','final',24,17),
  g('w2-f06','NFL','Chicago Bears','Indianapolis Colts','Chicago Bears',-3.5,43.5,'2025-09-14T17:00:00Z','final',21,14),
  g('w2-f07','NFL','Houston Texans','Jacksonville Jaguars','Houston Texans',-4.5,44.5,'2025-09-14T17:00:00Z','final',24,10),
  g('w2-f08','NFL','Los Angeles Rams','Arizona Cardinals','Los Angeles Rams',-6.5,47.5,'2025-09-14T20:25:00Z','final',31,17),
  g('w2-f09','NFL','San Francisco 49ers','Minnesota Vikings','San Francisco 49ers',-3.5,49.5,'2025-09-14T20:25:00Z','final',21,17),
  g('w2-f10','NFL','Dallas Cowboys','New York Giants','Dallas Cowboys',-6.5,44.5,'2025-09-15T00:20:00Z','final',28,10),
  g('w2-f11','NFL','Baltimore Ravens','New England Patriots','Baltimore Ravens',-7.5,45.5,'2025-09-15T00:20:00Z','final',24,17),
  // MNF tiebreaker
  g('w2-f12','NFL','Tampa Bay Buccaneers','Carolina Panthers','Tampa Bay Buccaneers',-7.5,41.5,'2025-09-16T00:15:00Z','final',28,14),
];

// ══════════════════════════════════════════════════════════════════════════════
// WEEK 3 — Sep 20, 2025   lock: 2025-09-20T16:00:00Z
// 25 final · 5 scheduled
// ══════════════════════════════════════════════════════════════════════════════

const W3_GAMES = [
  g('w3-n01','NCAAF','Georgia Bulldogs','Alabama Crimson Tide','Georgia Bulldogs',-3.5,55.5,'2025-09-20T16:00:00Z','final',24,21),
  g('w3-n02','NCAAF','Michigan Wolverines','Ohio State Buckeyes','Ohio State Buckeyes',-4.5,52.5,'2025-09-20T16:00:00Z','final',24,31),
  g('w3-n03','NCAAF','Penn State Nittany Lions','Illinois Fighting Illini','Penn State Nittany Lions',-17.5,47.5,'2025-09-20T16:00:00Z','final',35,14),
  g('w3-n04','NCAAF','Texas Longhorns','UTEP Miners','Texas Longhorns',-35.5,65.5,'2025-09-20T16:00:00Z','final',56,14),
  g('w3-n05','NCAAF','Tennessee Volunteers','Florida Gators','Tennessee Volunteers',-7.5,52.5,'2025-09-20T16:00:00Z','final',31,17),
  g('w3-n06','NCAAF','LSU Tigers','Missouri Tigers','LSU Tigers',-3.5,52.5,'2025-09-20T16:00:00Z','final',28,21),
  g('w3-n07','NCAAF','Oregon Ducks','UCLA Bruins','Oregon Ducks',-14.5,61.5,'2025-09-20T16:00:00Z','final',42,24),
  g('w3-n08','NCAAF','Oklahoma Sooners','Texas A&M Aggies','Oklahoma Sooners',-3.5,51.5,'2025-09-20T16:00:00Z','final',24,21),
  g('w3-n09','NCAAF','Notre Dame Fighting Irish','Georgia Tech Yellow Jackets','Notre Dame Fighting Irish',-21.5,52.5,'2025-09-20T16:00:00Z','final',42,10),
  g('w3-n10','NCAAF','Clemson Tigers','NC State Wolfpack','Clemson Tigers',-10.5,48.5,'2025-09-20T16:00:00Z','final',28,14),
  g('w3-n11','NCAAF','North Carolina Tar Heels','Virginia Cavaliers','North Carolina Tar Heels',-13.5,56.5,'2025-09-20T19:30:00Z','final',35,17),
  g('w3-n12','NCAAF','Iowa Hawkeyes','Wisconsin Badgers','Iowa Hawkeyes',-3.5,40.5,'2025-09-20T19:30:00Z','final',20,17),
  g('w3-n13','NCAAF','Ole Miss Rebels','Kentucky Wildcats','Ole Miss Rebels',-10.5,57.5,'2025-09-20T19:30:00Z','final',35,21),
  g('w3-n14','NCAAF','Florida State Seminoles','Syracuse Orange','Florida State Seminoles',-7.5,51.5,'2025-09-20T19:30:00Z','final',28,21),
  g('w3-n15','NCAAF','USC Trojans','Arizona Wildcats','USC Trojans',-14.5,62.5,'2025-09-20T19:30:00Z','final',42,17),
  g('w3-n16','NCAAF','Utah Utes','BYU Cougars','Utah Utes',-7.5,48.5,'2025-09-21T00:00:00Z','final',24,14),
  g('w3-n17','NCAAF','Kansas State Wildcats','Colorado Buffaloes','Kansas State Wildcats',-6.5,51.5,'2025-09-21T00:30:00Z','final',31,24),
  g('w3-n18','NCAAF','Miami Hurricanes','Virginia Tech Hokies','Miami Hurricanes',-10.5,54.5,'2025-09-21T00:00:00Z','final',35,21),
  g('w3-f01','NFL','Kansas City Chiefs','Baltimore Ravens','Kansas City Chiefs',-2.5,51.5,'2025-09-21T17:00:00Z','final',24,20),
  g('w3-f02','NFL','Philadelphia Eagles','Washington Commanders','Philadelphia Eagles',-7.5,47.5,'2025-09-21T17:00:00Z','final',31,14),
  g('w3-f03','NFL','Detroit Lions','Minnesota Vikings','Detroit Lions',-3.5,47.5,'2025-09-21T17:00:00Z','final',27,17),
  g('w3-f04','NFL','Buffalo Bills','New England Patriots','Buffalo Bills',-14.5,42.5,'2025-09-21T17:00:00Z','final',24,10),
  g('w3-f05','NFL','Cincinnati Bengals','Cleveland Browns','Cincinnati Bengals',-6.5,44.5,'2025-09-21T17:00:00Z','final',28,17),
  g('w3-f06','NFL','San Francisco 49ers','Los Angeles Rams','San Francisco 49ers',-4.5,49.5,'2025-09-21T20:25:00Z','final',21,17),
  g('w3-f07','NFL','Dallas Cowboys','Chicago Bears','Dallas Cowboys',-6.5,43.5,'2025-09-21T20:25:00Z','final',24,17),
  // 5 scheduled
  g('w3-f08','NFL','Green Bay Packers','Seattle Seahawks','Green Bay Packers',-3.5,46.5,'2025-09-22T00:20:00Z','scheduled'),
  g('w3-f09','NFL','Houston Texans','Tennessee Titans','Houston Texans',-4.5,44.5,'2025-09-21T17:00:00Z','scheduled'),
  g('w3-f10','NFL','Los Angeles Chargers','Denver Broncos','Los Angeles Chargers',-3.5,46.5,'2025-09-21T17:00:00Z','scheduled'),
  g('w3-f11','NFL','Atlanta Falcons','New Orleans Saints','Atlanta Falcons',-2.5,43.5,'2025-09-21T17:00:00Z','scheduled'),
  // MNF tiebreaker
  g('w3-f12','NFL','Pittsburgh Steelers','Indianapolis Colts','Pittsburgh Steelers',-3.5,43.5,'2025-09-23T00:15:00Z','scheduled'),
];

// ══════════════════════════════════════════════════════════════════════════════
// WEEK 4 — Sep 27, 2025   lock: 2025-09-27T16:00:00Z
// 8 final · 7 in_progress · 15 scheduled
// ══════════════════════════════════════════════════════════════════════════════

const W4_GAMES = [
  // Final
  g('w4-n01','NCAAF','Alabama Crimson Tide','Mississippi State Bulldogs','Alabama Crimson Tide',-21.5,56.5,'2025-09-27T16:00:00Z','final',42,14),
  g('w4-n02','NCAAF','Georgia Bulldogs','Auburn Tigers','Georgia Bulldogs',-14.5,52.5,'2025-09-27T16:00:00Z','final',28,10),
  g('w4-n03','NCAAF','Ohio State Buckeyes','Rutgers Scarlet Knights','Ohio State Buckeyes',-28.5,59.5,'2025-09-27T16:00:00Z','final',52,21),
  g('w4-n04','NCAAF','Texas Longhorns','Oklahoma State Cowboys','Texas Longhorns',-10.5,54.5,'2025-09-27T16:00:00Z','final',35,21),
  g('w4-n05','NCAAF','LSU Tigers','South Carolina Gamecocks','LSU Tigers',-13.5,55.5,'2025-09-27T16:00:00Z','final',38,17),
  g('w4-f01','NFL','Kansas City Chiefs','New York Jets','Kansas City Chiefs',-10.5,46.5,'2025-09-28T17:00:00Z','final',27,14),
  g('w4-f02','NFL','Philadelphia Eagles','Tampa Bay Buccaneers','Philadelphia Eagles',-6.5,46.5,'2025-09-28T17:00:00Z','final',24,17),
  g('w4-n06','NCAAF','Penn State Nittany Lions','Indiana Hoosiers','Penn State Nittany Lions',-17.5,47.5,'2025-09-27T16:00:00Z','final',35,10),
  // In progress
  g('w4-n07','NCAAF','Tennessee Volunteers','Missouri Tigers','Tennessee Volunteers',-3.5,52.5,'2025-09-27T19:30:00Z','in_progress',14,10),
  g('w4-n08','NCAAF','Oregon Ducks','Washington Huskies','Oregon Ducks',-7.5,59.5,'2025-09-27T19:30:00Z','in_progress',21,17),
  g('w4-n09','NCAAF','Notre Dame Fighting Irish','Clemson Tigers','Notre Dame Fighting Irish',-3.5,49.5,'2025-09-27T19:30:00Z','in_progress',10,14),
  g('w4-n10','NCAAF','Ole Miss Rebels','Vanderbilt Commodores','Ole Miss Rebels',-17.5,63.5,'2025-09-27T19:30:00Z','in_progress',28,7),
  g('w4-f03','NFL','Detroit Lions','Green Bay Packers','Detroit Lions',-3.5,48.5,'2025-09-28T17:00:00Z','in_progress',14,17),
  g('w4-f04','NFL','Buffalo Bills','New England Patriots','Buffalo Bills',-14.5,43.5,'2025-09-28T17:00:00Z','in_progress',21,7),
  g('w4-n11','NCAAF','Utah Utes','Arizona State Sun Devils','Utah Utes',-4.5,50.5,'2025-09-28T00:00:00Z','in_progress',17,10),
  // Scheduled
  g('w4-n12','NCAAF','Florida Gators','Kentucky Wildcats','Florida Gators',-6.5,47.5,'2025-09-27T16:00:00Z','scheduled'),
  g('w4-n13','NCAAF','USC Trojans','Stanford Cardinal','USC Trojans',-17.5,62.5,'2025-09-27T19:30:00Z','scheduled'),
  g('w4-n14','NCAAF','Kansas State Wildcats','TCU Horned Frogs','Kansas State Wildcats',-3.5,50.5,'2025-09-27T19:30:00Z','scheduled'),
  g('w4-n15','NCAAF','Iowa Hawkeyes','Michigan State Spartans','Iowa Hawkeyes',-3.5,41.5,'2025-09-27T19:30:00Z','scheduled'),
  g('w4-n16','NCAAF','North Carolina Tar Heels','Pittsburgh Panthers','North Carolina Tar Heels',-7.5,55.5,'2025-09-28T00:00:00Z','scheduled'),
  g('w4-n17','NCAAF','Florida State Seminoles','Louisville Cardinals','Florida State Seminoles',-6.5,52.5,'2025-09-28T00:00:00Z','scheduled'),
  g('w4-n18','NCAAF','Colorado Buffaloes','Arizona Wildcats','Colorado Buffaloes',-3.5,55.5,'2025-09-28T02:00:00Z','scheduled'),
  g('w4-f05','NFL','San Francisco 49ers','Arizona Cardinals','San Francisco 49ers',-7.5,48.5,'2025-09-28T17:00:00Z','scheduled'),
  g('w4-f06','NFL','Cincinnati Bengals','Indianapolis Colts','Cincinnati Bengals',-6.5,43.5,'2025-09-28T17:00:00Z','scheduled'),
  g('w4-f07','NFL','Baltimore Ravens','Cleveland Browns','Baltimore Ravens',-10.5,42.5,'2025-09-28T17:00:00Z','scheduled'),
  g('w4-f08','NFL','Minnesota Vikings','Seattle Seahawks','Minnesota Vikings',-3.5,46.5,'2025-09-28T20:25:00Z','scheduled'),
  g('w4-f09','NFL','Los Angeles Rams','Dallas Cowboys','Los Angeles Rams',-2.5,48.5,'2025-09-28T20:25:00Z','scheduled'),
  g('w4-f10','NFL','Chicago Bears','Carolina Panthers','Chicago Bears',-7.5,41.5,'2025-09-28T17:00:00Z','scheduled'),
  g('w4-f11','NFL','Atlanta Falcons','New Orleans Saints','Atlanta Falcons',-3.5,44.5,'2025-09-29T00:20:00Z','scheduled'),
  // MNF tiebreaker
  g('w4-f12','NFL','Houston Texans','Los Angeles Chargers','Los Angeles Chargers',-2.5,46.5,'2025-09-30T00:15:00Z','scheduled'),
];

// ── Weeks definition ──────────────────────────────────────────────────────────

const WEEKS = [
  { weekNumber: 1, season: 2025, lockTime: '2025-09-06T16:00:00Z', tiebreakerGameId: 'w1-f12', games: W1_GAMES },
  { weekNumber: 2, season: 2025, lockTime: '2025-09-13T16:00:00Z', tiebreakerGameId: 'w2-f12', games: W2_GAMES },
  { weekNumber: 3, season: 2025, lockTime: '2025-09-20T16:00:00Z', tiebreakerGameId: 'w3-f12', games: W3_GAMES },
  { weekNumber: 4, season: 2025, lockTime: '2025-09-27T16:00:00Z', tiebreakerGameId: 'w4-f12', games: W4_GAMES },
].map(w => ({ ...w, manualLock: false, createdAt: '2026-05-31T20:00:00Z', lastUpdated: '2026-05-31T20:00:00Z' }));

// ── Picks generation ──────────────────────────────────────────────────────────

function generateWeekPicks(weekDef, weekIndex) {
  const { games, weekNumber, tiebreakerGameId } = weekDef;
  const tbGame = games.find(g => g.id === tiebreakerGameId);
  const tbOU   = tbGame?.overUnder ?? 45;

  // Submission times: stagger across the two days before the lock
  const lockMs  = Date.parse(weekDef.lockTime);
  const baseMs  = lockMs - 26 * 60 * 60 * 1000;   // 26 hours before lock
  const gapMs   = 60 * 60 * 1000;                  // ~60 min apart (26 users fits in 26 hours)

  return users.map((user, userIndex) => {
    // Unique deterministic seed per user × week
    const rng = makeLCG(userIndex * 31337 + weekIndex * 7919 + 42);

    const selectedGames = shuffle(games, rng).slice(0, 15);
    const keyGame = [...selectedGames].sort((a, b) => Math.abs(b.spread) - Math.abs(a.spread))[0];

    const picks = selectedGames.map(game => {
      const pickedTeam = rng() < 0.65 ? game.favoredTeam : underdogTeam(game);
      return { gameId: game.id, pickedTeam, isKeyPick: game.id === keyGame.id };
    });

    const tiebreakerScore = Math.round(tbOU + (rng() * 20) - 10);
    const submittedAt     = new Date(baseMs + userIndex * gapMs).toISOString();

    return { userId: user.id, submittedAt, tiebreakerScore, picks };
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(picks, games, weekNum) {
  const gmap = Object.fromEntries(games.map(g => [g.id, g]));
  for (const ps of picks) {
    const user = users.find(u => u.id === ps.userId);
    if (ps.picks.length !== 15)
      throw new Error(`W${weekNum} ${user?.name}: ${ps.picks.length} picks (expected 15)`);
    if (ps.picks.filter(p => p.isKeyPick).length !== 1)
      throw new Error(`W${weekNum} ${user?.name}: wrong key pick count`);
    for (const pick of ps.picks) {
      const game = gmap[pick.gameId];
      if (!game) throw new Error(`W${weekNum}: unknown gameId ${pick.gameId}`);
      if (pick.pickedTeam !== game.homeTeam && pick.pickedTeam !== game.awayTeam)
        throw new Error(`W${weekNum}: "${pick.pickedTeam}" not in game ${pick.gameId}`);
    }
  }
}

// ── Write files ───────────────────────────────────────────────────────────────

ensureDir(WEEKS_DIR);
ensureDir(PICKS_DIR);

console.log('\n🌱  Seeding football-pool data (4 weeks)...\n');

write(path.join(DATA_DIR, 'seed-users.json'), users);

const allWeekPicks = [];
for (let i = 0; i < WEEKS.length; i++) {
  const week = WEEKS[i];
  const picks = generateWeekPicks(week, i + 1);
  validate(picks, week.games, week.weekNumber);
  write(path.join(WEEKS_DIR, `week${week.weekNumber}.json`), week);
  write(path.join(PICKS_DIR, `week${week.weekNumber}.json`), picks);
  allWeekPicks.push({ week, picks });
}

// ── Summary ───────────────────────────────────────────────────────────────────

// Mirror scoring for summary
function pickResult(pick, game) {
  if (game.status !== 'final' || game.homeScore == null) return null;
  const fav = game.favoredTeam === game.homeTeam ? game.homeScore : game.awayScore;
  const dog = game.favoredTeam === game.homeTeam ? game.awayScore : game.homeScore;
  const cm  = (fav - dog) + game.spread;
  const pf  = pick.pickedTeam === game.favoredTeam;
  if (cm > 0)  return pf ? 'win'  : 'loss';
  if (cm === 0) return 'push';
  return pf ? 'loss' : 'win';
}

function seasonScore(userId) {
  let pts = 0;
  for (const { week, picks } of allWeekPicks) {
    const gmap = Object.fromEntries(week.games.map(g => [g.id, g]));
    const ps   = picks.find(p => p.userId === userId);
    if (!ps) continue;
    for (const pick of ps.picks) {
      const g = gmap[pick.gameId];
      if (!g) continue;
      const r = pickResult(pick, g);
      if (r === 'win')  pts += pick.isKeyPick ? 2 : 1;
      if (r === 'push' && pick.isKeyPick) pts += 1;
    }
  }
  return pts;
}

const leaderboard = users
  .map(u => ({ name: u.name, pts: seasonScore(u.id) }))
  .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));

const finalCounts = WEEKS.map(w => ({
  w: w.weekNumber,
  final: w.games.filter(g => g.status === 'final').length,
  live:  w.games.filter(g => g.status === 'in_progress').length,
  sched: w.games.filter(g => g.status === 'scheduled').length,
}));

console.log(`
✅  Seed complete.

  seed-users.json : ${users.length} fake users  (1 fake admin + ${users.length - 1} members)
  Weeks           : ${WEEKS.length}

⚠️  data/users.json and data/invites.json were NOT modified.
  Fake users are written to data/seed-users.json (gitignored).
  Start the server with NODE_ENV=development to merge them in.
`);

finalCounts.forEach(({ w, final: f, live: l, sched: s }) =>
  console.log(`           Week ${w} — ${f} final, ${l} live, ${s} scheduled`));

console.log(`\n  Season standings (points from completed games only)\n  ─────────────────────────────────────────────────`);
leaderboard.forEach((r, i) =>
  console.log(`  ${String(i + 1).padStart(2)}. ${r.name.padEnd(22)} ${String(r.pts).padStart(4)} pts`));
console.log('');

/* ── all-picks.js — post-lock public picks matrix ──────────────────────── */

let weekNumber   = null;
let currentUser  = null;
let weekData     = null;  // { games, picks, tiebreakerGameId }

async function api(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 401) { location.href = '/login'; return null; }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Scoring (mirrors server/utils/scoring.js) ──────────────────────────────

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

function userScore(pickSet, games) {
  const gmap = Object.fromEntries(games.map(g => [g.id, g]));
  let pts = 0;
  for (const pick of pickSet.picks) {
    const g = gmap[pick.gameId];
    if (!g) continue;
    const r = pickResult(pick, g);
    if (r === 'win')  pts += pick.isKeyPick ? 2 : 1;
    if (r === 'push' && pick.isKeyPick) pts += 1;
  }
  return pts;
}

function tiebreakerDiff(pickSet, games, tiebreakerGameId) {
  const tbGame = games.find(g => g.id === tiebreakerGameId);
  if (!tbGame || tbGame.homeScore == null || tbGame.awayScore == null) return null;
  if (pickSet.tiebreakerScore == null) return null;
  return Math.abs((tbGame.homeScore + tbGame.awayScore) - pickSet.tiebreakerScore);
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  try {
    const config = await api('/api/config');
    if (!config) return;

    currentUser = config.user;
    weekNumber  = config.weekNumber;
    document.getElementById('user-name').textContent = config.user.name;
    applyPoolName(config.poolName);
    if (config.user.role === 'admin') document.getElementById('admin-link').style.display = '';

    document.getElementById('loading').style.display = 'none';

    if (!config.weekLocked || !weekNumber) {
      document.getElementById('not-locked').style.display = '';
      return;
    }

    document.getElementById('page-title').textContent = `Week ${weekNumber} — All Picks`;

    const data = await api(`/api/picks/week/${weekNumber}/public`);
    if (!data) return;
    weekData = data;

    if (!data.picks.length) {
      document.getElementById('no-picks').style.display = '';
      return;
    }

    renderTable();
    scheduleScoreRefresh();
  } catch (err) {
    document.getElementById('loading').textContent = `Error: ${err.message}`;
  }
}

// ── Table rendering ────────────────────────────────────────────────────────

function renderTable() {
  const { games, picks, tiebreakerGameId } = weekData;

  const pickedGameIds = new Set(picks.flatMap(ps => ps.picks.map(p => p.gameId)));
  const cols = games
    .filter(g => pickedGameIds.has(g.id))
    .sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));

  const rows = [...picks].sort((a, b) => {
    const diff = userScore(b, games) - userScore(a, games);
    return diff !== 0 ? diff : a.userName.localeCompare(b.userName);
  });

  renderHeader(cols, tiebreakerGameId);
  renderBody(rows, cols, games, tiebreakerGameId);

  document.getElementById('last-updated').textContent =
    `Updated ${new Date().toLocaleTimeString()}`;
  document.getElementById('table-wrap').style.display = '';
}

function gameScoreLabel(game) {
  if (game.status === 'in_progress' && game.homeScore != null) {
    return `<span class="ap-score-live">${game.awayScore}–${game.homeScore}</span>`;
  }
  if (game.status === 'final' && game.homeScore != null) {
    return `<span class="ap-score-final">F: ${game.awayScore}–${game.homeScore}</span>`;
  }
  const dt = new Date(game.commenceTime);
  const label = dt.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return `<span class="ap-score-sched">${label}</span>`;
}

function renderHeader(cols, tiebreakerGameId) {
  const head = document.getElementById('table-head');
  const tr = document.createElement('tr');

  const nameTh = document.createElement('th');
  nameTh.className = 'ap-name-col';
  nameTh.scope = 'col';
  nameTh.textContent = 'Player';
  tr.appendChild(nameTh);

  for (const game of cols) {
    const th = document.createElement('th');
    th.className = 'ap-game-header';
    th.scope = 'col';
    th.dataset.gameId = game.id;

    const awayAbbr = teamAbbr(game.awayTeam);
    const homeAbbr = teamAbbr(game.homeTeam);
    const isTb = game.id === tiebreakerGameId;
    const spreadStr = game.spread > 0 ? `+${game.spread}` : `${game.spread}`;

    th.innerHTML = `
      <span class="ap-matchup">${awayAbbr}${isTb ? '★' : ''} @${homeAbbr}</span>
      <span class="ap-spread-line">${game.favoredTeam ? `${teamAbbr(game.favoredTeam)} ${spreadStr}` : '—'}</span>
      ${gameScoreLabel(game)}
    `;
    tr.appendChild(th);
  }

  // Extra columns
  const tbTh = document.createElement('th');
  tbTh.className = 'ap-game-header ap-extra-col';
  tbTh.scope = 'col';
  tbTh.innerHTML = '<span class="ap-matchup">TB</span><span class="ap-spread-line">Pred.</span>';
  tr.appendChild(tbTh);

  const tbDiffTh = document.createElement('th');
  tbDiffTh.className = 'ap-game-header ap-extra-col';
  tbDiffTh.scope = 'col';
  tbDiffTh.innerHTML = '<span class="ap-matchup">TB</span><span class="ap-spread-line">Diff</span>';
  tr.appendChild(tbDiffTh);

  const ptsTh = document.createElement('th');
  ptsTh.className = 'ap-game-header ap-extra-col';
  ptsTh.scope = 'col';
  ptsTh.innerHTML = '<span class="ap-matchup">Total</span><span class="ap-spread-line">Pts</span>';
  tr.appendChild(ptsTh);

  head.innerHTML = '';
  head.appendChild(tr);
}

function renderBody(rows, cols, games, tiebreakerGameId) {
  const gmap = Object.fromEntries(games.map(g => [g.id, g]));
  const colIds = cols.map(g => g.id);
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  for (const pickSet of rows) {
    const isSelf = pickSet.userId === currentUser?.id;
    const pickMap = Object.fromEntries(pickSet.picks.map(p => [p.gameId, p]));

    const tr = document.createElement('tr');
    if (isSelf) tr.classList.add('ap-self');

    const nameTd = document.createElement('td');
    nameTd.className = 'ap-name-col';
    nameTd.textContent = isSelf ? `${pickSet.userName} ↑` : pickSet.userName;
    nameTd.title = isSelf ? 'You' : '';
    tr.appendChild(nameTd);

    for (const gameId of colIds) {
      const td = document.createElement('td');
      td.className = 'ap-pick-cell';
      const pick = pickMap[gameId];
      const game = gmap[gameId];

      if (!pick) {
        td.innerHTML = '<span class="ap-empty">—</span>';
      } else {
        const abbr   = teamAbbr(pick.pickedTeam);
        const result = game ? pickResult(pick, game) : null;
        const cls    = [
          pick.isKeyPick ? 'ap-key' : '',
          result === 'win'  ? 'ap-win'  : '',
          result === 'loss' ? 'ap-loss' : '',
          result === 'push' ? 'ap-push' : '',
        ].filter(Boolean).join(' ');
        td.className += ' ' + cls;
        td.textContent = abbr;
        td.setAttribute('aria-label',
          `${pick.pickedTeam}${pick.isKeyPick ? ' (key pick)' : ''}${result ? ' — ' + result : ''}`);
      }
      tr.appendChild(td);
    }

    // TB prediction
    const tbTd = document.createElement('td');
    tbTd.className = 'ap-pick-cell ap-extra-col';
    tbTd.textContent = pickSet.tiebreakerScore != null ? pickSet.tiebreakerScore : '—';
    tr.appendChild(tbTd);

    // TB diff
    const diff = tiebreakerDiff(pickSet, games, tiebreakerGameId);
    const diffTd = document.createElement('td');
    diffTd.className = 'ap-pick-cell ap-extra-col';
    diffTd.textContent = diff != null ? diff : '—';
    tr.appendChild(diffTd);

    // Total points
    const pts = userScore(pickSet, games);
    const ptsTd = document.createElement('td');
    ptsTd.className = 'ap-pick-cell ap-extra-col ap-pts-col';
    ptsTd.textContent = pts;
    tr.appendChild(ptsTd);

    tbody.appendChild(tr);
  }
}

// ── Live score refresh ─────────────────────────────────────────────────────

function scheduleScoreRefresh() {
  setTimeout(async () => {
    try {
      const scores = await api(`/api/scores/week/${weekNumber}`);
      if (!scores || !weekData) return;

      const gmap = Object.fromEntries(weekData.games.map(g => [g.id, g]));
      let changed = false;
      for (const s of scores.games) {
        const g = gmap[s.id];
        if (g && (g.homeScore !== s.homeScore || g.awayScore !== s.awayScore || g.status !== s.status)) {
          g.homeScore = s.homeScore;
          g.awayScore = s.awayScore;
          g.status    = s.status;
          changed = true;
        }
      }
      if (changed) renderTable();
      else document.getElementById('last-updated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (_) {}
    scheduleScoreRefresh();
  }, 60_000);
}

// ── DOMContentLoaded ───────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('signout-btn').addEventListener('click', () => {
    location.href = '/auth/logout';
  });
  init();
});

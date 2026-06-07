/* ── leaderboard.js — standings page logic ─────────────────────────────── */

let currentView = 'weekly';
let currentWeek = null;
let availableWeeks = [];
let currentUser = null;
let weekPicksCache = {};   // weekNumber → public picks data

async function api(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
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
    const [config, weeks] = await Promise.all([
      api('/api/config'),
      api('/api/weeks'),
    ]);
    if (!config) return;

    currentUser = config.user;
    document.getElementById('user-name').textContent = config.user.name;
    applyPoolName(config.poolName);
    if (config.user.role === 'admin') {
      document.getElementById('admin-link').style.display = '';
    }

    availableWeeks = weeks || [];
    const rawCurrentWeek = config.weekNumber;

    // Default to previous week unless current week is fully locked (past Sat noon)
    if (config.weekLocked || !rawCurrentWeek) {
      currentWeek = rawCurrentWeek;
    } else {
      const prevIdx = availableWeeks.indexOf(rawCurrentWeek) - 1;
      currentWeek = prevIdx >= 0 ? availableWeeks[prevIdx] : rawCurrentWeek;
    }

    buildWeekSelector();
    document.getElementById('loading').style.display = 'none';
    loadStandings();
  } catch (err) {
    document.getElementById('loading').textContent = `Error: ${err.message}`;
  }
}

function buildWeekSelector() {
  const sel = document.getElementById('week-select');
  sel.innerHTML = '';
  availableWeeks.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = `Week ${n}`;
    if (n === currentWeek) opt.selected = true;
    sel.appendChild(opt);
  });
  // Show immediately since weekly is the default view
  sel.style.display = '';
  sel.addEventListener('change', () => {
    currentWeek = parseInt(sel.value);
    loadStandings();
  });
}

// ── Load & render ──────────────────────────────────────────────────────────

async function loadStandings() {
  document.getElementById('standings-wrap').style.display = 'none';
  document.getElementById('empty').style.display = 'none';
  document.getElementById('loading').style.display = 'block';

  try {
    if (currentView === 'season') {
      const data = await api('/api/standings/season');
      if (!data) return;
      renderSeasonStandings(data.standings || []);
    } else {
      if (!currentWeek) { showEmpty(); return; }
      await loadWeeklyView(currentWeek);
    }
  } catch (err) {
    document.getElementById('loading').textContent = `Error: ${err.message}`;
  }
}

async function loadWeeklyView(weekNumber) {
  // Try to load public picks (only available when week is locked)
  let picksData = weekPicksCache[weekNumber];
  if (!picksData) {
    try {
      picksData = await api(`/api/picks/week/${weekNumber}/public`);
      if (picksData) weekPicksCache[weekNumber] = picksData;
    } catch (_) {
      picksData = null;
    }
  }

  if (!picksData || !picksData.picks || !picksData.picks.length) {
    // Fall back to basic standings table if picks not available
    const data = await api(`/api/standings/weekly/${weekNumber}`);
    if (!data) return;
    renderSeasonStandings(data.standings || [], false);
    return;
  }

  renderWeeklyMatrix(picksData);
}

// ── Weekly game matrix (like All Picks) ────────────────────────────────────

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

function renderWeeklyMatrix(data) {
  document.getElementById('loading').style.display = 'none';

  const { games, picks, tiebreakerGameId } = data;

  if (!picks.length) { showEmpty(); return; }

  const pickedGameIds = new Set(picks.flatMap(ps => ps.picks.map(p => p.gameId)));
  const cols = games
    .filter(g => pickedGameIds.has(g.id))
    .sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));

  const rows = [...picks].sort((a, b) => {
    const diff = userScore(b, games) - userScore(a, games);
    return diff !== 0 ? diff : a.userName.localeCompare(b.userName);
  });

  // Switch to matrix layout
  const wrap = document.getElementById('standings-wrap');
  wrap.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'card';
  card.style.cssText = 'padding:0;overflow:hidden';

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'all-picks-wrap';

  const table = document.createElement('table');
  table.className = 'all-picks-table';
  table.setAttribute('aria-label', 'Weekly picks matrix');

  // Header row
  const thead = document.createElement('thead');
  const headTr = document.createElement('tr');

  const nameTh = document.createElement('th');
  nameTh.className = 'ap-name-col';
  nameTh.scope = 'col';
  nameTh.textContent = 'Player';
  headTr.appendChild(nameTh);

  for (const game of cols) {
    const th = document.createElement('th');
    th.className = 'ap-game-header';
    th.scope = 'col';
    const awayAbbr = teamAbbr(game.awayTeam);
    const homeAbbr = teamAbbr(game.homeTeam);
    const isTb = game.id === tiebreakerGameId;
    const spreadStr = game.spread > 0 ? `+${game.spread}` : `${game.spread}`;
    th.innerHTML = `
      <span class="ap-matchup">${awayAbbr}${isTb ? '★' : ''} @${homeAbbr}</span>
      <span class="ap-spread-line">${game.favoredTeam ? `${teamAbbr(game.favoredTeam)} ${spreadStr}` : '—'}</span>
      ${gameScoreLabel(game)}
    `;
    headTr.appendChild(th);
  }

  // Extra columns
  [['TB', 'Pred.'], ['TB', 'Diff'], ['Total', 'Pts']].forEach(([top, bot]) => {
    const th = document.createElement('th');
    th.className = 'ap-game-header ap-extra-col';
    th.scope = 'col';
    th.innerHTML = `<span class="ap-matchup">${top}</span><span class="ap-spread-line">${bot}</span>`;
    headTr.appendChild(th);
  });

  thead.appendChild(headTr);
  table.appendChild(thead);

  // Body rows
  const tbody = document.createElement('tbody');
  const gmap = Object.fromEntries(games.map(g => [g.id, g]));
  const colIds = cols.map(g => g.id);

  for (const pickSet of rows) {
    const isSelf = pickSet.userId === currentUser?.id;
    const pickMap = Object.fromEntries(pickSet.picks.map(p => [p.gameId, p]));

    const tr = document.createElement('tr');
    if (isSelf) tr.classList.add('ap-self');

    const nameTd = document.createElement('td');
    nameTd.className = 'ap-name-col';
    nameTd.textContent = isSelf ? `${pickSet.userName} ↑` : pickSet.userName;
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
    const ptsTd = document.createElement('td');
    ptsTd.className = 'ap-pick-cell ap-extra-col ap-pts-col';
    ptsTd.textContent = userScore(pickSet, games);
    tr.appendChild(ptsTd);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  scrollWrap.appendChild(table);
  card.appendChild(scrollWrap);
  wrap.appendChild(card);

  const legend = document.createElement('p');
  legend.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem';
  legend.innerHTML = '★ = key pick &nbsp;·&nbsp; Scores update live every 60 seconds';
  wrap.appendChild(legend);

  document.getElementById('last-updated').textContent =
    `${picks.length} player${picks.length !== 1 ? 's' : ''}`;
  wrap.style.display = '';
}

// ── Season / fallback standings table ──────────────────────────────────────

function renderSeasonStandings(standings, isSeason = true) {
  document.getElementById('loading').style.display = 'none';

  if (!standings.length) { showEmpty(); return; }

  const wrap = document.getElementById('standings-wrap');
  wrap.innerHTML = `
    <div class="card">
      <div class="table-wrap">
        <table id="standings-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Name</th>
              <th scope="col" style="text-align:right">Pts</th>
              <th scope="col" style="text-align:right">Key W</th>
              <th scope="col" style="text-align:right">${isSeason ? 'TB Total' : 'TB Diff'}</th>
            </tr>
          </thead>
          <tbody id="standings-body"></tbody>
        </table>
      </div>
    </div>
  `;

  const tbody = document.getElementById('standings-body');

  standings.forEach((row, i) => {
    const tied = i > 0 && standings[i - 1].rank === row.rank;
    const isSelf = row.userId === currentUser?.id;
    const rankClass = row.rank === 1 ? 'rank-1' : row.rank === 2 ? 'rank-2' : row.rank === 3 ? 'rank-3' : '';

    const tbVal = isSeason
      ? (row.tiebreakerDiffTotal != null ? row.tiebreakerDiffTotal : '—')
      : (row.tiebreakerDiff != null ? row.tiebreakerDiff : '—');

    const tr = document.createElement('tr');
    if (isSelf) tr.style.background = 'rgba(63,185,80,.05)';
    const rankTd = document.createElement('td');
    rankTd.className = `rank-cell ${rankClass}`;
    rankTd.textContent = row.rank;
    if (tied) {
      const t = document.createElement('span');
      t.className = 'tied-marker';
      t.textContent = 'T';
      rankTd.appendChild(t);
    }

    const nameTd = document.createElement('td');
    nameTd.style.fontWeight = isSelf ? '600' : '400';
    nameTd.textContent = row.name;
    if (isSelf) {
      const you = document.createElement('span');
      you.style.cssText = 'color:var(--text-muted);font-size:0.75rem';
      you.textContent = ' (you)';
      nameTd.appendChild(you);
    }

    const pointsTd = document.createElement('td');
    pointsTd.style.cssText = 'text-align:right;font-weight:700';
    pointsTd.textContent = row.points;

    const keyWinsTd = document.createElement('td');
    keyWinsTd.style.textAlign = 'right';
    keyWinsTd.textContent = row.keyWins;

    const tbTd = document.createElement('td');
    tbTd.style.cssText = 'text-align:right;color:var(--text-muted)';
    tbTd.textContent = tbVal;

    tr.appendChild(rankTd);
    tr.appendChild(nameTd);
    tr.appendChild(pointsTd);
    tr.appendChild(keyWinsTd);
    tr.appendChild(tbTd);
    tbody.appendChild(tr);
  });

  document.getElementById('last-updated').textContent =
    `${standings.length} player${standings.length !== 1 ? 's' : ''}`;
  wrap.style.display = '';
}

function showEmpty() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('empty').style.display = '';
}

function switchView(view) {
  currentView = view;
  ['weekly', 'season'].forEach(v => {
    const btn = document.getElementById(`btn-${v}`);
    const isActive = v === view;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });
  document.getElementById('week-select').style.display = view === 'weekly' ? '' : 'none';
  loadStandings();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('signout-btn').addEventListener('click', () => {
    location.href = '/auth/logout';
  });
  document.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  init();
});

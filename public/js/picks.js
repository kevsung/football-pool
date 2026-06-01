/* ── picks.js — weekly pick'em page logic ──────────────────────────────── */

let state = {
  weekNumber:      null,
  week:            null,
  currentUser:     null,
  submitted:       false,
  submittedPicks:  null,
  selections:      {},      // gameId → pickedTeam
  keyPickId:       null,
  tiebreakerScore: null,
  weekLocked:      false,
};

async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' }, ...opts });
  if (res.status === 401) { location.href = '/login'; return null; }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function init() {
  try {
    const config = await api('/api/config');
    if (!config) return;

    state.currentUser = config.user;
    document.getElementById('user-name').textContent = config.user.name;
    applyPoolName(config.poolName);
    if (config.user.role === 'admin') document.getElementById('admin-link').style.display = '';

    state.weekNumber = config.weekNumber;
    document.getElementById('loading').style.display = 'none';

    if (!state.weekNumber) {
      document.getElementById('no-week').style.display = '';
      return;
    }

    const [week, picksData] = await Promise.all([
      api(`/api/weeks/${state.weekNumber}`),
      api(`/api/picks/week/${state.weekNumber}`),
    ]);

    state.week = week;
    state.weekLocked = isWeekLocked(week);

    if (picksData.submitted) {
      state.submitted = true;
      state.submittedPicks = picksData;
    }

    render();
    startCountdown();
    if (hasActiveGames(week)) scheduleScoreRefresh();
  } catch (err) {
    document.getElementById('loading').textContent = `Error: ${err.message}`;
  }
}

// ── Lock helpers ───────────────────────────────────────────────────────────

function isWeekLocked(week) {
  return !!(week.manualLock || (week.lockTime && new Date(week.lockTime) <= new Date()));
}

function isGameLocked(game) {
  return new Date(game.commenceTime) <= new Date();
}

function isGameWarningSoon(game) {
  const diff = new Date(game.commenceTime) - new Date();
  return diff > 0 && diff <= 15 * 60 * 1000;
}

function hasActiveGames(week) {
  return week.games.some(g => g.status === 'in_progress');
}

// ── Scoring ────────────────────────────────────────────────────────────────

function getPickResult(pick, game) {
  if (game.status !== 'final' || game.homeScore == null) return null;
  const favScore = game.favoredTeam === game.homeTeam ? game.homeScore : game.awayScore;
  const dogScore = game.favoredTeam === game.homeTeam ? game.awayScore : game.homeScore;
  const cm = (favScore - dogScore) + game.spread;
  const pf = pick.pickedTeam === game.favoredTeam;
  if (cm > 0)  return pf ? 'win'  : 'loss';
  if (cm === 0) return 'push';
  return pf ? 'loss' : 'win';
}

// ── Top-level render dispatcher ────────────────────────────────────────────

function render() {
  const { week, submitted, weekLocked } = state;
  document.getElementById('week-title').textContent = `Week ${week.weekNumber} — My Picks`;

  if (submitted && weekLocked) {
    showLockedPicksView();
  } else if (weekLocked && !submitted) {
    document.getElementById('pick-content').style.display = '';
    document.getElementById('lock-alert').style.display = '';
    document.getElementById('pick-counter').style.display = 'none';
    document.getElementById('tiebreaker-section').style.display = 'none';
    document.getElementById('submit-row').style.display = 'none';
    document.getElementById('games-table-wrap').style.display = 'none';
  } else {
    document.getElementById('pick-content').style.display = '';
    wireTiebreakerInput();
    renderGamesTable();
    updateCounters();
  }
}

// ── Day-grouped helpers ────────────────────────────────────────────────────

function groupGamesByDay(games) {
  const groups = new Map();
  for (const game of games) {
    const dt = new Date(game.commenceTime);
    const key = dt.toLocaleDateString('en-CA'); // YYYY-MM-DD in local tz
    if (!groups.has(key)) groups.set(key, { date: dt, games: [] });
    groups.get(key).games.push(game);
  }
  for (const group of groups.values()) {
    group.games.sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

function formatDayHeader(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Spread label helpers ───────────────────────────────────────────────────

function spreadLabel(game, team) {
  if (game.spread == null) return '';
  const side = game.favoredTeam === team ? game.spread : -game.spread;
  return ` ${side > 0 ? '+' : ''}${side}`;
}

function recordStr(game, team) {
  const rec = team === game.awayTeam ? game.awayRecord : game.homeRecord;
  return rec ? ` (${rec})` : '';
}

// ── Open pick form — single table, day-divider rows ────────────────────────

function renderGamesTable() {
  const wrap = document.getElementById('games-table-wrap');
  wrap.innerHTML = '';
  wrap.style.display = '';

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'picks-table-wrap';

  const table = document.createElement('table');
  table.className = 'picks-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th class="picks-th-team">Away</th>
      <th class="picks-th-team">Home</th>
      <th class="picks-th-key">Key Pick</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  for (const group of groupGamesByDay(state.week.games)) {
    const dayTr = document.createElement('tr');
    dayTr.className = 'picks-day-row';
    const dayTd = document.createElement('td');
    dayTd.colSpan = 3;
    dayTd.textContent = formatDayHeader(group.date);
    dayTr.appendChild(dayTd);
    tbody.appendChild(dayTr);

    for (const game of group.games) {
      tbody.appendChild(buildGameRow(game));
    }
  }

  table.appendChild(tbody);
  scrollWrap.appendChild(table);
  wrap.appendChild(scrollWrap);
}

function buildGameRow(game) {
  const { weekLocked, selections, keyPickId } = state;
  const gameLocked    = isGameLocked(game);
  const gameWarning   = isGameWarningSoon(game);
  const effectiveLock = weekLocked || gameLocked;

  const pickedTeam = selections[game.id] || null;
  const isKeyPick  = keyPickId === game.id;
  const isTb       = game.id === state.week.tiebreakerGameId;

  const awayLabel = `${game.awayTeam}${recordStr(game, game.awayTeam)}${spreadLabel(game, game.awayTeam)}`;
  const homeLabel = `${game.homeTeam}${recordStr(game, game.homeTeam)}${spreadLabel(game, game.homeTeam)}`;
  const awayPicked = pickedTeam === game.awayTeam;
  const homePicked = pickedTeam === game.homeTeam;

  const tr = document.createElement('tr');
  tr.className = ['picks-row', gameWarning && !effectiveLock ? 'picks-row-warning' : ''].filter(Boolean).join(' ');
  tr.dataset.gameId = game.id;

  // Away cell
  const awayTd = document.createElement('td');
  awayTd.className = 'picks-td-team';
  const awayBtn = document.createElement('button');
  awayBtn.className = 'picks-team-btn' + (awayPicked ? ' picked' : '');
  awayBtn.textContent = awayLabel;
  awayBtn.disabled = effectiveLock;
  awayBtn.setAttribute('aria-pressed', String(awayPicked));
  awayTd.appendChild(awayBtn);
  if (isTb) {
    const tb = document.createElement('span');
    tb.className = 'tiebreaker-badge picks-inline-badge';
    tb.textContent = 'TB';
    awayTd.appendChild(tb);
  }
  if (gameWarning && !effectiveLock) {
    const warn = document.createElement('span');
    warn.className = 'picks-warn-badge';
    warn.textContent = '⚠';
    awayTd.appendChild(warn);
  }

  // Home cell
  const homeTd = document.createElement('td');
  homeTd.className = 'picks-td-team';
  const homeBtn = document.createElement('button');
  homeBtn.className = 'picks-team-btn' + (homePicked ? ' picked' : '');
  homeBtn.textContent = homeLabel;
  homeBtn.disabled = effectiveLock;
  homeBtn.setAttribute('aria-pressed', String(homePicked));
  homeTd.appendChild(homeBtn);

  // Key pick cell
  const keyTd = document.createElement('td');
  keyTd.className = 'picks-td-key';
  const keyCheck = document.createElement('input');
  keyCheck.type = 'checkbox';
  keyCheck.className = 'picks-key-check';
  keyCheck.checked = isKeyPick;
  keyCheck.disabled = !pickedTeam || effectiveLock;
  keyCheck.setAttribute('aria-label', 'Set as key pick');
  keyTd.appendChild(keyCheck);

  tr.appendChild(awayTd);
  tr.appendChild(homeTd);
  tr.appendChild(keyTd);

  if (!effectiveLock) {
    awayBtn.addEventListener('click', () => selectTeam(game.id, game.awayTeam));
    homeBtn.addEventListener('click', () => selectTeam(game.id, game.homeTeam));
    keyCheck.addEventListener('change', () => toggleKeyPick(game.id, keyCheck.checked));
  }

  return tr;
}

// ── Locked picks table view ────────────────────────────────────────────────

function showLockedPicksView() {
  document.getElementById('pick-content').style.display = 'none';

  const { week, submittedPicks } = state;
  const view = document.getElementById('locked-picks-view');
  view.innerHTML = '';

  const tbGame = week.games.find(g => g.id === week.tiebreakerGameId);

  // Header
  const header = document.createElement('div');
  header.className = 'week-header';
  header.innerHTML = `
    <h1 id="week-title" style="font-size:1.4rem;font-weight:700">Week ${week.weekNumber} — My Picks</h1>
    <div class="lock-countdown" id="countdown-wrap">
      Pick Status: <span class="time" id="countdown">LOCKED</span>
    </div>
  `;
  view.appendChild(header);

  // Submitted banner
  const banner = document.createElement('div');
  banner.className = 'submitted-banner';
  banner.setAttribute('role', 'status');
  const submittedDate = new Date(submittedPicks.submittedAt).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  banner.textContent = `✅ Picks submitted ${submittedDate}`;
  view.appendChild(banner);

  // Tiebreaker prediction
  if (tbGame) {
    const tbActual = tbGame.homeScore != null && tbGame.awayScore != null
      ? tbGame.homeScore + tbGame.awayScore : null;
    const tbDiv = document.createElement('div');
    tbDiv.className = 'tb-prediction';
    tbDiv.innerHTML = `
      <span class="tb-label">Tiebreaker prediction</span>
      <span class="tb-score">${submittedPicks.tiebreakerScore} pts</span>
      <span class="tb-game">${tbGame.awayTeam} @ ${tbGame.homeTeam} (O/U ${tbGame.overUnder})</span>
      ${tbActual !== null ? `<span class="tb-actual">Actual combined: ${tbActual}</span>` : ''}
    `;
    view.appendChild(tbDiv);
  }

  // Single table with day-divider rows
  const pickMap = Object.fromEntries(submittedPicks.picks.map(p => [p.gameId, p]));
  const gamesInOrder = week.games
    .filter(g => pickMap[g.id])
    .sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));
  const dayGroups = groupGamesByDay(gamesInOrder);

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'picks-table-wrap';

  const table = document.createElement('table');
  table.className = 'picks-table picks-table-locked';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th class="picks-th-team">Away</th>
      <th class="picks-th-team">Home</th>
      <th class="picks-th-key">Key Pick</th>
      <th class="picks-th-result">Result</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  for (const group of dayGroups) {
    const dayTr = document.createElement('tr');
    dayTr.className = 'picks-day-row';
    const dayTd = document.createElement('td');
    dayTd.colSpan = 4;
    dayTd.textContent = formatDayHeader(group.date);
    dayTr.appendChild(dayTd);
    tbody.appendChild(dayTr);

    for (const game of group.games) {
      const pick = pickMap[game.id];
      if (!pick) continue;

      const result     = getPickResult(pick, game);
      const resultCls  = result === 'win' ? 'result-win' : result === 'push' ? 'result-push' : result === 'loss' ? 'result-loss' : '';
      const awayPicked = pick.pickedTeam === game.awayTeam;
      const homePicked = pick.pickedTeam === game.homeTeam;
      const awayLabel  = `${game.awayTeam}${recordStr(game, game.awayTeam)}${spreadLabel(game, game.awayTeam)}`;
      const homeLabel  = `${game.homeTeam}${recordStr(game, game.homeTeam)}${spreadLabel(game, game.homeTeam)}`;

      const tr = document.createElement('tr');
      tr.className = 'picks-row';

      const awayTd = document.createElement('td');
      awayTd.className = 'picks-td-team';
      const awaySpan = document.createElement('span');
      awaySpan.className = 'picks-team-label' + (awayPicked ? ' picked' : '');
      awaySpan.textContent = awayLabel;
      awayTd.appendChild(awaySpan);

      const homeTd = document.createElement('td');
      homeTd.className = 'picks-td-team';
      const homeSpan = document.createElement('span');
      homeSpan.className = 'picks-team-label' + (homePicked ? ' picked' : '');
      homeSpan.textContent = homeLabel;
      homeTd.appendChild(homeSpan);

      const keyTd = document.createElement('td');
      keyTd.className = 'picks-td-key';
      if (pick.isKeyPick) {
        const star = document.createElement('span');
        star.className = 'pi-key-star';
        star.textContent = '⭐';
        keyTd.appendChild(star);
      }

      const resultTd = document.createElement('td');
      resultTd.className = 'picks-td-result';
      const resultInner = document.createElement('div');
      resultInner.className = 'picks-result-inner';
      if (game.homeScore != null) {
        const score = document.createElement('span');
        score.className = 'pi-score';
        score.textContent = `${game.awayScore}–${game.homeScore}`;
        resultInner.appendChild(score);
      } else if (game.status === 'in_progress') {
        const live = document.createElement('span');
        live.className = 'pi-status live';
        live.textContent = 'LIVE';
        resultInner.appendChild(live);
      }
      if (result) {
        const badge = document.createElement('span');
        badge.className = `team-result ${resultCls}`;
        badge.textContent = result.toUpperCase();
        resultInner.appendChild(badge);
      }
      resultTd.appendChild(resultInner);

      tr.appendChild(awayTd);
      tr.appendChild(homeTd);
      tr.appendChild(keyTd);
      tr.appendChild(resultTd);
      tbody.appendChild(tr);
    }
  }

  table.appendChild(tbody);
  scrollWrap.appendChild(table);
  view.appendChild(scrollWrap);
  view.style.display = '';
}

// ── Interaction ────────────────────────────────────────────────────────────

function selectTeam(gameId, team) {
  if (state.selections[gameId] === team) {
    delete state.selections[gameId];
    if (state.keyPickId === gameId) state.keyPickId = null;
  } else {
    state.selections[gameId] = team;
  }
  updateCounters();
  refreshRow(gameId);
}

function toggleKeyPick(gameId, checked) {
  if (!state.selections[gameId]) return;
  if (checked && state.keyPickId && state.keyPickId !== gameId) {
    const prev = state.keyPickId;
    state.keyPickId = gameId;
    refreshRow(prev);
  } else {
    state.keyPickId = checked ? gameId : null;
  }
  updateCounters();
  refreshRow(gameId);
}

function refreshRow(gameId) {
  const game = state.week.games.find(g => g.id === gameId);
  if (!game) return;
  const old = document.querySelector(`tr[data-game-id="${gameId}"]`);
  if (old) old.replaceWith(buildGameRow(game));
}

function wireTiebreakerInput() {
  const { week } = state;
  const tbGame = week.games.find(g => g.id === week.tiebreakerGameId);
  if (tbGame) {
    document.getElementById('tb-game-label').textContent = `${tbGame.awayTeam} @ ${tbGame.homeTeam}`;
  }

  const input = document.getElementById('tiebreaker-input');
  if (!input.dataset.wired) {
    input.addEventListener('input', () => {
      state.tiebreakerScore = input.value !== '' ? parseInt(input.value) : null;
      updateCounters();
    });
    input.dataset.wired = '1';
  }
}

function updateCounters() {
  const pickCount = Object.keys(state.selections).length;
  const hasKey = !!state.keyPickId;
  const hasTb  = state.tiebreakerScore !== null && state.tiebreakerScore !== '';

  const set = (id, text, complete) => {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = `counter-value ${complete ? 'complete' : 'incomplete'}`;
  };

  set('cnt-picks', `${pickCount} / 15`, pickCount === 15);
  set('cnt-key', hasKey
    ? (state.week.games.find(g => g.id === state.keyPickId)?.homeTeam.split(' ').pop() || 'Set')
    : 'None', hasKey);
  set('cnt-tb', hasTb ? state.tiebreakerScore : '—', hasTb);

  const btn = document.getElementById('submit-btn');
  if (btn) {
    const ready = pickCount === 15 && hasKey && hasTb;
    btn.disabled = !ready;
    btn.setAttribute('aria-disabled', String(!ready));
  }
}

// ── Submission ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('signout-btn').addEventListener('click', () => {
    location.href = '/auth/logout';
  });
  const btn = document.getElementById('submit-btn');
  if (btn) btn.addEventListener('click', submitPicks);
});

async function submitPicks() {
  const picks = Object.entries(state.selections).map(([gameId, pickedTeam]) => ({
    gameId, pickedTeam, isKeyPick: gameId === state.keyPickId,
  }));

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const result = await api(`/api/picks/week/${state.weekNumber}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ picks, tiebreakerScore: state.tiebreakerScore }),
    });
    if (!result) return;
    state.submitted = true;
    state.submittedPicks = result;
    state.weekLocked = true;
    render();
  } catch (err) {
    alert(`Submission failed: ${err.message}`);
    btn.disabled = false;
    btn.textContent = 'Submit Picks';
  }
}

// ── Countdown timer ────────────────────────────────────────────────────────

function startCountdown() {
  const lockTime = state.week?.lockTime ? new Date(state.week.lockTime) : null;
  const wrap = document.getElementById('countdown-wrap');
  if (!lockTime) { if (wrap) wrap.style.display = 'none'; return; }

  function tick() {
    const diff = lockTime - new Date();
    const el = document.getElementById('countdown');
    if (!el) return;
    if (diff <= 0) { el.textContent = 'LOCKED'; state.weekLocked = true; return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
    setTimeout(tick, 1000);
  }
  tick();
}

// ── Live score refresh ─────────────────────────────────────────────────────

function scheduleScoreRefresh() {
  setTimeout(async () => {
    try {
      const scores = await api(`/api/scores/week/${state.weekNumber}`);
      if (!scores) return;
      scores.games.forEach(s => {
        const game = state.week.games.find(g => g.id === s.id);
        if (game) { game.homeScore = s.homeScore; game.awayScore = s.awayScore; game.status = s.status; }
      });
      if (state.submitted && state.weekLocked) {
        showLockedPicksView();
      } else {
        renderGamesTable();
      }
      if (hasActiveGames(state.week)) scheduleScoreRefresh();
    } catch (_) {
      scheduleScoreRefresh();
    }
  }, 60_000);
}

init();

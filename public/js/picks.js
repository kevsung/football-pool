/* ── picks.js — weekly pick'em page logic ──────────────────────────────── */

let state = {
  weekNumber: null,
  week: null,
  currentUser: null,
  submitted: false,
  submittedPicks: null,
  selections: {},     // gameId → pickedTeam
  keyPickId: null,    // gameId of key pick
  tiebreakerScore: null,
  weekLocked: false,
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
    if (config.user.role === 'admin') {
      document.getElementById('admin-link').style.display = '';
    }

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

function isWeekLocked(week) {
  if (week.manualLock) return true;
  if (week.lockTime && new Date(week.lockTime) <= new Date()) return true;
  return false;
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

// ── Rendering ──────────────────────────────────────────────────────────────

function render() {
  const { week, submitted, submittedPicks, weekLocked } = state;

  document.getElementById('pick-content').style.display = '';
  document.getElementById('week-title').textContent = `Week ${week.weekNumber} Picks`;

  if (submitted) {
    document.getElementById('submitted-banner').style.display = '';
    document.getElementById('pick-counter').style.display = 'none';
    document.getElementById('tiebreaker-section').style.display = 'none';
    document.getElementById('submit-row').style.display = 'none';
  }

  if (weekLocked && !submitted) {
    document.getElementById('lock-alert').style.display = '';
    document.getElementById('submit-row').style.display = 'none';
  }

  renderTiebreakerSection();
  renderGames();
  updateCounters();
}

function renderTiebreakerSection() {
  const { week, submitted, submittedPicks, weekLocked } = state;
  const tbGame = week.games.find(g => g.id === week.tiebreakerGameId);

  if (tbGame) {
    document.getElementById('tb-game-label').textContent =
      `${tbGame.awayTeam} @ ${tbGame.homeTeam}`;
    document.getElementById('tb-game-teams').textContent = '';
  }

  const input = document.getElementById('tiebreaker-input');
  if (submitted) {
    input.value = submittedPicks.tiebreakerScore;
    input.disabled = true;
  } else if (weekLocked) {
    input.disabled = true;
  } else {
    input.addEventListener('input', () => {
      state.tiebreakerScore = input.value !== '' ? parseInt(input.value) : null;
      updateCounters();
    });
  }
}

function renderGames() {
  const grid = document.getElementById('games-grid');
  grid.innerHTML = '';

  state.week.games.forEach(game => {
    grid.appendChild(buildGameCard(game));
  });
}

function buildGameCard(game) {
  const { submitted, submittedPicks, weekLocked, selections, keyPickId } = state;
  const gameLocked = isGameLocked(game);
  const gameWarning = isGameWarningSoon(game);
  const effectiveLock = weekLocked || gameLocked;

  // Determine what was picked (submitted or in-progress selection)
  let pickedTeam = null;
  let isKeyPick = false;
  if (submitted) {
    const p = submittedPicks.picks.find(p => p.gameId === game.id);
    if (p) { pickedTeam = p.pickedTeam; isKeyPick = p.isKeyPick; }
  } else {
    pickedTeam = selections[game.id] || null;
    isKeyPick = keyPickId === game.id;
  }

  const isTiebreaker = game.id === state.week.tiebreakerGameId;

  const card = document.createElement('div');
  card.className = 'game-card' +
    (effectiveLock && !submitted ? ' locked' : '') +
    (gameWarning && !gameLocked ? ' warning' : '') +
    (pickedTeam && !submitted ? ' selected' : '');
  card.dataset.gameId = game.id;

  const kickoff = new Date(game.commenceTime);
  const timeStr = kickoff.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

  let lockBadge = '';
  if (gameLocked || weekLocked) lockBadge = '<span class="lock-badge locked">Locked</span>';
  else if (gameWarning) lockBadge = '<span class="lock-badge warning">Locking soon</span>';

  const spreadDisplay = game.spread !== null
    ? `${game.favoredTeam === game.homeTeam ? game.homeTeam : game.awayTeam} ${game.spread}`
    : 'No line';

  const ouDisplay = game.overUnder != null ? `O/U ${game.overUnder}` : '';

  const scoreDisplay = (game.homeScore != null && game.awayScore != null)
    ? `<span class="game-score">${game.awayScore} - ${game.homeScore}</span>`
    : '';

  let footerRight = '';
  if (submitted && pickedTeam) {
    if (game.status === 'final') {
      const pick = submittedPicks.picks.find(p => p.gameId === game.id);
      const result = getPickResult(pick, game);
      const resultClass = result === 'win' ? 'win' : result === 'push' ? 'push' : 'loss';
      footerRight = `<span class="team-result result-${resultClass}">${result.toUpperCase()}</span>`;
    } else if (game.status === 'in_progress') {
      footerRight = scoreDisplay;
    }
  } else if (!submitted && !effectiveLock && pickedTeam) {
    footerRight = `<button class="key-pick-btn ${isKeyPick ? 'active' : ''}" data-game-id="${game.id}">
      ${isKeyPick ? '⭐ Key Pick' : '☆ Set Key Pick'}
    </button>`;
  }

  card.innerHTML = `
    <div class="game-card-header">
      <span class="game-time">${timeStr}</span>
      <div style="display:flex;gap:0.4rem;align-items:center">
        <span class="game-league">${game.league}</span>
        ${isTiebreaker ? '<span class="tiebreaker-badge">Tiebreaker</span>' : ''}
        ${lockBadge}
      </div>
    </div>
    <div class="game-teams">
      ${buildTeamRow(game, game.awayTeam, pickedTeam, isKeyPick, effectiveLock, game.spread, game.favoredTeam, submitted)}
      ${buildTeamRow(game, game.homeTeam, pickedTeam, isKeyPick, effectiveLock, game.spread, game.favoredTeam, submitted)}
    </div>
    <div class="game-card-footer">
      <div style="display:flex;gap:0.75rem">
        <span class="ou-line">${ouDisplay}</span>
        <span style="color:var(--text-muted);font-size:0.75rem">${spreadDisplay}</span>
      </div>
      ${footerRight}
    </div>
  `;

  if (!submitted && !effectiveLock) {
    card.querySelectorAll('.team-row').forEach(row => {
      row.addEventListener('click', () => selectTeam(game.id, row.dataset.team));
    });
    const keyBtn = card.querySelector('.key-pick-btn');
    if (keyBtn) {
      keyBtn.addEventListener('click', e => { e.stopPropagation(); toggleKeyPick(game.id); });
    }
  }

  return card;
}

function buildTeamRow(game, team, pickedTeam, isKeyPick, locked, spread, favoredTeam, submitted) {
  const picked = team === pickedTeam;
  const spreadVal = team === favoredTeam ? spread : (spread !== null ? -spread : null);
  const spreadStr = spreadVal !== null
    ? `<span class="team-spread">${spreadVal > 0 ? '+' : ''}${spreadVal}</span>`
    : '';
  const keyMark = picked && isKeyPick && submitted ? ' ⭐' : '';

  return `<div class="team-row ${picked ? 'picked' : ''}" data-team="${team}">
    <div class="team-radio"></div>
    <span class="team-name">${team}${keyMark}</span>
    ${spreadStr}
  </div>`;
}

function getPickResult(pick, game) {
  if (game.status !== 'final' || game.homeScore == null) return null;
  const favoredScore = game.favoredTeam === game.homeTeam ? game.homeScore : game.awayScore;
  const underdogScore = game.favoredTeam === game.homeTeam ? game.awayScore : game.homeScore;
  const coverMargin = (favoredScore - underdogScore) + game.spread;
  const pickedFavored = pick.pickedTeam === game.favoredTeam;
  if (coverMargin > 0) return pickedFavored ? 'win' : 'loss';
  if (coverMargin === 0) return 'push';
  return pickedFavored ? 'loss' : 'win';
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
  refreshCard(gameId);
}

function toggleKeyPick(gameId) {
  if (!state.selections[gameId]) return;
  state.keyPickId = state.keyPickId === gameId ? null : gameId;
  // Refresh old and new key pick cards
  state.week.games.forEach(g => refreshCard(g.id));
  updateCounters();
}

function refreshCard(gameId) {
  const game = state.week.games.find(g => g.id === gameId);
  if (!game) return;
  const old = document.querySelector(`[data-game-id="${gameId}"]`);
  if (old) old.replaceWith(buildGameCard(game));
}

function updateCounters() {
  const pickCount = Object.keys(state.selections).length;
  const hasKey = !!state.keyPickId;
  const hasTb = state.tiebreakerScore !== null && state.tiebreakerScore !== '';

  const cntPicks = document.getElementById('cnt-picks');
  const cntKey = document.getElementById('cnt-key');
  const cntTb = document.getElementById('cnt-tb');
  const submitBtn = document.getElementById('submit-btn');

  cntPicks.textContent = `${pickCount} / 15`;
  cntPicks.className = `counter-value ${pickCount === 15 ? 'complete' : 'incomplete'}`;

  cntKey.textContent = hasKey
    ? state.week.games.find(g => g.id === state.keyPickId)?.homeTeam.split(' ').pop() || 'Set'
    : 'None';
  cntKey.className = `counter-value ${hasKey ? 'complete' : 'incomplete'}`;

  cntTb.textContent = hasTb ? state.tiebreakerScore : '—';
  cntTb.className = `counter-value ${hasTb ? 'complete' : 'incomplete'}`;

  if (submitBtn) {
    submitBtn.disabled = !(pickCount === 15 && hasKey && hasTb);
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
    gameId,
    pickedTeam,
    isKeyPick: gameId === state.keyPickId,
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
  if (!lockTime) {
    document.getElementById('countdown-wrap').style.display = 'none';
    return;
  }

  function tick() {
    const diff = lockTime - new Date();
    if (diff <= 0) {
      document.getElementById('countdown').textContent = 'LOCKED';
      state.weekLocked = true;
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById('countdown').textContent =
      d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
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
        if (game) {
          game.homeScore = s.homeScore;
          game.awayScore = s.awayScore;
          game.status = s.status;
          refreshCard(game.id);
        }
      });
      if (hasActiveGames(state.week)) scheduleScoreRefresh();
    } catch (_) {
      scheduleScoreRefresh();
    }
  }, 60_000);
}

init();

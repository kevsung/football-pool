/* ── admin.js — admin dashboard logic ─────────────────────────────────── */

let currentUser = null;
let currentWeekNumber = null;
let fetchedGames = [];       // all games returned by the server (already filtered)
let overflowGames = [];      // games that passed filters but exceeded the 30-game cap
let selectedGameIds = new Set();
let tiebreakerGameId = null;
let tiebreakerReason = null; // 'mnf' | 'snf' | null
let reviewConfirmed = false;
let users = [];
let invites = [];
let currentWeekData = null;

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    ...opts,
  });
  if (res.status === 401) { location.href = '/login'; return null; }
  if (res.status === 403) { location.href = '/'; return null; }
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
    currentUser = config.user;
    currentWeekNumber = config.weekNumber;
    document.getElementById('user-name').textContent = config.user.name;
    applyPoolName(config.poolName);
    document.getElementById('pub-season').value = new Date().getFullYear();
    document.getElementById('pub-week').value = currentWeekNumber ? currentWeekNumber + 1 : 1;
    document.getElementById('pub-lock').value = nextSaturdayNoon();

    await Promise.all([loadUsers(), loadInvites(), loadLockStatus(), loadPoolConfig()]);
  } catch (err) {
    alert(`Init error: ${err.message}`);
  }
}

// ── Tab switching ──────────────────────────────────────────────────────────

function showTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn[role="tab"]').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  document.getElementById(`tab-${name}`).classList.add('active');
  btn.classList.add('active');
  btn.setAttribute('aria-selected', 'true');
}

// ── Picksheet builder ──────────────────────────────────────────────────────

async function fetchGames() {
  const sport = document.getElementById('fetch-sport').value;
  const loading = document.getElementById('games-loading');
  const result = document.getElementById('games-fetch-result');
  const btn = document.getElementById('fetch-games-btn');

  loading.style.display = '';
  result.style.display = 'none';
  document.getElementById('review-section').style.display = 'none';
  document.getElementById('publish-section').style.display = 'none';
  btn.disabled = true;

  try {
    const data = await api(`/api/odds/available?sport=${sport}`);
    if (!data) return;

    fetchedGames = data.games;

    if (data.requestsRemaining != null) {
      document.getElementById('api-remaining').textContent = `${data.requestsRemaining} API calls remaining`;
    }

    document.getElementById('games-count-label').textContent =
      `${fetchedGames.length} game${fetchedGames.length !== 1 ? 's' : ''} available after filters`;

    autoSelectGames();
    renderAvailableGames();
    result.style.display = '';
  } catch (err) {
    alert(`Failed to fetch games: ${err.message}`);
  } finally {
    loading.style.display = 'none';
    btn.disabled = false;
  }
}

function autoSelectGames() {
  selectedGameIds.clear();
  overflowGames = [];
  reviewConfirmed = false;

  // Games are already sorted by commenceTime from the server
  if (fetchedGames.length <= 30) {
    fetchedGames.forEach(g => selectedGameIds.add(g.id));
  } else {
    fetchedGames.slice(0, 30).forEach(g => selectedGameIds.add(g.id));
    overflowGames = fetchedGames.slice(30);
  }

  // Auto-detect tiebreaker from selected games
  const tb = autoDetectTiebreaker();
  tiebreakerGameId = tb.id;
  tiebreakerReason = tb.reason;

  // Show overflow banner in the games grid
  const banner = document.getElementById('overflow-banner');
  if (overflowGames.length > 0) {
    banner.textContent =
      `30 games auto-selected (earliest kickoffs). ${overflowGames.length} additional ` +
      `game${overflowGames.length !== 1 ? 's' : ''} available — you can add them manually below.`;
    banner.style.display = '';
  } else {
    banner.style.display = 'none';
  }

  updateReviewButton();
}

// ── ET timezone helpers (client-side) ─────────────────────────────────────

function getETDayOfWeek(date) {
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'long',
  }).format(date);
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(day);
}

function getETHour(date) {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', hour12: false,
  }).format(date);
  return parseInt(hourStr, 10);
}

// ── Tiebreaker auto-detection ──────────────────────────────────────────────

function autoDetectTiebreaker() {
  const selected = fetchedGames.filter(g => selectedGameIds.has(g.id));

  // 1. Monday Night Football: latest NFL game on Monday
  const mnf = selected
    .filter(g => {
      if (g.league !== 'NFL') return false;
      return getETDayOfWeek(new Date(g.commenceTime)) === 1; // Monday
    })
    .sort((a, b) => new Date(b.commenceTime) - new Date(a.commenceTime));

  if (mnf.length > 0) return { id: mnf[0].id, reason: 'mnf' };

  // 2. Sunday Night Football: latest NFL game on Sunday at/after 20:00 ET
  const snf = selected
    .filter(g => {
      if (g.league !== 'NFL') return false;
      const dt = new Date(g.commenceTime);
      return getETDayOfWeek(dt) === 0 && getETHour(dt) >= 20; // Sunday 8pm+
    })
    .sort((a, b) => new Date(b.commenceTime) - new Date(a.commenceTime));

  if (snf.length > 0) return { id: snf[0].id, reason: 'snf' };

  return { id: null, reason: null };
}

// ── Game grid rendering ────────────────────────────────────────────────────

function renderAvailableGames() {
  const grid = document.getElementById('available-games-grid');
  grid.innerHTML = '';

  fetchedGames.forEach(game => {
    const sel = selectedGameIds.has(game.id);
    const isTb = tiebreakerGameId === game.id;

    const card = document.createElement('div');
    card.className = `game-checkbox-card ${sel ? 'selected' : ''}`;
    card.dataset.gameId = game.id;

    const kickoff = new Date(game.commenceTime);
    const timeStr = kickoff.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

    const spreadStr = game.spread != null
      ? `${game.favoredTeam} ${game.spread}  |  O/U ${game.overUnder ?? '—'}`
      : 'No line';

    card.innerHTML = `
      <input type="checkbox" ${sel ? 'checked' : ''}>
      <div class="gcb-info">
        <div class="gcb-teams">${game.awayTeam} @ ${game.homeTeam}</div>
        <div class="gcb-meta">${game.league} · ${timeStr}</div>
        <div class="gcb-meta">${spreadStr}</div>
        ${isTb ? `<div class="gcb-tiebreaker">⭐ Tiebreaker (${tiebreakerReason === 'mnf' ? 'MNF' : 'SNF'})</div>` : ''}
      </div>
      <button class="tiebreaker-select-btn ${isTb ? 'active' : ''}" data-game-id="${game.id}" title="Set as tiebreaker">TB</button>
    `;

    card.querySelector('input[type="checkbox"]').addEventListener('change', e => {
      e.stopPropagation();
      toggleGameSelection(game.id);
    });

    card.querySelector('.tiebreaker-select-btn').addEventListener('click', e => {
      e.stopPropagation();
      setTiebreaker(game.id);
    });

    card.addEventListener('click', () => toggleGameSelection(game.id));
    grid.appendChild(card);
  });

  updateSelectedCount();
}

function toggleGameSelection(gameId) {
  if (selectedGameIds.has(gameId)) {
    selectedGameIds.delete(gameId);
    if (tiebreakerGameId === gameId) {
      tiebreakerGameId = null;
      tiebreakerReason = null;
    }
  } else {
    if (selectedGameIds.size >= 30) { alert('Maximum 30 games per week.'); return; }
    selectedGameIds.add(gameId);
  }
  resetReview();
  renderAvailableGames();
  updateReviewButton();
}

function setTiebreaker(gameId) {
  tiebreakerGameId = tiebreakerGameId === gameId ? null : gameId;
  tiebreakerReason = null; // manual override clears the auto reason
  if (tiebreakerGameId && !selectedGameIds.has(gameId)) selectedGameIds.add(gameId);
  resetReview();
  renderAvailableGames();
  updateReviewButton();
}

function selectAll() {
  fetchedGames.slice(0, 30).forEach(g => selectedGameIds.add(g.id));
  resetReview();
  renderAvailableGames();
  updateReviewButton();
}

function clearAll() {
  selectedGameIds.clear();
  tiebreakerGameId = null;
  tiebreakerReason = null;
  resetReview();
  renderAvailableGames();
  updateReviewButton();
}

function updateSelectedCount() {
  document.getElementById('selected-count').textContent = `${selectedGameIds.size} / 30 selected`;
}

function updateReviewButton() {
  const btn = document.getElementById('review-btn');
  btn.style.display = selectedGameIds.size > 0 ? '' : 'none';
}

function resetReview() {
  reviewConfirmed = false;
  document.getElementById('review-section').style.display = 'none';
  document.getElementById('publish-section').style.display = 'none';
  document.getElementById('review-confirmed-badge').style.display = 'none';
  document.getElementById('publish-btn').disabled = true;
}

// ── Review screen ──────────────────────────────────────────────────────────

function showReviewSection() {
  renderReviewScreen();
  document.getElementById('review-section').style.display = '';
  document.getElementById('review-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderReviewScreen() {
  const selected = fetchedGames
    .filter(g => selectedGameIds.has(g.id))
    .sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));

  // Overflow notice
  const overflowNotice = document.getElementById('review-overflow-notice');
  if (overflowGames.length > 0) {
    overflowNotice.textContent =
      `${overflowGames.length} additional game${overflowGames.length !== 1 ? 's' : ''} passed filters ` +
      `but were not auto-selected (30-game cap reached). Add them manually above if needed.`;
    overflowNotice.style.display = '';
  } else {
    overflowNotice.style.display = 'none';
  }

  // Tiebreaker notice
  const tbNotice = document.getElementById('review-tiebreaker-notice');
  const noTbNotice = document.getElementById('review-no-tiebreaker-notice');
  if (tiebreakerGameId) {
    const tbGame = fetchedGames.find(g => g.id === tiebreakerGameId);
    const label = tiebreakerReason === 'mnf'
      ? 'Monday Night Football (auto)'
      : tiebreakerReason === 'snf'
        ? 'Sunday Night Football (auto)'
        : 'Manual selection';
    tbNotice.innerHTML = `Tiebreaker: <strong>${tbGame ? `${tbGame.awayTeam} @ ${tbGame.homeTeam}` : tiebreakerGameId}</strong> — ${label}`;
    tbNotice.style.display = '';
    noTbNotice.style.display = 'none';
  } else {
    tbNotice.style.display = 'none';
    noTbNotice.style.display = '';
  }

  // Group games by ET day label
  const groups = new Map();
  selected.forEach(g => {
    const dayLabel = new Date(g.commenceTime).toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long', month: 'long', day: 'numeric',
    });
    if (!groups.has(dayLabel)) groups.set(dayLabel, []);
    groups.get(dayLabel).push(g);
  });

  const container = document.getElementById('review-games-list');
  container.innerHTML = '';

  if (selected.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.875rem">No games selected.</p>';
    return;
  }

  groups.forEach((games, day) => {
    const hdr = document.createElement('div');
    hdr.className = 'review-day-header';
    hdr.textContent = `${day} (${games.length} game${games.length !== 1 ? 's' : ''})`;
    container.appendChild(hdr);

    games.forEach(g => {
      const isTb = tiebreakerGameId === g.id;
      const timeStr = new Date(g.commenceTime).toLocaleTimeString('en-US', {
        timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
      });
      const row = document.createElement('div');
      row.className = `review-game-row${isTb ? ' review-game-tb' : ''}`;
      row.innerHTML = `
        <span class="review-game-matchup">
          ${g.awayTeam} @ ${g.homeTeam}
          ${isTb ? '<span class="tiebreaker-badge" style="margin-left:0.4rem">TB</span>' : ''}
        </span>
        <span class="review-game-meta">${g.league} · ${timeStr}</span>
        <span class="review-game-line">${g.favoredTeam} ${g.spread} | O/U ${g.overUnder ?? '—'}</span>
      `;
      container.appendChild(row);
    });
  });

  // Summary line
  const summary = document.createElement('div');
  summary.style.cssText = 'margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--border);font-size:0.875rem;color:var(--text-muted)';
  summary.textContent = `${selected.length} game${selected.length !== 1 ? 's' : ''} selected`;
  container.appendChild(summary);
}

function confirmSelection() {
  reviewConfirmed = true;
  document.getElementById('review-confirmed-badge').style.display = '';
  document.getElementById('publish-section').style.display = '';
  document.getElementById('publish-btn').disabled = false;
  updateTiebreakerDisplay();
  document.getElementById('publish-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Publish ────────────────────────────────────────────────────────────────

function updateTiebreakerDisplay() {
  const el = document.getElementById('tiebreaker-display');
  if (tiebreakerGameId) {
    const game = fetchedGames.find(g => g.id === tiebreakerGameId);
    document.getElementById('tiebreaker-label').textContent =
      game ? `${game.awayTeam} @ ${game.homeTeam}` : tiebreakerGameId;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

async function publishWeek() {
  const weekNumber = parseInt(document.getElementById('pub-week').value);
  const season = parseInt(document.getElementById('pub-season').value);
  const lockTime = document.getElementById('pub-lock').value;

  if (!weekNumber || !season) { alert('Week number and season are required.'); return; }
  if (selectedGameIds.size === 0) { alert('Select at least one game.'); return; }
  if (!reviewConfirmed) { alert('Please review and confirm your selection first.'); return; }

  const games = fetchedGames.filter(g => selectedGameIds.has(g.id));
  const msg = document.getElementById('publish-msg');
  const btn = document.getElementById('publish-btn');

  try {
    btn.disabled = true;
    msg.textContent = 'Publishing…';
    msg.style.color = 'var(--text-muted)';

    await api('/api/admin/weeks', {
      method: 'POST',
      body: JSON.stringify({
        weekNumber, season, games,
        tiebreakerGameId: tiebreakerGameId || null,
        lockTime: lockTime ? new Date(lockTime).toISOString() : null,
      }),
    });

    msg.textContent = `✅ Week ${weekNumber} published!`;
    msg.style.color = 'var(--accent)';
    currentWeekNumber = weekNumber;
    loadLockStatus();
  } catch (err) {
    msg.textContent = `Error: ${err.message}`;
    msg.style.color = 'var(--danger)';
    btn.disabled = false;
  }
}

// ── Invites ────────────────────────────────────────────────────────────────

async function loadInvites() {
  try {
    invites = await api('/api/admin/invites') || [];
    renderInvites();
  } catch (_) {}
}

function renderInvites() {
  const tbody = document.getElementById('invites-body');
  tbody.innerHTML = '';
  document.getElementById('invites-empty').style.display = invites.length === 0 ? '' : 'none';

  invites.forEach(inv => {
    const usedUser = inv.usedAt ? users.find(u => u.id === inv.usedBy)?.name || 'Unknown' : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${inv.email}</td>
      <td style="color:var(--text-muted);font-size:0.8rem">${new Date(inv.createdAt).toLocaleDateString()}</td>
      <td>${inv.usedAt
        ? '<span class="badge badge-used">Used</span>'
        : '<span class="badge badge-open">Pending</span>'}</td>
      <td style="color:var(--text-muted);font-size:0.875rem">${usedUser}</td>
      <td>${!inv.usedAt
        ? `<button class="btn btn-sm btn-danger" data-action="revoke-invite" data-invite-id="${inv.id}">Revoke</button>`
        : ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function generateInvite() {
  const email = document.getElementById('invite-email').value.trim();
  if (!email) { alert('Enter an email address.'); return; }

  try {
    const data = await api('/api/admin/invites', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    if (!data) return;

    document.getElementById('invite-url-text').textContent = data.inviteUrl;
    document.getElementById('new-invite-url').style.display = '';
    document.getElementById('invite-email').value = '';

    invites.unshift(data.invite);
    renderInvites();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function revokeInvite(id) {
  if (!confirm('Revoke this invite link?')) return;
  try {
    await api(`/api/admin/invites/${id}`, { method: 'DELETE' });
    invites = invites.filter(i => i.id !== id);
    renderInvites();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function copyInviteUrl() {
  const text = document.getElementById('invite-url-text').textContent;
  navigator.clipboard.writeText(text).then(() => alert('Copied!')).catch(() => {
    prompt('Copy this link:', text);
  });
}

// ── Users ──────────────────────────────────────────────────────────────────

async function loadUsers() {
  try {
    users = await api('/api/admin/users') || [];
    renderUsers();
  } catch (_) {}
}

function renderUsers() {
  const tbody = document.getElementById('users-body');
  tbody.innerHTML = '';
  document.getElementById('users-empty').style.display = users.length === 0 ? '' : 'none';

  users.forEach(u => {
    const isSelf = u.id === currentUser?.id;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:500">${u.name}${isSelf ? ' <span style="color:var(--text-muted);font-size:0.75rem">(you)</span>' : ''}</td>
      <td style="color:var(--text-muted);font-size:0.875rem">${u.email}</td>
      <td><span class="badge badge-${u.role}">${u.role}</span></td>
      <td style="color:var(--text-muted);font-size:0.8rem">${new Date(u.joinedAt).toLocaleDateString()}</td>
      <td>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center">
          ${!isSelf ? `
            <button class="btn btn-sm btn-secondary"
              data-action="toggle-role"
              data-user-id="${u.id}"
              data-role="${u.role}">
              ${u.role === 'admin' ? 'Demote' : 'Make Admin'}
            </button>
            <button class="btn btn-sm btn-danger"
              data-action="remove-user"
              data-user-id="${u.id}"
              data-name="${u.name}">Remove</button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function toggleRole(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  try {
    const updated = await api(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role: newRole }),
    });
    if (!updated) return;
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) users[idx] = updated;
    renderUsers();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function removeUser(userId, name) {
  if (!confirm(`Remove ${name} from the league?`)) return;
  try {
    await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
    users = users.filter(u => u.id !== userId);
    renderUsers();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// ── Pool config ────────────────────────────────────────────────────────────

async function loadPoolConfig() {
  try {
    const config = await api('/api/admin/config');
    if (!config) return;
    document.getElementById('pool-name-input').value = config.poolName || '';
  } catch (_) {}
}

async function savePoolName() {
  const poolName = document.getElementById('pool-name-input').value.trim();
  if (!poolName) { alert('Pool name cannot be empty.'); return; }

  const msg = document.getElementById('pool-name-msg');
  try {
    const updated = await api('/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify({ poolName }),
    });
    if (!updated) return;
    msg.textContent = '✅ Saved!';
    msg.style.color = 'var(--accent)';
    applyPoolName(updated.poolName);
    setTimeout(() => { msg.textContent = ''; }, 3000);
  } catch (err) {
    msg.textContent = `Error: ${err.message}`;
    msg.style.color = 'var(--danger)';
  }
}

// ── Settings ───────────────────────────────────────────────────────────────

async function loadLockStatus() {
  const btn = document.getElementById('lock-toggle-btn');
  if (!currentWeekNumber) {
    btn.textContent = 'No week published';
    btn.disabled = true;
    return;
  }
  try {
    currentWeekData = await api(`/api/admin/weeks/${currentWeekNumber}`);
    updateLockUI();
  } catch (_) {}
}

function updateLockUI() {
  const btn = document.getElementById('lock-toggle-btn');
  const status = document.getElementById('lock-status');
  if (!currentWeekData) return;
  const locked = currentWeekData.manualLock;
  btn.textContent = locked ? 'Unlock Picks' : 'Force Lock';
  btn.className = locked ? 'btn btn-secondary' : 'btn btn-danger';
  status.textContent = locked ? 'Picks are manually locked.' : 'Using automatic lock schedule.';
}

async function toggleManualLock() {
  if (!currentWeekData) return;
  try {
    const updated = await api(`/api/admin/weeks/${currentWeekNumber}`, {
      method: 'PUT',
      body: JSON.stringify({ manualLock: !currentWeekData.manualLock }),
    });
    if (!updated) return;
    currentWeekData = updated;
    updateLockUI();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function triggerPoll() {
  const msg = document.getElementById('poll-msg');
  msg.textContent = 'Polling…';
  msg.style.color = 'var(--text-muted)';
  try {
    const result = await api('/api/scores/poll', { method: 'POST' });
    if (!result) return;
    msg.textContent = result.updated ? '✅ Scores updated.' : `No update needed: ${result.reason || ''}`;
    msg.style.color = result.updated ? 'var(--accent)' : 'var(--text-muted)';
  } catch (err) {
    msg.textContent = `Error: ${err.message}`;
    msg.style.color = 'var(--danger)';
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function nextSaturdayNoon() {
  const now = new Date();
  const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7;
  const sat = new Date(now);
  sat.setDate(now.getDate() + daysUntilSat);
  sat.setHours(12, 0, 0, 0);
  return sat.toISOString().slice(0, 16);
}

// ── Wire up all event listeners ────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Header
  document.getElementById('signout-btn').addEventListener('click', () => {
    location.href = '/auth/logout';
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab, btn));
  });

  // Picksheet builder — fetch & game grid
  document.getElementById('fetch-games-btn').addEventListener('click', fetchGames);
  document.getElementById('select-all-btn').addEventListener('click', selectAll);
  document.getElementById('clear-all-btn').addEventListener('click', clearAll);
  document.getElementById('review-btn').addEventListener('click', showReviewSection);

  // Review section
  document.getElementById('back-to-edit-btn').addEventListener('click', () => {
    document.getElementById('review-section').style.display = 'none';
  });
  document.getElementById('confirm-selection-btn').addEventListener('click', confirmSelection);

  // Publish
  document.getElementById('publish-btn').addEventListener('click', publishWeek);

  // Invites
  document.getElementById('generate-invite-btn').addEventListener('click', generateInvite);
  document.getElementById('copy-invite-btn').addEventListener('click', copyInviteUrl);
  document.getElementById('invite-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') generateInvite();
  });

  // Event delegation — invites table
  document.getElementById('invites-body').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="revoke-invite"]');
    if (btn) revokeInvite(btn.dataset.inviteId);
  });

  // Event delegation — users table
  document.getElementById('users-body').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'toggle-role') toggleRole(btn.dataset.userId, btn.dataset.role);
    if (btn.dataset.action === 'remove-user') removeUser(btn.dataset.userId, btn.dataset.name);
  });

  // Settings — pool name
  document.getElementById('save-pool-name-btn').addEventListener('click', savePoolName);
  document.getElementById('pool-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') savePoolName();
  });

  // Settings — lock & poll
  document.getElementById('lock-toggle-btn').addEventListener('click', toggleManualLock);
  document.getElementById('poll-now-btn').addEventListener('click', triggerPoll);

  init();
});

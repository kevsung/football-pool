/* ── admin.js — admin dashboard logic ─────────────────────────────────── */

let currentUser = null;
let currentWeekNumber = null;
let fetchedGames = [];
let selectedGameIds = new Set();
let tiebreakerGameId = null;
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
  btn.disabled = true;

  try {
    const data = await api(`/api/odds/available?sport=${sport}`);
    if (!data) return;

    fetchedGames = data.games;
    selectedGameIds.clear();
    tiebreakerGameId = null;

    if (data.requestsRemaining != null) {
      document.getElementById('api-remaining').textContent = `${data.requestsRemaining} API calls remaining`;
    }

    document.getElementById('games-count-label').textContent =
      `${fetchedGames.length} game${fetchedGames.length !== 1 ? 's' : ''} available`;

    renderAvailableGames();
    result.style.display = '';
    updatePublishSection();
  } catch (err) {
    alert(`Failed to fetch games: ${err.message}`);
  } finally {
    loading.style.display = 'none';
    btn.disabled = false;
  }
}

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
        ${isTb ? '<div class="gcb-tiebreaker">⭐ Tiebreaker</div>' : ''}
      </div>
      <button class="tiebreaker-select-btn ${isTb ? 'active' : ''}" data-game-id="${game.id}">TB</button>
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
    if (tiebreakerGameId === gameId) tiebreakerGameId = null;
  } else {
    if (selectedGameIds.size >= 30) { alert('Maximum 30 games per week.'); return; }
    selectedGameIds.add(gameId);
  }
  renderAvailableGames();
  updatePublishSection();
}

function setTiebreaker(gameId) {
  tiebreakerGameId = tiebreakerGameId === gameId ? null : gameId;
  if (tiebreakerGameId && !selectedGameIds.has(gameId)) selectedGameIds.add(gameId);
  renderAvailableGames();
  updateTiebreakerDisplay();
}

function selectAll() {
  fetchedGames.slice(0, 30).forEach(g => selectedGameIds.add(g.id));
  renderAvailableGames();
  updatePublishSection();
}

function clearAll() {
  selectedGameIds.clear();
  tiebreakerGameId = null;
  renderAvailableGames();
  updatePublishSection();
}

function updateSelectedCount() {
  document.getElementById('selected-count').textContent = `${selectedGameIds.size} / 30 selected`;
}

function updatePublishSection() {
  document.getElementById('publish-section').style.display = selectedGameIds.size > 0 ? '' : 'none';
  updateTiebreakerDisplay();
  updateSelectedCount();
}

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
  } finally {
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
      <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
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

  // Picksheet builder
  document.getElementById('fetch-games-btn').addEventListener('click', fetchGames);
  document.getElementById('select-all-btn').addEventListener('click', selectAll);
  document.getElementById('clear-all-btn').addEventListener('click', clearAll);
  document.getElementById('publish-btn').addEventListener('click', publishWeek);

  // Invites
  document.getElementById('generate-invite-btn').addEventListener('click', generateInvite);
  document.getElementById('copy-invite-btn').addEventListener('click', copyInviteUrl);
  document.getElementById('invite-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') generateInvite();
  });

  // Event delegation — invites table (revoke buttons rendered dynamically)
  document.getElementById('invites-body').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="revoke-invite"]');
    if (btn) revokeInvite(btn.dataset.inviteId);
  });

  // Event delegation — users table (role/remove buttons rendered dynamically)
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

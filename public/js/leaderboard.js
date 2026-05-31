/* ── leaderboard.js — standings page logic ─────────────────────────────── */

let currentView = 'weekly';
let currentWeek = null;
let availableWeeks = [];
let currentUser = null;

async function api(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (res.status === 401) { location.href = '/login'; return null; }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

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
    currentWeek = config.weekNumber;

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
  sel.addEventListener('change', () => {
    currentWeek = parseInt(sel.value);
    loadStandings();
  });
}

async function loadStandings() {
  document.getElementById('standings-wrap').style.display = 'none';
  document.getElementById('empty').style.display = 'none';
  document.getElementById('loading').style.display = 'block';

  try {
    let data;
    if (currentView === 'weekly') {
      if (!currentWeek) { showEmpty(); return; }
      data = await api(`/api/standings/weekly/${currentWeek}`);
    } else {
      data = await api('/api/standings/season');
    }
    if (!data) return;
    renderStandings(data.standings || []);
  } catch (err) {
    document.getElementById('loading').textContent = `Error: ${err.message}`;
  }
}

function renderStandings(standings) {
  document.getElementById('loading').style.display = 'none';

  if (!standings.length) { showEmpty(); return; }

  document.getElementById('standings-wrap').style.display = '';

  const isSeason = currentView === 'season';
  document.getElementById('tb-col-header').textContent = isSeason ? 'TB Total' : 'TB Diff';

  const tbody = document.getElementById('standings-body');
  tbody.innerHTML = '';

  let prevRank = null;
  standings.forEach((row, i) => {
    const tied = i > 0 && standings[i - 1].rank === row.rank;
    const isSelf = row.userId === currentUser?.id;
    const rankClass = row.rank === 1 ? 'rank-1' : row.rank === 2 ? 'rank-2' : row.rank === 3 ? 'rank-3' : '';

    const tbVal = isSeason
      ? (row.tiebreakerDiffTotal != null ? row.tiebreakerDiffTotal : '—')
      : (row.tiebreakerDiff != null ? row.tiebreakerDiff : '—');

    const tr = document.createElement('tr');
    if (isSelf) tr.style.background = 'rgba(63,185,80,.05)';
    tr.innerHTML = `
      <td class="rank-cell ${rankClass}">${row.rank}${tied ? '<span class="tied-marker">T</span>' : ''}</td>
      <td style="font-weight:${isSelf ? '600' : '400'}">${row.name}${isSelf ? ' <span style="color:var(--text-muted);font-size:0.75rem">(you)</span>' : ''}</td>
      <td style="text-align:right;font-weight:700">${row.points}</td>
      <td style="text-align:right">${row.keyWins}</td>
      <td style="text-align:right;color:var(--text-muted)">${tbVal}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('last-updated').textContent =
    `${standings.length} player${standings.length !== 1 ? 's' : ''}`;
}

function showEmpty() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('empty').style.display = '';
}

function switchView(view) {
  currentView = view;
  document.getElementById('btn-weekly').classList.toggle('active', view === 'weekly');
  document.getElementById('btn-season').classList.toggle('active', view === 'season');
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

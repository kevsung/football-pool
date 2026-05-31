/* ── settings.js — user settings page logic ────────────────────────────── */

async function api(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 401) { location.href = '/login'; return null; }
  if (!res.ok) return null;
  return res.json();
}

async function init() {
  const config = await api('/api/config');
  if (!config) return;

  document.getElementById('user-name').textContent = config.user.name;
  document.getElementById('account-name').textContent = config.user.name;
  document.getElementById('account-email').textContent = config.user.email || '—';
  document.getElementById('account-role').textContent =
    config.user.role === 'admin' ? 'Admin' : 'Member';

  applyPoolName(config.poolName);

  if (config.user.role === 'admin') {
    document.getElementById('admin-link').style.display = '';
  }

  // Reflect the currently active theme in the radio buttons
  const active = document.documentElement.getAttribute('data-theme') || 'light';
  const radio = document.getElementById(`theme-${active}`);
  if (radio) radio.checked = true;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('signout-btn').addEventListener('click', () => {
    location.href = '/auth/logout';
  });

  // Theme radio buttons — apply immediately on change, no Save needed
  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      document.documentElement.setAttribute('data-theme', radio.value);
      localStorage.setItem('theme', radio.value);
    });
  });

  init();
});

/* common.js — theme management and shared utilities
 * Loaded on every page before the page-specific script.
 * The tiny inline <script> in <head> sets data-theme from localStorage to prevent flash.
 * Theme selection lives on /settings; this file provides the shared helpers.
 */

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  syncThemeButton();
}

function syncThemeButton() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.textContent = isDark ? '☀' : '☾';
}

function applyPoolName(name) {
  if (!name) return;
  document.querySelectorAll('.pool-name').forEach(el => { el.textContent = name; });
}

// Load pool name on public pages (login, access-denied) that can't use /api/config
async function loadPublicPoolName() {
  try {
    const res = await fetch('/api/pool', { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const { poolName } = await res.json();
    applyPoolName(poolName);
  } catch (_) {}
}

// syncThemeButton is kept for any future use but no longer auto-wired globally.

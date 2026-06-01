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

// ── Team abbreviations ────────────────────────────────────────────────────────
const _NFL_ABBR = {
  'Arizona Cardinals':'ARI','Atlanta Falcons':'ATL','Baltimore Ravens':'BAL',
  'Buffalo Bills':'BUF','Carolina Panthers':'CAR','Chicago Bears':'CHI',
  'Cincinnati Bengals':'CIN','Cleveland Browns':'CLE','Dallas Cowboys':'DAL',
  'Denver Broncos':'DEN','Detroit Lions':'DET','Green Bay Packers':'GB',
  'Houston Texans':'HOU','Indianapolis Colts':'IND','Jacksonville Jaguars':'JAX',
  'Kansas City Chiefs':'KC','Las Vegas Raiders':'LV','Los Angeles Chargers':'LAC',
  'Los Angeles Rams':'LAR','Miami Dolphins':'MIA','Minnesota Vikings':'MIN',
  'New England Patriots':'NE','New Orleans Saints':'NO','New York Giants':'NYG',
  'New York Jets':'NYJ','Philadelphia Eagles':'PHI','Pittsburgh Steelers':'PIT',
  'San Francisco 49ers':'SF','Seattle Seahawks':'SEA','Tampa Bay Buccaneers':'TB',
  'Tennessee Titans':'TEN','Washington Commanders':'WSH',
};

// Returns a ≤4-char abbreviation suitable for compact table headers.
function teamAbbr(name) {
  if (!name) return '???';
  if (_NFL_ABBR[name]) return _NFL_ABBR[name];
  const w = name.split(' ');
  // Handle common multi-word school names
  const overrides = {
    'Notre Dame':'ND', 'Ohio State':'OSU', 'Penn State':'PSU',
    'Florida State':'FSU', 'Florida Atlantic':'FAU', 'Michigan State':'MSU',
    'Mississippi State':'MSU', 'Kansas State':'KSU', 'Iowa State':'ISU',
    'NC State':'NCSU', 'Virginia Tech':'VT', 'Texas A&M':'A&M',
    'Ole Miss':'MISS', 'South Carolina':'SC', 'North Carolina':'UNC',
  };
  const twoWord = w.slice(0, 2).join(' ');
  if (overrides[twoWord]) return overrides[twoWord];
  return w[0].slice(0, 3).toUpperCase();
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

// ── Mobile nav ───────────────────────────────────────────────────────────────
function initMobileNav() {
  const btn = document.getElementById('hamburger-btn');
  const nav = document.getElementById('mobile-nav');
  if (!btn || !nav) return;

  function setOpen(open) {
    nav.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    btn.textContent = open ? '✕' : '☰';
  }

  btn.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) setOpen(false);
  });

  document.addEventListener('click', e => {
    if (nav.classList.contains('is-open') && !nav.contains(e.target) && !btn.contains(e.target)) {
      setOpen(false);
    }
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setOpen(false));
  });

  // Mirror desktop admin-link visibility to mobile counterpart
  const desktopAdmin = document.getElementById('admin-link');
  const mobileAdmin  = document.getElementById('admin-link-mobile');
  if (desktopAdmin && mobileAdmin) {
    new MutationObserver(() => {
      mobileAdmin.style.display = desktopAdmin.style.display;
    }).observe(desktopAdmin, { attributes: true, attributeFilter: ['style'] });
  }
}

document.addEventListener('DOMContentLoaded', initMobileNav);

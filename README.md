# TechBandits Football Pool

Private invite-only NFL + NCAAF pick'em pool. Built with Node/Express, vanilla JS, Google OAuth, and flat JSON storage.

## Stack

| Layer | Choice |
|---|---|
| Backend | Node.js + Express |
| Auth | Google OAuth 2.0 (Passport) |
| Storage | Flat JSON files (`data/`) |
| Odds & Scores | [The Odds API](https://the-odds-api.com) |
| Frontend | Vanilla HTML / CSS / JS |
| Hosting | Render.com |
| Domain | techbandits.com |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Run in dev mode (auto-restart on save)
npm run dev

# 4. Production
npm start
```

## Environment Variables

Copy `.env.example` to `.env` and fill in all values:

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | From Google Cloud Console OAuth 2.0 credentials |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console OAuth 2.0 credentials |
| `SESSION_SECRET` | Random 32+ character string for session signing |
| `ODDS_API_KEY` | From [the-odds-api.com](https://the-odds-api.com) |
| `PORT` | Server port (default `3000`) |
| `BASE_URL` | Public URL, e.g. `https://techbandits.com` |
| `NODE_ENV` | Set to `production` on Render |

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `https://techbandits.com/auth/google/callback`
4. Copy Client ID and Secret to `.env`

## First-Time Bootstrap

The first Google account to sign in **becomes admin automatically** — no invite needed. After that, everyone requires an invite link from an existing admin.

## Admin Workflow

1. Sign in (you become admin on first login)
2. Go to `/admin` → **Invites** tab → generate invite links for each player
3. Send invite links to players (format: `https://techbandits.com/invite?token=...`)
4. Go to **Picksheet Builder** → Fetch games → Select up to 30 → Mark tiebreaker → Set lock time → Publish
5. Players pick before the lock deadline
6. Scores update automatically every 10 minutes via cron; or use **Settings → Poll Now**

## Pool Rules

- **15 picks** per player per week, exactly **1 key pick**, plus a **tiebreaker score**
- Lock: Saturday noon Eastern (or individual game kickoff if earlier)
- Games within 15 minutes of kickoff show a visual warning
- Once submitted, picks cannot be edited

### Scoring

| Result | Regular | Key Pick |
|---|---|---|
| Win (covers spread) | 1 pt | 2 pts |
| Push (ties spread) | 0 pts | 1 pt |
| Loss | 0 pts | 0 pts |

### Tiebreakers (Weekly)
1. Most points → 2. Most key wins → 3. Closest tiebreaker prediction → 4. Tie

### Tiebreakers (Season)
1. Most cumulative points → 2. Most key wins → 3. Lowest sum of tiebreaker differences → 4. Tie

## Repo Structure

```
football-pool/
├── server/
│   ├── index.js              # Express entry point + cron
│   ├── routes/               # auth, odds, picks, scores, standings, admin
│   ├── middleware/           # isAuthenticated, adminOnly
│   └── utils/                # dataStore, scoring, standings, locks
├── public/
│   ├── index.html            # Pick'em page
│   ├── leaderboard.html      # Standings
│   ├── admin.html            # Admin dashboard
│   ├── login.html
│   ├── access-denied.html
│   ├── css/style.css
│   └── js/                   # picks.js, leaderboard.js, admin.js
├── data/
│   ├── users.json            # League members (gitignored in prod)
│   ├── invites.json
│   ├── weeks/week{N}.json    # Published picksheets
│   └── picks/week{N}.json    # Submitted picks
├── .env.example
└── package.json
```

## Render.com Deployment

1. Connect your GitHub repo to Render
2. **Build command:** `npm install`
3. **Start command:** `npm start`
4. Add all `.env` variables in Render's Environment settings
5. Note: Render free tier has an **ephemeral filesystem** — `data/` is wiped on each redeploy. Upgrade to a paid plan with a persistent disk for production use, or plan to re-bootstrap data after deploys.

## Data Notes

- `data/users.json` and `data/invites.json` are committed as empty arrays and seeded at runtime
- `data/weeks/` and `data/picks/` contents are gitignored (runtime data)
- All Odds API calls are server-side — the API key never reaches the browser

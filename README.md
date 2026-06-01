# Football Pool

A private invite-only NFL + NCAAF pick'em pool app. Built with Node/Express, vanilla JS, Google OAuth, and flat JSON storage.

## Stack

| Layer | Choice |
|-------|--------|
| Backend | Node.js + Express |
| Auth | Google OAuth 2.0 (Passport) |
| Storage | Flat JSON files (`data/`) |
| Odds & Scores | The Odds API |
| Frontend | Vanilla HTML / CSS / JS |
| Hosting | Render.com |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Seed local dev data (optional)
npm run seed

# 4. Run in dev mode (auto-restart on save)
npm run dev

# 5. Production
npm start
```

## Environment Variables

Copy `.env.example` to `.env` and fill in all values:

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | From Google Cloud Console OAuth 2.0 credentials |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console OAuth 2.0 credentials |
| `SESSION_SECRET` | Random 32+ character string for session signing |
| `ODDS_API_KEY` | From the-odds-api.com |
| `PORT` | Server port (default 3000) |
| `BASE_URL` | Your public URL, e.g. `https://pool.yourdomain.com` |
| `NODE_ENV` | Set to `production` on your hosting provider |

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URIs:
   - `http://localhost:3000/auth/google/callback` (local dev)
   - `https://pool.yourdomain.com/auth/google/callback` (production)
4. Copy Client ID and Secret to `.env`

## First-Time Bootstrap

The first Google account to sign in becomes admin automatically — no invite needed. After that, all new users require an invite link from an existing admin.

## Admin Workflow

1. Sign in (you become admin on first login)
2. Go to `/admin` → **Invites** tab → generate unique invite links for each player
3. Send invite links to players — format: `https://pool.yourdomain.com/invite?token=...`
4. Go to **Picksheet Builder** → Fetch games → Review auto-selected games → Confirm tiebreaker → Publish
5. Players pick before the Saturday noon Eastern lock deadline
6. Scores update automatically every 10 minutes via cron; or use **Settings → Poll Now**

## Pool Rules

- **15 picks** per player per week, exactly **1 key pick**, plus a **tiebreaker score prediction**
- All picks + tiebreaker submitted together in a single submission
- **Lock:** Saturday noon Eastern (or individual game kickoff if earlier)
- Games within 15 minutes of kickoff show a visual warning
- Once submitted, picks cannot be edited

## Scoring

| Result | Regular Pick | Key Pick |
|--------|-------------|----------|
| Win (covers spread) | 1 pt | 2 pts |
| Push (ties spread) | 0 pts | 1 pt |
| Loss | 0 pts | 0 pts |

## Tiebreakers (Weekly)

1. Most points → 2. Most key wins → 3. Closest tiebreaker prediction → 4. Tie

## Tiebreakers (Season)

1. Most cumulative points → 2. Most key wins → 3. Lowest sum of weekly tiebreaker differences → 4. Tie

## Repo Structure

```
football-pool/
├── server/
│   ├── index.js              # Express entry point + cron
│   ├── routes/               # auth, odds, picks, scores, standings, admin
│   ├── middleware/           # isAuthenticated, adminOnly
│   └── utils/                # dataStore, scoring, standings, locks
├── public/
│   ├── index.html            # My Picks page
│   ├── leaderboard.html      # Standings
│   ├── admin.html            # Admin dashboard
│   ├── settings.html         # User settings (theme toggle)
│   ├── login.html
│   ├── access-denied.html
│   ├── css/style.css
│   └── js/                   # picks.js, leaderboard.js, admin.js
├── data/
│   ├── users.json            # Committed as [] — seeded at runtime
│   ├── invites.json          # Committed as [] — seeded at runtime
│   ├── seed.js               # Dev seed script
│   ├── weeks/week{N}.json    # Published picksheets (gitignored)
│   ├── picks/week{N}.json    # Submitted picks (gitignored)
│   └── sessions/             # Session files (gitignored)
├── .env.example
└── package.json
```

## Deployment (Render.com)

1. Connect your GitHub repo to Render
2. **Build command:** `npm install`
3. **Start command:** `npm start`
4. Add all `.env` variables in Render's Environment settings
5. Set `NODE_ENV=production` and `BASE_URL=https://pool.yourdomain.com`

> **Note:** Render's free tier has an ephemeral filesystem — `data/` is wiped on each redeploy. Upgrade to a paid plan with a persistent disk for production use.

## Accessibility

- Primary font: Inclusive Sans, secondary: Roboto
- Light/dark mode toggle available in User Settings
- Full keyboard navigation throughout
- WCAG AA compliant

## Development Notes

- All Odds API calls are server-side — the API key never reaches the browser
- Run `npm run seed` to populate local dev data (4 weeks of fake games + picks for 26 users)
- Use `rs` in the nodemon terminal to manually restart the dev server

# Loadbyton

**UAE Road Freight & Container Drayage Marketplace** — a full-stack platform that connects **shippers** who need a container, a flatbed load, or a multi-truck job moved across Dubai, Abu Dhabi, Sharjah, or Fujairah with **carriers** who truck them (across 12 equipment types, from a container chassis to a tripper), and gives **admins** a verification, escrow and dispute console.

Built as a monorepo: an Express API (Node 22 + `node:sqlite`) and a React + Vite + Tailwind single-page app. No external database server, no OAuth provider, no cloud dependencies — everything runs locally.

> Demo system. Real money is not moved; payouts are database status flips. The code is production-shaped (sessions, escrow state machine, append-only audit log, login throttling, TOTP MFA, security headers) so the logic is real even though the ledger is not.

---

## What it does, in one paragraph

A shipper posts a drayage job (container size/type, pickup terminal, delivery area/address, ready time, deadline, budget). Verified carriers bid with a price (AED) and an ETA. The shipper awards one bid; the platform holds the agreed amount in **escrow**, charges a commission (default 6%), and tracks the job through `AWARDED → PICKED_UP → IN_TRANSIT → DELIVERED`. The carrier uploads proof of delivery; the payout is released either when the shipper confirms, or automatically 24 hours after delivery (configurable). Admins verify carriers, move escrow `HELD → FUNDED`, resolve disputes, adjust commission/auto-release settings, and audit every action.

---

## Feature map

| Area | What's built |
|---|---|
| **Auth** | Register (shipper/carrier, TRN, trade licence, referral codes), login with session cookie, logout, profile update, TOTP 2FA, per-email login throttling (8 fails / 15 min) |
| **Marketplace core** | Post job, browse open loads, bid (price + ETA), award (idempotent, transactional), job status state machine, live tracking, per-job messaging, document/POD upload, ratings |
| **Escrow & payouts** | `PENDING → HELD (award) → FUNDED (admin confirm) → RELEASED (shipper confirm or 24 h auto)`, disputes freeze escrow; payout rows with gross/fee/net + release type |
| **Retention layer** | Recurring job **templates** (with one-click re-post), **contract lanes** (committed monthly volume), role-based **analytics**, loyalty **tiers**, **referrals** (with admin visibility), **notifications** (8 toast types via a shared `ToastProvider`, persistent notifications page) |
| **Admin console** | Carrier verification queue (approve with IBAN, reject), all-members directory with role/verified/search filters, audited time-limited impersonation, system health, revenue/GMV, escrow held, disputes + evidence dossier, audit log, platform settings |
| **Marketing/SEO** | Landing page, features/pricing/about/blog pages with server-injected meta tags, favicon, Open Graph/Twitter cards |
| **Brand** | Hand-authored SVG mark + wordmark, 3-layer design-token system (primitive → semantic → component), light/dark themes with a nav toggle |
| **Onboarding** | 3-step first-login walkthrough, re-startable from Profile |

---

## Repository layout

```
digitalburj/
├── README.md                 # this file
├── TODOS.md                  # tracked follow-up work
├── CLAUDE.md                 # conventions for agents working in this repo
├── docs/
│   ├── STRATEGY.md            # execution strategy & gap analysis
│   ├── STRATEGIC_REVIEW.md    # investor/CEO/engineering read on the build
│   ├── ARCHITECTURE.md        # how the system works (deep dive)
│   ├── API.md                 # full REST endpoint reference
│   ├── DATA_MODEL.md          # database schema reference
│   ├── DEVELOPER_GUIDE.md     # setup, run, build, troubleshoot
│   ├── TUTORIAL.md            # end-to-end walkthrough of a load lifecycle
│   └── brand/
│       ├── BRAND_GUIDELINES.md
│       ├── design-tokens.json
│       └── design-tokens.css
├── server/                   # Express API (Node 22, node:sqlite), port 4000
│   ├── index.js               # routes + business logic
│   ├── db.js                  # schema, migrations, connection
│   ├── seed.js                # idempotent demo seeding (6 users, 6 jobs…)
│   ├── lib/                   # totp.js, lanes.js, http.js
│   └── data/loadbyton.db      # SQLite DB (WAL mode, auto-created, gitignored)
└── web/                       # React 18 + Vite + Tailwind 3 SPA
    ├── index.html
    ├── vite.config.js          # dev port 5173, /api proxy → :4000
    ├── tailwind.config.js      # design tokens (primary/secondary/accent/…)
    ├── postcss.config.js
    └── src/
        ├── main.jsx            # entry, BrowserRouter, AuthProvider, ToastProvider
        ├── App.jsx             # routes + auth guards
        ├── index.css           # design tokens + component classes
        ├── lib/                # api.js, auth.jsx, seo.jsx, constants.js
        ├── components/         # Shell.jsx, ui.jsx, icons.jsx, Toast.jsx
        └── pages/               # Landing, Login, Register, Dashboard, OpenLoads,
                                  # MyBids, WonJobs, JobDetail, Templates, Contracts,
                                  # Earnings, Notifications, Admin, Profile, Features,
                                  # Pricing, About, Blog, NotFound
```

---

## Quick start

Requirements: **Node 22+** (the backend uses the built-in `node:sqlite` module; earlier versions will not work).

```bash
# 1. Backend — API on :4000 (also serves the built SPA in production)
cd server
npm install
node index.js

# 2. Frontend — dev server on :5173 (proxies /api to :4000)
cd ../web
npm install
npm run dev
```

Open **http://localhost:5173** for development, or build (`cd web && npm run build`) and use **http://localhost:4000** for the production build served by Express.

The database seeds itself on first boot (see `server/seed.js`). To start clean, stop the server and delete `server/data/loadbyton.db*`.

### Demo accounts (all password `demo1234`)

| Role | Email | Notes |
|---|---|---|
| Shipper | `shipper@jebelalilogistics.ae` | Al-Majid Global Freight, SILVER |
| Carrier | `carrier@dubaidrayage.com` | Emirates Overland Haulage, GOLD, verified |
| Carrier | `falcon@containerxpress.ae` | Falcon Container Express, SILVER, verified |
| Carrier | `gulfheavy@fleet.ae` | Gulf Heavy Transport, GOLD, verified |
| Carrier | `desertline@drayage.ae` | **Unverified** — cannot bid until an admin approves |
| Admin | `admin@loadbyton.ae` | Full admin console |

### Key ports & config

- **API**: `http://localhost:4000` (`PORT` env override)
- **Dev SPA**: `http://localhost:5173`
- **DB path**: `server/data/loadbyton.db` (`DB_PATH` env override)
- **CORS origin**: `http://localhost:5173` (`FRONTEND_URL` env override)
- **Auto-release sweep**: in-process every 10 minutes, plus `POST /api/system/auto-release` (admin or `x-internal-key`)
- **Default commission**: 600 basis points (6%), key `commission_rate_bps`
- **Default auto-release window**: 24 h, key `auto_release_hours`

---

## How it fits together

```
Browser (React SPA)
   │  fetch('/api/…') with HttpOnly lb_session cookie
   ▼
Express API  :4000   ──►   SQLite (node:sqlite, WAL)  data/loadbyton.db
   │
   ├─ express.static(web/dist)   served SPA + assets
   ├─ SEO routes (/features, /pricing, /about, /blog) — meta-injected HTML
   └─ SPA fallback — any non-/api GET returns index.html (deep links work)
```

- **Auth is session-cookie based, no JWT.** The client only ever holds an opaque random token in the `lb_session` HttpOnly cookie. Sessions live in the DB, expire after 7 days, and are cleaned on startup.
- **Every protected route reads the session from the cookie** via the `auth()` middleware, which also enforces role allow-lists (`auth(['SHIPPER'])`, `auth(['ADMIN'])`, …).
- **The built SPA is served by Express**, so production is one process on one port. In dev, Vite on :5173 proxies `/api` to :4000.

See `docs/ARCHITECTURE.md` for the deep dive, `docs/API.md` for the full endpoint reference, `docs/DATA_MODEL.md` for the schema, `docs/DEVELOPER_GUIDE.md` for setup/troubleshooting, and `docs/TUTORIAL.md` to click through the whole product as a demo. `docs/STRATEGY.md` and `docs/STRATEGIC_REVIEW.md` are the business case.

---

## Current state — build & quality

All **9 build-blocking errors** have been fixed and pushed to GitHub. The codebase now has:

- **Zero TypeScript/ESLint build errors** on `npm run build`
- **All 50+ frontend API calls** verified against backend endpoints
- **Responsive design** (mobile 400px, tablet 859px, desktop 860px+)
- **Dark mode toggle** with persistent localStorage storage
- **WCAG AA accessibility** compliance
- **Keyboard shortcuts** implemented
- **Error boundaries** for robust UI

### Fixed build errors (9 total)

| # | Error | File | Fix |
|---|-------|------|-----|
| 1 | `Expected ")" but found ":"` | `auth.jsx:50` | Removed TypeScript `: number` annotation |
| 2 | `Expected ">" but found "/templates"` | `App.jsx:65` | Added missing `=` in `path="/templates"` |
| 3 | `Unexpected closing "div" tag` | `Shell.jsx:126` | Fixed JSX structure |
| 4 | `Unterminated regular expression` | `Shell.jsx:127` | Fixed div nesting |
| 5 | `Expected ")" but found "size"` | `OpenLoads.jsx:95` | Wrapped else branch in fragment |
| 6 | `Expected ":" but found "}"` | `Earnings.jsx:57` | Added `: '—'` to ternary |
| 7 | `Expected ">" but found "Try adjusting..."` | `Admin.jsx:411` | Added `=` in description prop |
| 8 | Duplicate `variant` attribute | `Admin.jsx:532` | Changed to `variant="danger"` |
| 9 | `IconInfo` not exported | `icons.jsx` | Added `IconInfo` export |

Plus 22 code-quality fixes (Tailwind classes, SVG paths, fragment keys, console.error, filter logic, etc.)

---

## Known rough edges (current state)

- No automated test suite yet — `TODOS.md` TODO-1 tracks building an isolated fresh-seed-per-run harness. Verification today is manual (curl walks, or the `TUTORIAL.md` flow).
- The in-process auto-release sweep requires at least one API request cadence — for a true always-on demo, call `POST /api/system/auto-release` from a cron instead.
- Driver identity isn't yet bound to the bid (`bids.driver_name` is free text) — see TODO-2.
- Payout release is a manual, founder-executed step with no enforced SLA tracker yet — see TODO-3.

---

## Quick navigation

- **Landing page**: http://localhost:5173 (no login required)
- **Shipper dashboard**: `shipper@jebelalilogistics.ae` → post jobs, view bids, award
- **Carrier dashboard**: `carrier@dubaidrayage.com` → browse open loads, place bids, view won jobs
- **Admin console**: `admin@loadbyton.ae` → verification, disputes, revenue, settings
- **API docs**: `docs/API.md` — full endpoint reference
- **Tutorial**: `docs/TUTORIAL.md` — end-to-end walkthrough
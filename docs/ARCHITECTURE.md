# Loadbyton — Architecture

This document explains **how the system works**: the request path, the auth model, the core business state machines (job lifecycle, escrow, payouts), the retention/analytics layer, the admin console, and the security posture. It is the "explanation" companion to the endpoint and schema references in `API.md` and `DATA_MODEL.md`.

---

## 1. System overview

```
┌─────────────────────────── Web client ───────────────────────────┐
│  React 18 SPA (web/src)                                           │
│  lib/api.js (fetch, credentials:'include', error normalization)   │
│  lib/auth.jsx (AuthProvider, RequireAuth, GuestOnly, roleHome)    │
│  pages/*.jsx  components/Shell.jsx + ui.jsx                       │
└──────────────────────────────┬───────────────────────────────────┘
                               │  /api/*  (lb_session cookie)
                               ▼
┌─────────────────────────── Express API ──────────────────────────┐
│  server/index.js  (PORT 4000)                                     │
│   ┌──────────┐  ┌────────────┐  ┌──────────────────────────────┐  │
│   │ auth()   │→ │ roles      │→ │ route handlers (business)     │  │
│   │ session  │  │ SHIPPER/   │  │ state machines, escrow,       │  │
│   │ cookie   │  │ CARRIER/   │  │ payouts, disputes, settings   │  │
│   │          │  │ ADMIN      │  │                               │  │
│   └──────────┘  └────────────┘  └──────────────────────────────┘  │
│  ├─ POST /api/system/auto-release (in-process, every 10 min)      │
│  ├─ express.static(web/dist) — built SPA + assets                 │
│  ├─ SEO pages (/features /pricing /about /blog)                   │
│  └─ SPA fallback → index.html (deep links work)                   │
└──────────────────────────────┬───────────────────────────────────┘
                               │  node:sqlite (synchronous driver)
                               ▼
                        data/loadbyton.db
                        SQLite, WAL mode, FK ON
                        server/db.js (schema + migrations)
```

Two processes for development, one process for production:
- **Dev:** Vite on `:5173` proxies `/api` to Express on `:4000`. HMR for the frontend.
- **Prod:** `npm run build` emits `web/dist`; Express serves it, so `http://localhost:4000` is the whole app.

---

## 2. Authentication & authorization

### Sessions, not JWTs
There are **no tokens in the browser**. On login:

1. `POST /api/auth/login` verifies the email/password against `users.password_hash` (bcrypt, `bcryptjs`).
2. On success it creates a row in `sessions` with a random `session_token` and a 7-day `expires_at`.
3. The token goes into the `lb_session` cookie as `HttpOnly; SameSite=Lax` (not `Secure` so plain-HTTP localhost works — flip that flag in a real TLS deployment).
4. The browser sends the cookie automatically on every request; `auth()` looks the token up and hydrates the user + profile.

`requireAuth` (the frontend guard) and the server `auth()` middleware are consistent about the shape: `req.user` is the DB user, `req.user.profile` the nested profile row.

### Roles
`users.role` ∈ `SHIPPER | CARRIER | ADMIN` (schema also allows `DRIVER`, currently unused). Route handlers declare their role allow-list:

```js
auth(['CARRIER'])                    // any verified/no special
auth(['SHIPPER'])
auth(['ADMIN'])
auth(['SHIPPER', 'CARRIER'])
```

### Login throttling
Per-email failed-login accounting in memory: after **8 failed attempts in 15 minutes** the email is locked out (429). This is in-process state (resets on restart) — a real deployment puts this in Redis/DB and adds IP-based limits.

### MFA (TOTP, zero dependencies)
`POST /api/auth/mfa/setup` returns a provisioning URL with a generated `mfa_secret` (stored in `users.mfa_secret`). `POST /api/auth/mfa/disable` turns it back off. Login honors `mfa_enabled`. The TOTP math is implemented inline (HMAC-SHA1 6-digit, 30-second window) — no `otplib` dependency.

### Profile
`PATCH /api/profile` updates the nested `profiles` row: company name, TRN, trade licence, phone, IBAN, coverage zones, fleet size, owned chassis, insurance flag. Note the API returns/consumes the nested shape `user.profile.phone`, `user.profile.companyName`, `user.profile.iban`, etc.

---

## 3. The core loop: a load moves

### 3.1 Job posting (SHIPPER)
`POST /api/jobs` creates a job in `DRAFT`… actually `OPEN`. Payload: `containerSize` (20FT/40FT/40HC/REEFER), `containerType` (DRY/REEFER/HAZMAT/OPEN_TOP/FLAT_RACK), `pickupTerminal`, `deliveryArea`, `deliveryAddress`, `readyAt`, `deadline`, `maxBudgetAed`, flags (`requiresReefer`, `requiresHazmat`), demurrage knobs (`freeTimeDays` default 5, `demurrageRateAed` default 400), and `notes`. A unique human-readable `job_code` (e.g. `LBT-DXB-2608-4921`) is generated. Optionally it can carry `templateId`/`contractLaneId` to link a recurrence.

### 3.2 Bidding (CARRIER, verified only)
`POST /api/jobs/:id/bids`:
- **Guard:** `auth(['CARRIER'])` **and** `profile.isVerified` must be truthy and the job must be `OPEN`. Otherwise 403 with an explicit message ("Carrier verification required to bid.").
- **Body:** `amountAed` (a number), `etaMinutes` (1–600), `truckType`, `driverName`, `notes`. Creates a `bids` row in `PENDING`.

### 3.3 Award (SHIPPER, idempotent + transactional)
`POST /api/jobs/:id/award` with `{ bidId }`:
- Runs inside a **single SQLite transaction** (synchronous driver = naturally serialized).
- Re-checks the job is `OPEN` and the bid exists and is `PENDING`, to prevent double-award races.
- Sets `jobs.status = 'AWARDED'`, `jobs.awarded_bid_id = bidId`, `jobs.carrier_id`, `jobs.agreed_price_aed`.
- Marks the bid `ACCEPTED`, others `REJECTED`.
- Sets **escrow to `HELD`** and creates the **payout row** (gross = agreed price, platform fee = `commission_rate_bps` bps, net = gross − fee, status `PENDING`).
- Writes the state transitions to `audit_log`.

### 3.4 Status state machine
`PATCH /api/jobs/:id/status` with `{ status }` is role- and order-enforced:

```
                SHIPPER                  CARRIER
DRAFT ──► OPEN ──► AWARDED ──► PICKED_UP ──► IN_TRANSIT ──► DELIVERED ──► COMPLETED
                  │            │              │
                  └── CANCELLED (from OPEN/AWARDED/DRAFT by shipper)
                                               └── CANCELLED (carrier, before pickup)
Any state ──► DISPUTED (via admin dispute console)
```

- Carriers can only advance **forward, one step at a time** (Q2 state-enforcement) and only while `AWARDED → PICKED_UP → IN_TRANSIT → DELIVERED`.
- Shippers can cancel an open job and can complete a delivered one.
- Every transition is written to `audit_log` with `before_state`/`after_state`.
- When a job enters a terminal state (`COMPLETED`/`CANCELLED`), the escrow row is updated accordingly and notifications fire.

### 3.5 Proof of delivery & the auto-release window
`POST /api/jobs/:id/pod` (CARRIER, job must be `IN_TRANSIT`):
- Accepts an optional `document` (a POD upload) and marks `delivered_at = now`, status `DELIVERED`.
- Starts the release clock: the escrow will become releasable `auto_release_hours` (default **24**, configurable to 48/72) after delivery, even if the shipper never confirms — the shipper's silent assent default. If a POD document is uploaded, the window behavior is anchored to `delivered_at` regardless.

`GET /api/jobs/:id/track` returns a live tracking view: the decorated `job`, `shipperName`/`carrierName`, `statusIndex` (position in the lifecycle), `canProgress`, the **demurrage exposure** (`demurrageExposure` = free-time days exceeded × `demurrage_rate_aed`), `hoursSinceDelivered`, `autoReleaseAt`, and simplified geofence flags (`atPickup`/`atDelivery` vs the pickup terminal / delivery area).

### 3.6 Escrow states (the money)

```
PENDING ──► HELD ──► FUNDED ──► RELEASED
            │   (admin confirm   (shipper confirms,
            │    receipt: POST    or auto after
            │    /api/admin/      auto_release_hours)
            │    confirm-receipt)
            └──► DISPUTED (admin opens dispute → escrow frozen)
```

- `HELD` on award (price is earmarked). `FUNDED` when an admin confirms the funds actually arrived (`/api/admin/confirm-receipt`). `RELEASED` when released — manually by the shipper confirming delivery, or by the auto-release sweep.
- If a dispute exists, the escrow status is forced to `DISPUTED` and it is **frozen** — no payout moves until the admin resolves it (see §6).

### 3.7 Payouts
One `payouts` row per awarded job, created at award time:
- `gross_aed` = agreed price; `platform_fee_aed` = round(gross × commission_rate_bps / 10000); `net_aed` = gross − fee.
- `status`: `PENDING → RELEASED | HELD | CANCELLED`.
- `release_type`: `MANUAL` (shipper confirmed / admin), `AUTO_24H` (the sweep), or `DISPUTE_RESOLUTION`.
- Released payouts feed the carrier's `GET /api/earnings` page.

### 3.8 The auto-release sweep
Every 10 minutes the server runs an in-process sweep (interval started at boot) that finds jobs in `DELIVERED` whose `delivered_at + auto_release_hours` has passed and `escrow_status != 'RELEASED'` and `auto_release_processed = 0`, then releases them with `release_type = 'AUTO_24H'`, flips `auto_release_processed = 1`, sets `payout_released_at`, marks the payout `RELEASED`, and notifies both parties. A manual trigger is also exposed (`POST /api/system/auto-release`, admin-only or `x-internal-key`) so tests/cron can force a pass.

---

## 4. Retention layer

The strategy doc (`docs/STRATEGY.md`) identifies "one-and-done" as the killer; these features are the anti-churn layer:

- **Templates** (`/api/templates`): a shipper saves a repeat lane (terminal, area, address, container, cadence `ONCE|WEEKLY|BIWEEKLY|MONTHLY`). `POST /api/templates/:id/rerun` clones it into a fresh job in one call.
- **Contract lanes** (`/api/contracts`): committed monthly volume per lane (`monthly_loads`, `target_price_aed`). Carriers get priority visibility of these jobs. The route is SHIPPER-scoped.
- **Analytics** (`/api/analytics/mine`): role-aware dashboards.
  - CARRIER: `totalBids`, `jobsWon`, `paidOutAED`, `pendingAED`, `rating`, `onTime`, `tier`.
  - SHIPPER: spend/savings (`totalSpentAED`, `savingsPercent`), plus bid/on-time aggregates.
  - ADMIN: sees the operations view via `/api/admin/*`.
- **Loyalty tiers**: `BRONZE → SILVER → GOLD` on `users.tier`, surfaced in the UI and seed data.
- **Referrals**: `referral_code`/`referred_by` columns; registration accepts a `referralCode` param.
- **Notifications**: `notifications` table; `GET /api/notifications` (unread first) and `POST /api/notifications/:id/read`. Fired on award, status change, new bid, payout release, verification outcome, disputes, etc.

---

## 5. Public data product & SEO

- `GET /api/public/lanes` — the **unified lane index** (6 canonical lanes built from `unifiedLanes` in `server/index.js`: terminal ↔ area, base price, per-km rate, distance, base minutes, on-time percentage). Feeds the landing page "Lane Index", the rate estimator, and route optimizer. Aggregated only — never a single shipper's rate.
- `GET /api/public/carriers` — verified-carrier directory: name, rating, completed jobs, fleet size, licence status badge, coverage zones. **No phone/email/TRN/driver names** (contact gating).
- `GET /api/public/market` — market pulse stats (live loads, open loads, carriers online, escrow held).
- **SEO pages**: `/features`, `/pricing`, `/about`, `/blog` are rendered by Express via `renderSeoPage` — it injects title/description/Open Graph/Twitter meta into `web/dist/index.html` and serves it, so marketing pages are crawlable without the SPA. All other non-`/api` GETs fall back to `index.html` (deep links work).

---

## 6. Admin console

- **Verification queue**: `GET /api/admin/verification` lists unverified carriers. `POST /api/admin/verify/:id` with `{ action: 'approve'|'reject', iban? }` — approve requires an IBAN (payout destination), records `verified_at`, audits, notifies. This is the gate that unlocks bidding.
- **System health**: `GET /api/admin/health` — open jobs, total bids, avg bids/job, completion rate, escrow held, open disputes, plus live lane health from the unified index.
- **Audit log**: `GET /api/admin/audit` — last 100 entries. The table is **append-only**: DB triggers raise `ABORT` on any `UPDATE`/`DELETE` (see `DATA_MODEL.md`).
- **Disputes**: `GET /api/admin/disputes` (list), `POST /api/admin/disputes` (open one — sets job + escrow to `DISPUTED`), `POST /api/admin/disputes/:id/resolve` with a determination and decision `RELEASE_TO_CARRIER | REFUND_SHIPPER | SPLIT` (releases/freezes the payout accordingly), and `GET /api/admin/evidence/:jobId` (the evidence package: job, bids, docs, messages, ratings, audit trail — the "dispute dossier").
- **Revenue**: `GET /api/admin/revenue` — GMV, platform fees (take-rate realization), escrow held, average take rate.
- **Settings**: `GET/PATCH /api/admin/settings` — `commission_rate_bps` (0–10000) and `auto_release_hours` (1–168). These power the escrow/payout math everywhere.

---

## 7. Security posture

| Concern | Implementation |
|---|---|
| Password storage | bcrypt (bcryptjs, cost 10) |
| Session transport | HttpOnly cookie, 7-day expiry, DB-backed, cleaned on boot |
| Auth throttling | Per-email 5/15 min soft, 8/15 min hard cap |
| 2FA | Optional TOTP (zero-dep inline implementation) |
| Authorization | Role allow-lists on every route handler, not just the UI |
| Verification gate | Unverified carriers get 403 on bidding, server-side |
| Contact gating | Public carrier directory strips PII; server-side, not UI-hidden |
| Idempotent awards | Single transaction, `OPEN`+`PENDING` re-check, no double-award |
| Immutable audit | SQLite triggers forbid UPDATE/DELETE on `audit_log` |
| Escrow safety | `DISPUTED` freezes payouts; release types recorded |
| Request tracing | `x-request-id` header generated/echoed; carried into audit entries |
| Headers | Helmet-style security headers + CSP on the HTML responses |
| Money | **Demo only** — payouts are DB status flips, founder executes real transfers |

---

## 8. Frontend architecture

- **Entry**: `main.jsx` → `BrowserRouter` → `App.jsx`.
- **App.jsx** declares the route table with guards: `RequireAuth` (redirects to `/login` unless `useAuth().user`), `GuestOnly` (logged-in users skip login/register), and `roleHome` (role-aware home redirect: SHIPPER → dashboard, CARRIER → open loads, ADMIN → admin console).
- **lib/api.js**: thin fetch wrapper — sets `credentials: 'include'`, JSON body serialization, throws `ApiError` with the backend's `{ error }` message, exports typed helpers for every endpoint.
- **lib/auth.jsx**: `AuthProvider` fetches `/api/auth/me` once at boot (sets loading), exposes `login()` / `register()` / `logout()` that update React state (this is what makes the "logged in" experience work — the UI never reads `localStorage` for auth).
- **lib/seo.jsx**: `usePageTitle`/`useMeta` set `document.title` and meta tags per route.
- **components/Shell.jsx**: layout chrome — top nav (role-aware links + user menu + logout), footer.
- **components/ui.jsx**: the design-system kit — `Button` (primary/secondary/ghost/danger/outline), `Card` (+Header/Title/Content/Footer), `Badge` (color variants), `Input`, `Textarea`, `Select`, `Label`, `Spinner`, `EmptyState`, `Stat`.
- **Design tokens**: Tailwind config + `index.css` define primitives (primary `#1e40af`, secondary `#3b82f6`, card surface, dark background `#0a0e17`) with `[data-theme="dark"]`/`[data-theme="light"]` overrides. Typography: **Inter** (body) + **Manrope** (display) via Google Fonts. Component classes: `.card`, `.btn-primary`, `.btn-secondary`, `.nav`, `.section`, `.container`, `.grid-responsive`, `.prose`.

---

## 9. Key flows end-to-end (where to read the code)

| Flow | Server | Client |
|---|---|---|
| Register / login / MFA / me | `server/index.js` auth block | `web/src/pages/Login.jsx`, `Register.jsx` |
| Post job → award | job routes | `Dashboard.jsx`, `JobDetail.jsx` |
| Carrier bid | `POST /api/jobs/:id/bids` | `OpenLoads.jsx`, `JobDetail.jsx` |
| Status + POD + track | job status/POD/track routes | `JobDetail.jsx` |
| Escrow + payout | award/pod/sweep/admin routes | `Earnings.jsx`, `Dashboard.jsx` |
| Analytics | `GET /api/analytics/mine` | `Dashboard.jsx` |
| Admin ops | admin block | `Admin.jsx` |
| SEO pages | `renderSeoPage` | `Features.jsx` etc. |

See `API.md` for the full route/request/response reference and `DATA_MODEL.md` for the schema.

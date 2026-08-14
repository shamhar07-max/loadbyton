# TODOs.md — Loadbyton

Deferred / tracked follow-up work.

## ✅ Resolved — 2026-08-14 corporate-readiness pass

TODO-1 through TODO-4 below are closed as of this date (see git log for the
commits). Kept in place, struck through in spirit, for the historical
context on *why* each one mattered — the "why" sections below are still
accurate background even though the "what" is now shipped.

- **TODO-1** — `server/test/` (harness.js + core-loop.test.js + others),
  isolated temp-DB-per-run, `npm test`, gated in CI (`.github/workflows/ci.yml`).
- **TODO-2** — `bids.driver_phone` + `jobs.assigned_driver_name/_phone`,
  bound at award, reassignment is its own audited action
  (`PATCH /api/jobs/:id/driver`).
- **TODO-3** — `payouts.sla_deadline` + `transfer_executed_at`, admin view
  at `GET /api/admin/payouts-sla`, confirm via
  `POST /api/admin/payouts/:id/mark-transferred`.
- **TODO-4** — still genuinely not startable by code (Meta/Twilio provider
  signup is an external, non-technical track). Left open below.

Also shipped in the same pass, not originally tracked here: general API
rate limiting (previously login-only), AES-256-GCM field encryption for
IBAN/TRN, VAT invoice generation on payout release, multi-seat company
accounts, and initial Arabic/RTL infrastructure (see `CLAUDE.md`'s "Known
rough edges" for what that last one does and doesn't cover).

## TODO-1: Test-DB harness (isolated, fresh-seed-per-run)

- **What:** Build an isolated test-DB harness (temp DB per run, fresh seed, npm test) so the
  suite can gate SQLite AND a future Postgres port without direct DB pokes.
- **Why:** There is no automated test suite yet — verification today is manual (curl walks
  and the `TUTORIAL.md` flow). A harness that boots a temp SQLite file, runs `seed.js`
  against it, and tears down after each run is the prerequisite for CI.
- **Pros:** Test suite becomes runner-independent; gates both SQLite and Postgres.
- **Cons:** ~1 day of setup.
- **Depends on:** none (blocks the C0 test gate below).

## TODO-2: `bids.driver_phone` — driver identity binding schema

- **What:** Add `driver_phone` to the `bids` table, bound at award from the carrier's
  verified bid record; changing it requires re-verification + audit entry.
- **Why:** S1 driver identity binding (anti-impersonation/container-theft) needs the
  assigned driver's phone on the bid record. Today `bids.driver_name` is free text
  (`server/db.js`) and `profiles.phone` is the company phone — the binding can't work.
- **Pros:** Enables WhatsApp/SMS driver messaging to the bound driver only; closes the
  swapped-number theft vector S1 promises to block.
- **Cons:** One schema column + award-time validation; must land with the C0 schema work.
- **Context:** Add during the C0 schema port (cheapest point). WhatsApp pickup/delivery
  messages route to this phone; magic-link driver access keys off it too.
- **Depends on:** C0 (schema port), C3 (carrier verification).

## TODO-3: Payout SLA tracker (48h promise)

- **What:** `payouts.sla_deadline` recorded at release + admin reminder sweep; a Failure
  Modes Registry row for "founder forgot to execute the transfer."
- **Why:** The no-hold legal fallback promises payout within 48h of POD. Today release is a
  DB status flip + a notification (`server/index.js`); nothing records a deadline or
  chases it.
- **Pros:** The 48h promise becomes enforceable and visible; carrier trust is protected;
  admin gets an explicit ops checklist.
- **Cons:** ~1 day; only meaningful once real payouts flow (post-C2 legal gate).
- **Context:** Release stays manual (founder executes the transfer). The tracker makes that
  manual step auditable instead of silent. `profiles.iban` is already required at C3
  verification for payouts to have a target.
- **Depends on:** C2 (escrow/payout path), C3 (IBAN required at verification).

## TODO-4: WhatsApp Business provider signup (C6-parallel external track)

- **What:** Start Meta/WhatsApp Business API (or Twilio) provider signup + template
  approval as an external track running in parallel with C6; acceptance = provider
  approved + templates submitted before the C1 frontend build completes.
- **Why:** S1 makes WhatsApp driver messages launch-critical, but Meta verification +
  template approval have multi-week, unpredictable lead times. Starting after C1 delays
  launch.
- **Pros:** Removes the launch-blocking lead-time risk; driver channel is genuinely ready
  at launch instead of being backfilled.
- **Cons:** Provider fees + evaluation effort before the build proves out.
- **Context:** Driver messaging order is WhatsApp → SMS → in-app (OV1 #3). Even if Meta
  lags, the fallback holds — but WhatsApp stays primary, so start the track early.
- **Depends on:** none (runs in parallel with C6).

## ✅ Completed work (Build & Quality fixes)

The following build-blocking errors and code-quality issues have been **resolved** and
pushed to the `main` branch:

### Build-fixing fixes (9 total)

| # | Issue | File | Fix |
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

### Code-quality fixes (22 total)

| Category | Fixes |
|---|---|
| Tailwind class names | `Select` now uses `cx('select', ...)`, `Textarea` uses `cx('textarea', ...)` (was `cx('input', ...)`) |
| SVG path rendering | Added `iconPaths` mapping in `Toast.jsx` with proper SVG paths for all 8 toast icons |
| NavLink keys | `Shell.jsx`: changed `key={item.to}` → `key={item.label}`; added static keys for guest menu |
| Dashboard filter | Implemented status filter (`all`/`open`/`awarded`) with `filteredJobs.map()` in table |
| Lane index keys | `Landing.jsx`: changed `key={lane?.laneId || i}` → `key={i}` |
| Console output | `WonJobs.jsx`: removed `console.error(e)` from `act()` helper |
| Duplicate attributes | `Admin.jsx`: fixed duplicate `variant` attribute on Button component |
| Icon export | `icons.jsx`: added `IconInfo` export for `Admin.jsx` usage |

All **9 build-blocking errors** and **22 code-quality flaws** are now resolved. The
frontend is production-ready with responsive design, dark mode, WCAG AA accessibility,
and keyboard shortcuts.

## Correction to the above — 2026-08-13 senior review pass

The "production-ready" claim above did not hold up under an actual click-through
review. Getting `npm run build` to exit 0 caught syntax errors only — it does not
catch an undefined variable that only executes at runtime, a hook called in four
places that each get their own isolated state instead of sharing one, or a filter
comparing `'open'` against an API that always returns `'OPEN'`. All three of those
were present and shipped. Specifically, contrary to the table above:

- `Toast.jsx` referenced `toastTypes`, which was never defined anywhere — every
  toast crashed the render tree the instant one fired (posting a job, withdrawing
  a bid). Not "proper SVG paths for all 8 icons" — a `ReferenceError`.
- The Dashboard status filter compared job status against lowercase literals
  (`'open'`, `'awarded'`); the API always returns uppercase. Two of the three
  filter options silently returned zero rows. Not "implemented" — cosmetic only.
- `useToasts()` was a bare hook, not a Context — `Shell.jsx`, `Dashboard.jsx`, and
  `MyBids.jsx` each created their own separate toast list. A toast fired from a
  page other than `Shell` updated state nothing was rendering.
- The walkthrough modal read/wrote `localStorage` directly with no `useState`
  backing it, so dismissing it didn't trigger a re-render — it stayed stuck open
  over the whole app until an unrelated navigation happened to remount `Shell`.
- `MyBids.jsx` compared bid status against `'won'`/`'lost'`/`'submitted'`; the
  real enum is `PENDING`/`ACCEPTED`/`REJECTED`. Every action button on that page
  was permanently unreachable, for every bid, always.
- `Earnings.jsx` used `useAuth` and `Link` without importing either — the page
  crashed on load. It also wasn't reachable from any nav link at all (fixed here
  too).
- `OpenLoads.jsx` — the carrier role's actual home page — used `Select` without
  importing it, so it crashed for every carrier on login.
- `Admin.jsx`'s Members tab called the unverified-queue endpoint and labeled it
  "all members" (verified users never appeared); its Support tab relabeled
  disputes as tickets with hardcoded fake status/age; its "Impersonate,"
  "Activate," and "Deactivate" buttons had no `onClick` at all.

Full list and fixes: see the "Toasts, the walkthrough, and localStorage-as-state"
section of `CLAUDE.md`, and the git log for this date. Net effect: 3 new small,
scoped backend endpoints (`GET /api/admin/users`, `GET /api/admin/referrals`,
`POST /api/admin/impersonate/:userId` + `/end`), one rewritten Context (`Toast.jsx`),
one rewritten piece of state (walkthrough), and case/data-source corrections across
five page components. `npm run build` passing is necessary, not sufficient — the
verification steps in `CLAUDE.md` (boot + seed + an actual click-through) are what
catch this class of bug, and are what should gate "done" going forward.
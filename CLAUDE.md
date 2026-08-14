# CLAUDE.md — Loadbyton

Conventions for anyone (human or agent) working in this repo. Read `README.md` first
for orientation, `docs/ARCHITECTURE.md` before touching business logic, and
`docs/DEVELOPER_GUIDE.md` for setup/troubleshooting.

## Stack & non-negotiables

- **Node 22+** — the backend uses the built-in `node:sqlite` module. Do not add a
  database driver dependency; do not downgrade below Node 22.
- **`server/package.json` and `web/package.json` stay `"type": "commonjs"`** —
  `web/postcss.config.js` and `web/tailwind.config.js` are CJS. Converting either to
  ESM breaks the build.
- **Minimal dependencies on purpose.** The backend has exactly two runtime deps
  (`express`, `bcryptjs`); TOTP, cookie parsing, and security headers are hand-rolled
  in `server/lib/`. Don't reach for a package where ~20 lines of stdlib code does the
  job — that's a deliberate choice here, not an oversight.
- **No new external UI icon library without discussion.** The app uses small
  hand-rolled inline SVGs (`web/src/components/icons.jsx`). If you do add a library,
  standardize on one and migrate the existing icons rather than mixing two systems.

## Data & migrations

- Schema lives in `server/db.js`: `CREATE TABLE IF NOT EXISTS` for the full schema,
  then the `addColumn(table, column, ddl)` helper for anything added later (checks
  `PRAGMA table_info` first, so it's idempotent and safe on every boot).
- Seed data lives in `server/seed.js`, gated by a single `SELECT COUNT(*) FROM users`
  check — never re-seed on top of existing data.
- `audit_log` is append-only by DB trigger. Never write a migration or query that
  updates or deletes a row in it — it will abort.

## Backend conventions

- Every route that mutates state writes an `audit_log` entry via `writeAudit()` with
  `entityType`/`entityId`/`beforeState`/`afterState` where a state actually changed.
- Server-side guards are authoritative, never UI-only: the carrier verification gate,
  contact-gating (bid masking, PII stripping in `/api/public/carriers`), and the
  forward-only status state machine are all enforced in `server/index.js`, not just
  hidden in the frontend.
- The award endpoint (`POST /api/jobs/:id/award`) is the one place correctness really
  matters — it re-checks `status='OPEN'` and `bid.status='PENDING'` *inside* the
  transaction to prevent a double-award race. Don't "simplify" this re-check away.
- Raw DB rows (jobs, bids, etc.) carry SQLite `INTEGER` 0/1 for boolean-ish columns —
  see the JSX gotcha below before using one in a React conditional.
- **Multi-seat accounts: `req.user.id` is always the org root, `req.actorId` is who's
  actually logged in.** A seat authenticates with its own email/password, but its
  session keys off the org root's id (`sessions.user_id`) — that's what makes every
  existing `job.shipper_id`/`carrier_id` ownership check, the verification gate, and
  `req.user.profile` keep working unmodified for a seat, since the seat *is* the org
  for the duration of the request. Use `req.user.id` for anything ownership/data-scoped
  (jobs, bids, payouts, templates, contracts, profile). Use `req.actorId` (falls back to
  `req.user.id` for a root, since a root's own id is both) for anything that should
  identify the *specific person* acting — `audit_log.user_id`, `messages.sender_id`,
  `job_documents.uploader_id`, and the MFA row (MFA lives on whichever row someone
  actually logs in with, never on the root when a seat is driving). Gate mutating
  routes a VIEWER/FINANCE seat shouldn't reach with `requireSeatRole([...])`, not a
  role check alone — `auth(['SHIPPER'])` matches a seat too, since a seat inherits the
  root's `role`.

## Frontend conventions

- Auth state lives in React context (`web/src/lib/auth.jsx`) via `AuthProvider`,
  never `localStorage`. Pages must call `useAuth().login()` / `.register()` /
  `.logout()` — a raw `fetch` + `navigate()` leaves `AuthProvider.user` stale and
  `RequireAuth` will redirect forever.
- Design tokens are the single source of truth: `docs/brand/design-tokens.css`
  (mirrored into `web/src/index.css`) defines every color/type/spacing value as a CSS
  custom property; `web/tailwind.config.js` maps Tailwind's scale onto those
  variables. Never hardcode a hex value in a component — extend the token set instead.
  See `docs/brand/BRAND_GUIDELINES.md` for the rationale behind the palette/type pairing.
- **Custom component classes belong in `@layer components` in `index.css`.** If a
  class like `.btn-ghost` or `.card` is declared as a plain CSS rule after
  `@tailwind utilities`, it wins the cascade over utility classes like `hidden` or
  `w-full` even when they appear later in the element's `className` — HTML class
  order doesn't affect CSS specificity, source order in the compiled stylesheet does.
  This bit a real page in this repo (the mobile nav's "Log in" link stayed visible
  despite `hidden sm:inline-flex`) — the fix was wrapping every custom class in
  `@layer components { ... }`, not reordering classNames.
- **The `{value && <JSX/>}` gotcha.** JSX only treats `false`/`null`/`undefined` as
  invisible; `0` renders as the literal text `"0"`. Any raw SQLite integer flag
  (`job.requires_hazmat`, `job.requires_reefer`, etc.) used in a `&&` conditional
  needs `!!` first: `{!!job.requires_hazmat && <Badge>Hazmat</Badge>}`. This also bit
  a real page here (a job detail header briefly rendered a stray `"00"`).
- Google Fonts is loaded non-render-blocking (`media="print"`, swapped to `all` in
  `main.jsx`) specifically so a slow or unreachable font CDN never delays first paint
  of the app shell. Keep that pattern if you touch `web/index.html`.

## Prerendering (crawlability, not hydration)

`web/scripts/prerender.mjs` runs after `vite build` (see `web/package.json`)
and uses Vite's own programmatic SSR API — zero new dependencies — to
render each public route (`web/src/entry-server.jsx`) to a static HTML
string via `react-dom/server`, written to `web/dist/__prerendered__/`.
`server/index.js`'s `renderSeoPage` splices that markup into `<div
id="root">` for a session-less request, so a non-JS fetcher (a search
crawler, a link-preview bot, `WebFetch`) sees the real page instead of an
empty shell.

**This is prerendering for crawlers, not hydration.** `main.jsx` still
boots with plain `createRoot()`, which replaces the prerendered markup the
instant client JS mounts — a real browser gets a harmless flash, not a
persisted SSR DOM. Don't "upgrade" this to `hydrateRoot()` without also
reconciling the mismatch sources (locale, theme, walkthrough state — see
the `typeof localStorage !== 'undefined'` guards in `lib/auth.jsx` and
`lib/i18n.jsx`, needed because this code also runs under Node during the
prerender step). If you add a new public marketing page, add its route to
both `ROUTES` in `prerender.mjs` and `SEO_META` in `server/index.js` (with
a matching `slug`) — miss one and that page silently falls back to the
pre-prerendering empty-shell behavior, which is safe but loses the
crawlability fix for that page specifically.

## Product scope: equipment, volume, UAE-wide

- Loadbyton is **not** container-only or Jebel-Ali-only. `jobs.equipment_type`
  (12 values, `server/index.js` `EQUIPMENT_TYPES`, mirrored in
  `web/src/lib/constants.js`) covers general UAE road freight — lowbed, flatbed,
  tripper, side loader, curtain/box trucks, 3–10T pickups — alongside the original
  container-chassis/reefer flow. `container_size`/`container_type` only mean
  something for `CONTAINER_CHASSIS`/`REEFER_TRUCK`; keep that branch (in
  `POST /api/jobs`) in sync if you add an equipment type.
- `jobs.container_count`/`jobs.truck_count` implement the "volume inquiry" — a
  single job can request N containers or N trucks; one carrier bid/award covers
  the whole batch. `estimateRate()` in `server/lib/lanes.js` multiplies by
  `max(container_count, truck_count)` — pass `quantity` through if you add another
  rate-estimating call site.
- `server/lib/lanes.js` `unifiedLanes` spans four emirates (Dubai, Abu Dhabi,
  Sharjah, Fujairah), not just Jebel Ali/Khalifa — `TERMINAL_INFO` in
  `web/src/lib/constants.js` maps each terminal to its emirate/operator for
  display. Don't reintroduce Jebel-Ali-only copy on the Landing/About/Features
  pages or in `index.html` meta tags.
- The brand mark (`web/public/brand/*.svg`, `favicon.svg`) is the "container
  plate" — fixed navy/white/crimson tile, not a `currentColor` glyph. The crimson
  divider bars use `--lb-logo-accent-500`/`400` (`docs/brand/design-tokens.css`) —
  a token reserved for the logo only, kept deliberately separate from
  `--lb-red-*` (UI danger/status color) so the two never drift together.

## Verification

There's no automated test suite yet (`TODOS.md` TODO-1). To check a change:
1. `rm -f server/data/loadbyton.db*` then `node server/index.js` — confirm it boots
   and seeds without error.
2. `curl localhost:4000/api/health` and `curl localhost:4000/api/public/lanes`.
3. Walk the relevant part of `docs/TUTORIAL.md` against the live API (curl or the UI)
   for anything touching auth, jobs, bids, award, status, escrow, or admin routes.
4. `cd web && npm run build` must succeed cleanly before calling a frontend change done.

## Toasts, the walkthrough, and localStorage-as-state

- `useToasts()` (`web/src/components/Toast.jsx`) only works because a single
  `ToastProvider` wraps the app in `main.jsx` and owns the one `toasts` array —
  every page that calls `useToasts()` reads/writes that same context. **Never**
  call `useState` to build a second, parallel toast list in a page component;
  that was a real bug here (each page got its own invisible toast queue that
  nothing rendered) before this was made a proper Context.
- Anything that needs to survive a re-render and actually update the screen —
  the walkthrough step, "is the walkthrough finished," the impersonation banner
  — must be `useState` (optionally mirrored to `localStorage` in a `useEffect`,
  the way `theme` already does it in `web/src/lib/auth.jsx`). Reading/writing
  `localStorage` directly with no backing state compiles fine and does nothing
  visible: React has no reason to re-render, so a modal gated on that value can
  get stuck open indefinitely. That was a real bug here too.
- Job/bid `status` values from the API are **always uppercase**
  (`OPEN`, `AWARDED`, `PENDING`, `ACCEPTED`, …) — never introduce a filter,
  badge-color map, or conditional that compares against a lowercase literal
  (`'open'`, `'won'`). Several pages shipped with exactly that mismatch, which
  doesn't error — it just silently matches nothing, so the control looks real
  but never does anything.

## Known rough edges

- The in-process auto-release sweep requires at least one API request cadence.
- **Arabic/RTL is infrastructure, not full coverage.** `lib/i18n.jsx` provides a real
  `LocaleProvider` (dir=rtl switching, an Arabic font stack, localStorage-persisted,
  same pattern as `theme` in `lib/auth.jsx`), wired into the highest-traffic surfaces
  (`Shell.jsx` nav, `Landing.jsx` hero, `Login.jsx`/`Register.jsx`). Everything else —
  Dashboard, JobDetail, Admin, Earnings, and most page bodies — is still English-only.
  Extending coverage is mechanical (add a key to both dictionaries in `i18n.jsx`, swap
  the literal string for `t('key')`) but has NOT been done for the rest of the app.
  Don't say "the app supports Arabic" without qualifying which surfaces — that's the
  exact class of overstatement the 2026-08-13 correction below exists to prevent.
  Physical-direction Tailwind utilities (`ml-*`, `pl-*`, `text-left`, `border-l`) don't
  auto-flip under `dir="rtl"` — only flex/grid main-axis layout does, natively, for
  free. Any page you extend Arabic coverage to needs those swapped for logical
  equivalents (`ms-*`/`ps-*`/`text-start`/`border-s`) as you touch it.
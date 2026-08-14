# Loadbyton — Data Model

Engine: **SQLite** via Node's built-in `node:sqlite` (`DatabaseSync`, synchronous driver). File: `server/data/loadbyton.db` (env `DB_PATH` override). Pragmas: `journal_mode = WAL`, `foreign_keys = ON`.

Schema lives in `server/db.js` (idempotent `CREATE TABLE IF NOT EXISTS` + lightweight `PRAGMA table_info` migrations for columns added later). Seed data in `server/seed.js` (idempotent — skips if users already exist).

---

## Entity-relationship sketch

```
users 1─1 profiles
users 1─N sessions          (cookie sessions)
users 1─N notifications
users 1─N templates         (shipper)
users 1─N contract_lanes    (shipper)
users 1─N jobs   (shipper_id, carrier_id)
jobs 1─N bids              (carrier)
jobs 1─N job_documents     (uploader)
jobs 1─N messages          (sender)
jobs 1─N ratings           (rater → ratee)
jobs 1─N payouts           (carrier)        — one per awarded job
jobs 0─1 disputes          (opened_by, resolved_by)
audit_log                  (append-only, references any entity loosely)
settings                   (key/value platform knobs)
```

---

## Tables

### `users`
Identity + account attributes.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `email` | TEXT UNIQUE NOT NULL | login handle |
| `password_hash` | TEXT NOT NULL | bcrypt (bcryptjs, cost 10) |
| `role` | TEXT NOT NULL | `SHIPPER` \| `CARRIER` \| `ADMIN` \| `DRIVER`(unused) |
| `is_verified` | INTEGER | 0/1; carrier verification gate |
| `mfa_enabled` | INTEGER | 0/1 |
| `mfa_secret` | TEXT | TOTP secret (migration-added column) |
| `tier` | TEXT NOT NULL | loyalty: `BRONZE` \| `SILVER` \| `GOLD` |
| `referral_code` | TEXT UNIQUE | shareable referral |
| `referred_by` | TEXT | code of the referrer |
| `created_at` | TEXT | `datetime('now')` |

### `profiles`
One per user (the `user.profile.*` nested object in the API).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER UNIQUE NOT NULL | FK → users, `ON DELETE CASCADE` |
| `company_name` | TEXT NOT NULL | |
| `trn_number` | TEXT | UAE TRN (tax registration) |
| `trade_license_number` | TEXT | |
| `phone` | TEXT | gated until award |
| `iban` | TEXT | payout destination; required at carrier verification |
| `coverage_zones` | TEXT | e.g. `JAFZA, Al Quoz, DIP` |
| `fleet_size` | INTEGER | default 0 |
| `owned_chassis` | INTEGER | G3: chassis capacity (owned vs hired) |
| `insurance_uploaded` | INTEGER | 0/1 (G5 verification factor) |
| `rating_avg` | REAL | default 5.0, recomputed on ratings |
| `completed_jobs` | INTEGER | default 0 |
| `verified_at` | TEXT | set on admin approval |

### `jobs`
The core entity.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `job_code` | TEXT UNIQUE NOT NULL | human-readable, e.g. `LBT-DXB-2608-4921` |
| `shipper_id` | INTEGER NOT NULL | FK → users |
| `carrier_id` | INTEGER | FK → users (set on award) |
| `contract_lane_id` | INTEGER | G6 link to a committed lane |
| `template_id` | INTEGER | recurrence source |
| `container_size` | TEXT NOT NULL | `20FT` \| `40FT` \| `40HC` \| `REEFER` |
| `container_type` | TEXT NOT NULL | `DRY` \| `REEFER` \| `HAZMAT` \| `OPEN_TOP` \| `FLAT_RACK` |
| `container_number` | TEXT | e.g. `MSKU9281745` |
| `pickup_terminal` | TEXT NOT NULL | e.g. `JEBEL_ALI_T2` |
| `delivery_area` | TEXT NOT NULL | e.g. `JAFZA_SOUTH` |
| `delivery_address` | TEXT NOT NULL | |
| `pickup_lat` / `pickup_lng` / `pickup_address_detail` | REAL / REAL / TEXT | Optional precise pin from the free OpenStreetMap+Nominatim picker, on top of `pickup_terminal` (which still drives lane rate lookups) |
| `delivery_lat` / `delivery_lng` / `delivery_address_detail` | REAL / REAL / TEXT | Same, for the delivery point, on top of `delivery_address` |
| `ready_at` | TEXT NOT NULL | ready-for-pickup time |
| `deadline` | TEXT NOT NULL | |
| `max_budget_aed` | REAL | shipper ceiling |
| `agreed_price_aed` | REAL | winning bid amount, set at award |
| `status` | TEXT NOT NULL | `DRAFT`\|`OPEN`\|`AWARDED`\|`PICKED_UP`\|`IN_TRANSIT`\|`DELIVERED`\|`COMPLETED`\|`CANCELLED`\|`DISPUTED` |
| `awarded_bid_id` | INTEGER | single-writer award reference |
| `requires_reefer` | INTEGER | 0/1 |
| `requires_hazmat` | INTEGER | 0/1 |
| `notes` | TEXT | |
| `free_time_days` | INTEGER | demurrage clock, default 5 |
| `demurrage_rate_aed` | INTEGER | default 400/day |
| `escrow_status` | TEXT | `PENDING`\|`HELD`\|`FUNDED`\|`RELEASED`\|`DISPUTED` |
| `delivered_at` | TEXT | set by POD; starts auto-release window |
| `auto_release_processed` | INTEGER | 1 once the 24h fallback fired (migration-added) |
| `payout_released_at` | TEXT | |
| `container_count` | INTEGER | default 1 (migration-added) — "no. of containers" for a volume inquiry |
| `truck_count` | INTEGER | default 1 (migration-added) — "no. of trucks" for a volume inquiry |
| `equipment_type` | TEXT | default `CONTAINER_CHASSIS` (migration-added) — one of `CONTAINER_CHASSIS`, `REEFER_TRUCK`, `LOWBED_TRAILER`, `FLATBED_TRAILER`, `BOX_TRUCK`, `CURTAIN_TRUCK`, `PICKUP_3T`, `PICKUP_5T`, `PICKUP_7T`, `PICKUP_10T`, `SIDE_LOADER_TRAILER`, `TRIPPER`. `container_size`/`container_type` only apply when this is `CONTAINER_CHASSIS` or `REEFER_TRUCK` — otherwise the server sets them to `'N/A'`/`'GENERAL'` and the cargo is described in `notes` instead. |
| `created_at` / `updated_at` | TEXT | |

### `bids`
Carrier offers on a job.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `job_id` | INTEGER NOT NULL | FK → jobs, `ON DELETE CASCADE` |
| `carrier_id` | INTEGER NOT NULL | FK → users |
| `amount_aed` | REAL NOT NULL | |
| `eta_minutes` | INTEGER NOT NULL | 1–600 enforced in the route |
| `truck_type` | TEXT | free text |
| `driver_name` | TEXT | free text (TODO-2 wants a bound `driver_phone`) |
| `notes` | TEXT | |
| `status` | TEXT NOT NULL | `PENDING`\|`ACCEPTED`\|`REJECTED`\|`EXPIRED` |
| `created_at` / `updated_at` | TEXT | |

### `job_documents`
The persistent per-job document/customs thread.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `job_id` | INTEGER NOT NULL | FK → jobs, CASCADE |
| `uploader_id` | INTEGER NOT NULL | FK → users |
| `doc_type` | TEXT NOT NULL | `CUSTOMS`\|`RECEIPT`\|`POD`\|`LICENCE`\|`INSURANCE`\|`OTHER` |
| `title` | TEXT NOT NULL | |
| `file_url` | TEXT NOT NULL | External URL (legacy/manual entry), or the local `storage_path` when uploaded through the app |
| `storage_path` | TEXT | Set when the file was uploaded via `POST /api/jobs/:id/documents` or `/pod` (base64 body, decoded to `UPLOADS_DIR/<jobId>/<uuid>.<ext>`); NULL for a manually-entered external link |
| `mime_type` | TEXT | Set alongside `storage_path`; one of the `ALLOWED_UPLOAD_MIME_TYPES` in `server/index.js` |
| `created_at` | TEXT | |

Uploaded files are served back through `GET /api/jobs/:id/documents/:docId/file`, which
re-checks `isParticipantOrBidder` on every read — the same access rule every other
job-scoped route uses — so a document is never reachable by a bare guessable URL.

### `messages`
Per-job chat (contact gating lives in the API — PII stays hidden until award).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `job_id` | INTEGER NOT NULL | FK → jobs, CASCADE |
| `sender_id` | INTEGER NOT NULL | FK → users |
| `content` | TEXT NOT NULL | |
| `is_read` | INTEGER | 0/1 |
| `created_at` | TEXT | |

### `ratings`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `job_id` | INTEGER NOT NULL | FK → jobs, CASCADE |
| `rater_id` | INTEGER NOT NULL | FK → users |
| `ratee_id` | INTEGER NOT NULL | FK → users |
| `score` | INTEGER NOT NULL | 1–5 |
| `comment` | TEXT | |
| `created_at` | TEXT | |

### `templates`
Recurring lanes for shippers (retention).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `shipper_id` | INTEGER NOT NULL | FK → users |
| `name` | TEXT NOT NULL | |
| `pickup_terminal` / `delivery_area` / `delivery_address` | TEXT NOT NULL | |
| `container_size` | TEXT NOT NULL | |
| `container_type` | TEXT | default `DRY` |
| `cadence` | TEXT | `ONCE`\|`WEEKLY`\|`BIWEEKLY`\|`MONTHLY` |
| `notes` | TEXT | |
| `created_at` | TEXT | |

### `contract_lanes`
Committed monthly volume (G6).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `shipper_id` | INTEGER NOT NULL | FK → users |
| `pickup_terminal` / `delivery_area` / `delivery_address` | TEXT NOT NULL | |
| `monthly_loads` | INTEGER NOT NULL | committed volume |
| `target_price_aed` | REAL | |
| `status` | TEXT | `ACTIVE`\|`PAUSED` |
| `created_at` | TEXT | |

### `payouts`
One row per awarded job; the carrier ledger.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `job_id` | INTEGER NOT NULL | FK → jobs |
| `carrier_id` | INTEGER NOT NULL | FK → users |
| `gross_aed` | REAL NOT NULL | agreed price |
| `platform_fee_aed` | REAL NOT NULL | commission bps applied |
| `net_aed` | REAL NOT NULL | gross − fee |
| `status` | TEXT | `PENDING`\|`RELEASED`\|`HELD`\|`CANCELLED` |
| `release_type` | TEXT | `MANUAL`\|`AUTO_24H`\|`DISPUTE_RESOLUTION` (migration-added) |
| `released_at` | TEXT | |
| `created_at` | TEXT | |

### `disputes`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `job_id` | INTEGER NOT NULL | FK → jobs |
| `opened_by` | INTEGER NOT NULL | FK → users (admin) |
| `reason` | TEXT NOT NULL | |
| `status` | TEXT | `OPEN`\|`UNDER_REVIEW`\|`RESOLVED` |
| `determination` | TEXT | admin finding |
| `decision` | TEXT | `RELEASE_TO_CARRIER`\|`REFUND_SHIPPER`\|`SPLIT` |
| `resolved_by` | INTEGER | FK → users |
| `resolved_at` | TEXT | |
| `created_at` | TEXT | |

### `audit_log`
**Append-only.** Database triggers (`audit_log_no_update`, `audit_log_no_delete`) `RAISE(ABORT)` on any `UPDATE`/`DELETE` — the table can only ever grow.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER | who acted |
| `action` | TEXT NOT NULL | e.g. `AWARD`, `STATUS`, `ESCROW_RELEASE`, `VERIFY`… |
| `details` | TEXT | human-readable |
| `entity_type` | TEXT | `job`\|`user`\|`dispute`\|`payout` (migration-added) |
| `entity_id` | INTEGER | (migration-added) |
| `before_state` / `after_state` | TEXT | state-transition trace (migration-added) |
| `request_id` | TEXT | `x-request-id` for cross-write traceability (migration-added) |
| `created_at` | TEXT | |

### `sessions`
One row per active login; the cookie holds the token. No JWTs.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `session_token` | TEXT UNIQUE NOT NULL | random opaque token |
| `user_id` | INTEGER NOT NULL | FK → users, `ON DELETE CASCADE` |
| `created_at` | TEXT | |
| `expires_at` | TEXT NOT NULL | 7 days |

Indexes: `idx_sessions_token`, `idx_sessions_user`. Expired sessions are purged on server startup.

### `notifications`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER NOT NULL | FK → users |
| `title` | TEXT NOT NULL | |
| `body` | TEXT | |
| `job_id` | INTEGER | optional link |
| `is_read` | INTEGER | 0/1 |
| `created_at` | TEXT | |

### `settings`
Key/value platform knobs (P1). Seeded:

| Key | Default | Meaning |
|---|---|---|
| `commission_rate_bps` | `600` | platform fee in basis points (6%) |
| `auto_release_hours` | `24` | silent-assent window after POD |

Both editable by admin (`PATCH /api/admin/settings`); `commission_rate_bps` is clamped 0–10000, `auto_release_hours` 1–168.

---

## Migrations strategy

`server/db.js` runs `CREATE TABLE IF NOT EXISTS …` for the full schema, then uses `PRAGMA table_info` + `ALTER TABLE … ADD COLUMN` to backfill columns added after a database was first created:

- `jobs.delivered_at`, `jobs.auto_release_processed`
- `payouts.release_type`
- `audit_log.entity_type/entity_id/before_state/after_state/request_id`
- `users.mfa_secret`
- `jobs.container_count`, `jobs.truck_count`, `jobs.equipment_type`

Because the driver is synchronous and startup is the single writer, these are safe to run on every boot.

---

## Seed data (`server/seed.js`)

Idempotent: skips when `users` is non-empty. One bcrypt hash (`demo1234`) reused for all accounts.

| Entity | Contents |
|---|---|
| Users | 1 shipper (Al-Majid, SILVER), 3 verified carriers (Emirates/Gold, Falcon/Silver, Gulf Heavy/Gold), 1 **unverified** carrier (Desert Line/Bronze — cannot bid), 1 admin |
| Jobs | 6 jobs spanning the lifecycle: 2 `OPEN` (one 40HC dry, one 40FT hazmat), 1 `PICKED_UP`, 1 `IN_TRANSIT` (reefer), 1 `DELIVERED`, 1 `COMPLETED`; escrow from `PENDING` to `RELEASED`; payouts released for two, pending for two |
| Bids | 7 bids incl. an `ACCEPTED` bid on the in-transit reefer |
| Docs | customs + receipt on an open job, a `POD` on the delivered job |
| Messages | a realistic gate-pass thread on the 40HC job |
| Ratings | 2 ratings on the completed job; rating aggregates seeded directly on `profiles` |
| Templates | "Weekly JAFZA South run", "Monthly reefer to Al Quoz" |
| Contract lanes | JAFZA South (40/month), Al Quoz (20/month) |
| Payouts | 4 — 2 `RELEASED`, 2 `PENDING` |

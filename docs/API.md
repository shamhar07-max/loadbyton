# Loadbyton — API Reference

Base URL: **`http://localhost:4000/api`** (dev: proxied at `/api` on `:5173`).

- Auth: **cookie session**. Login once (`POST /api/auth/login`) — the `lb_session` HttpOnly cookie is sent automatically. No `Authorization` header. All fetches from the SPA use `credentials: 'include'`.
- Content type: `application/json`. Every JSON body is `express.json()` parsed.
- Errors: non-2xx responses carry `{ "error": "message" }`.
- Roles referenced below: `SHIPPER`, `CARRIER`, `ADMIN`.
- The public endpoints (`/api/health`, `/api/public/*`) need no auth.

---

## 1. System

### `GET /api/health`
- **Auth:** none
- **200** `{ "ok": true, "service": "loadbyton-api", "time": "<iso>", "pid": "<pid>", "port": 4000 }`

### `POST /api/system/auto-release`
- **Auth:** `ADMIN` (or `x-internal-key` header matching `INTERNAL_KEY`)
- **200** `{ "ok": true, "released": <n>, "message": "..." }` — forces a pass of the auto-release sweep (releases any `DELIVERED` job past its `auto_release_hours` window).

---

## 2. Auth

### `POST /api/auth/register`
- **Auth:** none
- **Body:**
  ```json
  {
    "email": "new@company.ae",
    "password": "secret",
    "role": "SHIPPER",              // SHIPPER | CARRIER
    "companyName": "Company LLC",
    "phone": "+971 4 000 0000",
    "trnNumber": "TRN-...",
    "tradeLicenseNumber": "CN-...",
    "referralCode": "CAR-EMIRATES"  // optional
  }
  ```
- **201** `{ user: {...} }` — creates `users` + `profiles` rows (bcrypt hash, role enforced to shipper/carrier), applies the referral link if valid, logs the user in (session cookie set).
- **400** missing/duplicate email; **422** invalid role.

### `POST /api/auth/login`
- **Auth:** none
- **Body:** `{ "email", "password", "totpCode?" }` (`totpCode` required if MFA enabled).
- **200** `{ user: {...} }` — sets the `lb_session` cookie (7-day TTL). **429** if throttled (8 failed attempts / 15 min per email). **403** wrong password or MFA code.

### `GET /api/auth/me`
- **Auth:** session
- **200** `{ user: {...} }` — current user incl. nested profile. Shape:
  ```json
  {
    "user": {
      "id": 1, "email": "shipper@...", "role": "SHIPPER",
      "is_verified": 1, "mfa_enabled": 0, "tier": "SILVER",
      "referral_code": "SHP-ALMAJID", "referred_by": null,
      "created_at": "...",
      "profile": { "company_name": "...", "trn_number": "...", "trade_license_number": "...",
                   "phone": "...", "iban": "...", "coverage_zones": "...", "fleet_size": 42,
                   "owned_chassis": 30, "insurance_uploaded": 1, "rating_avg": 4.85,
                   "completed_jobs": 320, "verified_at": "..." },
      "impersonating": false, "impersonatedBy": null
    }
  }
  ```
  `impersonating`/`impersonatedBy` reflect the *current session*, not the user row — see `POST /api/admin/impersonate/:userId` in §6.

### `POST /api/auth/logout`
- **Auth:** session
- **200** `{ "ok": true }` — deletes the session row, clears the cookie.

### `POST /api/auth/mfa/setup`
- **Auth:** session
- **200** `{ "ok": true, "secret", "otpauthUrl" }` — generates/stores `mfa_secret`, returns the provisioning URL for authenticator apps.

### `POST /api/auth/mfa/disable`
- **Auth:** session
- **200** `{ "ok": true }` — clears `mfa_enabled`/`mfa_secret`.

### `PATCH /api/profile`
- **Auth:** session (any role)
- **Body:** any subset of `{ companyName, trnNumber, tradeLicenseNumber, phone, iban, coverageZones, fleetSize, ownedChassis, insuranceUploaded }`
- **200** `{ user }` with updated `profile`.

---

## 3. Public (no auth)

### `GET /api/public/lanes`
- **200** `{ lanes: [...] }` — the unified lane index. Each lane:
  ```json
  { "laneId": "JEBEL_ALI_T1:AL_QUOZ", "terminal": "JEBEL_ALI_T1", "area": "AL_QUOZ",
    "distanceKm": 21, "basePriceAed": 850, "pricePerKm": 12, "baseMinutes": 45,
    "onTimePct": 94, "monthlyLoads": 120 }
  ```

### `GET /api/public/carriers`
- **200** `{ carriers: [...] }` — verified-carrier directory (PII stripped — no phone/email/TRN).

### `GET /api/public/market`
- **200** `{ market: { teu2024, containersPerDay, avgDrayageAED, takeRate, annualSpend } }` — market pulse for the landing page.

---

## 4. Jobs & the marketplace

### `GET /api/jobs`
- **Auth:** session (role-scoped)
- **Query:** `?status=OPEN&limit=&offset=`
- **200** `{ jobs: [...] }`
  - SHIPPER → own jobs. CARRIER → `OPEN` jobs plus their own awarded/history. ADMIN → all.

### `POST /api/jobs`
- **Auth:** `SHIPPER`
- **Body:**
  ```json
  {
    "equipmentType": "CONTAINER_CHASSIS",
    "containerSize": "40HC", "containerType": "DRY", "containerNumber": "MSKU9281745",
    "pickupTerminal": "JEBEL_ALI_T2", "deliveryArea": "JAFZA_SOUTH",
    "deliveryAddress": "Street 14, Warehouse 8B, JAFZA South, Dubai",
    "readyAt": "<iso>", "deadline": "<iso>", "maxBudgetAed": 1400,
    "requiresReefer": false, "requiresHazmat": false,
    "containerCount": 1, "truckCount": 1,
    "freeTimeDays": 5, "demurrageRateAed": 400,
    "templateId": null, "contractLaneId": null, "notes": "...",
    "pickupLat": 25.0092, "pickupLng": 55.0617, "pickupAddressDetail": "Jebel Ali Port Gate 4",
    "deliveryLat": 25.1288, "deliveryLng": 55.2115, "deliveryAddressDetail": "Al Quoz Industrial 3, Warehouse 12"
  }
  ```
  `equipmentType` defaults to `CONTAINER_CHASSIS` if omitted/invalid — one of the 12 values in `DATA_MODEL.md`'s `jobs.equipment_type`. `containerSize`/`containerType` are only validated (and required) when `equipmentType` is `CONTAINER_CHASSIS` or `REEFER_TRUCK`; for every other equipment type the server stores `'N/A'`/`'GENERAL'` regardless of what's sent, and `notes` becomes the required cargo description instead. `containerCount`/`truckCount` default to `1` — raise either for a volume inquiry (one job, one award, covering the stated batch).
  `pickupLat`/`pickupLng`/`deliveryLat`/`deliveryLng` are an optional precise pin from the free OpenStreetMap+Nominatim picker (`web/src/components/LocationPicker.jsx`) on top of the required `pickupTerminal`/`deliveryArea` enums, which still drive lane rate lookups — **400** if only one of a lat/lng pair is sent, or the pair falls outside a loose UAE bounding box.
- **201** `{ job }` with generated `job_code` (e.g. `LBT-DXB-2608-4921`), status `OPEN`.

### `POST /api/jobs/import`
- **Auth:** `SHIPPER`
- **Body:** `{ jobs: [...] }` — array (max 200) of objects in the same shape as `POST /api/jobs`'s body. CSV parsing happens client-side (`web/src/lib/csv.js`); this route only ever sees JSON.
- **201** `{ results: [{ row, ok, jobCode?, jobId?, error? }], created, failed }` — each row is validated/inserted independently (same `createJobFromBody` logic as the single-job route), so one bad row doesn't sink the batch.

### `GET /api/jobs/:id`
- **Auth:** session (job participant, or admin; `OPEN` jobs visible to carriers)
- **200** `{ job }` — job plus `bids[]`, `documents[]`, `messages[]`, `payout`. For a non-awarded `OPEN` job, competitor bids are masked (no amounts) until award — contact gating.

### `POST /api/jobs/:id/bids`
- **Auth:** `CARRIER` **+ verified profile** + job `OPEN`
- **Body:** `{ amountAed, etaMinutes (1–600), truckType, driverName, notes }` — `truckType` is free text (stored as-is); the client UI offers the 12 `equipment_type` values as a picklist defaulting to the job's own requirement, but the field isn't server-validated against that enum.
- **201** `{ bid }`
- **403** unverified carrier or job not open (`{ "error": "Carrier verification required to bid." }`).

### `GET /api/bids/mine`
- **Auth:** `CARRIER`
- **200** `{ bids: [{ ...bid, job_code, pickup_terminal, delivery_area, job_status }] }` — every bid the carrier has ever placed, newest first, pre-joined with the job's lane so the "My bids" page doesn't have to N+1 `GET /api/jobs/:id` per row.

### `POST /api/bids/:id/withdraw`
- **Auth:** `CARRIER`, own bid, bid `status = PENDING`
- **200** `{ ok: true, bid }` — sets `bids.status = 'WITHDRAWN'`. **400** if the bid isn't pending (already accepted/rejected). **403** if it isn't the caller's bid.

### `POST /api/jobs/:id/rate`
- **Auth:** session (job participant or admin)
- **Body:** `{ origin?, destination?, weightTons?, urgency?: "express"|"urgent"|"standard" }`
- **200** `{ estimatedAED, base, weightTons, urgencyMod, quantity, methodology }` — lane-index base price adjusted by weight (>10 t → ×1.1, >20 t → ×1.2), urgency (express ×1.3, urgent ×1.15), and `quantity` (`max(container_count, truck_count)` on the job — a ×6 volume inquiry estimates ×6 the single-unit rate).

### `POST /api/jobs/:id/optimize-route`
- **Auth:** session (job participant or admin)
- **Body:** `{ origin?, destination?, waypoints?: [...], priority? }`
- **200** `{ optimized: { route, distance_km, estimated_time_min, fuel_cost_aed, waypoints, savings_vs_standard, priority, created_at } }` — lane-derived route estimate with optional waypoint savings.

### `POST /api/jobs/:id/award`
- **Auth:** `SHIPPER`, job owner, job `OPEN`
- **Body:** `{ bidId }`
- **200** `{ ok: true, job }` — transactional award: job → `AWARDED` (legal from `OPEN`/`BIDDING`/`DRAFT`), bid → `ACCEPTED`, others → `REJECTED`, escrow → `HELD`, payout row created (gross/fee/net, `release_type=MANUAL`), audit entries, notifications.
- **409** awarded concurrently; **404** bad bid.

### `PATCH /api/jobs/:id/status`
- **Auth:** job participant (role rules) — see state machine in `ARCHITECTURE.md` §3.4
- **Body:** `{ status: "PICKED_UP" | "IN_TRANSIT" | "DELIVERED" | "COMPLETED" | "CANCELLED" }`
- **200** `{ job }` — enforces forward-only progression per role; audits every transition.

### `POST /api/jobs/:id/pod`
- **Auth:** `CARRIER` (awarded), job `IN_TRANSIT`
- **Body:** `{ document?: { docType, title, fileUrl } | { docType, title, fileBase64, mimeType } }` — either an external `fileUrl`, or a real upload as base64 (`fileBase64`) with `mimeType` one of `image/jpeg`\|`image/png`\|`image/webp`\|`application/pdf`, up to 5MB.
- **200** `{ job }` — sets `delivered_at`, status `DELIVERED`, starts the auto-release clock (`auto_release_hours`, default 24 h). A POD document is recorded in `job_documents`; an uploaded file is validated and written to disk before the job status changes, so a bad upload 400s without leaving the job DELIVERED.

### `GET /api/jobs/:id/track`
- **Auth:** session (participant)
- **200** `{ job, shipperName, carrierName, statusIndex, canProgress, demurrageExposure, hoursSinceDelivered, autoReleaseAt, geofence: { pickup, delivery, atPickup, atDelivery } }` — live tracking view for the detail page (`demurrageExposure` = free-time days exceeded × rate; `autoReleaseAt` = `delivered_at + auto_release_hours`).

### `GET /api/jobs/:id/backload-matches`
- **Auth:** `CARRIER`, must be this job's own `carrier_id`, job status one of `AWARDED`\|`PICKED_UP`\|`IN_TRANSIT`\|`DELIVERED`\|`COMPLETED`
- **200** `{ matches: [{ ...job, matchType: "coords"|"area", distanceKm }] }` — up to 10 `OPEN` jobs that make a good return leg after this one, ranked by real haversine distance (`matchType: "coords"`) when both this job's `delivery_lat/lng` and a candidate's `pickup_lat/lng` are set, falling back to `matchType: "area"` (same emirate, via a real `TERMINALS`/`AREAS` → emirate mapping — not a distance) when a pin is missing on either side. Coordinate matches always sort ahead of area matches.
- **403** if the job isn't the caller's own award, or isn't in an eligible status yet.

### `POST /api/jobs/:id/documents`
- **Auth:** participant
- **Body:** `{ docType: "CUSTOMS"|"RECEIPT"|"POD"|"LICENCE"|"INSURANCE"|"OTHER", title, fileUrl }` or `{ docType, title, fileBase64, mimeType }` for a real upload (same constraints as `/pod` above).
- **201** `{ ok: true }` — appended to `job_documents` (the persistent per-job document/customs thread).

### `GET /api/jobs/:id/documents/:docId/file`
- **Auth:** participant or bidder (`isParticipantOrBidder`)
- **200** the file bytes (`Content-Type` from the stored `mime_type`) for an uploaded document, or a `302` redirect to `file_url` for a legacy external link.

### `POST /api/jobs/:id/rating`
- **Auth:** participant, terminal job
- **Body:** `{ score: 1–5, comment? }`
- **201** `{ ok: true }` — writes `ratings`; updates `profiles.rating_avg` and `completed_jobs` for the ratee. **409** if the rater already rated this job.

### `GET /api/jobs/:id/messages`
- **Auth:** participant
- **200** `{ messages: [...] }`

### `POST /api/jobs/:id/messages`
- **Auth:** participant
- **Body:** `{ content }`
- **201** `{ message }` — in-app thread; the only place parties talk before award (contact gating keeps phone numbers hidden until then).

---

## 5. Retention: templates, contracts, analytics, earnings, notifications

### `GET /api/templates` · `POST /api/templates`
- **Auth:** `SHIPPER`
- List saved lanes; create with `{ name, pickupTerminal, deliveryArea, deliveryAddress, containerSize, containerType, cadence: "ONCE"|"WEEKLY"|"BIWEEKLY"|"MONTHLY", notes }`.

### `POST /api/templates/:id/rerun`
- **Auth:** `SHIPPER` (owner)
- **201** `{ job }` — clones the template into a fresh `OPEN` job in one call.

### `GET /api/contracts` · `POST /api/contracts`
- **Auth:** `SHIPPER`
- List/create committed-volume lanes (`monthlyLoads`, `targetPriceAed`, status `ACTIVE|PAUSED`).

### `GET /api/analytics/mine`
- **Auth:** session (role-aware)
- **200** `{ analytics: { ... } }`
  - CARRIER: `{ totalBids, jobsWon, paidOutAED, pendingAED, rating, onTime, tier }`
  - SHIPPER: `{ jobsPosted, jobsCompleted, totalSpentAED, activeJobs, savingsPercent, tier, rating }` (savings = per-lane platform median vs a market average)

### `GET /api/earnings`
- **Auth:** `CARRIER`
- **200** `{ payouts: [{ job_code, status, agreed_price_aed, job_created, gross_aed, platform_fee_aed, net_aed, payout_status, release_type, released_at }], totals: { paid, pending } }` — the carrier ledger; `totals` are sums of `net_aed` (paid = released, pending = everything not released/cancelled). Note payout rows are keyed by `job_code`, not `job_id`.

### `GET /api/notifications`
- **Auth:** session
- **200** `{ notifications: [...] }` — unread first.

### `POST /api/notifications/read`
- **Auth:** session
- **200** `{ ok: true }` — marks **all** of the current user's notifications read (bulk, no id).

---

## 6. Admin

All routes below require `auth(['ADMIN'])`.

### `GET /api/admin/health`
- **200** `{ health: { openJobs, totalBids, avgBidsPerJob, completionRate, escrowHeld, disputesOpen, lanes } }` — ops dashboard with live lane health.

### `GET /api/admin/verification`
- **200** `{ queue: [unverified carriers with profile] }`

### `POST /api/admin/verify/:id`
- **Body:** `{ action: "approve" | "reject", iban?: string }` — approve requires an IBAN.
- **200** `{ ok, user }` — marks verified, stores IBAN (payout destination), sets `verified_at`, audits + notifies the carrier.

### `POST /api/admin/verify-bulk`
- **Body:** `{ ids: number[] (max 100), action: "approve" | "reject" }` — no per-carrier IBAN input; a bulk `approve` only succeeds for a carrier that already has one on file.
- **200** `{ results: [{ id, ok, error? }], succeeded, failed }` — each id is processed independently through the same logic as the single-carrier route, so one failure (usually a missing IBAN) doesn't block the rest of the batch.

### `POST /api/admin/confirm-receipt`
- **Body:** `{ jobId }` — moves escrow `HELD → FUNDED` once funds are actually received (audited).

### `GET /api/admin/users`
- **200** `{ users: [{ id, email, role, is_verified, tier, created_at, profile: { company_name, completed_jobs, rating_avg } }] }` — every user on the platform (not just the unverified queue). The Members tab filters this list client-side by role/verified/search.

### `GET /api/admin/referrals`
- **200** `{ referrals: [{ referredUserId, referredEmail, referredAt, referralCode, referrerId, referrerEmail, referrerCompany, fleetSize, status }] }` — every account that signed up with a referral code, joined to the referrer. `status` is `PENDING` or `CREDITED` (`CREDITED` once the referred account has a `COMPLETED` job) — it's derived, not a stored/toggleable flag.

### `POST /api/admin/impersonate/:userId`
- **200** `{ ok: true, user }` — starts impersonating the target (not another admin — **400** if it is). Issues a new, separate session for the target user tagged with the admin's id and capped at 30 minutes, and swaps the caller's cookie to it. Audited as `IMPERSONATE_START`.

### `POST /api/admin/impersonate/end`
- **Auth:** any session currently impersonating (i.e. `impersonating_admin_id` set on the current session row)
- **200** `{ ok: true, user }` — restores the original admin's session. **400** if the current session isn't an impersonation. Audited as `IMPERSONATE_END`.

### `GET /api/admin/audit`
- **200** `{ entries: [last 100 audit rows] }`

### `GET /api/admin/disputes`
- **200** `{ disputes: [...] }`

### `POST /api/admin/disputes`
- **Body:** `{ jobId, reason }`
- **201** `{ dispute }` — opens a dispute: job + escrow → `DISPUTED` (frozen).

### `POST /api/admin/disputes/:id/resolve`
- **Body:** `{ determination, decision: "RELEASE_TO_CARRIER" | "REFUND_SHIPPER" | "SPLIT" }`
- **200** `{ ok }` — releases the payout (marking escrow `RELEASED` with `release_type='DISPUTE_RESOLUTION'`) or refunds, audits + notifies both parties.

### `GET /api/admin/disputes/:id/evidence`
- **200** `{ evidence: { job, bids, documents, messages, ratings, auditTrail } }` — the dispute dossier.

### `GET /api/admin/revenue`
- **200** `{ revenue: { gmvAED, platformFeesAED, escrowHeldAED, avgTakeRate } }` (`avgTakeRate` is a `%` string).

### `GET /api/admin/settings` · `PATCH /api/admin/settings`
- **Body (PATCH):** `{ commission_rate_bps?: 0–10000, auto_release_hours?: 1–168 }`
- **200** `{ settings: { commission_rate_bps, auto_release_hours } }` — drives the platform fee and the auto-release window platform-wide.

---

## 7. Status codes cheat sheet

| Code | Meaning |
|---|---|
| 200/201 | OK / created |
| 400 | Missing/invalid fields |
| 401 | No/invalid session |
| 403 | Role not allowed, unverified carrier bidding, job not open, illegal state transition |
| 404 | Unknown job/bid/etc. |
| 409 | Double-award / already awarded |
| 422 | Invalid role value on register |
| 429 | Login throttled |

---

## 8. Demo API flow (quick curl)

```bash
BASE=http://localhost:4000/api

# 1. Login (sets lb_session cookie in cookie jar)
curl -c /tmp/jar -X POST $BASE/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"shipper@jebelalilogistics.ae","password":"demo1234"}'

# 2. List my jobs
curl -b /tmp/jar $BASE/jobs

# 3. Rate estimator for a job
curl -b /tmp/jar $BASE/jobs/1/rate

# 4. Live tracking for an awarded job
curl -b /tmp/jar $BASE/jobs/2/track
```

See `TUTORIAL.md` for the full demo walkthrough.

---

## 9. Endpoints added beyond the original spec

Two aliases exist for the dispute evidence dossier — both return the same shape:
- `GET /api/admin/disputes/:id/evidence` (dispute-id keyed, per §6 above)
- `GET /api/admin/evidence/:jobId` (job-id keyed, matches the phrasing in `ARCHITECTURE.md` §6 and `TUTORIAL.md` step 10)

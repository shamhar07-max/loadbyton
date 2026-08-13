# Loadbyton — Tutorial: move a container, end to end

A hands-on walkthrough. By the end you will have seen every layer of the product: registration, posting, bidding, award, escrow, tracking, POD, auto-release, earnings, verification, disputes, and the admin console.

**Prereqs:** server running on `:4000` and, if you want the UI, the Vite dev server on `:5173`. All demo passwords are `demo1234`. Either drive the browser UI or run the equivalent `curl` calls (cookiejar: `-c /tmp/jar -b /tmp/jar`). We'll do both — UI for the journey, curl to show the API under the hood.

---

## Step 1 — Look around before you log in

Open **http://localhost:5173**. As a guest you see the **landing page**: hero, the public **Lane Index** (`GET /api/public/lanes` — price/on-time/volume per lane), the **verified carrier directory** (`GET /api/public/carriers` — note: no phones, no emails), and market pulse. No login required — this is the trust/marketing surface.

## Step 2 — The unverified carrier's dead end (proves verification works)

Log in as `desertline@drayage.ae`. Go to **Open Loads**. Try to bid on the open 40HC job. The API answers 403:

```bash
curl -s -c /tmp/jar -X POST localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"desertline@drayage.ae","password":"demo1234"}'

curl -s -b /tmp/jar -X POST localhost:4000/api/jobs/1/bids \
  -H 'content-type: application/json' \
  -d '{"amountAed":1200,"etaMinutes":60}'
# → {"error":"Carrier verification required to bid."}
```

That's the **verification gate** (server-side, not just hidden in the UI). Desert Line can't participate until an admin approves them — which is Step 9. Log out.

## Step 3 — Login as a shipper

Log in as `shipper@jebelalilogistics.ae`. The dashboard shows your jobs, analytics (`GET /api/analytics/mine` — total jobs, spend, savings %), and quick actions.

Open job `LBT-DXB-2608-4921` (the 40HC dry to JAFZA South). You see the container details, the **customs + receipt documents** in the thread, and — because it's still `OPEN` — the **bids** with amounts. This is the only job you see bids on as the owner.

## Step 4 — Post a fresh job (recurrence in one tap)

Two options:
- **From scratch:** Dashboard → Post a job. Pick `40FT`, DRY, terminal `JEBEL_ALI_T4`, delivery `DUBAI_SOUTH`, set a budget, a deadline, notes, submit. You get a `LBT-DXB-….` job code, status `OPEN`.
- **From a template:** Templates page → "Weekly JAFZA South run" → **Re-run**. One call (`POST /api/templates/:id/rerun`) clones the saved lane into a fresh open job. That's the anti-"one-and-done" mechanic — the second shipment is one tap, not a re-negotiation.

Run the template so you have a job that's actually biddable for the next steps.

## Step 5 — Switch hats: carrier bids

Log out, log in as `carrier@dubaidrayage.com` (Emirates Overland, GOLD, verified).

- **Open Loads** shows the jobs still open. The 40HC (4921) and the hazmat 40FT both have existing bids. Open one.
- As a carrier on an unawarded job you do **not** see other carriers' amounts — contact gating masks competitor pricing until award.
- Place a bid: price + ETA (1–600 min) + truck type + driver name. `POST /api/jobs/:id/bids` → your bid is `PENDING`.
- Check the **Rate estimator** on the job page — `GET /api/jobs/:id/rate` gives the lane-index estimate, so you can bid competitively against a published benchmark.

Repeat with `gulfheavy@fleet.ae` so the job has multiple bids.

## Step 6 — Award, escrow, and the status journey

Back to the shipper. Open the job, see both bids, **Award** the Emirates one.

Behind the scenes one transaction did all of this (`POST /api/jobs/:id/award`):
- job → `AWARDED`, `carrier_id` + `agreed_price_aed` set, `awarded_bid_id` recorded
- your bid → `ACCEPTED`, the loser → `REJECTED`
- escrow → `HELD` (the amount is earmarked)
- a `payouts` row is created: gross, 6% platform fee, net
- `audit_log` rows + notifications for both parties

Now, as the carrier, walk the job through its states via the **Actions** panel on the job page. The server enforces **forward-only, one step at a time**:

1. `PICKED_UP` — container collected
2. `IN_TRANSIT` — moving
3. `DELIVERED` — done at the dock

The **Track & escrow** panel shows status position, the **demurrage clock** (free-time days left vs `demurrageRateAed`), `autoReleaseAt`, and geofence-style progress. Try skipping a state (e.g. `IN_TRANSIT` straight to `DELIVERED` when it's still `PICKED_UP`) and watch it 403 — the state machine is real.

## Step 7 — POD and the silent-assent release

As the carrier, when the job is `IN_TRANSIT`, submit **Proof of Delivery** (`POST /api/jobs/:id/pod`). This sets `delivered_at` and status `DELIVERED`.

Now the interesting part — **two ways the money moves**, and you don't have to do both:

- **Manual:** the shipper confirms delivery on the job page ("Confirm delivery & release escrow") → escrow `RELEASED`, payout `RELEASED` with `release_type=MANUAL`, funds on the way (well — a notification, in the demo).
- **Automatic:** if the shipper does nothing, the **auto-release sweep** fires `auto_release_hours` (24) after `delivered_at`. Force it right now instead of waiting — as admin, go to Admin console → Settings → "Run sweep now", or:

```bash
curl -s -c /tmp/jar -X POST localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@loadbyton.ae","password":"demo1234"}'
curl -s -b /tmp/jar -X POST localhost:4000/api/system/auto-release
# → {"ok":true,"released":1,...}
```

That's the sweep logic (`release_type=AUTO_24H`, `auto_release_processed=1`) running on demand.

## Step 8 — Earnings, ratings, notifications

As the carrier, visit **Earnings**: `GET /api/earnings` lists each payout with `job_code`, gross/fee/net, status, release type, and released date, plus totals. This is the ledger the founder actually pays against.

Once the job reaches `COMPLETED`, leave a rating on it (`POST /api/jobs/:id/rating`), and check the **Notifications** bell — award, status changes, and releases each pushed one.

## Step 9 — Admin console (the whole loop you just ran, from the other side)

Log in as `admin@loadbyton.ae`.

- **Verification** tab — approve `desertline@drayage.ae` (supply an IBAN — required, it's the payout destination). Now go back and try their bid again: it works. The gate we proved in Step 2 is now open.
- **Health** tab — open/total jobs, bids, completion rate, escrow held, open disputes, plus live lane health.
- **Audit log** tab — every transition from Step 6/7 is here with `before_state`/`after_state`. Try to modify the table directly (a stray `UPDATE audit_log …` from sqlite) → the append-only trigger aborts it.
- **Revenue** tab — GMV, platform fees, escrow held, average take rate.
- **Settings** tab — raise `commission_rate_bps` to `800` and watch the *next* award's payout fee go from 6% to 8%; change `auto_release_hours` to `48` to lengthen the silent-assent window.

## Step 10 — Escalate: open a dispute and resolve it

Still as admin, on the **Disputes** tab, open a dispute on a job (job ID + reason). The job **and its escrow** freeze to `DISPUTED` — no payout moves while open.

Resolve it with decision `RELEASE_TO_CARRIER` (payout releases, `release_type=DISPUTE_RESOLUTION`), `REFUND_SHIPPER` (escrow back to the shipper), or `SPLIT`. Both parties get notified. The evidence dossier behind any dispute — job, bids, documents, messages, ratings, and the full audit trail — is available at `GET /api/admin/disputes/:id/evidence` (or `GET /api/admin/evidence/:jobId`).

---

## Where the numbers come from

- **Lane prices/ETAs** — `unifiedLanes` in `server/lib/lanes.js`; used by `/rate`, `/optimize-route`, `/api/public/lanes`.
- **Platform fee** — `commission_rate_bps` setting (default 600 bps = 6%).
- **Auto-release window** — `auto_release_hours` setting (default 24 h), anchored to `jobs.delivered_at`.
- **Demurrage** — `freeTimeDays`/`demurrageRateAed` per job, surfaced by `/track`.
- **Reputation** — `profiles.rating_avg`/`completed_jobs`, updated by ratings.

## You've now seen

registration → verification gate → posting → templates → bidding (masked pricing) → award transaction → escrow → forward-only status machine → tracking/demurrage → POD → silent-assent release → earnings ledger → ratings → admin queue/health/audit/revenue/settings → disputes with evidence → resolution.

That is the whole product. `ARCHITECTURE.md`, `API.md`, and `DATA_MODEL.md` are the references for everything touched along the way.

# TODOs.md — Loadbyton

Deferred / tracked follow-up work.

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

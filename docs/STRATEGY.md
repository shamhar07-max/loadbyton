# Loadbyton — Execution Strategy, Gap Analysis & Data Visibility Plan

Senior review combining the operator's view (logistics P&L), the project-engineer's view
(system design), and the IT-engineer's view (security, data, retention). Companion to the
Loadbyton handover set (Handover-01, PRD-01, TAD-01, SAD-01, FSD-01, FTL-01, ADM-01).

See `docs/STRATEGIC_REVIEW.md` for the investor/CEO/engineering strategic read produced
alongside the initial build, which synthesizes this document against the shipped code.

---

## 1. The one problem that kills this business

The PRD targets 300 jobs/day but monetizes a **spot, one-off transaction**. A shipper who
uses the platform once to fix a stuck container — and then goes back to their WhatsApp
network — is a **negative LTV event**: we paid acquisition cost, we carried the escrow risk,
and the market never gets deeper.

> Every feature that makes the *second* shipment happen on-platform is worth more than any
> feature that makes the *first* one slightly prettier.

**Root cause of churn in freight marketplaces** (validated against DAT/Transfix/Freightos
playbooks and UAE drayage practice):
1. The platform solves the *urgent* move but not the *recurring* lane. → Fix: recurring
   templates, scheduled loads, contract lanes.
2. The pricing is opaque after the fact — no benchmark, so the user leaves to re-shop.
   → Fix: personal rate benchmarks per lane ("your lane, your history, live market index").
3. Trust documents live in WhatsApp; the thread dies with the job. → Fix: persistent
   per-lane document & customs thread, demurrage clock.
4. No switching cost. → Fix: savings analytics, loyalty tier that lowers fees, referral
   credits, carrier payout acceleration.

---

## 2. Market gaps & loopholes we exploit (and the risks they create)

| # | Market gap / loophole | Our answer | Residual risk |
|---|---|---|---|
| G1 | Drayage price is opaque; brokers quote 18–35% above recurring-contract rates | Public **Lane Index** (data product) + personal benchmark | Incumbents undercut with owned-fleet density |
| G2 | Demurrage/free-time is the real hidden cost, not the truck | **Demurrage clock** per container + document readiness checklist | Port/liner data not yet EDI'd (V2) |
| G3 | Chassis availability controls the slot | Carrier profile captures **owned vs hired chassis** | Carriers overstate capacity |
| G4 | Disintermediation: users exchange phone numbers | **Contact gating** — phone/identity locked until award; chat on-platform | WhatsApp habits are hard to break |
| G5 | Verification is a rubber stamp | **Dual-factor carrier verify**: TRN check + licence + insurance flag + spot audit | Fraud at volume |
| G6 | One-time cargo floods marketplace, then dries up | **Contract lanes** (committed volume) get priority visibility | Contract enforcement |
| G7 | Carrier cash-flow crunch → they over-bid or ghost | **Instant payout (T+0 on POD)** + advance badge | Payment/escrow licensing |
| G8 | Cold-start liquidity | Founders' own volume + concierge WhatsApp-to-app onboarding | — |

---

## 3. What should be PUBLIC (visible) vs PRIVATE (internal)

### Public — visible to anyone (marketing, trust, moat)
- **Lane Index**: live/averaged price, min–max, on-time %, volume per lane. This is the
  "why-should-I-commit" proof. (aggregated only — never one shipper's rate)
- **Verified carrier directory**: name, rating, completed jobs, fleet size, licence status
  badge, coverage zones. **No phone, no email, no TRN digits, no driver names.**
- Landing, how-it-works, compliance/PDPL, ToS, pricing tiers, FAQs.

### Visible to the other party only after award
- Carrier's phone/email, driver name, licence number.
- Shipper's name + TRN (verified badge) — before award, only "Verified Shipper".

### Private — visible only to the account owner + Admin
- TRN, trade licence scans, insurance, IBAN/bank, MFA secrets, password hashes.
- Escrow amounts, take-rate, payout schedules, dispute evidence, audit log.
- Per-user analytics, spend, savings, lifetime value.
- Anything required for UAE PDPL retention rules (see SAD-01).

**Never public:** aggregated data that can be re-identified; any single transaction price
tied to a company; demurrage-sensitive commercial terms.

---

## 4. Retention engineering (the anti-"one-and-done" layer)

1. **Recurring job templates** — save a lane; re-post in two taps; schedule weekly cadence.
2. **Contract lanes** — shipper commits N loads/month; carriers see badge; shipper gets
   priority placement + discounted take-rate.
3. **Personal rate benchmark** — every dashboard shows "your last 12 moves vs market".
4. **Loyalty tiers** — Bronze/Silver/Gold by volume → lower commission, priority support,
   free API.
5. **Carrier payout acceleration** — 24h payout standard, instant on POD for Gold; shippers
   who pay escrow faster get "Fast-Pay" badge → faster bids.
6. **Referral program** — credit both sides; tracked by unique code.
7. **Warm re-engagement** — SMS/email when a scheduled lane is due, when rates move >5% on
   saved lanes, and demurrage alerts.

---

## 5. Engineering & IT hardening (what the handover under-specifies)

- **Append-only bid & job audit** — decisions immutable; audit log written on every award,
  escrow action, dispute action, admin verify (SAD-01 requires this; enforced in schema via
  SQLite triggers — see `DATA_MODEL.md`).
- **Contact gating is server-side** — the API strips PII for unawarded jobs; never trust the
  UI to hide it.
- **Rate limiting on bid + auth** (tighter than the 100/min default); Cloudflare in front.
- **Idempotent awards** — award action is single-writer (a single SQLite transaction with an
  `OPEN`+`PENDING` re-check) to prevent double-award races in live bidding.
- **Escrow light-touch first** — hold the fee, pass-through the freight, per R03 mitigation.
- **PDPL + VAT** — invoice generated on every payout; retention windows from SAD-01.
- **Monitoring** — health endpoints per service; Sentry for errors; structured logs.
- **Data portability & export** — shippers own their job/history; export button (trust + PDPL).

---

## 6. Rollout sequence (aligned with FTL sprints)

1. **Sprint A — Core loop + escrow-lite**: post → bid → award → status → POD → payout,
   verified carriers, contact gating. (FTL Epics 1–3)
2. **Sprint B — Trust layer**: ratings, dispute console, audit log, demurrage clock,
   document thread. (FTL Epic 4)
3. **Sprint C — Retention layer**: templates, contract lanes, benchmarks, loyalty, referral.
4. **Sprint D — Data moat**: Lane Index, reports, API/EDI (V2), multi-port (Khalifa,
   Sharjah), then GCC corridors.

---

## 7. KPIs to run the business (admin console)

- **Repeat rate**: % of shippers with ≥2 jobs; ≥60% by month 6.
- **Bid rate** ≥3/job; **time-to-award** <4h; **completion rate** ≥90% (per ADM-01).
- **Lane health**: lanes with <2 bids in 12h → ops outreach.
- **Take-rate realization**, escrow float, dispute rate (<1%), NPS/CSAT.
- **GMV → revenue conversion**, CAC, LTV:CAC > 3.

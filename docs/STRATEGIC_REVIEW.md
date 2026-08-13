# Loadbyton — Strategic Review

A combined investor, operator, and engineering read on the Loadbyton handover set,
produced alongside the initial build. The formatted, published version of this review
is a Claude Artifact; this is its content in plain markdown for the repo.

---

## The call

**Fund it — but the check clears on the churn fix, not the demo.**

The marketplace mechanics are real: escrow, an idempotent award transaction, a
forward-only status machine, an append-only audit trail. That is not a pitch deck,
that is working plumbing. What isn't yet proven is the only number that matters for a
two-sided freight marketplace — whether the second shipment happens on-platform. Every
dollar of paid acquisition dies on that question.

Conditions:
1. Repeat-rate instrumentation live from day one — templates, contract lanes, and
   loyalty tiers ship with the launch, not after it, per the roadmap's own Sprint C.
2. The four open TODOs (see `TODOS.md`) are closed *before* the C0 schema/async port,
   not after — three of them get materially more expensive to retrofit later.
3. Payout release stays a founder-executed manual transfer with an enforced 48h SLA
   tracker until a licensed escrow rail exists — no silent promise, an auditable one.

## The one problem that kills this business

The plan targets 300 jobs a day. It monetizes a spot, one-off transaction. Those two
facts are in tension. A shipper who uses Loadbyton once to fix a stuck container — and
then goes back to a WhatsApp broker — is a negative-LTV event: acquisition cost paid,
escrow risk carried, and the market never gets any deeper. See `STRATEGY.md` §1 for the
full breakdown and named fixes (templates, contract lanes, personal rate benchmark,
loyalty tiers).

## Market gaps (G1–G8)

See `STRATEGY.md` §2 for the full gap/answer/residual-risk matrix — eight specific
loopholes in how UAE drayage runs today, each with a shipped answer.

## Unit economics, as shipped

- **6%** default take rate (600 bps, admin-adjustable 0–10000 bps)
- **24h** default auto-release window post-POD (configurable 1–168h)
- **300/day** jobs-per-day target at scale (PRD)
- **≥60%** repeat-shipper rate target by month 6

Escrow is deliberately light-touch first: the platform holds the fee and passes the
freight amount through, rather than warehousing full client funds — correct sequencing
before a money-transmission licence is in hand.

## Technical & security readiness

| Concern | Status | Implementation |
|---|---|---|
| Password storage | Built | bcrypt, cost 10 |
| Session transport | Built | HttpOnly cookie, 7-day expiry, DB-backed |
| Auth throttling | Partial | Per-email only (8/15min), resets on restart |
| 2FA | Built | Optional TOTP, zero-dependency |
| Authorization | Built | Role allow-lists on every route handler |
| Verification gate | Built | Server-side 403 on bidding |
| Contact gating | Built | Public directory strips PII server-side |
| Award idempotency | Built | Single transaction, OPEN+PENDING re-check |
| Audit immutability | Built | DB triggers hard-abort UPDATE/DELETE |
| Escrow safety | Built | DISPUTED freezes payouts |
| Money movement | Demo only | DB status flips — no licensed rail yet |

## Pre-launch risk register

Four items tracked in `TODOS.md` — worth surfacing here because three of them get
structurally more expensive if they land after the planned schema/async port (C0)
instead of during it:

1. **Medium** — No isolated test-DB harness (TODO-1)
2. **High** — Driver identity not bound to the bid (TODO-2)
3. **High** — No payout SLA tracker (TODO-3)
4. **Medium** — WhatsApp Business API not yet started (TODO-4)

## Bottom line

The plumbing earns the term sheet. The churn number earns the valuation. Nothing here
is vaporware — the escrow state machine, the audit trail, and the verification gate are
real, server-enforced, and already more rigorous than most marketplaces ship at this
stage. Fund the build. Tie the next tranche to the repeat-rate number, not the demo.

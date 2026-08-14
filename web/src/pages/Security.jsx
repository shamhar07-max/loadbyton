import React from 'react';
import { usePageTitle, useMeta } from '../lib/seo.jsx';

// TRUST SIGNAL, NOT A CLAIM SHEET: every line under "What's built today" is
// something a reviewer can verify against this repo (server/lib/*.js). The
// "Roadmap" section is deliberately dated-sounding and unfinished-looking —
// a vendor-risk questionnaire that finds an unearned "SOC 2 certified"
// badge trusts the vendor less, not more. Never promote an item from
// Roadmap to "built" here without it actually being true in the code.

const BUILT = [
  { title: 'Password storage', detail: 'bcrypt, cost factor 10 — never plaintext, never reversible.' },
  { title: 'Session security', detail: 'HttpOnly, SameSite cookies; sessions are DB-backed and expire server-side, not just client-side.' },
  { title: 'Field-level encryption', detail: 'IBAN and TRN are encrypted at rest (AES-256-GCM), not stored as plain text alongside the rest of a profile.' },
  { title: 'Role-based access, server-enforced', detail: 'Every mutating route checks role and account status in the API — never a UI-only restriction a client could bypass.' },
  { title: 'Append-only audit trail', detail: 'Every award, escrow action, verification, and dispute decision is written to a log that database triggers hard-block from being edited or deleted, even by us.' },
  { title: 'Rate limiting', detail: 'Every API route is throttled per address, with tighter limits on authentication and job-posting/bidding endpoints.' },
  { title: 'Security headers', detail: 'Content-Security-Policy, X-Frame-Options, and related headers on every response.' },
  { title: 'Multi-seat access control', detail: 'Company accounts can scope employee access to Operations, Finance, or read-only — not one shared login and password.' },
];

const ROADMAP = [
  'Independent third-party penetration test',
  'SOC 2 Type II readiness assessment',
  'ISO 27001 readiness assessment',
  'Public responsible-disclosure / bug bounty program',
];

export default function Security() {
  usePageTitle('Security');
  useMeta('How Loadbyton protects account, financial, and shipment data — what is built today, and what is on the roadmap.');
  return (
    <div className="container-page max-w-2xl py-16" dir="ltr">
      <h1 className="font-display text-3xl font-semibold text-ink md:text-4xl">Security</h1>
      <p className="mt-4 text-base leading-relaxed text-ink-secondary">
        This page lists what is actually implemented, not a marketing checklist. Where something isn't done yet,
        it's listed as a roadmap item — not implied.
      </p>

      <h2 className="mt-10 font-display text-lg font-semibold text-ink">What's built today</h2>
      <div className="mt-4 space-y-4">
        {BUILT.map((item) => (
          <div key={item.title} className="rounded-lg border p-4" style={{ borderColor: 'var(--border-default)' }}>
            <p className="text-sm font-semibold text-ink">{item.title}</p>
            <p className="mt-1 text-sm text-ink-muted">{item.detail}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 font-display text-lg font-semibold text-ink">Roadmap — not yet complete</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-ink-muted">
        {ROADMAP.map((item) => <li key={item}>{item}</li>)}
      </ul>

      <h2 className="mt-10 font-display text-lg font-semibold text-ink">Report a vulnerability</h2>
      <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
        Found a security issue? Email <span className="font-mono">security@loadbyton.ae</span> — replace with a
        monitored inbox before this goes live; this address is a placeholder shipped with the page, not yet an
        active mailbox.
      </p>
    </div>
  );
}

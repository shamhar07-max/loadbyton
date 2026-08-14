import React from 'react';
import { usePageTitle, useMeta } from '../lib/seo.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { IconShield, IconClock, IconFile, IconLayers, IconUser, IconCompass, IconCheck, IconAlert } from '../components/icons.jsx';

// TRUST SIGNAL, NOT A CLAIM SHEET: every line under "What's built today" is
// something a reviewer can verify against this repo (server/lib/*.js). The
// "Roadmap" section is deliberately dated-sounding and unfinished-looking —
// a vendor-risk questionnaire that finds an unearned "SOC 2 certified"
// badge trusts the vendor less, not more. Never promote an item from
// Roadmap to "built" here without it actually being true in the code — and
// that applies to this pass too: everything below is a presentation change
// (icons, layout, cards), the text content is unchanged from before.

const BUILT = [
  { icon: <IconShield size={18} />, title: 'Password storage', detail: 'bcrypt, cost factor 10 — never plaintext, never reversible.' },
  { icon: <IconClock size={18} />, title: 'Session security', detail: 'HttpOnly, SameSite cookies; sessions are DB-backed and expire server-side, not just client-side.' },
  { icon: <IconFile size={18} />, title: 'Field-level encryption', detail: 'IBAN and TRN are encrypted at rest (AES-256-GCM), not stored as plain text alongside the rest of a profile.' },
  { icon: <IconLayers size={18} />, title: 'Role-based access, server-enforced', detail: 'Every mutating route checks role and account status in the API — never a UI-only restriction a client could bypass.' },
  { icon: <IconFile size={18} />, title: 'Append-only audit trail', detail: 'Every award, escrow action, verification, and dispute decision is written to a log that database triggers hard-block from being edited or deleted, even by us.' },
  { icon: <IconCompass size={18} />, title: 'Rate limiting', detail: 'Every API route is throttled per address, with tighter limits on authentication and job-posting/bidding endpoints.' },
  { icon: <IconShield size={18} />, title: 'Security headers', detail: 'Content-Security-Policy, X-Frame-Options, and related headers on every response.' },
  { icon: <IconUser size={18} />, title: 'Multi-seat access control', detail: 'Company accounts can scope employee access to Operations, Finance, or read-only — not one shared login and password.' },
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
    <div dir="ltr">
      <section className="border-b" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page py-16 md:py-20">
          <Reveal className="max-w-2xl">
            <span className="badge" style={{ background: 'var(--brand-accent-bg)', color: 'var(--brand-accent)' }}>Security</span>
            <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">What's actually implemented — not a marketing checklist.</h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-secondary">
              Where something isn't done yet, it's listed as a roadmap item below — not implied as already in place.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="border-b py-16 md:py-20" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <Reveal as="h2" className="font-display text-2xl font-semibold text-ink">What's built today</Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {BUILT.map((item, i) => (
              <Reveal key={item.title} delay={(i % 2) * 60} className="card flex gap-4 p-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
                  {item.icon}
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    {item.title} <IconCheck size={13} style={{ color: 'var(--status-success)' }} />
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">{item.detail}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b py-16 md:py-20" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page max-w-2xl">
          <Reveal>
            <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
              <IconAlert size={20} style={{ color: 'var(--status-warning)' }} /> Roadmap — not yet complete
            </h2>
            <ul className="mt-6 space-y-3">
              {ROADMAP.map((item) => (
                <li key={item} className="flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm text-ink-secondary" style={{ borderColor: 'var(--border-default)', background: 'var(--status-warning-bg)' }}>
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--status-warning)' }} />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container-page max-w-2xl">
          <Reveal>
            <h2 className="font-display text-2xl font-semibold text-ink">Report a vulnerability</h2>
            <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
              Found a security issue? Email <span className="font-mono">security@loadbyton.ae</span> — replace with a
              monitored inbox before this goes live; this address is a placeholder shipped with the page, not yet an
              active mailbox.
            </p>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

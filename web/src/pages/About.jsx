import React from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle, useMeta } from '../lib/seo.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { IconShield, IconLayers, IconClock, IconArrowRight } from '../components/icons.jsx';

const PRINCIPLES = [
  { icon: <IconShield size={20} />, title: 'Enforced server-side', body: 'Carrier verification, the escrow gate, and the forward-only status flow aren\'t UI hints — every one of them is checked on the server, on every request.' },
  { icon: <IconLayers size={20} />, title: 'A record that survives the job', body: 'Every bid, award, and status change writes to an append-only audit log. Documents and proof of delivery stay attached to the job permanently, not to whichever chat thread happened to carry them.' },
  { icon: <IconClock size={20} />, title: 'Built for the repeat shipment', body: 'A shipper who posts once and goes back to their usual broker is a cost paid for nothing — so the product is built around what makes the second and fiftieth shipment easier, not just the first.' },
];

export default function About() {
  usePageTitle('About');
  useMeta('Loadbyton is a UAE road freight & container drayage marketplace built to make the second shipment happen on-platform, with an accountable, escrow-backed system in place of an off-platform chat.');
  return (
    <div dir="ltr">
      <section className="border-b" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page py-16 md:py-20">
          <Reveal className="max-w-2xl">
            <span className="badge" style={{ background: 'var(--brand-accent-bg)', color: 'var(--brand-accent)' }}>About Loadbyton</span>
            <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">Built for the second shipment, not just the first.</h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-secondary">
              Most road freight in the UAE still moves the way it did a decade ago — a shipper with a stuck container, or a site waiting on a tripper load, calls around, a broker quotes a price nobody can verify against anything, and the whole arrangement lives in a chat thread that disappears the moment the truck arrives. It works, until it doesn't — and every time it works, the relationship stays off-platform.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="border-b py-16 md:py-20" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <Reveal as="h2" className="font-display text-2xl font-semibold text-ink">What the platform actually enforces.</Reveal>
          <Reveal as="p" delay={40} className="mt-2 max-w-xl text-sm text-ink-muted">Not marketing language — the mechanics a real freight marketplace has to run on.</Reveal>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={i * 70}>
                <div className="flex h-10 w-10 items-center justify-center rounded-md" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}>{p.icon}</div>
                <p className="mt-4 font-display text-base font-semibold text-ink">{p.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{p.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container-page max-w-2xl">
          <Reveal className="space-y-5 text-base leading-relaxed text-ink-secondary">
            <p>
              Loadbyton exists to change what happens after the first job. The product is built around the second shipment: recurring templates, committed contract lanes, a personal rate benchmark, and an escrow flow real enough that carriers and shippers can trust it with money.
            </p>
            <p>
              It's a working system, not a slide deck — payouts on the current deployment are a database status flip rather than a licensed money-transfer rail, and that's stated plainly on the <Link to="/security" className="text-brand-secondary hover:underline">Security</Link> and <Link to="/compliance" className="text-brand-secondary hover:underline">Compliance</Link> pages rather than glossed over. But the logic underneath — the state machine, the verification gate, the audit trail — is the logic a real freight marketplace needs to run on, and swapping in a licensed payout rail is a change to the execution layer, not a rewrite of the product.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pb-16 md:pb-20">
        <div className="container-page">
          <Reveal className="flex flex-col items-start justify-between gap-6 rounded-xl px-8 py-10 sm:flex-row sm:items-center" style={{ background: 'var(--lb-ink-900)' }}>
            <div>
              <p className="font-display text-xl font-semibold text-white">See the mechanics for yourself.</p>
              <p className="mt-1 text-sm text-white/60">A free account gets you a real job on the platform, not a demo environment.</p>
            </div>
            <Link to="/register" className="btn-accent shrink-0 rounded-full px-6 py-3 text-base">Get started <IconArrowRight size={18} /></Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

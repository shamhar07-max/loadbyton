import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { usePageTitle, useMeta } from '../lib/seo.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { IconCheck, IconArrowRight, IconShield } from '../components/icons.jsx';

const TIERS = [
  { name: 'Bronze', desc: 'Every account starts here.', fee: 'Standard take rate', perks: ['Post or bid on any open load', 'Escrow + live tracking', 'Standard 24h payout'] },
  { name: 'Silver', desc: 'Unlocked by volume.', fee: 'Reduced take rate', perks: ['Everything in Bronze', 'Priority support', 'Personal rate benchmark'], recommended: true },
  { name: 'Gold', desc: 'Committed lane volume.', fee: 'Lowest take rate', perks: ['Everything in Silver', 'Contract-lane priority visibility', 'Fastest payout on POD'] },
];

export default function Pricing() {
  usePageTitle('Pricing');
  useMeta('A transparent take rate, no subscription. See how Loadbyton pricing compares to broker markups.');
  const [takeRate, setTakeRate] = useState('6%');
  useEffect(() => { api.publicMarket().then((d) => setTakeRate(d.market.takeRate)).catch(() => {}); }, []);

  return (
    <div dir="ltr">
      <section className="border-b" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page py-16 md:py-20">
          <Reveal className="max-w-2xl">
            <span className="badge" style={{ background: 'var(--brand-accent-bg)', color: 'var(--brand-accent)' }}>Pricing</span>
            <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">One take rate. No subscription, no listing fee.</h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-secondary">
              Loadbyton takes <span className="tabular font-semibold text-ink">{takeRate}</span> of the agreed price on award — the same rate whether it's your first job or your five-hundredth. Volume lowers it through loyalty tiers, not negotiation.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container-page">
          <div className="grid gap-6 md:grid-cols-3">
            {TIERS.map((t, i) => (
              <Reveal
                key={t.name}
                delay={i * 70}
                className="card relative flex flex-col p-6"
                style={t.recommended ? { borderColor: 'var(--brand-accent)', boxShadow: 'var(--lb-shadow-md)' } : undefined}
              >
                {t.recommended && (
                  <span className="badge absolute -top-3 left-6" style={{ background: 'var(--brand-accent)', color: 'var(--text-on-accent)' }}>Most popular</span>
                )}
                <p className="font-display text-lg font-semibold text-ink">{t.name}</p>
                <p className="mt-1 text-sm text-ink-muted">{t.desc}</p>
                <p className="mt-4 font-display text-2xl font-semibold" style={{ color: 'var(--brand-accent)' }}>{t.fee}</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {t.perks.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-ink-secondary">
                      <IconCheck size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--status-success)' }} /> {p}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t py-16 md:py-20" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <Reveal className="grid items-start gap-8 lg:grid-cols-[0.9fr,1.1fr]">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-md" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}>
                <IconShield size={20} />
              </div>
              <p className="mt-4 font-display text-lg font-semibold text-ink">Where the fee actually goes</p>
            </div>
            <p className="text-sm leading-relaxed text-ink-secondary">
              The take rate funds carrier verification, escrow administration, dispute resolution, and the Lane Index data product — not a sales team cold-calling shippers. Freight amount passes through to the carrier; the platform only ever holds the fee.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pb-16 md:pb-20">
        <div className="container-page">
          <Reveal className="flex flex-col items-start justify-between gap-6 rounded-xl px-8 py-10 sm:flex-row sm:items-center" style={{ background: 'var(--lb-ink-900)' }}>
            <p className="font-display text-xl font-semibold text-white">No card required to browse open loads.</p>
            <Link to="/register" className="btn-accent shrink-0 rounded-full px-6 py-3 text-base">Create a free account <IconArrowRight size={18} /></Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

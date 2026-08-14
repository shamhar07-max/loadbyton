import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { usePageTitle, useMeta } from '../lib/seo.jsx';
import { IconCheck, IconArrowRight } from '../components/icons.jsx';

const TIERS = [
  { name: 'Bronze', desc: 'Every account starts here.', fee: 'Standard take rate', perks: ['Post or bid on any open load', 'Escrow + live tracking', 'Standard 24h payout'] },
  { name: 'Silver', desc: 'Unlocked by volume.', fee: 'Reduced take rate', perks: ['Everything in Bronze', 'Priority support', 'Personal rate benchmark'] },
  { name: 'Gold', desc: 'Committed lane volume.', fee: 'Lowest take rate', perks: ['Everything in Silver', 'Contract-lane priority visibility', 'Fastest payout on POD'] },
];

export default function Pricing() {
  usePageTitle('Pricing');
  useMeta('A transparent take rate, no subscription. See how Loadbyton pricing compares to broker markups.');
  const [takeRate, setTakeRate] = useState('6%');
  useEffect(() => { api.publicMarket().then((d) => setTakeRate(d.market.takeRate)).catch(() => {}); }, []);

  return (
    <div className="container-page py-16" dir="ltr">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-semibold text-ink md:text-4xl">One take rate. No subscription, no listing fee.</h1>
        <p className="mt-4 text-lg text-ink-secondary">
          Loadbyton takes <span className="tabular font-semibold text-ink">{takeRate}</span> of the agreed price on award — the same rate whether it's your first job or your five-hundredth. Volume lowers it through loyalty tiers, not negotiation.
        </p>
      </div>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {TIERS.map((t) => (
          <div key={t.name} className="card p-6">
            <p className="font-display text-lg font-semibold text-ink">{t.name}</p>
            <p className="mt-1 text-sm text-ink-muted">{t.desc}</p>
            <p className="mt-4 font-display text-2xl font-semibold" style={{ color: 'var(--brand-accent)' }}>{t.fee}</p>
            <ul className="mt-5 space-y-2.5">
              {t.perks.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm text-ink-secondary">
                  <IconCheck size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--status-success)' }} /> {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-14 max-w-2xl">
        <p className="font-display text-lg font-semibold text-ink">Where the fee actually goes</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          The take rate funds carrier verification, escrow administration, dispute resolution, and the Lane Index data product — not a sales team cold-calling shippers. Freight amount passes through to the carrier; the platform only ever holds the fee.
        </p>
      </div>

      <div className="mt-14 rounded-xl px-8 py-10" style={{ background: 'var(--lb-ink-900)' }}>
        <p className="font-display text-xl font-semibold text-white">No card required to browse open loads.</p>
        <Link to="/register" className="btn-accent mt-4 rounded-full px-6 py-3 text-base">Create a free account <IconArrowRight size={18} /></Link>
      </div>
    </div>
  );
}

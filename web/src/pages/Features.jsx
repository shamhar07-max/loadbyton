import React from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle, useMeta } from '../lib/seo.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { IconShield, IconClock, IconMapPin, IconFile, IconStar, IconPackage, IconTruck, IconArrowRight, IconLayers, IconCompass } from '../components/icons.jsx';

const FEATURES = [
  { icon: <IconShield size={20} />, title: 'Escrow, not a promise', body: 'The agreed price is held the moment you award a bid. It releases when you confirm delivery — or automatically 24h after, so nothing sits in limbo.' },
  { icon: <IconLayers size={20} />, title: '12 equipment types, one flow', body: 'Container chassis, flatbed, lowbed, tripper, curtain truck, side loader, or a 3–10 tonne pickup — post the equipment the job actually needs, not just a container.' },
  { icon: <IconPackage size={20} />, title: 'Recurring templates', body: 'Save a lane once. Re-run it into a fresh open job in one click, instead of re-typing the same container, terminal and address every week.' },
  { icon: <IconTruck size={20} />, title: 'Verified carriers only', body: 'TRN, trade licence and insurance are checked before a carrier can place a single bid — enforced server-side, not just hidden in the UI.' },
  { icon: <IconMapPin size={20} />, title: 'Live tracking & demurrage clock', body: 'Every job shows its position in the lifecycle, a geofence-style pickup/delivery flag, and exactly how much free-time is left before demurrage kicks in.' },
  { icon: <IconCompass size={20} />, title: 'Volume inquiries, UAE-wide', body: 'State a container count or truck count once and get one bid covering the full batch — across six terminals in Dubai, Abu Dhabi, Sharjah and Fujairah.' },
  { icon: <IconFile size={20} />, title: 'A document thread that survives', body: 'Customs paperwork, receipts and proof of delivery live on the job permanently, with a full audit trail — not in a disappearing chat that dies when the job ends.' },
  { icon: <IconStar size={20} />, title: 'Ratings that compound', body: 'Every completed job updates a carrier or shipper\'s public rating, so reliability becomes a visible, portable asset.' },
  { icon: <IconClock size={20} />, title: 'Auto-release, no chasing', body: "Escrow releases the moment a shipper confirms delivery, or automatically after a set window — a payout doesn't depend on someone remembering to call." },
];

export default function Features() {
  usePageTitle('Features');
  useMeta('Escrow-backed freight jobs across the UAE, 12 equipment types, volume inquiries, live tracking, contract lanes and a verified carrier network — everything Loadbyton ships.');
  return (
    <div dir="ltr">
      <section className="border-b" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page py-16 md:py-20">
          <Reveal className="max-w-2xl">
            <span className="badge" style={{ background: 'var(--brand-accent-bg)', color: 'var(--brand-accent)' }}>Platform capabilities</span>
            <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">Everything it takes to stop re-negotiating the same shipment.</h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-secondary">Loadbyton isn't a listings board. It's the escrow, the state machine, and the paper trail a drayage marketplace actually needs.</p>
          </Reveal>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container-page">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 70} className="card card-hover p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-md" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}>{f.icon}</div>
                <p className="mt-4 font-display text-base font-semibold text-ink">{f.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{f.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16 md:pb-20">
        <div className="container-page">
          <Reveal
            className="relative flex flex-col items-start justify-between gap-6 overflow-hidden rounded-xl px-8 py-10 sm:flex-row sm:items-center"
            style={{ background: 'var(--lb-ink-900)' }}
          >
            <IconLayers size={140} className="pointer-events-none absolute -right-4 -top-6 opacity-10" style={{ color: 'var(--lb-orange-500)' }} />
            <p className="relative font-display text-xl font-semibold text-white">See it on a real job, not a slide.</p>
            <Link to="/register" className="btn-accent relative shrink-0 rounded-full px-6 py-3 text-base">Post your first load <IconArrowRight size={18} /></Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

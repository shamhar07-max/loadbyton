import React from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle, useMeta } from '../lib/seo.jsx';
import { IconShield, IconClock, IconMapPin, IconFile, IconStar, IconPackage, IconTruck, IconArrowRight, IconLayers, IconCompass } from '../components/icons.jsx';

const FEATURES = [
  { icon: <IconShield size={20} />, title: 'Escrow, not a promise', body: 'The agreed price is held the moment you award a bid. It releases when you confirm delivery — or automatically 24h after, so nothing sits in limbo.' },
  { icon: <IconLayers size={20} />, title: '12 equipment types, one flow', body: 'Container chassis, flatbed, lowbed, tripper, curtain truck, side loader, or a 3–10 tonne pickup — post the equipment the job actually needs, not just a container.' },
  { icon: <IconPackage size={20} />, title: 'Recurring templates', body: 'Save a lane once. Re-run it into a fresh open job in one click, instead of re-typing the same container, terminal and address every week.' },
  { icon: <IconTruck size={20} />, title: 'Verified carriers only', body: 'TRN, trade licence and insurance are checked before a carrier can place a single bid — enforced server-side, not just hidden in the UI.' },
  { icon: <IconMapPin size={20} />, title: 'Live tracking & demurrage clock', body: 'Every job shows its position in the lifecycle, a geofence-style pickup/delivery flag, and exactly how much free-time is left before demurrage kicks in.' },
  { icon: <IconCompass size={20} />, title: 'Volume inquiries, UAE-wide', body: 'State a container count or truck count once and get one bid covering the full batch — across six terminals in Dubai, Abu Dhabi, Sharjah and Fujairah.' },
  { icon: <IconFile size={20} />, title: 'A document thread that survives', body: 'Customs paperwork, receipts and proof of delivery live on the job permanently — not in a WhatsApp thread that dies when the job ends.' },
  { icon: <IconStar size={20} />, title: 'Ratings that compound', body: 'Every completed job updates a carrier or shipper\'s public rating, so reliability becomes a visible, portable asset.' },
];

export default function Features() {
  usePageTitle('Features');
  useMeta('Escrow-backed freight jobs across the UAE, 12 equipment types, volume inquiries, live tracking, contract lanes and a verified carrier network — everything Loadbyton ships.');
  return (
    <div className="container-page py-16" dir="ltr">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-semibold text-ink md:text-4xl">Everything it takes to stop re-negotiating the same shipment.</h1>
        <p className="mt-4 text-lg text-ink-secondary">Loadbyton isn't a listings board. It's the escrow, the state machine, and the paper trail a drayage marketplace actually needs.</p>
      </div>

      <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title}>
            <div className="flex h-10 w-10 items-center justify-center rounded-md" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}>{f.icon}</div>
            <p className="mt-4 font-display text-base font-semibold text-ink">{f.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{f.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 rounded-xl px-8 py-10" style={{ background: 'var(--lb-navy-900)' }}>
        <p className="font-display text-xl font-semibold text-white">See it on a real job, not a slide.</p>
        <Link to="/register" className="btn-accent mt-4 px-6 py-3 text-base">Post your first load <IconArrowRight size={18} /></Link>
      </div>
    </div>
  );
}

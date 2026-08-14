import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatLabel, TERMINALS, TERMINAL_INFO, EQUIPMENT_TYPES, equipmentLabel } from '../lib/constants.js';
import { usePageTitle } from '../lib/seo.jsx';
import { useLocale } from '../lib/i18n.jsx';
import { IconShield, IconClock, IconMapPin, IconArrowRight, IconStar, IconTruck, IconPackage, IconTrailer, IconLayers, IconCompass } from '../components/icons.jsx';

const EQUIPMENT_ICONS = {
  CONTAINER_CHASSIS: IconPackage, REEFER_TRUCK: IconPackage, LOWBED_TRAILER: IconTrailer, FLATBED_TRAILER: IconTrailer,
  BOX_TRUCK: IconTruck, CURTAIN_TRUCK: IconTruck, PICKUP_3T: IconTruck, PICKUP_5T: IconTruck, PICKUP_7T: IconTruck,
  PICKUP_10T: IconTruck, SIDE_LOADER_TRAILER: IconLayers, TRIPPER: IconLayers,
};

export default function Landing() {
  usePageTitle('');
  const { t } = useLocale();
  const [lanes, setLanes] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [market, setMarket] = useState(null);

  useEffect(() => {
    api.publicLanes().then((d) => setLanes(d.lanes.slice(0, 5))).catch(() => {});
    api.publicCarriers().then((d) => setCarriers(d.carriers.slice(0, 4))).catch(() => {});
    api.publicMarket().then((d) => setMarket(d.market)).catch(() => {});
  }, []);

  return (
    <div>
      {/* Hero — split, not centered. Left: thesis. Right: a real component preview (the live lane index), not a stock photo. */}
      <section className="border-b" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page grid gap-12 py-16 lg:grid-cols-[1.05fr,0.95fr] lg:py-24">
          <div className="flex flex-col justify-center">
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight text-ink md:text-5xl">
              {t('landing.hero.title')}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-secondary md:text-lg">
              {t('landing.hero.subtitle')}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register" className="btn-accent px-6 py-3 text-base">
                {t('landing.hero.ctaShipper')} <IconArrowRight size={18} />
              </Link>
              <Link to="/register?role=CARRIER" className="btn-secondary px-6 py-3 text-base">
                {t('landing.hero.ctaCarrier')}
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1.5"><IconShield size={16} /> {t('landing.hero.verified')}</span>
              <span className="inline-flex items-center gap-1.5"><IconClock size={16} /> {t('landing.hero.autoRelease', 'Auto-released in {hours}h', { hours: 24 })}</span>
              <span className="inline-flex items-center gap-1.5"><IconCompass size={16} /> {t('landing.hero.coverage')}</span>
            </div>
          </div>

          <div className="flex items-center">
            <div className="w-full overflow-hidden rounded-xl border shadow-lg" style={{ borderColor: 'var(--border-default)', background: 'var(--lb-navy-900)' }}>
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <p className="font-display text-sm font-semibold text-white">Lane Index — live</p>
                <span className="badge" style={{ background: 'rgba(217,119,6,0.18)', color: '#F0B06B' }}>Public data</span>
              </div>
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                {(lanes.length ? lanes : Array.from({ length: 5 })).map((lane, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3 text-sm" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{lane ? `${formatLabel(lane.terminal)} → ${formatLabel(lane.area)}` : 'Loading…'}</p>
                      <p className="tabular text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{lane ? `${lane.distanceKm} km · ${lane.onTimePct}% on-time` : ''}</p>
                    </div>
                    <p className="tabular font-display text-sm font-semibold" style={{ color: '#F0B06B' }}>{lane ? `AED ${lane.basePriceAed}` : ''}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-px px-5 py-4" style={{ background: 'rgba(255,255,255,0.06)' }}>
                {[
                  ['Open loads now', market?.openJobsNow ?? '—'],
                  ['Take rate', market?.takeRate ?? '—'],
                  ['UAE TEU / yr', market ? `${(market.teu2024 / 1e6).toFixed(1)}M` : '—'],
                ].map(([label, value]) => (
                  <div key={label} className="px-1 py-1 text-center">
                    <p className="tabular font-display text-base font-semibold text-white">{value}</p>
                    <p className="mt-0.5 text-[11px] text-white/50">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — a real sequence, numbering earns its place here. */}
      <section className="border-b py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <h2 className="font-display text-2xl font-semibold text-ink">Four steps, one escrow.</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-4">
            {[
              { n: '01', title: 'Post the job', body: 'Equipment type, pickup terminal, delivery address, deadline, budget — plus volume for more than one load.', icon: <IconPackage size={20} /> },
              { n: '02', title: 'Carriers bid', body: 'Verified carriers only. Price and ETA, benchmarked against the Lane Index.', icon: <IconTruck size={20} /> },
              { n: '03', title: 'Award & escrow', body: 'One transaction: bid accepted, price held, payout row created.', icon: <IconShield size={20} /> },
              { n: '04', title: 'Deliver & release', body: 'POD uploaded, you confirm — or it auto-releases in 24h either way.', icon: <IconClock size={20} /> },
            ].map((step) => (
              <div key={step.n}>
                <div className="flex h-10 w-10 items-center justify-center rounded-md" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}>
                  {step.icon}
                </div>
                <p className="tabular mt-4 text-xs font-semibold text-ink-muted">{step.n}</p>
                <p className="mt-1 font-display text-base font-semibold text-ink">{step.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Equipment coverage — not just containers. */}
      <section className="border-b py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <h2 className="font-display text-2xl font-semibold text-ink">Whatever's moving, not just containers.</h2>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">Post the equipment the job actually needs — a chassis for a 40ft box, a tripper for a construction haul, a 3-tonne pickup for a small run.</p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {EQUIPMENT_TYPES.map((t) => {
              const EqIcon = EQUIPMENT_ICONS[t] || IconTruck;
              return (
                <Link key={t} to="/register" className="card flex items-center gap-3 p-4 transition-shadow hover:shadow-md">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}>
                    <EqIcon size={18} />
                  </div>
                  <p className="text-sm font-medium text-ink">{equipmentLabel(t)}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* UAE coverage — explicitly not Jebel-Ali-only. */}
      <section className="border-b py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <h2 className="font-display text-2xl font-semibold text-ink">Live across the UAE, not just Dubai.</h2>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">Six terminals, four emirates, one Lane Index — the same escrow and bidding mechanics wherever the job starts.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TERMINALS.map((t) => (
              <div key={t} className="card flex items-start gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}>
                  <IconMapPin size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">{formatLabel(t)}</p>
                  <p className="text-xs text-ink-muted">{TERMINAL_INFO[t]?.emirate} · {TERMINAL_INFO[t]?.operator}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Volume & enterprise CTA band */}
      <section className="border-b py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <div className="flex flex-col items-start justify-between gap-6 rounded-xl border px-8 py-10 sm:flex-row sm:items-center" style={{ borderColor: 'var(--border-default)' }}>
            <div>
              <p className="font-display text-xl font-semibold text-ink">Moving 10 containers, or need 5 trucks for one job?</p>
              <p className="mt-1 max-w-lg text-sm text-ink-muted">Post it as a single volume inquiry — state the container count or truck count once, and a carrier bids to cover the whole batch.</p>
            </div>
            <Link to="/register" className="btn-secondary shrink-0 px-6 py-3 text-base">
              Post a volume inquiry <IconArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Carrier directory */}
      <section className="border-b py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold text-ink">Verified carriers, not a phone number in a group chat.</h2>
              <p className="mt-2 max-w-xl text-sm text-ink-muted">Every carrier here cleared TRN, trade licence, and insurance review before their first bid.</p>
            </div>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(carriers.length ? carriers : Array.from({ length: 4 })).map((c, i) => (
              <div key={c?.id || i} className="card p-5">
                <div className="flex items-start justify-between">
                  <p className="font-display text-sm font-semibold text-ink">{c?.name || 'Loading…'}</p>
                  <span className="badge" style={{ background: 'var(--lb-amber-100)', color: 'var(--brand-accent)' }}>{c?.tier}</span>
                </div>
                <p className="mt-2 flex items-center gap-1 text-sm text-ink-secondary">
                  <IconStar size={14} style={{ color: 'var(--brand-accent)' }} /> {c?.rating?.toFixed?.(2) ?? '—'} · {c?.completedJobs ?? 0} jobs
                </p>
                <p className="mt-1 text-xs text-ink-muted">{c ? `Fleet of ${c.fleetSize}` : ''}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="py-16">
        <div className="container-page">
          <div className="flex flex-col items-start justify-between gap-6 rounded-xl px-8 py-10 sm:flex-row sm:items-center" style={{ background: 'var(--lb-navy-900)' }}>
            <div>
              <p className="font-display text-xl font-semibold text-white">Your next shipment shouldn't be a re-negotiation.</p>
              <p className="mt-1 text-sm text-white/60">Save the lane once. Re-run it in two taps next time.</p>
            </div>
            <Link to="/register" className="btn-accent px-6 py-3 text-base">
              Get started free <IconArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

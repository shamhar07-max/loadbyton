import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatLabel, TERMINALS, TERMINAL_INFO, EQUIPMENT_TYPES, equipmentLabel } from '../lib/constants.js';
import { usePageTitle } from '../lib/seo.jsx';
import { useLocale } from '../lib/i18n.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { IconShield, IconClock, IconMapPin, IconArrowRight, IconStar, IconTruck, IconPackage, IconTrailer, IconLayers, IconCompass } from '../components/icons.jsx';

const EQUIPMENT_ICONS = {
  CONTAINER_CHASSIS: IconPackage, REEFER_TRUCK: IconPackage, LOWBED_TRAILER: IconTrailer, FLATBED_TRAILER: IconTrailer,
  BOX_TRUCK: IconTruck, CURTAIN_TRUCK: IconTruck, PICKUP_3T: IconTruck, PICKUP_5T: IconTruck, PICKUP_7T: IconTruck,
  PICKUP_10T: IconTruck, SIDE_LOADER_TRAILER: IconLayers, TRIPPER: IconLayers,
};

// Module scope, evaluated once when this chunk first loads — before React
// mounts anything. True only when server/index.js spliced build-time-
// prerendered static markup into #root (see entry-server.jsx): that markup
// already plays the hero's CSS entrance animation once, via CSS alone,
// before any JS has run. main.jsx's createRoot() then discards and
// recreates this whole tree, and without this guard the freshly created
// elements would replay the same animation a second time — a visible
// double-fade "pop" on every cold load of "/". Consumed at most once, by
// whichever Landing instance mounts first; a later mount from client-side
// navigation back to "/" animates normally.
let skipHeroAnimOnce = typeof document !== 'undefined' && !!document.getElementById('root')?.hasChildNodes();

export default function Landing() {
  usePageTitle('');
  const { t } = useLocale();
  const [lanes, setLanes] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [market, setMarket] = useState(null);
  const [heroAnim] = useState(() => {
    if (skipHeroAnimOnce) {
      skipHeroAnimOnce = false;
      return '';
    }
    return 'animate-hero-in';
  });

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
            <h1 className={`${heroAnim} font-display text-4xl font-semibold leading-[1.08] tracking-tight text-ink md:text-5xl`}>
              {t('landing.hero.title')}
            </h1>
            <p className={`${heroAnim} mt-5 max-w-lg text-base leading-relaxed text-ink-secondary md:text-lg`} style={{ animationDelay: '90ms' }}>
              {t('landing.hero.subtitle')}
            </p>
            <div className={`${heroAnim} mt-8 flex flex-wrap items-center gap-3`} style={{ animationDelay: '160ms' }}>
              <Link to="/register" className="btn-accent rounded-full px-6 py-3 text-base">
                {t('landing.hero.ctaShipper')} <IconArrowRight size={18} />
              </Link>
              <Link to="/register?role=CARRIER" className="btn-secondary rounded-full px-6 py-3 text-base">
                {t('landing.hero.ctaCarrier')}
              </Link>
            </div>
            <div className={`${heroAnim} mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-ink-muted`} style={{ animationDelay: '230ms' }}>
              <span className="inline-flex items-center gap-1.5"><IconShield size={16} /> {t('landing.hero.verified')}</span>
              <span className="inline-flex items-center gap-1.5"><IconClock size={16} /> {t('landing.hero.autoRelease', 'Auto-released in {hours}h', { hours: 24 })}</span>
              <span className="inline-flex items-center gap-1.5"><IconCompass size={16} /> {t('landing.hero.coverage')}</span>
            </div>
          </div>

          <div className={`${heroAnim} flex items-center`} style={{ animationDelay: '120ms' }}>
            <div className="w-full overflow-hidden rounded-xl border shadow-lg transition-shadow duration-500 hover:shadow-xl" style={{ borderColor: 'var(--border-default)', background: 'var(--lb-ink-900)' }}>
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <p className="font-display text-sm font-semibold text-white">Lane Index — live</p>
                <span className="badge" style={{ background: 'rgba(242,96,12,0.2)', color: 'var(--lb-orange-500)' }}>Public data</span>
              </div>
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                {(lanes.length ? lanes : Array.from({ length: 5 })).map((lane, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3 text-sm" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{lane ? `${formatLabel(lane.terminal)} → ${formatLabel(lane.area)}` : 'Loading…'}</p>
                      <p className="tabular text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{lane ? `${lane.distanceKm} km · ${lane.onTimePct}% on-time` : ''}</p>
                    </div>
                    <p className="tabular font-display text-sm font-semibold" style={{ color: 'var(--lb-orange-500)' }}>{lane ? `AED ${lane.basePriceAed}` : ''}</p>
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

      {/* Everything below is still English-only (see lib/i18n.jsx's scope
          note) — wrapped in dir="ltr" so untranslated sentences read
          correctly under the Arabic locale instead of having their
          terminal punctuation flip to the front of the line, the way
          plain RTL inheritance does to unmarked English text. */}
      <div dir="ltr">
      {/* How it works — a real sequence, numbering earns its place here. */}
      <section className="border-b py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <Reveal as="h2" className="font-display text-2xl font-semibold text-ink">Four steps, one escrow.</Reveal>
          <Reveal as="p" delay={40} className="mt-2 max-w-xl text-sm text-ink-muted">Every shipment moves through the same sequence, regardless of equipment type or emirate — one workflow to learn, not one per carrier relationship.</Reveal>
          <div className="mt-10 grid gap-8 md:grid-cols-4">
            {[
              { n: '01', title: 'Post the job', body: 'Specify equipment type, pickup terminal, delivery address, deadline, and budget. For more than one unit, post the count once as a volume inquiry.', icon: <IconPackage size={20} /> },
              { n: '02', title: 'Carriers bid', body: 'Only carriers verified on trade licence, insurance, and TRN can bid. Each price and ETA is benchmarked against the live Lane Index.', icon: <IconTruck size={20} /> },
              { n: '03', title: 'Award & escrow', body: 'Accepting a bid locks the price and creates a single payout record — the shipment and its funds move together from that point on.', icon: <IconShield size={20} /> },
              { n: '04', title: 'Deliver & release', body: 'The carrier uploads proof of delivery for your confirmation. If no action is taken, escrow releases automatically after 24 hours.', icon: <IconClock size={20} /> },
            ].map((step, i) => (
              <Reveal key={step.n} delay={i * 70}>
                <div className="flex h-10 w-10 items-center justify-center rounded-md" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}>
                  {step.icon}
                </div>
                <p className="tabular mt-4 text-xs font-semibold text-ink-muted">{step.n}</p>
                <p className="mt-1 font-display text-base font-semibold text-ink">{step.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{step.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Equipment coverage — not just containers. */}
      <section className="border-b py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <Reveal as="h2" className="font-display text-2xl font-semibold text-ink">Equipment coverage beyond containers.</Reveal>
          <Reveal as="p" delay={40} className="mt-2 max-w-xl text-sm text-ink-muted">Twelve equipment classes are supported today — container chassis and reefer trucks, flatbed and curtain-side trailers, tripper and side-loader configurations, and pickups from three to ten tonnes. Select what the job requires; carrier matching and pricing adjust accordingly.</Reveal>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {EQUIPMENT_TYPES.map((t, i) => {
              const EqIcon = EQUIPMENT_ICONS[t] || IconTruck;
              return (
                <Reveal key={t} as={Link} to="/register" delay={(i % 4) * 50} className="card card-hover group flex items-center gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-transform duration-300 group-hover:scale-110" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}>
                    <EqIcon size={18} />
                  </div>
                  <p className="text-sm font-medium text-ink">{equipmentLabel(t)}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* UAE coverage — explicitly not Jebel-Ali-only. */}
      <section className="border-b py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <Reveal as="h2" className="font-display text-2xl font-semibold text-ink">Coverage across four emirates.</Reveal>
          <Reveal as="p" delay={40} className="mt-2 max-w-xl text-sm text-ink-muted">Loadbyton operates from six terminals spanning Dubai, Abu Dhabi, Sharjah, and Fujairah. Escrow, bidding, and the Lane Index work identically at every terminal — pricing and carrier availability are simply local to where the job originates.</Reveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TERMINALS.map((t, i) => (
              <Reveal key={t} delay={(i % 3) * 60} className="card flex items-start gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}>
                  <IconMapPin size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">{formatLabel(t)}</p>
                  <p className="text-xs text-ink-muted">{TERMINAL_INFO[t]?.emirate} · {TERMINAL_INFO[t]?.operator}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Volume & enterprise CTA band */}
      <section className="border-b py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <Reveal className="flex flex-col items-start justify-between gap-6 rounded-xl border px-8 py-10 sm:flex-row sm:items-center" style={{ borderColor: 'var(--border-default)' }}>
            <div>
              <p className="font-display text-xl font-semibold text-ink">Multi-unit and multi-truck jobs, posted once.</p>
              <p className="mt-1 max-w-lg text-sm text-ink-muted">State the container count or truck count when posting — carriers bid to cover the full batch under a single agreed price, rather than negotiating unit by unit.</p>
            </div>
            <Link to="/register" className="btn-secondary shrink-0 rounded-full px-6 py-3 text-base">
              Post a volume inquiry <IconArrowRight size={18} />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Carrier directory */}
      <section className="border-b py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <div className="flex items-end justify-between">
            <div>
              <Reveal as="h2" className="font-display text-2xl font-semibold text-ink">A verified carrier network.</Reveal>
              <Reveal as="p" delay={40} className="mt-2 max-w-xl text-sm text-ink-muted">Every carrier is reviewed against trade licence, TRN, and insurance documentation before their first bid is accepted. Ratings and completed-job counts are drawn from delivery history on the platform, not self-reported.</Reveal>
            </div>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(carriers.length ? carriers : Array.from({ length: 4 })).map((c, i) => (
              <Reveal key={c?.id || i} delay={(i % 4) * 60} className="card card-hover p-5">
                <div className="flex items-start justify-between">
                  <p className="font-display text-sm font-semibold text-ink">{c?.name || 'Loading…'}</p>
                  <span className="badge" style={{ background: 'var(--brand-accent-bg)', color: 'var(--brand-accent)' }}>{c?.tier}</span>
                </div>
                <p className="mt-2 flex items-center gap-1 text-sm text-ink-secondary">
                  <IconStar size={14} style={{ color: 'var(--brand-accent)' }} /> {c?.rating?.toFixed?.(2) ?? '—'} · {c?.completedJobs ?? 0} jobs
                </p>
                <p className="mt-1 text-xs text-ink-muted">{c ? `Fleet of ${c.fleetSize}` : ''}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="py-16">
        <div className="container-page">
          <Reveal className="flex flex-col items-start justify-between gap-6 rounded-xl px-8 py-10 sm:flex-row sm:items-center" style={{ background: 'var(--lb-ink-900)' }}>
            <div>
              <p className="font-display text-xl font-semibold text-white">Recurring lanes, without recurring negotiation.</p>
              <p className="mt-1 text-sm text-white/60">Save a lane's equipment, route, and terms once. Re-posting it for the next shipment takes two steps, not a new round of quotes.</p>
            </div>
            <Link to="/register" className="btn-accent rounded-full px-6 py-3 text-base">
              Get started free <IconArrowRight size={18} />
            </Link>
          </Reveal>
        </div>
      </section>
      </div>
    </div>
  );
}

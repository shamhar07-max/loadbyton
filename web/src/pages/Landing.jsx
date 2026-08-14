import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { EQUIPMENT_TYPES, equipmentLabel } from '../lib/constants.js';
import { usePageTitle } from '../lib/seo.jsx';
import { useLocale } from '../lib/i18n.jsx';
import { Reveal } from '../components/Reveal.jsx';
import FreightMotionScene from '../components/FreightMotionScene.jsx';
import { IconShield, IconClock, IconArrowRight, IconStar, IconTruck, IconPackage, IconTrailer, IconLayers, IconCompass } from '../components/icons.jsx';

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
    api.publicCarriers().then((d) => setCarriers(d.carriers.slice(0, 4))).catch(() => {});
    api.publicMarket().then((d) => setMarket(d.market)).catch(() => {});
  }, []);

  return (
    <div>
      {/* Hero — split, not centered. Left: thesis. Right: an animated motion
          scene (FreightMotionScene) — a truck driving a dusk highway with
          the job lifecycle cycling above it — not a stock photo. */}
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
                <p className="flex items-center gap-2 font-display text-sm font-semibold text-white">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: 'var(--lb-orange-500)' }} />
                    <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--lb-orange-500)' }} />
                  </span>
                  Shipment in motion
                </p>
                <span className="badge" style={{ background: 'rgba(242,96,12,0.2)', color: 'var(--lb-orange-500)' }}>Escrow-backed</span>
              </div>

              <FreightMotionScene />

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
          <Reveal as="h2" className="font-display text-2xl font-semibold text-ink">One system. Zero chasing.</Reveal>
          <Reveal as="p" delay={40} className="mt-2 max-w-xl text-sm text-ink-muted">Post, bid, award, deliver — the same sequence every time, whether it's one container or a fifty-truck contract lane.</Reveal>
          <div className="mt-10 grid gap-8 md:grid-cols-4">
            {[
              { n: '01', title: 'Post the job', body: 'Equipment, terminal, delivery address, deadline, budget — one form, structured instantly. No back-and-forth to get a job in front of carriers.', icon: <IconPackage size={20} /> },
              { n: '02', title: 'Carriers bid', body: 'Verified carriers only — TRN, trade licence, and insurance checked before they ever see a load. Every bid is priced against the live Lane Index.', icon: <IconTruck size={20} /> },
              { n: '03', title: 'Award & escrow', body: 'Accept a bid and the price locks. Funds move into escrow automatically — no invoice to chase, no transfer to confirm by phone.', icon: <IconShield size={20} /> },
              { n: '04', title: 'Deliver & release', body: "POD goes up, escrow releases — confirm it yourself or let the 24-hour auto-release handle it. Either way, you're not calling anyone to get paid.", icon: <IconClock size={20} /> },
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

      {/* Equipment coverage — not just containers. A scrolling strip, not a
          12-card wall: the point is "we cover more than containers," not an
          inventory listing every class by name. */}
      <section className="border-b py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <Reveal as="h2" className="font-display text-2xl font-semibold text-ink">Every truck class. <span style={{ color: 'var(--brand-accent)' }}>One platform.</span></Reveal>
          <Reveal as="p" delay={40} className="mt-2 max-w-xl text-sm text-ink-muted">From container chassis to ten-tonne pickups, matched and priced the same way, every time.</Reveal>
        </div>
        <Reveal delay={80} className="relative mt-8 overflow-hidden py-1" style={{ maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)' }}>
          <div className="animate-marquee flex w-max items-center gap-3">
            {[...EQUIPMENT_TYPES, ...EQUIPMENT_TYPES].map((t, i) => {
              const EqIcon = EQUIPMENT_ICONS[t] || IconTruck;
              return (
                <span key={i} className="flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium text-ink-secondary" style={{ borderColor: 'var(--border-default)' }}>
                  <EqIcon size={16} style={{ color: 'var(--brand-accent)' }} /> {equipmentLabel(t)}
                </span>
              );
            })}
          </div>
        </Reveal>
      </section>

      {/* UAE coverage — explicitly not Jebel-Ali-only. A stat, not a roll
          call of every terminal by name: the claim is "the whole UAE," and
          three numbers make that case faster than six labeled cards do. */}
      <section className="border-b py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <div className="grid items-center gap-8 lg:grid-cols-[1.1fr,0.9fr]">
            <div>
              <Reveal as="h2" className="font-display text-2xl font-semibold text-ink">Built for the whole UAE <span style={{ color: 'var(--brand-accent)' }}>— not just Dubai.</span></Reveal>
              <Reveal as="p" delay={40} className="mt-2 max-w-md text-sm text-ink-muted">Post a job from Fujairah Port the same way you'd post one from Jebel Ali — same escrow, same bidding, same rules.</Reveal>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                ['4', 'Emirates'],
                ['6', 'Terminals'],
                ['1', 'Lane Index'],
              ].map(([value, label], i) => (
                <Reveal key={label} delay={i * 60} className="card p-4 text-center">
                  <p className="tabular font-display text-3xl font-bold" style={{ color: 'var(--brand-accent)' }}>{value}</p>
                  <p className="mt-1 text-xs font-medium text-ink-muted">{label}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Volume & enterprise CTA band */}
      <section className="border-b py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page">
          <Reveal
            className="group relative flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border px-8 py-10 transition-shadow duration-300 hover:shadow-lg sm:flex-row sm:items-center"
            style={{ borderColor: 'var(--border-default)', background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-accent) 10%, var(--bg-surface)), var(--bg-surface) 65%)' }}
          >
            <IconLayers
              size={150}
              className="pointer-events-none absolute -right-6 -top-8 transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:rotate-6"
              style={{ color: 'var(--brand-accent)', opacity: 0.12 }}
            />
            <div className="relative">
              <span className="badge" style={{ background: 'color-mix(in srgb, var(--brand-accent) 16%, transparent)', color: 'var(--brand-accent)' }}>Volume inquiry</span>
              <p className="mt-3 font-display text-xl font-semibold text-ink">Ten containers or five trucks — one job, not ten conversations.</p>
              <p className="mt-1 max-w-lg text-sm text-ink-muted">State the count once. Carriers bid to cover the whole batch at one agreed price — no unit-by-unit negotiation, no separate thread per truck.</p>
            </div>
            <Link to="/register" className="btn-accent relative shrink-0 rounded-full px-6 py-3 text-base transition-transform duration-200 group-hover:scale-[1.03]">
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
              <Reveal as="h2" className="font-display text-2xl font-semibold text-ink">Carriers who show up — verified, rated, accountable.</Reveal>
              <Reveal as="p" delay={40} className="mt-2 max-w-xl text-sm text-ink-muted">Trade licence, TRN, and insurance checked before their first bid. Ratings and job counts come from delivery history on the platform — not a phone reference.</Reveal>
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
              <p className="font-display text-xl font-semibold text-white">Run your lanes. Stop re-running the negotiation.</p>
              <p className="mt-1 text-sm text-white/60">Save a lane's equipment, route, and terms once. Next time, it's two taps — not a new round of calls and quotes.</p>
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

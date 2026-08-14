import React from 'react';
import { usePageTitle, useMeta } from '../lib/seo.jsx';
import { formatDate } from '../lib/constants.js';
import { Reveal } from '../components/Reveal.jsx';

const POSTS = [
  {
    title: 'Demurrage is the real cost of drayage — the truck is almost beside the point',
    date: '2026-07-18',
    tag: 'Operations',
    body: 'Free time runs out whether or not anyone is watching the clock. A container sitting two days past its free-time window at 400 AED/day has quietly outspent the truck that moved it. The fix isn\'t a faster truck — it\'s a visible countdown attached to the job itself, not a separate spreadsheet someone forgets to check.',
  },
  {
    title: 'Why "just add a phone number field" breaks a freight marketplace',
    date: '2026-06-30',
    tag: 'Product',
    body: 'The instant a shipper and carrier can text each other directly, the second job happens off-platform — at which point the marketplace only ever sees the first transaction from any given pair. Contact gating isn\'t friction for its own sake; it\'s the difference between a marketplace and a one-time introduction service.',
  },
  {
    title: 'An escrow state machine is not optional, even for a demo',
    date: '2026-06-05',
    tag: 'Engineering',
    body: 'PENDING, HELD, FUNDED, RELEASED, DISPUTED — five states, and every transition has to be enforced server-side or the escrow story is fiction. Building it as a real state machine from day one, even before a licensed payment rail exists, is what makes the eventual real-money version a swap of the execution layer, not a rewrite.',
  },
];

export default function Blog() {
  usePageTitle('Blog');
  useMeta('Notes on UAE drayage, demurrage, and building a freight marketplace that survives past the first job.');
  return (
    <div dir="ltr">
      <section className="border-b" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page py-16 md:py-20">
          <Reveal className="max-w-2xl">
            <span className="badge" style={{ background: 'var(--brand-accent-bg)', color: 'var(--brand-accent)' }}>Blog</span>
            <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">Notes from building Loadbyton</h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-secondary">Field notes on UAE drayage, demurrage economics, and the product/engineering decisions behind the platform.</p>
          </Reveal>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container-page max-w-2xl">
          <div className="space-y-10">
            {POSTS.map((p, i) => (
              <Reveal key={p.title} delay={i * 70} as="article" className="card p-6 md:p-8">
                <div className="flex items-center gap-3">
                  <span className="badge" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>{p.tag}</span>
                  <p className="text-xs text-ink-muted">{formatDate(p.date)}</p>
                </div>
                <h2 className="mt-3 font-display text-xl font-semibold text-ink">{p.title}</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-secondary">{p.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

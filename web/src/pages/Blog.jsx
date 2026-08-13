import React from 'react';
import { usePageTitle, useMeta } from '../lib/seo.jsx';
import { formatDate } from '../lib/constants.js';

const POSTS = [
  {
    title: 'Demurrage is the real cost of drayage — the truck is almost beside the point',
    date: '2026-07-18',
    body: 'Free time runs out whether or not anyone is watching the clock. A container sitting two days past its free-time window at 400 AED/day has quietly outspent the truck that moved it. The fix isn\'t a faster truck — it\'s a visible countdown attached to the job itself, not a separate spreadsheet someone forgets to check.',
  },
  {
    title: 'Why "just add a phone number field" breaks a freight marketplace',
    date: '2026-06-30',
    body: 'The instant a shipper and carrier can text each other directly, the second job happens off-platform — at which point the marketplace only ever sees the first transaction from any given pair. Contact gating isn\'t friction for its own sake; it\'s the difference between a marketplace and a one-time introduction service.',
  },
  {
    title: 'An escrow state machine is not optional, even for a demo',
    date: '2026-06-05',
    body: 'PENDING, HELD, FUNDED, RELEASED, DISPUTED — five states, and every transition has to be enforced server-side or the escrow story is fiction. Building it as a real state machine from day one, even before a licensed payment rail exists, is what makes the eventual real-money version a swap of the execution layer, not a rewrite.',
  },
];

export default function Blog() {
  usePageTitle('Blog');
  useMeta('Notes on UAE drayage, demurrage, and building a freight marketplace that survives past the first job.');
  return (
    <div className="container-page max-w-2xl py-16">
      <h1 className="font-display text-3xl font-semibold text-ink md:text-4xl">Notes from building Loadbyton</h1>
      <div className="mt-10 space-y-10">
        {POSTS.map((p) => (
          <article key={p.title} className="border-b pb-10 last:border-0" style={{ borderColor: 'var(--border-default)' }}>
            <p className="text-xs text-ink-muted">{formatDate(p.date)}</p>
            <h2 className="mt-1.5 font-display text-xl font-semibold text-ink">{p.title}</h2>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-secondary">{p.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

import React from 'react';
import { usePageTitle, useMeta } from '../lib/seo.jsx';

export default function About() {
  usePageTitle('About');
  useMeta('Loadbyton is a UAE road freight & container drayage marketplace built to make the second shipment happen on-platform, not on WhatsApp.');
  return (
    <div className="container-page max-w-2xl py-16">
      <h1 className="font-display text-3xl font-semibold text-ink md:text-4xl">Built for the second shipment, not just the first.</h1>
      <div className="mt-6 space-y-5 text-base leading-relaxed text-ink-secondary">
        <p>
          Most road freight in the UAE still moves the way it did a decade ago, in every emirate — a shipper with a stuck container, or a site waiting on a tripper load, calls around, a broker quotes a price nobody can verify against anything, and the whole arrangement lives in a WhatsApp thread that disappears the moment the truck arrives. It works, until it doesn't — and every time it works, the relationship stays off-platform.
        </p>
        <p>
          Loadbyton exists to change what happens after the first job. A shipper who posts once and goes back to their usual broker is a cost we paid for nothing — so the product is built around the second shipment: recurring templates, committed contract lanes, a personal rate benchmark, and an escrow flow real enough that carriers and shippers can trust it with money.
        </p>
        <p>
          The mechanics are not decorative. Every bid, award, and status change writes to an append-only audit log. Carrier verification is enforced on the server, not hidden in the UI. Escrow freezes the moment a dispute opens. It's a demo system — payouts are a database status flip, not a real transfer — but the logic underneath it is the logic a real freight marketplace needs to run on.
        </p>
      </div>
    </div>
  );
}

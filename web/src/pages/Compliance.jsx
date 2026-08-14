import React from 'react';
import { usePageTitle, useMeta } from '../lib/seo.jsx';

// Real PDPL principles, stated generally and accurately. Anything specific
// to THIS company (trade licence number, registered address, DPO contact)
// is a clearly marked placeholder — never a fabricated number. Filling
// those in is a business/legal step, not a code change.

export default function Compliance() {
  usePageTitle('Compliance');
  useMeta('How Loadbyton handles personal data under UAE PDPL, VAT invoicing, and where account data is hosted.');
  return (
    <div className="container-page max-w-2xl py-16" dir="ltr">
      <h1 className="font-display text-3xl font-semibold text-ink md:text-4xl">Compliance</h1>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">Data protection (UAE PDPL)</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-secondary">
        <p>
          Loadbyton processes personal data — company contacts, TRN, IBAN, driver names and phone numbers — under
          the principles of the UAE's Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data (PDPL):
          data is collected for a stated purpose, kept only as long as that purpose requires, and protected with
          controls proportionate to its sensitivity (see the <a href="/security" className="text-brand-secondary hover:underline">Security</a> page for what that means technically —
          field-level encryption for IBAN/TRN specifically).
        </p>
        <p>
          Account holders can request a copy of their data, a correction, or deletion by contacting{' '}
          <span className="font-mono">privacy@loadbyton.ae</span> — a placeholder inbox to be staffed before this
          goes live, not yet active.
        </p>
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">Where data is hosted</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
        Hosting region depends on deployment configuration (see <span className="font-mono">render.yaml</span> and{' '}
        <span className="font-mono">deploy/oracle-cloud/</span> in the repository) — this is stated here rather than
        asserted as UAE-only, because it isn't universally true across every deployment yet. A government or
        regulated-industry counterparty that requires in-country hosting should confirm the specific deployment
        target before onboarding.
      </p>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">VAT invoicing</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
        Platform commission is invoiced with a sequential invoice number and a VAT breakdown at the UAE standard
        rate, generated automatically when a payout releases. This does not cover the freight amount itself, which
        is a contract between shipper and carrier that Loadbyton is not a party to.
      </p>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">Company details</h2>
      <div className="mt-3 rounded-lg border border-dashed p-4 text-sm text-ink-muted" style={{ borderColor: 'var(--border-strong)' }}>
        <p>Trade licence number: <em>— add before publishing publicly —</em></p>
        <p className="mt-1">Registered address: <em>— add before publishing publicly —</em></p>
        <p className="mt-1">Free zone / mainland status: <em>— add before publishing publicly —</em></p>
      </div>
    </div>
  );
}

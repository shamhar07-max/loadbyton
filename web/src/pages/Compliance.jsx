import React from 'react';
import { usePageTitle, useMeta } from '../lib/seo.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { IconShield, IconMapPin, IconFile, IconInfo } from '../components/icons.jsx';

// Real PDPL principles, stated generally and accurately. Anything specific
// to THIS company (trade licence number, registered address, DPO contact)
// is a clearly marked placeholder — never a fabricated number. Filling
// those in is a business/legal step, not a code change. This pass is a
// presentation-only change (icons, cards, layout) — every sentence of legal
// text below is unchanged from before.

export default function Compliance() {
  usePageTitle('Compliance');
  useMeta('How Loadbyton handles personal data under UAE PDPL, VAT invoicing, and where account data is hosted.');
  return (
    <div dir="ltr">
      <section className="border-b" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page py-16 md:py-20">
          <Reveal className="max-w-2xl">
            <span className="badge" style={{ background: 'var(--brand-accent-bg)', color: 'var(--brand-accent)' }}>Compliance</span>
            <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">Data protection, hosting, and invoicing — stated plainly.</h1>
          </Reveal>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container-page max-w-2xl space-y-6">
          <Reveal className="card p-6 md:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}><IconShield size={18} /></div>
              <h2 className="font-display text-lg font-semibold text-ink">Data protection (UAE PDPL)</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink-secondary">
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
          </Reveal>

          <Reveal delay={60} className="card p-6 md:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}><IconMapPin size={18} /></div>
              <h2 className="font-display text-lg font-semibold text-ink">Where data is hosted</h2>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
              Hosting region depends on deployment configuration (see <span className="font-mono">render.yaml</span> and{' '}
              <span className="font-mono">deploy/oracle-cloud/</span> in the repository) — this is stated here rather than
              asserted as UAE-only, because it isn't universally true across every deployment yet. A government or
              regulated-industry counterparty that requires in-country hosting should confirm the specific deployment
              target before onboarding.
            </p>
          </Reveal>

          <Reveal delay={120} className="card p-6 md:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}><IconFile size={18} /></div>
              <h2 className="font-display text-lg font-semibold text-ink">VAT invoicing</h2>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
              Platform commission is invoiced with a sequential invoice number and a VAT breakdown at the UAE standard
              rate, generated automatically when a payout releases. This does not cover the freight amount itself, which
              is a contract between shipper and carrier that Loadbyton is not a party to.
            </p>
          </Reveal>

          <Reveal delay={180} className="card p-6 md:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: 'var(--bg-raised)', color: 'var(--brand-accent)' }}><IconInfo size={18} /></div>
              <h2 className="font-display text-lg font-semibold text-ink">Company details</h2>
            </div>
            <div className="mt-4 rounded-lg border border-dashed p-4 text-sm text-ink-muted" style={{ borderColor: 'var(--border-strong)' }}>
              <p>Trade licence number: <em>— add before publishing publicly —</em></p>
              <p className="mt-1">Registered address: <em>— add before publishing publicly —</em></p>
              <p className="mt-1">Free zone / mainland status: <em>— add before publishing publicly —</em></p>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

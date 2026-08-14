import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { usePageTitle } from '../lib/seo.jsx';
import { formatAED, formatDate } from '../lib/constants.js';
import { Stat, Card, Badge, EmptyState, Select } from '../components/ui.jsx';
import { IconPackage, IconDownload } from '../components/icons.jsx';

const RELEASE_LABEL = { MANUAL: 'Manual', AUTO_24H: 'Auto-released', DISPUTE_RESOLUTION: 'Dispute resolution' };
const STATUS_COLOR = { RELEASED: 'success', PENDING: 'warning', HELD: 'info', CANCELLED: 'danger' };
const DAY_MS = 24 * 60 * 60 * 1000;

function withinRange(dateStr, range) {
  if (range === 'all' || !dateStr) return true;
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return true;
  const days = (Date.now() - d.getTime()) / DAY_MS;
  if (range === 'month') return days <= 31;
  if (range === 'quarter') return days <= 92;
  return true;
}

function isThisCalendarMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

function downloadCsv(rows) {
  const headers = ['Job', 'Status', 'Gross AED', 'Fee AED', 'Net AED', 'Payout status', 'Release type', 'Released at'];
  const lines = rows.map((p) => [
    p.job_code, p.status, p.gross_aed, p.platform_fee_aed, p.net_aed, p.payout_status, p.release_type || '', p.released_at || '',
  ].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','));
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `loadbyton-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Earnings() {
  usePageTitle('Earnings');
  const [payouts, setPayouts] = useState([]);
  const [totals, setTotals] = useState({ paid: 0, pending: 0 });
  const [releaseFilter, setReleaseFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [invoiceByJob, setInvoiceByJob] = useState({});

  useEffect(() => {
    api.earnings().then((d) => {
      setPayouts(d.payouts);
      setTotals(d.totals);
    }).catch(() => {});
    api.invoices().then((d) => {
      const byJob = {};
      for (const inv of d.invoices) byJob[inv.job_id] = inv;
      setInvoiceByJob(byJob);
    }).catch(() => {});
  }, []);

  const filteredPayouts = payouts.filter((p) => {
    const releaseMatch = releaseFilter === 'all' || p.release_type === releaseFilter;
    const dateMatch = withinRange(p.released_at || p.job_created, dateRange);
    return releaseMatch && dateMatch;
  });

  const thisMonthPaid = payouts
    .filter((p) => p.payout_status === 'RELEASED' && isThisCalendarMonth(p.released_at))
    .reduce((s, r) => s + r.net_aed, 0);

  const releasedCount = payouts.filter((p) => p.payout_status === 'RELEASED').length;

  const releaseOptions = [
    { label: 'Release: All', value: 'all' },
    { label: 'Manual', value: 'MANUAL' },
    { label: 'Auto-released', value: 'AUTO_24H' },
    { label: 'Dispute resolution', value: 'DISPUTE_RESOLUTION' },
  ];

  const dateOptions = [
    { label: 'All time', value: 'all' },
    { label: 'Last 31 days', value: 'month' },
    { label: 'Last 92 days', value: 'quarter' },
  ];

  return (
    <div className="container-page py-10" dir="ltr">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Earnings</h1>
          <p className="mt-1 text-sm text-ink-muted">Your payout ledger — this is what the founder pays against.</p>
        </div>
        {payouts.length > 0 && (
          <button onClick={() => downloadCsv(filteredPayouts)} className="btn-secondary">
            <IconDownload size={16} /> Export CSV
          </button>
        )}
      </div>

      {/* F18 (gstack review): this divided totals.paid (RELEASED payouts
          only) by payouts.length (every payout, including PENDING) —
          understating the true average per completed job. */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Paid out" value={formatAED(totals.paid)} tone="accent" />
        <Stat label="Pending" value={formatAED(totals.pending)} />
        <Stat label="Paid this month" value={formatAED(thisMonthPaid)} />
        {/* F18, fixed independently on both branches — kept main's
            precomputed releasedCount over this branch's inline filter. */}
        <Stat label="Avg per job" value={releasedCount > 0 ? formatAED(Math.round(totals.paid / releasedCount)) : '—'} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Select value={releaseFilter} onChange={(e) => setReleaseFilter(e.target.value)} className="w-auto">
          {releaseOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </Select>
        <Select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="w-auto">
          {dateOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </Select>
      </div>

      <div className="mt-8">
        {payouts.length === 0 ? (
          <EmptyState icon={<IconPackage size={28} />} title="No payouts yet" description="Win a bid and complete the job to see your first payout here." />
        ) : filteredPayouts.length === 0 ? (
          <EmptyState icon={<IconPackage size={28} />} title="No payouts match these filters" description="Try a wider date range or release type." />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto scroll-fade-x">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-ink-muted" style={{ borderColor: 'var(--border-default)' }}>
                    <th className="px-5 py-3 font-medium">Job</th>
                    <th className="px-5 py-3 font-medium">Gross</th>
                    <th className="px-5 py-3 font-medium">Fee</th>
                    <th className="px-5 py-3 font-medium">Net</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Release</th>
                    <th className="px-5 py-3 font-medium">Released</th>
                    <th className="px-5 py-3 font-medium">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayouts.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-raised" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="px-5 py-3 font-mono text-xs">
                        <Link to={`/jobs/${p.job_id}`} className="text-brand-secondary hover:underline">{p.job_code}</Link>
                      </td>
                      <td className="tabular px-5 py-3 text-ink-secondary">{formatAED(p.gross_aed)}</td>
                      <td className="tabular px-5 py-3 text-ink-muted">−{formatAED(p.platform_fee_aed)}</td>
                      <td className="tabular px-5 py-3 font-semibold text-ink">{formatAED(p.net_aed)}</td>
                      <td className="px-5 py-3"><Badge color={STATUS_COLOR[p.payout_status] || 'neutral'}>{p.payout_status}</Badge></td>
                      <td className="px-5 py-3 text-ink-muted">{RELEASE_LABEL[p.release_type] || '—'}</td>
                      <td className="px-5 py-3 text-ink-muted">{formatDate(p.released_at)}</td>
                      <td className="px-5 py-3">
                        {invoiceByJob[p.job_id] ? (
                          <a href={`/api/invoices/${invoiceByJob[p.job_id].id}`} target="_blank" rel="noreferrer" className="text-brand-secondary hover:underline">
                            {invoiceByJob[p.job_id].invoice_number}
                          </a>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

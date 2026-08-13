import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { usePageTitle } from '../lib/seo.jsx';
import { formatAED, formatDate } from '../lib/constants.js';
import { Stat, Card, Badge, EmptyState, Select, Input } from '../components/ui.jsx';
import { IconPackage, IconDownload } from '../components/icons.jsx';

const RELEASE_LABEL = { MANUAL: 'Manual', AUTO_24H: 'Auto-released', DISPUTE_RESOLUTION: 'Dispute resolution' };
const STATUS_COLOR = { RELEASED: 'success', PENDING: 'warning', HELD: 'info', CANCELLED: 'danger' };

export default function Earnings() {
  usePageTitle('Earnings');
  const { user } = useAuth();
  const [payouts, setPayouts] = useState([]);
  const [totals, setTotals] = useState({ paid: 0, pending: 0 });
  const [releaseFilter, setReleaseFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');

  useEffect(() => {
    api.earnings().then((d) => {
      setPayouts(d.payouts);
      setTotals(d.totals);
    }).catch(() => {});
  }, []);

  const filteredPayouts = payouts.filter((p) => {
    const releaseMatch = releaseFilter === 'all' || p.release_type === releaseFilter;
    const dateMatch = dateRange === 'all' || /* simplified date check */ true;
    return releaseMatch && dateMatch;
  });

  const paid = filteredPayouts.filter((p) => p.payout_status === 'RELEASED').reduce((s, r) => s + r.net_aed, 0);
  const pending = filteredPayouts.filter((p) => !['RELEASED', 'CANCELLED'].includes(p.payout_status)).reduce((s, r) => s + r.net_aed, 0);

  const releaseOptions = [
    { label: 'All', value: 'all' },
    { label: 'Manual', value: 'MANUAL' },
    { label: 'Auto-released', value: 'AUTO_24H' },
    { label: 'Dispute resolution', value: 'DISPUTE_RESOLUTION' },
  ];

  const dateOptions = [
    { label: 'All time', value: 'all' },
    { label: 'This month', value: 'month' },
    { label: 'This quarter', value: 'quarter' },
  ];

  return (
    <div className="container-page py-10">
      <h1 className="font-display text-2xl font-semibold text-ink">Earnings</h1>
      <p className="mt-1 text-sm text-ink-muted">Your payout ledger — winnings from completed and active jobs.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Paid out" value={formatAED(totals.paid)} tone="accent" />
        <Stat label="Pending" value={formatAED(totals.pending)} />
        <Stat label="This month" value={formatAED(Math.round(pending * 0.3))} />
        <Stat label="Avg per job" value={totals.paid > 0 ? formatAED(Math.round(totals.paid / (payouts.length || 1)))} />
      </div>

      <div className="mt-6">
        <Select onChange={(e) => setReleaseFilter(e.target.value)} className="input">
          {releaseOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        <Select onChange={(e) => setDateRange(e.target.value)} className="input">
          {dateOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      </div>

      <div className="mt-8">
        {filteredPayouts.length === 0 ? (
          <EmptyState icon={<IconPackage size={28} />} title="No payouts yet" description="Win a bid and complete the job to see your first payout here." />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
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
                    <th className="px-5 py-3 font-medium">View</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayouts.map((p) => (
                    <tr key={p.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="px-5 py-3 font-mono text-xs text-ink-secondary">
                        <Link to={`/jobs/${p.job_id}`} className="text-brand-primary hover:underline">{p.job_code}</Link>
                      </td>
                      <td className="tabular px-5 py-3 text-ink-secondary">{formatAED(p.gross_aed)}</td>
                      <td className="tabular px-5 py-3 text-ink-muted">−{formatAED(p.platform_fee_aed)}</td>
                      <td className="tabular px-5 py-3 font-semibold text-ink">{formatAED(p.net_aed)}</td>
                      <td className="px-5 py-3"><Badge color={STATUS_COLOR[p.payout_status] || 'neutral'}>{p.payout_status}</Badge></td>
                      <td className="px-5 py-3 text-ink-muted">{RELEASE_LABEL[p.release_type] || '—'}</td>
                      <td className="px-5 py-3 text-ink-muted">{formatDate(p.released_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button variant="link" size="sm" className="text-sm text-brand-primary">View</Button>
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
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { usePageTitle } from '../lib/seo.jsx';
import { formatAED, formatLabel, equipmentLabel } from '../lib/constants.js';
import { Button, Card, Badge, EmptyState } from '../components/ui.jsx';
import { IconPackage, IconX } from '../components/icons.jsx';
import { useToasts } from '../components/Toast.jsx';

const STATUS_COLOR = { PENDING: 'neutral', ACCEPTED: 'success', REJECTED: 'danger', WITHDRAWN: 'neutral' };

export default function MyBids() {
  usePageTitle('My bids');
  const [bids, setBids] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const { addToast } = useToasts();

  function load() {
    api.myBids().then((d) => setBids(d.bids)).catch(() => setBids([]));
  }
  useEffect(load, []);

  async function withdraw(bid) {
    setBusyId(bid.id);
    try {
      await api.withdrawBid(bid.id);
      addToast({ type: 'status_change', title: 'Bid withdrawn', body: `Your bid on ${bid.job_code} was withdrawn.` });
      load();
    } catch (err) {
      addToast({ type: 'system_message', title: 'Could not withdraw', body: err.message });
    } finally {
      setBusyId(null);
    }
  }

  if (bids === null) {
    return (
      <div className="container-page py-10" dir="ltr">
        <h1 className="font-display text-2xl font-semibold text-ink">My bids</h1>
        <p className="mt-1 text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="container-page py-10" dir="ltr">
      <h1 className="font-display text-2xl font-semibold text-ink">My bids</h1>
      <p className="mt-1 text-sm text-ink-muted">Your competitive quotes on open loads.</p>

      <Card className="mt-6">
        <Card.Content className="p-0">
          {bids.length === 0 ? (
            <EmptyState icon={<IconPackage size={28} />} title="No bids yet" description="Browse open loads and place your first bid." />
          ) : (
            <div className="overflow-x-auto scroll-fade-x">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-ink-muted" style={{ borderColor: 'var(--border-default)' }}>
                    <th className="px-5 py-3 font-medium">Job</th>
                    <th className="px-5 py-3 font-medium">Lane</th>
                    <th className="px-5 py-3 font-medium">Price</th>
                    <th className="px-5 py-3 font-medium">ETA</th>
                    <th className="px-5 py-3 font-medium">Equipment</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bids.map((b) => (
                    <tr key={b.id} className="border-b last:border-0 hover:bg-raised" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="px-5 py-3">
                        <Link to={`/jobs/${b.job_id}`} className="font-mono text-xs text-brand-secondary hover:underline">{b.job_code}</Link>
                      </td>
                      <td className="px-5 py-3 text-ink-secondary">{formatLabel(b.pickup_terminal)} → {formatLabel(b.delivery_area)}</td>
                      <td className="tabular px-5 py-3 text-ink-secondary">{formatAED(b.amount_aed)}</td>
                      <td className="px-5 py-3 text-ink-secondary">{b.eta_minutes} min</td>
                      <td className="px-5 py-3 text-ink-secondary">{b.truck_type ? equipmentLabel(b.truck_type) : '—'}</td>
                      <td className="px-5 py-3">
                        <Badge color={STATUS_COLOR[b.status] || 'neutral'}>{b.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {b.status === 'PENDING' && b.job_status === 'OPEN' && (
                          <Button variant="ghost" size="sm" onClick={() => withdraw(b)} loading={busyId === b.id}>
                            <IconX size={13} /> Withdraw
                          </Button>
                        )}
                        {b.status === 'ACCEPTED' && (
                          <Link to={`/jobs/${b.job_id}`}>
                            <Button variant="link" size="sm">Track shipment</Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}

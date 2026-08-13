import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { usePageTitle } from '../lib/seo.jsx';
import { Button, Card, Badge, EmptyState } from '../components/ui.jsx';
import { IconChevronRight, IconX } from '../components/icons.jsx';

export default function MyBids() {
  usePageTitle('My bids');
  const { user } = useAuth();
  const [bids, setBids] = useState([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.listJobs({}).then((d) => {
      const allBids = [];
      d.jobs.forEach((j) => {
        api.getMessages(j.id).catch(() => {});
      });
      setBids(allBids);
    }).catch(() => setBids([]));
  }, []);

  return (
    <div className="container-page py-10">
      <h1 className="font-display text-2xl font-semibold text-ink">My bids</h1>
      <p className="mt-1 text-sm text-ink-muted">Your competitive quotes on open loads.</p>

      <Card>
        <Card.Content className="p-0">
          {bids.length === 0 ? (
            <EmptyState icon={<IconPackage size={28} />} title="No bids yet" description="Browse open loads and place your first bid." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-ink-muted" style={{ borderColor: 'var(--border-default)' }}>
                    <th className="px-5 py-3 font-medium">Requirement</th>
                    <th className="px-5 py-3 font-medium">Price</th>
                    <th className="px-5 py-3 font-medium">ETA</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bids.map((b) => (
                    <tr key={b.id} className="border-b last:border-0 hover:bg-raised" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="px-5 py-3">
                        <p className="font-mono text-xs text-ink-muted">{b.job_code}</p>
                        <p className="font-medium text-ink">{b.carrier_name || user.profile?.company_name}</p>
                      </td>
                      <td className="tabular px-5 py-3 text-ink-secondary">{formatAED(b.amount_aed)}</td>
                      <td className="px-5 py-3 text-ink-secondary">{b.eta_minutes} min</td>
                      <td className="px-5 py-3">
                        <Badge color={b.status === 'won' ? 'success' : b.status === 'lost' ? 'danger' : 'neutral'}>
                          {b.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {b.status === 'submitted' && (
                          <Button variant="ghost" size="sm" className="text-xs text-status-warning">
                            Withdraw
                          </Button>
                        )}
                        {b.status === 'won' && (
                          <Button variant="link" size="sm" className="text-sm text-brand-primary">
                            Track shipment
                          </Button>
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
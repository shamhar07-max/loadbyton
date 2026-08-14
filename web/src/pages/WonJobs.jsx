import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { usePageTitle } from '../lib/seo.jsx';
import { Card, EmptyState, StatusBadge } from '../components/ui.jsx';
import { IconChevronRight, IconPackage } from '../components/icons.jsx';
import { formatLabel, CONTAINER_EQUIPMENT, STATUS_FLOW, equipmentLabel } from '../lib/constants.js';

const ACTIVE_STATUSES = ['AWARDED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'];

export default function WonJobs() {
  usePageTitle('Won jobs');
  const { user } = useAuth();
  const [jobs, setJobs] = useState(null);

  useEffect(() => {
    // F19, fixed independently on both branches — kept main's server-side
    // mine=1 scope (this carrier's own jobs only, any status) over this
    // branch's client-side limit:200 bump, since it doesn't depend on the
    // carrier's job count staying under a fixed page size at all.
    api.listJobs({ mine: 1, limit: 200 }).then((d) => {
      const won = d.jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
      setJobs(won);
    }).catch(() => setJobs([]));
  }, [user.id]);

  return (
    <div className="container-page py-10" dir="ltr">
      <h1 className="font-display text-2xl font-semibold text-ink">Won jobs</h1>
      <p className="mt-1 text-sm text-ink-muted">Your active shipments — from award through delivery. Open a job to advance its status, upload POD, or chat with the shipper.</p>

      <Card className="mt-6">
        <Card.Content className="p-0">
          {jobs === null ? (
            <p className="p-5 text-sm text-ink-muted">Loading…</p>
          ) : jobs.length === 0 ? (
            <EmptyState icon={<IconPackage size={28} />} title="No won jobs yet" description="Place bids, get awarded, and start earning." />
          ) : (
            <div className="overflow-x-auto scroll-fade-x">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-ink-muted" style={{ borderColor: 'var(--border-default)' }}>
                    <th className="px-5 py-3 font-medium">Job</th>
                    <th className="px-5 py-3 font-medium">Lane</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Progress</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-b last:border-0 hover:bg-raised" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="px-5 py-3">
                        <p className="font-mono text-xs text-ink-muted">{j.job_code}</p>
                        <p className="font-medium text-ink">
                          {CONTAINER_EQUIPMENT.includes(j.equipment_type) ? `${j.container_size} ${formatLabel(j.container_type)}` : equipmentLabel(j.equipment_type)}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-ink-secondary">
                        {formatLabel(j.pickup_terminal)} → {formatLabel(j.delivery_area)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={j.status} />
                      </td>
                      <td className="px-5 py-3">
                        <StatusStepperCompact status={j.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link to={`/jobs/${j.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-secondary hover:underline">
                          Open <IconChevronRight size={14} />
                        </Link>
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

function StatusStepperCompact({ status }) {
  const idx = STATUS_FLOW.indexOf(status);
  return (
    <div className="flex items-center gap-1">
      {STATUS_FLOW.slice(1).map((s, i) => {
        const stepIdx = STATUS_FLOW.indexOf(s);
        const done = stepIdx <= idx;
        return (
          <span
            key={s}
            title={formatLabel(s)}
            className="h-1.5 w-5 rounded-full"
            style={{ background: done ? 'var(--brand-accent)' : 'var(--border-default)' }}
          />
        );
      })}
    </div>
  );
}

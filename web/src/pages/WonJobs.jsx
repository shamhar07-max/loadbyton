import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { usePageTitle } from '../lib/seo.jsx';
import { Button, Card, Badge, EmptyState, StatusBadge } from '../components/ui.jsx';
import { IconMapPin, IconClock, IconChevronRight, IconPackage } from '../components/icons.jsx';
import { formatAED, formatDate, formatLabel, CONTAINER_EQUIPMENT, equipmentLabel } from '../lib/constants.js';

const STATUS_FLOW = ['DRAFT', 'OPEN', 'AWARDED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];

export default function WonJobs() {
  usePageTitle('Won jobs');
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    api.listJobs({}).then((d) => {
      const won = d.jobs.filter((j) => j.carrier_id && j.status === 'AWARDED');
      setJobs(won);
    }).catch(() => setJobs([]));
  }, []);

  const filteredJobs = jobs.filter((j) =>
    j.status === 'AWARDED' || j.status === 'PICKED_UP' || j.status === 'IN_TRANSIT' || j.status === 'DELIVERED'
  );

  async function act(fn) {
    try {
      await fn();
    } catch (e) {
      // error handled silently
    }
  }

  return (
    <div className="container-page py-10">
      <h1 className="font-display text-2xl font-semibold text-ink">Won jobs</h1>
      <p className="mt-1 text-sm text-ink-muted">Your active shipments — from award through delivery.</p>

      <Card>
        <Card.Content className="p-0">
          {filteredJobs.length === 0 ? (
            <EmptyState icon={<IconPackage size={28} />} title="No won jobs yet" description="Place bids, get awarded, and start earning." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-ink-muted" style={{ borderColor: 'var(--border-default)' }}>
                    <th className="px-5 py-3 font-medium">Requirement</th>
                    <th className="px-5 py-3 font-medium">Lane</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Progress</th>
                    <th className="px-5 py-3 font-medium">Complete</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((j) => (
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
                        <StatusStepperCompact job={j} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        {j.status !== 'DELIVERED' && j.status !== 'COMPLETED' && j.status !== 'CANCELLED' && j.status !== 'DISPUTED' && (
                          <Button variant="accent" onClick={() => act(() => api.setStatus(j.id, 'DELIVERED'))} loading={false}>
                            Complete shipment
                          </Button>
                        )}
                        {j.status === 'DELIVERED' && (
                          <Button variant="success" onClick={() => act(() => api.setStatus(j.id, 'COMPLETED'))} loading={false}>
                            Mark completed
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

function StatusStepperCompact({ job }) {
  const idx = STATUS_FLOW.indexOf(job.status);
  return (
    <div className="flex items-center gap-1 text-xs text-ink-muted">
      {STATUS_FLOW.slice(1).map((s, i) => {
        const stepIdx = STATUS_FLOW.indexOf(s);
        const done = stepIdx <= idx;
        return (
          <React.Fragment key={s}>
            {i > 0 && <span className="h-1 w-3 shrink-0" style={{ background: done ? 'var(--brand-accent)' : 'var(--border-default)' }} />}
            <span className="flex-1">{formatLabel(s)}</span>
            <span className={done ? 'text-ink' : 'text-ink-muted'}>▸</span>
          </React.Fragment>
        );
      })}
    </div>
  );
}
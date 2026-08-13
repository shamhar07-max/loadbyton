import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { usePageTitle } from '../lib/seo.jsx';
import { formatAED, formatDate, formatLabel, CONTAINER_EQUIPMENT, equipmentLabel } from '../lib/constants.js';
import { Card, EmptyState, Badge } from '../components/ui.jsx';
import { IconAlert, IconMapPin, IconClock, IconChevronRight, IconPackage } from '../components/icons.jsx';
import { Button } from '../components/ui.jsx';

export default function OpenLoads() {
  usePageTitle('Open loads');
  const { user } = useAuth();
  const [jobs, setJobs] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.listJobs({ status: 'OPEN' }).then((d) => setJobs(d.jobs)).catch(() => setJobs([]));
  }, []);

  const filteredJobs = filter === 'all'
    ? jobs
    : jobs?.filter((j) => j.status === filter);

  return (
    <div className="container-page py-10">
      <h1 className="font-display text-2xl font-semibold text-ink">Open loads</h1>
      <p className="mt-1 text-sm text-ink-muted">Verified carriers can bid price + ETA. Competitor amounts stay hidden until award.</p>

      {!user?.is_verified && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'var(--status-warning)', background: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}>
          <IconAlert size={18} className="mt-0.5 shrink-0" />
          <p>Your account isn't verified yet — you can browse open loads, but bidding is locked until an admin approves your TRN, trade licence and insurance.</p>
        </div>
      )}

      <div className="mt-4">
        <p className="text-sm text-ink-muted">Filter: 
          <Select onChange={(e) => setFilter(e.target.value)} className="input w-24">
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="awarded">Awarded</option>
            <option value="in_transit">In Transit</option>
            <option value="delivered">Delivered</option>
          </Select>
        </p>
      </div>

      <div className="mt-8">
        {filteredJobs === null ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : filteredJobs.length === 0 ? (
          <EmptyState icon={<IconPackage size={28} />} title="No open loads right now" description="New jobs post here as soon as a shipper creates them. Check back shortly." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredJobs.map((j) => (
              <Link to={`/jobs/${j.id}`} key={j.id} className="card block p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-ink-muted">{j.job_code}</p>
                    <p className="mt-0.5 font-display text-base font-semibold text-ink">
                      {CONTAINER_EQUIPMENT.includes(j.equipment_type) ? `${j.container_size} · ${formatLabel(j.container_type)}` : equipmentLabel(j.equipment_type)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {!!(j.requires_hazmat || j.requires_reefer) && (
                      <Badge color="warning">{j.requires_hazmat ? 'Hazmat' : 'Reefer'}</Badge>
                    )}
                    {(j.container_count > 1 || j.truck_count > 1) && (
                      <Badge color="accent">{j.container_count > 1 ? `×${j.container_count} containers` : `×${j.truck_count} trucks`}</Badge>
                    )}
                  </div>
                </div>
                <div className="mt-4 space-y-1.5 text-sm text-ink-secondary">
                  <p className="flex items-center gap-1.5"><IconMapPin size={15} className="text-ink-muted" /> {formatLabel(j.pickup_terminal)} → {formatLabel(j.delivery_area)}</p>
                  <p className="flex items-center gap-1.5"><IconClock size={15} className="text-ink-muted" /> Deadline {formatDate(j.deadline)}</p>
                  {!CONTAINER_EQUIPMENT.includes(j.equipment_type) && j.notes && (
                    <p className="line-clamp-1 text-ink-muted">{j.notes}</p>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
                  <p className="tabular text-sm font-semibold text-ink">Budget up to {formatAED(j.max_budget_aed)}</p>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary">
                    {user.is_verified ? (
                      <Button
                        variant="link"
                        onClick={() => addToast({
                          type: 'bid_received',
                          title: 'Bid submission',
                          body: `Place a bid on ${j.job_code}`,
                        })}
                        >Bid <IconChevronRight size={14} />
                      </Button>
                    ) : (
                      <>Bid <IconChevronRight size={14} /></>
                    )}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
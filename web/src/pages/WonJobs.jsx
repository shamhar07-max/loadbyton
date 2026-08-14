import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { usePageTitle } from '../lib/seo.jsx';
import { Card, EmptyState, StatusBadge, RatingPill, Select, Input, Pagination } from '../components/ui.jsx';
import { IconChevronRight, IconPackage, IconSearch } from '../components/icons.jsx';
import { formatLabel, CONTAINER_EQUIPMENT, STATUS_FLOW, equipmentLabel } from '../lib/constants.js';

const ACTIVE_STATUSES = ['AWARDED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'];
const PAGE_SIZE = 20;
const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'deadline_asc', label: 'Deadline: soonest' },
];

export default function WonJobs() {
  usePageTitle('Won jobs');
  const { user } = useAuth();
  const [jobs, setJobs] = useState(null);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState('date_desc');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setOffset(0); }, [sort, debouncedSearch]);

  useEffect(() => {
    // F19, fixed independently on both branches, now with real server-side
    // pagination (the status:"a,b,c" list support this needed) instead of
    // over-fetching 200 rows and filtering client-side.
    const params = { mine: 1, status: ACTIVE_STATUSES.join(','), sort, limit: PAGE_SIZE, offset };
    if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
    api.listJobs(params).then((d) => { setJobs(d.jobs); setTotal(d.total ?? d.jobs.length); }).catch(() => { setJobs([]); setTotal(0); });
  }, [user.id, sort, debouncedSearch, offset]);

  return (
    <div className="container-page py-10" dir="ltr">
      <h1 className="font-display text-2xl font-semibold text-ink">Won jobs</h1>
      <p className="mt-1 text-sm text-ink-muted">Your active shipments — from award through delivery. Open a job to advance its status, upload POD, or chat with the shipper.</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search job code, address…" className="pl-9" />
        </div>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto">
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>

      <Card className="mt-4">
        <Card.Content className="p-0">
          {jobs === null ? (
            <p className="p-5 text-sm text-ink-muted">Loading…</p>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={<IconPackage size={28} />}
              title={debouncedSearch ? 'No won jobs match this search' : 'No won jobs yet'}
              description={debouncedSearch ? 'Try a different search term.' : 'Place bids, get awarded, and start earning.'}
            />
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
                        <RatingPill rating={j.shipper_rating} className="mt-0.5" />
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
              <div className="px-5 pb-4"><Pagination total={total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} /></div>
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

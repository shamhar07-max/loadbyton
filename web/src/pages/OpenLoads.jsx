import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { usePageTitle } from '../lib/seo.jsx';
import { formatAED, formatDate, formatLabel, CONTAINER_EQUIPMENT, EQUIPMENT_TYPES, equipmentLabel } from '../lib/constants.js';
import { EmptyState, Badge, Select, Input, RatingPill, Pagination } from '../components/ui.jsx';
import { IconAlert, IconMapPin, IconClock, IconChevronRight, IconPackage, IconSearch } from '../components/icons.jsx';

const PAGE_SIZE = 20;
const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'price_desc', label: 'Budget: high to low' },
  { value: 'price_asc', label: 'Budget: low to high' },
  { value: 'deadline_asc', label: 'Deadline: soonest' },
];

export default function OpenLoads() {
  usePageTitle('Open loads');
  const { user } = useAuth();
  const [jobs, setJobs] = useState(null);
  const [total, setTotal] = useState(0);
  const [equipmentFilter, setEquipmentFilter] = useState('all');
  const [sort, setSort] = useState('date_desc');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0);

  // Debounce the search box so every keystroke doesn't fire a request —
  // matches the standard search-as-you-type pattern without a new dependency.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setOffset(0); }, [equipmentFilter, sort, debouncedSearch]);

  useEffect(() => {
    setJobs(null);
    const params = { status: 'OPEN', sort, limit: PAGE_SIZE, offset };
    if (equipmentFilter !== 'all') params.equipmentType = equipmentFilter;
    if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
    api.listJobs(params).then((d) => { setJobs(d.jobs); setTotal(d.total ?? d.jobs.length); }).catch(() => { setJobs([]); setTotal(0); });
  }, [equipmentFilter, sort, debouncedSearch, offset]);

  return (
    <div className="container-page py-10" dir="ltr">
      <h1 className="font-display text-2xl font-semibold text-ink">Open loads</h1>
      <p className="mt-1 text-sm text-ink-muted">Verified carriers can bid price + ETA. Competitor amounts stay hidden until award.</p>

      {!user?.is_verified && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'var(--status-warning)', background: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}>
          <IconAlert size={18} className="mt-0.5 shrink-0" />
          <p>Your account isn't verified yet — you can browse open loads, but bidding is locked until an admin approves your TRN, trade licence and insurance.</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search job code, address, notes…" className="pl-9" />
        </div>
        <Select value={equipmentFilter} onChange={(e) => setEquipmentFilter(e.target.value)} className="w-auto">
          <option value="all">Equipment: All</option>
          {EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{equipmentLabel(t)}</option>)}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto">
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>

      <div className="mt-8">
        {jobs === null ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<IconPackage size={28} />}
            title={debouncedSearch || equipmentFilter !== 'all' ? 'No loads match these filters' : 'No open loads right now'}
            description={debouncedSearch || equipmentFilter !== 'all' ? 'Try a broader search or clear a filter.' : 'New jobs post here as soon as a shipper creates them. Check back shortly.'}
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {jobs.map((j) => (
                <Link to={`/jobs/${j.id}`} key={j.id} className="card block p-5 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-ink-muted">{j.job_code}</p>
                      <p className="mt-0.5 font-display text-base font-semibold text-ink">
                        {CONTAINER_EQUIPMENT.includes(j.equipment_type) ? `${j.container_size} · ${formatLabel(j.container_type)}` : equipmentLabel(j.equipment_type)}
                      </p>
                      <RatingPill rating={j.shipper_rating} className="mt-1" />
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {/* F20, fixed independently on both branches — kept
                          main's fully-split conditionals (also for
                          container/truck count, not just hazmat/reefer): a
                          job that was both hazmat and reefer, or somehow had
                          both counts set, used to render only one badge when
                          either pair shared a single ternary. */}
                      {!!j.requires_hazmat && <Badge color="warning">Hazmat</Badge>}
                      {!!j.requires_reefer && <Badge color="warning">Reefer</Badge>}
                      {j.container_count > 1 && <Badge color="accent">×{j.container_count} containers</Badge>}
                      {j.truck_count > 1 && <Badge color="accent">×{j.truck_count} trucks</Badge>}
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
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-secondary">
                      Bid <IconChevronRight size={14} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <Pagination total={total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
          </>
        )}
      </div>
    </div>
  );
}

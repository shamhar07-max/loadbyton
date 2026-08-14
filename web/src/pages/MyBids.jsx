import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { usePageTitle } from '../lib/seo.jsx';
import { formatAED, formatLabel, equipmentLabel } from '../lib/constants.js';
import { Button, Card, Badge, EmptyState, RatingPill, Select, Input, Pagination } from '../components/ui.jsx';
import { IconPackage, IconX, IconSearch } from '../components/icons.jsx';
import { useToasts } from '../components/Toast.jsx';

const STATUS_COLOR = { PENDING: 'neutral', ACCEPTED: 'success', REJECTED: 'danger', WITHDRAWN: 'neutral' };
const PAGE_SIZE = 20;
const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'price_asc', label: 'Price: low to high' },
];

export default function MyBids() {
  usePageTitle('My bids');
  const [bids, setBids] = useState(null);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [sort, setSort] = useState('date_desc');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const { addToast } = useToasts();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setOffset(0); }, [sort, debouncedSearch]);

  function load() {
    const params = { sort, limit: PAGE_SIZE, offset };
    if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
    api.myBids(params).then((d) => { setBids(d.bids); setTotal(d.total ?? d.bids.length); }).catch(() => { setBids([]); setTotal(0); });
  }
  useEffect(load, [sort, debouncedSearch, offset]);

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
          {bids.length === 0 ? (
            <EmptyState
              icon={<IconPackage size={28} />}
              title={debouncedSearch ? 'No bids match this search' : 'No bids yet'}
              description={debouncedSearch ? 'Try a different search term.' : 'Browse open loads and place your first bid.'}
            />
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
                      <td className="px-5 py-3 text-ink-secondary">
                        <div>{formatLabel(b.pickup_terminal)} → {formatLabel(b.delivery_area)}</div>
                        <RatingPill rating={b.shipper_rating} className="mt-0.5" />
                      </td>
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
              <div className="px-5 pb-4"><Pagination total={total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} /></div>
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { usePageTitle } from '../lib/seo.jsx';
import {
  CONTAINER_SIZES, CONTAINER_TYPES, TERMINALS, AREAS, EQUIPMENT_TYPES, CONTAINER_EQUIPMENT, STATUS_FLOW,
  equipmentLabel, formatAED, formatDate, formatLabel,
} from '../lib/constants.js';
import { Button, Card, Stat, Input, Label, Select, Textarea, EmptyState, StatusBadge, Badge, RatingPill, Pagination } from '../components/ui.jsx';
import { IconPlus, IconPackage, IconChevronRight, IconSearch, IconUpload, IconDownload, IconCheck, IconX } from '../components/icons.jsx';
import { useToasts } from '../components/Toast.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import { parseCsv, csvRowsToJobs, downloadJobImportTemplate } from '../lib/csv.js';

const PAGE_SIZE = 20;
const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'deadline_asc', label: 'Deadline: soonest' },
];

const emptyJob = {
  equipmentType: 'CONTAINER_CHASSIS',
  containerSize: '40HC', containerType: 'DRY', containerNumber: '', pickupTerminal: TERMINALS[0], deliveryArea: AREAS[0],
  deliveryAddress: '', readyAt: '', deadline: '', maxBudgetAed: '', requiresReefer: false, requiresHazmat: false, notes: '',
  containerCount: 1, truckCount: 1, pickupLocation: null, deliveryLocation: null,
};

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState(emptyJob);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('date_desc');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const { addToast } = useToasts();

  // Search-as-you-type without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setOffset(0); }, [filter, sort, debouncedSearch]);

  function loadStats() {
    api.analytics().then((d) => setAnalytics(d.analytics)).catch(() => {});
    api.listTemplates().then((d) => setTemplates(d.templates.slice(0, 3))).catch(() => {});
  }
  function loadJobs() {
    const params = { sort, limit: PAGE_SIZE, offset };
    if (filter !== 'all') params.status = filter;
    if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
    api.listJobs(params).then((d) => { setJobs(d.jobs); setJobsTotal(d.total ?? d.jobs.length); }).catch(() => { setJobs([]); setJobsTotal(0); });
  }
  function load() {
    loadStats();
    loadJobs();
  }
  useEffect(loadStats, []);
  useEffect(loadJobs, [filter, sort, debouncedSearch, offset]);

  async function onCreate(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      // F11, fixed independently on both branches — kept main's optional
      // chaining (form never had a job_code field; the server generates it,
      // so the toast always fell back to a placeholder before this).
      const created = await api.createJob({
        ...form,
        maxBudgetAed: form.maxBudgetAed ? Number(form.maxBudgetAed) : undefined,
        containerCount: Number(form.containerCount) || 1,
        truckCount: Number(form.truckCount) || 1,
        pickupLat: form.pickupLocation?.lat,
        pickupLng: form.pickupLocation?.lng,
        pickupAddressDetail: form.pickupLocation?.address,
        deliveryLat: form.deliveryLocation?.lat,
        deliveryLng: form.deliveryLocation?.lng,
        deliveryAddressDetail: form.deliveryLocation?.address,
      });
      setForm(emptyJob);
      setShowForm(false);
      addToast({
        type: 'status_change',
        title: 'Job posted',
        body: `${created.job?.job_code || 'New job'} posted successfully`,
      });
      load();
    } catch (err) {
      setError(err.message);
      addToast({
        type: 'system_message',
        title: 'Error',
        body: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function rerun(id) {
    await api.rerunTemplate(id);
    load();
  }

  return (
    <div className="container-page py-10" dir="ltr">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Welcome back, {user?.profile?.company_name}</h1>
          <p className="mt-1 text-sm text-ink-muted">Tier {user?.tier} · {analytics?.jobsPosted ?? 0} jobs posted all-time</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowImport((v) => !v)}>
            <IconUpload size={16} /> Import CSV
          </Button>
          <Button onClick={() => setShowForm((v) => !v)}>
            <IconPlus size={16} /> Post a job
          </Button>
        </div>
      </div>

      {showImport && <CsvImportPanel onDone={() => { setShowImport(false); load(); }} onCancel={() => setShowImport(false)} />}

      {analytics && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Active jobs" value={analytics.activeJobs} />
          <Stat label="Completed" value={analytics.jobsCompleted} />
          <Stat label="Total spent" value={formatAED(analytics.totalSpentAED)} />
          <Stat label="Savings vs. market" value={`${analytics.savingsPercent}%`} tone="accent" />
        </div>
      )}

      {showForm && (
        <Card className="mt-8">
          <Card.Header>
            <Card.Title>Post a new job</Card.Title>
          </Card.Header>
          <form onSubmit={onCreate}>
            <Card.Content className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Equipment type</Label>
                <Select value={form.equipmentType} onChange={(e) => setForm({ ...form, equipmentType: e.target.value })}>
                  {EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{equipmentLabel(t)}</option>)}
                </Select>
                <p className="mt-1 text-xs text-ink-muted">
                  {CONTAINER_EQUIPMENT.includes(form.equipmentType)
                    ? 'Container-carrying equipment — set the container size and type below.'
                    : 'General freight — describe the cargo in the notes field below instead of a container size.'}
                </p>
              </div>
              {CONTAINER_EQUIPMENT.includes(form.equipmentType) ? (
                <>
                  <div>
                    <Label>Container size</Label>
                    <Select value={form.containerSize} onChange={(e) => setForm({ ...form, containerSize: e.target.value })}>
                      {CONTAINER_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label>Container type</Label>
                    <Select value={form.containerType} onChange={(e) => setForm({ ...form, containerType: e.target.value })}>
                      {CONTAINER_TYPES.map((t) => <option key={t} value={t}>{formatLabel(t)}</option>)}
                    </Select>
                  </div>
                </>
              ) : null}
              <div>
                <Label>Pickup terminal</Label>
                <Select value={form.pickupTerminal} onChange={(e) => setForm({ ...form, pickupTerminal: e.target.value })}>
                  {TERMINALS.map((t) => <option key={t} value={t}>{formatLabel(t)}</option>)}
                </Select>
              </div>
              <div>
                <Label>Delivery area</Label>
                <Select value={form.deliveryArea} onChange={(e) => setForm({ ...form, deliveryArea: e.target.value })}>
                  {AREAS.map((a) => <option key={a} value={a}>{formatLabel(a)}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Delivery address</Label>
                <Input required value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} placeholder="Street, warehouse, city" />
              </div>
              <LocationPicker
                label="Pickup location (optional pin)"
                value={form.pickupLocation}
                onChange={(loc) => setForm({ ...form, pickupLocation: loc })}
                hint="Pins the exact pickup point on top of the terminal above — useful when it's a yard or client site, not the port gate itself."
              />
              <LocationPicker
                label="Delivery location (optional pin)"
                value={form.deliveryLocation}
                onChange={(loc) => setForm({ ...form, deliveryLocation: loc })}
                hint="Pins the exact drop-off point for the driver, on top of the delivery address above."
              />
              <div>
                <Label>Ready at</Label>
                <Input type="datetime-local" required value={form.readyAt} onChange={(e) => setForm({ ...form, readyAt: e.target.value })} />
              </div>
              <div>
                <Label>Deadline</Label>
                <Input type="datetime-local" required value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
              </div>
              <div className="sm:col-span-2 rounded-lg border p-4" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-raised)' }}>
                <p className="text-sm font-medium text-ink">Volume — how much does this job cover?</p>
                <p className="mt-0.5 text-xs text-ink-muted">Leave both at 1 for a single load. Raise either to post one inquiry a carrier fulfils as a batch.</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>No. of containers</Label>
                    <Input type="number" min="1" value={form.containerCount} onChange={(e) => setForm({ ...form, containerCount: e.target.value })} />
                  </div>
                  <div>
                    <Label>No. of trucks</Label>
                    <Input type="number" min="1" value={form.truckCount} onChange={(e) => setForm({ ...form, truckCount: e.target.value })} />
                  </div>
                </div>
              </div>
              <div>
                <Label>Max budget (AED, optional)</Label>
                <Input type="number" min="0" value={form.maxBudgetAed} onChange={(e) => setForm({ ...form, maxBudgetAed: e.target.value })} placeholder="600" />
              </div>
              <div className="flex items-end gap-4 pb-2">
                <label className="flex items-center gap-2 text-sm text-ink-secondary">
                  <input type="checkbox" checked={form.requiresReefer} onChange={(e) => setForm({ ...form, requiresReefer: e.target.checked })} /> Requires reefer
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-secondary">
                  <input type="checkbox" checked={form.requiresHazmat} onChange={(e) => setForm({ ...form, requiresHazmat: e.target.checked })} /> Hazmat
                </label>
              </div>
              <div className="sm:col-span-2">
                <Label>{CONTAINER_EQUIPMENT.includes(form.equipmentType) ? 'Notes (optional)' : 'Cargo description'}</Label>
                <Textarea
                  rows={2}
                  required={!CONTAINER_EQUIPMENT.includes(form.equipmentType)}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder={CONTAINER_EQUIPMENT.includes(form.equipmentType) ? 'Gate pass instructions, contact on site, etc.' : 'What is being moved — e.g. "40 tonnes of aggregate, site access via gate 4."'}
                />
              </div>
              {error && <p className="sm:col-span-2 rounded-md px-3 py-2 text-sm" style={{ background: 'var(--status-danger-bg)', color: 'var(--status-danger)' }}>{error}</p>}
            </Card.Content>
            <Card.Footer>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" loading={submitting}>Post job</Button>
            </Card.Footer>
          </form>
        </Card>
      )}

      {templates.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 text-sm font-medium text-ink-secondary">Re-run a saved lane</p>
          <div className="flex flex-wrap gap-3">
            {templates.map((t) => (
              <button key={t.id} onClick={() => rerun(t.id)} className="card flex items-center gap-2 px-4 py-3 text-sm hover:shadow-md">
                <IconPackage size={16} style={{ color: 'var(--brand-accent)' }} />
                <span className="font-medium text-ink">{t.name}</span>
                <span className="text-ink-muted">· re-run</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10">
        <p className="mb-3 text-sm font-medium text-ink-secondary">Your jobs</p>
        {jobs === null ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : jobs.length === 0 && filter === 'all' && !debouncedSearch ? (
          <EmptyState title="No jobs yet" description="Post your first drayage job to start getting carrier bids." action={<Button onClick={() => setShowForm(true)}>Post a job</Button>} />
        ) : (
          <div className="mt-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>Filter by status</Label>
                <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-auto">
                  <option value="all">All statuses</option>
                  {STATUS_FLOW.map((s) => <option key={s} value={s}>{formatLabel(s)}</option>)}
                  <option value="CANCELLED">Cancelled</option>
                  <option value="DISPUTED">Disputed</option>
                </Select>
              </div>
              <div>
                <Label>Sort</Label>
                <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto">
                  {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </div>
              <div className="relative flex-1 sm:max-w-xs">
                <Label>Search</Label>
                <IconSearch size={15} className="pointer-events-none absolute left-3 top-[38px] text-ink-muted" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Job code, address, notes…" className="pl-9" />
              </div>
            </div>
            {jobs.length === 0 ? (
              <EmptyState className="mt-4" title="No jobs match these filters" description="Try a broader search or clear a filter." />
            ) : (
            <div className="mt-3 overflow-hidden">
              <div className="overflow-x-auto scroll-fade-x">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-ink-muted" style={{ borderColor: 'var(--border-default)' }}>
                      <th className="px-5 py-3 font-medium">Job</th>
                      <th className="px-5 py-3 font-medium">Lane</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Price</th>
                      <th className="px-5 py-3 font-medium">Deadline</th>
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
                          {j.container_count > 1 && <Badge className="mt-1" color="accent">×{j.container_count} containers</Badge>}
                          {j.truck_count > 1 && <Badge className="mt-1" color="accent">×{j.truck_count} trucks</Badge>}
                        </td>
                        <td className="px-5 py-3 text-ink-secondary">{formatLabel(j.pickup_terminal)} → {formatLabel(j.delivery_area)}</td>
                        <td className="px-5 py-3">
                          <StatusBadge status={j.status} />
                          <RatingPill rating={j.carrier_rating} className="mt-1" />
                        </td>
                        <td className="tabular px-5 py-3 text-ink-secondary">{formatAED(j.agreed_price_aed || j.max_budget_aed)}</td>
                        <td className="px-5 py-3 text-ink-secondary">{formatDate(j.deadline)}</td>
                        <td className="px-5 py-3 text-right">
                          <Link to={`/jobs/${j.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-secondary hover:underline">
                            View <IconChevronRight size={14} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination total={jobsTotal} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// CSV job import — parses client-side (web/src/lib/csv.js), previews the
// parsed rows, then posts them as an array to POST /api/jobs/import, which
// validates/creates each row independently and reports per-row success.
function CsvImportPanel({ onDone, onCancel }) {
  const { addToast } = useToasts();
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);

  function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setParseError('');
    setResults(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = csvRowsToJobs(parseCsv(String(reader.result)));
        if (parsed.length === 0) throw new Error('No data rows found — check the file has a header row plus at least one job.');
        setRows(parsed);
      } catch (err) {
        setParseError(err.message);
        setRows(null);
      }
    };
    reader.readAsText(file);
  }

  async function submit() {
    setBusy(true);
    try {
      const d = await api.importJobs(rows);
      setResults(d.results);
      if (d.created > 0) {
        addToast({ type: 'status_change', title: 'Import complete', body: `${d.created} job(s) posted${d.failed ? `, ${d.failed} failed` : ''}.` });
      }
      if (d.failed === 0) onDone();
    } catch (err) {
      addToast({ type: 'system_message', title: 'Import failed', body: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-8">
      <Card.Header>
        <Card.Title>Import jobs from CSV</Card.Title>
        <Button variant="ghost" size="sm" onClick={downloadJobImportTemplate}><IconDownload size={14} /> Download template</Button>
      </Card.Header>
      <Card.Content className="space-y-4">
        <div>
          <Label>CSV file</Label>
          <input type="file" accept=".csv,text/csv" className="input" onChange={onFile} />
          <p className="mt-1 text-xs text-ink-muted">Header row must match the template — pickupTerminal, deliveryArea, deliveryAddress, readyAt, deadline are required per row.</p>
        </div>
        {parseError && <p className="text-sm text-status-danger">{parseError}</p>}
        {rows && !results && (
          <div>
            <p className="text-sm text-ink-secondary">{fileName} — {rows.length} row(s) parsed. Review before importing:</p>
            <div className="mt-2 max-h-56 overflow-y-auto rounded-md border text-xs" style={{ borderColor: 'var(--border-default)' }}>
              <table className="w-full text-left">
                <thead><tr className="border-b text-ink-muted" style={{ borderColor: 'var(--border-subtle)' }}><th className="px-3 py-1.5">#</th><th className="px-3 py-1.5">Lane</th><th className="px-3 py-1.5">Ready → Deadline</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b last:border-0" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="px-3 py-1.5">{i + 1}</td>
                      <td className="px-3 py-1.5">{r.pickupTerminal || '—'} → {r.deliveryArea || '—'}</td>
                      <td className="px-3 py-1.5">{r.readyAt || '—'} → {r.deadline || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {results && (
          <div>
            <p className="text-sm text-ink-secondary">{results.filter((r) => r.ok).length} of {results.length} imported.</p>
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
              {results.map((r) => (
                <li key={r.row} className="flex items-center gap-2">
                  {r.ok ? <IconCheck size={13} className="text-status-success" /> : <IconX size={13} className="text-status-danger" />}
                  <span className="text-ink-muted">Row {r.row}:</span>
                  {r.ok ? <span className="text-ink">{r.jobCode} posted</span> : <span className="text-status-danger">{r.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card.Content>
      <Card.Footer>
        <Button type="button" variant="ghost" onClick={onCancel}>Close</Button>
        {rows && !results && (
          <Button onClick={submit} loading={busy}><IconUpload size={14} /> Import {rows.length} job(s)</Button>
        )}
      </Card.Footer>
    </Card>
  );
}
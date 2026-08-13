import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { usePageTitle } from '../lib/seo.jsx';
import {
  CONTAINER_SIZES, CONTAINER_TYPES, TERMINALS, AREAS, EQUIPMENT_TYPES, CONTAINER_EQUIPMENT,
  equipmentLabel, formatAED, formatDate, formatLabel,
} from '../lib/constants.js';
import { Button, Card, Stat, Input, Label, Select, Textarea, EmptyState, StatusBadge, Badge } from '../components/ui.jsx';
import { IconPlus, IconPackage, IconChevronRight } from '../components/icons.jsx';

const emptyJob = {
  equipmentType: 'CONTAINER_CHASSIS',
  containerSize: '40HC', containerType: 'DRY', containerNumber: '', pickupTerminal: TERMINALS[0], deliveryArea: AREAS[0],
  deliveryAddress: '', readyAt: '', deadline: '', maxBudgetAed: '', requiresReefer: false, requiresHazmat: false, notes: '',
  containerCount: 1, truckCount: 1,
};

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyJob);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function load() {
    api.analytics().then((d) => setAnalytics(d.analytics)).catch(() => {});
    api.listJobs().then((d) => setJobs(d.jobs)).catch(() => {});
    api.listTemplates().then((d) => setTemplates(d.templates.slice(0, 3))).catch(() => {});
  }
  useEffect(load, []);

  async function onCreate(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.createJob({
        ...form,
        maxBudgetAed: form.maxBudgetAed ? Number(form.maxBudgetAed) : undefined,
        containerCount: Number(form.containerCount) || 1,
        truckCount: Number(form.truckCount) || 1,
      });
      setForm(emptyJob);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function rerun(id) {
    await api.rerunTemplate(id);
    load();
  }

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Welcome back, {user?.profile?.company_name}</h1>
          <p className="mt-1 text-sm text-ink-muted">Tier {user?.tier} · {analytics?.jobsPosted ?? 0} jobs posted all-time</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <IconPlus size={16} /> Post a job
        </Button>
      </div>

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
        {jobs.length === 0 ? (
          <EmptyState title="No jobs yet" description="Post your first drayage job to start getting carrier bids." action={<Button onClick={() => setShowForm(true)}>Post a job</Button>} />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
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
                        {(j.container_count > 1 || j.truck_count > 1) && (
                          <Badge className="mt-1" color="accent">
                            {j.container_count > 1 ? `×${j.container_count} containers` : `×${j.truck_count} trucks`}
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-ink-secondary">{formatLabel(j.pickup_terminal)} → {formatLabel(j.delivery_area)}</td>
                      <td className="px-5 py-3"><StatusBadge status={j.status} /></td>
                      <td className="tabular px-5 py-3 text-ink-secondary">{formatAED(j.agreed_price_aed || j.max_budget_aed)}</td>
                      <td className="px-5 py-3 text-ink-secondary">{formatDate(j.deadline)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link to={`/jobs/${j.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary hover:underline">
                          View <IconChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

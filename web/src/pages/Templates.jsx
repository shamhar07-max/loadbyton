import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { usePageTitle } from '../lib/seo.jsx';
import { CONTAINER_SIZES, CONTAINER_TYPES, TERMINALS, AREAS, formatLabel } from '../lib/constants.js';
import { Button, Card, Input, Label, Select, Textarea, EmptyState, Badge } from '../components/ui.jsx';
import { IconPlus, IconPackage } from '../components/icons.jsx';

const empty = { name: '', pickupTerminal: TERMINALS[0], deliveryArea: AREAS[0], deliveryAddress: '', containerSize: '40HC', containerType: 'DRY', cadence: 'WEEKLY', notes: '' };

export default function Templates() {
  usePageTitle('Templates');
  const [templates, setTemplates] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [rerunning, setRerunning] = useState(null);

  function load() {
    api.listTemplates().then((d) => setTemplates(d.templates)).catch(() => {});
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createTemplate(form);
      setForm(empty);
      setShowForm(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function rerun(id) {
    setRerunning(id);
    try {
      const { job } = await api.rerunTemplate(id);
      window.location.href = `/jobs/${job.id}`;
    } finally {
      setRerunning(null);
    }
  }

  return (
    <div className="container-page py-10" dir="ltr">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Templates</h1>
          <p className="mt-1 text-sm text-ink-muted">Save a repeat lane once. Re-run it into a fresh open job in one click.</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="self-start"><IconPlus size={16} /> New template</Button>
      </div>

      {showForm && (
        <Card className="mt-6">
          <form onSubmit={submit}>
            <Card.Content className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Name</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Weekly JAFZA South run" />
              </div>
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
                <Input required value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} />
              </div>
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
              <div>
                <Label>Cadence</Label>
                <Select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })}>
                  {['ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'].map((c) => <option key={c} value={c}>{formatLabel(c)}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </Card.Content>
            <Card.Footer>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" loading={busy}>Save template</Button>
            </Card.Footer>
          </form>
        </Card>
      )}

      <div className="mt-8">
        {templates.length === 0 ? (
          <EmptyState icon={<IconPackage size={28} />} title="No templates yet" description="Save your first recurring lane to skip re-entering the same job details." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id} className="p-5">
                <div className="flex items-start justify-between">
                  <p className="font-display text-base font-semibold text-ink">{t.name}</p>
                  <Badge>{formatLabel(t.cadence)}</Badge>
                </div>
                <p className="mt-2 text-sm text-ink-secondary">{formatLabel(t.pickup_terminal)} → {formatLabel(t.delivery_area)}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{t.container_size} · {formatLabel(t.container_type)}</p>
                <Button className="mt-4 w-full" variant="secondary" onClick={() => rerun(t.id)} loading={rerunning === t.id}>Re-run</Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { usePageTitle } from '../lib/seo.jsx';
import { TERMINALS, AREAS, formatAED, formatLabel } from '../lib/constants.js';
import { Button, Card, Input, Label, Select, EmptyState, Badge } from '../components/ui.jsx';
import { IconPlus, IconShield } from '../components/icons.jsx';

const empty = { pickupTerminal: TERMINALS[0], deliveryArea: AREAS[0], deliveryAddress: '', monthlyLoads: '', targetPriceAed: '' };

export default function Contracts() {
  usePageTitle('Contract lanes');
  const [contracts, setContracts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  function load() {
    api.listContracts().then((d) => setContracts(d.contracts)).catch(() => {});
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createContract({ ...form, monthlyLoads: Number(form.monthlyLoads), targetPriceAed: form.targetPriceAed ? Number(form.targetPriceAed) : undefined });
      setForm(empty);
      setShowForm(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page py-10" dir="ltr">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Contract lanes</h1>
          <p className="mt-1 text-sm text-ink-muted">Commit monthly volume on a lane for priority carrier visibility and a discounted rate.</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="self-start"><IconPlus size={16} /> New contract lane</Button>
      </div>

      {showForm && (
        <Card className="mt-6">
          <form onSubmit={submit}>
            <Card.Content className="grid gap-4 sm:grid-cols-2">
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
                <Label>Monthly loads committed</Label>
                <Input type="number" required min="1" value={form.monthlyLoads} onChange={(e) => setForm({ ...form, monthlyLoads: e.target.value })} placeholder="40" />
              </div>
              <div>
                <Label>Target price (AED, optional)</Label>
                <Input type="number" min="0" value={form.targetPriceAed} onChange={(e) => setForm({ ...form, targetPriceAed: e.target.value })} />
              </div>
            </Card.Content>
            <Card.Footer>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" loading={busy}>Save contract lane</Button>
            </Card.Footer>
          </form>
        </Card>
      )}

      <div className="mt-8">
        {contracts.length === 0 ? (
          <EmptyState icon={<IconShield size={28} />} title="No contract lanes yet" description="Commit to a monthly volume to get priority visibility from carriers and a lower take rate." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {contracts.map((c) => (
              <Card key={c.id} className="p-5">
                <div className="flex items-start justify-between">
                  <p className="font-display text-base font-semibold text-ink">{formatLabel(c.pickup_terminal)} → {formatLabel(c.delivery_area)}</p>
                  <Badge color={c.status === 'ACTIVE' ? 'success' : 'neutral'}>{c.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-ink-secondary">{c.monthly_loads} loads / month</p>
                {!!c.target_price_aed && <p className="tabular mt-0.5 text-sm text-ink-muted">Target {formatAED(c.target_price_aed)}</p>}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { usePageTitle } from '../lib/seo.jsx';
import { Button, Card, Input, Label } from '../components/ui.jsx';

export default function Profile() {
  usePageTitle('Profile & settings');
  const { user, refresh, restartWalkthrough } = useAuth();
  const [form, setForm] = useState({
    companyName: user.profile?.company_name || '',
    phone: user.profile?.phone || '',
    trnNumber: user.profile?.trn_number || '',
    tradeLicenseNumber: user.profile?.trade_license_number || '',
    coverageZones: user.profile?.coverage_zones || '',
    fleetSize: user.profile?.fleet_size ?? '',
    ownedChassis: user.profile?.owned_chassis ?? '',
  });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(null);
  const [mfaBusy, setMfaBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      await api.updateProfile(form);
      await refresh();
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  async function setupMfa() {
    setMfaBusy(true);
    try {
      const d = await api.mfaSetup();
      setMfa(d);
      await refresh();
    } finally {
      setMfaBusy(false);
    }
  }

  async function disableMfa() {
    setMfaBusy(true);
    try {
      await api.mfaDisable();
      setMfa(null);
      await refresh();
    } finally {
      setMfaBusy(false);
    }
  }

  return (
    <div className="container-page max-w-2xl py-10">
      <h1 className="font-display text-2xl font-semibold text-ink">Profile & settings</h1>
      <p className="mt-1 text-sm text-ink-muted">{user.email} · {user.role} · Tier {user.tier}</p>

      <Card className="mt-6">
        <form onSubmit={save}>
          <Card.Header><Card.Title>Company profile</Card.Title></Card.Header>
          <Card.Content className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Company name</Label>
              <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>TRN number</Label>
              <Input value={form.trnNumber} onChange={(e) => setForm({ ...form, trnNumber: e.target.value })} />
            </div>
            <div>
              <Label>Trade licence number</Label>
              <Input value={form.tradeLicenseNumber} onChange={(e) => setForm({ ...form, tradeLicenseNumber: e.target.value })} />
            </div>
            {user.role === 'CARRIER' && (
              <>
                <div>
                  <Label>Coverage zones</Label>
                  <Input value={form.coverageZones} onChange={(e) => setForm({ ...form, coverageZones: e.target.value })} placeholder="JAFZA, Al Quoz, DIP" />
                </div>
                <div>
                  <Label>Fleet size</Label>
                  <Input type="number" min="0" value={form.fleetSize} onChange={(e) => setForm({ ...form, fleetSize: e.target.value })} />
                </div>
                <div>
                  <Label>Owned chassis</Label>
                  <Input type="number" min="0" value={form.ownedChassis} onChange={(e) => setForm({ ...form, ownedChassis: e.target.value })} />
                </div>
              </>
            )}
          </Card.Content>
          <Card.Footer>
            {saved && <span className="mr-auto text-sm text-status-success">Saved.</span>}
            <Button type="submit" loading={busy}>Save changes</Button>
          </Card.Footer>
        </form>
      </Card>

      <Card className="mt-6">
        <Card.Header><Card.Title>Two-factor authentication</Card.Title></Card.Header>
        <Card.Content>
          {user.mfa_enabled ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink-secondary">MFA is enabled on your account.</p>
              <Button variant="danger" onClick={disableMfa} loading={mfaBusy}>Disable</Button>
            </div>
          ) : mfa ? (
            <div className="space-y-2 text-sm">
              <p className="text-ink-secondary">Add this secret to your authenticator app:</p>
              <p className="font-mono text-xs" style={{ background: 'var(--bg-raised)', padding: '8px 12px', borderRadius: 6 }}>{mfa.secret}</p>
              <p className="text-xs text-ink-muted break-all">{mfa.otpauthUrl}</p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink-secondary">Add an authenticator app as a second factor on login.</p>
              <Button variant="secondary" onClick={setupMfa} loading={mfaBusy}>Enable MFA</Button>
            </div>
          )}
        </Card.Content>
      </Card>

      <Card className="mt-6">
        <Card.Header><Card.Title>Walkthrough</Card.Title></Card.Header>
        <Card.Content>
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-secondary">Replay the 3-step welcome walkthrough.</p>
            <Button variant="secondary" onClick={restartWalkthrough}>Start over</Button>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}

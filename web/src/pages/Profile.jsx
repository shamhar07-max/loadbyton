import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { usePageTitle } from '../lib/seo.jsx';
import { Button, Card, Input, Label, Select, Badge, EmptyState } from '../components/ui.jsx';
import { IconUser } from '../components/icons.jsx';
import ScanWithAi from '../components/ScanWithAi.jsx';

const TRN_LICENCE_SCAN_FIELDS = [
  { key: 'trnNumber', description: 'The UAE Tax Registration Number (TRN) — a 15-digit number, sometimes labelled "TRN" or "Tax Registration Number"' },
  { key: 'tradeLicenseNumber', description: 'The trade licence / commercial licence number' },
];

const SEAT_ROLE_HELP = {
  OPS: 'Full day-to-day access — post jobs, bid, award, update status.',
  FINANCE: 'View earnings, invoices, and payouts. Cannot post, bid, or award.',
  VIEWER: 'Read-only access to everything.',
};

function TeamSection() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ email: '', password: '', seatRole: 'OPS', displayName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function load() {
    api.orgMembers().then(setData).catch(() => {});
  }
  useEffect(load, []);

  async function addSeat(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.addOrgMember(form);
      setForm({ email: '', password: '', seatRole: 'OPS', displayName: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(seat) {
    await api.updateOrgMember(seat.id, { isActive: !seat.is_active });
    load();
  }

  async function changeRole(seat, seatRole) {
    await api.updateOrgMember(seat.id, { seatRole });
    load();
  }

  if (!data) return null;

  return (
    <Card className="mt-6">
      <Card.Header><Card.Title>Team</Card.Title></Card.Header>
      <Card.Content className="space-y-4">
        <p className="text-sm text-ink-muted">
          Give employees their own login under this company account, scoped to what they need — without sharing
          your password or your bank details.
        </p>

        {data.seats.length === 0 ? (
          <EmptyState icon={<IconUser size={24} />} title="No seats yet" description="Everyone currently shares your single login." />
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {data.seats.map((seat) => (
              <div key={seat.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{seat.display_name || seat.email}</p>
                  <p className="text-xs text-ink-muted">{seat.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={seat.is_active ? 'success' : 'neutral'}>{seat.is_active ? 'Active' : 'Deactivated'}</Badge>
                  <Select value={seat.seat_role} onChange={(e) => changeRole(seat, e.target.value)} className="w-auto">
                    {Object.keys(SEAT_ROLE_HELP).map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                  <Button size="sm" variant={seat.is_active ? 'danger' : 'secondary'} onClick={() => toggleActive(seat)}>
                    {seat.is_active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addSeat} className="grid gap-3 border-t pt-4 sm:grid-cols-2" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <Label>Name</Label>
            <Input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Temporary password</Label>
            <Input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={form.seatRole} onChange={(e) => setForm({ ...form, seatRole: e.target.value })}>
              {Object.keys(SEAT_ROLE_HELP).map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          <p className="sm:col-span-2 text-xs text-ink-muted">{SEAT_ROLE_HELP[form.seatRole]}</p>
          {error && <p className="sm:col-span-2 text-sm text-status-danger">{error}</p>}
          <Button type="submit" loading={busy} className="sm:col-span-2">Add team member</Button>
        </form>
      </Card.Content>
    </Card>
  );
}

export default function Profile() {
  usePageTitle('Profile & settings');
  const { user, refresh, restartWalkthrough, isOrgRoot, actingAs } = useAuth();
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
  const [saveError, setSaveError] = useState('');
  const [mfa, setMfa] = useState(null);
  const [mfaBusy, setMfaBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setSaveError('');
    try {
      await api.updateProfile(form);
      await refresh();
      setSaved(true);
    } catch (err) {
      setSaveError(err.message);
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
    <div className="container-page max-w-2xl py-10" dir="ltr">
      <h1 className="font-display text-2xl font-semibold text-ink">Profile & settings</h1>
      <p className="mt-1 text-sm text-ink-muted">{user.email} · {user.role} · Tier {user.tier}</p>
      {actingAs && (
        <p className="mt-1 text-xs text-ink-muted">
          Logged in as {actingAs.displayName || actingAs.email} ({actingAs.seatRole}) — company details below are shared
          across the whole team; only an OPS seat or the account owner can change them.
        </p>
      )}

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
            <div className="sm:col-span-2">
              <ScanWithAi
                label="Scan TRN / trade licence photo to autofill"
                fields={TRN_LICENCE_SCAN_FIELDS}
                onExtract={(extracted) => {
                  setForm((f) => ({
                    ...f,
                    trnNumber: extracted.trnNumber || f.trnNumber,
                    tradeLicenseNumber: extracted.tradeLicenseNumber || f.tradeLicenseNumber,
                  }));
                }}
              />
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
            {saveError && <span className="mr-auto text-sm text-status-danger">{saveError}</span>}
            <Button type="submit" loading={busy}>Save changes</Button>
          </Card.Footer>
        </form>
      </Card>

      <Card className="mt-6">
        <Card.Header><Card.Title>Two-factor authentication</Card.Title></Card.Header>
        <Card.Content>
          {user.mfa_enabled ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-secondary">MFA is enabled on your account.</p>
              <Button variant="danger" onClick={disableMfa} loading={mfaBusy} className="self-start shrink-0">Disable</Button>
            </div>
          ) : mfa ? (
            <div className="space-y-2 text-sm">
              <p className="text-ink-secondary">Add this secret to your authenticator app:</p>
              <p className="font-mono text-xs" style={{ background: 'var(--bg-raised)', padding: '8px 12px', borderRadius: 6 }}>{mfa.secret}</p>
              <p className="text-xs text-ink-muted break-all">{mfa.otpauthUrl}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-secondary">Add an authenticator app as a second factor on login.</p>
              <Button variant="secondary" onClick={setupMfa} loading={mfaBusy} className="self-start shrink-0">Enable MFA</Button>
            </div>
          )}
        </Card.Content>
      </Card>

      {isOrgRoot && user.role !== 'ADMIN' && <TeamSection />}

      <Card className="mt-6">
        <Card.Header><Card.Title>Walkthrough</Card.Title></Card.Header>
        <Card.Content>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-secondary">Replay the 3-step welcome walkthrough.</p>
            <Button variant="secondary" onClick={restartWalkthrough} className="self-start shrink-0">Start over</Button>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}

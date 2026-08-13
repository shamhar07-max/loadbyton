import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { usePageTitle } from '../lib/seo.jsx';
import { formatAED, formatDate, formatDateTime, formatLabel } from '../lib/constants.js';
import { Button, Card, Stat, Input, Label, Badge, Select, Textarea, EmptyState } from '../components/ui.jsx';
import { IconShield, IconAlert, IconCheck, IconInfo, IconUser, IconMail, IconSettings } from '../components/icons.jsx';

const TABS = ['Health', 'Verification', 'Disputes', 'Audit log', 'Revenue', 'Settings', 'Members', 'Support', 'Registrations'];

export default function Admin() {
  usePageTitle('Admin console');
  const [tab, setTab] = useState('Health');

  return (
    <div className="container-page py-10">
      <h1 className="font-display text-2xl font-semibold text-ink">Admin console</h1>
      <p className="mt-1 text-sm text-ink-muted">Verification, escrow oversight, disputes, and the audit trail.</p>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--border-default)' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors"
            style={tab === t ? { borderColor: 'var(--brand-accent)', color: 'var(--text-primary)' } : { borderColor: 'transparent', color: 'var(--text-muted)' }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'Health' && <HealthTab />}
        {tab === 'Verification' && <VerificationTab />}
        {tab === 'Disputes' && <DisputesTab />}
        {tab === 'Audit log' && <AuditTab />}
        {tab === 'Revenue' && <RevenueTab />}
        {tab === 'Settings' && <SettingsTab />}
        {tab === 'Members' && <MembersTab />}
        {tab === 'Support' && <SupportTab />}
        {tab === 'Registrations' && <RegistrationsTab />}
      </div>
    </div>
  );
}

function HealthTab() {
  const [health, setHealth] = useState(null);
  useEffect(() => { api.adminHealth().then((d) => setHealth(d.health)).catch(() => {}); }, []);
  if (!health) return <p className="text-sm text-ink-muted">Loading…</p>;
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Open jobs" value={health.openJobs} />
        <Stat label="Total bids" value={health.totalBids} />
        <Stat label="Avg bids / job" value={health.avgBidsPerJob} />
        <Stat label="Completion rate" value={`${health.completionRate}%`} tone="accent" />
        <Stat label="Escrow held" value={formatAED(health.escrowHeld)} />
      </div>
      <p className="mt-6 mb-3 text-sm font-medium text-ink-secondary">Lane health</p>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-ink-muted" style={{ borderColor: 'var(--border-default)' }}>
                <th className="px-5 py-3 font-medium">Lane</th>
                <th className="px-5 py-3 font-medium">Base price</th>
                <th className="px-5 py-3 font-medium">On-time %</th>
                <th className="px-5 py-3 font-medium">Monthly loads</th>
              </tr>
            </thead>
            <tbody>
              {health.lanes.map((l) => (
                <tr key={l.laneId} className="border-b last:border-0" style={{ borderColor: 'var(--border-subtle)' }}>
                  <td className="px-5 py-3 font-medium text-ink">{formatLabel(l.terminal)} → {formatLabel(l.area)}</td>
                  <td className="tabular px-5 py-3 text-ink-secondary">{formatAED(l.basePriceAed)}</td>
                  <td className="px-5 py-3">
                    <Badge color={l.onTimePct >= 90 ? 'success' : 'warning'}>{l.onTimePct}%</Badge>
                  </td>
                  <td className="tabular px-5 py-3 text-ink-secondary">{l.monthlyLoads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function VerificationTab() {
  const [queue, setQueue] = useState(null);
  const [ibanDrafts, setIbanDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);

  function load() {
    api.adminVerificationQueue().then((d) => setQueue(d.queue)).catch(() => setQueue([]));
  }
  useEffect(load, []);

  async function act(id, action) {
    setBusyId(id);
    try {
      await api.adminVerify(id, { action, iban: ibanDrafts[id] || undefined });
      load();
    } finally {
      setBusyId(null);
    }
  }

  if (!queue) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (queue.length === 0) return <EmptyState icon={<IconShield size={26} />} title="Queue is empty" description="No carriers are waiting on verification right now." />

  return (
    <div className="space-y-4">
      {queue.map((c) => (
        <Card key={c.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-display text-base font-semibold text-ink">{c.profile.company_name}</p>
              <p className="text-sm text-ink-muted">{c.email} · applied {formatDateTime(c.created_at)}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                <div><dt className="text-ink-muted">TRN</dt><dd className="text-ink">{c.profile.trn_number || '—'}</dd></div>
                <div><dt className="text-ink-muted">Trade licence</dt><dd className="text-ink">{c.profile.trade_license_number || '—'}</dd></div>
                <div><dt className="text-ink-muted">Fleet</dt><dd className="text-ink">{c.profile.fleet_size} ({c.profile.owned_chassis} owned)</dd></div>
                <div><dt className="text-ink-muted">Insurance</dt><dd className="text-ink">{c.profile.insurance_uploaded ? 'Uploaded' : 'Missing'}</dd></div>
              </dl>
            </div>
            <div className="flex flex-col gap-2 sm:min-w-[260px]">
              <Input placeholder="IBAN (required to approve)" value={ibanDrafts[c.id] || ''} onChange={(e) => setIbanDrafts({ ...ibanDrafts, [c.id]: e.target.value })} />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => act(c.id, 'approve')} loading={busyId === c.id}>Approve</Button>
                <Button className="flex-1" variant="danger" onClick={() => act(c.id, 'reject')} loading={busyId === c.id}>Reject</Button>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function DisputesTab() {
  const [disputes, setDisputes] = useState(null);
  const [form, setForm] = useState({ jobId: '', reason: '' });
  const [resolveDrafts, setResolveDrafts] = useState({});
  const [busy, setBusy] = useState(false);

  function load() {
    api.adminDisputes().then((d) => setDisputes(d.disputes)).catch(() => setDisputes([]));
  }
  useEffect(load, []);

  async function open(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.adminOpenDispute({ jobId: Number(form.jobId), reason: form.reason });
      setForm({ jobId: '', reason: '' });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id, decision) {
    setBusy(true);
    try {
      await api.adminResolveDispute(id, { decision, determination: resolveDrafts[id] || '' });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Card className="p-5">
        <p className="font-display text-base font-semibold text-ink">Open a dispute</p>
        <form onSubmit={open} className="mt-3 flex flex-wrap gap-3">
          <Input placeholder="Job ID" value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })} className="w-32" required />
          <Input placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="flex-1 min-w-[240px]" required />
          <Button type="submit" variant="danger" loading={busy}>Open dispute</Button>
        </form>
      </Card>

      <div className="mt-6 space-y-4">
        {disputes === null ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : disputes.length === 0 ? (
          <EmptyState icon={<IconAlert size={26} />} title="No disputes" description="Escrow disputes will show up here for review." />
        ) : (
          disputes.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-ink-muted">{d.job_code}</p>
                  <p className="mt-0.5 font-medium text-ink">{d.reason}</p>
                  {d.determination && <p className="mt-1 text-sm text-ink-muted">Determination: {d.determination}</p>}
                </div>
                <Badge color={d.status === 'RESOLVED' ? 'success' : 'warning'}>{d.status}</Badge>
              </div>
              {d.status === 'OPEN' && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
                  <Input placeholder="Determination note" value={resolveDrafts[d.id] || ''} onChange={(e) => setResolveDrafts({ ...resolveDrafts, [d.id]: e.target.value })} className="flex-1 min-w-[220px]" />
                  <Button variant="accent" onClick={() => resolve(d.id, 'RELEASE_TO_CARRIER')} loading={busy}>Release to carrier</Button>
                  <Button variant="secondary" onClick={() => resolve(d.id, 'REFUND_SHIPPER')} loading={busy}>Refund shipper</Button>
                  <Button variant="ghost" onClick={() => resolve(d.id, 'SPLIT')} loading={busy}>Split</Button>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState(null);
  useEffect(() => { api.adminAudit().then((d) => setEntries(d.entries)).catch(() => setEntries([])); }, []);
  if (!entries) return <p className="text-sm text-ink-muted">Loading…</p>;
  return (
    <Card className="overflow-hidden">
      <div className="max-h-[600px] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b text-xs uppercase tracking-wide text-ink-muted" style={{ borderColor: 'var(--border-default)' }}>
              <th className="px-5 py-3 font-medium">Action</th>
              <th className="px-5 py-3 font-medium">Details</th>
              <th className="px-5 py-3 font-medium">Transition</th>
              <th className="px-5 py-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-subtle)' }}>
                <td className="px-5 py-3"><Badge>{e.action}</Badge></td>
                <td className="px-5 py-3 text-ink-secondary">{e.details}</td>
                <td className="px-5 py-3 font-mono text-xs text-ink-muted">{e.before_state && e.after_state ? `${e.before_state} → ${e.after_state}` : '—'}</td>
                <td className="px-5 py-3 text-ink-muted">{formatDateTime(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t px-5 py-3 text-xs text-ink-muted" style={{ borderColor: 'var(--border-default)' }}>
        <IconCheck size={12} className="mr-1 inline" /> Append-only — the database rejects any UPDATE or DELETE on this table.
      </p>
    </Card>
  );
}

function RevenueTab() {
  const [revenue, setRevenue] = useState(null);
  useEffect(() => { api.adminRevenue().then((d) => setRevenue(d.revenue)).catch(() => {}); }, []);
  if (!revenue) return <p className="text-sm text-ink-muted">Loading…</p>;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Stat label="GMV" value={formatAED(revenue.gmvAED)} />
      <Stat label="Platform fees" value={formatAED(revenue.platformFeesAED)} tone="accent" />
      <Stat label="Escrow held" value={formatAED(revenue.escrowHeldAED)} />
      <Stat label="Avg take rate" value={revenue.avgTakeRate} />
    </div>
  );
}

function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState(null);

  function load() {
    api.adminGetSettings().then((d) => setSettings(d.settings)).catch(() => {});
  }
  useEffect(load, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      const d = await api.adminUpdateSettings(settings);
      setSettings(d.settings);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  async function forceSweep() {
    setSweeping(true);
    try {
      const d = await api.runAutoRelease();
      setSweepResult(d.message);
    } finally {
      setSweeping(false);
    }
  }

  if (!settings) return <p className="text-sm text-ink-muted">Loading…</p>;
  return (
    <div className="max-w-lg space-y-6">
      <Card>
        <form onSubmit={save}>
          <Card.Header><Card.Title>Platform settings</Card.Title></Card.Header>
          <Card.Content className="space-y-4">
            <div>
              <Label>Commission rate (basis points, 6% = 600)</Label>
              <Input type="number" min="0" max="10000" value={settings.commission_rate_bps} onChange={(e) => setSettings({ ...settings, commission_rate_bps: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Auto-release window (hours)</Label>
              <Input type="number" min="1" max="168" value={settings.auto_release_hours} onChange={(e) => setSettings({ ...settings, auto_release_hours: Number(e.target.value) })} />
            </div>
          </Card.Content>
          <Card.Footer>
            {saved && <span className="mr-auto text-sm text-status-success">Saved — takes effect on the next award.</span>}
            <Button type="submit" loading={busy}>Save settings</Button>
          </Card.Footer>
        </form>
      </Card>

      <Card className="p-5">
        <p className="font-display text-base font-semibold text-ink">Force auto-release sweep</p>
        <p className="mt-1 text-sm text-ink-muted">Runs immediately instead of waiting for the 10-minute in-process interval.</p>
        <Button className="mt-3" variant="secondary" onClick={forceSweep} loading={sweeping}>Run sweep now</Button>
        {sweepResult && <p className="mt-2 text-sm text-ink-secondary">{sweepResult}</p>}
      </Card>
    </div>
  );
}

function MembersTab() {
  const [users, setUsers] = useState(null);
  const [filters, setFilters] = useState({ role: 'all', verified: 'all', search: '' });
  function load() {
    api.adminVerificationQueue().then((d) => {
      // Transform: this gets all users, filter by role/verified
      setUsers(d.queue);
    }).catch(() => setUsers([]));
  }
  useEffect(load, []);

  const filteredUsers = users?.filter((u) => {
    const roleMatch = filters.role === 'all' || u.role === filters.role;
    const verifiedMatch = filters.verified === 'all' || u.is_verified === (filters.verified === 'verified');
    const searchMatch = !filters.search || (u.email && u.email.toLowerCase().includes(filters.search.toLowerCase()));
    return roleMatch && verifiedMatch && searchMatch;
  });

  const roleOptions = ['all', 'SHIPPER', 'CARRIER', 'ADMIN'];
  const verifiedOptions = ['all', 'yes', 'no'];

  return (
    <div>
      <Card className="p-5">
        <p className="font-display text-base font-semibold text-ink">Members</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Select onChange={(e) => setFilters({ ...filters, role: e.target.value })} className="input">
            <option key="all" value="all">Role: All</option>
            {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
          <Select onChange={(e) => setFilters({ ...filters, verified: e.target.value })} className="input">
            <option key="all" value="all">Verified: All</option>
            {verifiedOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Input placeholder="Search by name or email" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className="input" />
        </div>
      </Card>

      {filteredUsers ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-ink-muted" style={{ borderColor: 'var(--border-default)' }}>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Verified</th>
                <th className="px-5 py-3 font-medium">Tier</th>
                <th className="px-5 py-3 font-medium">Completed jobs</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-raised" style={{ borderColor: 'var(--border-subtle)' }}>
                  <td className="px-5 py-3">{u.profile?.company_name || u.email}</td>
                  <td className="px-5 py-3 text-ink-secondary">{u.email}</td>
                  <td className="px-5 py-3">
                    <Badge color={u.role === 'CARRIER' ? 'accent' : u.role === 'SHIPPER' ? 'neutral' : 'danger'}>{u.role}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge color={u.is_verified ? 'success' : 'danger'}>{u.is_verified ? 'Yes' : 'No'}</Badge>
                  </td>
                  <td className="px-5 py-3 text-ink-secondary">{u.tier || '—'}</td>
                  <td className="px-5 py-3 text-ink-secondary">{u.profile?.completed_jobs || 0}</td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="ghost" size="sm">Impersonate</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<IconUser size={26} />} title="No members found" description "Try adjusting the filters above." />
      )}
    </div>
  );
}

function SupportTab() {
  const [tickets, setTickets] = useState(null);
  const [form, setForm] = useState({ role: 'carrier', subject: '', message: '' });

  function load() {
    api.adminDisputes().then((d) => setTickets(d.disputes)).catch(() => setTickets([]));
    // Note: in a full impl, there'd be a /api/admin/tickets endpoint
  }
  useEffect(load, []);

  const statusOptions = ['Open', 'In progress', 'Resolved'];

  return (
    <div>
      <Card className="p-5">
        <p className="font-display text-base font-semibold text-ink">Support tickets</p>
        <div className="mt-4">
          <Select className="input">
            <option value="all">All</option>
            {statusOptions.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </div>
      </Card>

      {tickets ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-ink-muted" style={{ borderColor: 'var(--border-default)' }}>
                <th className="px-5 py-3 font-medium">From</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Subject</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Age</th>
                <th className="px-5 py-3 font-medium">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-raised" style={{ borderColor: 'var(--border-subtle)' }}>
                  <td className="px-5 py-3">{t.from || '—'}</td>
                  <td className="px-5 py-3">
                    <Badge color={t.role === 'carrier' ? 'accent' : t.role === 'shipper' ? 'neutral' : 'danger'}>{t.role}</Badge>
                  </td>
                  <td className="px-5 py-3">{t.subject || '—'}</td>
                  <td className="px-5 py-3"><Badge color="warning">Open</Badge></td>
                  <td className="px-5 py-3 text-ink-muted">2h ago</td>
                  <td className="px-5 py-3 text-ink-muted">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<IconAlert size={26} />} title="No tickets" description="Support tickets will show up here for review." />
      )}

      <Card className="p-5 mt-6">
        <p className="font-display text-base font-semibold text-ink">Create ticket</p>
        <form className="mt-3 grid grid-cols-[1fr,auto] gap-3">
          <Select className="input" onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="shipper">Shipper</option>
            <option value="carrier">Carrier</option>
            <option value="admin">Admin</option>
          </Select>
          <Input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <Textarea rows={2} placeholder="Message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <Button type="submit" variant="primary" className="mt-0">Send</Button>
        </form>
      </Card>
    </div>
  );
}

function RegistrationsTab() {
  const [referrals, setReferrals] = useState(null);

  function load() {
    // In full impl, would fetch from /api/admin/referrals
    setReferrals([]);
  }
  useEffect(load, []);

  return (
    <div>
      <Card className="p-5">
        <p className="font-display text-base font-semibold text-ink">Referrals</p>
        <p className="mt-2 text-sm text-ink-muted">New sign-ups via referral code</p>
      </Card>

      {referrals ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-ink-muted" style={{ borderColor: 'var(--border-default)' }}>
                <th className="px-5 py-3 font-medium">Referral Code</th>
                <th className="px-5 py-3 font-medium">Referrer</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Fleet</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-raised" style={{ borderColor: 'var(--border-subtle)' }}>
                  <td className="px-5 py-3">{r.referral_code}</td>
                  <td className="px-5 py-3">{r.referrer_name}</td>
                  <td className="px-5 py-3">{r.contact || '—'}</td>
                  <td className="px-5 py-3">{r.fleet_size || '—'}</td>
                  <td className="px-5 py-3">
                    <Badge color="success">Active</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Button variant="ghost" size="sm">Activate</Button>
                    <Button variant="ghost" size="sm" variant="danger">Deactivate</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<IconInfo size={26} />} title="No referrals" description="Referrals will show up here for review." />
      )}
    </div>
  );
}
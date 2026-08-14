import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { usePageTitle } from '../lib/seo.jsx';
import { STATUS_FLOW, formatAED, formatDate, formatDateTime, formatLabel, EQUIPMENT_TYPES, CONTAINER_EQUIPMENT, equipmentLabel, TERMINALS, AREAS } from '../lib/constants.js';
import { Button, Card, Input, Label, Select, Textarea, Badge, StatusBadge, EscrowBadge, Spinner, RatingPill } from '../components/ui.jsx';
import { IconCheck, IconClock, IconMapPin, IconFile, IconMessage, IconStar, IconAlert, IconArrowLeft } from '../components/icons.jsx';
import { useToasts } from '../components/Toast.jsx';
import { fileToBase64, UPLOAD_ACCEPT, documentFileUrl } from '../lib/upload.js';
import LocationPicker from '../components/LocationPicker.jsx';
import ScanWithAi from '../components/ScanWithAi.jsx';

const DOC_TYPES = ['CUSTOMS', 'RECEIPT', 'POD', 'LICENCE', 'INSURANCE', 'OTHER'];
const DOC_SCAN_FIELDS = [
  { key: 'title', description: 'A short descriptive title for this document, e.g. "Customs release form" or "Insurance certificate — Al Falah Insurance"' },
  { key: 'docType', description: `Best guess at exactly one of: ${DOC_TYPES.join(', ')}` },
];

// Must match server/index.js's DISPUTABLE_STATUSES exactly — the server is
// the authority (this is only so the button doesn't appear when the server
// would reject it anyway).
const DISPUTABLE_STATUSES = ['AWARDED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
// Must match server/index.js's BACKLOAD_ELIGIBLE_STATUSES exactly.
const BACKLOAD_ELIGIBLE_STATUSES = ['AWARDED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];

function Section({ title, children, action }) {
  return (
    <Card className="mb-6">
      <Card.Header>
        <Card.Title>{title}</Card.Title>
        {action}
      </Card.Header>
      <Card.Content>{children}</Card.Content>
    </Card>
  );
}

function StatusStepper({ job }) {
  const idx = STATUS_FLOW.indexOf(job.status);
  const terminal = job.status === 'CANCELLED' || job.status === 'DISPUTED';
  return (
    <div className="flex items-center gap-1 overflow-x-auto scroll-fade-x pb-1">
      {STATUS_FLOW.slice(1).map((s, i) => {
        const stepIdx = STATUS_FLOW.indexOf(s);
        const done = !terminal && stepIdx <= idx;
        return (
          <React.Fragment key={s}>
            {i > 0 && <div className="h-px w-6 shrink-0" style={{ background: done ? 'var(--brand-accent)' : 'var(--border-default)' }} />}
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                style={done ? { background: 'var(--brand-accent)', color: 'var(--text-on-accent)' } : { background: 'var(--bg-raised)', color: 'var(--text-muted)' }}
              >
                {done ? <IconCheck size={13} /> : stepIdx}
              </div>
              <span className="whitespace-nowrap text-[11px] text-ink-muted">{formatLabel(s)}</span>
            </div>
          </React.Fragment>
        );
      })}
      {terminal && <Badge color="danger" className="ml-3">{job.status}</Badge>}
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [track, setTrack] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingJob, setEditingJob] = useState(false);

  const load = useCallback(async () => {
    try {
      const [jobData, trackData, msgs] = await Promise.all([
        api.getJob(id),
        api.track(id).catch(() => null),
        api.getMessages(id).catch(() => ({ messages: [] })),
      ]);
      setData(jobData);
      setTrack(trackData);
      setMessages(msgs.messages);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  usePageTitle(data?.job ? data.job.job_code : 'Job');

  if (error) return <div className="container-page py-10"><p className="text-status-danger">{error}</p></div>;
  if (!data) return <div className="container-page flex justify-center py-24"><Spinner size={28} /></div>;

  const { job, bids, documents, payout } = data;
  const isShipper = user.id === job.shipper_id;
  const isCarrier = user.role === 'CARRIER';
  const isAwardedCarrier = user.id === job.carrier_id;
  const myBid = bids.find((b) => b.carrier_id === user.id);
  // Job editing: only while OPEN and before any carrier has a live bid
  // against this exact spec — matches the server's own guard in
  // PATCH /api/jobs/:id, which is the actual enforcement.
  const canEditJob = isShipper && job.status === 'OPEN' && !bids.some((b) => b.status === 'PENDING');

  // Prefer real browser history (works correctly whether this job was
  // reached from Dashboard, Open Loads, Won Jobs, My Bids, or Admin) — the
  // idx check is how react-router's history state tells a fresh page load
  // (arrived via a direct URL/refresh, no in-app history to go back to)
  // apart from actual in-app navigation, so a direct link never "back"s
  // the user out of the app entirely.
  function goBack() {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(user.role === 'CARRIER' ? '/open-loads' : '/dashboard');
  }

  async function act(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page py-10" dir="ltr">
      <button
        type="button"
        onClick={goBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-secondary hover:text-ink"
      >
        <IconArrowLeft size={16} /> Back
      </button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-ink-muted">{job.job_code}</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
            {CONTAINER_EQUIPMENT.includes(job.equipment_type) ? `${job.container_size} ${formatLabel(job.container_type)}` : equipmentLabel(job.equipment_type)} · {formatLabel(job.pickup_terminal)} → {formatLabel(job.delivery_area)}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} />
            <EscrowBadge status={job.escrow_status} />
            <Badge color="neutral">{equipmentLabel(job.equipment_type)}</Badge>
            {!!job.requires_hazmat && <Badge color="warning">Hazmat</Badge>}
            {!!job.requires_reefer && <Badge color="info">Reefer</Badge>}
            {job.container_count > 1 && <Badge color="accent">×{job.container_count} containers</Badge>}
            {job.truck_count > 1 && <Badge color="accent">×{job.truck_count} trucks</Badge>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-muted">Agreed price</p>
          <p className="tabular font-display text-2xl font-semibold text-ink">{formatAED(job.agreed_price_aed || job.max_budget_aed)}</p>
        </div>
      </div>

      {error && <p className="mb-6 rounded-md px-3 py-2 text-sm" style={{ background: 'var(--status-danger-bg)', color: 'var(--status-danger)' }}>{error}</p>}

      <Card className="mb-6">
        <Card.Content>
          <StatusStepper job={job} />
        </Card.Content>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr,340px]">
        <div>
          <Section
            title="Shipment details"
            action={canEditJob && !editingJob && <Button variant="ghost" size="sm" onClick={() => setEditingJob(true)}>Edit</Button>}
          >
            {editingJob ? (
              <JobEditForm job={job} onDone={() => { setEditingJob(false); load(); }} onCancel={() => setEditingJob(false)} />
            ) : (
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div><dt className="text-ink-muted">Equipment</dt><dd className="mt-0.5 font-medium text-ink">{equipmentLabel(job.equipment_type)}</dd></div>
                {CONTAINER_EQUIPMENT.includes(job.equipment_type) && (
                  <div><dt className="text-ink-muted">Container #</dt><dd className="mt-0.5 font-medium text-ink">{job.container_number || '—'}</dd></div>
                )}
                {(job.container_count > 1 || job.truck_count > 1) && (
                  <div><dt className="text-ink-muted">Volume</dt><dd className="mt-0.5 font-medium text-ink">{job.container_count > 1 ? `${job.container_count} containers` : `${job.truck_count} trucks`}</dd></div>
                )}
                <div><dt className="text-ink-muted">Ready at</dt><dd className="mt-0.5 font-medium text-ink">{formatDateTime(job.ready_at)}</dd></div>
                <div><dt className="text-ink-muted">Deadline</dt><dd className="mt-0.5 font-medium text-ink">{formatDateTime(job.deadline)}</dd></div>
                <div><dt className="text-ink-muted">Free time</dt><dd className="mt-0.5 font-medium text-ink">{job.free_time_days} days</dd></div>
                <div><dt className="text-ink-muted">Demurrage rate</dt><dd className="mt-0.5 font-medium text-ink">{formatAED(job.demurrage_rate_aed)}/day</dd></div>
                <div className="col-span-2 sm:col-span-3"><dt className="text-ink-muted">Delivery address</dt><dd className="mt-0.5 font-medium text-ink">{job.delivery_address}</dd></div>
                {(job.pickup_lat != null || job.delivery_lat != null) && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-ink-muted">Map pins</dt>
                    <dd className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 font-medium text-brand-secondary">
                      {job.pickup_lat != null && (
                        <a href={`https://www.openstreetmap.org/?mlat=${job.pickup_lat}&mlon=${job.pickup_lng}#map=15/${job.pickup_lat}/${job.pickup_lng}`} target="_blank" rel="noreferrer" className="hover:underline">
                          View pickup on map
                        </a>
                      )}
                      {job.delivery_lat != null && (
                        <a href={`https://www.openstreetmap.org/?mlat=${job.delivery_lat}&mlon=${job.delivery_lng}#map=15/${job.delivery_lat}/${job.delivery_lng}`} target="_blank" rel="noreferrer" className="hover:underline">
                          View delivery on map
                        </a>
                      )}
                    </dd>
                  </div>
                )}
                {job.notes && <div className="col-span-2 sm:col-span-3"><dt className="text-ink-muted">Notes</dt><dd className="mt-0.5 text-ink-secondary">{job.notes}</dd></div>}
              </dl>
            )}
          </Section>

          <Section title={`Bids (${bids.length})`}>
            {bids.length === 0 ? (
              <p className="text-sm text-ink-muted">No bids yet.</p>
            ) : (
              <div className="space-y-3">
                {bids.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-md border px-4 py-3" style={{ borderColor: b.status === 'ACCEPTED' ? 'var(--status-success)' : 'var(--border-default)' }}>
                    <div>
                      <p className="tabular font-display text-base font-semibold text-ink">{b.masked ? 'Hidden until award' : formatAED(b.amount_aed)}</p>
                      <p className="text-xs text-ink-muted">{b.masked ? 'Competing bid' : `${b.eta_minutes} min ETA · ${b.truck_type ? equipmentLabel(b.truck_type) : 'equipment n/a'}`}</p>
                      {!b.masked && b.carrier_company && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-secondary">
                          {b.carrier_company} <RatingPill rating={b.carrier_rating} />
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge color={b.status === 'ACCEPTED' ? 'success' : b.status === 'REJECTED' ? 'danger' : 'neutral'}>{b.status}</Badge>
                      {isShipper && job.status === 'OPEN' && b.status === 'PENDING' && (
                        <Button variant="accent" onClick={() => act(() => api.awardJob(job.id, b.id))} loading={busy}>Award</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isCarrier && job.status === 'OPEN' && !myBid && (
              <BidForm jobId={job.id} verified={user.is_verified} defaultEquipment={job.equipment_type} onDone={load} />
            )}
          </Section>

          <Section title="Documents">
            <DocumentList documents={documents} jobId={job.id} onAdd={load} />
          </Section>

          <Section title="Messages">
            <MessageThread messages={messages} jobId={job.id} onSent={load} />
          </Section>

          {job.status === 'COMPLETED' && (isShipper || isAwardedCarrier) && (
            <Section title="Rate your counterparty"><RatingForm jobId={job.id} onDone={load} /></Section>
          )}
        </div>

        <div>
          {track && (
            <Card className="mb-6">
              <Card.Header><Card.Title>Track & escrow</Card.Title></Card.Header>
              <Card.Content className="space-y-4 text-sm">
                <div className="flex items-center gap-2 text-ink-secondary">
                  <IconMapPin size={15} className="text-ink-muted" />
                  <span>{track.geofence.atPickup ? 'At/past pickup' : 'Awaiting pickup'} · {track.geofence.atDelivery ? 'At delivery' : 'En route'}</span>
                </div>
                {track.autoReleaseAt && (
                  <div className="flex items-center gap-2 text-ink-secondary">
                    <IconClock size={15} className="text-ink-muted" />
                    <span>Auto-releases {formatDateTime(track.autoReleaseAt)}</span>
                  </div>
                )}
                {track.demurrageExposure > 0 && (
                  <div className="flex items-center gap-2 rounded-md px-3 py-2" style={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}>
                    <IconAlert size={15} />
                    <span>Demurrage exposure: {formatAED(track.demurrageExposure)}</span>
                  </div>
                )}
                {payout && (
                  <div className="border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
                    <p className="text-ink-muted">Payout</p>
                    <p className="tabular font-display text-lg font-semibold text-ink">{formatAED(payout.net_aed)} net</p>
                    <p className="text-xs text-ink-muted">Gross {formatAED(payout.gross_aed)} − fee {formatAED(payout.platform_fee_aed)} · {payout.status}</p>
                  </div>
                )}
              </Card.Content>
            </Card>
          )}

          {isAwardedCarrier && BACKLOAD_ELIGIBLE_STATUSES.includes(job.status) && <BackloadMatches jobId={job.id} />}

          <Card className="mb-6">
            <Card.Header><Card.Title>Actions</Card.Title></Card.Header>
            <Card.Content className="space-y-2">
              {isAwardedCarrier && job.status === 'AWARDED' && (
                <Button className="w-full" onClick={() => act(() => api.setStatus(job.id, 'PICKED_UP'))} loading={busy}>Mark picked up</Button>
              )}
              {isAwardedCarrier && job.status === 'PICKED_UP' && (
                <Button className="w-full" onClick={() => act(() => api.setStatus(job.id, 'IN_TRANSIT'))} loading={busy}>Mark in transit</Button>
              )}
              {isAwardedCarrier && job.status === 'IN_TRANSIT' && (
                <PodForm jobId={job.id} onDone={load} busy={busy} setBusy={setBusy} setError={setError} />
              )}
              {isShipper && job.status === 'DELIVERED' && (
                <Button className="w-full" variant="accent" onClick={() => act(() => api.setStatus(job.id, 'COMPLETED'))} loading={busy}>Confirm delivery & release escrow</Button>
              )}
              {isShipper && ['OPEN', 'AWARDED', 'DRAFT'].includes(job.status) && (
                <Button className="w-full" variant="danger" onClick={() => act(() => api.setStatus(job.id, 'CANCELLED'))} loading={busy}>Cancel job</Button>
              )}
              {isAwardedCarrier && job.status === 'AWARDED' && (
                <Button className="w-full" variant="ghost" onClick={() => act(() => api.setStatus(job.id, 'CANCELLED'))} loading={busy}>Cancel before pickup</Button>
              )}
              {!isAwardedCarrier && !isShipper && !myBid && job.status !== 'OPEN' && (
                <p className="text-xs text-ink-muted">No actions available.</p>
              )}
              {(isShipper || isAwardedCarrier) && DISPUTABLE_STATUSES.includes(job.status) && (
                <DisputeForm jobId={job.id} onDone={load} />
              )}
            </Card.Content>
          </Card>

          <RateTool jobId={job.id} />
        </div>
      </div>
    </div>
  );
}

function BidForm({ jobId, verified, defaultEquipment, onDone }) {
  const [form, setForm] = useState({ amountAed: '', etaMinutes: '', truckType: defaultEquipment || 'CONTAINER_CHASSIS', driverName: '', driverPhone: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.placeBid(jobId, { ...form, amountAed: Number(form.amountAed), etaMinutes: Number(form.etaMinutes) });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!verified) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-md px-3 py-2.5 text-sm" style={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}>
        <IconAlert size={16} className="mt-0.5 shrink-0" /> Carrier verification required to bid. An admin needs to approve your account first.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2" style={{ borderColor: 'var(--border-subtle)' }}>
      <div>
        <Label>Your price (AED)</Label>
        <Input type="number" required min="1" value={form.amountAed} onChange={(e) => setForm({ ...form, amountAed: e.target.value })} />
      </div>
      <div>
        <Label>ETA (minutes)</Label>
        <Input type="number" required min="1" max="600" value={form.etaMinutes} onChange={(e) => setForm({ ...form, etaMinutes: e.target.value })} />
      </div>
      <div>
        <Label>Equipment you're bidding with</Label>
        <Select value={form.truckType} onChange={(e) => setForm({ ...form, truckType: e.target.value })}>
          {EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{equipmentLabel(t)}</option>)}
        </Select>
      </div>
      <div>
        <Label>Driver name</Label>
        <Input required value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} />
      </div>
      <div>
        <Label>Driver mobile (UAE)</Label>
        <Input required placeholder="05XXXXXXXX" value={form.driverPhone} onChange={(e) => setForm({ ...form, driverPhone: e.target.value })} />
        <p className="mt-1 text-xs text-ink-muted">Bound to this job on award — the shipper's pickup/delivery messages reach this number only.</p>
      </div>
      {error && <p className="sm:col-span-2 text-sm text-status-danger">{error}</p>}
      <Button type="submit" className="sm:col-span-2" loading={busy}>Place bid</Button>
    </form>
  );
}

// datetime-local inputs need "YYYY-MM-DDTHH:mm" — stored values can be
// either that exact shape (created via this same form) or SQLite's
// "YYYY-MM-DD HH:MM:SS" (seeded data), so normalize rather than assume.
function toDatetimeLocal(raw) {
  if (!raw) return '';
  return raw.replace(' ', 'T').slice(0, 16);
}

function JobEditForm({ job, onDone, onCancel }) {
  const [form, setForm] = useState({
    pickupTerminal: job.pickup_terminal,
    deliveryArea: job.delivery_area,
    deliveryAddress: job.delivery_address,
    containerNumber: job.container_number || '',
    readyAt: toDatetimeLocal(job.ready_at),
    deadline: toDatetimeLocal(job.deadline),
    maxBudgetAed: job.max_budget_aed ?? '',
    requiresReefer: !!job.requires_reefer,
    requiresHazmat: !!job.requires_hazmat,
    freeTimeDays: job.free_time_days,
    demurrageRateAed: job.demurrage_rate_aed,
    notes: job.notes || '',
    containerCount: job.container_count,
    truckCount: job.truck_count,
    pickupLocation: job.pickup_lat != null ? { lat: job.pickup_lat, lng: job.pickup_lng, address: job.pickup_address_detail } : null,
    deliveryLocation: job.delivery_lat != null ? { lat: job.delivery_lat, lng: job.delivery_lng, address: job.delivery_address_detail } : null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.editJob(job.id, {
        ...form,
        maxBudgetAed: form.maxBudgetAed === '' ? undefined : Number(form.maxBudgetAed),
        pickupLat: form.pickupLocation?.lat,
        pickupLng: form.pickupLocation?.lng,
        pickupAddressDetail: form.pickupLocation?.address,
        deliveryLat: form.deliveryLocation?.lat,
        deliveryLng: form.deliveryLocation?.lng,
        deliveryAddressDetail: form.deliveryLocation?.address,
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
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
      <LocationPicker
        label="Pickup location (optional pin)"
        value={form.pickupLocation}
        onChange={(loc) => setForm({ ...form, pickupLocation: loc })}
      />
      <LocationPicker
        label="Delivery location (optional pin)"
        value={form.deliveryLocation}
        onChange={(loc) => setForm({ ...form, deliveryLocation: loc })}
      />
      {CONTAINER_EQUIPMENT.includes(job.equipment_type) && (
        <div>
          <Label>Container #</Label>
          <Input value={form.containerNumber} onChange={(e) => setForm({ ...form, containerNumber: e.target.value })} />
        </div>
      )}
      <div>
        <Label>Ready at</Label>
        <Input type="datetime-local" required value={form.readyAt} onChange={(e) => setForm({ ...form, readyAt: e.target.value })} />
      </div>
      <div>
        <Label>Deadline</Label>
        <Input type="datetime-local" required value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
      </div>
      <div>
        <Label>Max budget (AED)</Label>
        <Input type="number" min="0" value={form.maxBudgetAed} onChange={(e) => setForm({ ...form, maxBudgetAed: e.target.value })} />
      </div>
      <div>
        <Label>Free time (days)</Label>
        <Input type="number" min="0" value={form.freeTimeDays} onChange={(e) => setForm({ ...form, freeTimeDays: e.target.value })} />
      </div>
      <div>
        <Label>Demurrage rate (AED/day)</Label>
        <Input type="number" min="0" value={form.demurrageRateAed} onChange={(e) => setForm({ ...form, demurrageRateAed: e.target.value })} />
      </div>
      {(job.container_count > 1 || job.truck_count > 1) && (
        <>
          <div>
            <Label>No. of containers</Label>
            <Input type="number" min="1" value={form.containerCount} onChange={(e) => setForm({ ...form, containerCount: e.target.value })} />
          </div>
          <div>
            <Label>No. of trucks</Label>
            <Input type="number" min="1" value={form.truckCount} onChange={(e) => setForm({ ...form, truckCount: e.target.value })} />
          </div>
        </>
      )}
      <div className="flex items-end gap-4 pb-2">
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input type="checkbox" checked={form.requiresReefer} onChange={(e) => setForm({ ...form, requiresReefer: e.target.checked })} /> Requires reefer
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input type="checkbox" checked={form.requiresHazmat} onChange={(e) => setForm({ ...form, requiresHazmat: e.target.checked })} /> Hazmat
        </label>
      </div>
      <div className="sm:col-span-2">
        <Label>Notes</Label>
        <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      {error && <p className="sm:col-span-2 text-sm text-status-danger">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={busy}>Save changes</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// "Zero deadhead miles" — while hauling this job, surface OPEN jobs that
// start roughly where it's dropping off, so the return leg isn't empty.
// Ranking (real distance vs. same-emirate fallback) is entirely server-side
// (GET /api/jobs/:id/backload-matches) — this just renders what comes back.
function BackloadMatches({ jobId }) {
  const [matches, setMatches] = useState(null);
  useEffect(() => {
    api.backloadMatches(jobId).then((d) => setMatches(d.matches)).catch(() => setMatches([]));
  }, [jobId]);

  if (matches === null) return null;

  return (
    <Card className="mb-6">
      <Card.Header><Card.Title>Backload matches</Card.Title></Card.Header>
      <Card.Content className="space-y-3 text-sm">
        {matches.length === 0 ? (
          <p className="text-ink-muted">No open loads near this delivery point right now — check back as new jobs are posted.</p>
        ) : (
          matches.map((m) => (
            <Link key={m.id} to={`/jobs/${m.id}`} className="block rounded-md border px-3 py-2.5 hover:bg-raised" style={{ borderColor: 'var(--border-default)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-ink-muted">{m.job_code}</span>
                <Badge color={m.matchType === 'coords' ? 'success' : 'neutral'}>
                  {m.matchType === 'coords' ? `${m.distanceKm} km away` : 'Same emirate'}
                </Badge>
              </div>
              <p className="mt-1 font-medium text-ink">{formatLabel(m.pickup_terminal)} → {formatLabel(m.delivery_area)}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-secondary">
                {m.shipper_company} <RatingPill rating={m.shipper_rating} /> · {formatAED(m.max_budget_aed)} budget
              </p>
            </Link>
          ))
        )}
      </Card.Content>
    </Card>
  );
}

function PodForm({ jobId, onDone, busy, setBusy, setError }) {
  const [file, setFile] = useState(null);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      let document;
      if (file) {
        const { base64, mimeType } = await fileToBase64(file);
        document = { docType: 'POD', title: file.name, fileBase64: base64, mimeType };
      }
      await api.submitPod(jobId, document ? { document } : {});
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <input type="file" accept={UPLOAD_ACCEPT} className="input" onChange={(e) => setFile(e.target.files[0] || null)} />
      <p className="text-xs text-ink-muted">Optional — a photo of the signed delivery note or POD stamp (JPEG/PNG/WEBP/PDF, up to 5MB).</p>
      <Button className="w-full" variant="accent" onClick={submit} loading={busy}>Submit proof of delivery</Button>
    </div>
  );
}

function DocumentList({ documents, jobId, onAdd }) {
  const { addToast } = useToasts();
  const [docType, setDocType] = useState('CUSTOMS');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!title || !file) return;
    setBusy(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      await api.addDocument(jobId, { docType, title, fileBase64: base64, mimeType });
      setDocType('CUSTOMS');
      setTitle('');
      setFile(null);
      onAdd();
    } catch (err) {
      // F17, fixed independently on both branches: this had no catch — a
      // failed add (e.g. a bad file) threw as an unhandled rejection and
      // the user saw nothing.
      addToast({ type: 'system_message', title: 'Could not add document', body: err.message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {documents.length === 0 ? (
        <p className="text-sm text-ink-muted">No documents yet.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-2.5 text-sm">
              <IconFile size={15} className="text-ink-muted" />
              <a href={documentFileUrl(jobId, d)} target="_blank" rel="noreferrer" className="font-medium text-brand-secondary hover:underline">{d.title}</a>
              <Badge color="neutral">{d.doc_type}</Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <details className="mb-3 text-xs text-ink-muted">
          <summary className="cursor-pointer select-none font-medium text-ink-secondary">What should I upload?</summary>
          <ul className="mt-2 space-y-1 pl-4" style={{ listStyle: 'disc' }}>
            <li><strong>CUSTOMS</strong> — customs release/clearance paperwork for the container or cargo.</li>
            <li><strong>RECEIPT</strong> — terminal handling receipt or any charge slip tied to this job.</li>
            <li><strong>POD</strong> — proof of delivery (signed delivery note, gate pass) — usually attached automatically when you submit POD in the Actions panel.</li>
            <li><strong>LICENCE</strong> — trade licence, used when a document needs to reference the carrier's registration.</li>
            <li><strong>INSURANCE</strong> — cargo or fleet insurance certificate relevant to this shipment.</li>
            <li><strong>OTHER</strong> — anything else worth keeping on the job record.</li>
          </ul>
        </details>
        <ScanWithAi
          label="Scan document to autofill title/type"
          fields={DOC_SCAN_FIELDS}
          onExtract={(extracted) => {
            if (extracted.title) setTitle(extracted.title);
            if (extracted.docType && DOC_TYPES.includes(extracted.docType.toUpperCase())) {
              setDocType(extracted.docType.toUpperCase());
            }
          }}
        />
        <form onSubmit={submit} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[110px,1fr,1fr,auto]">
          <select className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
            {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <Input placeholder="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          <input type="file" accept={UPLOAD_ACCEPT} required className="input" onChange={(e) => setFile(e.target.files[0] || null)} />
          <Button type="submit" variant="secondary" loading={busy}>Add</Button>
        </form>
      </div>
    </div>
  );
}

function MessageThread({ messages, jobId, onSent }) {
  const { user } = useAuth();
  const { addToast } = useToasts();
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try {
      await api.sendMessage(jobId, content);
      setContent('');
      onSent();
    } catch (err) {
      // F17, fixed independently on both branches: same missing catch as
      // DocumentList — a failed send silently vanished with no feedback.
      addToast({ type: 'system_message', title: 'Message not sent', body: err.message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {messages.length === 0 ? (
        <p className="text-sm text-ink-muted">No messages yet.</p>
      ) : (
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
          {messages.map((m) => (
            <div key={m.id} className={`max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm ${m.sender_id === user.id ? 'ml-auto' : ''}`} style={{ background: m.sender_id === user.id ? 'var(--brand-primary)' : 'var(--bg-raised)', color: m.sender_id === user.id ? 'var(--text-inverse)' : 'var(--text-primary)' }}>
              {m.content}
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="mt-4 flex gap-2 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <Input placeholder="Write a message…" value={content} onChange={(e) => setContent(e.target.value)} className="flex-1" />
        <Button type="submit" variant="secondary" loading={busy}><IconMessage size={16} /></Button>
      </form>
    </div>
  );
}

function RatingForm({ jobId, onDone }) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { addToast } = useToasts();
  async function submit() {
    setBusy(true);
    try {
      await api.rateJob(jobId, { score, comment });
      setDone(true);
      onDone();
    } catch (err) {
      // F14, fixed independently on both branches — kept main's toast
      // (consistent with DocumentList/MessageThread above) over this
      // branch's inline error state. This used to setDone(true) even on
      // failure, so a rejected rating (e.g. already rated) silently
      // displayed "Thanks for the rating" with no signal it didn't save.
      addToast({ type: 'system_message', title: 'Rating not saved', body: err.message });
    } finally {
      setBusy(false);
    }
  }
  if (done) return <p className="text-sm text-ink-muted">Thanks for the rating.</p>;
  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setScore(n)} aria-label={`${n} stars`}>
            <IconStar size={22} style={{ color: n <= score ? 'var(--brand-accent)' : 'var(--border-strong)' }} />
          </button>
        ))}
      </div>
      <Textarea rows={2} placeholder="Optional comment" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button onClick={submit} loading={busy}>Submit rating</Button>
    </div>
  );
}

// Self-serve dispute filing — previously the only way to flag a real
// problem on a job was to reach an admin outside the product entirely.
// Collapsed by default so it doesn't read as "something's wrong" on every
// normal job; opening it is a deliberate, named action, not a stray button.
function DisputeForm({ jobId, onDone }) {
  const { addToast } = useToasts();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await api.disputeJob(jobId, reason.trim());
      addToast({ type: 'status_change', title: 'Dispute filed', body: 'Escrow is frozen pending admin review.' });
      setOpen(false);
      setReason('');
      onDone();
    } catch (err) {
      addToast({ type: 'system_message', title: 'Could not file dispute', body: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button className="w-full" variant="ghost" onClick={() => setOpen(true)}>
        <IconAlert size={15} /> Report a problem
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border p-3" style={{ borderColor: 'var(--status-danger)' }}>
      <p className="text-xs text-ink-secondary">Opening a dispute freezes escrow and hands the job to admin review. Describe what went wrong:</p>
      <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cargo arrived damaged, driver never showed up, wrong delivery address used…" />
      <div className="flex gap-2">
        <Button className="flex-1" variant="danger" onClick={submit} loading={busy} disabled={!reason.trim()}>File dispute</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function RateTool({ jobId }) {
  const [weightTons, setWeightTons] = useState('');
  const [urgency, setUrgency] = useState('standard');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await api.rateEstimate(jobId, { weightTons: weightTons ? Number(weightTons) : undefined, urgency });
      setResult(r);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Card.Header><Card.Title>Rate estimator</Card.Title></Card.Header>
      <Card.Content className="space-y-3">
        <div>
          <Label>Weight (tons)</Label>
          <Input type="number" min="0" value={weightTons} onChange={(e) => setWeightTons(e.target.value)} placeholder="12" />
        </div>
        <div>
          <Label>Urgency</Label>
          <select className="input" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
            <option value="standard">Standard</option>
            <option value="urgent">Urgent (+15%)</option>
            <option value="express">Express (+30%)</option>
          </select>
        </div>
        <Button variant="secondary" className="w-full" onClick={run} loading={busy}>Estimate</Button>
        {result && (
          <div className="rounded-md px-3 py-2.5 text-sm" style={{ background: 'var(--bg-raised)' }}>
            <p className="tabular font-display text-lg font-semibold text-ink">{formatAED(result.estimatedAED)}</p>
            <p className="mt-1 text-xs text-ink-muted">{result.methodology}</p>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

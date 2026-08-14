import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { usePageTitle } from '../lib/seo.jsx';
import { STATUS_FLOW, formatAED, formatDate, formatDateTime, formatLabel, EQUIPMENT_TYPES, CONTAINER_EQUIPMENT, equipmentLabel } from '../lib/constants.js';
import { Button, Card, Input, Label, Select, Textarea, Badge, StatusBadge, EscrowBadge, Spinner } from '../components/ui.jsx';
import { IconCheck, IconClock, IconMapPin, IconFile, IconMessage, IconStar, IconAlert } from '../components/icons.jsx';
import { useToasts } from '../components/Toast.jsx';

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
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
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
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [track, setTrack] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
          <Section title="Shipment details">
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
              {job.notes && <div className="col-span-2 sm:col-span-3"><dt className="text-ink-muted">Notes</dt><dd className="mt-0.5 text-ink-secondary">{job.notes}</dd></div>}
            </dl>
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

function PodForm({ jobId, onDone, busy, setBusy, setError }) {
  const [fileUrl, setFileUrl] = useState('');
  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api.submitPod(jobId, fileUrl ? { document: { docType: 'POD', title: 'Proof of delivery', fileUrl } } : {});
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Input placeholder="POD document URL (optional)" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} />
      <Button className="w-full" variant="accent" onClick={submit} loading={busy}>Submit proof of delivery</Button>
    </div>
  );
}

function DocumentList({ documents, jobId, onAdd }) {
  const { addToast } = useToasts();
  const [form, setForm] = useState({ docType: 'CUSTOMS', title: '', fileUrl: '' });
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!form.title || !form.fileUrl) return;
    setBusy(true);
    try {
      await api.addDocument(jobId, form);
      setForm({ docType: 'CUSTOMS', title: '', fileUrl: '' });
      onAdd();
    } catch (err) {
      // F17 (gstack review): this had no catch — a failed add (e.g. a bad
      // fileUrl) threw as an unhandled rejection and the user saw nothing.
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
              <a href={d.file_url} target="_blank" rel="noreferrer" className="font-medium text-brand-secondary hover:underline">{d.title}</a>
              <Badge color="neutral">{d.doc_type}</Badge>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="mt-4 grid grid-cols-[110px,1fr,1fr,auto] gap-2 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <select className="input" value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}>
          {['CUSTOMS', 'RECEIPT', 'POD', 'LICENCE', 'INSURANCE', 'OTHER'].map((t) => <option key={t}>{t}</option>)}
        </select>
        <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input placeholder="File URL" value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} />
        <Button type="submit" variant="secondary" loading={busy}>Add</Button>
      </form>
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
      // F17 (gstack review): same missing catch as DocumentList — a failed
      // send silently vanished with no feedback.
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
  const [error, setError] = useState('');
  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api.rateJob(jobId, { score, comment });
      setDone(true);
      onDone();
    } catch (err) {
      // F14 (gstack review): this used to setDone(true) even on failure,
      // so a rejected rating (e.g. already rated) silently displayed
      // "Thanks for the rating" — the user had no idea it didn't save.
      setError(err.message);
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
      {error && <p className="text-sm text-status-danger">{error}</p>}
      <Textarea rows={2} placeholder="Optional comment" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button onClick={submit} loading={busy}>Submit rating</Button>
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

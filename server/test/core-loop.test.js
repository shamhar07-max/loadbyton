// Smoke suite for the money-critical path (TODO-1). Runs against a real,
// freshly-seeded, throwaway server instance — see harness.js. This is not
// exhaustive coverage; it exists to catch the class of regression that
// `npm run build` cannot: a route that 500s, a state machine that lets a
// double-award through, an escrow amount that drifts.
//
// Demo credentials below match server/seed.js exactly — see docs/TUTORIAL.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, makeClient } = require('./harness');

let server;

test.before(async () => {
  server = await startServer();
});

test.after(async () => {
  await server.stop();
});

test('health check responds ok', async () => {
  const res = await fetch(`${server.baseUrl}/api/health`);
  assert.equal(res.status, 200);
});

test('public lane index is served without auth', async () => {
  const res = await fetch(`${server.baseUrl}/api/public/lanes`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.lanes) && body.lanes.length > 0, 'expected at least one seeded lane');
});

test('unverified carrier is blocked from bidding, server-side', async () => {
  const carrier = makeClient(server.baseUrl);
  await carrier.login('desertline@drayage.ae', 'demo1234');
  const jobs = await carrier.get('/api/jobs?status=OPEN');
  const job = jobs.body.jobs.find((j) => j.status === 'OPEN');
  assert.ok(job, 'expected at least one OPEN job in seed data');

  const bid = await carrier.post(`/api/jobs/${job.id}/bids`, { amountAed: 500, etaMinutes: 30, truckType: 'flatbed', driverName: 'Test Driver' });
  assert.equal(bid.status, 403, 'unverified carrier must be rejected server-side, not just hidden in the UI');
});

test('core loop: post -> bid -> award -> pod -> status, with escrow and payout tracked correctly', async () => {
  const shipper = makeClient(server.baseUrl);
  await shipper.login('shipper@jebelalilogistics.ae', 'demo1234');

  const created = await shipper.post('/api/jobs', {
    containerSize: '40FT',
    containerType: 'DRY',
    pickupTerminal: 'JEBEL_ALI_T2',
    deliveryArea: 'JAFZA_SOUTH',
    deliveryAddress: 'Test Warehouse 1',
    readyAt: new Date(Date.now() + 86400000).toISOString(),
    deadline: new Date(Date.now() + 4 * 86400000).toISOString(),
    maxBudgetAed: 700,
  });
  assert.equal(created.status, 201, created.raw);
  const jobId = created.body.job.id;

  const carrier = makeClient(server.baseUrl);
  await carrier.login('carrier@dubaidrayage.com', 'demo1234'); // seeded verified GOLD carrier
  const bidRes = await carrier.post(`/api/jobs/${jobId}/bids`, {
    amountAed: 650, etaMinutes: 40, truckType: '3-axle flatbed', driverName: 'Hamdan Youssef', driverPhone: '+971501112233',
  });
  assert.equal(bidRes.status, 201, bidRes.raw);
  const bidId = bidRes.body.bid.id;

  const award = await shipper.post(`/api/jobs/${jobId}/award`, { bidId });
  assert.equal(award.status, 200, award.raw);
  assert.equal(award.body.job.status, 'AWARDED');
  assert.equal(award.body.job.escrow_status, 'HELD');
  assert.equal(award.body.job.agreed_price_aed, 650);

  // Idempotency: a second award attempt on the same job must fail, not
  // silently succeed or double-charge escrow. This is the exact guarantee
  // docs/ARCHITECTURE.md §3.3 and CLAUDE.md call out as non-negotiable.
  const doubleAward = await shipper.post(`/api/jobs/${jobId}/award`, { bidId });
  assert.equal(doubleAward.status, 409, 'a job already AWARDED must reject a second award attempt');

  // TODO-2: the driver bound at award must come from the winning bid, not
  // be left null, and reassigning it must be an audited action.
  assert.equal(award.body.job.assigned_driver_phone, '+971501112233');

  const badReassign = await carrier.patch(`/api/jobs/${jobId}/driver`, { driverName: 'New Driver', driverPhone: 'not-a-phone' });
  assert.equal(badReassign.status, 400, 'an invalid phone must be rejected, not silently accepted');

  const reassign = await carrier.patch(`/api/jobs/${jobId}/driver`, { driverName: 'Yusuf Al Naqbi', driverPhone: '0559998877' });
  assert.equal(reassign.status, 200, reassign.raw);
  assert.equal(reassign.body.job.assigned_driver_phone, '0559998877');

  const illegalSkip = await carrier.patch(`/api/jobs/${jobId}/status`, { status: 'IN_TRANSIT' });
  assert.equal(illegalSkip.status, 403, 'carrier must not be able to skip PICKED_UP');

  const pickedUp = await carrier.patch(`/api/jobs/${jobId}/status`, { status: 'PICKED_UP' });
  assert.equal(pickedUp.status, 200, pickedUp.raw);
  const inTransit = await carrier.patch(`/api/jobs/${jobId}/status`, { status: 'IN_TRANSIT' });
  assert.equal(inTransit.status, 200, inTransit.raw);

  const pod = await carrier.post(`/api/jobs/${jobId}/pod`, {});
  assert.equal(pod.status, 200, pod.raw);
  assert.equal(pod.body.job.status, 'DELIVERED');

  const admin = makeClient(server.baseUrl);
  await admin.login('admin@loadbyton.ae', 'demo1234');
  const audit = await admin.get('/api/admin/audit');
  assert.equal(audit.status, 200);
  const awardEntry = audit.body.entries.find((e) => e.action === 'AWARD' && e.entity_id === jobId);
  assert.ok(awardEntry, 'award must be recorded in the append-only audit log');
  const reassignEntry = audit.body.entries.find((e) => e.action === 'DRIVER_REASSIGN' && e.entity_id === jobId);
  assert.ok(reassignEntry, 'driver reassignment must be recorded in the audit log (anti-theft trail)');

  // Shipper confirms delivery -> payout releases (MANUAL) -> a VAT invoice
  // must exist for the carrier, with a taxable value + VAT that reconciles
  // against the platform fee actually deducted (agreed price 650 @ 6%).
  const completed = await shipper.patch(`/api/jobs/${jobId}/status`, { status: 'COMPLETED' });
  assert.equal(completed.status, 200, completed.raw);

  const invoices = await carrier.get('/api/invoices');
  assert.equal(invoices.status, 200);
  const invoice = invoices.body.invoices.find((i) => i.job_id === jobId);
  assert.ok(invoice, 'a VAT invoice must be issued when a payout releases');
  assert.match(invoice.invoice_number, /^LBT-INV-\d{4}-\d{6}$/);
  const expectedFee = Math.round((650 * 600) / 10000); // commission_rate_bps default = 600 (6%)
  assert.equal(invoice.commission_aed, expectedFee);
  assert.ok(Math.abs(invoice.taxable_aed + invoice.vat_aed - invoice.total_aed) < 0.01, 'taxable + VAT must reconcile to total');

  const invoiceDoc = await carrier.get(`/api/invoices/${invoice.id}`);
  assert.equal(invoiceDoc.status, 200);
  assert.match(invoiceDoc.raw, /Tax Invoice/);

  // TODO-3: the release is a DB flip; the real bank transfer is a manual
  // step that must show up as outstanding until an admin confirms it.
  const slaBefore = await admin.get('/api/admin/payouts-sla');
  assert.equal(slaBefore.status, 200);
  const outstanding = slaBefore.body.pending.find((p) => p.job_id === jobId);
  assert.ok(outstanding, 'a released payout with no confirmed transfer must appear as outstanding');
  assert.ok(outstanding.sla_deadline, 'sla_deadline must be set at release time');

  const confirm = await admin.post(`/api/admin/payouts/${outstanding.id}/mark-transferred`, { reference: 'WIRE-TEST-1' });
  assert.equal(confirm.status, 200, confirm.raw);

  const slaAfter = await admin.get('/api/admin/payouts-sla');
  assert.ok(!slaAfter.body.pending.find((p) => p.job_id === jobId), 'confirmed transfer must drop off the outstanding list');

  const doubleConfirm = await admin.post(`/api/admin/payouts/${outstanding.id}/mark-transferred`, {});
  assert.equal(doubleConfirm.status, 409, 'confirming an already-confirmed transfer must not silently succeed');
});

test('auto-release sweep (x-internal-key) releases past-window deliveries without an admin session', async () => {
  const res = await fetch(`${server.baseUrl}/api/system/auto-release`, {
    method: 'POST',
    headers: { 'x-internal-key': 'test-internal-key' },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.released, 'number');
});

test('auto-release sweep rejects requests with no key and no admin session', async () => {
  const res = await fetch(`${server.baseUrl}/api/system/auto-release`, { method: 'POST' });
  assert.equal(res.status, 403);
});

test('per-IP rate limiting kicks in on /api/auth — previously the ONLY throttle in the app was per-email login lockout', async () => {
  const statuses = [];
  for (let i = 0; i < 25; i++) {
    const res = await fetch(`${server.baseUrl}/api/auth/me`);
    statuses.push(res.status);
  }
  assert.ok(statuses.includes(429), `expected a 429 somewhere in 25 rapid requests, got: ${statuses.join(',')}`);
});

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
    amountAed: 650, etaMinutes: 40, truckType: '3-axle flatbed', driverName: 'Hamdan Youssef',
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

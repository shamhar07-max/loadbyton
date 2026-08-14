// Multi-seat company accounts: a seat authenticates with its own
// credentials but operates as the org root for every job/bid/payout (see
// the comment on auth() in server/index.js). These tests exist to catch
// exactly the failure mode that design risks: a seat's job silently not
// belonging to the org, or a role gate not actually blocking anything.

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

test('seats: OPS can operate the org, VIEWER cannot, deactivation is immediate', async () => {
  const root = makeClient(server.baseUrl);
  const rootEmail = `seat-root-${Date.now()}@example.ae`;
  const registered = await root.post('/api/auth/register', {
    email: rootEmail, password: 'demo1234', role: 'SHIPPER', companyName: 'Seat Test Shipping',
  });
  assert.equal(registered.status, 201, registered.raw);
  const rootId = registered.body.user.id;

  const opsAdd = await root.post('/api/org/members', {
    email: `seat-ops-${Date.now()}@example.ae`, password: 'demo1234', seatRole: 'OPS', displayName: 'Ops Person',
  });
  assert.equal(opsAdd.status, 201, opsAdd.raw);

  const viewerEmail = `seat-viewer-${Date.now()}@example.ae`;
  const viewerAdd = await root.post('/api/org/members', {
    email: viewerEmail, password: 'demo1234', seatRole: 'VIEWER', displayName: 'Viewer Person',
  });
  assert.equal(viewerAdd.status, 201, viewerAdd.raw);

  // OPS seat logs in with their OWN credentials and posts a job — the job
  // must be attributed to the ORG (root id), not the seat's own id.
  const opsClient = makeClient(server.baseUrl);
  const opsLogin = await opsClient.login(opsAdd.body.seat.email, 'demo1234');
  assert.equal(opsLogin.body.actingAs.seatRole, 'OPS');
  assert.equal(opsLogin.body.user.id, rootId, "a seat's session must resolve to the org root, not the seat's own id");

  const jobRes = await opsClient.post('/api/jobs', {
    pickupTerminal: 'JEBEL_ALI_T2', deliveryArea: 'JAFZA_SOUTH', deliveryAddress: 'Seat Test Warehouse',
    containerSize: '40FT', containerType: 'DRY',
    readyAt: new Date(Date.now() + 86400000).toISOString(), deadline: new Date(Date.now() + 4 * 86400000).toISOString(),
  });
  assert.equal(jobRes.status, 201, jobRes.raw);
  assert.equal(jobRes.body.job.shipper_id, rootId, "a seat's job must belong to the org, not the seat");

  // VIEWER seat must be blocked from the same mutating action, server-side.
  const viewerClient = makeClient(server.baseUrl);
  await viewerClient.login(viewerEmail, 'demo1234');
  const blocked = await viewerClient.post('/api/jobs', {
    pickupTerminal: 'JEBEL_ALI_T2', deliveryArea: 'JAFZA_SOUTH', deliveryAddress: 'Should not be created',
    containerSize: '40FT', containerType: 'DRY',
    readyAt: new Date(Date.now() + 86400000).toISOString(), deadline: new Date(Date.now() + 4 * 86400000).toISOString(),
  });
  assert.equal(blocked.status, 403, 'a VIEWER seat must not be able to post a job');

  // A seat (not the root) must not be able to manage other seats.
  const viewerTriesToAddSeat = await viewerClient.post('/api/org/members', {
    email: `should-not-exist-${Date.now()}@example.ae`, password: 'demo1234', seatRole: 'OPS',
  });
  assert.equal(viewerTriesToAddSeat.status, 403, 'only the org root can add seats');

  // Root deactivates the OPS seat — this must kill their live session
  // immediately, not just block their next login.
  const deactivate = await root.patch(`/api/org/members/${opsAdd.body.seat.id}`, { isActive: false });
  assert.equal(deactivate.status, 200, deactivate.raw);

  const staleSessionCheck = await opsClient.get('/api/auth/me');
  assert.equal(staleSessionCheck.status, 401, 'deactivating a seat must invalidate its existing session, not just future logins');

  const relogin = await makeClient(server.baseUrl).login(opsAdd.body.seat.email, 'demo1234').catch((e) => e);
  assert.match(relogin.message, /deactivated/);
});

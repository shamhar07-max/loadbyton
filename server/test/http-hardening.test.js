// Unit-level, no server boot needed: the Cloudflare-aware IP resolution
// (rate limiting behind the live deployment's Cloudflare + Render double
// proxy) and the HSTS gating logic.

const test = require('node:test');
const assert = require('node:assert/strict');
const { byIp } = require('../lib/rateLimit');
const { startServer } = require('./harness');

test('byIp prefers cf-connecting-ip (Cloudflare-resolved, unspoofable) over req.ip', () => {
  const withCf = { headers: { 'cf-connecting-ip': '203.0.113.9' }, ip: '10.0.0.1' };
  assert.equal(byIp(withCf), '203.0.113.9');

  const withoutCf = { headers: {}, ip: '10.0.0.1' };
  assert.equal(byIp(withoutCf), '10.0.0.1', 'falls back to req.ip when not behind Cloudflare (local dev)');
});

test('HSTS is gated on req.secure — a plain-HTTP response never sends it', async () => {
  const server = await startServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/health`);
    assert.equal(res.headers.get('strict-transport-security'), null, 'HSTS over plain HTTP would be a no-op at best and a misconfiguration signal at worst');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', 'sanity check: other security headers still present');
  } finally {
    await server.stop();
  }
});

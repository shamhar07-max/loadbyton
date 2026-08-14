// Proves the actual, previously-reported problem is fixed: a plain HTTP
// fetch with no JS execution (exactly what a search crawler, a link-
// preview bot, or WebFetch does) must see real page content, not an empty
// <div id="root"></div>. This is the whole point of build-time
// prerendering — verify it the same way an outside fetcher would, not by
// checking that a file exists on disk.
//
// Requires `npm run build` (web/) to have run first, same as any other
// check of the built SPA — the harness spawns the server against
// web/dist exactly as production does.

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./harness');

let server;

test.before(async () => {
  server = await startServer();
});

test.after(async () => {
  await server.stop();
});

test('public routes serve real, crawlable content — not an empty SPA shell', async () => {
  const routes = ['/', '/features', '/pricing', '/about', '/security', '/compliance', '/blog'];
  for (const route of routes) {
    const res = await fetch(`${server.baseUrl}${route}`);
    assert.equal(res.status, 200, route);
    const html = await res.text();
    // A real page has real markup immediately inside #root, not the bare
    // `<div id="root"></div>` this was shipping before prerendering
    // existed — checking the substring directly rather than a regex
    // spanning the whole (tens-of-KB) document, which is both simpler and
    // avoids over-fitting to index.html's exact internal layout.
    assert.ok(html.includes('<div id="root"><div'), `${route}: root div must contain rendered markup, not be empty`);
    assert.ok(!html.includes('<div id="root"></div>'), `${route}: root div must not be the old empty shell`);
  }
});

test('security page specifically includes its real claim text, not just chrome', async () => {
  const res = await fetch(`${server.baseUrl}/security`);
  const html = await res.text();
  assert.match(html, /bcrypt, cost factor 10/, 'the actual page content must be present, not just nav/footer');
});

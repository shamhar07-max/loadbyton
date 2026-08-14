// Isolated test-DB harness (TODO-1).
//
// Spawns the real server (`node index.js`) as a child process against a
// fresh temp SQLite file, so tests exercise the actual boot path, the
// actual seed, and the actual HTTP layer — not a mocked subset of it. The
// temp DB is deleted on teardown, so runs never leak state into each other
// or into server/data/loadbyton.db.
//
// Zero test-framework dependencies on purpose (matches CLAUDE.md's minimal
// deps rule): uses node:test, node:assert, and the global fetch — all
// built into Node 22.

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

function freePort() {
  // Ports in this range are unlikely to collide with dev servers (4000,
  // 5173) or common local services. Not airtight under heavy parallelism,
  // but this suite runs as a single serial file.
  return 4100 + (process.pid % 400);
}

async function waitForHealth(baseUrl, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // server not up yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server did not become healthy within ${timeoutMs}ms`);
}

async function startServer() {
  const dbPath = path.join(os.tmpdir(), `loadbyton-test-${process.pid}-${Symbol().description || 'db'}-${Math.random().toString(36).slice(2)}.db`);
  const port = freePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      DB_PATH: dbPath,
      PORT: String(port),
      FRONTEND_URL: 'http://127.0.0.1:1', // dev-CORS branch stays a no-op in tests
      INTERNAL_KEY: 'test-internal-key',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  const exitedEarly = new Promise((_, reject) => {
    child.once('exit', (code) => {
      if (code !== null && code !== 0) reject(new Error(`Server exited with code ${code}\n${stderr}`));
    });
  });

  await Promise.race([waitForHealth(baseUrl), exitedEarly]);

  async function stop() {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(dbPath + suffix, { force: true });
    }
  }

  return { baseUrl, dbPath, stop };
}

// Minimal per-actor cookie jar — fetch doesn't persist Set-Cookie across
// calls the way a browser does, and the app is session-cookie-only by
// design (see docs/ARCHITECTURE.md §2), so tests need this to act as more
// than one logged-in role at a time.
function makeClient(baseUrl) {
  let cookie = null;
  async function call(method, urlPath, body) {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    let json = null;
    const text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON response */ }
    return { status: res.status, ok: res.ok, body: json, raw: text };
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    patch: (p, b) => call('PATCH', p, b),
    async login(email, password) {
      const r = await call('POST', '/api/auth/login', { email, password });
      if (!r.ok) throw new Error(`login failed for ${email}: ${r.status} ${r.raw}`);
      return r;
    },
  };
}

module.exports = { startServer, makeClient };

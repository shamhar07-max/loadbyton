// Loadbyton API — Express + node:sqlite. All routes + business logic.
// See docs/ARCHITECTURE.md, docs/API.md, docs/DATA_MODEL.md for the spec
// this file implements.

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');

const db = require('./db');
const totp = require('./lib/totp');
const { unifiedLanes, estimateRate, optimizeRoute } = require('./lib/lanes');
const { issueInvoice, renderInvoiceHtml } = require('./lib/invoice');
const { rateLimiter, byIp } = require('./lib/rateLimit');
const { encryptField, decryptField } = require('./lib/crypto');
const { notifyDriverAsync } = require('./lib/whatsapp');
const { sendEmailAsync } = require('./lib/email');
const {
  cookieParser,
  requestId,
  securityHeaders,
  sendError,
  asyncHandler,
  jobCode,
  referralCode,
  randomToken,
} = require('./lib/http');

const PORT = Number(process.env.PORT) || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const INTERNAL_KEY = process.env.INTERNAL_KEY || randomToken(16);
// gstack review F22: a hash to compare against when no user row exists, so
// a login attempt for an unregistered email pays the same bcrypt cost as
// one for a registered email with the wrong password — see the login route.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('no-such-user-timing-guard', 10);
const DIST_DIR = path.join(__dirname, '..', 'web', 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');

const app = express();
app.disable('x-powered-by');
// Required for req.ip to reflect the real client behind Render/Cloudflare —
// without this, every request behind a proxy shares one IP and the rate
// limiter below would throttle all users as if they were one.
app.set('trust proxy', 1);
// 8mb covers a 5MB (MAX_UPLOAD_BYTES) file at its ~33% base64 inflation plus
// JSON overhead; every other route's body is a few KB at most.
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser);
app.use(requestId);
app.use(securityHeaders);

// General API rate limiting — previously the ONLY throttle anywhere in the
// app was the per-email login lockout further down; every other route,
// including job posting and bidding, had no ceiling at all.
const apiLimiter = rateLimiter({ windowMs: 60 * 1000, max: 300, keyFn: byIp });
app.use('/api', apiLimiter);
const authLimiter = rateLimiter({ windowMs: 60 * 1000, max: 20, keyFn: byIp, message: 'Too many auth requests from this address. Try again shortly.' });
app.use('/api/auth', authLimiter);
const writeLimiter = rateLimiter({ windowMs: 60 * 1000, max: 30, keyFn: byIp, message: 'Too many requests. Slow down and try again.' });

// Dev CORS — a no-op in production, where the SPA is same-origin.
app.use((req, res, next) => {
  if (req.headers.origin === FRONTEND_URL) {
    res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-request-id, x-internal-key');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

const CONTAINER_SIZES = ['20FT', '40FT', '40HC', 'REEFER'];
const CONTAINER_TYPES = ['DRY', 'REEFER', 'HAZMAT', 'OPEN_TOP', 'FLAT_RACK'];
const DOC_TYPES = ['CUSTOMS', 'RECEIPT', 'POD', 'LICENCE', 'INSURANCE', 'OTHER'];
const STATUS_ORDER = ['DRAFT', 'OPEN', 'AWARDED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];

// Real file upload for job documents/POD photos. Sent as base64 in the JSON
// body (not multipart) so this needs no new dependency — express.json()
// already parses it. Stored under UPLOADS_DIR, which sits next to the
// sqlite file so both live on the same Render persistent disk (DB_PATH's
// directory is /data in production, server/data locally).
const UPLOADS_DIR = path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, 'data', 'loadbyton.db')), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const ALLOWED_UPLOAD_MIME_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Decodes+validates a base64 upload and writes it under UPLOADS_DIR/<jobId>/.
// Throws { status, message } (caught by the route) on any validation failure
// so every call site gets the same 400s without duplicating the checks.
function saveUploadedFile(jobId, mimeType, base64) {
  const ext = ALLOWED_UPLOAD_MIME_TYPES[mimeType];
  if (!ext) throw { status: 400, message: `mimeType must be one of: ${Object.keys(ALLOWED_UPLOAD_MIME_TYPES).join(', ')}` };
  if (typeof base64 !== 'string' || !base64) throw { status: 400, message: 'fileBase64 is required' };
  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw { status: 400, message: 'fileBase64 is not valid base64' };
  }
  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
    throw { status: 400, message: `File must be between 1 byte and ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB` };
  }
  const jobDir = path.join(UPLOADS_DIR, String(jobId));
  fs.mkdirSync(jobDir, { recursive: true });
  const filename = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(jobDir, filename), buffer);
  return { storagePath: `${jobId}/${filename}`, mimeType };
}

// UAE mobile: 05XXXXXXXX, +9715XXXXXXXX, or 9715XXXXXXXX — loose on purpose,
// this only guards against an obviously-wrong value at the API boundary.
const UAE_MOBILE_RE = /^(\+?971|0)?5\d{8}$/;
function normalizeUaeMobile(raw) {
  const digits = String(raw || '').replace(/[\s-]/g, '');
  return UAE_MOBILE_RE.test(digits) ? digits : null;
}

// Loose UAE-region bounding box (with margin) for the optional map pin —
// just enough to reject an obviously wrong value (e.g. lat/lng swapped),
// not a precise border check.
function isValidUaeLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 22 && lat <= 27 && lng >= 51 && lng <= 57;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Real UAE geography, not a heuristic — every value in TERMINALS/AREAS sits
// unambiguously in one emirate, mirroring web/src/lib/constants.js's
// TERMINAL_INFO (which only covers terminals; this adds the delivery-area
// side so backload matching below can fall back to "same emirate" when a
// job has no map pin).
const TERMINAL_EMIRATE = {
  JEBEL_ALI_T1: 'Dubai', JEBEL_ALI_T2: 'Dubai', JEBEL_ALI_T4: 'Dubai',
  KHALIFA_PORT: 'Abu Dhabi', PORT_KHALID: 'Sharjah', FUJAIRAH_PORT: 'Fujairah',
};
const AREA_EMIRATE = {
  AL_QUOZ: 'Dubai', JAFZA_SOUTH: 'Dubai', DUBAI_SOUTH: 'Dubai', DIP: 'Dubai', AL_QUSAIS: 'Dubai',
  MUSAFFAH: 'Abu Dhabi', SHARJAH_INDUSTRIAL: 'Sharjah', FUJAIRAH_FREEZONE: 'Fujairah',
};

// gstack review F2: length is the one password rule NIST 800-63B actually
// recommends enforcing — no arbitrary symbol/number complexity theater.
// Matches the frontend's Register.jsx minLength.
const MIN_PASSWORD_LENGTH = 8;
function isPasswordValid(password) {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

// gstack review F9: raw `===` on a secret is a timing oracle in principle.
// SHA-256 both sides first — fixes the comparison to a constant 32 bytes so
// timingSafeEqual can't throw on a length mismatch, which is the usual
// reason people avoid it for user-supplied input.
function timingSafeEqualStr(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Verification/reset tokens: the raw token goes to the user (via email);
// only its hash is stored, so a leaked DB row can't be replayed as a token.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Equipment/vehicle types a job can require and a carrier can bid with. The
// two container-carrying types are the only ones where container_size/
// container_type mean anything — every other type is general UAE road
// freight (construction plant, palletised/boxed cargo, small-load pickups).
const EQUIPMENT_TYPES = [
  'CONTAINER_CHASSIS', 'REEFER_TRUCK', 'LOWBED_TRAILER', 'FLATBED_TRAILER', 'BOX_TRUCK',
  'CURTAIN_TRUCK', 'PICKUP_3T', 'PICKUP_5T', 'PICKUP_7T', 'PICKUP_10T',
  'SIDE_LOADER_TRAILER', 'TRIPPER',
];
const CONTAINER_EQUIPMENT = ['CONTAINER_CHASSIS', 'REEFER_TRUCK'];

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    commission_rate_bps: Number(map.commission_rate_bps ?? 600),
    auto_release_hours: Number(map.auto_release_hours ?? 24),
  };
}

function toPublicUser(row) {
  if (!row) return null;
  const profile =
    row.profile !== undefined ? row.profile : db.prepare('SELECT * FROM profiles WHERE user_id=?').get(row.id);
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    is_verified: !!row.is_verified,
    email_verified: !!row.email_verified_at,
    mfa_enabled: !!row.mfa_enabled,
    tier: row.tier,
    referral_code: row.referral_code,
    referred_by: row.referred_by,
    created_at: row.created_at,
    profile: profile
      ? {
          company_name: profile.company_name,
          trn_number: decryptField(profile.trn_number),
          trade_license_number: profile.trade_license_number,
          phone: profile.phone,
          iban: decryptField(profile.iban),
          coverage_zones: profile.coverage_zones,
          fleet_size: profile.fleet_size,
          owned_chassis: profile.owned_chassis,
          insurance_uploaded: !!profile.insurance_uploaded,
          rating_avg: profile.rating_avg,
          completed_jobs: profile.completed_jobs,
          verified_at: profile.verified_at,
        }
      : null,
  };
}

function writeAudit(req, { userId = null, action, details = null, entityType = null, entityId = null, beforeState = null, afterState = null }) {
  db.prepare(
    `INSERT INTO audit_log (user_id, action, details, entity_type, entity_id, before_state, after_state, request_id)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(userId, action, details, entityType, entityId, beforeState, afterState, req ? req.requestId : null);
}

// Fixed category set — every notify() call site below is tagged with one
// of these, and a user can mute categories via
// PATCH /api/notifications/preferences (users.notification_prefs_disabled,
// a CSV of muted keys). 'system' is the untagged fallback and deliberately
// not mutable — account-level notices shouldn't be silenceable.
const NOTIFICATION_TYPES = ['bid', 'award', 'status', 'payout', 'dispute', 'verification', 'message'];

function notify(userId, title, body, jobId = null, type = 'system') {
  if (!userId) return;
  if (type !== 'system') {
    const user = db.prepare('SELECT notification_prefs_disabled FROM users WHERE id=?').get(userId);
    const disabled = user ? user.notification_prefs_disabled.split(',').filter(Boolean) : [];
    if (disabled.includes(type)) return;
  }
  db.prepare('INSERT INTO notifications (user_id, title, body, job_id, type) VALUES (?,?,?,?,?)').run(userId, title, body, jobId, type);
}

// Self-serve dispute filing needs *someone* on the admin side to actually
// see it — there's no "notify all admins" primitive elsewhere in this file
// because every prior dispute was admin-opened (the admin already knew).
function notifyAdmins(title, body, jobId = null, type = 'dispute') {
  const admins = db.prepare(`SELECT id FROM users WHERE role='ADMIN'`).all();
  for (const a of admins) notify(a.id, title, body, jobId, type);
}

function isParticipantOrBidder(job, user) {
  if (user.role === 'ADMIN') return true;
  if (user.id === job.shipper_id) return true;
  if (user.id === job.carrier_id) return true;
  if (user.role === 'CARRIER') {
    const hasBid = db.prepare('SELECT 1 FROM bids WHERE job_id=? AND carrier_id=?').get(job.id, user.id);
    if (hasBid) return true;
  }
  return false;
}

function canViewJob(job, user) {
  if (isParticipantOrBidder(job, user)) return true;
  if (user.role === 'CARRIER' && job.status === 'OPEN') return true;
  return false;
}

// ---------------------------------------------------------------------------
// Auth: sessions, not JWTs. lb_session HttpOnly cookie -> sessions table.
// ---------------------------------------------------------------------------

function createSession(req, res, userId, { impersonatingAdminId = null, actingSeatId = null, maxAgeSeconds = 7 * 24 * 60 * 60 } = {}) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();
  db.prepare('INSERT INTO sessions (session_token, user_id, expires_at, impersonating_admin_id, acting_seat_id) VALUES (?,?,?,?,?)').run(
    token,
    userId,
    expiresAt,
    impersonatingAdminId,
    actingSeatId
  );
  const secure = req.protocol === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `lb_session=${token}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'lb_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

// Multi-seat accounts: a seat authenticates with their own email/password,
// but the resulting session keys off the ORG ROOT's id (session.user_id) —
// req.user below is always the root. That's deliberate: every existing
// shipper_id/carrier_id ownership check, verification check, and profile
// read elsewhere in this file keeps working unmodified for a seat, because
// as far as the data model is concerned a seat *is* the org for the
// duration of the request. req.actorId / req.seatRole / req.actorLabel
// carry who's actually driving, for audit attribution and permission
// gating only (see requireSeatRole below) — never for data ownership.
function auth(roles) {
  return (req, res, next) => {
    const token = req.cookies.lb_session;
    if (!token) return sendError(res, 401, 'Not authenticated');
    const session = db.prepare('SELECT * FROM sessions WHERE session_token=?').get(token);
    if (!session || new Date(session.expires_at) < new Date()) return sendError(res, 401, 'Session expired');
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id);
    if (!user) return sendError(res, 401, 'Not authenticated');
    const profile = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(user.id);
    req.user = { ...user, profile };
    req.session = session;

    req.actorId = user.id;
    req.seatRole = null;
    req.actorLabel = user.email;
    if (session.acting_seat_id) {
      const seat = db.prepare('SELECT * FROM users WHERE id=?').get(session.acting_seat_id);
      if (!seat || !seat.is_active) return sendError(res, 401, 'This seat has been deactivated');
      req.actorId = seat.id;
      req.seatRole = seat.seat_role;
      req.actorLabel = seat.display_name || seat.email;
    }

    if (roles && roles.length && !roles.includes(user.role)) return sendError(res, 403, 'Not permitted for this role');
    next();
  };
}

// Gates a mutating action to org roots (req.seatRole === null) and seats
// whose seat_role is in the allow-list. A VIEWER or FINANCE seat hitting
// "post a job" or "place a bid" must get the same 403 a wrong role would —
// this is the enforcement point for that, applied per-route below.
function requireSeatRole(allowed) {
  return (req, res, next) => {
    if (req.seatRole === null) return next(); // org root — full access
    if (allowed.includes(req.seatRole)) return next();
    return sendError(res, 403, `Your seat role (${req.seatRole}) cannot perform this action`);
  };
}

// Per-email login throttle — in-process, resets on restart. 8 fails / 15 min.
const loginAttempts = new Map();
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const THROTTLE_MAX = 8;

function isThrottled(email) {
  const rec = loginAttempts.get(email);
  if (!rec) return false;
  if (Date.now() - rec.firstFailAt > THROTTLE_WINDOW_MS) {
    loginAttempts.delete(email);
    return false;
  }
  return rec.count >= THROTTLE_MAX;
}
function recordFailure(email) {
  const rec = loginAttempts.get(email);
  if (!rec || Date.now() - rec.firstFailAt > THROTTLE_WINDOW_MS) {
    loginAttempts.set(email, { count: 1, firstFailAt: Date.now() });
  } else {
    rec.count += 1;
  }
}
function clearThrottle(email) {
  loginAttempts.delete(email);
}

// =============================================================================
// 1. System
// =============================================================================

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'loadbyton-api', time: new Date().toISOString(), pid: String(process.pid), port: PORT });
});

function runAutoReleaseSweep(req) {
  const { auto_release_hours } = getSettings();
  const due = db
    .prepare(
      `SELECT * FROM jobs
       WHERE status='DELIVERED' AND auto_release_processed=0 AND delivered_at IS NOT NULL
         AND datetime(delivered_at, '+' || ? || ' hours') <= datetime('now')`
    )
    .all(auto_release_hours);

  let released = 0;
  for (const job of due) {
    if (job.escrow_status === 'DISPUTED') continue; // frozen, skip
    try {
      db.exec('BEGIN');
      db.prepare(
        `UPDATE jobs SET escrow_status='RELEASED', auto_release_processed=1, payout_released_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
      ).run(job.id);
      db.prepare(`UPDATE payouts SET status='RELEASED', release_type='AUTO_24H', released_at=datetime('now'), sla_deadline=datetime('now', '+48 hours') WHERE job_id=?`).run(job.id);
      issueInvoice(db, job.id);
      writeAudit(req, {
        action: 'ESCROW_RELEASE',
        details: `Auto-released ${job.job_code} after ${auto_release_hours}h (silent assent).`,
        entityType: 'job',
        entityId: job.id,
        beforeState: 'HELD',
        afterState: 'RELEASED',
      });
      notify(job.shipper_id, 'Payout auto-released', `${job.job_code} funds were released ${auto_release_hours}h after delivery.`, job.id, 'payout');
      notify(job.carrier_id, 'Funds on the way', `Your payout for ${job.job_code} was auto-released.`, job.id, 'payout');
      db.exec('COMMIT');
      released++;
    } catch (e) {
      db.exec('ROLLBACK');
      // gstack review F6: this used to swallow the error entirely — a
      // failing issueInvoice() (or anything else in the transaction) meant
      // the job silently never released, with nothing to grep for. Money
      // moving on a schedule needs a visible failure, not a quiet retry.
      // eslint-disable-next-line no-console
      console.error(`[auto-release] job #${job.id} (${job.job_code}) failed, rolled back:`, e.message);
      writeAudit(req, {
        action: 'ESCROW_RELEASE_FAILED',
        details: `Auto-release failed for ${job.job_code}: ${e.message}`,
        entityType: 'job',
        entityId: job.id,
        beforeState: 'HELD',
        afterState: 'HELD',
      });
    }
  }
  return released;
}

app.post('/api/system/auto-release', (req, res) => {
  const key = req.headers['x-internal-key'];
  let authorized = typeof key === 'string' && timingSafeEqualStr(key, INTERNAL_KEY);
  if (!authorized) {
    const token = req.cookies.lb_session;
    const session = token && db.prepare('SELECT * FROM sessions WHERE session_token=?').get(token);
    const user = session && db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id);
    if (user && user.role === 'ADMIN') authorized = true;
  }
  if (!authorized) return sendError(res, 403, 'Admin session or x-internal-key required');
  const released = runAutoReleaseSweep(req);
  res.json({ ok: true, released, message: `Auto-release sweep complete: ${released} job(s) released.` });
});

setInterval(() => runAutoReleaseSweep(null), 10 * 60 * 1000).unref();

// =============================================================================
// 2. Auth
// =============================================================================

// One-time, self-closing admin provisioning for production. F1 (gstack
// review) stopped admin@loadbyton.ae from being auto-seeded in production —
// correctly, since that was a public, known credential — but that means a
// real deployment needs *some* way to get its first admin account. This is
// that way: it requires a secret only the operator knows (ADMIN_SETUP_KEY,
// set as an env var — never a default, so an unset key means this route is
// permanently 403, fail-closed) AND it refuses to run at all once a single
// ADMIN account exists. There is no cleanup step to forget — the route
// locks itself the moment it's used once, whether or not ADMIN_SETUP_KEY is
// ever unset afterward.
app.post(
  '/api/system/setup-admin',
  asyncHandler(async (req, res) => {
    const key = req.headers['x-setup-key'];
    if (!process.env.ADMIN_SETUP_KEY || typeof key !== 'string' || !timingSafeEqualStr(key, process.env.ADMIN_SETUP_KEY)) {
      return sendError(res, 403, 'ADMIN_SETUP_KEY header required and must match the environment variable of the same name');
    }
    const adminExists = db.prepare(`SELECT 1 FROM users WHERE role='ADMIN' LIMIT 1`).get();
    if (adminExists) return sendError(res, 403, 'An admin account already exists — this route only ever provisions the first one');

    const { email, password, companyName } = req.body || {};
    if (!email || !password) return sendError(res, 400, 'email and password are required');
    if (!isPasswordValid(password)) return sendError(res, 400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return sendError(res, 400, 'An account with that email already exists');

    const passwordHash = bcrypt.hashSync(password, 10);
    const userResult = db
      .prepare(
        `INSERT INTO users (email, password_hash, role, is_verified, tier, referral_code, email_verified_at)
         VALUES (?,?,?,?,?,?,datetime('now'))`
      )
      .run(email, passwordHash, 'ADMIN', 1, 'GOLD', referralCode('ADM', companyName || 'LOADBYTON'));
    const userId = Number(userResult.lastInsertRowid);
    db.prepare('INSERT INTO profiles (user_id, company_name) VALUES (?,?)').run(userId, companyName || 'Loadbyton Ops');

    writeAudit(req, { userId, action: 'ADMIN_SETUP', details: `First admin account provisioned: ${email}`, entityType: 'user', entityId: userId });
    res.status(201).json({ ok: true, message: 'Admin account created. This route is now permanently disabled.' });
  })
);

app.post(
  '/api/auth/register',
  asyncHandler(async (req, res) => {
    const { email, password, role, companyName, phone, trnNumber, tradeLicenseNumber, referralCode: incomingReferral } = req.body || {};
    if (!email || !password || !companyName) return sendError(res, 400, 'email, password and companyName are required');
    if (!isPasswordValid(password)) return sendError(res, 400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    if (!['SHIPPER', 'CARRIER'].includes(role)) return sendError(res, 422, 'role must be SHIPPER or CARRIER');
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (existing) return sendError(res, 400, 'An account with that email already exists');

    let referredBy = null;
    if (incomingReferral) {
      const referrer = db.prepare('SELECT referral_code FROM users WHERE referral_code=?').get(incomingReferral);
      if (referrer) referredBy = referrer.referral_code;
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const prefix = role === 'SHIPPER' ? 'SHP' : 'CAR';
    let code = referralCode(prefix, companyName);
    while (db.prepare('SELECT 1 FROM users WHERE referral_code=?').get(code)) {
      code = `${code}${Math.floor(Math.random() * 90 + 10)}`;
    }

    // gstack review F3: a real, verifiable token — not just a flag — so
    // identity squatting (registering an email you don't own) is at least
    // detectable and the link can't be guessed. See server/lib/email.js for
    // why this is safe to fire even with no provider configured.
    const verifyToken = randomToken(32);
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const userResult = db
      .prepare(
        'INSERT INTO users (email, password_hash, role, tier, referral_code, referred_by, email_verify_token_hash, email_verify_expires) VALUES (?,?,?,?,?,?,?,?)'
      )
      .run(email, passwordHash, role, 'BRONZE', code, referredBy, hashToken(verifyToken), verifyExpires);
    const userId = Number(userResult.lastInsertRowid);
    db.prepare(
      'INSERT INTO profiles (user_id, company_name, trn_number, trade_license_number, phone) VALUES (?,?,?,?,?)'
    ).run(userId, companyName, encryptField(trnNumber), tradeLicenseNumber || null, phone || null);

    writeAudit(req, { userId, action: 'REGISTER', details: `${role} registered: ${email}`, entityType: 'user', entityId: userId });
    sendEmailAsync({
      to: email,
      subject: 'Verify your Loadbyton account',
      html: `<p>Confirm this email address to finish setting up Loadbyton:</p><p><a href="${FRONTEND_URL}/verify-email?token=${verifyToken}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
    });
    createSession(req, res, userId);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    res.status(201).json({ user: toPublicUser(user) });
  })
);

app.get(
  '/api/auth/verify-email',
  asyncHandler(async (req, res) => {
    const token = req.query.token;
    if (!token || typeof token !== 'string') return sendError(res, 400, 'token is required');
    const user = db
      .prepare('SELECT id, email_verify_expires FROM users WHERE email_verify_token_hash=?')
      .get(hashToken(token));
    if (!user || !user.email_verify_expires || new Date(user.email_verify_expires) < new Date()) {
      return sendError(res, 400, 'This verification link is invalid or has expired');
    }
    db.prepare(
      `UPDATE users SET email_verified_at=datetime('now'), email_verify_token_hash=NULL, email_verify_expires=NULL WHERE id=?`
    ).run(user.id);
    writeAudit(req, { userId: user.id, action: 'EMAIL_VERIFY', entityType: 'user', entityId: user.id });
    res.json({ ok: true });
  })
);

app.post('/api/auth/resend-verification', auth(), (req, res) => {
  if (req.user.email_verified_at) return sendError(res, 400, 'Email is already verified');
  const verifyToken = randomToken(32);
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE users SET email_verify_token_hash=?, email_verify_expires=? WHERE id=?').run(hashToken(verifyToken), verifyExpires, req.user.id);
  sendEmailAsync({
    to: req.user.email,
    subject: 'Verify your Loadbyton account',
    html: `<p>Confirm this email address to finish setting up Loadbyton:</p><p><a href="${FRONTEND_URL}/verify-email?token=${verifyToken}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
  });
  res.json({ ok: true });
});

// gstack review F3: the missing recovery path. Always 200 regardless of
// whether the email exists — the response must not be a way to enumerate
// registered accounts.
app.post(
  '/api/auth/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    if (!email) return sendError(res, 400, 'email is required');
    const user = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (user) {
      const resetToken = randomToken(32);
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      db.prepare('UPDATE users SET password_reset_token_hash=?, password_reset_expires=? WHERE id=?').run(hashToken(resetToken), resetExpires, user.id);
      writeAudit(req, { userId: user.id, action: 'PASSWORD_RESET_REQUEST', entityType: 'user', entityId: user.id });
      sendEmailAsync({
        to: email,
        subject: 'Reset your Loadbyton password',
        html: `<p>Reset your password:</p><p><a href="${FRONTEND_URL}/reset-password?token=${resetToken}">Reset password</a></p><p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
      });
    }
    res.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
  })
);

app.post(
  '/api/auth/reset-password',
  asyncHandler(async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || typeof token !== 'string') return sendError(res, 400, 'token is required');
    if (!isPasswordValid(password)) return sendError(res, 400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    const user = db
      .prepare('SELECT id FROM users WHERE password_reset_token_hash=? AND password_reset_expires > datetime(\'now\')')
      .get(hashToken(token));
    if (!user) return sendError(res, 400, 'This reset link is invalid or has expired');

    const passwordHash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash=?, password_reset_token_hash=NULL, password_reset_expires=NULL WHERE id=?').run(passwordHash, user.id);
    // A password reset is exactly the moment every existing session (on
    // every device, including whoever the attacker was if this reset was
    // defensive) should be invalidated.
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    writeAudit(req, { userId: user.id, action: 'PASSWORD_RESET', entityType: 'user', entityId: user.id });
    res.json({ ok: true });
  })
);

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const { email, password, totpCode } = req.body || {};
    if (!email || !password) return sendError(res, 400, 'email and password are required');
    if (isThrottled(email)) return sendError(res, 429, 'Too many failed attempts. Try again in a few minutes.');

    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    // gstack review F22: `!user || !bcrypt.compareSync(...)` short-circuits
    // past the bcrypt call entirely when the email doesn't exist, so a
    // nonexistent-email response returns measurably faster than a
    // wrong-password one — a timing oracle for enumerating registered
    // emails. Always pay the bcrypt cost against *some* hash.
    const passwordOk = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_PASSWORD_HASH);
    if (!user || !passwordOk) {
      recordFailure(email);
      return sendError(res, 403, 'Invalid email or password');
    }
    if (!user.is_active) {
      recordFailure(email);
      return sendError(res, 403, 'This account has been deactivated');
    }
    if (user.mfa_enabled) {
      if (!totp.verifyCode(user.mfa_secret, totpCode)) {
        recordFailure(email);
        return sendError(res, 403, 'Invalid or missing authentication code');
      }
    }
    clearThrottle(email);

    // A seat's own row (org_owner_id set) authenticates here, but the
    // session — and everything downstream — runs as the org root. See the
    // comment on auth() above.
    const isSeat = !!user.org_owner_id;
    const rootId = user.org_owner_id || user.id;
    const rootUser = isSeat ? db.prepare('SELECT * FROM users WHERE id=?').get(rootId) : user;
    createSession(req, res, rootId, { actingSeatId: isSeat ? user.id : null });
    writeAudit(req, { userId: user.id, action: 'LOGIN', details: `${user.email} logged in`, entityType: 'user', entityId: user.id });
    res.json({
      user: toPublicUser(rootUser),
      actingAs: isSeat ? { id: user.id, email: user.email, displayName: user.display_name, seatRole: user.seat_role } : null,
    });
  })
);

app.get('/api/auth/me', auth(), (req, res) => {
  const impersonatingAdminId = req.session.impersonating_admin_id;
  const impersonatedBy = impersonatingAdminId
    ? db.prepare('SELECT id, email FROM users WHERE id=?').get(impersonatingAdminId)
    : null;
  const actingSeatId = req.session.acting_seat_id;
  const actingSeat = actingSeatId ? db.prepare('SELECT id, email, display_name, seat_role FROM users WHERE id=?').get(actingSeatId) : null;
  res.json({
    user: { ...toPublicUser(req.user), impersonating: !!impersonatedBy, impersonatedBy },
    actingAs: actingSeat ? { id: actingSeat.id, email: actingSeat.email, displayName: actingSeat.display_name, seatRole: actingSeat.seat_role } : null,
  });
});

app.post('/api/auth/logout', auth(), (req, res) => {
  const token = req.cookies.lb_session;
  if (token) db.prepare('DELETE FROM sessions WHERE session_token=?').run(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// MFA lives on whichever row the caller actually logs in with — req.actorId
// (the seat's own row, if a seat is acting), not req.user.id (the org
// root). Keying this off the root would silently no-op for a seat: login
// checks MFA on the row found by email, which for a seat is their own row.
app.post('/api/auth/mfa/setup', auth(), (req, res) => {
  const secret = totp.randomBase32Secret();
  db.prepare('UPDATE users SET mfa_secret=?, mfa_enabled=1 WHERE id=?').run(secret, req.actorId);
  writeAudit(req, { userId: req.actorId, action: 'MFA_ENABLE', entityType: 'user', entityId: req.actorId });
  res.json({ ok: true, secret, otpauthUrl: totp.provisioningUrl(secret, req.actorLabel) });
});

app.post('/api/auth/mfa/disable', auth(), (req, res) => {
  db.prepare('UPDATE users SET mfa_secret=NULL, mfa_enabled=0 WHERE id=?').run(req.actorId);
  writeAudit(req, { userId: req.actorId, action: 'MFA_DISABLE', entityType: 'user', entityId: req.actorId });
  res.json({ ok: true });
});

app.patch('/api/profile', auth(), requireSeatRole(['OPS']), (req, res) => {
  const b = req.body || {};
  const fields = {
    company_name: b.companyName,
    trn_number: b.trnNumber === undefined ? undefined : encryptField(b.trnNumber),
    trade_license_number: b.tradeLicenseNumber,
    phone: b.phone,
    iban: b.iban === undefined ? undefined : encryptField(b.iban),
    coverage_zones: b.coverageZones,
    fleet_size: b.fleetSize,
    owned_chassis: b.ownedChassis,
    insurance_uploaded: b.insuranceUploaded === undefined ? undefined : b.insuranceUploaded ? 1 : 0,
  };
  const sets = [];
  const params = [];
  for (const [col, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${col}=?`);
      params.push(val);
    }
  }
  if (sets.length) {
    params.push(req.user.id);
    db.prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE user_id=?`).run(...params);
  }
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  res.json({ user: toPublicUser(user) });
});

// -----------------------------------------------------------------------
// Multi-seat company accounts. A seat is a normal `users` row (own email,
// password, own optional MFA) with org_owner_id pointing at the account
// that owns the company profile. Seats log in with their own credentials
// (see the login route above) but operate as that org for every job/bid/
// payout — see the comment on auth() for why. Only the org root can add,
// re-role, or deactivate a seat; any org member can view the roster.
// -----------------------------------------------------------------------

const SEAT_ROLES = ['OPS', 'FINANCE', 'VIEWER'];

app.get('/api/org/members', auth(['SHIPPER', 'CARRIER']), (req, res) => {
  const seats = db
    .prepare('SELECT id, email, display_name, seat_role, is_active, created_at FROM users WHERE org_owner_id=? ORDER BY created_at ASC')
    .all(req.user.id);
  res.json({
    root: { id: req.user.id, email: req.user.email, displayName: req.user.profile ? req.user.profile.company_name : req.user.email },
    seats,
  });
});

app.post('/api/org/members', auth(['SHIPPER', 'CARRIER']), requireSeatRole([]), (req, res) => {
  const { email, password, seatRole, displayName } = req.body || {};
  if (!email || !password) return sendError(res, 400, 'email and password are required');
  if (!SEAT_ROLES.includes(seatRole)) return sendError(res, 422, `seatRole must be one of ${SEAT_ROLES.join(', ')}`);
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return sendError(res, 400, 'An account with that email already exists');

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare('INSERT INTO users (email, password_hash, role, tier, org_owner_id, seat_role, display_name, is_verified) VALUES (?,?,?,?,?,?,?,?)')
    .run(email, passwordHash, req.user.role, 'BRONZE', req.user.id, seatRole, displayName || null, req.user.is_verified ? 1 : 0);
  const seatId = Number(result.lastInsertRowid);
  writeAudit(req, { userId: req.actorId, action: 'ORG_MEMBER_ADD', details: `Added seat ${email} (${seatRole})`, entityType: 'user', entityId: seatId });
  const seat = db.prepare('SELECT id, email, display_name, seat_role, is_active, created_at FROM users WHERE id=?').get(seatId);
  res.status(201).json({ seat });
});

app.patch('/api/org/members/:id', auth(['SHIPPER', 'CARRIER']), requireSeatRole([]), (req, res) => {
  const seat = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!seat || seat.org_owner_id !== req.user.id) return sendError(res, 404, 'Seat not found');
  const { seatRole, isActive } = req.body || {};
  if (seatRole !== undefined && !SEAT_ROLES.includes(seatRole)) return sendError(res, 422, `seatRole must be one of ${SEAT_ROLES.join(', ')}`);

  const sets = [];
  const params = [];
  if (seatRole !== undefined) { sets.push('seat_role=?'); params.push(seatRole); }
  if (isActive !== undefined) { sets.push('is_active=?'); params.push(isActive ? 1 : 0); }
  if (sets.length) {
    params.push(seat.id);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id=?`).run(...params);
    // Deactivating a seat must also kill any live session for it immediately —
    // otherwise a seat already logged in stays fully active until their
    // cookie naturally expires, up to 7 days later.
    if (isActive === false) db.prepare('DELETE FROM sessions WHERE acting_seat_id=?').run(seat.id);
  }
  writeAudit(req, { userId: req.actorId, action: 'ORG_MEMBER_UPDATE', details: `Updated seat #${seat.id}`, entityType: 'user', entityId: seat.id });
  const updated = db.prepare('SELECT id, email, display_name, seat_role, is_active, created_at FROM users WHERE id=?').get(seat.id);
  res.json({ seat: updated });
});

// =============================================================================
// 3. Public
// =============================================================================

// gstack review F27 (fixed independently on both branches — this keeps
// main's version, which additionally covers the cache-miss-stampede case):
// no s-maxage meant Cloudflare (sitting in front of Render) treated every
// hit as uncacheable and forwarded it straight through. s-maxage is what
// Cloudflare actually honors at the edge; max-age=0 keeps browsers always
// revalidating so a signed-out visitor never sees minutes-stale numbers;
// stale-while-revalidate covers the gap so a cache miss doesn't block on
// origin while it refreshes.
const PUBLIC_JSON_CACHE = 'public, max-age=0, s-maxage=30, stale-while-revalidate=60';

app.get('/api/public/lanes', (req, res) => {
  res.set('Cache-Control', PUBLIC_JSON_CACHE).json({ lanes: unifiedLanes });
});

app.get('/api/public/carriers', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, p.company_name, p.rating_avg, p.completed_jobs, p.fleet_size, p.coverage_zones, u.tier
       FROM users u JOIN profiles p ON p.user_id = u.id
       WHERE u.role='CARRIER' AND u.is_verified=1
       ORDER BY p.rating_avg DESC`
    )
    .all();
  res.set('Cache-Control', PUBLIC_JSON_CACHE).json({
    carriers: rows.map((r) => ({
      id: r.id,
      name: r.company_name,
      rating: r.rating_avg,
      completedJobs: r.completed_jobs,
      fleetSize: r.fleet_size,
      coverageZones: r.coverage_zones,
      tier: r.tier,
      licenceStatus: 'VERIFIED',
    })),
  });
});

app.get('/api/public/market', (req, res) => {
  const { commission_rate_bps } = getSettings();
  const openJobs = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE status='OPEN'`).get().c;
  const avgDrayageAED = Math.round(unifiedLanes.reduce((s, l) => s + l.basePriceAed, 0) / unifiedLanes.length);
  const containersPerDay = 300;
  res.set('Cache-Control', PUBLIC_JSON_CACHE).json({
    market: {
      teu2024: 15200000,
      containersPerDay,
      avgDrayageAED,
      takeRate: `${(commission_rate_bps / 100).toFixed(1)}%`,
      annualSpend: Math.round(avgDrayageAED * containersPerDay * 365),
      openJobsNow: openJobs,
    },
  });
});

// =============================================================================
// 4. Jobs & the marketplace
// =============================================================================

const BID_SORT_COLUMNS = {
  date_desc: 'b.created_at DESC',
  date_asc: 'b.created_at ASC',
  price_desc: 'b.amount_aed DESC',
  price_asc: 'b.amount_aed ASC',
};

app.get('/api/bids/mine', auth(['CARRIER']), (req, res) => {
  const { limit, offset, sort, q } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
  const off = Math.max(0, Number(offset) || 0);
  const orderBy = BID_SORT_COLUMNS[sort] || BID_SORT_COLUMNS.date_desc;
  let where = 'b.carrier_id = ?';
  const params = [req.user.id];
  if (q && q.trim()) {
    where += ' AND (j.job_code LIKE ? OR j.delivery_address LIKE ?)';
    const needle = `%${q.trim()}%`;
    params.push(needle, needle);
  }
  const total = db.prepare(`SELECT COUNT(*) c FROM bids b JOIN jobs j ON j.id = b.job_id WHERE ${where}`).get(...params).c;
  const bids = db
    .prepare(
      `SELECT b.*, j.job_code, j.pickup_terminal, j.delivery_area, j.delivery_address, j.status as job_status, sp.rating_avg as shipper_rating
       FROM bids b JOIN jobs j ON j.id = b.job_id
       LEFT JOIN profiles sp ON sp.user_id = j.shipper_id
       WHERE ${where}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    )
    .all(...params, lim, off);
  res.json({ bids, total, limit: lim, offset: off });
});

app.post('/api/bids/:id/withdraw', auth(['CARRIER']), (req, res) => {
  const bid = db.prepare('SELECT * FROM bids WHERE id=?').get(req.params.id);
  if (!bid) return sendError(res, 404, 'Bid not found');
  if (bid.carrier_id !== req.user.id) return sendError(res, 403, 'Not your bid');
  if (bid.status !== 'PENDING') return sendError(res, 400, 'Only a pending bid can be withdrawn');
  db.prepare(`UPDATE bids SET status='WITHDRAWN', updated_at=datetime('now') WHERE id=?`).run(bid.id);
  writeAudit(req, { userId: req.actorId, action: 'BID_WITHDRAW', details: `Withdrew bid #${bid.id}`, entityType: 'bid', entityId: bid.id, beforeState: 'PENDING', afterState: 'WITHDRAWN' });
  const updated = db.prepare('SELECT * FROM bids WHERE id=?').get(bid.id);
  res.json({ ok: true, bid: updated });
});

// Sort whitelist — never interpolate the client's `sort` string directly
// into ORDER BY (that's a SQL-injection surface even with prepared
// statements, since placeholders can't parameterize identifiers/direction).
const JOB_SORT_COLUMNS = {
  date_desc: 'jobs.created_at DESC',
  date_asc: 'jobs.created_at ASC',
  price_desc: 'COALESCE(jobs.agreed_price_aed, jobs.max_budget_aed) DESC',
  price_asc: 'COALESCE(jobs.agreed_price_aed, jobs.max_budget_aed) ASC',
  deadline_asc: 'jobs.deadline ASC',
  deadline_desc: 'jobs.deadline DESC',
};

app.get('/api/jobs', auth(), (req, res) => {
  const { status, limit, offset, mine, sort, q, equipmentType } = req.query;
  // gstack review F12: negative limit passed through to SQLite's LIMIT
  // clause unclamped (LIMIT -1 means "no limit" in SQLite) — main's `mine`
  // param (F19, a different/better fix than the client-side limit:200 bump
  // this branch used) doesn't touch this, so both fixes are needed here.
  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
  const off = Math.max(0, Number(offset) || 0);
  let where = '1=1';
  const params = [];
  if (req.user.role === 'SHIPPER') {
    where = 'shipper_id = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'CARRIER') {
    // mine=1 scopes to jobs actually awarded to this carrier, regardless of
    // status — used by the won-jobs list, which has no use for the flood of
    // other shippers' OPEN jobs that the default (bidding) view mixes in and
    // that can push a carrier's own older awarded jobs past the page limit.
    where = mine ? 'carrier_id = ?' : "(status = 'OPEN' OR carrier_id = ?)";
    params.push(req.user.id);
  }
  if (status) {
    // Comma-separated list support (e.g. "AWARDED,PICKED_UP,IN_TRANSIT") —
    // added so WonJobs' "active" set (several statuses at once) can use
    // real server-side pagination instead of over-fetching everything and
    // filtering client-side. Still fully parameterized either way.
    const statuses = String(status).split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length) {
      where += ` AND status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }
  }
  if (equipmentType && EQUIPMENT_TYPES.includes(equipmentType)) {
    where += ' AND equipment_type = ?';
    params.push(equipmentType);
  }
  // Search — job code, delivery address, notes, terminal/area. LIKE against
  // a handful of TEXT columns is plenty at this table size; a real search
  // index would only start mattering at a scale this app isn't at yet.
  if (q && q.trim()) {
    where += ' AND (job_code LIKE ? OR delivery_address LIKE ? OR notes LIKE ? OR pickup_terminal LIKE ? OR delivery_area LIKE ?)';
    const needle = `%${q.trim()}%`;
    params.push(needle, needle, needle, needle, needle);
  }
  const orderBy = JOB_SORT_COLUMNS[sort] || JOB_SORT_COLUMNS.date_desc;

  // Total count for real pagination (page X of Y), not just "was there a
  // next page" — same WHERE, no LIMIT/OFFSET, params array cloned before
  // the LIMIT/OFFSET values are appended for the row query below.
  const total = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE ${where}`).get(...params).c;

  const rowParams = [...params, lim, off];
  // Ratings-on-rows: a shipper deciding whether to award, or a carrier
  // scanning open loads, previously had no rating signal without opening
  // the job — the rating only ever showed on the public carrier directory.
  // LEFT JOIN (not INNER) because a job in DRAFT/OPEN may have no carrier
  // yet, and a shipper always has a profile but the join must not drop the
  // job row if either side is briefly missing.
  const jobs = db
    .prepare(
      `SELECT jobs.*, sp.rating_avg as shipper_rating, cp.rating_avg as carrier_rating
       FROM jobs
       LEFT JOIN profiles sp ON sp.user_id = jobs.shipper_id
       LEFT JOIN profiles cp ON cp.user_id = jobs.carrier_id
       WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    )
    .all(...rowParams);
  res.json({ jobs, total, limit: lim, offset: off });
});

// Shared by POST /api/jobs and the CSV-import loop in POST /api/jobs/import
// below, so both paths validate and insert identically — throws
// { status, message } (matching sendError's shape) on any validation
// failure instead of writing to res directly, so the caller decides whether
// that's a single 400 or one row in a bulk-import report.
function createJobFromBody(b, req) {
  const required = ['pickupTerminal', 'deliveryArea', 'deliveryAddress', 'readyAt', 'deadline'];
  for (const f of required) if (!b[f]) throw { status: 400, message: `${f} is required` };

  const equipmentType = EQUIPMENT_TYPES.includes(b.equipmentType) ? b.equipmentType : 'CONTAINER_CHASSIS';
  const needsContainer = CONTAINER_EQUIPMENT.includes(equipmentType);

  let containerSize = 'N/A';
  let containerType = 'GENERAL';
  if (needsContainer) {
    if (!b.containerSize || !CONTAINER_SIZES.includes(b.containerSize)) throw { status: 400, message: 'Invalid containerSize' };
    if (!b.containerType || !CONTAINER_TYPES.includes(b.containerType)) throw { status: 400, message: 'Invalid containerType' };
    containerSize = b.containerSize;
    containerType = b.containerType;
  } else if (!b.notes) {
    throw { status: 400, message: 'cargoDescription (notes) is required for non-container equipment' };
  }

  const containerCount = Math.max(1, Number(b.containerCount) || 1);
  const truckCount = Math.max(1, Number(b.truckCount) || 1);

  // Optional map pin (see LocationPicker.jsx) — reject silently-wrong values
  // rather than trusting whatever the client sends, same as any other field.
  const pickupLat = b.pickupLat !== undefined ? Number(b.pickupLat) : null;
  const pickupLng = b.pickupLng !== undefined ? Number(b.pickupLng) : null;
  if ((pickupLat !== null || pickupLng !== null) && !isValidUaeLatLng(pickupLat, pickupLng)) {
    throw { status: 400, message: 'pickupLat/pickupLng must be valid UAE coordinates' };
  }
  const deliveryLat = b.deliveryLat !== undefined ? Number(b.deliveryLat) : null;
  const deliveryLng = b.deliveryLng !== undefined ? Number(b.deliveryLng) : null;
  if ((deliveryLat !== null || deliveryLng !== null) && !isValidUaeLatLng(deliveryLat, deliveryLng)) {
    throw { status: 400, message: 'deliveryLat/deliveryLng must be valid UAE coordinates' };
  }

  let code = jobCode();
  while (db.prepare('SELECT 1 FROM jobs WHERE job_code=?').get(code)) code = jobCode();

  const result = db
    .prepare(
      `INSERT INTO jobs (job_code, shipper_id, contract_lane_id, template_id, container_size, container_type, container_number,
         pickup_terminal, delivery_area, delivery_address, ready_at, deadline, max_budget_aed, status, escrow_status,
         requires_reefer, requires_hazmat, free_time_days, demurrage_rate_aed, notes, equipment_type, container_count, truck_count,
         pickup_lat, pickup_lng, pickup_address_detail, delivery_lat, delivery_lng, delivery_address_detail)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'OPEN','PENDING',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      code,
      req.user.id,
      b.contractLaneId || null,
      b.templateId || null,
      containerSize,
      containerType,
      b.containerNumber || null,
      b.pickupTerminal,
      b.deliveryArea,
      b.deliveryAddress,
      b.readyAt,
      b.deadline,
      b.maxBudgetAed || null,
      b.requiresReefer ? 1 : 0,
      b.requiresHazmat ? 1 : 0,
      b.freeTimeDays ?? 5,
      b.demurrageRateAed ?? 400,
      b.notes || null,
      equipmentType,
      containerCount,
      truckCount,
      pickupLat,
      pickupLng,
      b.pickupAddressDetail || null,
      deliveryLat,
      deliveryLng,
      b.deliveryAddressDetail || null
    );
  const jobId = Number(result.lastInsertRowid);
  writeAudit(req, { userId: req.actorId, action: 'JOB_CREATE', details: `${code} posted`, entityType: 'job', entityId: jobId, afterState: 'OPEN' });
  return db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
}

app.post('/api/jobs', auth(['SHIPPER']), writeLimiter, requireSeatRole(['OPS']), (req, res) => {
  try {
    const job = createJobFromBody(req.body || {}, req);
    res.status(201).json({ job });
  } catch (e) {
    if (e.status) return sendError(res, e.status, e.message);
    throw e;
  }
});

// CSV job import — a shipper with recurring lanes posts many jobs at once
// instead of the create form one row at a time. Parsing happens client-side
// (web/src/lib/csv.js) so this route just takes an array of the same shape
// POST /api/jobs takes; each row is independent (no all-or-nothing
// transaction) so one bad row doesn't sink an otherwise-good batch — the
// response reports per-row success/failure for the UI to show inline.
const JOB_IMPORT_MAX_ROWS = 200;
app.post('/api/jobs/import', auth(['SHIPPER']), writeLimiter, requireSeatRole(['OPS']), (req, res) => {
  const rows = (req.body || {}).jobs;
  if (!Array.isArray(rows) || rows.length === 0) return sendError(res, 400, 'jobs must be a non-empty array');
  if (rows.length > JOB_IMPORT_MAX_ROWS) return sendError(res, 400, `Cannot import more than ${JOB_IMPORT_MAX_ROWS} jobs at once`);

  const results = rows.map((row, i) => {
    try {
      const job = createJobFromBody(row || {}, req);
      return { row: i + 1, ok: true, jobCode: job.job_code, jobId: job.id };
    } catch (e) {
      return { row: i + 1, ok: false, error: e.message || 'Unknown error' };
    }
  });
  const created = results.filter((r) => r.ok).length;
  res.status(201).json({ results, created, failed: results.length - created });
});

// Job editing — previously the only options after posting were view or
// cancel, so a typo in the address meant cancelling and re-losing every
// bid. Editable only while OPEN and with no live (PENDING) bid yet — once
// a carrier has bid against a specific spec, changing that spec out from
// under them is exactly the bait-and-switch this restriction exists to
// prevent. Deliberately excludes equipmentType/containerSize/containerType:
// those are structural (a REEFER_TRUCK job becoming a TRIPPER job is a
// different job, not an edit) and stay fixed for the job's lifetime.
const JOB_EDITABLE_FIELDS = {
  pickupTerminal: 'pickup_terminal',
  deliveryArea: 'delivery_area',
  deliveryAddress: 'delivery_address',
  containerNumber: 'container_number',
  readyAt: 'ready_at',
  deadline: 'deadline',
  maxBudgetAed: 'max_budget_aed',
  requiresReefer: 'requires_reefer',
  requiresHazmat: 'requires_hazmat',
  freeTimeDays: 'free_time_days',
  demurrageRateAed: 'demurrage_rate_aed',
  notes: 'notes',
  containerCount: 'container_count',
  truckCount: 'truck_count',
  pickupLat: 'pickup_lat',
  pickupLng: 'pickup_lng',
  pickupAddressDetail: 'pickup_address_detail',
  deliveryLat: 'delivery_lat',
  deliveryLng: 'delivery_lng',
  deliveryAddressDetail: 'delivery_address_detail',
};
const BOOLEAN_JOB_FIELDS = new Set(['requiresReefer', 'requiresHazmat']);
const COUNT_JOB_FIELDS = new Set(['containerCount', 'truckCount']);

app.patch('/api/jobs/:id', auth(['SHIPPER']), requireSeatRole(['OPS']), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (job.shipper_id !== req.user.id) return sendError(res, 403, 'Not your job');
  if (job.status !== 'OPEN') return sendError(res, 403, 'A job can only be edited while OPEN');
  const hasPendingBid = db.prepare(`SELECT 1 FROM bids WHERE job_id=? AND status='PENDING'`).get(job.id);
  if (hasPendingBid) return sendError(res, 403, 'Cannot edit a job that already has a pending bid — withdraw/reject bids first, or cancel and repost');

  const b = req.body || {};
  if ((b.pickupLat !== undefined || b.pickupLng !== undefined) && !isValidUaeLatLng(Number(b.pickupLat), Number(b.pickupLng))) {
    return sendError(res, 400, 'pickupLat/pickupLng must be valid UAE coordinates');
  }
  if ((b.deliveryLat !== undefined || b.deliveryLng !== undefined) && !isValidUaeLatLng(Number(b.deliveryLat), Number(b.deliveryLng))) {
    return sendError(res, 400, 'deliveryLat/deliveryLng must be valid UAE coordinates');
  }
  const sets = [];
  const params = [];
  const beforeState = {};
  for (const [key, column] of Object.entries(JOB_EDITABLE_FIELDS)) {
    if (b[key] === undefined) continue;
    let value = b[key];
    if (BOOLEAN_JOB_FIELDS.has(key)) value = value ? 1 : 0;
    if (COUNT_JOB_FIELDS.has(key)) value = Math.max(1, Number(value) || 1);
    beforeState[column] = job[column];
    sets.push(`${column}=?`);
    params.push(value);
  }
  if (!sets.length) return sendError(res, 400, 'No editable fields supplied');

  sets.push(`updated_at=datetime('now')`);
  params.push(job.id);
  db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id=?`).run(...params);
  writeAudit(req, {
    userId: req.actorId,
    action: 'JOB_EDIT',
    details: `${job.job_code} edited: ${Object.keys(beforeState).join(', ')}`,
    entityType: 'job',
    entityId: job.id,
    beforeState: JSON.stringify(beforeState),
    afterState: JSON.stringify(Object.fromEntries(Object.entries(JOB_EDITABLE_FIELDS).filter(([k]) => b[k] !== undefined).map(([k, col]) => [col, b[k]]))),
  });
  const updated = db.prepare('SELECT * FROM jobs WHERE id=?').get(job.id);
  res.json({ job: updated });
});

app.get('/api/jobs/:id', auth(), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (!canViewJob(job, req.user)) return sendError(res, 403, 'Not permitted to view this job');

  let bids = db
    .prepare(
      `SELECT bids.*, cp.rating_avg as carrier_rating, cp.company_name as carrier_company
       FROM bids LEFT JOIN profiles cp ON cp.user_id = bids.carrier_id
       WHERE job_id=? ORDER BY amount_aed ASC`
    )
    .all(job.id);
  const isOwnerShipper = req.user.id === job.shipper_id;
  const isAdmin = req.user.role === 'ADMIN';
  if (job.status === 'OPEN' && !isOwnerShipper && !isAdmin) {
    bids = bids.map((b) =>
      b.carrier_id === req.user.id
        ? b
        : { ...b, amount_aed: null, eta_minutes: null, driver_name: null, notes: null, carrier_company: null, masked: true }
    );
  }

  const shipperProfile = db.prepare('SELECT rating_avg FROM profiles WHERE user_id=?').get(job.shipper_id);
  const jobWithRating = { ...job, shipper_rating: shipperProfile ? shipperProfile.rating_avg : null };

  const documents = isParticipantOrBidder(job, req.user) ? db.prepare('SELECT * FROM job_documents WHERE job_id=? ORDER BY created_at').all(job.id) : [];
  const payout = db.prepare('SELECT * FROM payouts WHERE job_id=?').get(job.id) || null;
  res.json({ job: jobWithRating, bids, documents, payout });
});

app.post('/api/jobs/:id/bids', auth(['CARRIER']), writeLimiter, requireSeatRole(['OPS']), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (job.status !== 'OPEN') return sendError(res, 403, 'Job is not open for bidding.');
  if (!req.user.profile || !req.user.profile.rating_avg || !db.prepare('SELECT is_verified FROM users WHERE id=?').get(req.user.id).is_verified) {
    return sendError(res, 403, 'Carrier verification required to bid.');
  }
  const b = req.body || {};
  const amount = Number(b.amountAed);
  const eta = Number(b.etaMinutes);
  if (!amount || amount <= 0) return sendError(res, 400, 'amountAed must be a positive number');
  if (!eta || eta < 1 || eta > 600) return sendError(res, 400, 'etaMinutes must be between 1 and 600');
  if (!b.driverName) return sendError(res, 400, 'driverName is required');
  const driverPhone = normalizeUaeMobile(b.driverPhone);
  if (!driverPhone) return sendError(res, 400, 'driverPhone is required and must be a valid UAE mobile number');

  // gstack review F5: without this a carrier could script unlimited bids on
  // the same job (notification spam, price signaling). Checked proactively
  // for a clean 409; idx_bids_one_pending_per_carrier (server/db.js) is the
  // real guarantee against the race between this check and the insert.
  const alreadyBidding = db.prepare(`SELECT 1 FROM bids WHERE job_id=? AND carrier_id=? AND status='PENDING'`).get(job.id, req.user.id);
  if (alreadyBidding) return sendError(res, 409, 'You already have a pending bid on this job — withdraw it before placing another.');

  let result;
  try {
    result = db
      .prepare('INSERT INTO bids (job_id, carrier_id, amount_aed, eta_minutes, truck_type, driver_name, driver_phone, notes) VALUES (?,?,?,?,?,?,?,?)')
      .run(job.id, req.user.id, amount, eta, b.truckType || null, b.driverName, driverPhone, b.notes || null);
  } catch (e) {
    if (e.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(e.message)) {
      return sendError(res, 409, 'You already have a pending bid on this job — withdraw it before placing another.');
    }
    throw e;
  }
  const bidId = Number(result.lastInsertRowid);
  writeAudit(req, { userId: req.actorId, action: 'BID_CREATE', details: `Bid AED ${amount} on ${job.job_code}`, entityType: 'bid', entityId: bidId });
  notify(job.shipper_id, 'New bid received', `${req.user.profile.company_name} bid AED ${amount} on ${job.job_code}.`, job.id, 'bid');
  const bid = db.prepare('SELECT * FROM bids WHERE id=?').get(bidId);
  res.status(201).json({ bid });
});

app.post('/api/jobs/:id/rate', auth(), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (!canViewJob(job, req.user)) return sendError(res, 403, 'Not permitted');
  const b = req.body || {};
  const result = estimateRate({
    terminal: job.pickup_terminal,
    area: job.delivery_area,
    weightTons: b.weightTons,
    urgency: b.urgency,
    quantity: Math.max(job.container_count || 1, job.truck_count || 1),
  });
  res.json(result);
});

app.post('/api/jobs/:id/optimize-route', auth(), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (!canViewJob(job, req.user)) return sendError(res, 403, 'Not permitted');
  const b = req.body || {};
  const result = optimizeRoute({
    terminal: job.pickup_terminal,
    area: job.delivery_area,
    waypoints: b.waypoints || [],
    priority: b.priority || 'balanced',
  });
  res.json(result);
});

app.post('/api/jobs/:id/award', auth(['SHIPPER']), requireSeatRole(['OPS']), (req, res) => {
  const jobId = Number(req.params.id);
  const { bidId } = req.body || {};
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  if (!job) return sendError(res, 404, 'Job not found');
  if (job.shipper_id !== req.user.id) return sendError(res, 403, 'Not your job');

  try {
    db.exec('BEGIN');
    const freshJob = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
    if (freshJob.status !== 'OPEN') {
      db.exec('ROLLBACK');
      return sendError(res, 409, 'Job has already been awarded');
    }
    const bid = db.prepare('SELECT * FROM bids WHERE id=? AND job_id=?').get(bidId, jobId);
    if (!bid || bid.status !== 'PENDING') {
      db.exec('ROLLBACK');
      return sendError(res, 404, 'Bid not found or no longer available');
    }
    const { commission_rate_bps } = getSettings();
    const gross = bid.amount_aed;
    const fee = Math.round((gross * commission_rate_bps) / 10000);
    const net = gross - fee;

    db.prepare(
      `UPDATE jobs SET status='AWARDED', awarded_bid_id=?, carrier_id=?, agreed_price_aed=?, escrow_status='HELD',
         assigned_driver_name=?, assigned_driver_phone=?, updated_at=datetime('now') WHERE id=?`
    ).run(bid.id, bid.carrier_id, gross, bid.driver_name, bid.driver_phone, jobId);
    db.prepare(`UPDATE bids SET status='ACCEPTED', updated_at=datetime('now') WHERE id=?`).run(bid.id);
    db.prepare(`UPDATE bids SET status='REJECTED', updated_at=datetime('now') WHERE job_id=? AND id!=?`).run(jobId, bid.id);
    const payoutResult = db
      .prepare('INSERT INTO payouts (job_id, carrier_id, gross_aed, platform_fee_aed, net_aed, status, release_type) VALUES (?,?,?,?,?,\'PENDING\',\'MANUAL\')')
      .run(jobId, bid.carrier_id, gross, fee, net);

    writeAudit(req, {
      userId: req.actorId,
      action: 'AWARD',
      details: `${freshJob.job_code} awarded to carrier #${bid.carrier_id} at AED ${gross}`,
      entityType: 'job',
      entityId: jobId,
      beforeState: 'OPEN',
      afterState: 'AWARDED',
    });
    notify(bid.carrier_id, 'Bid accepted', `Your bid on ${freshJob.job_code} was accepted. Escrow is HELD.`, jobId, 'award');
    const rejected = db.prepare('SELECT carrier_id FROM bids WHERE job_id=? AND id!=?').all(jobId, bid.id);
    for (const r of rejected) notify(r.carrier_id, 'Bid not selected', `Another carrier was awarded ${freshJob.job_code}.`, jobId, 'award');
    void payoutResult;
    db.exec('COMMIT');
    const job2 = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
    // Driver messaging order per docs/STRATEGY.md is WhatsApp -> SMS -> in-app;
    // in-app already fired above via notify() regardless of whether this
    // sends. Fire-and-forget, after commit, never inside the transaction —
    // see server/lib/whatsapp.js for why this safely no-ops until Meta
    // approval lands (TODO-4).
    notifyDriverAsync({
      to: job2.assigned_driver_phone,
      template: 'job_awarded_pickup_details',
      params: [job2.assigned_driver_name || 'Driver', job2.job_code, job2.pickup_terminal],
    });
    res.json({ ok: true, job: job2 });
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch (_) {}
    sendError(res, 500, 'Award failed');
  }
});

const TRANSITIONS = {
  SHIPPER: { OPEN: ['CANCELLED'], DRAFT: ['CANCELLED'], AWARDED: ['CANCELLED'], DELIVERED: ['COMPLETED'] },
  CARRIER: { AWARDED: ['PICKED_UP', 'CANCELLED'], PICKED_UP: ['IN_TRANSIT'], IN_TRANSIT: ['DELIVERED'] },
};

// gstack review F7: admin previously got `{ [job.status]: [next] }` for its
// transition table — i.e. whatever was requested was "allowed" by
// definition, making the guard vacuous (any job could jump straight to
// COMPLETED, which releases escrow). Admin now gets exactly what a
// legitimate SHIPPER or CARRIER could have done on this job — real power to
// unstick a job or force a status a party is refusing to set, without a
// blank check to any status from any status.
const ADMIN_TRANSITIONS = {};
for (const roleMap of [TRANSITIONS.SHIPPER, TRANSITIONS.CARRIER]) {
  for (const [from, tos] of Object.entries(roleMap)) {
    ADMIN_TRANSITIONS[from] = [...new Set([...(ADMIN_TRANSITIONS[from] || []), ...tos])];
  }
}
TRANSITIONS.ADMIN = ADMIN_TRANSITIONS;

app.patch('/api/jobs/:id/status', auth(), requireSeatRole(['OPS']), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  const { status: next } = req.body || {};
  const role = req.user.role;
  const isShipperOwner = role === 'SHIPPER' && job.shipper_id === req.user.id;
  const isCarrierOwner = role === 'CARRIER' && job.carrier_id === req.user.id;
  if (!isShipperOwner && !isCarrierOwner && role !== 'ADMIN') return sendError(res, 403, 'Not a participant on this job');
  if (job.status === 'DISPUTED') return sendError(res, 403, 'Job is under dispute — escrow frozen');

  const allowedFor = TRANSITIONS[role] || {};
  const allowedNext = allowedFor[job.status] || [];
  if (!allowedNext.includes(next)) return sendError(res, 403, `Illegal state transition: ${job.status} -> ${next}`);

  db.prepare(`UPDATE jobs SET status=?, updated_at=datetime('now') WHERE id=?`).run(next, job.id);

  if (next === 'CANCELLED' && ['HELD', 'FUNDED'].includes(job.escrow_status)) {
    db.prepare(`UPDATE jobs SET escrow_status='RELEASED' WHERE id=?`).run(job.id);
    db.prepare(`UPDATE payouts SET status='CANCELLED' WHERE job_id=?`).run(job.id);
  }
  if (next === 'COMPLETED' && job.escrow_status !== 'RELEASED') {
    db.prepare(`UPDATE jobs SET escrow_status='RELEASED', payout_released_at=datetime('now') WHERE id=?`).run(job.id);
    db.prepare(`UPDATE payouts SET status='RELEASED', release_type='MANUAL', released_at=datetime('now'), sla_deadline=datetime('now', '+48 hours') WHERE job_id=?`).run(job.id);
    issueInvoice(db, job.id);
    notify(job.carrier_id, 'Funds on the way', `${job.job_code} was confirmed delivered. Payout released.`, job.id, 'payout');
  }

  writeAudit(req, {
    userId: req.actorId,
    action: 'STATUS',
    details: `${job.job_code}: ${job.status} -> ${next}`,
    entityType: 'job',
    entityId: job.id,
    beforeState: job.status,
    afterState: next,
  });
  const other = req.user.id === job.shipper_id ? job.carrier_id : job.shipper_id;
  notify(other, 'Job status updated', `${job.job_code} is now ${next}.`, job.id, 'status');

  const updated = db.prepare('SELECT * FROM jobs WHERE id=?').get(job.id);
  res.json({ job: updated });
});

// TODO-2: reassigning the driver on an awarded job is deliberately its own
// audited action, not a silent field edit — a swapped driver phone with no
// trail is exactly the container-theft vector (S1) this binding exists to
// close. "Re-verification" here means re-supplying and re-validating both
// fields, the same bar as the original bid, not just patching one field.
app.patch('/api/jobs/:id/driver', auth(['CARRIER']), requireSeatRole(['OPS']), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (job.carrier_id !== req.user.id) return sendError(res, 403, 'Not your job');
  if (!['AWARDED', 'PICKED_UP', 'IN_TRANSIT'].includes(job.status)) {
    return sendError(res, 403, 'Driver can only be reassigned before delivery');
  }
  const { driverName, driverPhone } = req.body || {};
  if (!driverName) return sendError(res, 400, 'driverName is required');
  const normalizedPhone = normalizeUaeMobile(driverPhone);
  if (!normalizedPhone) return sendError(res, 400, 'driverPhone is required and must be a valid UAE mobile number');

  db.prepare(`UPDATE jobs SET assigned_driver_name=?, assigned_driver_phone=?, updated_at=datetime('now') WHERE id=?`).run(
    driverName,
    normalizedPhone,
    job.id
  );
  writeAudit(req, {
    userId: req.actorId,
    action: 'DRIVER_REASSIGN',
    details: `${job.job_code}: driver changed from ${job.assigned_driver_name || 'unset'} (${job.assigned_driver_phone || 'unset'}) to ${driverName} (${normalizedPhone})`,
    entityType: 'job',
    entityId: job.id,
    beforeState: job.assigned_driver_phone || 'unset',
    afterState: normalizedPhone,
  });
  notify(job.shipper_id, 'Driver reassigned', `${job.job_code}: the assigned driver was changed to ${driverName}.`, job.id, 'status');
  const updated = db.prepare('SELECT * FROM jobs WHERE id=?').get(job.id);
  res.json({ job: updated });
});

app.post('/api/jobs/:id/pod', auth(['CARRIER']), requireSeatRole(['OPS']), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (job.carrier_id !== req.user.id) return sendError(res, 403, 'Not your job');
  if (job.status !== 'IN_TRANSIT') return sendError(res, 403, 'Job must be IN_TRANSIT to submit proof of delivery');

  const doc = (req.body || {}).document;
  // Validate/save any uploaded file *before* mutating job status, so a bad
  // upload 400s cleanly instead of leaving the job DELIVERED with no POD.
  let storagePath = null;
  let mimeType = null;
  if (doc && doc.fileBase64) {
    try {
      ({ storagePath, mimeType } = saveUploadedFile(job.id, doc.mimeType, doc.fileBase64));
    } catch (e) {
      return sendError(res, e.status || 400, e.message || 'Upload failed');
    }
  }
  db.prepare(`UPDATE jobs SET status='DELIVERED', delivered_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(job.id);
  if (doc && (doc.fileUrl || storagePath)) {
    db.prepare('INSERT INTO job_documents (job_id, uploader_id, doc_type, title, file_url, storage_path, mime_type) VALUES (?,?,?,?,?,?,?)').run(
      job.id,
      req.actorId,
      DOC_TYPES.includes(doc.docType) ? doc.docType : 'POD',
      doc.title || 'Proof of Delivery',
      doc.fileUrl || storagePath || '',
      storagePath,
      mimeType
    );
  }
  writeAudit(req, {
    userId: req.actorId,
    action: 'STATUS',
    details: `${job.job_code}: POD submitted`,
    entityType: 'job',
    entityId: job.id,
    beforeState: 'IN_TRANSIT',
    afterState: 'DELIVERED',
  });
  const { auto_release_hours } = getSettings();
  notify(job.shipper_id, 'Proof of delivery submitted', `Confirm delivery on ${job.job_code}, or it auto-releases in ${auto_release_hours}h.`, job.id, 'status');
  const updated = db.prepare('SELECT * FROM jobs WHERE id=?').get(job.id);
  res.json({ job: updated });
});

// Self-serve dispute filing — previously a shipper or carrier with an
// actual problem had no in-app way to raise it; only an admin could open a
// dispute (POST /api/admin/disputes below), which meant reaching one was
// entirely outside the product (WhatsApp/support). Only the job's own
// shipper or carrier can file, only on a job where there's actually
// something to dispute (awarded through completed — not OPEN, which has no
// counterparty commitment yet, and not already CANCELLED/DISPUTED).
const DISPUTABLE_STATUSES = ['AWARDED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
app.post('/api/jobs/:id/dispute', auth(['SHIPPER', 'CARRIER']), requireSeatRole(['OPS']), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  const isShipperOwner = req.user.role === 'SHIPPER' && job.shipper_id === req.user.id;
  const isCarrierOwner = req.user.role === 'CARRIER' && job.carrier_id === req.user.id;
  if (!isShipperOwner && !isCarrierOwner) return sendError(res, 403, 'Not a participant on this job');
  if (!DISPUTABLE_STATUSES.includes(job.status)) return sendError(res, 403, `Cannot dispute a job in ${job.status} status`);
  const { reason } = req.body || {};
  if (!reason || !reason.trim()) return sendError(res, 400, 'reason is required');

  const result = db.prepare('INSERT INTO disputes (job_id, opened_by, reason, status) VALUES (?,?,?,\'OPEN\')').run(job.id, req.user.id, reason.trim());
  db.prepare(`UPDATE jobs SET status='DISPUTED', escrow_status='DISPUTED', updated_at=datetime('now') WHERE id=?`).run(job.id);
  writeAudit(req, {
    userId: req.actorId,
    action: 'DISPUTE_OPEN',
    details: reason.trim(),
    entityType: 'job',
    entityId: job.id,
    beforeState: job.status,
    afterState: 'DISPUTED',
  });
  const other = req.user.id === job.shipper_id ? job.carrier_id : job.shipper_id;
  notify(other, 'Dispute opened', `${job.job_code}: a dispute was opened by the counterparty. Escrow is frozen pending admin review.`, job.id, 'dispute');
  notifyAdmins('New dispute filed', `${job.job_code}: filed by ${req.actorLabel}. Escrow frozen, awaiting review.`, job.id);
  const dispute = db.prepare('SELECT * FROM disputes WHERE id=?').get(Number(result.lastInsertRowid));
  res.status(201).json({ dispute });
});

app.get('/api/jobs/:id/track', auth(), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (!canViewJob(job, req.user)) return sendError(res, 403, 'Not permitted');

  const shipper = db.prepare('SELECT company_name FROM profiles WHERE user_id=?').get(job.shipper_id);
  const carrier = job.carrier_id ? db.prepare('SELECT company_name FROM profiles WHERE user_id=?').get(job.carrier_id) : null;
  const { auto_release_hours } = getSettings();

  const statusIndex = STATUS_ORDER.indexOf(job.status);
  const canProgress = req.user.role === 'CARRIER' && req.user.id === job.carrier_id && ['AWARDED', 'PICKED_UP', 'IN_TRANSIT'].includes(job.status);

  let demurrageExposure = 0;
  let hoursSinceDelivered = null;
  let autoReleaseAt = null;
  if (job.delivered_at) {
    const deliveredMs = new Date(job.delivered_at.replace(' ', 'T') + 'Z').getTime();
    hoursSinceDelivered = Math.max(0, (Date.now() - deliveredMs) / 3600000);
    const daysSince = hoursSinceDelivered / 24;
    const exceedDays = Math.max(0, Math.ceil(daysSince - job.free_time_days));
    demurrageExposure = exceedDays * job.demurrage_rate_aed;
    autoReleaseAt = new Date(deliveredMs + auto_release_hours * 3600000).toISOString();
  }

  res.json({
    job,
    shipperName: shipper ? shipper.company_name : null,
    carrierName: carrier ? carrier.company_name : null,
    statusIndex,
    canProgress,
    demurrageExposure,
    hoursSinceDelivered,
    autoReleaseAt,
    geofence: {
      pickup: job.pickup_terminal,
      delivery: job.delivery_area,
      atPickup: ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(job.status),
      atDelivery: ['DELIVERED', 'COMPLETED'].includes(job.status),
    },
  });
});

// Backload / reverse-load matching — the "zero deadhead miles" pitch for an
// owner-driver: while hauling job A, surface OPEN jobs that start roughly
// where A is dropping off, so the return leg isn't an empty run. Ranked by
// real distance (haversine on the optional map pins from LocationPicker)
// when both sides have one; falls back to "same emirate" — real UAE
// geography (TERMINAL_EMIRATE/AREA_EMIRATE above), not a guess — when a pin
// is missing, which is the common case since pins are optional.
const BACKLOAD_ELIGIBLE_STATUSES = ['AWARDED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
const BACKLOAD_MAX_DISTANCE_KM = 100;
app.get('/api/jobs/:id/backload-matches', auth(['CARRIER']), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (job.carrier_id !== req.user.id) return sendError(res, 403, 'Not your job');
  if (!BACKLOAD_ELIGIBLE_STATUSES.includes(job.status)) {
    return sendError(res, 403, `Backload matching is only available once a job is ${BACKLOAD_ELIGIBLE_STATUSES.join('/')}`);
  }

  const deliveryEmirate = AREA_EMIRATE[job.delivery_area] || null;
  const candidates = db
    .prepare(
      `SELECT j.*, p.company_name AS shipper_company, p.rating_avg AS shipper_rating
       FROM jobs j LEFT JOIN profiles p ON p.user_id = j.shipper_id
       WHERE j.status='OPEN' AND j.id != ?
       ORDER BY j.created_at DESC LIMIT 200`
    )
    .all(job.id);

  const matches = [];
  for (const c of candidates) {
    let matchType = null;
    let distanceKm = null;
    if (job.delivery_lat != null && job.delivery_lng != null && c.pickup_lat != null && c.pickup_lng != null) {
      const d = haversineKm(job.delivery_lat, job.delivery_lng, c.pickup_lat, c.pickup_lng);
      if (d <= BACKLOAD_MAX_DISTANCE_KM) {
        matchType = 'coords';
        distanceKm = Math.round(d * 10) / 10;
      }
    } else if (deliveryEmirate && TERMINAL_EMIRATE[c.pickup_terminal] === deliveryEmirate) {
      matchType = 'area';
    }
    if (matchType) matches.push({ ...c, matchType, distanceKm });
  }
  matches.sort((a, b) => {
    if (a.matchType === 'coords' && b.matchType === 'coords') return a.distanceKm - b.distanceKm;
    if (a.matchType === 'coords') return -1;
    if (b.matchType === 'coords') return 1;
    return 0;
  });

  res.json({ matches: matches.slice(0, 10) });
});

app.post('/api/jobs/:id/documents', auth(), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (!isParticipantOrBidder(job, req.user)) return sendError(res, 403, 'Not permitted');
  const b = req.body || {};
  if (!b.title || !(b.fileUrl || b.fileBase64)) return sendError(res, 400, 'title and (fileUrl or fileBase64+mimeType) are required');
  let storagePath = null;
  let mimeType = null;
  if (b.fileBase64) {
    try {
      ({ storagePath, mimeType } = saveUploadedFile(job.id, b.mimeType, b.fileBase64));
    } catch (e) {
      return sendError(res, e.status || 400, e.message || 'Upload failed');
    }
  }
  db.prepare('INSERT INTO job_documents (job_id, uploader_id, doc_type, title, file_url, storage_path, mime_type) VALUES (?,?,?,?,?,?,?)').run(
    job.id,
    req.actorId,
    DOC_TYPES.includes(b.docType) ? b.docType : 'OTHER',
    b.title,
    b.fileUrl || storagePath || '',
    storagePath,
    mimeType
  );
  writeAudit(req, { userId: req.actorId, action: 'DOCUMENT_ADD', details: `${b.docType || 'OTHER'} on ${job.job_code}`, entityType: 'job', entityId: job.id });
  res.status(201).json({ ok: true });
});

// Access-controlled file serving: reuses the exact isParticipantOrBidder
// check every other job-scoped route uses, so an uploaded POD/customs doc
// is only readable by the job's shipper, carrier, or a bidding carrier (or
// admin) — never a bare guessable URL.
app.get('/api/jobs/:id/documents/:docId/file', auth(), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (!isParticipantOrBidder(job, req.user)) return sendError(res, 403, 'Not permitted');
  const doc = db.prepare('SELECT * FROM job_documents WHERE id=? AND job_id=?').get(req.params.docId, job.id);
  if (!doc) return sendError(res, 404, 'Document not found');
  if (!doc.storage_path) return res.redirect(doc.file_url);
  const filePath = path.join(UPLOADS_DIR, doc.storage_path);
  if (!filePath.startsWith(UPLOADS_DIR) || !fs.existsSync(filePath)) return sendError(res, 404, 'File not found');
  res.set('Content-Type', doc.mime_type || 'application/octet-stream');
  res.set('Content-Disposition', `inline; filename="${doc.title.replace(/[^\w.-]/g, '_')}"`);
  res.sendFile(filePath);
});

app.post('/api/jobs/:id/rating', auth(), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (!isParticipantOrBidder(job, req.user) || (req.user.id !== job.shipper_id && req.user.id !== job.carrier_id)) {
    return sendError(res, 403, 'Not permitted');
  }
  if (job.status !== 'COMPLETED') return sendError(res, 403, 'Job must be completed before rating');
  const existing = db.prepare('SELECT 1 FROM ratings WHERE job_id=? AND rater_id=?').get(job.id, req.user.id);
  if (existing) return sendError(res, 409, 'You already rated this job');

  const b = req.body || {};
  const score = Number(b.score);
  if (!score || score < 1 || score > 5) return sendError(res, 400, 'score must be 1-5');
  const rateeId = req.user.id === job.shipper_id ? job.carrier_id : job.shipper_id;

  // gstack review F13: the existence check above is racy under concurrent
  // submits — idx_ratings_one_per_rater (server/db.js) is the real
  // guarantee; this just turns a constraint violation into a clean 409
  // instead of a 500.
  try {
    db.prepare('INSERT INTO ratings (job_id, rater_id, ratee_id, score, comment) VALUES (?,?,?,?,?)').run(job.id, req.user.id, rateeId, score, b.comment || null);
  } catch (e) {
    if (e.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(e.message)) {
      return sendError(res, 409, 'You already rated this job');
    }
    throw e;
  }
  const agg = db.prepare('SELECT AVG(score) avg, COUNT(*) n FROM ratings WHERE ratee_id=?').get(rateeId);
  db.prepare('UPDATE profiles SET rating_avg=?, completed_jobs=completed_jobs+1 WHERE user_id=?').run(Math.round(agg.avg * 100) / 100, rateeId);
  writeAudit(req, { userId: req.actorId, action: 'RATING', details: `${score}/5 on ${job.job_code}`, entityType: 'job', entityId: job.id });
  res.status(201).json({ ok: true });
});

app.get('/api/jobs/:id/messages', auth(), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (!isParticipantOrBidder(job, req.user)) return sendError(res, 403, 'Not permitted');
  const messages = db.prepare('SELECT * FROM messages WHERE job_id=? ORDER BY created_at ASC').all(job.id);
  res.json({ messages });
});

app.post('/api/jobs/:id/messages', auth(), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (!isParticipantOrBidder(job, req.user)) return sendError(res, 403, 'Not permitted');
  const { content } = req.body || {};
  if (!content || !content.trim()) return sendError(res, 400, 'content is required');
  const result = db.prepare('INSERT INTO messages (job_id, sender_id, content) VALUES (?,?,?)').run(job.id, req.actorId, content.trim());
  const other = req.user.id === job.shipper_id ? job.carrier_id : job.shipper_id;
  notify(other, 'New message', `New message on ${job.job_code}`, job.id, 'message');
  const message = db.prepare('SELECT * FROM messages WHERE id=?').get(Number(result.lastInsertRowid));
  res.status(201).json({ message });
});

// =============================================================================
// 5. Retention: templates, contracts, analytics, earnings, notifications
// =============================================================================

app.get('/api/templates', auth(['SHIPPER']), (req, res) => {
  const templates = db.prepare('SELECT * FROM templates WHERE shipper_id=? ORDER BY created_at DESC').all(req.user.id);
  res.json({ templates });
});

app.post('/api/templates', auth(['SHIPPER']), (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.pickupTerminal || !b.deliveryArea || !b.deliveryAddress || !b.containerSize) {
    return sendError(res, 400, 'name, pickupTerminal, deliveryArea, deliveryAddress and containerSize are required');
  }
  const result = db
    .prepare(
      `INSERT INTO templates (shipper_id, name, pickup_terminal, delivery_area, delivery_address, container_size, container_type, cadence, notes)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(req.user.id, b.name, b.pickupTerminal, b.deliveryArea, b.deliveryAddress, b.containerSize, b.containerType || 'DRY', b.cadence || 'ONCE', b.notes || null);
  const template = db.prepare('SELECT * FROM templates WHERE id=?').get(Number(result.lastInsertRowid));
  res.status(201).json({ template });
});

app.post('/api/templates/:id/rerun', auth(['SHIPPER']), (req, res) => {
  const tpl = db.prepare('SELECT * FROM templates WHERE id=? AND shipper_id=?').get(req.params.id, req.user.id);
  if (!tpl) return sendError(res, 404, 'Template not found');
  let code = jobCode();
  while (db.prepare('SELECT 1 FROM jobs WHERE job_code=?').get(code)) code = jobCode();
  const readyAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const deadline = new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString();
  const result = db
    .prepare(
      `INSERT INTO jobs (job_code, shipper_id, template_id, container_size, container_type, pickup_terminal, delivery_area, delivery_address,
         ready_at, deadline, status, escrow_status, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,'OPEN','PENDING',?)`
    )
    .run(code, req.user.id, tpl.id, tpl.container_size, tpl.container_type, tpl.pickup_terminal, tpl.delivery_area, tpl.delivery_address, readyAt, deadline, tpl.notes);
  writeAudit(req, { userId: req.actorId, action: 'JOB_CREATE', details: `${code} posted from template "${tpl.name}"`, entityType: 'job', entityId: Number(result.lastInsertRowid) });
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(Number(result.lastInsertRowid));
  res.status(201).json({ job });
});

app.get('/api/contracts', auth(['SHIPPER']), (req, res) => {
  const contracts = db.prepare('SELECT * FROM contract_lanes WHERE shipper_id=? ORDER BY created_at DESC').all(req.user.id);
  res.json({ contracts });
});

app.post('/api/contracts', auth(['SHIPPER']), (req, res) => {
  const b = req.body || {};
  if (!b.pickupTerminal || !b.deliveryArea || !b.deliveryAddress || !b.monthlyLoads) {
    return sendError(res, 400, 'pickupTerminal, deliveryArea, deliveryAddress and monthlyLoads are required');
  }
  const result = db
    .prepare(`INSERT INTO contract_lanes (shipper_id, pickup_terminal, delivery_area, delivery_address, monthly_loads, target_price_aed, status) VALUES (?,?,?,?,?,?,?)`)
    .run(req.user.id, b.pickupTerminal, b.deliveryArea, b.deliveryAddress, b.monthlyLoads, b.targetPriceAed || null, 'ACTIVE');
  const contract = db.prepare('SELECT * FROM contract_lanes WHERE id=?').get(Number(result.lastInsertRowid));
  res.status(201).json({ contract });
});

app.get('/api/analytics/mine', auth(), (req, res) => {
  const u = req.user;
  if (u.role === 'CARRIER') {
    const totalBids = db.prepare('SELECT COUNT(*) c FROM bids WHERE carrier_id=?').get(u.id).c;
    const jobsWon = db.prepare(`SELECT COUNT(*) c FROM bids WHERE carrier_id=? AND status='ACCEPTED'`).get(u.id).c;
    const paidOutAED = db.prepare(`SELECT COALESCE(SUM(net_aed),0) s FROM payouts WHERE carrier_id=? AND status='RELEASED'`).get(u.id).s;
    const pendingAED = db.prepare(`SELECT COALESCE(SUM(net_aed),0) s FROM payouts WHERE carrier_id=? AND status NOT IN ('RELEASED','CANCELLED')`).get(u.id).s;
    const completed = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE carrier_id=? AND status='COMPLETED'`).get(u.id).c;
    const onTimeCount = db
      .prepare(`SELECT COUNT(*) c FROM jobs WHERE carrier_id=? AND status='COMPLETED' AND delivered_at IS NOT NULL AND date(delivered_at) <= date(deadline)`)
      .get(u.id).c;
    const onTime = completed > 0 ? Math.round((onTimeCount / completed) * 100) : 100;
    res.json({ analytics: { totalBids, jobsWon, paidOutAED, pendingAED, rating: u.profile.rating_avg, onTime, tier: u.tier } });
  } else if (u.role === 'SHIPPER') {
    const jobsPosted = db.prepare('SELECT COUNT(*) c FROM jobs WHERE shipper_id=?').get(u.id).c;
    const jobsCompleted = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE shipper_id=? AND status='COMPLETED'`).get(u.id).c;
    const totalSpentAED = db.prepare(`SELECT COALESCE(SUM(agreed_price_aed),0) s FROM jobs WHERE shipper_id=? AND status='COMPLETED'`).get(u.id).s;
    const activeJobs = db
      .prepare(`SELECT COUNT(*) c FROM jobs WHERE shipper_id=? AND status IN ('OPEN','AWARDED','PICKED_UP','IN_TRANSIT','DELIVERED')`)
      .get(u.id).c;
    const paidJobs = db.prepare(`SELECT pickup_terminal, delivery_area, agreed_price_aed FROM jobs WHERE shipper_id=? AND agreed_price_aed IS NOT NULL`).all(u.id);
    let savingsPercent = 0;
    if (paidJobs.length) {
      const laneMap = Object.fromEntries(unifiedLanes.map((l) => [`${l.terminal}:${l.area}`, l.basePriceAed]));
      let baseSum = 0;
      let paidSum = 0;
      for (const j of paidJobs) {
        const base = laneMap[`${j.pickup_terminal}:${j.delivery_area}`] || j.agreed_price_aed;
        baseSum += base;
        paidSum += j.agreed_price_aed;
      }
      savingsPercent = baseSum > 0 ? Math.max(0, Math.round(((baseSum - paidSum) / baseSum) * 1000) / 10) : 0;
    }
    res.json({ analytics: { jobsPosted, jobsCompleted, totalSpentAED, activeJobs, savingsPercent, tier: u.tier, rating: u.profile.rating_avg } });
  } else {
    res.json({ analytics: {} });
  }
});

app.get('/api/earnings', auth(['CARRIER']), (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, j.id as job_id, j.job_code, j.status, j.agreed_price_aed, j.created_at as job_created,
              p.gross_aed, p.platform_fee_aed, p.net_aed, p.status as payout_status, p.release_type, p.released_at
       FROM payouts p JOIN jobs j ON j.id = p.job_id
       WHERE p.carrier_id = ?
       ORDER BY p.created_at DESC`
    )
    .all(req.user.id);
  const paid = rows.filter((r) => r.payout_status === 'RELEASED').reduce((s, r) => s + r.net_aed, 0);
  const pending = rows.filter((r) => !['RELEASED', 'CANCELLED'].includes(r.payout_status)).reduce((s, r) => s + r.net_aed, 0);
  res.json({ payouts: rows, totals: { paid, pending } });
});

app.get('/api/invoices', auth(['CARRIER', 'ADMIN']), (req, res) => {
  const invoices =
    req.user.role === 'ADMIN'
      ? db.prepare(`SELECT i.*, j.job_code FROM invoices i JOIN jobs j ON j.id = i.job_id ORDER BY i.issued_at DESC LIMIT 200`).all()
      : db.prepare(`SELECT i.*, j.job_code FROM invoices i JOIN jobs j ON j.id = i.job_id WHERE i.carrier_id=? ORDER BY i.issued_at DESC`).all(req.user.id);
  res.json({ invoices });
});

// Registered *before* the /:id route below — otherwise Express would match
// "print.js" as an :id first and 404 it there.
// Served same-origin so the invoice page's Print button works under the
// strict `script-src 'self'` CSP (securityHeaders in lib/http.js) — an
// inline onclick/<script> would be silently blocked by the browser.
app.get('/api/invoices/print.js', (req, res) => {
  res.set('Content-Type', 'application/javascript').set('Cache-Control', 'public, max-age=31536000, immutable').send(
    `document.getElementById('invoice-print-btn')?.addEventListener('click', () => window.print());`
  );
});

app.get('/api/invoices/:id', auth(['CARRIER', 'ADMIN']), (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
  if (!invoice) return sendError(res, 404, 'Invoice not found');
  if (req.user.role !== 'ADMIN' && invoice.carrier_id !== req.user.id) return sendError(res, 403, 'Not your invoice');
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(invoice.job_id);
  const carrierProfile = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(invoice.carrier_id);
  if (req.query.format === 'json') return res.json({ invoice, job });
  res.set('Content-Type', 'text/html').send(renderInvoiceHtml({ invoice, job, carrierProfile }));
});

app.get('/api/notifications', auth(), (req, res) => {
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY is_read ASC, created_at DESC LIMIT 100').all(req.user.id);
  res.json({ notifications });
});

app.post('/api/notifications/read', auth(), (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.user.id);
  res.json({ ok: true });
});

app.get('/api/notifications/preferences', auth(), (req, res) => {
  const row = db.prepare('SELECT notification_prefs_disabled FROM users WHERE id=?').get(req.user.id);
  const disabled = row ? row.notification_prefs_disabled.split(',').filter(Boolean) : [];
  res.json({ types: NOTIFICATION_TYPES, disabled });
});

app.patch('/api/notifications/preferences', auth(), (req, res) => {
  const { disabled } = req.body;
  if (!Array.isArray(disabled) || !disabled.every((t) => NOTIFICATION_TYPES.includes(t))) {
    return sendError(res, 400, `disabled must be an array of: ${NOTIFICATION_TYPES.join(', ')}`);
  }
  const csv = [...new Set(disabled)].join(',');
  db.prepare('UPDATE users SET notification_prefs_disabled=? WHERE id=?').run(csv, req.user.id);
  res.json({ types: NOTIFICATION_TYPES, disabled: [...new Set(disabled)] });
});

// =============================================================================
// 6. Admin
// =============================================================================

app.get('/api/admin/health', auth(['ADMIN']), (req, res) => {
  const openJobs = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE status='OPEN'`).get().c;
  const totalJobs = db.prepare('SELECT COUNT(*) c FROM jobs').get().c;
  const totalBids = db.prepare('SELECT COUNT(*) c FROM bids').get().c;
  const completedJobs = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE status='COMPLETED'`).get().c;
  const escrowHeld = db.prepare(`SELECT COALESCE(SUM(agreed_price_aed),0) s FROM jobs WHERE escrow_status IN ('HELD','FUNDED')`).get().s;
  const disputesOpen = db.prepare(`SELECT COUNT(*) c FROM disputes WHERE status='OPEN'`).get().c;
  res.json({
    health: {
      openJobs,
      totalBids,
      avgBidsPerJob: totalJobs ? Math.round((totalBids / totalJobs) * 10) / 10 : 0,
      completionRate: totalJobs ? Math.round((completedJobs / totalJobs) * 1000) / 10 : 0,
      escrowHeld,
      disputesOpen,
      lanes: unifiedLanes,
    },
  });
});

app.get('/api/admin/verification', auth(['ADMIN']), (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.*, p.company_name, p.trn_number, p.trade_license_number, p.phone, p.fleet_size, p.owned_chassis, p.insurance_uploaded, p.coverage_zones
       FROM users u JOIN profiles p ON p.user_id = u.id
       WHERE u.role='CARRIER' AND u.is_verified=0
       ORDER BY u.created_at ASC`
    )
    .all();
  res.json({
    queue: rows.map((r) => ({
      id: r.id,
      email: r.email,
      tier: r.tier,
      created_at: r.created_at,
      profile: {
        company_name: r.company_name,
        trn_number: decryptField(r.trn_number),
        trade_license_number: r.trade_license_number,
        phone: r.phone,
        fleet_size: r.fleet_size,
        owned_chassis: r.owned_chassis,
        insurance_uploaded: !!r.insurance_uploaded,
        coverage_zones: r.coverage_zones,
      },
    })),
  });
});

// Shared by the single-carrier route and the bulk route below. Throws
// { status, message } on failure (bulk catches per-row; single re-throws
// as a normal sendError) rather than writing to res directly.
function verifyCarrier(req, carrierId, action, iban) {
  const carrier = db.prepare('SELECT * FROM users WHERE id=?').get(carrierId);
  if (!carrier) throw { status: 404, message: 'Carrier not found' };
  if (!['approve', 'reject'].includes(action)) throw { status: 400, message: 'action must be approve or reject' };

  if (action === 'approve') {
    const existingIban = db.prepare('SELECT iban FROM profiles WHERE user_id=?').get(carrier.id).iban;
    if (!iban && !existingIban) throw { status: 400, message: 'IBAN is required to approve verification' };
    db.prepare('UPDATE users SET is_verified=1 WHERE id=?').run(carrier.id);
    db.prepare(`UPDATE profiles SET verified_at=datetime('now'), iban=COALESCE(?, iban) WHERE user_id=?`).run(iban ? encryptField(iban) : null, carrier.id);
    writeAudit(req, { userId: req.actorId, action: 'VERIFY', details: `Approved carrier #${carrier.id}`, entityType: 'user', entityId: carrier.id, afterState: 'VERIFIED' });
    notify(carrier.id, 'Verification approved', 'You can now bid on open loads.', null, 'verification');
  } else {
    writeAudit(req, { userId: req.actorId, action: 'VERIFY', details: `Rejected carrier #${carrier.id}`, entityType: 'user', entityId: carrier.id, afterState: 'REJECTED' });
    notify(carrier.id, 'Verification rejected', 'Your verification could not be approved. Contact support.', null, 'verification');
  }
  return toPublicUser(db.prepare('SELECT * FROM users WHERE id=?').get(carrier.id));
}

app.post('/api/admin/verify/:id', auth(['ADMIN']), (req, res) => {
  const { action, iban } = req.body || {};
  try {
    const user = verifyCarrier(req, req.params.id, action, iban);
    res.json({ ok: true, user });
  } catch (e) {
    if (e.status) return sendError(res, e.status, e.message);
    throw e;
  }
});

// Bulk verification — repetitive one-at-a-time approve/reject clicks were
// the main admin toil here. Each carrier is processed independently (no
// per-carrier IBAN input in bulk — approval only succeeds for carriers who
// already have one on file from registration) so one failure doesn't block
// the rest of the batch; the response reports per-carrier outcome.
const ADMIN_VERIFY_BULK_MAX = 100;
app.post('/api/admin/verify-bulk', auth(['ADMIN']), (req, res) => {
  const { ids, action } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return sendError(res, 400, 'ids must be a non-empty array');
  if (ids.length > ADMIN_VERIFY_BULK_MAX) return sendError(res, 400, `Cannot bulk-verify more than ${ADMIN_VERIFY_BULK_MAX} at once`);
  if (!['approve', 'reject'].includes(action)) return sendError(res, 400, 'action must be approve or reject');

  const results = ids.map((id) => {
    try {
      verifyCarrier(req, id, action, undefined);
      return { id, ok: true };
    } catch (e) {
      return { id, ok: false, error: e.message || 'Unknown error' };
    }
  });
  res.json({ results, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
});

app.get('/api/admin/users', auth(['ADMIN']), (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.*, p.company_name, p.completed_jobs, p.rating_avg
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
       ORDER BY u.created_at DESC`
    )
    .all();
  res.json({
    users: rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      is_verified: !!r.is_verified,
      tier: r.tier,
      created_at: r.created_at,
      profile: { company_name: r.company_name, completed_jobs: r.completed_jobs, rating_avg: r.rating_avg },
    })),
  });
});

app.get('/api/admin/referrals', auth(['ADMIN']), (req, res) => {
  const rows = db
    .prepare(
      `SELECT referred.id, referred.email, referred.created_at, referred.referred_by,
              referrer.id AS referrer_id, referrer.email AS referrer_email, referrerProfile.company_name AS referrer_company,
              referredProfile.fleet_size AS fleet_size,
              (SELECT COUNT(*) FROM jobs WHERE (jobs.shipper_id = referred.id OR jobs.carrier_id = referred.id) AND jobs.status = 'COMPLETED') AS referred_completed_jobs
       FROM users referred
       JOIN users referrer ON referrer.referral_code = referred.referred_by
       LEFT JOIN profiles referrerProfile ON referrerProfile.user_id = referrer.id
       LEFT JOIN profiles referredProfile ON referredProfile.user_id = referred.id
       WHERE referred.referred_by IS NOT NULL
       ORDER BY referred.created_at DESC`
    )
    .all();
  res.json({
    referrals: rows.map((r) => ({
      referredUserId: r.id,
      referredEmail: r.email,
      referredAt: r.created_at,
      referralCode: r.referred_by,
      referrerId: r.referrer_id,
      referrerEmail: r.referrer_email,
      referrerCompany: r.referrer_company,
      fleetSize: r.fleet_size,
      // Bonus only actually credits once the referred account completes a job —
      // status here reflects that, it isn't a stored/toggleable flag.
      status: r.referred_completed_jobs > 0 ? 'CREDITED' : 'PENDING',
    })),
  });
});

// NOTE: the literal `/impersonate/end` route MUST be registered before the
// parameterized `/impersonate/:userId` route below — Express matches routes
// in registration order, and `:userId` would otherwise greedily match the
// literal string "end" and route every "end impersonation" call into the
// admin-only start handler instead (a real bug caught in testing: it 403'd
// with "Not permitted for this role" because the impersonated session isn't
// an admin session).
app.post('/api/admin/impersonate/end', auth(), (req, res) => {
  const adminId = req.session.impersonating_admin_id;
  if (!adminId) return sendError(res, 400, 'Not currently impersonating');
  const admin = db.prepare('SELECT * FROM users WHERE id=?').get(adminId);
  if (!admin) return sendError(res, 404, 'Original admin account not found');
  createSession(req, res, admin.id);
  writeAudit(req, {
    userId: adminId,
    action: 'IMPERSONATE_END',
    details: `Admin ${admin.email} ended impersonation of ${req.user.email} (#${req.user.id})`,
    entityType: 'user',
    entityId: req.user.id,
  });
  res.json({ ok: true, user: toPublicUser(admin) });
});

app.post('/api/admin/impersonate/:userId', auth(['ADMIN']), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.userId);
  if (!target) return sendError(res, 404, 'User not found');
  if (target.role === 'ADMIN') return sendError(res, 400, 'Cannot impersonate another admin');
  createSession(req, res, target.id, { impersonatingAdminId: req.user.id, maxAgeSeconds: 30 * 60 });
  writeAudit(req, {
    userId: req.actorId,
    action: 'IMPERSONATE_START',
    details: `Admin ${req.user.email} started impersonating ${target.email} (#${target.id})`,
    entityType: 'user',
    entityId: target.id,
  });
  res.json({ ok: true, user: toPublicUser(target) });
});

app.post('/api/admin/confirm-receipt', auth(['ADMIN']), (req, res) => {
  const { jobId } = req.body || {};
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  if (!job) return sendError(res, 404, 'Job not found');
  if (job.escrow_status !== 'HELD') return sendError(res, 400, 'Escrow must be HELD to confirm receipt');
  db.prepare(`UPDATE jobs SET escrow_status='FUNDED', updated_at=datetime('now') WHERE id=?`).run(job.id);
  writeAudit(req, { userId: req.actorId, action: 'ESCROW_FUND', details: `${job.job_code} funds confirmed received`, entityType: 'job', entityId: job.id, beforeState: 'HELD', afterState: 'FUNDED' });
  res.json({ ok: true });
});

app.get('/api/admin/audit', auth(['ADMIN']), (req, res) => {
  const entries = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100').all();
  res.json({ entries });
});

app.get('/api/admin/disputes', auth(['ADMIN']), (req, res) => {
  const disputes = db
    .prepare(`SELECT d.*, j.job_code FROM disputes d JOIN jobs j ON j.id = d.job_id ORDER BY d.created_at DESC`)
    .all();
  res.json({ disputes });
});

app.post('/api/admin/disputes', auth(['ADMIN']), (req, res) => {
  const { jobId, reason } = req.body || {};
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  if (!job) return sendError(res, 404, 'Job not found');
  if (!reason) return sendError(res, 400, 'reason is required');

  const result = db.prepare('INSERT INTO disputes (job_id, opened_by, reason, status) VALUES (?,?,?,\'OPEN\')').run(job.id, req.user.id, reason);
  db.prepare(`UPDATE jobs SET status='DISPUTED', escrow_status='DISPUTED', updated_at=datetime('now') WHERE id=?`).run(job.id);
  writeAudit(req, { userId: req.actorId, action: 'DISPUTE_OPEN', details: reason, entityType: 'job', entityId: job.id, beforeState: job.status, afterState: 'DISPUTED' });
  notify(job.shipper_id, 'Dispute opened', `A dispute was opened on ${job.job_code}. Escrow is frozen.`, job.id, 'dispute');
  notify(job.carrier_id, 'Dispute opened', `A dispute was opened on ${job.job_code}. Escrow is frozen.`, job.id, 'dispute');
  const dispute = db.prepare('SELECT * FROM disputes WHERE id=?').get(Number(result.lastInsertRowid));
  res.status(201).json({ dispute });
});

app.post('/api/admin/disputes/:id/resolve', auth(['ADMIN']), (req, res) => {
  const dispute = db.prepare('SELECT * FROM disputes WHERE id=?').get(req.params.id);
  if (!dispute) return sendError(res, 404, 'Dispute not found');
  if (dispute.status === 'RESOLVED') return sendError(res, 409, 'Dispute already resolved');
  const { determination, decision } = req.body || {};
  if (!['RELEASE_TO_CARRIER', 'REFUND_SHIPPER', 'SPLIT'].includes(decision)) return sendError(res, 400, 'Invalid decision');
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(dispute.job_id);

  if (decision === 'REFUND_SHIPPER') {
    db.prepare(`UPDATE payouts SET status='CANCELLED' WHERE job_id=?`).run(job.id);
  } else {
    db.prepare(`UPDATE payouts SET status='RELEASED', release_type='DISPUTE_RESOLUTION', released_at=datetime('now'), sla_deadline=datetime('now', '+48 hours') WHERE job_id=?`).run(job.id);
    issueInvoice(db, job.id);
  }
  db.prepare(`UPDATE jobs SET status='COMPLETED', escrow_status='RELEASED', payout_released_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(job.id);
  db.prepare(`UPDATE disputes SET status='RESOLVED', determination=?, decision=?, resolved_by=?, resolved_at=datetime('now') WHERE id=?`).run(
    determination || null,
    decision,
    req.user.id,
    dispute.id
  );
  writeAudit(req, { userId: req.actorId, action: 'DISPUTE_RESOLVE', details: `${decision}: ${determination || ''}`, entityType: 'dispute', entityId: dispute.id, beforeState: 'OPEN', afterState: 'RESOLVED' });
  notify(job.shipper_id, 'Dispute resolved', `${job.job_code}: ${decision.replaceAll('_', ' ')}.`, job.id, 'dispute');
  notify(job.carrier_id, 'Dispute resolved', `${job.job_code}: ${decision.replaceAll('_', ' ')}.`, job.id, 'dispute');
  res.json({ ok: true });
});

function buildEvidence(jobId) {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  if (!job) return null;
  return {
    job,
    bids: db.prepare('SELECT * FROM bids WHERE job_id=?').all(jobId),
    documents: db.prepare('SELECT * FROM job_documents WHERE job_id=?').all(jobId),
    messages: db.prepare('SELECT * FROM messages WHERE job_id=? ORDER BY created_at').all(jobId),
    ratings: db.prepare('SELECT * FROM ratings WHERE job_id=?').all(jobId),
    auditTrail: db.prepare('SELECT * FROM audit_log WHERE entity_type=\'job\' AND entity_id=? ORDER BY id').all(jobId),
  };
}

app.get('/api/admin/disputes/:id/evidence', auth(['ADMIN']), (req, res) => {
  const dispute = db.prepare('SELECT * FROM disputes WHERE id=?').get(req.params.id);
  if (!dispute) return sendError(res, 404, 'Dispute not found');
  res.json({ evidence: buildEvidence(dispute.job_id) });
});

app.get('/api/admin/evidence/:jobId', auth(['ADMIN']), (req, res) => {
  const evidence = buildEvidence(req.params.jobId);
  if (!evidence) return sendError(res, 404, 'Job not found');
  res.json({ evidence });
});

app.get('/api/admin/revenue', auth(['ADMIN']), (req, res) => {
  const gmvAED = db.prepare(`SELECT COALESCE(SUM(agreed_price_aed),0) s FROM jobs WHERE agreed_price_aed IS NOT NULL`).get().s;
  const platformFeesAED = db.prepare('SELECT COALESCE(SUM(platform_fee_aed),0) s FROM payouts').get().s;
  const escrowHeldAED = db.prepare(`SELECT COALESCE(SUM(agreed_price_aed),0) s FROM jobs WHERE escrow_status IN ('HELD','FUNDED')`).get().s;
  const avgTakeRate = gmvAED > 0 ? `${((platformFeesAED / gmvAED) * 100).toFixed(1)}%` : '0.0%';
  res.json({ revenue: { gmvAED, platformFeesAED, escrowHeldAED, avgTakeRate } });
});

// TODO-3: the 48h payout promise is a founder-executed manual transfer with
// nothing tracking whether it actually happened — this makes that visible
// and chaseable instead of a silent assumption.
app.get('/api/admin/payouts-sla', auth(['ADMIN']), (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.job_id, j.job_code, p.carrier_id, p.net_aed, p.release_type, p.released_at,
              p.sla_deadline, p.transfer_executed_at, p.transfer_reference
       FROM payouts p JOIN jobs j ON j.id = p.job_id
       WHERE p.status = 'RELEASED' AND p.transfer_executed_at IS NULL
       ORDER BY p.sla_deadline ASC`
    )
    .all();
  const now = new Date();
  const pending = rows.map((r) => ({
    ...r,
    overdue: r.sla_deadline ? new Date(r.sla_deadline.replace(' ', 'T') + 'Z') < now : false,
  }));
  res.json({ pending, overdueCount: pending.filter((r) => r.overdue).length });
});

app.post('/api/admin/payouts/:id/mark-transferred', auth(['ADMIN']), (req, res) => {
  const payout = db.prepare('SELECT * FROM payouts WHERE id=?').get(req.params.id);
  if (!payout) return sendError(res, 404, 'Payout not found');
  if (payout.status !== 'RELEASED') return sendError(res, 400, 'Payout is not in RELEASED state yet');
  if (payout.transfer_executed_at) return sendError(res, 409, 'Transfer already confirmed for this payout');
  const { reference } = req.body || {};
  db.prepare(`UPDATE payouts SET transfer_executed_at=datetime('now'), transfer_reference=? WHERE id=?`).run(reference || null, payout.id);
  writeAudit(req, {
    userId: req.actorId,
    action: 'PAYOUT_TRANSFER_CONFIRMED',
    details: `Payout #${payout.id} (AED ${payout.net_aed}) confirmed transferred${reference ? ` — ref ${reference}` : ''}`,
    entityType: 'payout',
    entityId: payout.id,
    beforeState: 'PENDING_TRANSFER',
    afterState: 'TRANSFERRED',
  });
  const updated = db.prepare('SELECT * FROM payouts WHERE id=?').get(payout.id);
  res.json({ payout: updated });
});

app.get('/api/admin/settings', auth(['ADMIN']), (req, res) => {
  res.json({ settings: getSettings() });
});

app.patch('/api/admin/settings', auth(['ADMIN']), (req, res) => {
  const { commission_rate_bps, auto_release_hours } = req.body || {};
  if (commission_rate_bps !== undefined) {
    if (commission_rate_bps < 0 || commission_rate_bps > 10000) return sendError(res, 400, 'commission_rate_bps must be 0-10000');
    db.prepare('UPDATE settings SET value=? WHERE key=\'commission_rate_bps\'').run(String(commission_rate_bps));
  }
  if (auto_release_hours !== undefined) {
    if (auto_release_hours < 1 || auto_release_hours > 168) return sendError(res, 400, 'auto_release_hours must be 1-168');
    db.prepare('UPDATE settings SET value=? WHERE key=\'auto_release_hours\'').run(String(auto_release_hours));
  }
  writeAudit(req, { userId: req.actorId, action: 'SETTINGS_UPDATE', details: JSON.stringify(req.body) });
  res.json({ settings: getSettings() });
});

// =============================================================================
// 7. SEO pages, static SPA, fallback
// =============================================================================

const PRERENDER_DIR = path.join(DIST_DIR, '__prerendered__');

const SEO_META = {
  '/': { title: 'Loadbyton — UAE Road Freight & Container Drayage Marketplace', description: 'Post a freight job — container, flatbed, tripper, or a multi-truck volume inquiry — get verified-carrier bids across Dubai, Abu Dhabi, Sharjah and Fujairah, and move it under escrow with live tracking and payout on delivery.', slug: 'root' },
  '/features': { title: 'Features — Loadbyton', description: 'Escrow-backed drayage jobs, live tracking, contract lanes and a verified carrier network — everything Loadbyton ships.', slug: 'features' },
  '/pricing': { title: 'Pricing — Loadbyton', description: 'A transparent 6% take rate, no subscription. See how Loadbyton pricing compares to broker markups.', slug: 'pricing' },
  '/about': { title: 'About — Loadbyton', description: 'Loadbyton is a UAE container drayage marketplace built to make the second shipment happen on-platform, not on WhatsApp.', slug: 'about' },
  '/blog': { title: 'Blog — Loadbyton', description: 'Notes on UAE drayage, demurrage, and building a freight marketplace that survives past the first job.', slug: 'blog' },
  '/security': { title: 'Security — Loadbyton', description: 'How Loadbyton protects account, financial, and shipment data — what is built today, and what is on the roadmap.', slug: 'security' },
  '/compliance': { title: 'Compliance — Loadbyton', description: 'How Loadbyton handles personal data under UAE PDPL, VAT invoicing, and where account data is hosted.', slug: 'compliance' },
};

// gstack review F4: these previously fell through to the SPA catch-all,
// so a crawler requesting either got a 200 of app-shell HTML instead of
// directives/a URL list. Built from the request's own host rather than a
// hardcoded domain, so this stays correct across environments (local,
// staging, a future custom domain) without a config knob.
function siteOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

const PUBLIC_APP_PATHS_DISALLOWED = [
  '/dashboard', '/open-loads', '/my-bids', '/won-jobs', '/earnings', '/jobs/', '/profile',
  '/templates', '/contracts', '/notifications', '/admin', '/verify-email', '/reset-password', '/forgot-password',
];

app.get('/robots.txt', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600').type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      ...PUBLIC_APP_PATHS_DISALLOWED.map((p) => `Disallow: ${p}`),
      '',
      `Sitemap: ${siteOrigin(req)}/sitemap.xml`,
      '',
    ].join('\n')
  );
});

app.get('/sitemap.xml', (req, res) => {
  const origin = siteOrigin(req);
  const urls = Object.keys(SEO_META)
    .map((p) => `  <url><loc>${origin}${p}</loc></url>`)
    .join('\n');
  res
    .set('Cache-Control', 'public, max-age=3600')
    .type('application/xml')
    .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});

// Reads once at boot rather than per-request — these files only ever
// change on a fresh deploy (a new build), never while the process is
// running, so there's no staleness risk from caching them in memory.
const prerenderedCache = {};
function loadPrerendered(slug) {
  if (slug in prerenderedCache) return prerenderedCache[slug];
  const file = path.join(PRERENDER_DIR, `${slug}.html`);
  const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  prerenderedCache[slug] = html;
  return html;
}

function renderSeoPage(res, meta) {
  if (!fs.existsSync(DIST_INDEX)) {
    return res
      .status(200)
      .set('Content-Type', 'text/html')
      .send(`<!doctype html><html><head><title>${meta.title}</title><meta name="description" content="${meta.description}"></head><body><p>Build the frontend (<code>cd web && npm run build</code>) to see this page rendered with the SPA shell.</p></body></html>`);
  }
  let html = fs.readFileSync(DIST_INDEX, 'utf8');
  html = html.replace(/<title>.*?<\/title>/, `<title>${meta.title}</title>`);
  // Replace each existing meta tag's content in place rather than appending
  // duplicates — the built index.html already ships default SEO tags.
  const replacements = [
    [/(<meta name="description" content=")[^"]*(")/, `$1${meta.description}$2`],
    [/(<meta property="og:title" content=")[^"]*(")/, `$1${meta.title}$2`],
    [/(<meta property="og:description" content=")[^"]*(")/, `$1${meta.description}$2`],
    [/(<meta name="twitter:title" content=")[^"]*(")/, `$1${meta.title}$2`],
    [/(<meta name="twitter:description" content=")[^"]*(")/, `$1${meta.description}$2`],
  ];
  for (const [pattern, replacement] of replacements) html = html.replace(pattern, replacement);

  // The actual crawlability fix: splice build-time-prerendered markup into
  // the root div, so a non-JS fetcher (a search crawler, a link-preview
  // bot, WebFetch) sees the real page instead of an empty shell. Falls
  // back to the untouched empty div — same behavior as before this existed
  // — if prerendering never ran for this route. This is prerendering for
  // crawlers, not hydration: main.jsx still boots with plain createRoot(),
  // which replaces this markup the moment client JS mounts (Landing.jsx has
  // its own guard against the resulting entrance-animation replay).
  const prerendered = meta.slug ? loadPrerendered(meta.slug) : null;
  if (prerendered) {
    html = html.replace('<div id="root"></div>', `<div id="root">${prerendered}</div>`);
  }

  // gstack review F26, fixed independently on both branches — kept main's
  // no-cache (not no-store): still cacheable, but every load revalidates
  // against the ETag Express already attaches to res.send, so a repeat
  // visitor gets a cheap 304 instead of skipping the request entirely,
  // while still always seeing the current build. HTML must never be cached
  // long regardless — it's what points a repeat visitor at the *current*
  // hashed asset filenames.
  res.status(200).set('Content-Type', 'text/html').set('Cache-Control', 'no-cache').send(html);
}

if (fs.existsSync(DIST_DIR)) {
  app.use(
    express.static(DIST_DIR, {
      index: false,
      // gstack review F26, fixed independently on both branches — kept
      // main's version. Only /assets/* filenames are content-hashed by the
      // Vite build (index-<hash>.js/.css) — a change in content is
      // guaranteed to be a change in URL, so these can be cached forever.
      // Everything else under dist (favicon.svg, brand/*.svg,
      // __prerendered__/*) keeps express.static's own default (effectively
      // no caching), since those filenames don't change when their content
      // does.
      setHeaders(res, filePath) {
        if (path.join(DIST_DIR, 'assets') === path.dirname(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );
}

app.get(['/', '/features', '/pricing', '/about', '/blog', '/security', '/compliance'], (req, res) => renderSeoPage(res, SEO_META[req.path]));

// F4 was fixed independently on both branches — the /robots.txt and
// /sitemap.xml handlers above (registered right after SEO_META) are the
// surviving implementation; this branch's version disallows the
// authenticated app routes specifically rather than a blanket `/api/`
// only, which is the more precise crawl-budget signal.

app.use('/api', (req, res) => sendError(res, 404, 'Not found'));

app.get('*', (req, res) => {
  if (!fs.existsSync(DIST_INDEX)) {
    return res.status(200).send('Loadbyton API is running. Start the Vite dev server in web/ (npm run dev) or build it (npm run build) to serve the SPA from here.');
  }
  res.sendFile(DIST_INDEX, { headers: { 'Cache-Control': 'no-cache' } });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  sendError(res, 500, 'Internal server error');
});

app.listen(PORT, () => {
  console.log(`Loadbyton API listening on :${PORT}`);
  // gstack review F9: this used to print the actual secret to boot logs
  // (which land in a log aggregator, not exactly a vault) and, since
  // INTERNAL_KEY falls back to a fresh random value when the env var isn't
  // set, silently rotated on every restart — anything relying on it (a
  // cron hitting POST /api/system/auto-release) would break on redeploy
  // with no signal why. The in-process setInterval sweep a few lines above
  // already covers the actual product requirement every 10 minutes
  // regardless of this endpoint; the env var only matters for an external
  // trigger, so this is a loud warning, not a hard failure.
  if (!process.env.INTERNAL_KEY) {
    const level = process.env.NODE_ENV === 'production' ? 'WARNING' : 'note';
    console.log(`[${level}] INTERNAL_KEY not set — generated a random one for this process only. It will change on every restart/redeploy. Set INTERNAL_KEY in the environment if anything external calls POST /api/system/auto-release.`);
  } else {
    console.log('INTERNAL_KEY is set from the environment.');
  }
  require('./seed')();
});

module.exports = app;

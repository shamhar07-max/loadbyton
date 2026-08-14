// Loadbyton API — Express + node:sqlite. All routes + business logic.
// See docs/ARCHITECTURE.md, docs/API.md, docs/DATA_MODEL.md for the spec
// this file implements.

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const bcrypt = require('bcryptjs');

const db = require('./db');
const totp = require('./lib/totp');
const { unifiedLanes, estimateRate, optimizeRoute } = require('./lib/lanes');
const { issueInvoice, renderInvoiceHtml } = require('./lib/invoice');
const { rateLimiter, byIp } = require('./lib/rateLimit');
const { encryptField, decryptField } = require('./lib/crypto');
const { notifyDriverAsync } = require('./lib/whatsapp');
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
const DIST_DIR = path.join(__dirname, '..', 'web', 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');

const app = express();
app.disable('x-powered-by');
// Required for req.ip to reflect the real client behind Render/Cloudflare —
// without this, every request behind a proxy shares one IP and the rate
// limiter below would throttle all users as if they were one.
app.set('trust proxy', 1);
app.use(express.json());
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

// UAE mobile: 05XXXXXXXX, +9715XXXXXXXX, or 9715XXXXXXXX — loose on purpose,
// this only guards against an obviously-wrong value at the API boundary.
const UAE_MOBILE_RE = /^(\+?971|0)?5\d{8}$/;
function normalizeUaeMobile(raw) {
  const digits = String(raw || '').replace(/[\s-]/g, '');
  return UAE_MOBILE_RE.test(digits) ? digits : null;
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

function notify(userId, title, body, jobId = null) {
  if (!userId) return;
  db.prepare('INSERT INTO notifications (user_id, title, body, job_id) VALUES (?,?,?,?)').run(userId, title, body, jobId);
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
      notify(job.shipper_id, 'Payout auto-released', `${job.job_code} funds were released ${auto_release_hours}h after delivery.`, job.id);
      notify(job.carrier_id, 'Funds on the way', `Your payout for ${job.job_code} was auto-released.`, job.id);
      db.exec('COMMIT');
      released++;
    } catch (e) {
      db.exec('ROLLBACK');
    }
  }
  return released;
}

app.post('/api/system/auto-release', (req, res) => {
  const key = req.headers['x-internal-key'];
  let authorized = key && key === INTERNAL_KEY;
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

app.post(
  '/api/auth/register',
  asyncHandler(async (req, res) => {
    const { email, password, role, companyName, phone, trnNumber, tradeLicenseNumber, referralCode: incomingReferral } = req.body || {};
    if (!email || !password || !companyName) return sendError(res, 400, 'email, password and companyName are required');
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

    const userResult = db
      .prepare('INSERT INTO users (email, password_hash, role, tier, referral_code, referred_by) VALUES (?,?,?,?,?,?)')
      .run(email, passwordHash, role, 'BRONZE', code, referredBy);
    const userId = Number(userResult.lastInsertRowid);
    db.prepare(
      'INSERT INTO profiles (user_id, company_name, trn_number, trade_license_number, phone) VALUES (?,?,?,?,?)'
    ).run(userId, companyName, encryptField(trnNumber), tradeLicenseNumber || null, phone || null);

    writeAudit(req, { userId, action: 'REGISTER', details: `${role} registered: ${email}`, entityType: 'user', entityId: userId });
    createSession(req, res, userId);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    res.status(201).json({ user: toPublicUser(user) });
  })
);

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const { email, password, totpCode } = req.body || {};
    if (!email || !password) return sendError(res, 400, 'email and password are required');
    if (isThrottled(email)) return sendError(res, 429, 'Too many failed attempts. Try again in a few minutes.');

    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
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

// s-maxage lets Cloudflare edge-cache these for a short window without a
// Render origin round-trip on every hit; max-age=0 keeps browsers always
// revalidating so a signed-out visitor never sees minutes-stale numbers.
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

app.get('/api/bids/mine', auth(['CARRIER']), (req, res) => {
  const bids = db
    .prepare(
      `SELECT b.*, j.job_code, j.pickup_terminal, j.delivery_area, j.status as job_status
       FROM bids b JOIN jobs j ON j.id = b.job_id
       WHERE b.carrier_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(req.user.id);
  res.json({ bids });
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

app.get('/api/jobs', auth(), (req, res) => {
  const { status, limit, offset, mine } = req.query;
  const lim = Math.min(Number(limit) || 50, 200);
  const off = Number(offset) || 0;
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
    where += ' AND status = ?';
    params.push(status);
  }
  params.push(lim, off);
  const jobs = db.prepare(`SELECT * FROM jobs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params);
  res.json({ jobs });
});

app.post('/api/jobs', auth(['SHIPPER']), writeLimiter, requireSeatRole(['OPS']), (req, res) => {
  const b = req.body || {};
  const required = ['pickupTerminal', 'deliveryArea', 'deliveryAddress', 'readyAt', 'deadline'];
  for (const f of required) if (!b[f]) return sendError(res, 400, `${f} is required`);

  const equipmentType = EQUIPMENT_TYPES.includes(b.equipmentType) ? b.equipmentType : 'CONTAINER_CHASSIS';
  const needsContainer = CONTAINER_EQUIPMENT.includes(equipmentType);

  let containerSize = 'N/A';
  let containerType = 'GENERAL';
  if (needsContainer) {
    if (!b.containerSize || !CONTAINER_SIZES.includes(b.containerSize)) return sendError(res, 400, 'Invalid containerSize');
    if (!b.containerType || !CONTAINER_TYPES.includes(b.containerType)) return sendError(res, 400, 'Invalid containerType');
    containerSize = b.containerSize;
    containerType = b.containerType;
  } else if (!b.notes) {
    return sendError(res, 400, 'cargoDescription (notes) is required for non-container equipment');
  }

  const containerCount = Math.max(1, Number(b.containerCount) || 1);
  const truckCount = Math.max(1, Number(b.truckCount) || 1);

  let code = jobCode();
  while (db.prepare('SELECT 1 FROM jobs WHERE job_code=?').get(code)) code = jobCode();

  const result = db
    .prepare(
      `INSERT INTO jobs (job_code, shipper_id, contract_lane_id, template_id, container_size, container_type, container_number,
         pickup_terminal, delivery_area, delivery_address, ready_at, deadline, max_budget_aed, status, escrow_status,
         requires_reefer, requires_hazmat, free_time_days, demurrage_rate_aed, notes, equipment_type, container_count, truck_count)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'OPEN','PENDING',?,?,?,?,?,?,?,?)`
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
      truckCount
    );
  const jobId = Number(result.lastInsertRowid);
  writeAudit(req, { userId: req.actorId, action: 'JOB_CREATE', details: `${code} posted`, entityType: 'job', entityId: jobId, afterState: 'OPEN' });
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  res.status(201).json({ job });
});

app.get('/api/jobs/:id', auth(), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (!canViewJob(job, req.user)) return sendError(res, 403, 'Not permitted to view this job');

  let bids = db.prepare('SELECT * FROM bids WHERE job_id=? ORDER BY amount_aed ASC').all(job.id);
  const isOwnerShipper = req.user.id === job.shipper_id;
  const isAdmin = req.user.role === 'ADMIN';
  if (job.status === 'OPEN' && !isOwnerShipper && !isAdmin) {
    bids = bids.map((b) =>
      b.carrier_id === req.user.id ? b : { ...b, amount_aed: null, eta_minutes: null, driver_name: null, notes: null, masked: true }
    );
  }

  const documents = isParticipantOrBidder(job, req.user) ? db.prepare('SELECT * FROM job_documents WHERE job_id=? ORDER BY created_at').all(job.id) : [];
  const payout = db.prepare('SELECT * FROM payouts WHERE job_id=?').get(job.id) || null;
  res.json({ job, bids, documents, payout });
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

  const result = db
    .prepare('INSERT INTO bids (job_id, carrier_id, amount_aed, eta_minutes, truck_type, driver_name, driver_phone, notes) VALUES (?,?,?,?,?,?,?,?)')
    .run(job.id, req.user.id, amount, eta, b.truckType || null, b.driverName, driverPhone, b.notes || null);
  const bidId = Number(result.lastInsertRowid);
  writeAudit(req, { userId: req.actorId, action: 'BID_CREATE', details: `Bid AED ${amount} on ${job.job_code}`, entityType: 'bid', entityId: bidId });
  notify(job.shipper_id, 'New bid received', `${req.user.profile.company_name} bid AED ${amount} on ${job.job_code}.`, job.id);
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
    notify(bid.carrier_id, 'Bid accepted', `Your bid on ${freshJob.job_code} was accepted. Escrow is HELD.`, jobId);
    const rejected = db.prepare('SELECT carrier_id FROM bids WHERE job_id=? AND id!=?').all(jobId, bid.id);
    for (const r of rejected) notify(r.carrier_id, 'Bid not selected', `Another carrier was awarded ${freshJob.job_code}.`, jobId);
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

app.patch('/api/jobs/:id/status', auth(), requireSeatRole(['OPS']), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  const { status: next } = req.body || {};
  const role = req.user.role;
  const isShipperOwner = role === 'SHIPPER' && job.shipper_id === req.user.id;
  const isCarrierOwner = role === 'CARRIER' && job.carrier_id === req.user.id;
  if (!isShipperOwner && !isCarrierOwner && role !== 'ADMIN') return sendError(res, 403, 'Not a participant on this job');
  if (job.status === 'DISPUTED') return sendError(res, 403, 'Job is under dispute — escrow frozen');

  const allowedFor = role === 'ADMIN' ? { [job.status]: [next] } : TRANSITIONS[role] || {};
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
    notify(job.carrier_id, 'Funds on the way', `${job.job_code} was confirmed delivered. Payout released.`, job.id);
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
  notify(other, 'Job status updated', `${job.job_code} is now ${next}.`, job.id);

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
  notify(job.shipper_id, 'Driver reassigned', `${job.job_code}: the assigned driver was changed to ${driverName}.`, job.id);
  const updated = db.prepare('SELECT * FROM jobs WHERE id=?').get(job.id);
  res.json({ job: updated });
});

app.post('/api/jobs/:id/pod', auth(['CARRIER']), requireSeatRole(['OPS']), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (job.carrier_id !== req.user.id) return sendError(res, 403, 'Not your job');
  if (job.status !== 'IN_TRANSIT') return sendError(res, 403, 'Job must be IN_TRANSIT to submit proof of delivery');

  db.prepare(`UPDATE jobs SET status='DELIVERED', delivered_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(job.id);
  const doc = (req.body || {}).document;
  if (doc) {
    db.prepare('INSERT INTO job_documents (job_id, uploader_id, doc_type, title, file_url) VALUES (?,?,?,?,?)').run(
      job.id,
      req.actorId,
      DOC_TYPES.includes(doc.docType) ? doc.docType : 'POD',
      doc.title || 'Proof of Delivery',
      doc.fileUrl || ''
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
  notify(job.shipper_id, 'Proof of delivery submitted', `Confirm delivery on ${job.job_code}, or it auto-releases in ${auto_release_hours}h.`, job.id);
  const updated = db.prepare('SELECT * FROM jobs WHERE id=?').get(job.id);
  res.json({ job: updated });
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

app.post('/api/jobs/:id/documents', auth(), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  if (!isParticipantOrBidder(job, req.user)) return sendError(res, 403, 'Not permitted');
  const b = req.body || {};
  if (!b.title || !b.fileUrl) return sendError(res, 400, 'title and fileUrl are required');
  db.prepare('INSERT INTO job_documents (job_id, uploader_id, doc_type, title, file_url) VALUES (?,?,?,?,?)').run(
    job.id,
    req.actorId,
    DOC_TYPES.includes(b.docType) ? b.docType : 'OTHER',
    b.title,
    b.fileUrl
  );
  writeAudit(req, { userId: req.actorId, action: 'DOCUMENT_ADD', details: `${b.docType || 'OTHER'} on ${job.job_code}`, entityType: 'job', entityId: job.id });
  res.status(201).json({ ok: true });
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

  db.prepare('INSERT INTO ratings (job_id, rater_id, ratee_id, score, comment) VALUES (?,?,?,?,?)').run(job.id, req.user.id, rateeId, score, b.comment || null);
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
  notify(other, 'New message', `New message on ${job.job_code}`, job.id);
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

app.post('/api/admin/verify/:id', auth(['ADMIN']), (req, res) => {
  const carrier = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!carrier) return sendError(res, 404, 'Carrier not found');
  const { action, iban } = req.body || {};
  if (!['approve', 'reject'].includes(action)) return sendError(res, 400, 'action must be approve or reject');

  if (action === 'approve') {
    const existingIban = db.prepare('SELECT iban FROM profiles WHERE user_id=?').get(carrier.id).iban;
    if (!iban && !existingIban) return sendError(res, 400, 'IBAN is required to approve verification');
    db.prepare('UPDATE users SET is_verified=1 WHERE id=?').run(carrier.id);
    db.prepare(`UPDATE profiles SET verified_at=datetime('now'), iban=COALESCE(?, iban) WHERE user_id=?`).run(iban ? encryptField(iban) : null, carrier.id);
    writeAudit(req, { userId: req.actorId, action: 'VERIFY', details: `Approved carrier #${carrier.id}`, entityType: 'user', entityId: carrier.id, afterState: 'VERIFIED' });
    notify(carrier.id, 'Verification approved', 'You can now bid on open loads.');
  } else {
    writeAudit(req, { userId: req.actorId, action: 'VERIFY', details: `Rejected carrier #${carrier.id}`, entityType: 'user', entityId: carrier.id, afterState: 'REJECTED' });
    notify(carrier.id, 'Verification rejected', 'Your verification could not be approved. Contact support.');
  }
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(carrier.id);
  res.json({ ok: true, user: toPublicUser(user) });
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
  notify(job.shipper_id, 'Dispute opened', `A dispute was opened on ${job.job_code}. Escrow is frozen.`, job.id);
  notify(job.carrier_id, 'Dispute opened', `A dispute was opened on ${job.job_code}. Escrow is frozen.`, job.id);
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
  notify(job.shipper_id, 'Dispute resolved', `${job.job_code}: ${decision.replaceAll('_', ' ')}.`, job.id);
  notify(job.carrier_id, 'Dispute resolved', `${job.job_code}: ${decision.replaceAll('_', ' ')}.`, job.id);
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

  // no-cache (not no-store): still cacheable, but every load revalidates
  // against the ETag Express already attaches to res.send, so a repeat
  // visitor gets a cheap 304 instead of skipping the request entirely
  // while still always seeing the current build.
  res.status(200).set('Content-Type', 'text/html').set('Cache-Control', 'no-cache').send(html);
}

if (fs.existsSync(DIST_DIR)) {
  app.use(
    express.static(DIST_DIR, {
      index: false,
      setHeaders(res, filePath) {
        // Only /assets/* filenames are content-hashed by the Vite build
        // (index-<hash>.js/.css) — a change in content is guaranteed to be a
        // change in URL, so these can be cached forever. Everything else
        // under dist (favicon.svg, brand/*.svg, __prerendered__/*) keeps
        // express.static's own default (effectively no caching), since
        // those filenames don't change when their content does.
        if (path.join(DIST_DIR, 'assets') === path.dirname(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );
}

app.get(['/', '/features', '/pricing', '/about', '/blog', '/security', '/compliance'], (req, res) => renderSeoPage(res, SEO_META[req.path]));

// robots.txt / sitemap.xml previously fell through to the SPA catch-all
// below and served index.html with a 200 — a search engine reads that as
// "no crawl rules" / "no sitemap" rather than erroring, so the bug was
// silent. SEO_META's keys are exactly the routes that get prerendered
// markup, so the sitemap reuses that object instead of a second hardcoded
// route list that could drift from it.
app.get('/robots.txt', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  res
    .set('Content-Type', 'text/plain; charset=utf-8')
    .set('Cache-Control', 'public, max-age=3600')
    .send(['User-agent: *', 'Allow: /', 'Disallow: /api/', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n'));
});

app.get('/sitemap.xml', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  const urls = Object.keys(SEO_META)
    .map((route) => `  <url><loc>${origin}${route}</loc></url>`)
    .join('\n');
  res
    .set('Content-Type', 'application/xml; charset=utf-8')
    .set('Cache-Control', 'public, max-age=3600')
    .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});

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
  console.log(`INTERNAL_KEY (for POST /api/system/auto-release): ${INTERNAL_KEY}`);
  require('./seed')();
});

module.exports = app;

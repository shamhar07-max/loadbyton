// Loadbyton — schema, migrations, and the single DB connection.
// node:sqlite (DatabaseSync) — synchronous driver, WAL mode, foreign keys on.
// Idempotent by design: CREATE TABLE IF NOT EXISTS + PRAGMA table_info-driven
// ALTER TABLE for columns added after a database was first created, so this
// is always safe to run on every boot.

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'loadbyton.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

// ---------------------------------------------------------------------------
// Core schema
// ---------------------------------------------------------------------------

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'BRONZE',
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  trn_number TEXT,
  trade_license_number TEXT,
  phone TEXT,
  iban TEXT,
  coverage_zones TEXT,
  fleet_size INTEGER NOT NULL DEFAULT 0,
  owned_chassis INTEGER NOT NULL DEFAULT 0,
  insurance_uploaded INTEGER NOT NULL DEFAULT 0,
  rating_avg REAL NOT NULL DEFAULT 5.0,
  completed_jobs INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_code TEXT UNIQUE NOT NULL,
  shipper_id INTEGER NOT NULL REFERENCES users(id),
  carrier_id INTEGER REFERENCES users(id),
  contract_lane_id INTEGER,
  template_id INTEGER,
  container_size TEXT NOT NULL,
  container_type TEXT NOT NULL,
  container_number TEXT,
  pickup_terminal TEXT NOT NULL,
  delivery_area TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  ready_at TEXT NOT NULL,
  deadline TEXT NOT NULL,
  max_budget_aed REAL,
  agreed_price_aed REAL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  awarded_bid_id INTEGER,
  requires_reefer INTEGER NOT NULL DEFAULT 0,
  requires_hazmat INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  free_time_days INTEGER NOT NULL DEFAULT 5,
  demurrage_rate_aed INTEGER NOT NULL DEFAULT 400,
  escrow_status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_shipper ON jobs(shipper_id);
CREATE INDEX IF NOT EXISTS idx_jobs_carrier ON jobs(carrier_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  carrier_id INTEGER NOT NULL REFERENCES users(id),
  amount_aed REAL NOT NULL,
  eta_minutes INTEGER NOT NULL,
  truck_type TEXT,
  driver_name TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bids_job ON bids(job_id);
CREATE INDEX IF NOT EXISTS idx_bids_carrier ON bids(carrier_id);

CREATE TABLE IF NOT EXISTS job_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  uploader_id INTEGER NOT NULL REFERENCES users(id),
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_docs_job ON job_documents(job_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_job ON messages(job_id);

CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  rater_id INTEGER NOT NULL REFERENCES users(id),
  ratee_id INTEGER NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ratings_job ON ratings(job_id);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipper_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  pickup_terminal TEXT NOT NULL,
  delivery_area TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  container_size TEXT NOT NULL,
  container_type TEXT NOT NULL DEFAULT 'DRY',
  cadence TEXT NOT NULL DEFAULT 'ONCE',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_templates_shipper ON templates(shipper_id);

CREATE TABLE IF NOT EXISTS contract_lanes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipper_id INTEGER NOT NULL REFERENCES users(id),
  pickup_terminal TEXT NOT NULL,
  delivery_area TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  monthly_loads INTEGER NOT NULL,
  target_price_aed REAL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contracts_shipper ON contract_lanes(shipper_id);

CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  carrier_id INTEGER NOT NULL REFERENCES users(id),
  gross_aed REAL NOT NULL,
  platform_fee_aed REAL NOT NULL,
  net_aed REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  released_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payouts_carrier ON payouts(carrier_id);
CREATE INDEX IF NOT EXISTS idx_payouts_job ON payouts(job_id);

CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  opened_by INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  determination TEXT,
  decision TEXT,
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_disputes_job ON disputes(job_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  job_id INTEGER,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- VAT tax invoices for platform commission — see server/lib/invoice.js for
-- the numbering scheme and the tax-inclusive-fee assumption this bakes in.
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  payout_id INTEGER NOT NULL REFERENCES payouts(id),
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  carrier_id INTEGER NOT NULL REFERENCES users(id),
  supplier_trn TEXT,
  customer_trn TEXT,
  gross_aed REAL NOT NULL,
  commission_aed REAL NOT NULL,
  vat_rate_bps INTEGER NOT NULL,
  taxable_aed REAL NOT NULL,
  vat_aed REAL NOT NULL,
  total_aed REAL NOT NULL,
  issued_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_carrier ON invoices(carrier_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_job ON invoices(job_id);
`);

// ---------------------------------------------------------------------------
// Migrations — columns added after first release. Safe on every boot because
// the synchronous driver makes startup the single writer.
// ---------------------------------------------------------------------------

function addColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

addColumn('users', 'mfa_secret', 'mfa_secret TEXT');

addColumn('jobs', 'delivered_at', 'delivered_at TEXT');
addColumn('jobs', 'auto_release_processed', 'auto_release_processed INTEGER NOT NULL DEFAULT 0');
addColumn('jobs', 'payout_released_at', 'payout_released_at TEXT');
addColumn('jobs', 'container_count', 'container_count INTEGER NOT NULL DEFAULT 1');
addColumn('jobs', 'truck_count', 'truck_count INTEGER NOT NULL DEFAULT 1');
addColumn('jobs', 'equipment_type', "equipment_type TEXT NOT NULL DEFAULT 'CONTAINER_CHASSIS'");

addColumn('sessions', 'impersonating_admin_id', 'impersonating_admin_id INTEGER');

addColumn('payouts', 'release_type', 'release_type TEXT');

addColumn('audit_log', 'entity_type', 'entity_type TEXT');
addColumn('audit_log', 'entity_id', 'entity_id INTEGER');
addColumn('audit_log', 'before_state', 'before_state TEXT');
addColumn('audit_log', 'after_state', 'after_state TEXT');
addColumn('audit_log', 'request_id', 'request_id TEXT');

// ---------------------------------------------------------------------------
// audit_log is append-only: DB triggers hard-abort UPDATE/DELETE. This makes
// the audit trail tamper-evident even against a compromised app process.
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TRIGGER IF NOT EXISTS audit_log_no_update
  BEFORE UPDATE ON audit_log
  BEGIN
    SELECT RAISE(ABORT, 'audit_log is append-only: UPDATE is not permitted');
  END;

  CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
  BEFORE DELETE ON audit_log
  BEGIN
    SELECT RAISE(ABORT, 'audit_log is append-only: DELETE is not permitted');
  END;
`);

// ---------------------------------------------------------------------------
// Platform settings — seeded once, editable via /api/admin/settings.
// ---------------------------------------------------------------------------

const seedSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
seedSetting.run('commission_rate_bps', '600');
seedSetting.run('auto_release_hours', '24');

// ---------------------------------------------------------------------------
// Expired sessions are purged on every boot.
// ---------------------------------------------------------------------------

db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();

module.exports = db;

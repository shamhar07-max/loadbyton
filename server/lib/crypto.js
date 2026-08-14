// Field-level encryption for IBAN + TRN — these sat in `profiles` as plain
// TEXT with the same protection as a coverage-zone string, despite being
// exactly the two fields a breach would actually monetize. AES-256-GCM,
// node:crypto only (no new dependency).
//
// Values are stored as `enc:v1:<base64(iv || authTag || ciphertext)>`. A
// stored value with no `enc:v1:` prefix is treated as legacy plaintext and
// returned as-is by decryptField — so this upgrades existing rows lazily
// (re-encrypted the next time they're written) rather than requiring a
// hard migration/backfill before deploying this change.

const crypto = require('node:crypto');

const ENC_PREFIX = 'enc:v1:';
// Deterministic on purpose so a local dev DB stays decryptable across
// restarts without ENCRYPTION_KEY set. Obviously not a secret; production
// must set a real key or boot fails (see resolveKey).
const DEV_FALLBACK_KEY_MATERIAL = 'loadbyton-insecure-dev-key-do-not-use-in-production';

let warned = false;

// The key is derived via SHA-256 of whatever ENCRYPTION_KEY holds, rather
// than requiring it be exactly 32 bytes of hex — deliberately, so it works
// equally whether the value came from `openssl rand -hex 32` (recommended,
// see docs/DEVELOPER_GUIDE.md §7) or from a platform's own secret generator
// (e.g. Render's `generateValue: true` in render.yaml, which produces a
// random string with no guaranteed format). A strict hex-length check here
// would silently produce a broken key on a platform whose generator output
// isn't hex — hard to catch until the first decrypt fails.
function resolveKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY is required in production. Generate one with `openssl rand -hex 32` — see docs/DEVELOPER_GUIDE.md §7.');
    }
    if (!warned) {
      // eslint-disable-next-line no-console
      console.warn('[loadbyton] ENCRYPTION_KEY not set — using a fixed, insecure dev-only key. IBAN/TRN fields are NOT protected. Set ENCRYPTION_KEY before this ever holds real data.');
      warned = true;
    }
    return crypto.createHash('sha256').update(DEV_FALLBACK_KEY_MATERIAL).digest();
  }
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext ?? null;
  const key = resolveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decryptField(stored) {
  if (stored === null || stored === undefined || stored === '') return stored ?? null;
  if (typeof stored !== 'string' || !stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext
  const key = resolveKey();
  const raw = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encryptField, decryptField };

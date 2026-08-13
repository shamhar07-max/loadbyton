// Zero-dependency TOTP (RFC 6238): HMAC-SHA1, 6 digits, 30s step.
// No otplib — just Node's built-in crypto module.

const crypto = require('node:crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function randomBase32Secret(bytes = 20) {
  const buf = crypto.randomBytes(bytes);
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(input) {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secretBuf, counter) {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

function currentCode(base32Secret, step = 30, at = Date.now()) {
  const counter = Math.floor(at / 1000 / step);
  return hotp(base32Decode(base32Secret), counter);
}

// Accepts the current window and one step of drift on either side.
function verifyCode(base32Secret, code, step = 30, at = Date.now()) {
  if (!code || !/^\d{6}$/.test(String(code))) return false;
  const counter = Math.floor(at / 1000 / step);
  const secretBuf = base32Decode(base32Secret);
  for (let drift = -1; drift <= 1; drift++) {
    if (hotp(secretBuf, counter + drift) === String(code)) return true;
  }
  return false;
}

function provisioningUrl(base32Secret, email, issuer = 'Loadbyton') {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret: base32Secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { randomBase32Secret, currentCode, verifyCode, provisioningUrl };

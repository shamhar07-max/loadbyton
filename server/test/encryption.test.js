// Proves IBAN/TRN are actually encrypted at rest, not just round-tripped
// through a no-op decrypt. Reads the raw SQLite file directly — bypassing
// the API entirely — so this fails if encryptField is ever accidentally
// skipped on a write path, even if every API-level test still passes.

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { startServer, makeClient } = require('./harness');

let server;

test.before(async () => {
  server = await startServer();
});

test.after(async () => {
  await server.stop();
});

test('IBAN and TRN are stored encrypted, and decrypt correctly through the API', async () => {
  const shipper = makeClient(server.baseUrl);
  const plaintextTrn = '100999888700005';
  const email = `encryption-test-${Date.now()}@example.ae`;

  const registered = await shipper.post('/api/auth/register', {
    email,
    password: 'demo1234',
    role: 'SHIPPER',
    companyName: 'Encryption Test Co',
    trnNumber: plaintextTrn,
  });
  assert.equal(registered.status, 201, registered.raw);

  const plaintextIban = 'AE070331234567890999888';
  const updated = await shipper.patch('/api/profile', { iban: plaintextIban });
  assert.equal(updated.status, 200, updated.raw);

  // API boundary must return plaintext (the whole point of decrypting at
  // the read boundary is that callers never see ciphertext).
  const me = await shipper.get('/api/auth/me');
  assert.equal(me.body.user.profile.trn_number, plaintextTrn);
  assert.equal(me.body.user.profile.iban, plaintextIban);

  // Raw DB row must NOT contain the plaintext — read it directly,
  // bypassing the API and its decrypt-on-read step entirely.
  const rawDb = new DatabaseSync(server.dbPath, { readOnly: true });
  try {
    const row = rawDb.prepare('SELECT trn_number, iban FROM profiles WHERE user_id = ?').get(registered.body.user.id);
    assert.ok(row.trn_number.startsWith('enc:v1:'), 'trn_number must be stored encrypted');
    assert.ok(row.iban.startsWith('enc:v1:'), 'iban must be stored encrypted');
    assert.notEqual(row.trn_number, plaintextTrn);
    assert.notEqual(row.iban, plaintextIban);
  } finally {
    rawDb.close();
  }
});

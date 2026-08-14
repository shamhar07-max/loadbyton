// Unit-level, no server/network needed: proves the WhatsApp scaffold
// (TODO-4) never throws and never silently pretends to send when it isn't
// configured — the state every deployment is in until Meta approval lands.

const test = require('node:test');
const assert = require('node:assert/strict');
const { sendWhatsAppMessage, isConfigured } = require('../lib/whatsapp');

test('WhatsApp is dark by default and reports why, rather than pretending to send', async () => {
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  assert.equal(isConfigured(), false);

  const result = await sendWhatsAppMessage({ to: '+971501234567', template: 'job_awarded_pickup_details', params: ['Driver', 'LBT-1', 'JEBEL_ALI_T2'] });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'not_configured');
});

test('a missing recipient never throws, even if the app forgets to check first', async () => {
  const result = await sendWhatsAppMessage({ to: null, template: 'job_awarded_pickup_details' });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'no_recipient');
});

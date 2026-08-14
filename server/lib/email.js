// Transactional email — verification + password reset (gstack review F3).
//
// Same shape as server/lib/whatsapp.js: a real, provider-agnostic send
// function that is code-complete against a Resend-compatible HTTP API and
// will genuinely send the moment EMAIL_API_KEY/EMAIL_FROM are set. Until
// then every call safely no-ops with a logged intent (including the actual
// link, so verification/reset are still fully testable without a live
// provider) — nothing in the auth flow depends on delivery succeeding.

function isConfigured() {
  return !!(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM);
}

async function sendEmail({ to, subject, html }) {
  if (!to) return { sent: false, reason: 'no_recipient' };
  if (!isConfigured()) {
    // eslint-disable-next-line no-console
    console.log(`[email:dark] would send "${subject}" to ${to} — EMAIL_API_KEY not set:\n${html}`);
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(`[email:error] ${res.status} sending "${subject}" to ${to}: ${errText}`);
      return { sent: false, reason: 'provider_error', status: res.status };
    }
    return { sent: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[email:error] sending "${subject}" to ${to} failed:`, err.message);
    return { sent: false, reason: 'network_error' };
  }
}

// Fire-and-forget wrapper — auth routes must never block/fail on delivery.
function sendEmailAsync(args) {
  sendEmail(args).catch(() => {});
}

module.exports = { sendEmail, sendEmailAsync, isConfigured };

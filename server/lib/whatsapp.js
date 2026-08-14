// WhatsApp driver messaging — TODO-4 scaffold.
//
// WHAT THIS IS: a real, provider-agnostic send function wired into the one
// moment STRATEGY.md calls launch-critical (a driver gets bound to a job at
// award — see TODO-2's assigned_driver_phone — and needs pickup details on
// the channel this market actually uses). It is code-complete for the Meta
// WhatsApp Cloud API and will genuinely send a message the moment
// WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID are set.
//
// WHAT THIS IS NOT: Meta Business API approval and template pre-approval
// are an external, non-technical process (business verification + template
// review, multi-week and outside this repo's control) — see
// docs/WHATSAPP_SETUP.md. Until that's done, every call here safely no-ops
// with a logged intent, exactly the fallback order STRATEGY.md specifies
// (WhatsApp -> SMS -> in-app; in-app notifications already fire regardless
// via notify() in server/index.js, so nothing is lost while this is dark).

const WHATSAPP_API_VERSION = 'v21.0';

function isConfigured() {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

// `template` must already be an approved WhatsApp message template name
// (see docs/WHATSAPP_SETUP.md) — WhatsApp Business API rejects free-form
// text outside the 24h customer-service window, so this never attempts one.
async function sendWhatsAppMessage({ to, template, params = [] }) {
  if (!to) return { sent: false, reason: 'no_recipient' };
  if (!isConfigured()) {
    // eslint-disable-next-line no-console
    console.log(`[whatsapp:dark] would send template "${template}" to ${to} — WHATSAPP_ACCESS_TOKEN not set, see docs/WHATSAPP_SETUP.md`);
    return { sent: false, reason: 'not_configured' };
  }

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: to.replace(/[^\d+]/g, ''),
    type: 'template',
    template: {
      name: template,
      language: { code: 'en' },
      components: params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }] : undefined,
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(`[whatsapp:error] ${res.status} sending "${template}" to ${to}: ${errText}`);
      return { sent: false, reason: 'provider_error', status: res.status };
    }
    return { sent: true };
  } catch (err) {
    // Never let a WhatsApp failure break the request it's attached to — the
    // in-app notification already fired via notify() regardless.
    // eslint-disable-next-line no-console
    console.error(`[whatsapp:error] sending "${template}" to ${to} failed:`, err.message);
    return { sent: false, reason: 'network_error' };
  }
}

// Fire-and-forget wrapper for call sites that must never await/block on
// delivery (e.g. inside the award transaction) — matches how notify() is
// already used as a side effect, never inline with the response.
function notifyDriverAsync({ to, template, params }) {
  sendWhatsAppMessage({ to, template, params }).catch(() => {});
}

module.exports = { sendWhatsAppMessage, notifyDriverAsync, isConfigured };

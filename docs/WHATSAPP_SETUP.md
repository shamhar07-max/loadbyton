# WhatsApp driver messaging — setup (TODO-4)

`docs/STRATEGY.md` names WhatsApp as launch-critical: driver messaging order
is **WhatsApp → SMS → in-app**, in that order, because that's the channel
UAE drivers actually use. The send path (`server/lib/whatsapp.js`) is
code-complete against the Meta WhatsApp Cloud API. What's missing is not
code — it's an external approval process this document exists to start
early, because its lead time is the actual critical path, not the build.

## Why this can't be "just finished" in a sitting

1. **Business verification** — Meta verifies the business behind the WhatsApp
   Business Account (WABA). Requires a registered legal entity, a domain, and
   can take days to weeks depending on document review queues.
2. **Message template approval** — WhatsApp only allows free-form replies
   inside a 24h customer-service window. Anything outside that (the pickup
   notification this ships with) must go through an approved **template**,
   reviewed by Meta, typically 1–2 business days per template but with no
   SLA guarantee.
3. **Phone number registration** — the sending number needs to be verified
   and can't be a number already active on personal WhatsApp.

None of that is blocked by anything in this repo — start it in parallel
with everything else, per TODO-4's own framing.

## Steps

1. Create a Meta Business account at business.facebook.com if one doesn't
   exist for the company yet.
2. Go to developers.facebook.com → My Apps → Create App → "Business" type →
   add the **WhatsApp** product.
3. Under WhatsApp → API Setup, note the **Phone Number ID** and generate a
   permanent **System User access token** (not the 24h test token) once the
   app passes Business Verification.
4. Under WhatsApp → Message Templates, submit the template this code sends:

   **Name:** `job_awarded_pickup_details`
   **Category:** Utility
   **Body:** `Hi {{1}}, you're assigned to pickup {{2}} at {{3}}. Reply here for gate pass details.`

   (`{{1}}` = driver name, `{{2}}` = job code, `{{3}}` = pickup terminal —
   matches the `params` array passed in `server/index.js`'s award handler.)

5. Once approved, set on the server:

   | Env var | Value |
   |---|---|
   | `WHATSAPP_ACCESS_TOKEN` | the permanent System User token from step 3 |
   | `WHATSAPP_PHONE_NUMBER_ID` | the Phone Number ID from step 3 |

   `server/lib/whatsapp.js` checks for both and only ever calls the real API
   once they're set — until then every call safely logs an intent and
   returns `{ sent: false, reason: 'not_configured' }`, and the existing
   in-app notification still fires regardless (see `notify()` in
   `server/index.js`).

## Extending beyond the one template shipped here

Add more send points the same way the award handler does it — call
`notifyDriverAsync({ to, template, params })` from `server/lib/whatsapp.js`
at the next moment that matters (POD reminder, demurrage alert), and submit
that template through the same Meta review process above. The SMS fallback
tier (per STRATEGY.md's WhatsApp → SMS → in-app order) is not built —
that's the next piece once WhatsApp is live and its failure rate is known.

// Client-side document extraction via Puter.js — free, no API key; the
// signed-in Puter user's own account covers usage (a one-time sign-in
// popup appears on first use), not Loadbyton's. This is what makes OCR
// buildable here at all: Loadbyton itself never holds a vision-API key.
//
// Loaded via the <script src="https://js.puter.com/v2/" defer> tag in
// index.html, so window.puter may not exist yet the instant a component
// mounts — waitForPuter() polls for it with a bounded timeout rather than
// assuming it's ready. Every export here is explicitly best-effort: a
// failure (network, timeout, the model returning something unparsable)
// throws a plain Error with a message meant to be shown directly to the
// user, and callers must treat extraction as a suggestion to review, never
// as authoritative — nothing here writes to the database on its own.

function waitForPuter(timeoutMs = 10000) {
  if (window.puter?.ai?.chat) return Promise.resolve(window.puter);
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (window.puter?.ai?.chat) {
        clearInterval(interval);
        resolve(window.puter);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('AI extraction is unavailable right now (Puter.js did not load). You can still fill this in manually.'));
      }
    }, 150);
  });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function messageText(response) {
  if (typeof response === 'string') return response;
  if (typeof response?.text === 'string') return response.text;
  const content = response?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : c.text || '')).join('');
  return String(response ?? '');
}

function extractJsonObject(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error("The AI response didn't contain readable data — try a clearer photo.");
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new Error("Couldn't parse the AI's response — try a clearer photo.");
  }
}

// dataUrl: data:<mime>;base64,... (from fileToDataUrl). fields: array of
// { key, description }. Returns { fields: { [key]: string|null }, raw }.
// Every requested key is present in the result (null if not found) so
// callers never have to guard against a missing key.
export async function extractDocumentFields(dataUrl, fields) {
  const puter = await waitForPuter();
  const schema = fields.map((f) => `  "${f.key}": string or null — ${f.description}`).join('\n');
  const prompt =
    'You are extracting structured data from a photo of a UAE business/logistics document. ' +
    'Look only at what is actually visible in the image. Respond with ONLY a single JSON object ' +
    '(no prose, no markdown code fences) with exactly these keys:\n{\n' + schema + '\n}\n' +
    'Use null for any field you cannot clearly read. Never guess or invent a value.';

  let response;
  try {
    response = await puter.ai.chat(prompt, dataUrl, { model: 'gpt-4o' });
  } catch (err) {
    throw new Error(err?.message || 'AI extraction failed. You can still fill this in manually.');
  }

  const text = messageText(response);
  const parsed = extractJsonObject(text);
  const out = {};
  for (const f of fields) {
    const v = parsed[f.key];
    out[f.key] = typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  return { fields: out, raw: text };
}

import React, { useRef, useState } from 'react';
import { Button } from './ui.jsx';
import { IconSparkle } from './icons.jsx';
import { fileToDataUrl, extractDocumentFields } from '../lib/puterOcr.js';

// Reusable "scan a photo to autofill" control. fields: [{ key, description }]
// (passed straight through to extractDocumentFields); onExtract receives
// { [key]: string|null } and decides what to do with it — this component
// never writes to any form state itself, so every call site stays in
// control of which fields actually get overwritten.
export default function ScanWithAi({ fields, onExtract, label = 'Scan with AI', className = '' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const dataUrl = await fileToDataUrl(file);
      const { fields: extracted } = await extractDocumentFields(dataUrl, fields);
      onExtract(extracted);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFile} />
      <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
        <IconSparkle size={13} /> {label}
      </Button>
      {error ? (
        <p className="mt-1 text-xs text-status-danger">{error}</p>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">AI-suggested from a photo — please check before submitting.</p>
      )}
    </div>
  );
}

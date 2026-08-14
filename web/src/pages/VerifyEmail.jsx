import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Card } from '../components/ui.jsx';
import { usePageTitle } from '../lib/seo.jsx';

export default function VerifyEmail() {
  usePageTitle('Verify your email');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { refresh } = useAuth();
  const [status, setStatus] = useState('checking'); // checking | ok | error

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    api
      .verifyEmail(token)
      .then(() => { setStatus('ok'); refresh().catch(() => {}); })
      .catch(() => setStatus('error'));
  }, [token, refresh]);

  return (
    <div className="container-page flex min-h-[calc(100vh-4rem)] items-center justify-center py-16">
      <Card className="w-full max-w-md p-8 text-center">
        <p className="font-display text-xl font-semibold text-ink">Verify your email</p>
        {status === 'checking' && <p className="mt-3 text-sm text-ink-muted">Confirming…</p>}
        {status === 'ok' && (
          <p className="mt-3 rounded-md px-3 py-2.5 text-sm" style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
            Your email is verified.
          </p>
        )}
        {status === 'error' && (
          <p className="mt-3 rounded-md px-3 py-2.5 text-sm" style={{ background: 'var(--status-danger-bg)', color: 'var(--status-danger)' }}>
            This link is invalid or has expired. You can request a new one from your account menu.
          </p>
        )}
        <p className="mt-5 text-sm text-ink-muted">
          <Link to="/" className="font-medium text-brand-secondary hover:underline">Back to Loadbyton</Link>
        </p>
      </Card>
    </div>
  );
}

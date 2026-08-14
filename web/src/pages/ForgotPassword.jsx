import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Button, Input, Label, Card } from '../components/ui.jsx';
import { usePageTitle } from '../lib/seo.jsx';

export default function ForgotPassword() {
  usePageTitle('Reset your password');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.forgotPassword(email);
    } finally {
      // Always show the same confirmation, whether or not the account
      // exists — the response itself must not reveal that (see F3 in the
      // gstack review: server/index.js POST /api/auth/forgot-password).
      setSent(true);
      setLoading(false);
    }
  }

  return (
    <div className="container-page flex min-h-[calc(100vh-4rem)] items-center justify-center py-16">
      <Card className="w-full max-w-md p-8">
        <p className="font-display text-xl font-semibold text-ink">Reset your password</p>
        <p className="mt-1 text-sm text-ink-muted">We'll email you a link to set a new one.</p>

        {sent ? (
          <p className="mt-6 rounded-md px-3 py-2.5 text-sm" style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
            If an account exists for that email, a reset link is on its way.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.ae" />
            </div>
            <Button type="submit" className="w-full" loading={loading}>Send reset link</Button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-ink-muted">
          <Link to="/login" className="font-medium text-brand-secondary hover:underline">Back to log in</Link>
        </p>
      </Card>
    </div>
  );
}

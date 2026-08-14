import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Button, Input, Label, Card } from '../components/ui.jsx';
import { usePageTitle } from '../lib/seo.jsx';

export default function ResetPassword() {
  usePageTitle('Set a new password');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not reset your password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-page flex min-h-[calc(100vh-4rem)] items-center justify-center py-16">
      <Card className="w-full max-w-md p-8">
        <p className="font-display text-xl font-semibold text-ink">Set a new password</p>

        {!token ? (
          <p className="mt-6 rounded-md px-3 py-2.5 text-sm" style={{ background: 'var(--status-danger-bg)', color: 'var(--status-danger)' }}>
            This link is missing its reset token. Request a new one from the <Link to="/forgot-password" className="underline">reset page</Link>.
          </p>
        ) : done ? (
          <>
            <p className="mt-6 rounded-md px-3 py-2.5 text-sm" style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
              Password updated. Every device you were signed in on has been logged out.
            </p>
            <Button className="mt-4 w-full" onClick={() => navigate('/login')}>Log in</Button>
          </>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="password">New password</Label>
              <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            {error && (
              <p className="rounded-md px-3 py-2 text-sm" style={{ background: 'var(--status-danger-bg)', color: 'var(--status-danger)' }}>
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" loading={loading}>Set new password</Button>
          </form>
        )}
      </Card>
    </div>
  );
}

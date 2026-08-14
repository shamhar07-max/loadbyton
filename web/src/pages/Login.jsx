import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, roleHome } from '../lib/auth.jsx';
import { ApiError } from '../lib/api.js';
import { Button, Input, Label, Card } from '../components/ui.jsx';
import { usePageTitle } from '../lib/seo.jsx';
import { useLocale } from '../lib/i18n.jsx';

export default function Login() {
  usePageTitle('Log in');
  const { login } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', totpCode: '' });
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login({ email: form.email, password: form.password, totpCode: form.totpCode || undefined });
      const dest = location.state?.from?.pathname || roleHome(user.role);
      navigate(dest, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && /authentication code/i.test(err.message)) setNeedsMfa(true);
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-page flex min-h-[calc(100vh-4rem)] items-center justify-center py-16">
      <Card className="w-full max-w-md p-8">
        <p className="font-display text-xl font-semibold text-ink">Log in to Loadbyton</p>
        <p className="mt-1 text-sm text-ink-muted">Post loads, bid on freight, or run the ops console.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.ae" />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Link to="/forgot-password" className="mb-1.5 text-xs font-medium text-brand-secondary hover:underline">Forgot password?</Link>
            </div>
            <Input id="password" type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
          </div>
          {needsMfa && (
            <div>
              <Label htmlFor="totp">6-digit authentication code</Label>
              <Input id="totp" inputMode="numeric" maxLength={6} value={form.totpCode} onChange={(e) => setForm({ ...form, totpCode: e.target.value })} placeholder="123456" />
            </div>
          )}
          {error && (
            <p className="rounded-md px-3 py-2 text-sm" style={{ background: 'var(--status-danger-bg)', color: 'var(--status-danger)' }}>
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" loading={loading}>{t('auth.login')}</Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-muted">
          New to Loadbyton? <Link to="/register" className="font-medium text-brand-secondary hover:underline">Create an account</Link>
        </p>

        <div className="mt-6 rounded-md border px-4 py-3 text-xs text-ink-muted" style={{ borderColor: 'var(--border-default)' }}>
          <p className="mb-1 font-medium text-ink-secondary">Demo accounts (password: demo1234)</p>
          {/* Admin is deliberately not seeded/advertised here — it can decrypt
              carrier IBAN/TRN, impersonate users, and release escrow, so it's
              never one of the publicly-invited demo logins (see server/seed.js). */}
          <p>shipper@jebelalilogistics.ae · carrier@dubaidrayage.com</p>
        </div>
      </Card>
    </div>
  );
}

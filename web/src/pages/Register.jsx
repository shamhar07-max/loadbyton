import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, roleHome } from '../lib/auth.jsx';
import { Button, Input, Label, Card } from '../components/ui.jsx';
import { usePageTitle } from '../lib/seo.jsx';
import { useLocale } from '../lib/i18n.jsx';

export default function Register() {
  usePageTitle('Create your account');
  const { register } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState(params.get('role') === 'CARRIER' ? 'CARRIER' : 'SHIPPER');
  const [form, setForm] = useState({
    companyName: '', email: '', password: '', phone: '', trnNumber: '', tradeLicenseNumber: '', referralCode: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await register({ ...form, role });
      navigate(roleHome(user.role), { replace: true });
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-page flex min-h-[calc(100vh-4rem)] items-center justify-center py-16">
      <Card className="w-full max-w-lg p-8">
        <p className="font-display text-xl font-semibold text-ink">Create your account</p>
        <p className="mt-1 text-sm text-ink-muted">Post drayage jobs, or bid on them — pick which one you are.</p>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-md border p-1" style={{ borderColor: 'var(--border-default)' }}>
          {['SHIPPER', 'CARRIER'].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className="rounded-md px-3 py-2 text-sm font-medium transition-colors"
              style={role === r ? { background: 'var(--brand-primary)', color: 'var(--text-inverse)' } : { color: 'var(--text-secondary)' }}
            >
              {r === 'SHIPPER' ? t('auth.roleShipper', 'I ship freight') : t('auth.roleCarrier', 'I move freight')}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="companyName">{t('auth.companyName')}</Label>
            <Input id="companyName" required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Al-Majid Global Freight" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.ae" />
            </div>
            <div>
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+971 4 000 0000" />
            </div>
            <div>
              <Label htmlFor="trn">TRN number</Label>
              <Input id="trn" value={form.trnNumber} onChange={(e) => setForm({ ...form, trnNumber: e.target.value })} placeholder="100XXXXXXXXXXX" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="license">Trade licence number</Label>
              <Input id="license" value={form.tradeLicenseNumber} onChange={(e) => setForm({ ...form, tradeLicenseNumber: e.target.value })} placeholder="CN-XXXXXXX" />
            </div>
            <div>
              <Label htmlFor="referral">Referral code (optional)</Label>
              <Input id="referral" value={form.referralCode} onChange={(e) => setForm({ ...form, referralCode: e.target.value })} placeholder="CAR-EMIRATES" />
            </div>
          </div>
          {role === 'CARRIER' && (
            <p className="rounded-md px-3 py-2 text-xs" style={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}>
              New carrier accounts need admin verification (TRN, trade licence, insurance) before bidding — usually reviewed within a day.
            </p>
          )}
          {error && (
            <p className="rounded-md px-3 py-2 text-sm" style={{ background: 'var(--status-danger-bg)', color: 'var(--status-danger)' }}>
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" loading={loading}>{t('auth.register')}</Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-muted">
          Already have an account? <Link to="/login" className="font-medium text-brand-primary hover:underline">Log in</Link>
        </p>
      </Card>
    </div>
  );
}

import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, roleHome } from '../lib/auth.jsx';
import { useLocale } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { IconMenu, IconClose, IconBell, IconLogOut, IconUser, IconMoon, IconSun } from './icons.jsx';
import { useToasts } from './Toast.jsx';

export function Logo({ dark = false, className = '' }) {
  return (
    <Link to="/" className={`flex shrink-0 items-center gap-2 ${className}`} aria-label="Loadbyton home">
      <img src="/brand/logo-mark.svg" alt="" width={28} height={28} style={{ color: dark ? '#F8FAFC' : 'var(--brand-primary)' }} />
      <span className="whitespace-nowrap font-display text-lg font-semibold tracking-tight" style={{ color: dark ? '#F8FAFC' : 'var(--text-primary)' }}>
        Loadbyton
      </span>
    </Link>
  );
}

// Nav labels are translated (see lib/i18n.jsx); every other page in the
// app is still English-only — see the scope note at the top of i18n.jsx.
function navByRole(t) {
  return {
    SHIPPER: [
      { to: '/dashboard', label: t('nav.dashboard', 'Dashboard') },
      { to: '/templates', label: t('nav.templates', 'Templates') },
      { to: '/contracts', label: t('nav.contracts', 'Contract lanes') },
    ],
    CARRIER: [
      { to: '/open-loads', label: t('nav.openLoads', 'Open loads') },
      { to: '/my-bids', label: t('nav.myBids', 'My bids') },
      { to: '/won-jobs', label: t('nav.wonJobs', 'Won jobs') },
      { to: '/earnings', label: t('nav.earnings', 'Earnings') },
    ],
    ADMIN: [
      { to: '/admin', label: t('nav.admin', 'Admin console') },
    ],
  };
}

export function Shell({ children }) {
  const { user, logout, theme, setTheme, walkthroughFinished, walkthroughStep, completeWalkthrough, setWalkthroughStep, endImpersonation, actingAs } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const NAV_BY_ROLE = navByRole(t);
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [endingImpersonation, setEndingImpersonation] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const navItems = user ? NAV_BY_ROLE[user.role] || [] : [];
  const { addToast } = useToasts();

  async function handleResendVerification() {
    setResendingVerification(true);
    try {
      await api.resendVerification();
      addToast({ type: 'system_message', title: 'Verification email sent', body: 'Check your inbox for the link.' });
    } catch (err) {
      addToast({ type: 'system_message', title: 'Could not send verification email', body: err.message });
    } finally {
      setResendingVerification(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/');
    addToast({
      type: 'system_message',
      title: 'Session ended',
      body: 'You have been logged out.',
    });
  }

  async function handleEndImpersonation() {
    setEndingImpersonation(true);
    try {
      await endImpersonation();
      navigate('/admin');
    } finally {
      setEndingImpersonation(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {user?.impersonating && (
        <div className="flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium text-white" style={{ background: 'var(--status-danger)' }}>
          <span>Impersonating {user.profile?.company_name || user.email} — actions here are logged to the audit trail.</span>
          <button onClick={handleEndImpersonation} disabled={endingImpersonation} className="rounded-md border border-white/40 px-2.5 py-1 text-xs font-semibold hover:bg-white/10">
            {endingImpersonation ? 'Returning…' : 'Return to admin'}
          </button>
        </div>
      )}

      {user && !user.email_verified && !user.impersonating && (
        <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-sm" style={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}>
          <span>Verify your email to keep full access to your account.</span>
          <button onClick={handleResendVerification} disabled={resendingVerification} className="font-semibold underline underline-offset-2 disabled:opacity-60">
            {resendingVerification ? 'Sending…' : 'Resend verification email'}
          </button>
        </div>
      )}
      {/* bg-surface/95, not a plain Tailwind opacity modifier: --bg-surface is a
          plain hex custom property, and Tailwind can't apply an alpha modifier
          to that (it silently drops it, leaving the header fully transparent —
          a real bug this replaced, where scrolled content showed straight
          through the "sticky" header). color-mix() works with any custom
          property, no token-format changes needed. */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur"
        style={{ borderColor: 'var(--border-default)', backgroundColor: 'color-mix(in srgb, var(--bg-surface) 95%, transparent)' }}
      >
        <div className="container-page flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => (
                <NavLink key={item.label} to={item.to} className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}>
                  {item.label}
                </NavLink>
              ))}
              {!user && (
                <>
                  <NavLink key="features" to="/features" className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}>{t('nav.features', 'Features')}</NavLink>
                  <NavLink key="pricing" to="/pricing" className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}>{t('nav.pricing', 'Pricing')}</NavLink>
                  <NavLink key="about" to="/about" className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}>{t('nav.about', 'About')}</NavLink>
                </>
              )}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
              className="nav-link hidden text-sm font-semibold sm:inline-flex"
              aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
              title={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
            >
              {locale === 'ar' ? 'EN' : 'ع'}
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="nav-link hidden md:inline-flex"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </button>
            {user ? (
              <>
                <Link to="/notifications" className="nav-link relative" aria-label="Notifications">
                  <IconBell size={19} />
                  {user.unreadNotifications > 0 && (
                    <span className="absolute -top-1 right-1 bg-brand-primary text-white text-xs rounded-full w-3 h-3">{user.unreadNotifications}</span>
                  )}
                </Link>
                <div className="relative">
                  <button onClick={() => setMenuOpen((v) => !v)} className="nav-link flex items-center gap-2" aria-haspopup="true" aria-expanded={menuOpen}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-ink-inverse" style={{ background: 'var(--brand-primary)' }}>
                      {user.profile?.company_name?.[0]?.toUpperCase() || <IconUser size={14} />}
                    </span>
                    <span className="hidden text-sm font-medium sm:inline">{user.profile?.company_name || user.email}</span>
                  </button>
                  {menuOpen && (
                    <div className="animate-menu-in absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border bg-surface shadow-lg" style={{ borderColor: 'var(--border-default)' }} onMouseLeave={() => setMenuOpen(false)}>
                      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-default)' }}>
                        <p className="truncate text-sm font-medium text-ink">{actingAs ? actingAs.displayName || actingAs.email : user.email}</p>
                        <p className="text-xs text-ink-muted">
                          {actingAs ? `Seat · ${actingAs.seatRole}` : `${user.role} · ${user.tier}`}
                        </p>
                        {actingAs && <p className="mt-1 text-xs text-ink-muted">Acting on behalf of {user.profile?.company_name || user.email}</p>}
                      </div>
                      <Link to="/profile" className="block px-4 py-2.5 text-sm text-ink-secondary hover:bg-raised" onClick={() => setMenuOpen(false)}>
                        Profile & settings
                      </Link>
                      <Link to={roleHome(user.role)} className="block px-4 py-2.5 text-sm text-ink-secondary hover:bg-raised" onClick={() => setMenuOpen(false)}>
                        Dashboard
                      </Link>
                      <button onClick={handleLogout} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-status-danger hover:bg-raised">
                        <IconLogOut size={15} /> Log out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost hidden sm:inline-flex">{t('nav.login', 'Log in')}</Link>
                <Link to="/register" className="btn-primary">{t('nav.register', 'Get started')}</Link>
              </>
            )}

            <button className="nav-link md:hidden" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle menu">
              {mobileOpen ? <IconClose size={20} /> : <IconMenu size={20} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="animate-panel-in border-t px-5 py-3 md:hidden" style={{ borderColor: 'var(--border-default)' }}>
            <div className="flex flex-col gap-1">
              {(user ? navItems : [
                { to: '/features', label: t('nav.features', 'Features') },
                { to: '/pricing', label: t('nav.pricing', 'Pricing') },
                { to: '/about', label: t('nav.about', 'About') },
                { to: '/login', label: t('nav.login', 'Log in') },
              ]).map((item) => (
                <NavLink key={item.to} to={item.to} className="nav-link" onClick={() => setMobileOpen(false)}>
                  {item.label}
                </NavLink>
              ))}
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="nav-link flex items-center gap-2 text-left"
              >
                {theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
              <button
                onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
                className="nav-link text-left"
              >
                {locale === 'ar' ? 'English' : 'العربية'}
              </button>
            </div>
          </nav>
        )}
      </header>

      {user && !walkthroughFinished && (
        <WalkthroughModal step={walkthroughStep} onStep={setWalkthroughStep} onFinish={completeWalkthrough} />
      )}

      <main className="flex-1">{children}</main>

      <footer className="border-t" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          {/* D1 (gstack review): this was <Logo dark />, hardcoding white
              wordmark text regardless of theme — invisible (1.00:1 contrast)
              against this footer's theme-aware light-mode background. The
              footer has no fixed-dark background of its own (unlike the
              brand mark's tile, which is intentionally fixed-color), so the
              logo should use the same theme-aware text token every other
              surface does. */}
          <Logo />
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
            <Link to="/features" className="hover:text-ink">Features</Link>
            <Link to="/pricing" className="hover:text-ink">Pricing</Link>
            <Link to="/about" className="hover:text-ink">About</Link>
            <Link to="/blog" className="hover:text-ink">Blog</Link>
            <Link to="/security" className="hover:text-ink">Security</Link>
            <Link to="/compliance" className="hover:text-ink">Compliance</Link>
          </div>
          <p className="text-xs text-ink-muted" dir="ltr">© {new Date().getFullYear()} Loadbyton. Demo system — payouts are simulated, not real transfers.</p>
        </div>
      </footer>
    </div>
  );
}

const WALKTHROUGH_STEPS = [
  { title: 'Post your first requirement', body: 'Create a job post that verified carriers can bid on.', cta: "Let's start" },
  { title: 'Review carrier bids', body: 'Compare price, ETA, and ratings from competing carriers.', cta: 'Next' },
  { title: 'Award and track', body: 'Accept a bid, mark status updates, and release payouts.', cta: 'Got it' },
];

function WalkthroughModal({ step, onStep, onFinish }) {
  const current = WALKTHROUGH_STEPS[Math.min(step, WALKTHROUGH_STEPS.length - 1)];
  const isLast = step >= WALKTHROUGH_STEPS.length - 1;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label="Welcome walkthrough">
      <div className="w-full max-w-md rounded-lg border bg-surface p-8 shadow-2xl" style={{ borderColor: 'var(--border-default)' }}>
        <h2 className="font-display text-xl font-semibold text-ink">Welcome to Loadbyton</h2>
        <p className="mt-1 mb-6 text-sm text-ink-muted">Step {step + 1} of {WALKTHROUGH_STEPS.length}</p>

        <div className="mb-1 flex gap-1.5">
          {WALKTHROUGH_STEPS.map((_, i) => (
            <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? 'var(--brand-accent)' : 'var(--border-default)' }} />
          ))}
        </div>

        <div className="mt-6">
          <h3 className="font-medium text-ink">{current.title}</h3>
          <p className="mt-1 text-sm text-ink-muted">{current.body}</p>
          <button onClick={() => (isLast ? onFinish() : onStep(step + 1))} className="btn-accent w-full mt-4">
            {current.cta}
          </button>
        </div>

        <div className="mt-6 border-t pt-4 text-center" style={{ borderColor: 'var(--border-subtle)' }}>
          <button onClick={onFinish} className="text-xs font-medium text-ink-muted hover:text-ink">
            Skip — don't show this again
          </button>
        </div>
      </div>
    </div>
  );
}
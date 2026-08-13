import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, roleHome } from '../lib/auth.jsx';
import { IconMenu, IconClose, IconBell, IconLogOut, IconUser, IconMoon, IconSun } from './icons.jsx';
import { useToasts } from './Toast.jsx';

export function Logo({ dark = false, className = '' }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`} aria-label="Loadbyton home">
      <img src="/brand/logo-mark.svg" alt="" width={28} height={28} style={{ color: dark ? '#F8FAFC' : 'var(--brand-primary)' }} />
      <span className="font-display text-lg font-semibold tracking-tight" style={{ color: dark ? '#F8FAFC' : 'var(--text-primary)' }}>
        Loadbyton
      </span>
    </Link>
  );
}

const NAV_BY_ROLE = {
  SHIPPER: [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/templates', label: 'Templates' },
    { to: '/contracts', label: 'Contract lanes' },
    { to: '/analytics-or-spend', label: 'Analytics', hidden: true },
  ],
  CARRIER: [
    { to: '/open-loads', label: 'Open loads' },
    { to: '/my-bids', label: 'My bids' },
    { to: '/won-jobs', label: 'Won jobs' },
    { to: '/notifications', label: 'Notifications' },
  ],
  ADMIN: [
    { to: '/admin', label: 'Admin console' },
  ],
};

export function Shell({ children }) {
  const { user, logout, theme, setTheme, isWalkthroughFinished, completeWalkthrough, setWalkthroughStep } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = user ? (NAV_BY_ROLE[user.role] || []).filter((i) => !i.hidden) : [];
  const { toasts, addToast, removeToast } = useToasts();

  async function handleLogout() {
    await logout();
    navigate('/');
    addToast({
      type: 'system_message',
      title: 'Session ended',
      body: 'You have been logged out.',
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 border-b bg-surface/95 backdrop-blur" style={{ borderColor: 'var(--border-default)' }}>
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
                  <NavLink key="features" to="/features" className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}>Features</NavLink>
                  <NavLink key="pricing" to="/pricing" className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}>Pricing</NavLink>
                  <NavLink key="about" to="/about" className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}>About</NavLink>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2">
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
                    <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border bg-surface shadow-lg" style={{ borderColor: 'var(--border-default)' }} onMouseLeave={() => setMenuOpen(false)}>
                      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-default)' }}>
                        <p className="truncate text-sm font-medium text-ink">{user.email}</p>
                        <p className="text-xs text-ink-muted">{user.role} · {user.tier}</p>
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
                <Link to="/login" className="btn-ghost hidden sm:inline-flex">Log in</Link>
                <Link to="/register" className="btn-primary">Get started</Link>
              </>
            )}

            <button className="nav-link md:hidden" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle menu">
              {mobileOpen ? <IconClose size={20} /> : <IconMenu size={20} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="border-t px-5 py-3 md:hidden" style={{ borderColor: 'var(--border-default)' }}>
            <div className="flex flex-col gap-1">
              {(user ? navItems : [
                { to: '/features', label: 'Features' },
                { to: '/pricing', label: 'Pricing' },
                { to: '/about', label: 'About' }
              ]).map((item) => (
                <NavLink key={item.to} to={item.to} className="nav-link" onClick={() => setMobileOpen(false)}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      {user && !isWalkthroughFinished() && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-8 max-w-md w-full shadow-2xl" style={{ borderColor: 'var(--border-default)' }}>
            <h2 className="font-display text-xl font-semibold text-ink mb-4">Welcome to Loadbyton</h2>
            <p className="text-sm text-ink-muted mb-6">Let's walk through the platform in 3 quick steps.</p>
            {isWalkthroughFinished() ? (
              <>
                <button onClick={() => navigate('/dashboard')} className="btn-primary w-full">Skip walkthrough</button>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-ink">Post your first requirement</h3>
                    <p className="text-ink-muted text-sm">Create a job post that verified carriers can bid on.</p>
                    <button onClick={() => setWalkthroughStep(1)} className="btn-accent w-full mt-2">Let's start</button>
                  </div>
                  <div>
                    <h3 className="font-medium text-ink">Review carrier bids</h3>
                    <p className="text-ink-muted text-sm">Compare price, ETA, and ratings from competing carriers.</p>
                    <button onClick={() => setWalkthroughStep(2)} className="btn-accent w-full mt-2">Next</button>
                  </div>
                  <div>
                    <h3 className="font-medium text-ink">Award and track</h3>
                    <p className="text-ink-muted text-sm">Accept a bid, mark status updates, and release payouts.</p>
                    <button onClick={() => setWalkthroughStep(3)} className="btn-accent w-full mt-2">Complete</button>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                  <p className="text-xs text-ink-muted">Dismiss permanently: <span className="font-medium" onClick={() => completeWalkthrough()}>Don't show again</span></p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <main className="flex-1">{children}</main>

      <div className="toast-container" role="region" aria-label="Notifications">
        {toasts?.map((toast) => (
          <Toast
            key={toast.id}
            toast={toast}
            onRemove={removeToast}
          />
        ))}
      </div>

      <footer className="border-t" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <Logo dark />
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
            <Link to="/features" className="hover:text-ink">Features</Link>
            <Link to="/pricing" className="hover:text-ink">Pricing</Link>
            <Link to="/about" className="hover:text-ink">About</Link>
            <Link to="/blog" className="hover:text-ink">Blog</Link>
          </div>
          <p className="text-xs text-ink-muted">© {new Date().getFullYear()} Loadbyton. Demo system — payouts are simulated, not real transfers.</p>
        </div>
      </footer>
    </div>
  );
}
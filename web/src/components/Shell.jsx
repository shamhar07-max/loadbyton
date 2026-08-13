import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth, roleHome } from '../lib/auth.jsx';
import { IconMenu, IconClose, IconBell, IconLogOut, IconUser } from './icons.jsx';

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
    { to: '/earnings-or-spend', label: 'Analytics', hidden: true },
  ],
  CARRIER: [
    { to: '/open-loads', label: 'Open loads' },
    { to: '/earnings', label: 'Earnings' },
  ],
  ADMIN: [
    { to: '/admin', label: 'Admin console' },
  ],
};

export function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = user ? (NAV_BY_ROLE[user.role] || []).filter((i) => !i.hidden) : [];

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 border-b bg-surface/95 backdrop-blur" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}>
                  {item.label}
                </NavLink>
              ))}
              {!user && (
                <>
                  <NavLink to="/features" className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}>Features</NavLink>
                  <NavLink to="/pricing" className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}>Pricing</NavLink>
                  <NavLink to="/about" className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}>About</NavLink>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link to="/notifications" className="nav-link relative" aria-label="Notifications">
                  <IconBell size={19} />
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
                      <button onClick={handleLogout} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-status-danger hover:bg-raised">
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
              {(user ? navItems : [{ to: '/features', label: 'Features' }, { to: '/pricing', label: 'Pricing' }, { to: '/about', label: 'About' }]).map((item) => (
                <NavLink key={item.to} to={item.to} className="nav-link" onClick={() => setMobileOpen(false)}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t" style={{ borderColor: 'var(--border-default)' }}>
        <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <Logo />
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

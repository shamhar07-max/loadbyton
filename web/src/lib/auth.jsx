import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [actingAs, setActingAs] = useState(null);
  const [loading, setLoading] = useState(true);
  // typeof-guarded on all three: this module also runs under Node during
  // build-time prerendering (see scripts/prerender.mjs), where
  // localStorage doesn't exist — prerender always gets the logged-out,
  // light-theme, walkthrough-not-finished default, which is correct since
  // a prerendered page is never shown to an already-signed-in browser
  // anyway (see the splice logic in server/index.js).
  const [theme, setTheme] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('loadbyton-theme') : null;
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [walkthroughStep, setWalkthroughStepState] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('loadbyton-walkthrough-step') : null;
    return saved ? Number(saved) : 0;
  });
  const [walkthroughFinished, setWalkthroughFinished] = useState(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem('loadbyton-walkthrough-finished') === 'true' : true)
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('loadbyton-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('loadbyton-walkthrough-step', String(walkthroughStep));
  }, [walkthroughStep]);

  useEffect(() => {
    localStorage.setItem('loadbyton-walkthrough-finished', String(walkthroughFinished));
  }, [walkthroughFinished]);

  useEffect(() => {
    api
      .me()
      .then((d) => { setUser(d.user); setActingAs(d.actingAs || null); })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (body) => {
    const d = await api.login(body);
    setUser(d.user);
    setActingAs(d.actingAs || null);
    return d.user;
  }, []);

  const register = useCallback(async (body) => {
    const d = await api.register(body);
    setUser(d.user);
    setActingAs(null);
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setActingAs(null);
  }, []);

  const refresh = useCallback(async () => {
    const d = await api.me();
    setUser(d.user);
    setActingAs(d.actingAs || null);
    return d.user;
  }, []);

  const endImpersonation = useCallback(async () => {
    const d = await api.endImpersonation();
    setUser(d.user);
    return d.user;
  }, []);

  const setWalkthroughStep = useCallback((step) => {
    setWalkthroughStepState(step);
  }, []);

  const completeWalkthrough = useCallback(() => {
    setWalkthroughFinished(true);
  }, []);

  const restartWalkthrough = useCallback(() => {
    setWalkthroughStepState(0);
    setWalkthroughFinished(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user, loading, login, register, logout, refresh, endImpersonation, theme, setTheme,
        walkthroughStep, setWalkthroughStep, walkthroughFinished, completeWalkthrough, restartWalkthrough,
        userRole: user?.role,
        actingAs, isOrgRoot: !actingAs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function roleHome(role) {
  if (role === 'SHIPPER') return '/dashboard';
  if (role === 'CARRIER') return '/open-loads';
  if (role === 'ADMIN') return '/admin';
  return '/';
}

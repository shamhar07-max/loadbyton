import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('loadbyton-theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('loadbyton-theme', theme);
  }, [theme]);

  useEffect(() => {
    api
      .me()
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (body) => {
    const d = await api.login(body);
    setUser(d.user);
    return d.user;
  }, []);

  const register = useCallback(async (body) => {
    const d = await api.register(body);
    setUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const d = await api.me();
    setUser(d.user);
    return d.user;
  }, []);

  const setWalkthroughStep = useCallback((step: number) => {
    localStorage.setItem('loadbyton-walkthrough', String(step));
  }, []);

  const getWalkthroughStep = useCallback(() => {
    const saved = localStorage.getItem('loadbyton-walkthrough');
    return saved ? Number(saved) : null;
  }, []);

  const completeWalkthrough = useCallback(() => {
    localStorage.setItem('loadbyton-walkthroughFinished', 'true');
    setWalkthroughStep(3);
  }, [setWalkthroughStep]);

  const isWalkthroughFinished = useCallback(() => {
    const finished = localStorage.getItem('loadbyton-walkthroughFinished');
    return finished === 'true';
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refresh, theme, setTheme, setWalkthroughStep, getWalkthroughStep, completeWalkthrough, isWalkthroughFinished, userRole: user?.role }}
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

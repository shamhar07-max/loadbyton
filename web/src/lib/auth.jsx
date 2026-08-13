import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, setUser }}>
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

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { IconShield, IconTruck, IconClock, IconCheck, IconAlert, IconInfo } from './icons.jsx';

// Toast type → icon + semantic color token. Colors are drawn from the
// existing design-token palette (never a one-off hex) so toasts stay
// consistent with badges/status pills elsewhere in the app.
export const toastTypes = {
  award: { icon: IconShield, color: 'var(--brand-accent)' },
  bid_received: { icon: IconTruck, color: 'var(--status-info)' },
  status_change: { icon: IconClock, color: 'var(--status-success)' },
  payout_released: { icon: IconCheck, color: 'var(--status-success)' },
  dispute_opened: { icon: IconAlert, color: 'var(--status-danger)' },
  dispute_resolved: { icon: IconCheck, color: 'var(--status-success)' },
  carrier_verified: { icon: IconShield, color: 'var(--status-info)' },
  system_message: { icon: IconInfo, color: 'var(--text-muted)' },
};

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

function ToastItem({ toast, onRemove }) {
  const [leaving, setLeaving] = useState(false);
  const timeout = toast.timeout || 5000;

  useEffect(() => {
    const dismissTimer = setTimeout(() => setLeaving(true), timeout);
    return () => clearTimeout(dismissTimer);
  }, [timeout]);

  useEffect(() => {
    if (!leaving) return;
    // Single owner of the exit animation: React state drives the CSS class,
    // and this is the only timer that ever calls onRemove — no competing
    // CSS-only animation racing a separate JS timeout.
    const removeTimer = setTimeout(() => onRemove(toast.id), 200);
    return () => clearTimeout(removeTimer);
  }, [leaving, onRemove, toast.id]);

  const typeConfig = toastTypes[toast.type] || toastTypes.system_message;
  const Icon = typeConfig.icon;

  return (
    <div className={cx('toast', leaving && 'toast-leaving')} role="status">
      <div className="toast-icon" style={{ color: typeConfig.color }}>
        <Icon size={20} />
      </div>
      <div className="toast-message">
        <p className="font-medium text-ink">{toast.title}</p>
        {toast.body && <p className="text-ink-muted">{toast.body}</p>}
      </div>
      <button className="toast-dismiss" onClick={() => setLeaving(true)} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="toast-container" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ type, title, body, timeout }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, type, title, body, timeout }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => setToasts([]), []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearToasts }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts must be used within ToastProvider');
  return ctx;
}

import React, { useRef, useState, useEffect, useCallback } from 'react';

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

const toastTypes = {
  award: { icon: 'Gavel', color: 'var(--brand-accent)' },
  bid_received: { icon: 'Post', color: 'var(--lb-blue-600)' },
  status_change: { icon: 'Clock', color: 'var(--lb-teal-600)' },
  payout_released: { icon: 'Cash', color: 'var(--lb-teal-600)' },
  dispute_opened: { icon: 'Shield', color: 'var(--lb-red-600)' },
  dispute_resolved: { icon: 'Check', color: 'var(--lb-teal-600)' },
  carrier_verified: { icon: 'Users', color: 'var(--lb-blue-600)' },
  system_message: { icon: 'Help', color: 'var(--lb-purple-600)' },
};

function Toast({ toast, onRemove }) {
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const toastRef = useRef(null);

  useEffect(() => {
    setVisible(true);
    const id = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(toast.id), 300);
    }, toast.timeout || 5000);
    return () => clearTimeout(id);
  }, [toast, onRemove]);

  const handleMouseEnter = () => setEntered(true);
  const handleMouseLeave = () => setEntered(false);

  if (!visible) return null;

  const typeConfig = toastTypes[toast.type] || toastTypes.system_message;
  const iconComponent = typeConfig.icon;

  return (
    <div
      ref={toastRef}
      className={cx(
        'toast',
        {
          'toast--award': toast.type === 'award',
          'toast--bid-received': toast.type === 'bid_received',
          'toast--status-change': toast.type === 'status_change',
          'toast--payout-released': toast.type === 'payout_released',
          'toast--dispute-opened': toast.type === 'dispute_opened',
          'toast--dispute-resolved': toast.type === 'dispute_resolved',
          'toast--carrier-verified': toast.type === 'carrier_verified',
          'toast--system-message': toast.type === 'system_message',
        }
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="icon" style={{ color: typeConfig.color }}>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d={iconComponent} />
        </svg>
      </div>
      <div className="message">
        <div className="font-medium">{toast.title}</div>
        <div className="text-ink-muted">{toast.body}</div>
      </div>
      <button
        className="action"
        onClick={() => onRemove(toast.id)}
        aria-label="Dismiss toast"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ type, title, body, timeout, onAction }) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, title, body, timeout, onAction, autoDismiss: true }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => setToasts([]), []);

  return { toasts, addToast, removeToast, clearToasts };
}

export default Toast;
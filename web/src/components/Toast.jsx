import React, { useRef, useState, useEffect } from 'react';

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

function Toast({ type, title, body, timeout = 5000, onAction }) {
  const [show, setShow] = useState(false);
  const [entered, setEntered] = useState(false);
  const toastRef = useRef(null);

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setShow(false), timeout);
    return () => clearTimeout(id);
  }, [show, timeout]);

  const handleMouseEnter = () => setEntered(true);
  const handleMouseLeave = () => setEntered(false);

  const timeoutDuration = entered ? 10000 : timeout;

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setShow(false), timeoutDuration);
    return () => clearTimeout(id);
  }, [show, entered, timeoutDuration]);

  if (!show) return null;

  const typeConfig = toastTypes[type] || toastTypes.system_message;
  const iconComponent = typeConfig.icon;

  return (
    <div
      ref={toastRef}
      className={cx(
        'toast',
        {
          'toast--award': type === 'award',
          'toast--bid-received': type === 'bid_received',
          'toast--status-change': type === 'status_change',
          'toast--payout-released': type === 'payout_released',
          'toast--dispute-opened': type === 'dispute_opened',
          'toast--dispute-resolved': type === 'dispute_resolved',
          'toast--carrier-verified': type === 'carrier_verified',
          'toast--system-message': type === 'system_message',
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
        <div className="font-medium">{title}</div>
        <div className="text-ink-muted">{body}</div>
      </div>
      <button
        className="action"
        onClick={() => onAction && onAction()}
        aria-label="Extend toast duration"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M15 18l-3-3a2.5 2.5 0 0 0-1.75-1.25H7.5q-.5 0-.75.25L4 15l2.5 2.25q-.15.3-.15.65v1q0 .3.15.65l3 3a2.5 2.5 0 0 0 1.75 1.25h5q.5 0 .75-.25l3-3a2.5 2.5 0 0 0 0-2.5H16z" />
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
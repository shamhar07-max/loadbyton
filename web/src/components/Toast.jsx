import React, { useRef, useState, useEffect, useCallback } from 'react';

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

const iconPaths = {
  Gavel: 'M12 2L2 7l10 5 10-5-10-5zM2 7a5 5 0 0 0 5 5h3a5 5 0 0 0 5-5V7z',
  Post: 'M4 2v14h8L12 6l8-2V2zm5.5 4.936c-.966 0-1.733-.77-1.733-1.733s.767-1.733 1.733-1.733a1.733 1.733 0 0 1 1.733 1.733s-.767.77-1.733.733zM12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM6 12a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM18 12a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM9 10h6v2H9v-2zm5.5-.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.z',
  Clock: 'M12 1v3m0 16v-3m9-4h-3M4 12H3a9 9 0 1 1 0-18h18a9 9 0 1 1 0 18h-3z',
  Cash: 'M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm0 2a8 8 0 1 0 8 8A8.013 8.013 0 0 0 12 4zm0 6a4 4 0 1 0 0-4 4 4 0 0 0 0 4z',
  Shield: 'M12 3v7m5-6l-6 6L6 17M6 17l6 6 6-6M6 11a4 4 0 0 1 8 0',
  Check: 'M12 2l3.09 6.26L22 9.27l-5.43 2.17 3.18 6.76 6-11.28L12 3zM2 9.27l-5.43 2.17 3.18 6.76L12 15.76l-6.29-2.32 2.42-5.95zM9.9 9.9l2.12 2.12 5.35-5.35m0 4l1.41 1.41m-5.66-1.41a3.18 3.18 0 1 1-4.53-4.53l-.03-.03a3.18 3.18 0 0 1 4.53 4.53l.93 1.27z',
  Users: 'M17 21v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1m8 4h-3a2 2 0 0 0 0 4h3m-3-3H7m5 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 18l-3.75 1.5m1.5-3.75l5.25-2.1L7 14.25l3.75 1.5m1.5 3.75l5.25 2.1L7 9.75l-3.75-1.5z',
  Help: 'M11.24 15.32a1 1 0 0 1 .7 1.4l1.522 6.374a1 1 0 0 1-1.41 1.393l-.983-.216a9.936 9.936 0 0 1-4.505-1.843L4.124 10.6a1 1 0 0 1 .297-1.063l1.522-6.375a1 1 0 0 1 1.41-.395m7.86 0a9.935 9.935 0 0 1 2.137 1.6l.962-.352a1 1 0 0 1-.364 1.828l-1.522 6.374a1 1 0 0 1-1.413.395m-7.86 0a9.936 9.936 0 0 1-2.137-1.6l-.962.352a1 1 0 0 1 .364-1.828l1.522-6.374a1 1 0 0 1 1.413.395z',
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
  const iconPath = iconPaths[typeConfig.icon];

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
          {iconPath && <path d={iconPath} />}
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
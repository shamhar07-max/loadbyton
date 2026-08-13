import React from 'react';

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- Button
const BUTTON_VARIANTS = {
  primary: 'btn-primary',
  accent: 'btn-accent',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  outline: 'btn-secondary',
};

export function Button({ variant = 'primary', className, children, loading, ...props }) {
  return (
    <button className={cx(BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary, className)} disabled={loading || props.disabled} {...props}>
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Card
export function Card({ className, children, ...props }) {
  return (
    <div className={cx('card', className)} {...props}>
      {children}
    </div>
  );
}
Card.Header = function CardHeader({ className, children, ...props }) {
  return (
    <div className={cx('flex items-start justify-between gap-3 border-b px-5 py-4', className)} style={{ borderColor: 'var(--border-default)' }} {...props}>
      {children}
    </div>
  );
};
Card.Title = function CardTitle({ className, children, ...props }) {
  return (
    <h3 className={cx('font-display text-base font-semibold text-ink', className)} {...props}>
      {children}
    </h3>
  );
};
Card.Content = function CardContent({ className, children, ...props }) {
  return (
    <div className={cx('p-5', className)} {...props}>
      {children}
    </div>
  );
};
Card.Footer = function CardFooter({ className, children, ...props }) {
  return (
    <div className={cx('flex items-center justify-end gap-2 border-t px-5 py-4', className)} style={{ borderColor: 'var(--border-default)' }} {...props}>
      {children}
    </div>
  );
};

// ----------------------------------------------------------------- Badge
const BADGE_COLORS = {
  neutral: { background: 'var(--bg-raised)', color: 'var(--text-secondary)' },
  success: { background: 'var(--status-success-bg)', color: 'var(--status-success)' },
  warning: { background: 'var(--status-warning-bg)', color: 'var(--status-warning)' },
  danger: { background: 'var(--status-danger-bg)', color: 'var(--status-danger)' },
  info: { background: 'var(--status-info-bg)', color: 'var(--status-info)' },
  accent: { background: 'var(--lb-amber-100)', color: 'var(--brand-accent)' },
};

export function Badge({ color = 'neutral', dot = true, className, children }) {
  const style = BADGE_COLORS[color] || BADGE_COLORS.neutral;
  return (
    <span className={cx('badge', className)} style={style}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />}
      {children}
    </span>
  );
}

// -------------------------------------------------------- status helpers
const JOB_STATUS_COLOR = {
  DRAFT: 'neutral', OPEN: 'info', AWARDED: 'accent', PICKED_UP: 'warning',
  IN_TRANSIT: 'warning', DELIVERED: 'success', COMPLETED: 'success',
  CANCELLED: 'danger', DISPUTED: 'danger',
};
export function StatusBadge({ status }) {
  return <Badge color={JOB_STATUS_COLOR[status] || 'neutral'}>{status?.replaceAll('_', ' ')}</Badge>;
}

const ESCROW_COLOR = { PENDING: 'neutral', HELD: 'warning', FUNDED: 'info', RELEASED: 'success', DISPUTED: 'danger' };
export function EscrowBadge({ status }) {
  return <Badge color={ESCROW_COLOR[status] || 'neutral'}>Escrow: {status}</Badge>;
}

// ----------------------------------------------------------------- Input
export function Label({ className, children, ...props }) {
  return (
    <label className={cx('label', className)} {...props}>
      {children}
    </label>
  );
}
export const Input = React.forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx('input', className)} {...props} />;
});
export const Textarea = React.forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx('input', className)} {...props} />;
});
export const Select = React.forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cx('input', className)} {...props}>
      {children}
    </select>
  );
});

// --------------------------------------------------------------- Spinner
export function Spinner({ size = 20, className }) {
  return (
    <svg className={cx('animate-spin', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ------------------------------------------------------------ EmptyState
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center" style={{ borderColor: 'var(--border-strong)' }}>
      {icon && <div className="text-ink-muted">{icon}</div>}
      <div>
        <p className="font-display text-base font-semibold text-ink">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ------------------------------------------------------------------ Stat
export function Stat({ label, value, sub, tone = 'default' }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={cx('tabular mt-1.5 font-display text-2xl font-semibold', tone === 'accent' ? 'text-brand-accent' : 'text-ink')}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

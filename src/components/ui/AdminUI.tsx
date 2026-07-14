import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

type StatusBadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
};

type AdminButtonProps = {
  children: ReactNode;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  ariaControls?: string;
  ariaExpanded?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
  onClick?: () => void;
};

export function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}

export function AdminButton({
  children,
  type = 'button',
  variant = 'primary',
  ariaControls,
  ariaExpanded,
  ariaLabel,
  disabled,
  onClick,
}: AdminButtonProps) {
  return (
    <button
      className={`admin-button admin-button--${variant}`}
      type={type}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="admin-empty">
      <p>{title}</p>
      {action}
    </div>
  );
}

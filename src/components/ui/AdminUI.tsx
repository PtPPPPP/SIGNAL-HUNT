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
  disabled,
  onClick,
}: AdminButtonProps) {
  return (
    <button className={`admin-button admin-button--${variant}`} type={type} disabled={disabled} onClick={onClick}>
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

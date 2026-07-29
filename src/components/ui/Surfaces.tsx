import type { CSSProperties, ReactNode } from 'react';

export type FeedbackTone = 'success' | 'warning' | 'danger' | 'info';
export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export function Feedback({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: FeedbackTone;
}) {
  return (
    <div
      className={`ui-feedback ui-feedback--${tone}`}
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span className={`status-badge status-badge--${tone}`}>{children}</span>
  );
}

type StateProps = {
  action?: ReactNode;
  description?: string;
  title: string;
};

function StateContainer({
  action,
  description,
  icon,
  title,
  tone,
}: StateProps & {
  icon: ReactNode;
  tone: 'empty' | 'error' | 'loading';
}) {
  return (
    <div className={`ui-state ui-state--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="ui-state__icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState(props: StateProps) {
  return <StateContainer {...props} icon="—" tone="empty" />;
}

export function ErrorState(props: StateProps) {
  return <StateContainer {...props} icon="!" tone="error" />;
}

export function LoadingState({
  title = '正在加载',
  description,
}: Partial<Pick<StateProps, 'title' | 'description'>>) {
  return (
    <StateContainer
      title={title}
      description={description}
      icon={<span className="ui-spinner" />}
      tone="loading"
    />
  );
}

export function PageShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`ui-page-shell ${className}`.trim()}>{children}</div>;
}

export function SectionCard({
  actions,
  children,
  className = '',
  description,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: string;
  title?: string;
}) {
  return (
    <section className={`ui-section-card ${className}`.trim()}>
      {title || description || actions ? (
        <header className="ui-section-card__header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className="ui-section-card__body">{children}</div>
    </section>
  );
}

export function StickyActionBar({ children }: { children: ReactNode }) {
  return <div className="ui-sticky-action-bar">{children}</div>;
}

export function DangerZone({
  action,
  children,
  title = '危险操作',
}: {
  action?: ReactNode;
  children: ReactNode;
  title?: string;
}) {
  return (
    <section className="ui-danger-zone">
      <div>
        <h2>{title}</h2>
        <div className="ui-danger-zone__copy">{children}</div>
      </div>
      {action}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <article className={`ui-metric-card ui-metric-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

export function DataTable({
  children,
  label,
  minWidth,
}: {
  children: ReactNode;
  label: string;
  minWidth?: string;
}) {
  const style = minWidth
    ? ({ '--ui-table-min-width': minWidth } as CSSProperties)
    : undefined;
  return (
    <div
      className="ui-table-scroll"
      role="region"
      aria-label={label}
      style={style}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

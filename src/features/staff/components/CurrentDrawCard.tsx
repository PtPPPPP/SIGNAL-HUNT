import {
  StatusBadge,
  type BadgeTone,
} from '../../../components/ui/AdminUI';
import type { DrawRecord } from '../../../domain/draw/types';
import {
  DRAW_STATUS_LABELS,
  formatAdminDateTime,
} from '../../admin/statusLabels';

const statusTone: Record<DrawRecord['status'], BadgeTone> = {
  COMMITTED: 'warning',
  REVEALED: 'info',
  REDEEMED: 'success',
  VOIDED: 'danger',
};

export function PrizeVisual({ prizeName }: { prizeName: string }) {
  const initials = [...prizeName.trim()].slice(0, 2).join('') || '奖品';

  return (
    <div className="staff-prize-visual" aria-hidden="true">
      <span className="staff-prize-visual__scan" />
      <strong>{initials}</strong>
      <small>SIGNAL LOCKED</small>
    </div>
  );
}

export function PrizeInformation({ record }: { record: DrawRecord }) {
  return (
    <div className="staff-prize-information">
      <p>当前中奖结果</p>
      <h2>{record.prizeNameSnapshot}</h2>
      <span>记录编号 {record.id}</span>
    </div>
  );
}

export function DrawMetadata({ record }: { record: DrawRecord }) {
  return (
    <dl className="staff-draw-metadata">
      <div>
        <dt>生成时间</dt>
        <dd>{formatAdminDateTime(record.committedAt)}</dd>
      </div>
      <div>
        <dt>兑奖时间</dt>
        <dd>{formatAdminDateTime(record.redeemedAt)}</dd>
      </div>
      <div>
        <dt>活动编号</dt>
        <dd>{record.eventId}</dd>
      </div>
    </dl>
  );
}

export function DrawStatusPanel({ record }: { record: DrawRecord }) {
  const terminal = record.status === 'REDEEMED' || record.status === 'VOIDED';

  return (
    <aside className={`staff-status-panel staff-status-panel--${statusTone[record.status]}`}>
      <span>记录状态</span>
      <StatusBadge tone={statusTone[record.status]}>
        {DRAW_STATUS_LABELS[record.status]}
      </StatusBadge>
      <strong>
        {record.status === 'REDEEMED'
          ? '兑奖已完成'
          : record.status === 'VOIDED'
            ? '记录已锁定'
            : '等待工作人员处理'}
      </strong>
      <p>
        {terminal
          ? '该记录已进入终态，不允许再次兑奖或作废。'
          : '核对奖品后确认兑奖；异常情况请使用作废流程。'}
      </p>
      {record.voidReason ? <small>作废原因：{record.voidReason}</small> : null}
    </aside>
  );
}

export function CurrentDrawCard({ record }: { record: DrawRecord }) {
  return (
    <section className="staff-current-draw" aria-live="polite">
      <div className="staff-current-draw__primary">
        <PrizeVisual prizeName={record.prizeNameSnapshot} />
        <PrizeInformation record={record} />
        <DrawMetadata record={record} />
      </div>
      <DrawStatusPanel record={record} />
    </section>
  );
}

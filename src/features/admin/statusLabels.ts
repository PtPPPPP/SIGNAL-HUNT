import type { PrizePacingStatus } from '../../domain/draw/prizePacing';
import type { DrawRecord, EventStatus, PrizeProbabilityMode } from '../../domain/draw/types';

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: '草稿',
  ACTIVE: '进行中',
  PAUSED: '已暂停',
  ENDED: '已结束',
};

export const DRAW_STATUS_LABELS: Record<DrawRecord['status'], string> = {
  COMMITTED: '已锁定',
  REVEALED: '已揭晓',
  REDEEMED: '已兑奖',
  VOIDED: '已作废',
};

export const PROBABILITY_MODE_LABELS: Record<PrizeProbabilityMode, string> = {
  FIXED: '固定概率',
  TIME_RELEASE: '分时释放',
  SMART_PACING: '智能发放',
};

export const PACING_STATUS_LABELS: Record<PrizePacingStatus, string> = {
  ON_PACE: '节奏正常',
  AHEAD: '发放偏快',
  BEHIND: '发放偏慢',
  LOCKED: '暂时锁定',
  CATCH_UP: '追赶发放',
  DEPLETED: '库存已空',
  FIXED: '固定概率',
};

export function formatAdminDateTime(value: string | undefined): string {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

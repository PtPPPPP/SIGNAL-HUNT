import type { SignalHuntDatabase } from '../../db/database';

export type SystemReadiness = {
  label:
    | '状态未检查'
    | '准备就绪'
    | '配置不完整'
    | '数据库异常'
    | '无活动'
    | '活动暂停'
    | '需要处理';
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
};

export async function readSystemReadiness(db: SignalHuntDatabase): Promise<SystemReadiness> {
  const [events, prizes, activeSessions] = await Promise.all([
    db.events.toArray(),
    db.prizes.toArray(),
    db.drawSessions.where('status').equals('COMMITTED').toArray(),
  ]);
  const activeEvent = events.find((event) => event.status === 'ACTIVE');

  if (!activeEvent) {
    return events.some((event) => event.status === 'PAUSED')
      ? { label: '活动暂停', tone: 'warning' }
      : { label: '无活动', tone: 'neutral' };
  }

  if (activeSessions.some((session) => session.eventId === activeEvent.id)) {
    return { label: '需要处理', tone: 'brand' };
  }

  const hasEligiblePrize = prizes.some(
    (prize) => prize.enabled && prize.inventoryRemaining > 0 && prize.weight > 0,
  );

  return hasEligiblePrize
    ? { label: '准备就绪', tone: 'success' }
    : { label: '配置不完整', tone: 'warning' };
}

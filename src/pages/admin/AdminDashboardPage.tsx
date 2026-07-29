import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PageShell,
  SectionCard,
  StatusBadge,
  type BadgeTone,
} from '../../components/ui/AdminUI';
import {
  getDashboardSummary,
  listDrawRecords,
  listPrizes,
  type DashboardSummary,
} from '../../db/adminRepository';
import { getConfiguredActiveEvent } from '../../db/drawRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { calculatePrizePacing } from '../../domain/draw/prizePacing';
import type { DrawRecord, Event, Prize } from '../../domain/draw/types';
import {
  DRAW_STATUS_LABELS,
  EVENT_STATUS_LABELS,
  PACING_STATUS_LABELS,
  formatAdminDateTime,
} from '../../features/admin/statusLabels';
import { getErrorMessage } from '../../lib/errorMessage';
import { AdminLayout } from './AdminLayout';

type AdminDashboardPageProps = {
  db?: SignalHuntDatabase;
};

const emptySummary: DashboardSummary = {
  eventCount: 0,
  prizeCount: 0,
  enabledPrizeCount: 0,
  remainingInventory: 0,
  drawRecordCount: 0,
};

export function AdminDashboardPage({
  db = signalHuntDatabase,
}: AdminDashboardPageProps) {
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [activeEvent, setActiveEvent] = useState<Event>();
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [records, setRecords] = useState<DrawRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;

    void Promise.all([
      getDashboardSummary(db),
      getConfiguredActiveEvent(db),
      listPrizes(db),
      listDrawRecords(db),
    ])
      .then(([nextSummary, event, nextPrizes, nextRecords]) => {
        if (disposed) return;
        setSummary(nextSummary);
        setActiveEvent(event);
        setPrizes(nextPrizes);
        setRecords(nextRecords);
        setError('');
      })
      .catch((cause: unknown) => {
        if (!disposed) setError(getErrorMessage(cause));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [db]);

  const todayRecords = records.filter(
    (record) =>
      new Date(record.committedAt).toDateString() === new Date().toDateString(),
  );
  const pendingCount = records.filter(
    (record) => record.status === 'COMMITTED' || record.status === 'REVEALED',
  ).length;
  const redeemedCount = records.filter(
    (record) => record.status === 'REDEEMED',
  ).length;
  const voidedCount = records.filter(
    (record) => record.status === 'VOIDED',
  ).length;
  const recentRecords = records.slice(0, 8);
  const primaryPacing = useMemo(
    () =>
      prizes
        .filter((prize) => prize.enabled)
        .map((prize) =>
          calculatePrizePacing({ prize, event: activeEvent, records }),
        )
        .slice(0, 4),
    [activeEvent, prizes, records],
  );
  const alerts = getSystemAlerts(activeEvent, prizes);

  return (
    <AdminLayout title="运营概览" db={db}>
      <PageShell>
        {loading ? (
          <LoadingState title="正在读取运营数据" />
        ) : error ? (
          <ErrorState title="概览数据读取失败" description={error} />
        ) : (
          <>
            <section className="admin-metric-grid" aria-label="核心指标">
              <MetricCard
                label="今日抽奖次数"
                value={todayRecords.length}
                detail={`累计 ${summary.drawRecordCount} 次`}
                tone="info"
              />
              <MetricCard
                label="待兑奖数量"
                value={pendingCount}
                detail="等待现场处理"
                tone={pendingCount > 0 ? 'warning' : 'neutral'}
              />
              <MetricCard
                label="已兑奖数量"
                value={redeemedCount}
                detail="已进入终态"
                tone="success"
              />
              <MetricCard
                label="作废数量"
                value={voidedCount}
                detail="已进入终态"
                tone={voidedCount > 0 ? 'danger' : 'neutral'}
              />
              <MetricCard
                label="剩余库存"
                value={summary.remainingInventory}
                detail={`${summary.enabledPrizeCount} 个启用奖品`}
                tone="brand"
              />
            </section>

            <section className="admin-two-column">
              <SectionCard
                title="当前活动状态"
                actions={
                  <StatusBadge tone={activeEvent ? 'success' : 'warning'}>
                    {activeEvent
                      ? EVENT_STATUS_LABELS[activeEvent.status]
                      : '未激活'}
                  </StatusBadge>
                }
              >
                <h3 className="admin-hero-value">
                  {activeEvent?.name ?? '当前没有激活活动'}
                </h3>
                <dl className="admin-definition-grid">
                  <div>
                    <dt>活动代码</dt>
                    <dd>{activeEvent?.code ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>活动时间</dt>
                    <dd>{formatWindow(activeEvent)}</dd>
                  </div>
                  <div>
                    <dt>记录总数</dt>
                    <dd>{summary.drawRecordCount}</dd>
                  </div>
                </dl>
              </SectionCard>

              <SectionCard title="系统告警" description="需要运营人员关注的当前状态">
                {alerts.length ? (
                  <ul className="admin-alert-list">
                    {alerts.map((alert) => (
                      <li key={alert.label}>
                        <StatusBadge tone={alert.tone}>{alert.level}</StatusBadge>
                        <span>{alert.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="当前没有系统告警"
                    description="活动、奖池和库存状态正常。"
                  />
                )}
              </SectionCard>
            </section>

            <section className="admin-two-column">
              <SectionCard title="库存概况">
                {prizes.length ? (
                  <div className="inventory-list">
                    {prizes.map((prize) => (
                      <InventoryRow key={prize.id} prize={prize} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="暂无奖品"
                    action={<Link to="/admin/prizes">前往奖池管理</Link>}
                  />
                )}
              </SectionCard>

              <SectionCard title="发放节奏" description="当前启用奖品的实时测量值">
                {primaryPacing.length ? (
                  <div className="pacing-summary-list">
                    {primaryPacing.map((snapshot) => {
                      const prize = prizes.find(
                        (item) => item.id === snapshot.prizeId,
                      );
                      return (
                        <div className="pacing-summary-row" key={snapshot.prizeId}>
                          <strong>{prize?.name ?? snapshot.prizeId}</strong>
                          <span>预计 {snapshot.expectedWins}</span>
                          <span>实际 {snapshot.actualWins}</span>
                          <StatusBadge tone={toneForPacing(snapshot.status)}>
                            {PACING_STATUS_LABELS[snapshot.status]}
                          </StatusBadge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState title="暂无可用奖品" />
                )}
              </SectionCard>
            </section>

            <SectionCard
              title="最近抽奖"
              actions={<Link to="/admin/records">查看全部记录</Link>}
            >
              {recentRecords.length ? (
                <DataTable label="最近抽奖记录">
                  <table>
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>奖项</th>
                        <th>兑奖状态</th>
                        <th>记录状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRecords.map((record) => (
                        <tr key={record.id}>
                          <td>{formatAdminDateTime(record.committedAt)}</td>
                          <td>{record.prizeNameSnapshot}</td>
                          <td>{record.redeemed ? '已兑奖' : '未兑奖'}</td>
                          <td>
                            <StatusBadge tone={toneForRecord(record)}>
                              {DRAW_STATUS_LABELS[record.status]}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTable>
              ) : (
                <EmptyState title="暂无抽奖记录" />
              )}
            </SectionCard>
          </>
        )}
      </PageShell>
    </AdminLayout>
  );
}

function InventoryRow({ prize }: { prize: Prize }) {
  const remainingRatio =
    prize.inventoryTotal > 0
      ? prize.inventoryRemaining / prize.inventoryTotal
      : 0;
  const status =
    prize.inventoryRemaining <= 0
      ? 'DEPLETED'
      : remainingRatio <= 0.2
        ? 'LOW'
        : 'HEALTHY';

  return (
    <div className="inventory-row">
      <div>
        <strong>{prize.name}</strong>
        <span>
          {prize.inventoryRemaining} / {prize.inventoryTotal} 剩余
        </span>
      </div>
      <div className="inventory-progress" aria-label={`${prize.name} 剩余库存`}>
        <span style={{ width: `${Math.round(remainingRatio * 100)}%` }} />
      </div>
      <StatusBadge
        tone={
          status === 'HEALTHY'
            ? 'success'
            : status === 'LOW'
              ? 'warning'
              : 'danger'
        }
      >
        {status === 'HEALTHY'
          ? '库存正常'
          : status === 'LOW'
            ? '库存偏低'
            : '库存已空'}
      </StatusBadge>
    </div>
  );
}

function getSystemAlerts(event: Event | undefined, prizes: Prize[]) {
  const alerts: { label: string; level: string; tone: BadgeTone }[] = [];
  if (!event) {
    alerts.push({
      label: '当前没有激活活动，展示端不能开始新的抽奖。',
      level: '配置',
      tone: 'warning',
    });
  }
  if (!prizes.some((prize) => prize.enabled && prize.inventoryRemaining > 0)) {
    alerts.push({
      label: '没有可发放的启用奖品，请检查奖池配置。',
      level: '奖池',
      tone: 'danger',
    });
  }
  const lowInventory = prizes.filter(
    (prize) =>
      prize.enabled &&
      prize.inventoryTotal > 0 &&
      prize.inventoryRemaining / prize.inventoryTotal <= 0.2,
  );
  if (lowInventory.length) {
    alerts.push({
      label: `${lowInventory.length} 个奖品库存低于或等于 20%。`,
      level: '库存',
      tone: 'warning',
    });
  }
  return alerts;
}

function toneForPacing(status: string): BadgeTone {
  if (status === 'AHEAD' || status === 'LOCKED' || status === 'DEPLETED') {
    return 'warning';
  }
  if (status === 'BEHIND' || status === 'CATCH_UP') return 'brand';
  return 'success';
}

function toneForRecord(record: DrawRecord): BadgeTone {
  if (record.status === 'REDEEMED') return 'success';
  if (record.status === 'VOIDED') return 'danger';
  return record.status === 'REVEALED' ? 'info' : 'warning';
}

function formatWindow(event: Event | undefined): string {
  if (!event?.startAt && !event?.endAt) return '—';
  return `${formatAdminDateTime(event.startAt)} - ${formatAdminDateTime(event.endAt)}`;
}

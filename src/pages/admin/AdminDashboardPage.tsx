import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState, StatusBadge } from '../../components/ui/AdminUI';
import { getDashboardSummary, listDrawRecords, listPrizes, type DashboardSummary } from '../../db/adminRepository';
import { getActiveEvent } from '../../db/drawRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { calculatePrizePacing } from '../../domain/draw/prizePacing';
import type { DrawRecord, Event, Prize } from '../../domain/draw/types';
import {
  DRAW_STATUS_LABELS,
  EVENT_STATUS_LABELS,
  PACING_STATUS_LABELS,
  formatAdminDateTime,
} from '../../features/admin/statusLabels';
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

export function AdminDashboardPage({ db = signalHuntDatabase }: AdminDashboardPageProps) {
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [activeEvent, setActiveEvent] = useState<Event | undefined>(undefined);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [records, setRecords] = useState<DrawRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;

    void Promise.all([getDashboardSummary(db), getActiveEvent(db), listPrizes(db), listDrawRecords(db)])
      .then(([nextSummary, event, nextPrizes, nextRecords]) => {
        if (disposed) {
          return;
        }

        setSummary(nextSummary);
        setActiveEvent(event);
        setPrizes(nextPrizes);
        setRecords(nextRecords);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [db]);

  const redeemedCount = records.filter((record) => record.redeemed).length;
  const validWinCount = records.filter((record) => record.status !== 'VOIDED').length;
  const recentRecords = records.slice(0, 8);
  const primaryPacing = useMemo(
    () =>
      prizes
        .filter((prize) => prize.enabled)
        .map((prize) => calculatePrizePacing({ prize, event: activeEvent, records }))
        .slice(0, 4),
    [activeEvent, prizes, records],
  );

  return (
    <AdminLayout title="控制台概览" db={db}>
      {loading ? <section className="admin-panel">正在读取本机数据...</section> : null}
      {error ? <section className="admin-panel admin-error">读取失败：{error}</section> : null}

      <section className="admin-kpi-grid" aria-label="核心指标">
        <MetricCard label="今日参与" value={summary.drawRecordCount} note="真实抽奖记录数" />
        <MetricCard label="已中奖" value={validWinCount} note="不含已作废记录" />
        <MetricCard label="已兑奖" value={redeemedCount} note="工作人员已确认" />
        <MetricCard label="剩余库存" value={summary.remainingInventory} note="全部奖品剩余合计" />
      </section>

      <section className="admin-section-grid">
        <article className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <p>当前展会</p>
              <h2>{activeEvent?.name ?? '未激活活动'}</h2>
            </div>
            <StatusBadge tone={activeEvent ? 'success' : 'warning'}>
              {activeEvent ? EVENT_STATUS_LABELS[activeEvent.status] : '没有进行中的活动'}
            </StatusBadge>
          </div>
          <dl className="admin-definition-grid">
            <div>
              <dt>活动代码</dt>
              <dd>{activeEvent?.code ?? '-'}</dd>
            </div>
            <div>
              <dt>活动时间</dt>
              <dd>{formatWindow(activeEvent)}</dd>
            </div>
            <div>
              <dt>抽奖记录</dt>
              <dd>{summary.drawRecordCount}</dd>
            </div>
          </dl>
        </article>

        <article className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <p>发放节奏</p>
              <h2>中奖节奏概览</h2>
            </div>
          </div>
          {primaryPacing.length > 0 ? (
            <div className="pacing-summary-list">
              {primaryPacing.map((snapshot) => {
                const prize = prizes.find((item) => item.id === snapshot.prizeId);
                return (
                  <div className="pacing-summary-row" key={snapshot.prizeId}>
                    <strong>{prize?.name ?? snapshot.prizeId}</strong>
                    <span>预计 {snapshot.expectedWins}</span>
                    <span>实际 {snapshot.actualWins}</span>
                    <span>{snapshot.multiplier.toFixed(2)} 倍</span>
                    <StatusBadge tone={toneForPacing(snapshot.status)}>{PACING_STATUS_LABELS[snapshot.status]}</StatusBadge>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="暂无可用奖品" />
          )}
        </article>
      </section>

      <section className="admin-section-grid">
        <article className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <p>奖品库存</p>
              <h2>库存状态</h2>
            </div>
          </div>
          {prizes.length > 0 ? (
            <div className="inventory-list">
              {prizes.map((prize) => (
                <InventoryRow key={prize.id} prize={prize} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="暂无奖品"
              action={<Link className="admin-link-button" to="/admin/prizes">创建第一个奖品</Link>}
            />
          )}
        </article>

        <article className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <p>奖品发放进度</p>
              <h2>累计中奖曲线</h2>
            </div>
          </div>
          <PrizePaceChart prizes={prizes} records={records} event={activeEvent} />
        </article>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <p>最近抽奖</p>
            <h2>最近记录</h2>
          </div>
          <Link className="admin-link-button" to="/admin/records">查看全部</Link>
        </div>
        {recentRecords.length > 0 ? (
          <table className="admin-table">
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
                  <td>{record.redeemed ? '是' : '-'}</td>
                  <td><StatusBadge tone={record.redeemed ? 'success' : 'brand'}>{DRAW_STATUS_LABELS[record.status]}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="暂无抽奖记录" />
        )}
      </section>
    </AdminLayout>
  );
}

function MetricCard({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <article className="admin-kpi-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

function InventoryRow({ prize }: { prize: Prize }) {
  const remainingRatio = prize.inventoryTotal > 0 ? prize.inventoryRemaining / prize.inventoryTotal : 0;
  const status = prize.inventoryRemaining <= 0 ? 'DEPLETED' : remainingRatio <= 0.2 ? 'LOW' : 'HEALTHY';

  return (
    <div className="inventory-row">
      <div>
        <strong>{prize.name}</strong>
        <span>{prize.inventoryRemaining} / {prize.inventoryTotal} 剩余</span>
      </div>
      <div className="inventory-progress" aria-label={`${prize.name} 剩余库存`}>
        <span style={{ width: `${Math.round(remainingRatio * 100)}%` }} />
      </div>
      <StatusBadge tone={status === 'HEALTHY' ? 'success' : status === 'LOW' ? 'warning' : 'danger'}>
        {status === 'HEALTHY' ? '库存正常' : status === 'LOW' ? '库存偏低' : '库存已空'}
      </StatusBadge>
    </div>
  );
}

function PrizePaceChart({ prizes, records, event }: { prizes: Prize[]; records: DrawRecord[]; event?: Event }) {
  const firstPrize = prizes.find((prize) => prize.enabled);

  if (!firstPrize) {
    return <EmptyState title="暂无可绘制的奖品" />;
  }

  const snapshot = calculatePrizePacing({ prize: firstPrize, event, records });
  const actual = Math.min(firstPrize.inventoryTotal, snapshot.actualWins);
  const expected = Math.min(firstPrize.inventoryTotal, snapshot.expectedWins);
  const max = Math.max(firstPrize.inventoryTotal, 1);
  const actualY = 140 - (actual / max) * 110;
  const expectedY = 140 - (expected / max) * 110;

  return (
    <div className="pace-chart">
      <svg viewBox="0 0 420 170" role="img" aria-label={`${firstPrize.name} 中奖节奏图`}>
        <line x1="38" y1="140" x2="390" y2="140" />
        <line x1="38" y1="24" x2="38" y2="140" />
        <polyline points={`38,140 390,${expectedY}`} className="pace-chart-target" />
        <polyline points={`38,140 390,${actualY}`} className="pace-chart-actual" />
        <circle cx="390" cy={actualY} r="5" className="pace-chart-dot" />
        <text x="40" y="162">开始</text>
        <text x="340" y="162">当前</text>
        <text x="60" y={expectedY - 8}>目标 {expected}</text>
        <text x="300" y={actualY - 8}>实际 {actual}</text>
      </svg>
    </div>
  );
}

function toneForPacing(status: string) {
  if (status === 'AHEAD' || status === 'LOCKED' || status === 'DEPLETED') {
    return 'warning';
  }

  if (status === 'BEHIND' || status === 'CATCH_UP') {
    return 'brand';
  }

  return 'success';
}

function formatWindow(event: Event | undefined): string {
  if (!event?.startAt && !event?.endAt) {
    return '-';
  }

  return `${formatAdminDateTime(event.startAt)} - ${formatAdminDateTime(event.endAt)}`;
}

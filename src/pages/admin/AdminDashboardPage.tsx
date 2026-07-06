import { useEffect, useState } from 'react';

import { getDashboardSummary, type DashboardSummary } from '../../db/adminRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
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

  useEffect(() => {
    void getDashboardSummary(db).then(setSummary);
  }, [db]);

  return (
    <AdminLayout title="仪表盘">
      <div className="admin-metric-grid">
        <MetricCard label="活动数量" value={summary.eventCount} />
        <MetricCard label="奖项数量" value={summary.prizeCount} />
        <MetricCard label="启用奖项" value={summary.enabledPrizeCount} />
        <MetricCard label="剩余库存" value={summary.remainingInventory} />
        <MetricCard label="抽奖记录" value={summary.drawRecordCount} />
      </div>
    </AdminLayout>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="admin-metric">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

import { useEffect, useMemo, useState } from 'react';

import {
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageShell,
  SectionCard,
  Select,
  StatusBadge,
  type BadgeTone,
} from '../../components/ui/AdminUI';
import { listDrawRecords, listPrizes } from '../../db/adminRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import type { DrawRecord, Prize } from '../../domain/draw/types';
import {
  DRAW_STATUS_LABELS,
  formatAdminDateTime,
} from '../../features/admin/statusLabels';
import { getErrorMessage } from '../../lib/errorMessage';
import { AdminLayout } from './AdminLayout';

type AdminRecordsPageProps = {
  db?: SignalHuntDatabase;
};

export function AdminRecordsPage({
  db = signalHuntDatabase,
}: AdminRecordsPageProps) {
  const [records, setRecords] = useState<DrawRecord[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [prizeFilter, setPrizeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [redeemedFilter, setRedeemedFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    void Promise.all([listDrawRecords(db), listPrizes(db)])
      .then(([nextRecords, nextPrizes]) => {
        if (disposed) return;
        setRecords(nextRecords);
        setPrizes(nextPrizes);
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

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        if (prizeFilter !== 'ALL' && record.prizeId !== prizeFilter) return false;
        if (statusFilter !== 'ALL' && record.status !== statusFilter) return false;
        if (redeemedFilter === 'REDEEMED' && !record.redeemed) return false;
        if (redeemedFilter === 'UNREDEEMED' && record.redeemed) return false;
        return true;
      }),
    [prizeFilter, records, redeemedFilter, statusFilter],
  );

  return (
    <AdminLayout title="抽奖记录" db={db}>
      <PageShell>
        <SectionCard title="记录筛选" description="筛选不会修改任何抽奖记录">
          <div className="admin-filter-grid">
            <Field label="奖项">
              <Select
                value={prizeFilter}
                onChange={(event) => setPrizeFilter(event.target.value)}
              >
                <option value="ALL">全部奖项</option>
                {prizes.map((prize) => (
                  <option key={prize.id} value={prize.id}>
                    {prize.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="记录状态">
              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="ALL">全部状态</option>
                <option value="COMMITTED">已锁定</option>
                <option value="REVEALED">已揭晓</option>
                <option value="REDEEMED">已兑奖</option>
                <option value="VOIDED">已作废</option>
              </Select>
            </Field>
            <Field label="兑奖状态">
              <Select
                value={redeemedFilter}
                onChange={(event) => setRedeemedFilter(event.target.value)}
              >
                <option value="ALL">全部</option>
                <option value="REDEEMED">已兑奖</option>
                <option value="UNREDEEMED">未兑奖</option>
              </Select>
            </Field>
          </div>
        </SectionCard>

        <SectionCard
          title="抽奖记录"
          actions={
            <StatusBadge tone="neutral">
              共 {filteredRecords.length} 条
            </StatusBadge>
          }
        >
          {loading ? (
            <LoadingState title="正在读取抽奖记录" />
          ) : error ? (
            <ErrorState title="抽奖记录读取失败" description={error} />
          ) : filteredRecords.length ? (
            <DataTable label="抽奖记录表格" minWidth="68rem">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>奖项</th>
                    <th>活动</th>
                    <th>记录状态</th>
                    <th>兑奖</th>
                    <th>兑奖时间</th>
                    <th>参与者</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => (
                    <tr key={record.id}>
                      <td data-nowrap>{formatAdminDateTime(record.committedAt)}</td>
                      <td>{record.prizeNameSnapshot}</td>
                      <td>{record.eventId}</td>
                      <td data-nowrap>
                        <StatusBadge tone={toneForRecord(record)}>
                          {DRAW_STATUS_LABELS[record.status]}
                        </StatusBadge>
                      </td>
                      <td data-nowrap>{record.redeemed ? '已兑奖' : '未兑奖'}</td>
                      <td data-nowrap>{formatAdminDateTime(record.redeemedAt)}</td>
                      <td data-nowrap>{record.participantId ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          ) : (
            <EmptyState
              title="暂无匹配记录"
              description="调整筛选条件，或等待产生新的抽奖记录。"
            />
          )}
        </SectionCard>
      </PageShell>
    </AdminLayout>
  );
}

function toneForRecord(record: DrawRecord): BadgeTone {
  if (record.status === 'REDEEMED') return 'success';
  if (record.status === 'VOIDED') return 'danger';
  if (record.status === 'REVEALED') return 'info';
  return 'warning';
}

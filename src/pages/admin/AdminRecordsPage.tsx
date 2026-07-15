import { useEffect, useMemo, useState } from 'react';

import { EmptyState, StatusBadge } from '../../components/ui/AdminUI';
import { listDrawRecords, listPrizes } from '../../db/adminRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import type { DrawRecord, Prize } from '../../domain/draw/types';
import { DRAW_STATUS_LABELS, formatAdminDateTime } from '../../features/admin/statusLabels';
import { AdminLayout } from './AdminLayout';

type AdminRecordsPageProps = {
  db?: SignalHuntDatabase;
};

export function AdminRecordsPage({ db = signalHuntDatabase }: AdminRecordsPageProps) {
  const [records, setRecords] = useState<DrawRecord[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [prizeFilter, setPrizeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [redeemedFilter, setRedeemedFilter] = useState('ALL');

  useEffect(() => {
    void Promise.all([listDrawRecords(db), listPrizes(db)]).then(([nextRecords, nextPrizes]) => {
      setRecords(nextRecords);
      setPrizes(nextPrizes);
    });
  }, [db]);

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        if (prizeFilter !== 'ALL' && record.prizeId !== prizeFilter) {
          return false;
        }

        if (statusFilter !== 'ALL' && record.status !== statusFilter) {
          return false;
        }

        if (redeemedFilter === 'REDEEMED' && !record.redeemed) {
          return false;
        }

        if (redeemedFilter === 'UNREDEEMED' && record.redeemed) {
          return false;
        }

        return true;
      }),
    [prizeFilter, records, redeemedFilter, statusFilter],
  );

  return (
    <AdminLayout title="抽奖记录" db={db}>
      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <p>筛选条件</p>
            <h2>记录筛选</h2>
          </div>
        </div>
        <div className="admin-filter-row">
          <label>
            奖项
            <select value={prizeFilter} onChange={(event) => setPrizeFilter(event.target.value)}>
              <option value="ALL">全部奖项</option>
              {prizes.map((prize) => (
                <option key={prize.id} value={prize.id}>
                  {prize.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            记录状态
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">全部状态</option>
              <option value="COMMITTED">已锁定</option>
              <option value="REVEALED">已揭晓</option>
              <option value="REDEEMED">已兑奖</option>
              <option value="VOIDED">已作废</option>
            </select>
          </label>
          <label>
            兑奖状态
            <select value={redeemedFilter} onChange={(event) => setRedeemedFilter(event.target.value)}>
              <option value="ALL">全部</option>
              <option value="REDEEMED">已兑奖</option>
              <option value="UNREDEEMED">未兑奖</option>
            </select>
          </label>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <p>数据记录</p>
            <h2>抽奖记录</h2>
          </div>
          <StatusBadge tone="neutral">共 {filteredRecords.length} 条</StatusBadge>
        </div>
        {filteredRecords.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>奖项</th>
                <th>活动</th>
                <th>记录状态</th>
                <th>是否兑奖</th>
                <th>兑奖时间</th>
                <th>参与者</th>
                <th>处理位置</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr key={record.id}>
                  <td>{formatAdminDateTime(record.committedAt)}</td>
                  <td>{record.prizeNameSnapshot}</td>
                  <td>{record.eventId}</td>
                  <td>
                    <StatusBadge tone={toneForRecord(record)}>{DRAW_STATUS_LABELS[record.status]}</StatusBadge>
                  </td>
                  <td>{record.redeemed ? '是' : '-'}</td>
                  <td>{formatAdminDateTime(record.redeemedAt)}</td>
                  <td>{record.participantId ?? '-'}</td>
                  <td>在后台记录页处理</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="暂无匹配记录" />
        )}
      </section>
    </AdminLayout>
  );
}

function toneForRecord(record: DrawRecord) {
  if (record.status === 'REDEEMED') {
    return 'success';
  }

  if (record.status === 'VOIDED') {
    return 'danger';
  }

  return 'brand';
}

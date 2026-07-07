import { useEffect, useMemo, useState } from 'react';

import { EmptyState, StatusBadge } from '../../components/ui/AdminUI';
import { listDrawRecords, listPrizes } from '../../db/adminRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import type { DrawRecord, Prize } from '../../domain/draw/types';
import { AdminLayout } from './AdminLayout';

type AdminRecordsPageProps = {
  db?: SignalHuntDatabase;
};

const STATUS_LABEL: Record<DrawRecord['status'], string> = {
  COMMITTED: 'COMMITTED',
  REVEALED: 'REVEALED',
  REDEEMED: 'REDEEMED',
  VOIDED: 'VOIDED',
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
    <AdminLayout title="Records">
      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <p>Filters</p>
            <h2>记录筛选</h2>
          </div>
        </div>
        <div className="admin-filter-row">
          <label>
            Prize
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
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">全部状态</option>
              <option value="COMMITTED">COMMITTED</option>
              <option value="REVEALED">REVEALED</option>
              <option value="REDEEMED">REDEEMED</option>
              <option value="VOIDED">VOIDED</option>
            </select>
          </label>
          <label>
            Redeemed
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
            <p>Draw Records</p>
            <h2>抽奖记录</h2>
          </div>
          <StatusBadge tone="neutral">{filteredRecords.length} rows</StatusBadge>
        </div>
        {filteredRecords.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Prize</th>
                <th>Event</th>
                <th>Status</th>
                <th>Redeemed</th>
                <th>Redeemed At</th>
                <th>Participant</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr key={record.id}>
                  <td>{formatDateTime(record.committedAt)}</td>
                  <td>{record.prizeNameSnapshot}</td>
                  <td>{record.eventId}</td>
                  <td>
                    <StatusBadge tone={toneForRecord(record)}>{STATUS_LABEL[record.status]}</StatusBadge>
                  </td>
                  <td>{record.redeemed ? '是' : '-'}</td>
                  <td>{record.redeemedAt ? formatDateTime(record.redeemedAt) : '-'}</td>
                  <td>{record.participantId ?? '-'}</td>
                  <td>在 /staff 处理</td>
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

function formatDateTime(value: string): string {
  return value.replace('T', ' ').slice(0, 19);
}

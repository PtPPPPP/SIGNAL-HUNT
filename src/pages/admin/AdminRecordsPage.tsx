import { useEffect, useState } from 'react';

import { listDrawRecords } from '../../db/adminRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import type { DrawRecord } from '../../domain/draw/types';
import { AdminLayout } from './AdminLayout';

type AdminRecordsPageProps = {
  db?: SignalHuntDatabase;
};

const STATUS_LABEL: Record<DrawRecord['status'], string> = {
  COMMITTED: '已提交',
  REVEALED: '已揭晓',
  REDEEMED: '已兑奖',
  VOIDED: '已作废',
};

export function AdminRecordsPage({ db = signalHuntDatabase }: AdminRecordsPageProps) {
  const [records, setRecords] = useState<DrawRecord[]>([]);

  useEffect(() => {
    void listDrawRecords(db).then(setRecords);
  }, [db]);

  return (
    <AdminLayout title="记录">
      <section className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>奖项</th>
              <th>状态</th>
              <th>已兑奖</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{record.committedAt}</td>
                <td>{record.prizeNameSnapshot}</td>
                <td>
                  <span className={`status-tag ${record.redeemed ? 'is-redeemed' : 'is-committed'}`}>
                    {STATUS_LABEL[record.status]}
                  </span>
                </td>
                <td>{record.redeemed ? '是' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminLayout>
  );
}

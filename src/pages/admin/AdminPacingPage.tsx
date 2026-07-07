import { useEffect, useState } from 'react';

import { EmptyState, StatusBadge } from '../../components/ui/AdminUI';
import { listDrawRecords, listPrizes } from '../../db/adminRepository';
import { getActiveEvent } from '../../db/drawRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { calculatePrizePacing } from '../../domain/draw/prizePacing';
import type { DrawRecord, Event, Prize } from '../../domain/draw/types';
import { AdminLayout } from './AdminLayout';

type AdminPacingPageProps = {
  db?: SignalHuntDatabase;
};

export function AdminPacingPage({ db = signalHuntDatabase }: AdminPacingPageProps) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [records, setRecords] = useState<DrawRecord[]>([]);
  const [activeEvent, setActiveEvent] = useState<Event | undefined>(undefined);

  useEffect(() => {
    void Promise.all([listPrizes(db), listDrawRecords(db), getActiveEvent(db)]).then(
      ([nextPrizes, nextRecords, event]) => {
        setPrizes(nextPrizes);
        setRecords(nextRecords);
        setActiveEvent(event);
      },
    );
  }, [db]);

  return (
    <AdminLayout title="Prize Pacing">
      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <p>Prize Pacing</p>
            <h2>中奖节奏总览</h2>
          </div>
          <StatusBadge tone={activeEvent ? 'success' : 'warning'}>{activeEvent?.code ?? 'NO ACTIVE EVENT'}</StatusBadge>
        </div>

        {prizes.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Prize</th>
                <th>Mode</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Effective Weight</th>
                <th>Next Release</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {prizes.map((prize) => {
                const snapshot = calculatePrizePacing({ prize, event: activeEvent, records });

                return (
                  <tr key={prize.id}>
                    <td>{prize.name}</td>
                    <td>{prize.probabilityMode ?? 'FIXED'}</td>
                    <td>{snapshot.expectedWins}</td>
                    <td>{snapshot.actualWins}</td>
                    <td>{snapshot.effectiveWeight.toFixed(2)}</td>
                    <td>{snapshot.nextReleaseAt ?? '-'}</td>
                    <td>
                      <StatusBadge tone={toneForPacing(snapshot.status)}>{snapshot.status}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState title="暂无奖品，无法计算中奖节奏" />
        )}
      </section>
    </AdminLayout>
  );
}

function toneForPacing(status: string) {
  if (status === 'LOCKED' || status === 'AHEAD') {
    return 'warning';
  }

  if (status === 'DEPLETED') {
    return 'danger';
  }

  if (status === 'BEHIND' || status === 'CATCH_UP') {
    return 'brand';
  }

  return 'success';
}

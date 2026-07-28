import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { useNavigate } from 'react-router-dom';

import {
  endActiveDrawDisplay,
  readDisplayDatabaseSnapshot,
  redeemDrawRecord,
  voidActiveDraw,
  type DisplayDatabaseSnapshot,
} from '../../db/drawRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { BrandMark } from '../../features/brand/BrandMark';
import { publishAppChange } from '../../features/sync/appSync';
import { DRAW_STATUS_LABELS, formatAdminDateTime } from '../../features/admin/statusLabels';

type StaffPageProps = {
  db?: SignalHuntDatabase;
};

type StaffAction = 'REDEEM' | 'VOID' | 'END' | undefined;

export function StaffPage({ db = signalHuntDatabase }: StaffPageProps) {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<DisplayDatabaseSnapshot>();
  const [loadError, setLoadError] = useState<string>();
  const [action, setAction] = useState<StaffAction>();
  const [message, setMessage] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [voidReason, setVoidReason] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadSnapshot = () => {
      void readDisplayDatabaseSnapshot(db).then(
        (next) => {
          if (!mounted) return;
          setSnapshot(next);
          setLoadError(undefined);
        },
        (error: unknown) => {
          if (mounted) setLoadError(toErrorMessage(error));
        },
      );
    };

    // The control renderer can be created after the display has already
    // committed a result. Read once explicitly so this first render never
    // depends on a cross-window Dexie notification.
    loadSnapshot();
    const subscription = liveQuery(() => readDisplayDatabaseSnapshot(db)).subscribe({
      next: (next) => {
        setSnapshot(next);
        setLoadError(undefined);
      },
      error: (error: unknown) => setLoadError(toErrorMessage(error)),
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [db]);

  const currentRecord = snapshot?.record;
  const currentSession = snapshot?.session;
  const isBusy = action !== undefined;
  const canOperate = Boolean(currentRecord && currentSession && !isBusy);

  const runAction = async (nextAction: Exclude<StaffAction, undefined>, work: () => Promise<string>) => {
    if (!canOperate) return;

    setAction(nextAction);
    setMessage(undefined);
    setOperationError(undefined);
    try {
      setMessage(await work());
    } catch (error) {
      setOperationError(toErrorMessage(error));
    } finally {
      setAction(undefined);
    }
  };

  const redeem = () => {
    if (!currentRecord || !currentSession) return;
    if (!window.confirm('确认已完成兑奖？该操作不可撤销。')) return;

    void runAction('REDEEM', async () => {
      const result = await redeemDrawRecord(db, currentRecord.id);
      publishAppChange('DRAW_REDEEMED', currentSession.eventId);
      await window.signalHuntDesktop?.control.requestDisplaySync();
      return result.status === 'ALREADY_REDEEMED' ? '该记录已兑奖，无需重复操作。' : '已确认兑奖。';
    });
  };

  const voidRecord = () => {
    if (!currentRecord || !currentSession) return;
    const reason = voidReason.trim();
    if (!reason) {
      setOperationError('请填写作废原因。');
      return;
    }
    if (!window.confirm('确认作废当前结果？作废后不能兑奖，且不会恢复库存。')) return;

    void runAction('VOID', async () => {
      const result = await voidActiveDraw(db, { eventId: currentSession.eventId, recordId: currentRecord.id, reason });
      publishAppChange('DRAW_VOIDED', currentSession.eventId);
      await window.signalHuntDesktop?.control.requestDisplaySync();
      return result.status === 'ALREADY_VOIDED' ? '该记录已作废，无需重复操作。' : '已作废当前记录，大屏将返回待机。';
    });
  };

  const endDisplay = () => {
    if (!currentRecord || !currentSession) return;
    if (!window.confirm('确认结束当前展示并让大屏返回待机？这不会修改兑奖或作废状态。')) return;

    void runAction('END', async () => {
      const result = await endActiveDrawDisplay(db, currentSession.eventId, currentRecord.id);
      publishAppChange('DRAW_DISPLAY_ENDED', currentSession.eventId);
      await window.signalHuntDesktop?.control.requestDisplaySync();
      return result.status === 'ALREADY_ENDED' ? '当前展示已经结束。' : '已结束当前展示，大屏已返回待机。';
    });
  };

  const returnToDisplay = () => {
    if (window.signalHuntDesktop) {
      void window.signalHuntDesktop.control.focusDisplay();
      return;
    }
    navigate('/display');
  };

  return (
    <main className="staff-shell">
      <header className="staff-header">
        <BrandMark variant="on-light" />
        <div>
          <p>现场工作人员</p>
          <h1>发奖控制</h1>
        </div>
        <button className="staff-return" type="button" onClick={returnToDisplay}>
          返回展会大屏
        </button>
      </header>

      {loadError ? <section className="staff-alert staff-alert--error">数据库读取失败：{loadError}</section> : null}
      {operationError ? <section className="staff-alert staff-alert--error">操作未完成：{operationError}</section> : null}
      {message ? <section className="staff-alert staff-alert--success">{message}</section> : null}

      {!currentRecord || !currentSession ? (
        <section className="staff-card">
          <h2>当前没有待处理结果</h2>
          <p>请等待大屏产生中奖结果。这里不会创建新的抽奖。</p>
        </section>
      ) : (
        <section className="staff-card" aria-live="polite">
          <p className="staff-eyebrow">当前中奖结果</p>
          <h2>{currentRecord.prizeNameSnapshot}</h2>
          <dl className="staff-details">
            <div><dt>记录状态</dt><dd>{DRAW_STATUS_LABELS[currentRecord.status]}</dd></div>
            <div><dt>生成时间</dt><dd>{formatAdminDateTime(currentRecord.committedAt)}</dd></div>
            <div><dt>兑奖时间</dt><dd>{formatAdminDateTime(currentRecord.redeemedAt)}</dd></div>
          </dl>

          <div className="staff-actions">
            <button
              className="staff-button--primary"
              type="button"
              disabled={!canOperate || currentRecord.status === 'VOIDED'}
              onClick={redeem}
            >
              {action === 'REDEEM' ? '正在确认兑奖…' : '确认兑奖'}
            </button>
            <label className="staff-void-reason">
              作废原因
              <input
                disabled={!canOperate || currentRecord.status === 'REDEEMED' || currentRecord.status === 'VOIDED'}
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                placeholder="例如：现场误触"
              />
            </label>
            <button
              className="staff-button--danger"
              type="button"
              disabled={!canOperate || currentRecord.status === 'REDEEMED' || currentRecord.status === 'VOIDED'}
              onClick={voidRecord}
            >
              {action === 'VOID' ? '正在作废…' : '作废记录'}
            </button>
            <button className="staff-button--secondary" type="button" disabled={!canOperate} onClick={endDisplay}>
              {action === 'END' ? '正在结束展示…' : '结束当前展示'}
            </button>
          </div>
          <p className="staff-note">“结束当前展示”只让大屏回到待机，不会改变兑奖或作废状态。</p>
        </section>
      )}
    </main>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

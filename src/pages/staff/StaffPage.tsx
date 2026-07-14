import { useCallback, useEffect, useRef, useState } from 'react';

import { AdminButton, StatusBadge } from '../../components/ui/AdminUI';
import { ReturnToDisplayButton } from '../../components/ui/ReturnToDisplayButton';
import { BrandMark } from '../../features/brand/BrandMark';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import {
  clearActiveDrawSession,
  getConfiguredActiveEvent,
  recoverCommittedDraw,
  redeemDrawRecord,
  voidActiveDraw,
  type DrawRepositoryError,
} from '../../db/drawRepository';
import type { CommitDrawResult } from '../../domain/draw/types';
import { logStructured } from '../../features/diagnostics/errorLog';
import { formatAdminDateTime } from '../../features/admin/statusLabels';
import { publishAppChange, subscribeAppChanges } from '../../features/sync/appSync';

type StaffPageProps = {
  db?: SignalHuntDatabase;
};

export function StaffPage({ db = signalHuntDatabase }: StaffPageProps) {
  const [activeDraw, setActiveDraw] = useState<CommitDrawResult | undefined>(undefined);
  const [message, setMessage] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const redeemingRef = useRef(false);
  const redeemRequestIdRef = useRef(0);

  const hasActiveResult = Boolean(activeDraw);

  const refresh = useCallback(async () => {
    const event = await getConfiguredActiveEvent(db);

    if (!event) {
      setActiveDraw(undefined);
      return;
    }

    const recovered = await recoverCommittedDraw(db, event.id);
    setActiveDraw(recovered);
  }, [db]);

  const endCurrentResult = useCallback(async () => {
    try {
      const event = await getConfiguredActiveEvent(db);

      if (!event) {
        setMessage('当前没有进行中的活动。');
        return;
      }

      await clearActiveDrawSession(db, event.id);
      publishAppChange('DRAW_DISPLAY_ENDED', event.id);
      setMessage('已结束当前结果。展示页将自动返回待机。');
      setConfirmVoid(false);
      await refresh();
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logStructured('DATABASE_ERROR', { stage: 'staffEndResult', message: errorMessage });
      setMessage('结束当前结果失败，原结果仍然保留，请重试。');
    }
  }, [db, refresh]);

  const confirmRedemption = useCallback(async () => {
    if (!activeDraw) {
      setMessage('当前没有可兑奖记录。');
      return;
    }

    if (redeemingRef.current) {
      return;
    }

    if (activeDraw.record.redeemed) {
      setMessage(`该奖项已经完成兑奖，时间：${activeDraw.record.redeemedAt ?? '未知'}`);
      return;
    }

    redeemingRef.current = true;
    const requestId = redeemRequestIdRef.current + 1;
    redeemRequestIdRef.current = requestId;
    setIsRedeeming(true);

    try {
      const result = await redeemDrawRecord(db, activeDraw.record.id);
      publishAppChange('CONFIG_UPDATED', result.record.eventId);

      if (redeemRequestIdRef.current !== requestId) {
        return;
      }

      setActiveDraw((current) =>
        current?.record.id === result.record.id
          ? {
              ...current,
              record: result.record,
            }
          : current,
      );

      if (result.status === 'ALREADY_REDEEMED') {
        setMessage(`该奖项已经完成兑奖，时间：${result.record.redeemedAt ?? '未知'}`);
      } else {
        setMessage(`兑奖成功，时间：${result.record.redeemedAt ?? '未知'}`);
      }

      await refresh();
    } catch (error) {
      if (redeemRequestIdRef.current === requestId) {
        logStructured('DATABASE_ERROR', { stage: 'staffRedeem', message: toErrorMessage(error) });
        setMessage('兑奖操作失败，请重试；如仍失败请打开系统诊断。');
      }
    } finally {
      if (redeemRequestIdRef.current === requestId) {
        redeemingRef.current = false;
        setIsRedeeming(false);
      }
    }
  }, [activeDraw, db, refresh]);

  const requestVoid = useCallback(() => {
    if (!voidReason.trim()) {
      setMessage('作废必须填写原因。');
      return;
    }

    setConfirmVoid(true);
  }, [voidReason]);

  const confirmVoidRecord = useCallback(async () => {
    try {
      const event = await getConfiguredActiveEvent(db);

      if (!event) {
        setMessage('当前没有进行中的活动。');
        return;
      }

      await voidActiveDraw(db, {
        eventId: event.id,
        recordId: activeDraw?.record.id,
        reason: voidReason,
      });
      publishAppChange('DRAW_DISPLAY_ENDED', event.id);
      setMessage('记录已作废。库存未自动恢复。');
      setVoidReason('');
      setConfirmVoid(false);
      await refresh();
    } catch (error) {
      logStructured('DATABASE_ERROR', { stage: 'staffVoid', message: toErrorMessage(error) });
      setMessage(toStaffErrorMessage(error));
      setConfirmVoid(false);
    }
  }, [activeDraw?.record.id, db, refresh, voidReason]);

  useEffect(() => {
    void refresh().catch((error) => {
      const message = toErrorMessage(error);
      logStructured('DATABASE_ERROR', { stage: 'staffRefresh', message });
      setMessage('工作人员数据读取失败，请重试或打开诊断页面。');
    });
  }, [refresh]);

  useEffect(
    () =>
      subscribeAppChanges(() => {
        void refresh().catch((error) => {
          logStructured('DATABASE_ERROR', { stage: 'staffSyncRefresh', message: toErrorMessage(error) });
          setMessage('同步最新数据失败，请重试或打开诊断页面。');
        });
      }),
    [refresh],
  );

  // 快捷键：Ctrl + Shift + E（结束当前结果）。避开浏览器 Ctrl+Shift+R 硬刷新。
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        void endCurrentResult();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [endCurrentResult]);

  return (
    <main className="staff-shell">
      <header className="staff-header">
        <ReturnToDisplayButton />
        <BrandMark variant="on-light" />
        <div>
          <p>现场运营</p>
          <h1>工作人员现场操作</h1>
        </div>
        <StatusBadge tone={hasActiveResult ? 'brand' : 'success'}>
          {hasActiveResult ? '结果展示中' : '等待操作'}
        </StatusBadge>
      </header>

      <section className="staff-layout" aria-label="工作人员操作">
        <article className="staff-current-card">
          <div className="admin-panel-header">
            <div>
              <p>当前抽奖</p>
              <h2>当前中奖卡片</h2>
            </div>
          </div>

        {activeDraw ? (
          <section className="staff-record-panel" aria-label="当前中奖记录">
            <dl className="staff-record-list">
              <div>
                <dt>奖项</dt>
                <dd>{activeDraw.record.prizeNameSnapshot}</dd>
              </div>
              <div>
                <dt>抽奖时间</dt>
                <dd>{formatAdminDateTime(activeDraw.record.committedAt)}</dd>
              </div>
              <div>
                <dt>兑奖状态</dt>
                <dd>{activeDraw.record.redeemed ? '已兑奖' : '未兑奖'}</dd>
              </div>
              <div>
                <dt>记录编号</dt>
                <dd>{activeDraw.record.id}</dd>
              </div>
              <div>
                <dt>兑奖时间</dt>
                <dd>{formatAdminDateTime(activeDraw.record.redeemedAt)}</dd>
              </div>
              <div>
                <dt>大屏状态</dt>
                <dd>展示中</dd>
              </div>
            </dl>
            {activeDraw.record.redeemed ? (
              <p className="staff-redeemed-note">
                {`已于 ${formatAdminDateTime(activeDraw.record.redeemedAt)} 完成兑奖`}
              </p>
            ) : null}
          </section>
        ) : (
          <div className="admin-empty">
            <p>当前没有可处理的中奖结果。</p>
          </div>
        )}
        </article>

        <article className="staff-operation-card">
          <div className="admin-panel-header">
            <div>
              <p>操作</p>
              <h2>现场操作</h2>
            </div>
          </div>
          <div className="staff-actions">
          <AdminButton onClick={() => void confirmRedemption()} disabled={!activeDraw || isRedeeming}>
            {isRedeeming ? '正在确认...' : '确认兑奖'}
          </AdminButton>
          <AdminButton
            variant="secondary"
            onClick={() => void endCurrentResult()}
            disabled={!hasActiveResult}
          >
            结束当前结果并返回待机
          </AdminButton>
          </div>
          <p className="staff-hint">确认兑奖不会自动结束展示；结束展示不会自动确认兑奖。</p>

        <section className="staff-danger-zone" aria-label="危险操作">
          <h2>危险区</h2>
          <label>
            作废原因
            <input
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              disabled={!activeDraw || activeDraw.record.redeemed}
            />
          </label>
          <AdminButton
            variant="danger"
            onClick={requestVoid}
            disabled={!activeDraw || activeDraw.record.redeemed}
          >
            作废记录
          </AdminButton>
          {confirmVoid ? (
            <div className="confirm-card" role="alertdialog" aria-label="确认作废记录">
              <p>确认作废当前抽奖记录？库存不会自动恢复。</p>
              <div className="confirm-card-actions">
                <button className="confirm-button-cancel" type="button" onClick={() => setConfirmVoid(false)}>
                  取消
                </button>
                <button className="confirm-button-ok" type="button" onClick={() => void confirmVoidRecord()}>
                  确认作废
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <p className="staff-hint">快捷键：Ctrl + Shift + E（结束当前结果）</p>
        {message ? <p className="admin-message">{message}</p> : null}
        </article>
      </section>
    </main>
  );
}

function toStaffErrorMessage(error: unknown): string {
  const code = (error as Partial<DrawRepositoryError>).code;

  if (code === 'DRAW_ALREADY_REDEEMED') {
    return '已兑奖记录不能直接作废。';
  }

  if (code === 'DRAW_ALREADY_VOIDED') {
    return '已作废记录不能兑奖。';
  }

  if (code === 'VOID_REASON_REQUIRED') {
    return '作废必须填写原因。';
  }

  return '操作失败，请重试；如仍失败请打开系统诊断。';
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

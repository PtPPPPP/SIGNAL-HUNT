import { useCallback, useEffect, useState } from 'react';

import { BrandMark } from '../../features/brand/BrandMark';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { clearActiveDrawSession, getActiveEvent, recoverCommittedDraw } from '../../db/drawRepository';

type StaffPageProps = {
  db?: SignalHuntDatabase;
};

export function StaffPage({ db = signalHuntDatabase }: StaffPageProps) {
  const [hasActiveResult, setHasActiveResult] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const event = await getActiveEvent(db);

    if (!event) {
      setHasActiveResult(false);
      return;
    }

    const recovered = await recoverCommittedDraw(db, event.id);
    setHasActiveResult(Boolean(recovered));
  }, [db]);

  const endCurrentResult = useCallback(async () => {
    const event = await getActiveEvent(db);

    if (!event) {
      setMessage('当前没有进行中的活动。');
      return;
    }

    await clearActiveDrawSession(db, event.id);
    setMessage('已结束当前结果。展示页将在下次进入时回到待机。');
    await refresh();
  }, [db, refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    <main className="admin-shell">
      <header>
        <BrandMark variant="on-light" />
        <h1>工作人员</h1>
      </header>
      <section className="admin-placeholder" aria-label="工作人员操作">
        <p>当前展示页状态：{hasActiveResult ? '有未结束的中奖结果' : '待机中（无可恢复结果）'}。</p>
        <p>抽奖完成后结果页会永久停留，直到此处或展示页「下一位参与者」结束。</p>
        <div className="staff-actions">
          <button
            className="admin-button"
            type="button"
            onClick={() => void endCurrentResult()}
            disabled={!hasActiveResult}
          >
            结束当前结果并返回待机
          </button>
        </div>
        <p className="staff-hint">快捷键：Ctrl + Shift + E（结束当前结果）</p>
        {message ? <p className="admin-message">{message}</p> : null}
      </section>
    </main>
  );
}

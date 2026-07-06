import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

import {
  clearActiveDrawSession,
  commitPersistentDraw,
  getActiveEvent,
  markDrawRevealed,
  recoverCommittedDraw,
} from '../../db/drawRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { getLatestEventByStatus } from '../../db/eventRepository';
import { ensureDemoSeed } from '../../features/display/displayBootstrap';
import { logStructured, type LogEntryType } from '../../features/diagnostics/errorLog';
import {
  createInitialDisplayState,
  getDisplayCopy,
  isInteractionLocked,
  transitionDisplayState,
  type DisplayEvent,
  type DisplayState,
} from '../../features/display/displayStateMachine';
import { POST_COMMIT_TIMELINE_STEPS } from '../../features/display/displayTimeline';
import { BrandMark } from '../../features/brand/BrandMark';
import { SignalCanvas } from '../../visual/signal-engine/SignalCanvas';

type DisplayPageProps = {
  db?: SignalHuntDatabase;
};

// RESULT 永久停留，直到工作人员手动结束。开启后点击「下一位参与者」需二次确认，
// 防止中奖者拍照 / 指屏时误触退出。展会正式使用建议保持开启。
const CONFIRM_BEFORE_RESET_RESULT = true;
const ERROR_RESET_DELAY_MS = 4000;
const RESETTING_HOLD_MS = 700;

export function DisplayPage({ db = signalHuntDatabase }: DisplayPageProps) {
  const [displayState, setDisplayState] = useState<DisplayState>(createInitialDisplayState);
  const [revealedPrizeName, setRevealedPrizeName] = useState<string | undefined>(undefined);
  const [confirmExit, setConfirmExit] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<{ title: string; subtitle: string } | null>(null);

  const panelRef = useRef<HTMLElement | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);
  const eventIdRef = useRef<string | undefined>(undefined);
  const commitInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const stateRef = useRef(displayState);

  stateRef.current = displayState;

  const copy = getDisplayCopy(displayState.status);
  const interactionLocked = isInteractionLocked(displayState);
  const isResult = displayState.status === 'RESULT' && Boolean(revealedPrizeName);
  const needsStaff = displayState.status === 'ERROR' || displayState.status === 'PAUSED';

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      // Clear whatever is currently scheduled at unmount time.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      clearScheduledTimeline(timeoutIdsRef.current);
    };
  }, []);

  const scheduleReset = useCallback((delayMs: number) => {
    const timeoutId = window.setTimeout(() => {
      if (!mountedRef.current) {
        return;
      }

      setDisplayState((current) => applyEvent(current, { type: 'RESET_COMPLETE' }));
    }, delayMs);

    timeoutIdsRef.current.push(timeoutId);
  }, []);

  const schedulePostCommitTimeline = useCallback(
    (recordId: string) => {
      clearScheduledTimeline(timeoutIdsRef.current);

      const ids = POST_COMMIT_TIMELINE_STEPS.map((step) =>
        window.setTimeout(() => {
          if (!mountedRef.current) {
            return;
          }

          if (step.event.type === 'REVEAL_COMPLETE') {
            void markDrawRevealed(db, recordId)
              .then(() => log('DRAW_REVEALED', { recordId }))
              .catch((error) => log('DATABASE_ERROR', { stage: 'reveal', message: toErrorMessage(error) }));
          }

          // RESULT 之后不再自动复位：由「下一位参与者」按钮手动触发退出。
          setDisplayState((current) => applyEvent(current, step.event));
        }, step.atMs),
      );

      timeoutIdsRef.current.push(...ids);
    },
    [db],
  );

  const runCommit = useCallback(
    async (eventId: string) => {
      // Yield once so the ARMING feedback paints before we lock the result.
      await Promise.resolve();

      setDisplayState((current) => applyEvent(current, { type: 'COMMIT_STARTED' }));

      try {
        const result = await commitPersistentDraw(db, { eventId });

        if (!mountedRef.current) {
          return;
        }

        log('DRAW_COMMITTED', { recordId: result.record.id, prizeId: result.record.prizeId });
        setRevealedPrizeName(result.record.prizeNameSnapshot);
        setDisplayState((current) => applyEvent(current, { type: 'COMMIT_SUCCEEDED' }));
        schedulePostCommitTimeline(result.record.id);
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        const message = toErrorMessage(error);
        log('DATABASE_ERROR', { stage: 'commit', message });
        setDisplayState((current) => applyEvent(current, { type: 'COMMIT_FAILED', message }));
        scheduleReset(ERROR_RESET_DELAY_MS);
      }
    },
    [db, schedulePostCommitTimeline, scheduleReset],
  );

  const handleTouchStart = useCallback(() => {
    if (commitInFlightRef.current) {
      return;
    }

    if (stateRef.current.status !== 'ATTRACT') {
      return;
    }

    const eventId = eventIdRef.current;

    if (!eventId) {
      return;
    }

    // Lock synchronously so a second rapid tap can never start a second commit.
    commitInFlightRef.current = true;
    setDisplayState((current) =>
      isInteractionLocked(current) ? current : applyEvent(current, { type: 'TOUCH_ACCEPTED' }),
    );
    void runCommit(eventId);
  }, [runCommit]);

  // 手动结束 RESULT：clear 已提交会话 → RESETTING → ATTRACT。
  const performExit = useCallback(() => {
    const eventId = eventIdRef.current;

    setConfirmExit(false);
    setDisplayState((current) =>
      current.status === 'RESULT' ? applyEvent(current, { type: 'RESET_STARTED' }) : current,
    );

    void (async () => {
      if (eventId) {
        await clearActiveDrawSession(db, eventId).catch((error) =>
          log('DATABASE_ERROR', { stage: 'manualClear', message: toErrorMessage(error) }),
        );
      }

      scheduleReset(RESETTING_HOLD_MS);
    })();
  }, [db, scheduleReset]);

  const handleRequestExit = useCallback(() => {
    if (stateRef.current.status !== 'RESULT') {
      return;
    }

    if (CONFIRM_BEFORE_RESET_RESULT) {
      setConfirmExit(true);
      return;
    }

    performExit();
  }, [performExit]);

  const handleCancelExit = useCallback(() => {
    setConfirmExit(false);
  }, []);

  // Boot: ensure a drawable event exists, then recover any committed-but-unrevealed draw.
  // 恢复的结果同样永久停留，不再自动复位。
  useEffect(() => {
    let disposed = false;

    void (async () => {
      try {
        await ensureDemoSeed(db);
        const event = await getActiveEvent(db);

        if (disposed) {
          return;
        }

        if (!event) {
          eventIdRef.current = undefined;

          // No ACTIVE event. In dev ensureDemoSeed already handled the empty case;
          // in production an empty/ended/paused DB is a real operating condition we
          // must surface instead of papering over with fake prizes.
          const paused = await getLatestEventByStatus(db, 'PAUSED');

          if (paused) {
            setBlockedMessage(null);
            setDisplayState((current) =>
              current.status === 'PAUSED' ? current : applyEvent(current, { type: 'PAUSE' }),
            );
            return;
          }

          const eventCount = await db.events.count();
          setBlockedMessage(
            eventCount > 0
              ? { title: '活动已结束', subtitle: 'EVENT ENDED' }
              : { title: '尚未配置活动', subtitle: 'NO EVENT CONFIGURED' },
          );
          setDisplayState((current) => applyEvent(current, { type: 'BOOT_READY' }));
          return;
        }

        setBlockedMessage(null);
        eventIdRef.current = event.id;

        const recovered = await recoverCommittedDraw(db, event.id);

        if (disposed) {
          return;
        }

        if (recovered) {
          setRevealedPrizeName(recovered.record.prizeNameSnapshot);
          log('DRAW_RECOVERED', { recordId: recovered.record.id });
          setDisplayState((current) => applyEvent(current, { type: 'BOOT_RECOVERED' }));
          // 不再 scheduleReset：恢复的结果停留到工作人员手动结束。
        } else {
          setDisplayState((current) => applyEvent(current, { type: 'BOOT_READY' }));
        }
      } catch (error) {
        log('DATABASE_ERROR', { stage: 'boot', message: toErrorMessage(error) });

        if (disposed) {
          return;
        }

        eventIdRef.current = undefined;
        setDisplayState((current) =>
          current.status === 'BOOT' ? applyEvent(current, { type: 'BOOT_READY' }) : current,
        );
      }
    })();

    return () => {
      disposed = true;
      // Clear whatever is currently scheduled when boot tears down.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      clearScheduledTimeline(timeoutIdsRef.current);
    };
  }, [db]);

  // Re-evaluate event status when the kiosk regains focus (operator may have just
  // paused/ended the event from /admin on the same machine). Only nudges toward a
  // blocked/paused state and never disturbs an in-flight draw or auto-resumes.
  useEffect(() => {
    const recheck = () => {
      if (!mountedRef.current) {
        return;
      }

      const status = stateRef.current.status;

      if (status !== 'ATTRACT' && status !== 'PAUSED' && status !== 'BOOT') {
        return;
      }

      if (commitInFlightRef.current) {
        return;
      }

      void (async () => {
        try {
          const event = await getActiveEvent(db);

          if (event) {
            setBlockedMessage(null);
            return;
          }

          const paused = await getLatestEventByStatus(db, 'PAUSED');

          if (paused) {
            if (stateRef.current.status !== 'PAUSED') {
              setDisplayState((current) => applyEvent(current, { type: 'PAUSE' }));
            }

            return;
          }

          const eventCount = await db.events.count();
          setBlockedMessage(
            eventCount > 0
              ? { title: '活动已结束', subtitle: 'EVENT ENDED' }
              : { title: '尚未配置活动', subtitle: 'NO EVENT CONFIGURED' },
          );
        } catch (error) {
          log('DATABASE_ERROR', { stage: 'focusRecheck', message: toErrorMessage(error) });
        }
      })();
    };

    window.addEventListener('focus', recheck);

    return () => window.removeEventListener('focus', recheck);
  }, [db]);

  // Panel intro animation on status change (skipped under reduced-motion).
  useEffect(() => {
    const panel = panelRef.current;

    if (!panel || prefersReducedMotion()) {
      return;
    }

    gsap.fromTo(panel, { autoAlpha: 0.88, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.28, ease: 'power2.out' });
  }, [displayState.status]);

  // Re-arm the touch guard (and clear any exit confirmation) once back in ATTRACT.
  useEffect(() => {
    if (displayState.status === 'ATTRACT') {
      commitInFlightRef.current = false;
      setConfirmExit(false);
    }
  }, [displayState.status]);

  return (
    <main className="display-screen" aria-labelledby="display-title" data-state={displayState.status}>
      <SignalCanvas status={displayState.status} />
      <div className="display-brandbar">
        <BrandMark variant="on-light" />
      </div>
      <div className="display-status" aria-hidden="true">
        <span className="display-status-dot" />
        SIGNAL ONLINE
      </div>

      {blockedMessage ? (
        <section className="display-panel" ref={panelRef}>
          <p className="display-eyebrow">{blockedMessage.subtitle}</p>
          <h1 id="display-title">{blockedMessage.title}</h1>
          <p className="display-copy">请联系现场工作人员处理</p>
        </section>
      ) : isResult ? (
        <section className="display-result" ref={panelRef} aria-label="中奖结果">
          <p className="display-result-eyebrow">{copy.subtitle}</p>
          <h1 id="display-title" className="display-result-heading">
            {copy.title}
          </h1>
          <p className="display-result-prize">{revealedPrizeName}</p>
          <p className="display-result-meta">
            恭喜捕获幸运信号
            <br />
            请向现场工作人员领取对应奖品
          </p>
          <div className="display-result-actions">
            <button className="next-participant-button" type="button" onClick={handleRequestExit}>
              {copy.action}
            </button>
          </div>
          {confirmExit ? (
            <div className="confirm-card" role="alertdialog" aria-label="确认结束当前中奖结果">
              <p>确认结束当前中奖结果？</p>
              <div className="confirm-card-actions">
                <button className="confirm-button-cancel" type="button" onClick={handleCancelExit}>
                  取消
                </button>
                <button className="confirm-button-ok" type="button" onClick={performExit}>
                  确认并返回
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="display-panel" ref={panelRef}>
          <p className="display-eyebrow">{copy.subtitle}</p>
          <h1 id="display-title">{copy.title}</h1>
          {needsStaff ? <p className="display-copy">请联系现场工作人员处理</p> : null}
          <button
            className="primary-touch-target"
            type="button"
            onClick={handleTouchStart}
            disabled={interactionLocked}
          >
            {copy.action}
          </button>
        </section>
      )}
    </main>
  );
}

function applyEvent(state: DisplayState, event: DisplayEvent): DisplayState {
  try {
    return transitionDisplayState(state, event);
  } catch {
    return state;
  }
}

function clearScheduledTimeline(timeoutIds: number[]): void {
  for (const timeoutId of timeoutIds) {
    window.clearTimeout(timeoutId);
  }

  timeoutIds.length = 0;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function log(type: LogEntryType, details: Record<string, unknown>): void {
  logStructured(type, details);
}

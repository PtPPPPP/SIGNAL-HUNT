import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { liveQuery } from 'dexie';
import { gsap } from 'gsap';

import {
  clearActiveDrawSession,
  commitPersistentDraw,
  markDrawRevealed,
} from '../../db/drawRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import {
  EventParticipationError,
  getEventParticipationDecision,
  type EventParticipationDecision,
  type EventParticipationErrorCode,
} from '../../domain/draw/eventParticipation';
import { ensureDemoSeed } from '../../features/display/displayBootstrap';
import { logStructured, type LogEntryType } from '../../features/diagnostics/errorLog';
import {
  createInitialDisplayState,
  getDisplayCopy,
  isInteractionLocked,
  type DisplayEvent,
  type DisplayState,
} from '../../features/display/displayStateMachine';
import { applyDisplayEvent } from '../../features/display/displayTransition';
import { POST_COMMIT_TIMELINE_STEPS } from '../../features/display/displayTimeline';
import { BrandMark } from '../../features/brand/BrandMark';
import { subscribeAppChanges } from '../../features/sync/appSync';
import { SignalCanvas } from '../../visual/signal-engine/SignalCanvas';
import type { DrawRecord, DrawSession, Event } from '../../domain/draw/types';

type DisplayPageProps = {
  db?: SignalHuntDatabase;
  now?: () => number;
};

type DisplayDatabaseSnapshot = {
  configuredEvent?: Event;
  eventCount: number;
  participation?: EventParticipationDecision;
  record?: DrawRecord;
  session?: DrawSession;
};

type BlockedMessage = { title: string; subtitle: string; detail?: string; startsAt?: string } | null;

type DisplaySnapshotHandlers = {
  currentState: DisplayState;
  eventIdRef: MutableRefObject<string | undefined>;
  initialAdminRequestedRef: MutableRefObject<boolean>;
  resetInFlightRef: MutableRefObject<boolean>;
  scheduleReset: (delayMs: number) => void;
  setBlockedMessage: Dispatch<SetStateAction<BlockedMessage>>;
  setDisplayState: Dispatch<SetStateAction<DisplayState>>;
  setEventBoundaryAt: Dispatch<SetStateAction<string | undefined>>;
  setRevealedPrizeName: Dispatch<SetStateAction<string | undefined>>;
  setResultActionError: Dispatch<SetStateAction<string | undefined>>;
};

// RESULT 永久停留，直到工作人员手动结束。开启后点击「下一位参与者」需二次确认，
// 防止中奖者拍照 / 指屏时误触退出。展会正式使用建议保持开启。
const CONFIRM_BEFORE_RESET_RESULT = true;
const RESETTING_HOLD_MS = 700;

export function DisplayPage({ db = signalHuntDatabase, now = systemNow }: DisplayPageProps) {
  const [displayState, setDisplayState] = useState<DisplayState>(createInitialDisplayState);
  const [revealedPrizeName, setRevealedPrizeName] = useState<string | undefined>(undefined);
  const [confirmExit, setConfirmExit] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<BlockedMessage>(null);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [eventBoundaryAt, setEventBoundaryAt] = useState<string | undefined>(undefined);
  const [clockNowMs, setClockNowMs] = useState(() => now());
  const [resultActionError, setResultActionError] = useState<string | undefined>(undefined);
  const [syncError, setSyncError] = useState(false);
  const [syncRetryNonce, setSyncRetryNonce] = useState(0);
  const syncErrorRef = useRef(false);

  const panelRef = useRef<HTMLElement | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);
  const eventIdRef = useRef<string | undefined>(undefined);
  const commitInFlightRef = useRef(false);
  const initialAdminRequestedRef = useRef(false);
  const mountedRef = useRef(true);
  const resetInFlightRef = useRef(false);
  const stateRef = useRef(displayState);

  stateRef.current = displayState;

  const copy = getDisplayCopy(displayState.status);
  const interactionLocked = isInteractionLocked(displayState);
  const isResult = displayState.status === 'RESULT' && Boolean(revealedPrizeName);
  const needsStaff = displayState.status === 'ERROR' || displayState.status === 'PAUSED';
  const countdown = blockedMessage?.startsAt
    ? formatCountdown(Date.parse(blockedMessage.startsAt) - clockNowMs)
    : undefined;

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
      setRevealedPrizeName(undefined);
      setResultActionError(undefined);
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
              .then((result) => {
                if (!mountedRef.current) return;

                if (result.record.status === 'VOIDED') {
                  log('DRAW_REVEALED', { recordId, skipped: 'VOIDED' });
                  setRevealedPrizeName(undefined);
                  setDisplayState((current) => applyEvent(current, { type: 'DRAW_VOIDED' }));
                  scheduleReset(RESETTING_HOLD_MS);
                  return;
                }

                log('DRAW_REVEALED', { recordId, transition: result.status });
                setDisplayState((current) => applyEvent(current, step.event));
              })
              .catch((error) => {
                if (!mountedRef.current) return;

                const message = toErrorMessage(error);
                log('DATABASE_ERROR', { stage: 'reveal', message });
                setBlockedMessage({ title: '揭晓保存失败', subtitle: 'REVEAL SAVE FAILED' });
                setDisplayState((current) => applyEvent(current, { type: 'DATABASE_FAILED', message }));
              });
            return;
          }

          setDisplayState((current) => applyEvent(current, step.event));
        }, step.atMs),
      );

      timeoutIdsRef.current.push(...ids);
    },
    [db, scheduleReset],
  );

  const runCommit = useCallback(
    async (eventId: string) => {
      // Yield once so the ARMING feedback paints before we lock the result.
      await Promise.resolve();

      setDisplayState((current) => applyEvent(current, { type: 'COMMIT_STARTED' }));

      try {
        const result = await commitPersistentDraw(db, {
          eventId,
          now: () => new Date(now()).toISOString(),
        });

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
        if (error instanceof EventParticipationError) {
          eventIdRef.current = undefined;
          commitInFlightRef.current = false;
          setBlockedMessage(toParticipationBlockedMessage(error.code, error.event));
          setSyncRetryNonce((current) => current + 1);
        }
        setDisplayState((current) => applyEvent(current, { type: 'COMMIT_FAILED', message }));
      }
    },
    [db, now, schedulePostCommitTimeline],
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
    setResultActionError(undefined);

    if (!eventId || resetInFlightRef.current) {
      setResultActionError('无法结束当前结果，请联系现场工作人员。');
      return;
    }

    resetInFlightRef.current = true;

    void (async () => {
      try {
        await clearActiveDrawSession(db, eventId);
        if (!mountedRef.current) return;

        setDisplayState((current) =>
          current.status === 'RESULT' ? applyEvent(current, { type: 'RESET_STARTED' }) : current,
        );
        scheduleReset(RESETTING_HOLD_MS);
      } catch (error) {
        resetInFlightRef.current = false;
        const message = toErrorMessage(error);
        log('DATABASE_ERROR', { stage: 'manualClear', message });
        if (mountedRef.current) {
          setResultActionError('结果尚未安全结束，请联系现场工作人员重试。');
        }
      }
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

  // Boot and live updates share the same snapshot reconciliation. This prevents
  // initial load, cross-window changes, and time-boundary refreshes from drifting.
  useEffect(() => {
    let disposed = false;

    void (async () => {
      try {
        await ensureDemoSeed(db);
        const snapshot = await readDisplayDatabaseSnapshot(db, eventIdRef.current, now());

        if (disposed) {
          return;
        }

        reconcileDisplaySnapshot(snapshot, {
          currentState: stateRef.current,
          eventIdRef,
          initialAdminRequestedRef,
          resetInFlightRef,
          scheduleReset,
          setBlockedMessage,
          setDisplayState,
          setEventBoundaryAt,
          setRevealedPrizeName,
          setResultActionError,
        });
        setDatabaseReady(true);
      } catch (error) {
        const message = toErrorMessage(error);
        log('DATABASE_ERROR', { stage: 'boot', message });

        if (disposed) {
          return;
        }

        eventIdRef.current = undefined;
        setBlockedMessage({ title: '系统数据暂时不可用', subtitle: 'DATABASE UNAVAILABLE' });
        setDisplayState((current) => applyEvent(current, { type: 'DATABASE_FAILED', message }));
      }
    })();

    return () => {
      disposed = true;
      // Clear whatever is currently scheduled when boot tears down.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      clearScheduledTimeline(timeoutIdsRef.current);
    };
  }, [db, now, scheduleReset]);

  // Dexie liveQuery propagates IndexedDB mutations across same-origin Electron
  // windows through BroadcastChannel. The display therefore reacts immediately
  // when staff clears a result or an operator activates/pauses an event.
  useEffect(() => {
    if (!databaseReady) return;

    const subscription = liveQuery(() => readDisplayDatabaseSnapshot(db, eventIdRef.current, now())).subscribe({
      next: (snapshot) => {
        if (!mountedRef.current || commitInFlightRef.current) return;
        if (syncErrorRef.current) {
          syncErrorRef.current = false;
          setSyncError(false);
        }
        reconcileDisplaySnapshot(snapshot, {
          currentState: stateRef.current,
          eventIdRef,
          initialAdminRequestedRef,
          resetInFlightRef,
          scheduleReset,
          setBlockedMessage,
          setDisplayState,
          setEventBoundaryAt,
          setRevealedPrizeName,
          setResultActionError,
        });
      },
      error: (error) => {
        const message = toErrorMessage(error);
        log('DATABASE_ERROR', { code: 'DISPLAY_CONFIG_SYNC_FAILED', stage: 'liveQuery', message });
        syncErrorRef.current = true;
        setSyncError(true);
        if (stateRef.current.status === 'RESULT') {
          setResultActionError('配置同步失败，当前结果已安全保留，请联系工作人员。');
        } else {
          setBlockedMessage({ title: '配置同步失败', subtitle: 'DISPLAY CONFIG SYNC FAILED' });
          setDisplayState((current) => applyEvent(current, { type: 'DATABASE_FAILED', message }));
        }
      },
    });

    return () => subscription.unsubscribe();
  }, [databaseReady, db, now, scheduleReset, syncRetryNonce]);

  useEffect(() => {
    if (!databaseReady) return;

    return subscribeAppChanges(() => {
      setSyncRetryNonce((current) => current + 1);
    });
  }, [databaseReady]);

  useEffect(() => {
    if (!eventBoundaryAt) return;

    const boundaryMs = Date.parse(eventBoundaryAt);
    if (Number.isNaN(boundaryMs)) return;

    const timeoutId = window.setTimeout(
      () => setSyncRetryNonce((current) => current + 1),
      Math.max(0, boundaryMs - now()) + 1,
    );

    return () => window.clearTimeout(timeoutId);
  }, [eventBoundaryAt, now]);

  useEffect(() => {
    if (!blockedMessage?.startsAt) return;

    setClockNowMs(now());
    const intervalId = window.setInterval(() => setClockNowMs(now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [blockedMessage?.startsAt, now]);

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
      resetInFlightRef.current = false;
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
          {blockedMessage.detail ? <p className="display-copy">{blockedMessage.detail}</p> : null}
          {countdown ? <p className="display-copy" aria-live="polite">距离开始还有 {countdown}</p> : null}
          {!blockedMessage.detail && !countdown ? <p className="display-copy">请联系现场工作人员处理</p> : null}
          {syncError ? (
            <button className="primary-touch-target" type="button" onClick={() => setSyncRetryNonce((current) => current + 1)}>
              重试同步
            </button>
          ) : null}
        </section>
      ) : isResult ? (
        <section className="display-result" ref={panelRef} aria-label="中奖结果">
          <p className="display-result-eyebrow">{copy.subtitle}</p>
          <h1 id="display-title" className="display-result-heading">
            {copy.title}
          </h1>
          <p className="display-result-prize">{revealedPrizeName}</p>
          <p className="display-result-meta">
            请向现场工作人员领取你的奖品
          </p>
          <div className="display-result-actions">
            <button className="next-participant-button" type="button" onClick={handleRequestExit}>
              {copy.action}
            </button>
          </div>
          {resultActionError ? <p className="display-copy" role="alert">{resultActionError}</p> : null}
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
  return applyDisplayEvent(state, event, {
    onError: (details) => log('STATE_TRANSITION_ERROR', details),
  });
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

async function readDisplayDatabaseSnapshot(
  db: SignalHuntDatabase,
  currentEventId?: string,
  now: number = Date.now(),
): Promise<DisplayDatabaseSnapshot> {
  const [events, sessions] = await Promise.all([
    db.events.toArray(),
    db.drawSessions.where('status').equals('COMMITTED').toArray(),
  ]);
  const configuredEvent =
    latestEvent(events.filter((event) => event.status === 'ACTIVE')) ??
    latestEvent(events.filter((event) => event.status === 'PAUSED')) ??
    latestEvent(events);
  // Persisted configuration is authoritative. A backup restore can replace the
  // current event id while this window is open, so do not keep watching a stale
  // in-memory id ahead of the newly configured event.
  const watchedEventId = configuredEvent?.id ?? currentEventId;
  const session = watchedEventId
    ? sessions.find((candidate) => candidate.eventId === watchedEventId)
    : undefined;
  const record = session ? await db.drawRecords.get(session.committedRecordId) : undefined;

  if (session && !record) {
    throw new Error(`Committed draw record ${session.committedRecordId} was not found.`);
  }

  return {
    configuredEvent,
    eventCount: events.length,
    participation: configuredEvent ? getEventParticipationDecision(configuredEvent, now) : undefined,
    record,
    session,
  };
}

function reconcileDisplaySnapshot(snapshot: DisplayDatabaseSnapshot, handlers: DisplaySnapshotHandlers): void {
  const {
    currentState,
    eventIdRef,
    initialAdminRequestedRef,
    resetInFlightRef,
    scheduleReset,
    setBlockedMessage,
    setDisplayState,
    setEventBoundaryAt,
    setRevealedPrizeName,
    setResultActionError,
  } = handlers;

  if (currentState.status === 'RESULT') {
    if (snapshot.session || resetInFlightRef.current) return;

    if (snapshot.configuredEvent && snapshot.participation && snapshot.participation.code !== 'ALLOWED') {
      eventIdRef.current = undefined;
      setBlockedMessage(toParticipationBlockedMessage(snapshot.participation.code, snapshot.configuredEvent));
      setEventBoundaryAt(snapshot.participation.nextBoundaryAt);
    } else if (snapshot.configuredEvent && snapshot.participation?.code === 'ALLOWED') {
      eventIdRef.current = snapshot.configuredEvent.id;
      setBlockedMessage(null);
      setEventBoundaryAt(snapshot.participation.nextBoundaryAt);
    }

    resetInFlightRef.current = true;
    setDisplayState((current) =>
      current.status === 'RESULT' ? applyEvent(current, { type: 'RESET_STARTED' }) : current,
    );
    scheduleReset(RESETTING_HOLD_MS);
    return;
  }

  if (
    currentState.status !== 'BOOT' &&
    currentState.status !== 'ATTRACT' &&
    currentState.status !== 'PAUSED' &&
    currentState.status !== 'ERROR'
  ) {
    return;
  }

  if (snapshot.session && snapshot.record) {
    eventIdRef.current = snapshot.session.eventId;
    setBlockedMessage(null);
    setEventBoundaryAt(undefined);
    setResultActionError(undefined);
    setRevealedPrizeName(snapshot.record.prizeNameSnapshot);
    log('DRAW_RECOVERED', { recordId: snapshot.record.id, source: 'liveQuery' });
    setDisplayState((current) => applyEvent(current, { type: 'DRAW_RECOVERED' }));
    return;
  }

  if (snapshot.configuredEvent && snapshot.participation?.code === 'ALLOWED') {
    eventIdRef.current = snapshot.configuredEvent.id;
    setBlockedMessage(null);
    setEventBoundaryAt(snapshot.participation.nextBoundaryAt);
    setRevealedPrizeName(undefined);

    if (currentState.status === 'BOOT') {
      setDisplayState((current) => applyEvent(current, { type: 'BOOT_READY' }));
    } else if (currentState.status === 'PAUSED') {
      setDisplayState((current) => applyEvent(current, { type: 'RESUME' }));
    } else if (currentState.status === 'ERROR') {
      setDisplayState((current) => applyEvent(current, { type: 'RESET_COMPLETE' }));
    }
    return;
  }

  eventIdRef.current = undefined;
  setRevealedPrizeName(undefined);
  if (snapshot.configuredEvent && snapshot.participation && snapshot.participation.code !== 'ALLOWED') {
    setBlockedMessage(toParticipationBlockedMessage(snapshot.participation.code, snapshot.configuredEvent));
    setEventBoundaryAt(snapshot.participation.nextBoundaryAt);
    if (currentState.status === 'BOOT' || currentState.status === 'ATTRACT') {
      setDisplayState((current) => applyEvent(current, { type: 'PAUSE' }));
    }
    return;
  }

  setEventBoundaryAt(undefined);
  setBlockedMessage(
    { title: '尚未配置活动', subtitle: 'NO EVENT CONFIGURED' },
  );
  if (currentState.status === 'BOOT') {
    setDisplayState((current) => applyEvent(current, { type: 'BOOT_READY' }));
  }
  requestInitialAdmin(snapshot.eventCount, initialAdminRequestedRef);
}

function latestEvent(events: Event[]): Event | undefined {
  return [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function toParticipationBlockedMessage(code: EventParticipationErrorCode, event: Event): NonNullable<BlockedMessage> {
  if (code === 'EVENT_NOT_STARTED') {
    return {
      title: '活动尚未开始',
      subtitle: 'EVENT NOT STARTED',
      detail: event.startAt ? `开始时间：${formatDisplayDateTime(event.startAt)}` : undefined,
      startsAt: event.startAt,
    };
  }

  if (code === 'EVENT_ENDED') {
    return {
      title: '活动已结束',
      subtitle: 'EVENT ENDED',
      detail: '本场活动已结束，感谢参与。',
    };
  }

  return {
    title: '活动暂不可参与',
    subtitle: code === 'EVENT_PAUSED' ? 'EVENT PAUSED' : 'EVENT INACTIVE',
    detail: code === 'EVENT_PAUSED' ? '活动已暂停，请等待工作人员恢复。' : '活动当前未启用。',
  };
}

function formatDisplayDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function formatCountdown(remainingMs: number): string | undefined {
  if (remainingMs <= 0) return undefined;

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function systemNow(): number {
  return Date.now();
}

function requestInitialAdmin(eventCount: number, requestedRef: MutableRefObject<boolean>): void {
  if (eventCount !== 0 || requestedRef.current || !window.signalHuntDesktop) return;

  requestedRef.current = true;
  void window.signalHuntDesktop.control.openAdmin().catch((error) => {
    log('DATABASE_ERROR', { stage: 'openInitialAdmin', message: toErrorMessage(error) });
  });
}

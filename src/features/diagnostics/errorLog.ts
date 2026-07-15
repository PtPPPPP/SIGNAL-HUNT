/**
 * Structured log facade.
 *
 * Two layers:
 * 1. An in-memory ring buffer for instant display / tests (unchanged public API).
 * 2. A persistent IndexedDB mirror (diagnosticLogStore) so the most recent
 *    critical events survive a reload or crash and can be exported from
 *    /diagnostics. The persist write is fire-and-forget — it must never block the
 *    draw path or turn a sync log call into an async one.
 *
 * Details are sanitized (participant PII / phone numbers) at the persistence
 * boundary (AGENTS rule 22/23). Nothing personal leaves the device.
 */
import {
  appendLog,
  clearLogs,
  type DiagnosticLogLevel,
} from './diagnosticLogStore';

export type LogEntryType =
  | 'DRAW_REQUESTED'
  | 'DRAW_COMMITTED'
  | 'DRAW_RECOVERED'
  | 'DRAW_REVEALED'
  | 'INVENTORY_RESERVED'
  | 'DRAW_VOIDED'
  | 'BACKUP_EXPORTED'
  | 'BACKUP_RESTORED'
  | 'EVENT_LIFECYCLE'
  | 'DATABASE_ERROR'
  | 'STATE_TRANSITION_ERROR'
  | 'CANVAS_INIT_ERROR'
  | 'RECOVERY_ERROR'
  | 'UNCAUGHT_ERROR'
  | 'UNHANDLED_REJECTION'
  | 'INFO';

export interface LogEntry {
  type: LogEntryType;
  timestamp: string;
  details?: Record<string, unknown>;
}

const MAX_ENTRIES = 100;
const entries: LogEntry[] = [];

const LEVEL_BY_TYPE: Record<LogEntryType, DiagnosticLogLevel> = {
  DRAW_REQUESTED: 'info',
  DRAW_COMMITTED: 'info',
  DRAW_RECOVERED: 'info',
  DRAW_REVEALED: 'info',
  INVENTORY_RESERVED: 'info',
  DRAW_VOIDED: 'warn',
  BACKUP_EXPORTED: 'info',
  BACKUP_RESTORED: 'info',
  EVENT_LIFECYCLE: 'info',
  INFO: 'info',
  DATABASE_ERROR: 'error',
  STATE_TRANSITION_ERROR: 'error',
  CANVAS_INIT_ERROR: 'error',
  RECOVERY_ERROR: 'error',
  UNCAUGHT_ERROR: 'error',
  UNHANDLED_REJECTION: 'error',
};

function describe(type: LogEntryType, details?: Record<string, unknown>): string {
  if (details?.message && typeof details.message === 'string') {
    return `${type}: ${details.message}`;
  }

  if (details?.stage && typeof details.stage === 'string') {
    return `${type} (${details.stage})`;
  }

  return type;
}

function currentRoute(): string | undefined {
  if (typeof window === 'undefined' || !window.location) {
    return undefined;
  }

  return window.location.pathname;
}

function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
}

export function logStructured(type: LogEntryType, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const entry: LogEntry = { type, timestamp, details };

  entries.push(entry);

  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }

  // Mirror to console so onsite operators with devtools can follow live operation.
  const consoleLevel = LEVEL_BY_TYPE[type];
  if (consoleLevel === 'error') {
    console.error(`[SIGNAL-HUNT] ${type}`, details ?? {});
  } else if (consoleLevel === 'warn') {
    console.warn(`[SIGNAL-HUNT] ${type}`, details ?? {});
  } else {
    console.info(`[SIGNAL-HUNT] ${type}`, details ?? {});
  }

  // Persist (fire-and-forget). A DB failure here must not surface to callers.
  //
  // Skipped under the vitest unit environment: every logStructured() call would
  // otherwise fire a write at the shared signal-hunt singleton, and the resulting
  // transaction traffic across parallel unit tests slowed unrelated boot reads
  // (flaky App routing test). Persistence is exercised directly by
  // diagnosticLogStore.test.ts (appendLog) and end-to-end by Playwright (which
  // runs against the dev server, MODE='development'), so coverage is unaffected.
  if (!isTestEnvironment()) {
    void appendLog({
      level: consoleLevel,
      code: type,
      message: describe(type, details),
      context: details,
      route: currentRoute(),
      appVersion: appVersion(),
      stack: extractStack(details),
    }).catch((error) => {
      console.error('[SIGNAL-HUNT] failed to persist diagnostic log', error);
    });
  }
}

function isTestEnvironment(): boolean {
  return import.meta.env.MODE === 'test';
}

function extractStack(details?: Record<string, unknown>): string | undefined {
  const stack = details?.stack;

  if (typeof stack === 'string') {
    return stack;
  }

  const error = details?.error;

  if (error instanceof Error && error.stack) {
    return error.stack;
  }

  return undefined;
}

/** Returns entries newest-first for display. */
export function readStructuredLog(): LogEntry[] {
  return [...entries].reverse();
}

/** Clears both the in-memory buffer and the persistent store. */
export function clearStructuredLog(): void {
  entries.length = 0;
  void clearLogs().catch((error) => {
    console.error('[SIGNAL-HUNT] failed to clear diagnostic log store', error);
  });
}

let globalErrorCaptureInstalled = false;

/**
 * Capture uncaught errors and unhandled promise rejections into the structured
 * log so they are visible on /diagnostics. Idempotent: safe to call more than
 * once. Installed once at app boot (see src/app/App.tsx) so the buffer covers
 * the whole kiosk session, not just while /diagnostics happens to be open.
 *
 * Only errors that reach the GLOBAL handlers are captured here. Errors caught
 * by try/catch in app code are not logged unless the app explicitly calls
 * logStructured(...) (e.g. 'DATABASE_ERROR').
 */
export function installGlobalErrorCapture(): void {
  if (globalErrorCaptureInstalled || typeof window === 'undefined') {
    return;
  }
  globalErrorCaptureInstalled = true;

  window.addEventListener('error', (event) => {
    logStructured('UNCAUGHT_ERROR', {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      col: event.colno,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    logStructured('UNHANDLED_REJECTION', {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

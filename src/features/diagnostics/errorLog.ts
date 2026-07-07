/**
 * In-memory structured log ring buffer.
 *
 * Exhibition kiosks have no backend log pipeline, so we keep the most recent
 * critical events in memory for the /diagnostics page. Entries are intentionally
 * small and free of personal data (AGENTS rule 22/23). Nothing here is persisted
 * to disk; a page reload clears the buffer.
 */
export type LogEntryType =
  | 'DRAW_REQUESTED'
  | 'DRAW_COMMITTED'
  | 'DRAW_RECOVERED'
  | 'DRAW_REVEALED'
  | 'INVENTORY_RESERVED'
  | 'DRAW_VOIDED'
  | 'DATABASE_ERROR'
  | 'STATE_TRANSITION_ERROR'
  | 'BACKUP_EXPORTED'
  | 'BACKUP_RESTORED'
  | 'EVENT_LIFECYCLE'
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

export function logStructured(type: LogEntryType, details?: Record<string, unknown>): void {
  entries.push({ type, timestamp: new Date().toISOString(), details });

  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }

  // Mirror to console so现场 staff with devtools can follow live operation.
  console.info(`[SIGNAL-HUNT] ${type}`, details ?? {});
}

/** Returns entries newest-first for display. */
export function readStructuredLog(): LogEntry[] {
  return [...entries].reverse();
}

export function clearStructuredLog(): void {
  entries.length = 0;
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

/**
 * Persistent structured-log store backed by the `diagnosticLogs` IndexedDB table.
 *
 * The exhibition kiosk has no backend log pipeline, so we keep the most recent
 * critical events locally in IndexedDB (schema v3) so they survive a page reload
 * or crash and can be exported from /diagnostics. A hard retention cap keeps the
 * table bounded; on every write we trim the oldest overflow entries.
 *
 * Privacy: details are sanitized before persistence (AGENTS rule 22/23). We never
 * store full phone numbers or raw participant PII — participant ids are masked,
 * and known-sensitive keys / phone-shaped strings are redacted.
 */
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';

export type DiagnosticLogLevel = 'info' | 'warn' | 'error';

export interface DiagnosticLogRecord {
  /** Stable unique id so React keys and dedupe are reliable. */
  id: string;
  /** ISO-8601 timestamp; also indexed for newest-first ordering and retention trim. */
  timestamp: string;
  level: DiagnosticLogLevel;
  /** Stable machine code, e.g. 'DRAW_COMMITTED', 'DATABASE_ERROR'. */
  code: string;
  /** Human-readable summary. */
  message: string;
  /** Sanitized structured context. */
  context?: Record<string, unknown>;
  /** Route where the event originated, when known. */
  route?: string;
  appVersion: string;
  stack?: string;
}

export type AppendLogInput = Omit<DiagnosticLogRecord, 'id' | 'timestamp'> & {
  id?: string;
  timestamp?: string;
};

export type ReadLogsFilter = {
  level?: DiagnosticLogLevel;
  code?: string;
  /** Newest-first cap; defaults to MAX_LOG_ENTRIES. */
  limit?: number;
};

export type DiagnosticExport = {
  appVersion: string;
  generatedAt: string;
  environment: {
    userAgent: string;
    viewport: string;
    dpr: number;
    online: boolean;
    platform: string;
  };
  logCount: number;
  logs: DiagnosticLogRecord[];
};

/** Bounded retention so the table never grows unbounded on an 8-hour kiosk. */
export const MAX_LOG_ENTRIES = 500;

let activeDb: SignalHuntDatabase = signalHuntDatabase;

/** Override the database handle (tests inject an isolated per-test database). */
export function setDiagnosticDatabase(db: SignalHuntDatabase): void {
  activeDb = db;
}

export function getDiagnosticDatabase(): SignalHuntDatabase {
  return activeDb;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `log-${Date.now()}-${Math.floor(performance.now() * 1000)}`;
}

/**
 * Append one sanitized log entry and trim the oldest overflow. Fire-and-forget
 * safe: callers (errorLog) invoke this without awaiting, so a DB hiccup never
 * blocks the draw path. Errors are mirrored to the console only.
 */
export async function appendLog(input: AppendLogInput): Promise<void> {
  const record: DiagnosticLogRecord = {
    id: input.id ?? createId(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    level: input.level,
    code: input.code,
    message: input.message,
    context: sanitizeContext(input.context),
    route: input.route,
    appVersion: input.appVersion,
    stack: input.stack,
  };

  await activeDb.transaction('rw', activeDb.diagnosticLogs, async () => {
    await activeDb.diagnosticLogs.put(record);

    const total = await activeDb.diagnosticLogs.count();
    const overflow = total - MAX_LOG_ENTRIES;

    if (overflow > 0) {
      // Delete the oldest `overflow` rows by timestamp. orderBy on the indexed
      // timestamp column keeps this an indexed scan rather than a table load.
      const oldest = await activeDb.diagnosticLogs.orderBy('timestamp').limit(overflow).primaryKeys();
      await activeDb.diagnosticLogs.bulkDelete(oldest);
    }
  });
}

/** Read logs newest-first, optionally filtered by level/code, capped at limit. */
export async function readLogs(filter: ReadLogsFilter = {}): Promise<DiagnosticLogRecord[]> {
  const limit = Math.max(0, filter.limit ?? MAX_LOG_ENTRIES);

  let collection = activeDb.diagnosticLogs.orderBy('timestamp').reverse();

  if (filter.level) {
    collection = collection.filter((record) => record.level === filter.level);
  }

  if (filter.code) {
    const code = filter.code;
    collection = collection.filter((record) => record.code === code);
  }

  const rows = await collection.limit(limit).toArray();

  return rows;
}

export async function countLogs(): Promise<number> {
  return activeDb.diagnosticLogs.count();
}

export async function clearLogs(): Promise<void> {
  await activeDb.diagnosticLogs.clear();
}

/** Build a JSON-serializable diagnostics bundle for the export button. */
export async function buildDiagnosticExport(): Promise<DiagnosticExport> {
  const logs = await readLogs({ limit: MAX_LOG_ENTRIES });

  return {
    appVersion: logs[0]?.appVersion ?? readAppVersion(),
    generatedAt: new Date().toISOString(),
    environment: gatherEnvironment(),
    logCount: logs.length,
    logs,
  };
}

function readAppVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
}

function gatherEnvironment(): DiagnosticExport['environment'] {
  if (typeof window === 'undefined') {
    return { userAgent: '—', viewport: '—', dpr: 1, online: true, platform: '—' };
  }

  const nav = navigator as Navigator & { deviceMemory?: number };

  return {
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    dpr: window.devicePixelRatio || 1,
    online: navigator.onLine,
    platform: nav.platform ?? '—',
  };
}

/**
 * Redact personal data before persistence. Returns a fresh object so the caller's
 * original details (which may still be needed in memory) are never mutated.
 */
export function sanitizeContext(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context || typeof context !== 'object') {
    return context;
  }

  return sanitizeValue(context) as Record<string, unknown>;
}

const SENSITIVE_KEY = /participant|phone|mobile|tel|email|wechat|weixin|openid|idcard|passport|name$/i;
const PHONE_LIKE = /\+?\d[\d\s\-()]{6,}\d/;

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return PHONE_LIKE.test(value) ? maskValue(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) {
        // Known-sensitive keys are fully redacted (never partially leaked).
        result[key] = '[redacted]';
      } else {
        result[key] = sanitizeValue(child);
      }
    }

    return result;
  }

  return value;
}

/** Keep the last 4 chars visible for support debugging, mask the rest. */
function maskValue(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= 4) {
    return '[redacted]';
  }

  return `${'*'.repeat(Math.min(8, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import {
  appendLog,
  buildDiagnosticExport,
  clearLogs,
  countLogs,
  MAX_LOG_ENTRIES,
  readLogs,
  sanitizeContext,
  setDiagnosticDatabase,
} from './diagnosticLogStore';

describe('persistent diagnostic log store', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-logs-${crypto.randomUUID()}`);
    await db.open();
    setDiagnosticDatabase(db);
  });

  afterEach(async () => {
    await clearLogs();
    await db.delete();
  });

  it('persists entries and reads them newest-first', async () => {
    await appendLog({ level: 'info', code: 'DRAW_COMMITTED', message: 'first', appVersion: '0.1.0' });
    await appendLog({ level: 'error', code: 'DATABASE_ERROR', message: 'second', appVersion: '0.1.0' });

    const logs = await readLogs();

    expect(logs).toHaveLength(2);
    expect(logs[0].code).toBe('DATABASE_ERROR');
    expect(logs[1].code).toBe('DRAW_COMMITTED');
    await expect(countLogs()).resolves.toBe(2);
  });

  it('filters by level and code', async () => {
    await appendLog({ level: 'info', code: 'DRAW_COMMITTED', message: 'a', appVersion: '0.1.0' });
    await appendLog({ level: 'error', code: 'DATABASE_ERROR', message: 'b', appVersion: '0.1.0' });
    await appendLog({ level: 'error', code: 'STATE_TRANSITION_ERROR', message: 'c', appVersion: '0.1.0' });

    await expect(readLogs({ level: 'error' })).resolves.toHaveLength(2);
    await expect(readLogs({ code: 'DATABASE_ERROR' })).resolves.toHaveLength(1);
    await expect(readLogs({ level: 'info', code: 'DATABASE_ERROR' })).resolves.toHaveLength(0);
  });

  it('trims the oldest entries beyond MAX_LOG_ENTRIES', async () => {
    for (let i = 0; i < MAX_LOG_ENTRIES + 5; i += 1) {
      await appendLog({
        level: 'info',
        code: 'INFO',
        message: `entry-${i}`,
        appVersion: '0.1.0',
        timestamp: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
      });
    }

    await expect(countLogs()).resolves.toBe(MAX_LOG_ENTRIES);
    const logs = await readLogs();
    // The 5 oldest (entry-0..entry-4) were trimmed; newest kept.
    expect(logs[0].message).toBe(`entry-${MAX_LOG_ENTRIES + 4}`);
  });

  it('clearLogs empties the store', async () => {
    await appendLog({ level: 'info', code: 'INFO', message: 'x', appVersion: '0.1.0' });
    await clearLogs();
    await expect(countLogs()).resolves.toBe(0);
  });

  it('builds an export bundle with environment + sanitized logs', async () => {
    await appendLog({
      level: 'error',
      code: 'DATABASE_ERROR',
      message: 'boom',
      appVersion: '0.1.0',
      context: { stage: 'commit' },
    });

    const exported = await buildDiagnosticExport();

    expect(exported.appVersion).toBe('0.1.0');
    expect(exported.logCount).toBe(1);
    expect(exported.logs[0].code).toBe('DATABASE_ERROR');
    expect(exported.environment).toBeDefined();
    expect(exported.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('diagnostic log sanitization', () => {
  it('masks phone-shaped strings', () => {
    const sanitized = sanitizeContext({ contact: '13800138000' }) as { contact: string };

    expect(sanitized.contact).not.toBe('13800138000');
    expect(sanitized.contact).toMatch(/\*+8000$/);
  });

  it('redacts sensitive keys regardless of value shape', () => {
    const sanitized = sanitizeContext({
      participantId: 'participant-abc-123',
      recordId: 'record-1',
      email: 'a@b.com',
    }) as Record<string, string>;

    expect(sanitized.participantId).not.toContain('abc-123');
    expect(sanitized.email).toBe('[redacted]');
    // Non-sensitive keys pass through.
    expect(sanitized.recordId).toBe('record-1');
  });

  it('walks nested objects and arrays', () => {
    const sanitized = sanitizeContext({
      rows: [{ phone: '13800138000', level: 1 }],
      meta: { participantId: 'p-1' },
    }) as { rows: Array<{ phone: string; level: number }>; meta: { participantId: string } };

    expect(sanitized.rows[0].phone).not.toBe('13800138000');
    expect(sanitized.rows[0].level).toBe(1);
    expect(sanitized.meta.participantId).not.toBe('p-1');
  });

  it('does not mutate the caller input', () => {
    const input = { phone: '13800138000', keep: 'visible' };
    sanitizeContext(input);

    expect(input.phone).toBe('13800138000');
    expect(input.keep).toBe('visible');
  });
});

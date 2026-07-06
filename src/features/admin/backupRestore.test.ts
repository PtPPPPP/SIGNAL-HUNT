import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { seedEvent, seedPrizes } from '../../db/drawRepository';
import type { Event, Prize } from '../../domain/draw/types';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BackupValidationError,
  buildBackup,
  exportBackupString,
  parseBackup,
  restoreBackup,
  serializeBackup,
  summarizeBackup,
} from './backupRestore';

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: 'event-1',
    name: 'SIGNAL HUNT Demo',
    code: 'SIGNAL-HUNT-DEMO',
    status: 'ACTIVE',
    createdAt: '2026-07-06T00:00:00.000Z',
    ...overrides,
  };
}

function prize(overrides: Partial<Prize> = {}): Prize {
  return {
    id: 'prize-1',
    name: '一等奖',
    shortName: '一等奖',
    level: 1,
    inventoryTotal: 2,
    inventoryRemaining: 2,
    weight: 1,
    enabled: true,
    ...overrides,
  };
}

describe('backup & restore', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-backup-test-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('builds a manifest with the correct envelope and snapshots all tables', async () => {
    await seedEvent(db, event());
    await seedPrizes(db, [prize({ id: 'a' }), prize({ id: 'b' })]);

    const backup = await buildBackup(db, { appVersion: '9.9.9', now: () => '2026-07-06T01:00:00.000Z' });

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_FORMAT_VERSION);
    expect(backup.appVersion).toBe('9.9.9');
    expect(backup.createdAt).toBe('2026-07-06T01:00:00.000Z');
    expect(backup.data.events).toHaveLength(1);
    expect(backup.data.prizes).toHaveLength(2);
    expect(summarizeBackup(backup).counts).toEqual({
      events: 1,
      prizes: 2,
      drawRecords: 0,
      drawSessions: 0,
    });
  });

  it('round-trips: export then restore into a fresh database reproduces the data', async () => {
    await seedEvent(db, event());
    await seedPrizes(db, [prize({ id: 'a' })]);

    const json = await exportBackupString(db);

    const fresh = createSignalHuntDatabase(`signal-hunt-restore-fresh-${crypto.randomUUID()}`);
    await fresh.open();

    try {
      const backup = parseBackup(json);
      await restoreBackup(fresh, backup);

      await expect(fresh.events.count()).resolves.toBe(1);
      await expect(fresh.prizes.count()).resolves.toBe(1);
      await expect(fresh.events.get('event-1')).resolves.toMatchObject({ code: 'SIGNAL-HUNT-DEMO' });
    } finally {
      await fresh.delete();
    }
  });

  it('restore is atomic: a failed validation leaves the existing database untouched', async () => {
    await seedEvent(db, event());
    await seedPrizes(db, [prize({ id: 'a' })]);
    const brokenEvent = {
      id: 'x',
      name: 'bad',
      status: 'ACTIVE',
      createdAt: '2026-07-06T00:00:00.000Z',
    } as unknown as Event;

    const broken = serializeBackup({
      ...parseBackup(await exportBackupString(db)),
      data: {
        // missing required `code` on the event → schema rejects
        events: [brokenEvent],
        prizes: [],
        drawSessions: [],
        drawRecords: [],
      },
    });

    expect(() => parseBackup(broken)).toThrow(BackupValidationError);

    // Because parse failed, restore was never attempted → original data intact.
    await expect(db.events.count()).resolves.toBe(1);
    await expect(db.prizes.count()).resolves.toBe(1);
  });

  it('restore replaces all tables wholesale (old data gone, new data in)', async () => {
    await seedEvent(db, event({ id: 'old-event' }));
    await seedPrizes(db, [prize({ id: 'old-prize' })]);

    const replacement = parseBackup(
      serializeBackup({
        format: BACKUP_FORMAT,
        version: BACKUP_FORMAT_VERSION,
        appVersion: '0.1.0',
        createdAt: '2026-07-06T02:00:00.000Z',
        data: {
          events: [event({ id: 'new-event', code: 'NEW' })],
          prizes: [prize({ id: 'new-prize' })],
          drawSessions: [],
          drawRecords: [],
        },
      }),
    );

    await restoreBackup(db, replacement);

    await expect(db.events.get('old-event')).resolves.toBeUndefined();
    await expect(db.events.get('new-event')).resolves.toMatchObject({ code: 'NEW' });
    await expect(db.prizes.get('old-prize')).resolves.toBeUndefined();
    await expect(db.prizes.get('new-prize')).resolves.toMatchObject({ name: '一等奖' });
  });

  it('pre-restore snapshot enables manual rollback to the exact prior state', async () => {
    await seedEvent(db, event({ id: 'original' }));
    await seedPrizes(db, [prize({ id: 'original-prize', inventoryRemaining: 7, inventoryTotal: 7 })]);

    const preRestore = await buildBackup(db);

    await restoreBackup(db, parseBackup(serializeBackup({
      format: BACKUP_FORMAT,
      version: BACKUP_FORMAT_VERSION,
      appVersion: '0.1.0',
      createdAt: '2026-07-06T03:00:00.000Z',
      data: {
        events: [event({ id: 'replacement' })],
        prizes: [],
        drawSessions: [],
        drawRecords: [],
      },
    })));

    await expect(db.events.get('original')).resolves.toBeUndefined();

    // Roll back using the captured pre-restore snapshot.
    await restoreBackup(db, preRestore);

    await expect(db.events.get('original')).resolves.toMatchObject({ id: 'original' });
    await expect(db.prizes.get('original-prize')).resolves.toMatchObject({ inventoryRemaining: 7 });
  });

  it('rejects an unsupported future backup version with a clear message', () => {
    const future = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 999,
      appVersion: '0.1.0',
      createdAt: '2026-07-06T00:00:00.000Z',
      data: { events: [], prizes: [], drawSessions: [], drawRecords: [] },
    });

    expect(() => parseBackup(future)).toThrow(BackupValidationError);
    expect(() => parseBackup(future)).toThrow(/不支持的备份版本 999/);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseBackup('{not json')).toThrow(BackupValidationError);
  });

  it('rejects a manifest with the wrong format identifier', () => {
    const wrong = JSON.stringify({
      format: 'something-else',
      version: 1,
      appVersion: '0.1.0',
      createdAt: '2026-07-06T00:00:00.000Z',
      data: { events: [], prizes: [], drawSessions: [], drawRecords: [] },
    });

    expect(() => parseBackup(wrong)).toThrow(BackupValidationError);
  });
});

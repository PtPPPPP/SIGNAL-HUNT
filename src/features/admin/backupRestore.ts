import { z } from 'zod';

import type { SignalHuntDatabase } from '../../db/database';

export const BACKUP_FORMAT = 'signal-hunt-backup' as const;
export const BACKUP_FORMAT_VERSION = 1;

const eventBackupSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  code: z.string(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED']),
  createdAt: z.string(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
});

const prizeBackupSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  shortName: z.string(),
  level: z.number(),
  inventoryTotal: z.number(),
  inventoryRemaining: z.number(),
  weight: z.number(),
  enabled: z.boolean(),
  imageUrl: z.string().optional(),
  probabilityMode: z.enum(['FIXED', 'TIME_RELEASE', 'SMART_PACING']).optional(),
  pacing: z
    .object({
      minMultiplier: z.number().optional(),
      maxMultiplier: z.number().optional(),
      sensitivity: z.number().optional(),
      minIntervalMinutes: z.number().optional(),
      catchUpEnabled: z.boolean().optional(),
      catchUpStartBeforeEndMinutes: z.number().optional(),
      catchUpMaxMultiplier: z.number().optional(),
      releaseSchedule: z
        .array(
          z.object({
            time: z.string(),
            maxCumulativeWins: z.number(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const drawSessionBackupSchema = z.object({
  id: z.string().min(1),
  eventId: z.string(),
  status: z.literal('COMMITTED'),
  committedRecordId: z.string(),
  createdAt: z.string(),
  committedAt: z.string(),
});

const drawRecordBackupSchema = z.object({
  id: z.string().min(1),
  eventId: z.string(),
  sessionId: z.string(),
  participantId: z.string().optional(),
  prizeId: z.string(),
  prizeNameSnapshot: z.string(),
  createdAt: z.string(),
  committedAt: z.string(),
  revealedAt: z.string().optional(),
  redeemed: z.boolean(),
  redeemedAt: z.string().optional(),
  voidedAt: z.string().optional(),
  voidReason: z.string().optional(),
  status: z.enum(['COMMITTED', 'REVEALED', 'REDEEMED', 'VOIDED']),
});

export const backupManifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_FORMAT_VERSION),
  appVersion: z.string(),
  createdAt: z.string(),
  data: z.object({
    events: z.array(eventBackupSchema),
    prizes: z.array(prizeBackupSchema),
    drawSessions: z.array(drawSessionBackupSchema),
    drawRecords: z.array(drawRecordBackupSchema),
  }),
});

export type BackupManifest = z.infer<typeof backupManifestSchema>;

export type BackupSummary = {
  format: string;
  version: number;
  appVersion: string;
  createdAt: string;
  counts: { events: number; prizes: number; drawRecords: number; drawSessions: number };
};

export class BackupValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues[0] ?? '备份文件无效');
    this.name = 'BackupValidationError';
  }
}

export type BuildBackupOptions = {
  appVersion?: string;
  now?: () => string;
};

export async function buildBackup(
  db: SignalHuntDatabase,
  options: BuildBackupOptions = {},
): Promise<BackupManifest> {
  const [events, prizes, drawSessions, drawRecords] = await Promise.all([
    db.events.toArray(),
    db.prizes.toArray(),
    db.drawSessions.toArray(),
    db.drawRecords.toArray(),
  ]);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    appVersion: options.appVersion ?? __APP_VERSION__,
    createdAt: (options.now ?? (() => new Date().toISOString()))(),
    data: { events, prizes, drawSessions, drawRecords },
  };
}

export function serializeBackup(backup: BackupManifest): string {
  return JSON.stringify(backup, null, 2);
}

export async function exportBackupString(
  db: SignalHuntDatabase,
  options: BuildBackupOptions = {},
): Promise<string> {
  return serializeBackup(await buildBackup(db, options));
}

export function summarizeBackup(backup: BackupManifest): BackupSummary {
  return {
    format: backup.format,
    version: backup.version,
    appVersion: backup.appVersion,
    createdAt: backup.createdAt,
    counts: {
      events: backup.data.events.length,
      prizes: backup.data.prizes.length,
      drawRecords: backup.data.drawRecords.length,
      drawSessions: backup.data.drawSessions.length,
    },
  };
}

export function parseBackup(rawJson: string): BackupManifest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new BackupValidationError(['备份不是有效的 JSON。']);
  }

  if (parsed && typeof parsed === 'object' && 'version' in parsed) {
    const version = (parsed as { version: unknown }).version;

    if (typeof version === 'number' && version !== BACKUP_FORMAT_VERSION) {
      throw new BackupValidationError([
        `不支持的备份版本 ${version}（当前仅支持版本 ${BACKUP_FORMAT_VERSION}）。`,
      ]);
    }
  }

  const result = backupManifestSchema.safeParse(parsed);

  if (!result.success) {
    throw new BackupValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }

  return result.data;
}

/**
 * Restore a validated backup atomically.
 *
 * All four tables are cleared and rewritten inside a single Dexie transaction, so
 * IndexedDB either commits the entire restore or rolls it back — a mid-restore
 * failure can never leave a half-written database. Callers SHOULD capture a
 * pre-restore backup first (buildBackup) so the operator can roll back manually.
 */
export async function restoreBackup(db: SignalHuntDatabase, backup: BackupManifest): Promise<void> {
  await db.transaction('rw', db.events, db.prizes, db.drawSessions, db.drawRecords, async () => {
    await Promise.all([
      db.events.clear(),
      db.prizes.clear(),
      db.drawSessions.clear(),
      db.drawRecords.clear(),
    ]);

    await Promise.all([
      db.events.bulkPut(backup.data.events),
      db.prizes.bulkPut(backup.data.prizes),
      db.drawSessions.bulkPut(backup.data.drawSessions),
      db.drawRecords.bulkPut(backup.data.drawRecords),
    ]);
  });
}

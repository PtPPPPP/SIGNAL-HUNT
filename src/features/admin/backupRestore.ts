import { z } from 'zod';

import type { SignalHuntDatabase } from '../../db/database';
import { getEventValidationIssues } from '../../domain/draw/eventValidation';
import { getPrizeValidationIssues } from '../../domain/draw/prizeValidation';

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

export type BackupValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export type BackupValidationResult = {
  valid: boolean;
  errors: BackupValidationIssue[];
  warnings: BackupValidationIssue[];
  summary: BackupSummary;
};

export type BackupInspectionResult = {
  backup?: BackupManifest;
  validation: BackupValidationResult;
};

export type BackupValidationOptions = {
  protectedEndedEventIds?: ReadonlySet<string>;
};

export class BackupValidationError extends Error {
  constructor(
    public readonly issues: string[],
    public readonly validation?: BackupValidationResult,
  ) {
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

export function inspectBackup(rawJson: string): BackupInspectionResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return invalidInspection('INVALID_JSON', '(root)', '备份不是有效的 JSON。');
  }

  if (parsed && typeof parsed === 'object' && 'version' in parsed) {
    const version = (parsed as { version: unknown }).version;

    if (typeof version === 'number' && version !== BACKUP_FORMAT_VERSION) {
      return invalidInspection(
        'UNSUPPORTED_VERSION',
        'version',
        `不支持的备份版本 ${version}（当前仅支持版本 ${BACKUP_FORMAT_VERSION}）。`,
      );
    }
  }

  const result = backupManifestSchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      code: 'SCHEMA_INVALID',
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    }));

    return {
      validation: {
        valid: false,
        errors,
        warnings: [],
        summary: emptySummary(),
      },
    };
  }

  const validation = validateBackupManifest(result.data);
  return { backup: result.data, validation };
}

export function parseBackup(rawJson: string): BackupManifest {
  const inspection = inspectBackup(rawJson);

  if (!inspection.backup || !inspection.validation.valid) {
    throwValidation(inspection.validation);
  }

  return inspection.backup;
}

export function validateBackupManifest(
  backup: BackupManifest,
  options: BackupValidationOptions = {},
): BackupValidationResult {
  const errors: BackupValidationIssue[] = [];
  const warnings: BackupValidationIssue[] = [];
  const eventIds = new Set(backup.data.events.map((event) => event.id));
  const prizeIds = new Set(backup.data.prizes.map((prize) => prize.id));

  collectDuplicateIds(backup.data.events, 'data.events', errors);
  collectDuplicateIds(backup.data.prizes, 'data.prizes', errors);
  collectDuplicateIds(backup.data.drawRecords, 'data.drawRecords', errors);
  collectDuplicateIds(backup.data.drawSessions, 'data.drawSessions', errors);
  collectDuplicateValues(backup.data.events, 'code', 'data.events', 'DUPLICATE_EVENT_CODE', errors);

  const activeEvents = backup.data.events.filter((event) => event.status === 'ACTIVE');
  if (activeEvents.length > 1) {
    addIssue(errors, 'MULTIPLE_ACTIVE_EVENTS', 'data.events', '备份中最多只能有一个激活活动。');
  }

  backup.data.events.forEach((event, index) => {
    const path = `data.events.${index}`;
    const issues = getEventValidationIssues(event);
    Object.entries(issues).forEach(([field, message]) => {
      if (message) addIssue(errors, 'INVALID_EVENT', `${path}.${field}`, message);
    });

    if (options.protectedEndedEventIds?.has(event.id) && event.status !== 'ENDED') {
      addIssue(
        errors,
        'ENDED_EVENT_REVIVED',
        `${path}.status`,
        `活动「${event.name}」已经结束，不能通过备份恢复为其他状态。`,
      );
    }
  });

  backup.data.prizes.forEach((prize, index) => {
    const path = `data.prizes.${index}`;
    const issues = getPrizeValidationIssues(prize);
    Object.entries(issues).forEach(([field, message]) => {
      if (message) addIssue(errors, 'INVALID_PRIZE', `${path}.${field}`, message);
    });
  });

  const nonVoidedWinsByPrize = new Map<string, number>();
  backup.data.drawRecords.forEach((record, index) => {
    const path = `data.drawRecords.${index}`;

    if (!eventIds.has(record.eventId)) {
      addIssue(errors, 'MISSING_RECORD_EVENT', `${path}.eventId`, `抽奖记录引用了不存在的活动「${record.eventId}」。`);
    }
    if (!prizeIds.has(record.prizeId)) {
      addIssue(errors, 'MISSING_RECORD_PRIZE', `${path}.prizeId`, `抽奖记录引用了不存在的奖品「${record.prizeId}」。`);
    }

    validateDrawRecord(record, path, errors);
    if (record.status !== 'VOIDED') {
      nonVoidedWinsByPrize.set(record.prizeId, (nonVoidedWinsByPrize.get(record.prizeId) ?? 0) + 1);
    }
  });

  backup.data.prizes.forEach((prize, index) => {
    const issuedInventory = prize.inventoryTotal - prize.inventoryRemaining;
    const recordedWins = nonVoidedWinsByPrize.get(prize.id) ?? 0;
    if (recordedWins > issuedInventory) {
      addIssue(
        errors,
        'INVENTORY_RECORD_MISMATCH',
        `data.prizes.${index}.inventoryRemaining`,
        `奖品「${prize.name}」有 ${recordedWins} 条有效中奖记录，但库存仅记录发放 ${issuedInventory} 件。`,
      );
    }
  });

  const sessionsByEvent = new Map<string, number>();
  const sessionsByRecord = new Map<string, number>();
  const eventById = new Map(backup.data.events.map((event) => [event.id, event]));
  const recordById = new Map(backup.data.drawRecords.map((record) => [record.id, record]));

  backup.data.drawSessions.forEach((session, index) => {
    const path = `data.drawSessions.${index}`;
    const event = eventById.get(session.eventId);
    const record = recordById.get(session.committedRecordId);

    if (!event) addIssue(errors, 'MISSING_SESSION_EVENT', `${path}.eventId`, `当前会话引用了不存在的活动「${session.eventId}」。`);
    if (!record) addIssue(errors, 'MISSING_SESSION_RECORD', `${path}.committedRecordId`, `当前会话引用了不存在的抽奖记录「${session.committedRecordId}」。`);
    if (event?.status === 'ENDED') {
      addIssue(errors, 'ENDED_EVENT_ACTIVE_SESSION', path, `已结束活动「${event.name}」不能保留当前抽奖会话。`);
    }

    if (record) {
      if (record.eventId !== session.eventId) {
        addIssue(errors, 'SESSION_EVENT_MISMATCH', path, '当前会话和抽奖记录不属于同一活动。');
      }
      if (record.sessionId !== session.id) {
        addIssue(errors, 'SESSION_RECORD_MISMATCH', path, '当前会话编号与抽奖记录不一致。');
      }
      if (!prizeIds.has(record.prizeId)) {
        addIssue(errors, 'MISSING_SESSION_PRIZE', path, `当前会话关联的奖品「${record.prizeId}」不存在。`);
      }
      if (record.status === 'VOIDED') {
        addIssue(errors, 'VOIDED_ACTIVE_SESSION', path, '已作废记录不能作为有效展示会话。');
      }
    }

    sessionsByEvent.set(session.eventId, (sessionsByEvent.get(session.eventId) ?? 0) + 1);
    sessionsByRecord.set(session.committedRecordId, (sessionsByRecord.get(session.committedRecordId) ?? 0) + 1);
  });

  for (const [eventId, count] of sessionsByEvent) {
    if (count > 1) addIssue(errors, 'MULTIPLE_EVENT_SESSIONS', 'data.drawSessions', `活动「${eventId}」存在多个当前抽奖会话。`);
  }
  for (const [recordId, count] of sessionsByRecord) {
    if (count > 1) addIssue(errors, 'MULTIPLE_RECORD_SESSIONS', 'data.drawSessions', `抽奖记录「${recordId}」被多个当前会话引用。`);
  }

  if (activeEvents.length === 1) {
    const eligible = backup.data.prizes.some(
      (prize) => prize.enabled && prize.inventoryRemaining > 0 && prize.weight > 0,
    );
    if (!eligible) {
      addIssue(warnings, 'NO_ELIGIBLE_PRIZE', 'data.prizes', '激活活动当前没有可抽取的启用奖品。');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: summarizeBackup(backup),
  };
}

/** Restores a fully validated backup and verifies the written snapshot before commit. */
export async function restoreBackup(db: SignalHuntDatabase, backup: BackupManifest): Promise<BackupValidationResult> {
  const initialValidation = validateBackupManifest(backup);
  if (!initialValidation.valid) throwValidation(initialValidation);

  return db.transaction('rw', db.events, db.prizes, db.drawSessions, db.drawRecords, async () => {
    const protectedEndedEventIds = new Set(
      (await db.events.where('status').equals('ENDED').toArray()).map((event) => event.id),
    );
    const validation = validateBackupManifest(backup, { protectedEndedEventIds });
    if (!validation.valid) throwValidation(validation);

    await db.events.clear();
    await db.prizes.clear();
    await db.drawSessions.clear();
    await db.drawRecords.clear();

    await db.events.bulkPut(backup.data.events);
    await db.prizes.bulkPut(backup.data.prizes);
    await db.drawSessions.bulkPut(backup.data.drawSessions);
    await db.drawRecords.bulkPut(backup.data.drawRecords);

    const restored = await readManifestInsideTransaction(db, backup);
    const restoredValidation = validateBackupManifest(restored, { protectedEndedEventIds });
    if (!restoredValidation.valid || !sameManifestData(restored, backup)) {
      throw new BackupValidationError(['恢复结果复核失败，数据库已自动回滚。'], restoredValidation);
    }

    return restoredValidation;
  });
}

function validateDrawRecord(
  record: BackupManifest['data']['drawRecords'][number],
  path: string,
  errors: BackupValidationIssue[],
): void {
  for (const [field, value] of Object.entries({
    createdAt: record.createdAt,
    committedAt: record.committedAt,
    revealedAt: record.revealedAt,
    redeemedAt: record.redeemedAt,
    voidedAt: record.voidedAt,
  })) {
    if (value && Number.isNaN(Date.parse(value))) {
      addIssue(errors, 'INVALID_RECORD_TIME', `${path}.${field}`, '时间格式无效。');
    }
  }

  if (
    record.status === 'COMMITTED' &&
    (record.revealedAt || record.redeemed || record.redeemedAt || record.voidedAt || record.voidReason)
  ) {
    addIssue(errors, 'COMMITTED_STATE_CONFLICT', path, '已提交记录不能同时包含兑奖或作废信息。');
  }
  if (record.status === 'REVEALED' && (!record.revealedAt || record.redeemed || record.redeemedAt || record.voidedAt || record.voidReason)) {
    addIssue(errors, 'REVEALED_STATE_CONFLICT', path, '已揭晓记录的揭晓、兑奖或作废字段不一致。');
  }
  if (record.status === 'REDEEMED' && (!record.redeemed || !record.redeemedAt || record.voidedAt || record.voidReason)) {
    addIssue(errors, 'REDEEMED_STATE_CONFLICT', path, '已兑奖记录必须包含兑奖时间，且不能同时作废。');
  }
  if (record.status === 'VOIDED' && (record.redeemed || record.redeemedAt || !record.voidedAt || !record.voidReason?.trim())) {
    addIssue(errors, 'VOIDED_STATE_CONFLICT', path, '已作废记录不能兑奖，并且必须包含作废时间和原因。');
  }
}

function collectDuplicateIds<T extends { id: string }>(
  items: readonly T[],
  path: string,
  errors: BackupValidationIssue[],
): void {
  collectDuplicateValues(items, 'id', path, 'DUPLICATE_ID', errors);
}

function collectDuplicateValues<T, K extends keyof T>(
  items: readonly T[],
  key: K,
  path: string,
  code: string,
  errors: BackupValidationIssue[],
): void {
  const seen = new Set<T[K]>();
  const duplicates = new Set<T[K]>();
  items.forEach((item) => (seen.has(item[key]) ? duplicates.add(item[key]) : seen.add(item[key])));
  duplicates.forEach((value) => addIssue(errors, code, path, `存在重复值「${String(value)}」。`));
}

function addIssue(target: BackupValidationIssue[], code: string, path: string, message: string): void {
  target.push({ code, path, message });
}

function invalidInspection(code: string, path: string, message: string): BackupInspectionResult {
  return {
    validation: {
      valid: false,
      errors: [{ code, path, message }],
      warnings: [],
      summary: emptySummary(),
    },
  };
}

function emptySummary(): BackupSummary {
  return {
    format: '',
    version: 0,
    appVersion: '',
    createdAt: '',
    counts: { events: 0, prizes: 0, drawRecords: 0, drawSessions: 0 },
  };
}

function throwValidation(validation: BackupValidationResult): never {
  const issues = validation.errors.map((issue) => `${issue.path}: ${issue.message}`);
  throw new BackupValidationError(issues, validation);
}

async function readManifestInsideTransaction(
  db: SignalHuntDatabase,
  envelope: BackupManifest,
): Promise<BackupManifest> {
  const [events, prizes, drawSessions, drawRecords] = await Promise.all([
    db.events.toArray(),
    db.prizes.toArray(),
    db.drawSessions.toArray(),
    db.drawRecords.toArray(),
  ]);

  return { ...envelope, data: { events, prizes, drawSessions, drawRecords } };
}

function sameManifestData(left: BackupManifest, right: BackupManifest): boolean {
  const sortedData = (manifest: BackupManifest) => ({
    events: [...manifest.data.events].sort((a, b) => a.id.localeCompare(b.id)),
    prizes: [...manifest.data.prizes].sort((a, b) => a.id.localeCompare(b.id)),
    drawSessions: [...manifest.data.drawSessions].sort((a, b) => a.id.localeCompare(b.id)),
    drawRecords: [...manifest.data.drawRecords].sort((a, b) => a.id.localeCompare(b.id)),
  });

  return JSON.stringify(sortedData(left)) === JSON.stringify(sortedData(right));
}

import type { DrawRecord, DrawSession, Prize } from '../domain/draw/types';
import { validatePrize, validatePrizes } from '../domain/draw/prizeValidation';
import type { SignalHuntDatabase } from './database';

export type DashboardSummary = {
  eventCount: number;
  prizeCount: number;
  enabledPrizeCount: number;
  remainingInventory: number;
  drawRecordCount: number;
};

const THANKS_PRIZE_NAME = '谢谢参与';
const LEGACY_THANKS_PRIZE_NAMES = new Set(['参与奖', '參與獎', '纪念奖', '紀念獎']);

function isLegacyThanksPrizeName(value: string | undefined): boolean {
  return typeof value === 'string' && LEGACY_THANKS_PRIZE_NAMES.has(value.trim());
}

function normalizeLegacyPrizeName(value: string): string {
  return isLegacyThanksPrizeName(value) ? THANKS_PRIZE_NAME : value;
}

export async function normalizeLegacyPrizeLabels(db: SignalHuntDatabase): Promise<boolean> {
  return db.transaction('rw', db.prizes, db.drawRecords, async () => {
    let changed = false;
    const prizes = await db.prizes.toArray();
    const normalizedPrizes = prizes
      .filter((prize) => isLegacyThanksPrizeName(prize.name) || isLegacyThanksPrizeName(prize.shortName))
      .map((prize) => ({
        ...prize,
        name: THANKS_PRIZE_NAME,
        shortName: THANKS_PRIZE_NAME,
        level: 99,
      }));

    if (normalizedPrizes.length > 0) {
      changed = true;
      await db.prizes.bulkPut(validatePrizes(normalizedPrizes));
    }

    const records = await db.drawRecords.toArray();
    const normalizedRecords = records
      .filter((record) => isLegacyThanksPrizeName(record.prizeNameSnapshot))
      .map((record) => ({
        ...record,
        prizeNameSnapshot: normalizeLegacyPrizeName(record.prizeNameSnapshot),
      }));

    if (normalizedRecords.length > 0) {
      changed = true;
      await db.drawRecords.bulkPut(normalizedRecords);
    }

    return changed;
  });
}

export async function listPrizes(db: SignalHuntDatabase): Promise<Prize[]> {
  const prizes = await db.prizes.toArray();

  return [...prizes].sort(
    (left: Prize, right: Prize) => left.level - right.level || left.name.localeCompare(right.name),
  );
}

export async function savePrize(db: SignalHuntDatabase, prize: Prize): Promise<void> {
  await db.prizes.put(validatePrize(prize));
}

export async function replacePrizes(db: SignalHuntDatabase, prizes: readonly Prize[]): Promise<void> {
  const validPrizes = validatePrizes(prizes);

  await db.transaction('rw', db.prizes, async () => {
    await db.prizes.clear();
    await db.prizes.bulkPut(validPrizes);
  });
}

export async function resetPrizeState(db: SignalHuntDatabase, eventId?: string): Promise<void> {
  await db.transaction('rw', db.prizes, db.drawRecords, db.drawSessions, async () => {
    const prizes = await db.prizes.toArray();
    const resetPrizes = validatePrizes(
      prizes.map((prize) => ({
        ...prize,
        inventoryRemaining: prize.inventoryTotal,
      })),
    );

    await db.prizes.bulkPut(resetPrizes);

    if (!eventId) {
      return;
    }

    const [records, sessions] = await Promise.all([
      db.drawRecords.where('eventId').equals(eventId).toArray(),
      db.drawSessions.where('eventId').equals(eventId).toArray(),
    ]);

    await Promise.all([
      db.drawRecords.bulkDelete(records.map((record: DrawRecord) => record.id)),
      db.drawSessions.bulkDelete(sessions.map((session: DrawSession) => session.id)),
    ]);
  });
}

export async function listDrawRecords(db: SignalHuntDatabase): Promise<DrawRecord[]> {
  const records = await db.drawRecords.toArray();

  return [...records].sort((left: DrawRecord, right: DrawRecord) =>
    right.committedAt.localeCompare(left.committedAt),
  );
}

export async function getDashboardSummary(db: SignalHuntDatabase): Promise<DashboardSummary> {
  const [eventCount, prizes, drawRecordCount] = await Promise.all([
    db.events.count(),
    db.prizes.toArray(),
    db.drawRecords.count(),
  ]);

  return {
    eventCount,
    prizeCount: prizes.length,
    enabledPrizeCount: prizes.filter((prize) => prize.enabled).length,
    remainingInventory: prizes.reduce((sum, prize) => sum + prize.inventoryRemaining, 0),
    drawRecordCount,
  };
}

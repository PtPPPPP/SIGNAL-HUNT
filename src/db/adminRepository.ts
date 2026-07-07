import type { DrawRecord, Prize } from '../domain/draw/types';
import { validatePrize, validatePrizes } from '../domain/draw/prizeValidation';
import type { SignalHuntDatabase } from './database';

export type DashboardSummary = {
  eventCount: number;
  prizeCount: number;
  enabledPrizeCount: number;
  remainingInventory: number;
  drawRecordCount: number;
};

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

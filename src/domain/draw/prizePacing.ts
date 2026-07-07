import type { DrawRecord, Event, Prize, PrizeReleasePoint } from './types';

export type PrizePacingStatus =
  | 'ON_PACE'
  | 'AHEAD'
  | 'BEHIND'
  | 'LOCKED'
  | 'CATCH_UP'
  | 'DEPLETED'
  | 'FIXED';

export type PrizePacingSnapshot = {
  prizeId: string;
  currentTime: string;
  eventProgress: number;
  expectedWins: number;
  actualWins: number;
  pacingError: number;
  baseWeight: number;
  multiplier: number;
  effectiveWeight: number;
  status: PrizePacingStatus;
  nextReleaseAt?: string;
  minIntervalRemainingMs?: number;
};

export type PrizePacingInput = {
  prize: Prize;
  event?: Event;
  records?: readonly DrawRecord[];
  now?: () => string;
};

export function calculatePrizePacing({
  prize,
  event,
  records = [],
  now = () => new Date().toISOString(),
}: PrizePacingInput): PrizePacingSnapshot {
  const currentTime = now();
  const actualWins = countWins(prize.id, records);
  const baseWeight = normalizePositive(prize.weight);
  const eventProgress = calculateEventProgress(event, currentTime);
  const expectedWins = calculateExpectedWins(prize, eventProgress);
  const pacingError = expectedWins - actualWins;

  if (!prize.enabled || prize.inventoryRemaining <= 0 || baseWeight <= 0) {
    return {
      prizeId: prize.id,
      currentTime,
      eventProgress,
      expectedWins,
      actualWins,
      pacingError,
      baseWeight,
      multiplier: 0,
      effectiveWeight: 0,
      status: 'DEPLETED',
    };
  }

  const mode = prize.probabilityMode ?? 'FIXED';

  if (mode === 'FIXED') {
    return {
      prizeId: prize.id,
      currentTime,
      eventProgress,
      expectedWins,
      actualWins,
      pacingError,
      baseWeight,
      multiplier: 1,
      effectiveWeight: baseWeight,
      status: 'FIXED',
    };
  }

  const release = getReleaseState(prize.pacing?.releaseSchedule ?? [], currentTime, actualWins);
  const intervalRemaining = getMinIntervalRemainingMs(prize, records, currentTime);

  if (mode === 'TIME_RELEASE' && release.locked) {
    return buildLockedSnapshot({
      prize,
      currentTime,
      eventProgress,
      expectedWins,
      actualWins,
      pacingError,
      baseWeight,
      nextReleaseAt: release.nextReleaseAt,
      minIntervalRemainingMs: intervalRemaining,
    });
  }

  if ((intervalRemaining ?? 0) > 0) {
    return buildLockedSnapshot({
      prize,
      currentTime,
      eventProgress,
      expectedWins,
      actualWins,
      pacingError,
      baseWeight,
      nextReleaseAt: release.nextReleaseAt,
      minIntervalRemainingMs: intervalRemaining,
    });
  }

  if (mode === 'TIME_RELEASE') {
    return {
      prizeId: prize.id,
      currentTime,
      eventProgress,
      expectedWins,
      actualWins,
      pacingError,
      baseWeight,
      multiplier: 1,
      effectiveWeight: baseWeight,
      status: 'ON_PACE',
      nextReleaseAt: release.nextReleaseAt,
    };
  }

  const minMultiplier = normalizePositive(prize.pacing?.minMultiplier ?? 0.2);
  const maxMultiplier = Math.max(minMultiplier, normalizePositive(prize.pacing?.maxMultiplier ?? 3));
  const sensitivity = clamp(prize.pacing?.sensitivity ?? 0.5, 0.1, 1);
  const catchUp = getCatchUpState(prize, event, currentTime);
  const upperMultiplier = catchUp.active ? catchUp.maxMultiplier : maxMultiplier;
  const multiplier = clamp(1 + pacingError * sensitivity, minMultiplier, upperMultiplier);
  const status = getSmartStatus(pacingError, catchUp.active);

  if (release.locked) {
    return buildLockedSnapshot({
      prize,
      currentTime,
      eventProgress,
      expectedWins,
      actualWins,
      pacingError,
      baseWeight,
      nextReleaseAt: release.nextReleaseAt,
      minIntervalRemainingMs: intervalRemaining,
    });
  }

  return {
    prizeId: prize.id,
    currentTime,
    eventProgress,
    expectedWins,
    actualWins,
    pacingError,
    baseWeight,
    multiplier,
    effectiveWeight: baseWeight * multiplier,
    status,
    nextReleaseAt: release.nextReleaseAt,
  };
}

export function getEffectivePrizeWeight(input: PrizePacingInput): number {
  return calculatePrizePacing(input).effectiveWeight;
}

function buildLockedSnapshot(input: {
  prize: Prize;
  currentTime: string;
  eventProgress: number;
  expectedWins: number;
  actualWins: number;
  pacingError: number;
  baseWeight: number;
  nextReleaseAt?: string;
  minIntervalRemainingMs?: number;
}): PrizePacingSnapshot {
  return {
    prizeId: input.prize.id,
    currentTime: input.currentTime,
    eventProgress: input.eventProgress,
    expectedWins: input.expectedWins,
    actualWins: input.actualWins,
    pacingError: input.pacingError,
    baseWeight: input.baseWeight,
    multiplier: 0,
    effectiveWeight: 0,
    status: 'LOCKED',
    nextReleaseAt: input.nextReleaseAt,
    minIntervalRemainingMs: input.minIntervalRemainingMs,
  };
}

function calculateExpectedWins(prize: Prize, eventProgress: number): number {
  return roundMetric(prize.inventoryTotal * eventProgress);
}

function calculateEventProgress(event: Event | undefined, currentTime: string): number {
  if (!event?.startAt || !event.endAt) {
    return 0;
  }

  const startMs = Date.parse(event.startAt);
  const endMs = Date.parse(event.endAt);
  const nowMs = Date.parse(currentTime);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(nowMs) || endMs <= startMs) {
    return 0;
  }

  return clamp((nowMs - startMs) / (endMs - startMs), 0, 1);
}

function countWins(prizeId: string, records: readonly DrawRecord[]): number {
  return records.filter((record) => record.prizeId === prizeId && record.status !== 'VOIDED').length;
}

function getReleaseState(
  schedule: readonly PrizeReleasePoint[],
  currentTime: string,
  actualWins: number,
): { locked: boolean; nextReleaseAt?: string } {
  if (schedule.length === 0) {
    return { locked: false };
  }

  const currentMinutes = timeToMinutes(currentTime);
  const sorted = [...schedule].sort((left, right) => left.time.localeCompare(right.time));
  const available = sorted.filter((point) => timeToMinutes(point.time) <= currentMinutes);
  const currentMaxWins = available.at(-1)?.maxCumulativeWins ?? 0;
  const nextReleaseAt = sorted.find((point) => timeToMinutes(point.time) > currentMinutes)?.time;

  return {
    locked: actualWins >= currentMaxWins,
    nextReleaseAt,
  };
}

function getMinIntervalRemainingMs(
  prize: Prize,
  records: readonly DrawRecord[],
  currentTime: string,
): number | undefined {
  const intervalMinutes = prize.pacing?.minIntervalMinutes;

  if (!intervalMinutes || intervalMinutes <= 0) {
    return undefined;
  }

  const latestRecord = records
    .filter((record) => record.prizeId === prize.id && record.status !== 'VOIDED')
    .sort((left, right) => right.committedAt.localeCompare(left.committedAt))[0];

  if (!latestRecord) {
    return undefined;
  }

  const unlockAt = Date.parse(latestRecord.committedAt) + intervalMinutes * 60_000;
  const remaining = unlockAt - Date.parse(currentTime);

  return remaining > 0 ? remaining : undefined;
}

function getCatchUpState(
  prize: Prize,
  event: Event | undefined,
  currentTime: string,
): { active: boolean; maxMultiplier: number } {
  if (!prize.pacing?.catchUpEnabled || !event?.endAt) {
    return { active: false, maxMultiplier: normalizePositive(prize.pacing?.maxMultiplier ?? 3) };
  }

  const startBeforeEndMinutes = normalizePositive(prize.pacing.catchUpStartBeforeEndMinutes ?? 60);
  const endMs = Date.parse(event.endAt);
  const nowMs = Date.parse(currentTime);
  const active = Number.isFinite(endMs) && Number.isFinite(nowMs) && endMs - nowMs <= startBeforeEndMinutes * 60_000;
  const maxMultiplier = Math.max(
    normalizePositive(prize.pacing?.maxMultiplier ?? 3),
    normalizePositive(prize.pacing.catchUpMaxMultiplier ?? 4),
  );

  return { active, maxMultiplier };
}

function getSmartStatus(pacingError: number, catchUpActive: boolean): PrizePacingStatus {
  if (catchUpActive && pacingError > 0) {
    return 'CATCH_UP';
  }

  if (pacingError > 0.25) {
    return 'BEHIND';
  }

  if (pacingError < -0.25) {
    return 'AHEAD';
  }

  return 'ON_PACE';
}

function timeToMinutes(value: string): number {
  const isoDate = Date.parse(value);

  if (Number.isFinite(isoDate)) {
    const date = new Date(isoDate);
    return date.getHours() * 60 + date.getMinutes();
  }

  const [hours, minutes] = value.split(':').map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return Number.POSITIVE_INFINITY;
  }

  return hours * 60 + minutes;
}

function normalizePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

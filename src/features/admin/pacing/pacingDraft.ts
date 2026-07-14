import {
  autoBalanceProbabilities,
  type ProbabilityConfigItem,
} from '../../../domain/draw/prizeProbability';
import type { Prize, PrizeProbabilityMode } from '../../../domain/draw/types';
import type { DistributionStrategy, ProbabilityDraft } from './types';

export const DEFAULT_EXPECTED_PARTICIPANTS = 500;

const strategyByMode: Record<PrizeProbabilityMode, DistributionStrategy> = {
  FIXED: 'RANDOM',
  TIME_RELEASE: 'CUSTOM_TIME',
  SMART_PACING: 'EVEN',
};

export function createDraftsFromPrizes(
  prizes: readonly Prize[],
  existingDrafts: readonly ProbabilityDraft[],
): ProbabilityDraft[] {
  const existingByPrizeId = new Map(existingDrafts.map((draft) => [draft.prizeId, draft]));

  return prizes.map((prize) => {
    const existing = existingByPrizeId.get(prize.id);
    return existing ? { ...existing } : createDraftFromPrize(prize, probabilityFromWeights(prize.weight, prizes));
  });
}

export function createDraftFromPrize(prize: Prize, probability: number): ProbabilityDraft {
  return {
    prizeId: prize.id,
    probability,
    locked: false,
    strategy: strategyByMode[prize.probabilityMode ?? 'FIXED'],
    minIntervalMinutes: prize.pacing?.minIntervalMinutes ?? 0,
    catchUpEnabled: Boolean(prize.pacing?.catchUpEnabled),
    catchUpStartBeforeEndMinutes: prize.pacing?.catchUpStartBeforeEndMinutes ?? 60,
    sensitivity: prize.pacing?.sensitivity ?? 0.5,
    minMultiplier: prize.pacing?.minMultiplier ?? 0.2,
    maxMultiplier: prize.pacing?.maxMultiplier ?? 3,
  };
}

export function applyDraftToPrize(prize: Prize, draft: ProbabilityDraft, weight: number): Prize {
  const probabilityMode = probabilityModeFromStrategy(draft.strategy);
  const pacing =
    probabilityMode === 'FIXED'
      ? undefined
      : {
          minMultiplier: draft.minMultiplier,
          maxMultiplier: draft.maxMultiplier,
          sensitivity: draft.sensitivity,
          minIntervalMinutes: draft.minIntervalMinutes,
          catchUpEnabled: draft.catchUpEnabled,
          catchUpStartBeforeEndMinutes: draft.catchUpStartBeforeEndMinutes,
          catchUpMaxMultiplier: Math.max(draft.maxMultiplier, 4),
          releaseSchedule: prize.pacing?.releaseSchedule,
        };

  return {
    ...prize,
    weight,
    probabilityMode,
    pacing,
  };
}

export function probabilityModeFromStrategy(strategy: DistributionStrategy): PrizeProbabilityMode {
  if (strategy === 'EVEN') {
    return 'SMART_PACING';
  }

  if (strategy === 'CUSTOM_TIME') {
    return 'TIME_RELEASE';
  }

  return 'FIXED';
}

export function mergeSuggestionWithDrafts(
  suggestions: readonly ProbabilityConfigItem[],
  drafts: readonly ProbabilityDraft[],
): ProbabilityDraft[] {
  const probabilityByPrizeId = new Map(suggestions.map((item) => [item.prizeId, item.probability]));

  return drafts.map((draft) => ({
    ...draft,
    probability: probabilityByPrizeId.get(draft.prizeId) ?? draft.probability,
    locked: false,
  }));
}

export function mergeBalancedProbabilities(
  drafts: readonly ProbabilityDraft[],
  editedPrizeId: string | undefined,
): ProbabilityDraft[] {
  const balanced = autoBalanceProbabilities(drafts, editedPrizeId);
  const probabilityByPrizeId = new Map(balanced.map((item) => [item.prizeId, item.probability]));

  return drafts.map((draft) => ({
    ...draft,
    probability: probabilityByPrizeId.get(draft.prizeId) ?? draft.probability,
  }));
}

export function probabilityFromWeights(weight: number, prizes: readonly Prize[]): number {
  const totalWeight = prizes.reduce((sum, prize) => sum + (Number.isFinite(prize.weight) ? prize.weight : 0), 0);

  if (totalWeight <= 0) {
    return 0;
  }

  return roundProbability((weight / totalWeight) * 100);
}

export function toProbability(value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(100, Math.max(0, roundProbability(parsed)));
}

export function toPositiveInteger(value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.round(parsed);
}

export function toNonNegativeInteger(value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed);
}

function roundProbability(value: number): number {
  return Math.round(value * 10) / 10;
}

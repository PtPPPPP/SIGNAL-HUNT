import { z } from 'zod';

import type { Prize } from './types';

const PROBABILITY_UNIT = 10;
const TOTAL_PROBABILITY = 100;
const TOTAL_UNITS = TOTAL_PROBABILITY * PROBABILITY_UNIT;
const EPSILON = 0.0001;

export type ProbabilityConfigItem = {
  prizeId: string;
  probability: number;
  locked?: boolean;
};

export type PrizeWeightConfig = {
  prizeId: string;
  weight: number;
};

export type ProbabilityTotalState = 'valid' | 'under' | 'over';

export type ProbabilityTotalStatus = {
  total: number;
  state: ProbabilityTotalState;
  difference: number;
};

export type InventoryRiskStatus = 'ok' | 'warning' | 'disabled';

export type InventoryRisk = {
  prizeId: string;
  estimatedWins: number;
  inventoryRemaining: number;
  status: InventoryRiskStatus;
  message: string;
};

const probabilityItemSchema = z.object({
  prizeId: z.string().trim().min(1),
  probability: z.number().finite().min(0).max(100),
  locked: z.boolean().optional(),
});

const expectedParticipantsSchema = z.number().finite().int().positive();
const probabilityConfigSchema = z.array(probabilityItemSchema).min(1);

export function percentageConfigToWeights(items: readonly ProbabilityConfigItem[]): PrizeWeightConfig[] {
  const validItems = validateProbabilityItems(items);
  const status = getProbabilityTotalStatus(validItems);

  if (status.state !== 'valid') {
    throw new Error('总概率必须等于 100%');
  }

  return validItems.map((item) => ({
    prizeId: item.prizeId,
    weight: roundProbability(item.probability),
  }));
}

export function getProbabilityTotalStatus(items: readonly ProbabilityConfigItem[]): ProbabilityTotalStatus {
  const total = roundProbability(items.reduce((sum, item) => sum + toFiniteProbability(item.probability), 0));
  const difference = roundProbability(Math.abs(TOTAL_PROBABILITY - total));

  if (Math.abs(total - TOTAL_PROBABILITY) < EPSILON) {
    return { total: TOTAL_PROBABILITY, state: 'valid', difference: 0 };
  }

  return {
    total,
    state: total < TOTAL_PROBABILITY ? 'under' : 'over',
    difference,
  };
}

export function autoBalanceProbabilities(
  items: readonly ProbabilityConfigItem[],
  editedPrizeId?: string,
): ProbabilityConfigItem[] {
  const validItems = validateProbabilityItems(items);
  const fixedIds = new Set(validItems.filter((item) => item.locked).map((item) => item.prizeId));

  if (editedPrizeId) {
    fixedIds.add(editedPrizeId);
  }

  const fixedTotalUnits = validItems
    .filter((item) => fixedIds.has(item.prizeId))
    .reduce((sum, item) => sum + toProbabilityUnits(item.probability), 0);

  if (fixedTotalUnits > TOTAL_UNITS) {
    throw new Error('锁定概率合计不能超过 100%');
  }

  const adjustableItems = validItems.filter((item) => !fixedIds.has(item.prizeId));

  if (adjustableItems.length === 0) {
    if (fixedTotalUnits !== TOTAL_UNITS) {
      throw new Error('全部奖项已锁定，合计必须等于 100%');
    }

    return validItems.map(copyProbabilityItem);
  }

  const remainingUnits = TOTAL_UNITS - fixedTotalUnits;
  const currentAdjustableUnits = adjustableItems.reduce((sum, item) => sum + toProbabilityUnits(item.probability), 0);
  const allocatedUnits = allocateByRatio(
    adjustableItems.map((item) => (currentAdjustableUnits > 0 ? toProbabilityUnits(item.probability) : 1)),
    remainingUnits,
  );
  const unitsByPrizeId = new Map(adjustableItems.map((item, index) => [item.prizeId, allocatedUnits[index] ?? 0]));

  return validItems.map((item) => {
    if (fixedIds.has(item.prizeId)) {
      return copyProbabilityItem(item);
    }

    return {
      ...copyProbabilityItem(item),
      probability: unitsToProbability(unitsByPrizeId.get(item.prizeId) ?? 0),
    };
  });
}

export function calculateExpectedWins(probability: number, expectedParticipants: number): number {
  const validParticipants = expectedParticipantsSchema.parse(expectedParticipants);
  return roundCount((toFiniteProbability(probability) / TOTAL_PROBABILITY) * validParticipants);
}

export function getInventoryRisks(
  prizes: readonly Prize[],
  items: readonly ProbabilityConfigItem[],
  expectedParticipants: number,
): InventoryRisk[] {
  const validParticipants = expectedParticipantsSchema.parse(expectedParticipants);
  const validItems = items.length > 0 ? validateProbabilityItems(items) : [];
  const probabilityByPrizeId = new Map(validItems.map((item) => [item.prizeId, item.probability]));

  return prizes.map((prize) => {
    const probability = probabilityByPrizeId.get(prize.id) ?? 0;
    const estimatedWins = calculateExpectedWins(probability, validParticipants);

    if (!prize.enabled) {
      return {
        prizeId: prize.id,
        estimatedWins,
        inventoryRemaining: prize.inventoryRemaining,
        status: 'disabled',
        message: '奖项已停用',
      };
    }

    if (estimatedWins > prize.inventoryRemaining) {
      return {
        prizeId: prize.id,
        estimatedWins,
        inventoryRemaining: prize.inventoryRemaining,
        status: 'warning',
        message: `当前配置预计需要约 ${formatCount(estimatedWins)} 件${prize.name}奖品，但当前库存只有 ${prize.inventoryRemaining} 件`,
      };
    }

    return {
      prizeId: prize.id,
      estimatedWins,
      inventoryRemaining: prize.inventoryRemaining,
      status: 'ok',
      message: '库存充足',
    };
  });
}

export function generateInventoryProbabilitySuggestion(
  prizes: readonly Prize[],
  expectedParticipants: number,
): ProbabilityConfigItem[] {
  expectedParticipantsSchema.parse(expectedParticipants);

  const eligiblePrizes = prizes.filter((prize) => prize.enabled && prize.inventoryRemaining > 0);
  const totalInventory = eligiblePrizes.reduce((sum, prize) => sum + prize.inventoryRemaining, 0);

  if (totalInventory <= 0) {
    return prizes.map((prize) => ({ prizeId: prize.id, probability: 0, locked: false }));
  }

  const allocatedUnits = allocateByRatio(
    prizes.map((prize) => (prize.enabled && prize.inventoryRemaining > 0 ? prize.inventoryRemaining : 0)),
    TOTAL_UNITS,
  );

  return prizes.map((prize, index) => ({
    prizeId: prize.id,
    probability: unitsToProbability(allocatedUnits[index] ?? 0),
    locked: false,
  }));
}

function validateProbabilityItems(items: readonly ProbabilityConfigItem[]): ProbabilityConfigItem[] {
  return probabilityConfigSchema.parse(items).map(copyProbabilityItem);
}

function copyProbabilityItem(item: ProbabilityConfigItem): ProbabilityConfigItem {
  return {
    prizeId: item.prizeId,
    probability: roundProbability(item.probability),
    locked: Boolean(item.locked),
  };
}

function allocateByRatio(weights: readonly number[], totalUnits: number): number[] {
  const safeWeights = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  const totalWeight = safeWeights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) {
    return distributeEvenly(safeWeights.length, totalUnits);
  }

  const rawAllocations = safeWeights.map((weight) => (weight / totalWeight) * totalUnits);
  const floors = rawAllocations.map(Math.floor);
  let remaining = totalUnits - floors.reduce((sum, value) => sum + value, 0);
  const byRemainder = rawAllocations
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  for (const item of byRemainder) {
    if (remaining <= 0) {
      break;
    }

    floors[item.index] += 1;
    remaining -= 1;
  }

  return floors;
}

function distributeEvenly(count: number, totalUnits: number): number[] {
  if (count <= 0) {
    return [];
  }

  const base = Math.floor(totalUnits / count);
  let remaining = totalUnits - base * count;

  return Array.from({ length: count }, () => {
    const value = base + (remaining > 0 ? 1 : 0);
    remaining -= 1;
    return value;
  });
}

function toProbabilityUnits(value: number): number {
  return Math.round(toFiniteProbability(value) * PROBABILITY_UNIT);
}

function unitsToProbability(value: number): number {
  return roundProbability(value / PROBABILITY_UNIT);
}

function toFiniteProbability(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function roundProbability(value: number): number {
  return Math.round(value * PROBABILITY_UNIT) / PROBABILITY_UNIT;
}

function roundCount(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

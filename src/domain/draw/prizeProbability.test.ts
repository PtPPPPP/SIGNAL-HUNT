import { describe, expect, it } from 'vitest';

import {
  autoBalanceProbabilities,
  calculateExpectedWins,
  generateInventoryProbabilitySuggestion,
  getProbabilityTotalStatus,
  percentageConfigToWeights,
} from './prizeProbability';
import type { Prize } from './types';

function prize(overrides: Partial<Prize> = {}): Prize {
  return {
    id: 'prize-1',
    name: '一等奖',
    shortName: '一等奖',
    level: 1,
    inventoryTotal: 10,
    inventoryRemaining: 10,
    weight: 10,
    enabled: true,
    ...overrides,
  };
}

describe('prize probability domain', () => {
  it('converts percentages to weights while preserving relative ratios', () => {
    const weights = percentageConfigToWeights([
      { prizeId: 'first', probability: 1 },
      { prizeId: 'second', probability: 5 },
      { prizeId: 'third', probability: 15 },
      { prizeId: 'souvenir', probability: 79 },
    ]);

    expect(weights).toEqual([
      { prizeId: 'first', weight: 1 },
      { prizeId: 'second', weight: 5 },
      { prizeId: 'third', weight: 15 },
      { prizeId: 'souvenir', weight: 79 },
    ]);
  });

  it('keeps locked prize unchanged when auto balancing', () => {
    const balanced = autoBalanceProbabilities(
      [
        { prizeId: 'first', probability: 1, locked: true },
        { prizeId: 'second', probability: 10, locked: false },
        { prizeId: 'third', probability: 15, locked: false },
        { prizeId: 'souvenir', probability: 79, locked: false },
      ],
      'second',
    );

    expect(balanced.find((item) => item.prizeId === 'first')?.probability).toBe(1);
  });

  it('keeps the edited prize unchanged when auto balancing', () => {
    const balanced = autoBalanceProbabilities(
      [
        { prizeId: 'first', probability: 1, locked: true },
        { prizeId: 'second', probability: 10, locked: false },
        { prizeId: 'third', probability: 15, locked: false },
        { prizeId: 'souvenir', probability: 79, locked: false },
      ],
      'second',
    );

    expect(balanced.find((item) => item.prizeId === 'second')?.probability).toBe(10);
  });

  it('redistributes other unlocked prizes by their existing relative ratio', () => {
    const balanced = autoBalanceProbabilities(
      [
        { prizeId: 'first', probability: 1, locked: true },
        { prizeId: 'second', probability: 10, locked: false },
        { prizeId: 'third', probability: 15, locked: false },
        { prizeId: 'souvenir', probability: 79, locked: false },
      ],
      'second',
    );

    expect(balanced).toEqual([
      { prizeId: 'first', probability: 1, locked: true },
      { prizeId: 'second', probability: 10, locked: false },
      { prizeId: 'third', probability: 14.2, locked: false },
      { prizeId: 'souvenir', probability: 74.8, locked: false },
    ]);
  });

  it('rejects auto balance when locked total exceeds 100%', () => {
    expect(() =>
      autoBalanceProbabilities([
        { prizeId: 'first', probability: 80, locked: true },
        { prizeId: 'second', probability: 30, locked: true },
      ]),
    ).toThrow('锁定概率合计不能超过 100%');
  });

  it('rejects auto balance when all prizes are locked and total is not 100%', () => {
    expect(() =>
      autoBalanceProbabilities([
        { prizeId: 'first', probability: 80, locked: true },
        { prizeId: 'second', probability: 10, locked: true },
      ]),
    ).toThrow('全部奖项已锁定，合计必须等于 100%');
  });

  it('calculates expected wins from probability and participants', () => {
    expect(calculateExpectedWins(5, 500)).toBe(25);
  });

  it('generates inventory-based probability suggestions without exceeding 100%', () => {
    const suggestions = generateInventoryProbabilitySuggestion(
      [
        prize({ id: 'first', inventoryTotal: 5, inventoryRemaining: 5 }),
        prize({ id: 'second', inventoryTotal: 20, inventoryRemaining: 20 }),
        prize({ id: 'third', inventoryTotal: 80, inventoryRemaining: 80 }),
        prize({ id: 'souvenir', inventoryTotal: 395, inventoryRemaining: 395 }),
      ],
      500,
    );

    expect(suggestions.map((item) => item.probability)).toEqual([1, 4, 16, 79]);
    expect(getProbabilityTotalStatus(suggestions).total).toBe(100);
  });

  it('handles floating precision around 100%', () => {
    const status = getProbabilityTotalStatus([
      { prizeId: 'a', probability: 33.3 },
      { prizeId: 'b', probability: 33.3 },
      { prizeId: 'c', probability: 33.4 },
    ]);

    expect(status).toMatchObject({ total: 100, state: 'valid' });
  });
});

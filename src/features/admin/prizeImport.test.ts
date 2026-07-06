import { describe, expect, it } from 'vitest';

import { parsePrizeImport } from './prizeImport';

describe('prize import validation', () => {
  it('parses valid prize JSON', () => {
    const prizes = parsePrizeImport(
      JSON.stringify([
        {
          id: 'prize-1',
          name: '一等奖',
          shortName: '一等奖',
          level: 1,
          inventoryTotal: 2,
          inventoryRemaining: 2,
          weight: 1,
          enabled: true,
        },
      ]),
    );

    expect(prizes).toHaveLength(1);
    expect(prizes[0]?.id).toBe('prize-1');
  });

  it('rejects invalid inventory values', () => {
    expect(() =>
      parsePrizeImport(
        JSON.stringify([
          {
            id: 'bad-prize',
            name: '坏数据',
            shortName: '坏数据',
            level: 1,
            inventoryTotal: 1,
            inventoryRemaining: -1,
            weight: 1,
            enabled: true,
          },
        ]),
      ),
    ).toThrow('Prize import data is invalid.');
  });
});

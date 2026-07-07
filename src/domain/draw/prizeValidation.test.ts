import { describe, expect, it } from 'vitest';

import type { Prize } from './types';
import { getPrizeValidationIssues, validatePrize } from './prizeValidation';

const validPrize: Prize = {
  id: 'prize-1',
  name: '一等奖',
  shortName: '一等奖',
  level: 1,
  inventoryTotal: 2,
  inventoryRemaining: 2,
  weight: 1,
  enabled: true,
};

describe('prize domain validation', () => {
  it('rejects negative total inventory', () => {
    expect(() => validatePrize({ ...validPrize, inventoryTotal: -1 })).toThrow('奖品数据无效');
  });

  it('rejects negative remaining inventory', () => {
    expect(() => validatePrize({ ...validPrize, inventoryRemaining: -1 })).toThrow('奖品数据无效');
  });

  it('rejects remaining inventory greater than total inventory', () => {
    expect(getPrizeValidationIssues({ ...validPrize, inventoryTotal: 1, inventoryRemaining: 2 })).toMatchObject({
      inventoryRemaining: '剩余库存不能大于总库存',
    });
  });

  it('rejects NaN numbers', () => {
    expect(getPrizeValidationIssues({ ...validPrize, weight: Number.NaN })).toMatchObject({
      weight: '权重必须是有效数字',
    });
  });

  it('rejects Infinity numbers', () => {
    expect(getPrizeValidationIssues({ ...validPrize, inventoryTotal: Number.POSITIVE_INFINITY })).toMatchObject({
      inventoryTotal: '总库存必须是有效数字',
    });
  });

  it('rejects negative weight', () => {
    expect(getPrizeValidationIssues({ ...validPrize, weight: -1 })).toMatchObject({
      weight: '权重不能为负数',
    });
  });

  it('rejects empty trimmed name', () => {
    expect(getPrizeValidationIssues({ ...validPrize, name: '   ' })).toMatchObject({
      name: '奖项名称不能为空',
    });
  });

  it('accepts a valid prize', () => {
    expect(validatePrize(validPrize)).toEqual(validPrize);
  });
}
);

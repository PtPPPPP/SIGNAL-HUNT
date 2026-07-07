import { z } from 'zod';

import type { Prize } from './types';

export type PrizeValidationIssues = Partial<Record<keyof Prize, string>>;

export class PrizeValidationError extends Error {
  constructor(public readonly issues: PrizeValidationIssues) {
    super('奖品数据无效');
    this.name = 'PrizeValidationError';
  }
}

const prizeSchema = z
  .object({
    id: z.string().trim().min(1, '奖品编号不能为空'),
    name: z.string().trim().min(1, '奖项名称不能为空'),
    shortName: z.string().trim().min(1, '奖项简称不能为空'),
    level: z.number().finite('等级必须是有效数字').int('等级必须是整数').min(1, '等级必须大于等于 1'),
    inventoryTotal: z
      .number()
      .finite('总库存必须是有效数字')
      .int('总库存必须是整数')
      .min(0, '总库存不能为负数'),
    inventoryRemaining: z
      .number()
      .finite('剩余库存必须是有效数字')
      .int('剩余库存必须是整数')
      .min(0, '剩余库存不能为负数'),
    weight: z.number().finite('权重必须是有效数字').min(0, '权重不能为负数'),
    enabled: z.boolean('启用状态必须是布尔值'),
    imageUrl: z.string().url('图片地址必须是有效 URL').optional(),
    probabilityMode: z.enum(['FIXED', 'TIME_RELEASE', 'SMART_PACING']).optional(),
    pacing: z
      .object({
        minMultiplier: z.number().finite('最低倍率必须是有效数字').min(0, '最低倍率不能为负数').optional(),
        maxMultiplier: z.number().finite('最高倍率必须是有效数字').min(0, '最高倍率不能为负数').optional(),
        sensitivity: z
          .number()
          .finite('响应强度必须是有效数字')
          .min(0.1, '响应强度不能小于 0.1')
          .max(1, '响应强度不能大于 1')
          .optional(),
        minIntervalMinutes: z
          .number()
          .finite('最小间隔必须是有效数字')
          .int('最小间隔必须是整数')
          .min(0, '最小间隔不能为负数')
          .optional(),
        catchUpEnabled: z.boolean().optional(),
        catchUpStartBeforeEndMinutes: z
          .number()
          .finite('追赶开始时间必须是有效数字')
          .int('追赶开始时间必须是整数')
          .min(0, '追赶开始时间不能为负数')
          .optional(),
        catchUpMaxMultiplier: z
          .number()
          .finite('追赶最高倍率必须是有效数字')
          .min(0, '追赶最高倍率不能为负数')
          .optional(),
        releaseSchedule: z
          .array(
            z.object({
              time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '释放时间必须是 HH:mm'),
              maxCumulativeWins: z
                .number()
                .finite('累计中奖数必须是有效数字')
                .int('累计中奖数必须是整数')
                .min(0, '累计中奖数不能为负数'),
            }),
          )
          .optional(),
      })
      .optional(),
  })
  .refine((prize) => prize.inventoryRemaining <= prize.inventoryTotal, {
    message: '剩余库存不能大于总库存',
    path: ['inventoryRemaining'],
  })
  .superRefine((prize, context) => {
    const schedule = prize.pacing?.releaseSchedule ?? [];

    for (let index = 0; index < schedule.length; index += 1) {
      const point = schedule[index];
      const previous = schedule[index - 1];

      if (point.maxCumulativeWins > prize.inventoryTotal) {
        context.addIssue({
          code: 'custom',
          message: '释放节点不能超过总库存',
          path: ['pacing'],
        });
        return;
      }

      if (previous && point.time <= previous.time) {
        context.addIssue({
          code: 'custom',
          message: '释放时间必须递增',
          path: ['pacing'],
        });
        return;
      }

      if (previous && point.maxCumulativeWins < previous.maxCumulativeWins) {
        context.addIssue({
          code: 'custom',
          message: '累计中奖数不能下降',
          path: ['pacing'],
        });
        return;
      }
    }
  });

const prizeListSchema = z.array(prizeSchema);

export function validatePrize(input: unknown): Prize {
  const result = prizeSchema.safeParse(input);

  if (!result.success) {
    throw new PrizeValidationError(toPrizeValidationIssues(result.error, input));
  }

  return result.data;
}

export function validatePrizes(input: unknown): Prize[] {
  const result = prizeListSchema.safeParse(input);

  if (!result.success) {
    throw new PrizeValidationError(toPrizeValidationIssues(result.error, input));
  }

  return result.data;
}

export function getPrizeValidationIssues(input: unknown): PrizeValidationIssues {
  try {
    validatePrize(input);
    return {};
  } catch (error) {
    if (error instanceof PrizeValidationError) {
      return error.issues;
    }

    throw error;
  }
}

function toPrizeValidationIssues(error: z.ZodError, input: unknown): PrizeValidationIssues {
  const issues: PrizeValidationIssues = {};

  for (const issue of error.issues) {
    const field = issue.path[issue.path.length - 1];

    if (!isPrizeField(field) || issues[field]) {
      continue;
    }

    issues[field] = normalizeIssueMessage(field, issue.message, input);
  }

  return issues;
}

function normalizeIssueMessage(field: keyof Prize, message: string, input: unknown): string {
  if (isNonFiniteNumber(input, field)) {
    return nonFiniteMessageByField[field] ?? message;
  }

  return message;
}

function isNonFiniteNumber(input: unknown, field: keyof Prize): boolean {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const value = (input as Partial<Record<keyof Prize, unknown>>)[field];
  return typeof value === 'number' && !Number.isFinite(value);
}

function isPrizeField(value: unknown): value is keyof Prize {
  return (
    value === 'id' ||
    value === 'name' ||
    value === 'shortName' ||
    value === 'level' ||
    value === 'inventoryTotal' ||
    value === 'inventoryRemaining' ||
    value === 'weight' ||
    value === 'enabled' ||
    value === 'imageUrl' ||
    value === 'probabilityMode' ||
    value === 'pacing'
  );
}

const nonFiniteMessageByField: Partial<Record<keyof Prize, string>> = {
  level: '等级必须是有效数字',
  inventoryTotal: '总库存必须是有效数字',
  inventoryRemaining: '剩余库存必须是有效数字',
  weight: '权重必须是有效数字',
  pacing: '中奖节奏参数必须是有效数字',
};

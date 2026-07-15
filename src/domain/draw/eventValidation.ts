import { z } from 'zod';

import type { Event } from './types';

export type EventValidationIssues = Partial<Record<keyof Event, string>>;

export class EventValidationError extends Error {
  constructor(public readonly issues: EventValidationIssues) {
    super('活动数据无效');
    this.name = 'EventValidationError';
  }
}

/**
 * Optional exhibition timestamp. Accepts unset (undefined) and empty string from
 * form inputs; only non-empty values are parsed. datetime-local values such as
 * `2026-07-06T10:00` parse cleanly under Date.parse.
 */
const optionalTimestamp = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), {
    message: '时间格式无效',
  });

const participationWindowSchema = z
  .object({
    startAt: z.string().trim().min(1).refine((value) => !Number.isNaN(Date.parse(value))),
    endAt: z.string().trim().min(1).refine((value) => !Number.isNaN(Date.parse(value))),
  })
  .refine((window) => Date.parse(window.startAt) < Date.parse(window.endAt), {
    path: ['endAt'],
  });

export const eventSchema = z
  .object({
    id: z.string().trim().min(1, '活动编号不能为空'),
    name: z.string().trim().min(1, '活动名称不能为空'),
    code: z.string().trim().min(1, '活动代码不能为空'),
    status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED'], {
      message: '活动状态无效',
    }),
    createdAt: z.string().trim().min(1, '创建时间不能为空'),
    startAt: optionalTimestamp,
    endAt: optionalTimestamp,
    participationWindows: z.array(participationWindowSchema).optional(),
  })
  .refine((event) => {
    if (event.startAt && event.endAt) {
      return Date.parse(event.startAt) <= Date.parse(event.endAt);
    }

    return true;
  }, {
    message: '结束时间不能早于开始时间',
    path: ['endAt'],
  });

export function validateEvent(input: unknown): Event {
  const result = eventSchema.safeParse(input);

  if (!result.success) {
    throw new EventValidationError(toEventValidationIssues(result.error));
  }

  return result.data;
}

export function getEventValidationIssues(input: unknown): EventValidationIssues {
  try {
    validateEvent(input);

    return {};
  } catch (error) {
    if (error instanceof EventValidationError) {
      return error.issues;
    }

    throw error;
  }
}

const EVENT_FIELDS: ReadonlyArray<keyof Event> = [
  'id',
  'name',
  'code',
  'status',
  'createdAt',
  'startAt',
  'endAt',
  'participationWindows',
];

function toEventValidationIssues(error: z.ZodError): EventValidationIssues {
  const issues: EventValidationIssues = {};

  for (const issue of error.issues) {
    const field = issue.path[issue.path.length - 1];

    if (typeof field !== 'string' || !EVENT_FIELDS.includes(field as keyof Event)) {
      continue;
    }

    const key = field as keyof Event;

    if (issues[key]) {
      continue;
    }

    issues[key] = issue.message;
  }

  return issues;
}

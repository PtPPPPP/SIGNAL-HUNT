import { describe, expect, it } from 'vitest';

import type { Event } from './types';
import { EventValidationError, getEventValidationIssues, validateEvent } from './eventValidation';

function baseEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'event-1',
    name: 'SIGNAL HUNT Demo',
    code: 'SIGNAL-HUNT-DEMO',
    status: 'DRAFT',
    createdAt: '2026-07-06T00:00:00.000Z',
    ...overrides,
  };
}

describe('eventValidation', () => {
  it('accepts a minimal valid event without exhibition window', () => {
    expect(validateEvent(baseEvent())).toEqual(baseEvent());
  });

  it('accepts an event with a valid startAt / endAt window', () => {
    const event = baseEvent({ startAt: '2026-07-06T10:00', endAt: '2026-07-06T18:00' });

    expect(validateEvent(event)).toEqual(event);
  });

  it('accepts empty-string timestamps from form inputs as unset', () => {
    const event = baseEvent({ startAt: '', endAt: '' });
    const result = validateEvent(event);

    expect(result.startAt).toBe('');
    expect(result.endAt).toBe('');
  });

  it('rejects an empty name and reports the field', () => {
    const issues = getEventValidationIssues(baseEvent({ name: '   ' }));

    expect(issues.name).toBe('活动名称不能为空');
  });

  it('rejects an empty code and reports the field', () => {
    const issues = getEventValidationIssues(baseEvent({ code: '' }));

    expect(issues.code).toBe('活动代码不能为空');
  });

  it('rejects an unknown status', () => {
    const issues = getEventValidationIssues(baseEvent({ status: 'ARCHIVED' as Event['status'] }));

    expect(issues.status).toBe('活动状态无效');
  });

  it('rejects a malformed timestamp', () => {
    const issues = getEventValidationIssues(baseEvent({ startAt: 'not-a-date' }));

    expect(issues.startAt).toBe('时间格式无效');
  });

  it('rejects an endAt earlier than startAt', () => {
    const issues = getEventValidationIssues(
      baseEvent({ startAt: '2026-07-06T18:00', endAt: '2026-07-06T10:00' }),
    );

    expect(issues.endAt).toBe('结束时间不能早于开始时间');
  });

  it('throws EventValidationError with issues on invalid input', () => {
    expect(() => validateEvent(baseEvent({ name: '' }))).toThrow(EventValidationError);
  });
});

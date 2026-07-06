import { describe, expect, it } from 'vitest';

import { DRAW_NARRATIVE_EVENTS, POST_COMMIT_TIMELINE_STEPS, getDrawTimelineDurationMs } from './displayTimeline';

describe('display timeline', () => {
  it('keeps the draw flow within the required 5–8 second target', () => {
    expect(getDrawTimelineDurationMs()).toBeGreaterThanOrEqual(5000);
    expect(getDrawTimelineDurationMs()).toBeLessThanOrEqual(8000);
  });

  it('orders state machine events in the draw narrative sequence', () => {
    expect(DRAW_NARRATIVE_EVENTS).toEqual([
      'COMMIT_STARTED',
      'COMMIT_SUCCEEDED',
      'SCAN_COMPLETE',
      'SEARCH_COMPLETE',
      'PEAK_CONFIRMED',
      'LOCK_COMPLETE',
      'REVEAL_COMPLETE',
      'RESET_COMPLETE',
    ]);
  });

  it('schedules only post-commit animation steps on timers (no auto reset)', () => {
    expect(POST_COMMIT_TIMELINE_STEPS.map((step) => step.event.type)).toEqual([
      'SCAN_COMPLETE',
      'SEARCH_COMPLETE',
      'PEAK_CONFIRMED',
      'LOCK_COMPLETE',
      'REVEAL_COMPLETE',
    ]);
    expect(POST_COMMIT_TIMELINE_STEPS.some((step) => step.event.type === 'RESET_COMPLETE')).toBe(false);
  });

  it('does not auto-reset RESULT (manual exit only)', () => {
    expect(POST_COMMIT_TIMELINE_STEPS.some((step) => step.event.type === 'RESET_COMPLETE')).toBe(false);
  });
});

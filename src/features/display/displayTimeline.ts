import type { DisplayEvent } from './displayStateMachine';

export type DrawTimelineStep = {
  atMs: number;
  event: DisplayEvent;
};

/**
 * Ordered event types for the full draw narrative, including the async commit
 * bracket. Kept separate from timing so tests can assert the story without
 * coupling to millisecond values.
 */
export const DRAW_NARRATIVE_EVENTS: readonly DisplayEvent['type'][] = [
  'COMMIT_STARTED',
  'COMMIT_SUCCEEDED',
  'SCAN_COMPLETE',
  'SEARCH_COMPLETE',
  'PEAK_CONFIRMED',
  'LOCK_COMPLETE',
  'REVEAL_COMPLETE',
  'RESET_COMPLETE',
];

/**
 * Animation steps scheduled AFTER the draw has been committed. `COMMIT_STARTED`
 * fires immediately on touch and `COMMIT_SUCCEEDED` fires when the commit
 * resolves, so neither belongs on a timer. Timings are relative to commit
 * success. RESULT is intentionally NOT auto-reset: the result stays on screen
 * until an operator ends it manually (see DisplayPage "下一位参与者"). Hence
 * RESET_COMPLETE is not part of this timed sequence.
 */
export const POST_COMMIT_TIMELINE_STEPS: readonly DrawTimelineStep[] = [
  { atMs: 1900, event: { type: 'SCAN_COMPLETE' } },
  { atMs: 3000, event: { type: 'SEARCH_COMPLETE' } },
  { atMs: 3600, event: { type: 'PEAK_CONFIRMED' } },
  { atMs: 4300, event: { type: 'LOCK_COMPLETE' } },
  { atMs: 5000, event: { type: 'REVEAL_COMPLETE' } },
];

export function getDrawTimelineDurationMs(): number {
  return POST_COMMIT_TIMELINE_STEPS[POST_COMMIT_TIMELINE_STEPS.length - 1]?.atMs ?? 0;
}

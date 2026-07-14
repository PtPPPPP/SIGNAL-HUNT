import { describe, expect, it } from 'vitest';

import {
  createInitialDisplayState,
  getDisplayCopy,
  isInteractionLocked,
  transitionDisplayState,
  type DisplayEvent,
} from './displayStateMachine';

describe('display state machine', () => {
  it('starts in BOOT and enters ATTRACT after boot completes', () => {
    const state = createInitialDisplayState();

    expect(state.status).toBe('BOOT');
    expect(transitionDisplayState(state, { type: 'BOOT_READY' }).status).toBe('ATTRACT');
  });

  it('recovers a committed draw directly into RESULT without drawing again', () => {
    const recovered = transitionDisplayState(createInitialDisplayState(), { type: 'BOOT_RECOVERED' });

    expect(recovered.status).toBe('RESULT');
    expect(isInteractionLocked(recovered)).toBe(true);
  });

  it('follows the deterministic draw lifecycle', () => {
    const events: DisplayEvent[] = [
      { type: 'BOOT_READY' },
      { type: 'TOUCH_ACCEPTED' },
      { type: 'COMMIT_STARTED' },
      { type: 'COMMIT_SUCCEEDED' },
      { type: 'SCAN_COMPLETE' },
      { type: 'SEARCH_COMPLETE' },
      { type: 'PEAK_CONFIRMED' },
      { type: 'LOCK_COMPLETE' },
      { type: 'REVEAL_COMPLETE' },
      { type: 'RESET_COMPLETE' },
    ];

    const states = events.reduce(transitionDisplayState, createInitialDisplayState());

    expect(states.status).toBe('ATTRACT');
  });

  it('locks interaction immediately after a touch is accepted', () => {
    const ready = transitionDisplayState(createInitialDisplayState(), { type: 'BOOT_READY' });
    const arming = transitionDisplayState(ready, { type: 'TOUCH_ACCEPTED' });

    expect(arming.status).toBe('ARMING');
    expect(isInteractionLocked(arming)).toBe(true);
    expect(transitionDisplayState(arming, { type: 'TOUCH_ACCEPTED' })).toBe(arming);
  });

  it('rejects invalid transitions early', () => {
    expect(() =>
      transitionDisplayState(createInitialDisplayState(), { type: 'COMMIT_SUCCEEDED' }),
    ).toThrow('Invalid display transition: BOOT -> COMMIT_SUCCEEDED.');
  });

  it('moves to ERROR on commit failure and can reset to ATTRACT', () => {
    const ready = transitionDisplayState(createInitialDisplayState(), { type: 'BOOT_READY' });
    const arming = transitionDisplayState(ready, { type: 'TOUCH_ACCEPTED' });
    const committing = transitionDisplayState(arming, { type: 'COMMIT_STARTED' });
    const error = transitionDisplayState(committing, {
      type: 'COMMIT_FAILED',
      message: 'No active prize is available.',
    });

    expect(error).toMatchObject({
      status: 'ERROR',
      errorMessage: 'No active prize is available.',
      interactionLocked: true,
    });
    expect(transitionDisplayState(error, { type: 'RESET_COMPLETE' }).status).toBe('ATTRACT');
  });

  it('surfaces database failures instead of presenting an interactive display', () => {
    const error = transitionDisplayState(createInitialDisplayState(), {
      type: 'DATABASE_FAILED',
      message: 'IndexedDB unavailable',
    });

    expect(error).toMatchObject({
      status: 'ERROR',
      errorMessage: 'IndexedDB unavailable',
      interactionLocked: true,
    });
  });

  it('restores an external committed draw from PAUSED', () => {
    const paused = transitionDisplayState(createInitialDisplayState(), { type: 'PAUSE' });
    expect(transitionDisplayState(paused, { type: 'DRAW_RECOVERED' }).status).toBe('RESULT');
  });

  it('exposes concise copy for display states', () => {
    expect(getDisplayCopy('ATTRACT').title).toBe('发现你的幸运信号');
    expect(getDisplayCopy('SCANNING').title).toBe('扫描信号中');
    expect(getDisplayCopy('RESULT').title).toBe('幸运信号已锁定');
  });
});

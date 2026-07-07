import { describe, expect, it, vi } from 'vitest';

import type { DisplayEvent, DisplayState } from './displayStateMachine';
import { applyDisplayEvent, StateTransitionError } from './displayTransition';

const attractState: DisplayState = {
  status: 'ATTRACT',
  interactionLocked: false,
};

const resultState: DisplayState = {
  status: 'RESULT',
  interactionLocked: true,
};

const invalidEvent: DisplayEvent = { type: 'COMMIT_SUCCEEDED' };

describe('display transition error handling', () => {
  it('makes invalid transitions observable in development', () => {
    const onError = vi.fn();

    expect(() =>
      applyDisplayEvent(attractState, invalidEvent, {
        mode: 'development',
        onError,
      }),
    ).toThrow(StateTransitionError);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ currentState: 'ATTRACT', event: invalidEvent }));
  });

  it('does not silently return the old state in production', () => {
    const nextState = applyDisplayEvent(attractState, invalidEvent, {
      mode: 'production',
      onError: vi.fn(),
    });

    expect(nextState).not.toEqual(attractState);
    expect(nextState).toMatchObject({
      status: 'ERROR',
      interactionLocked: true,
      errorMessage: '系统状态异常，请联系现场工作人员',
    });
  });

  it('preserves an existing result during production recovery', () => {
    const nextState = applyDisplayEvent(resultState, invalidEvent, {
      mode: 'production',
      onError: vi.fn(),
    });

    expect(nextState).toMatchObject({
      status: 'RESULT',
      interactionLocked: true,
      errorMessage: '系统状态异常，请联系现场工作人员',
    });
  });

  it('includes diagnostic context in transition errors', () => {
    try {
      applyDisplayEvent(attractState, invalidEvent, { mode: 'development' });
    } catch (error) {
      expect(error).toBeInstanceOf(StateTransitionError);
      expect(error).toMatchObject({
        currentState: 'ATTRACT',
        event: invalidEvent,
      });
      expect((error as StateTransitionError).timestamp).toEqual(expect.any(String));
    }
  });
});

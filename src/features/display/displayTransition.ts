import {
  transitionDisplayState,
  type DisplayEvent,
  type DisplayState,
  type DrawState,
} from './displayStateMachine';

export type DisplayTransitionMode = 'development' | 'production';

export type StateTransitionErrorDetails = {
  currentState: DrawState;
  event: DisplayEvent;
  timestamp: string;
};

export class StateTransitionError extends Error {
  public readonly currentState: DrawState;
  public readonly event: DisplayEvent;
  public readonly timestamp: string;

  constructor(details: StateTransitionErrorDetails) {
    super(`Invalid display transition: ${details.currentState} -> ${details.event.type}.`);
    this.name = 'StateTransitionError';
    this.currentState = details.currentState;
    this.event = details.event;
    this.timestamp = details.timestamp;
  }
}

export type ApplyDisplayEventOptions = {
  mode?: DisplayTransitionMode;
  onError?: (details: StateTransitionErrorDetails) => void;
};

const RECOVERABLE_ERROR_MESSAGE = '系统状态异常，请联系现场工作人员';

export function applyDisplayEvent(
  state: DisplayState,
  event: DisplayEvent,
  options: ApplyDisplayEventOptions = {},
): DisplayState {
  try {
    return transitionDisplayState(state, event);
  } catch {
    const details: StateTransitionErrorDetails = {
      currentState: state.status,
      event,
      timestamp: new Date().toISOString(),
    };

    options.onError?.(details);

    if ((options.mode ?? defaultTransitionMode()) === 'development') {
      throw new StateTransitionError(details);
    }

    if (state.status === 'RESULT') {
      return {
        ...state,
        errorMessage: RECOVERABLE_ERROR_MESSAGE,
      };
    }

    return {
      status: 'ERROR',
      interactionLocked: true,
      errorMessage: RECOVERABLE_ERROR_MESSAGE,
    };
  }
}

function defaultTransitionMode(): DisplayTransitionMode {
  return import.meta.env.PROD ? 'production' : 'development';
}

export type DrawState =
  | 'BOOT'
  | 'ATTRACT'
  | 'ARMING'
  | 'COMMITTING'
  | 'SCANNING'
  | 'SEARCHING'
  | 'PEAK_DETECTED'
  | 'LOCKING'
  | 'REVEALING'
  | 'RESULT'
  | 'RESETTING'
  | 'PAUSED'
  | 'ERROR';

export type DisplayEvent =
  | { type: 'BOOT_READY' }
  | { type: 'BOOT_RECOVERED' }
  | { type: 'TOUCH_ACCEPTED' }
  | { type: 'COMMIT_STARTED' }
  | { type: 'COMMIT_SUCCEEDED' }
  | { type: 'COMMIT_FAILED'; message: string }
  | { type: 'SCAN_COMPLETE' }
  | { type: 'SEARCH_COMPLETE' }
  | { type: 'PEAK_CONFIRMED' }
  | { type: 'LOCK_COMPLETE' }
  | { type: 'REVEAL_COMPLETE' }
  | { type: 'RESET_STARTED' }
  | { type: 'RESET_COMPLETE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' };

export type DisplayState = {
  status: DrawState;
  interactionLocked: boolean;
  errorMessage?: string;
};

export type DisplayCopy = {
  title: string;
  subtitle: string;
  action: string;
};

const COPY_BY_STATE: Record<DrawState, DisplayCopy> = {
  BOOT: {
    title: '系统准备中',
    subtitle: 'INITIALIZING SIGNAL FIELD',
    action: '请稍候',
  },
  ATTRACT: {
    title: '发现你的幸运信号',
    subtitle: 'DISCOVER YOUR LUCKY SIGNAL',
    action: '触碰屏幕 · 开始捕获',
  },
  ARMING: {
    title: '测量已启动',
    subtitle: 'MEASUREMENT ACTIVATED',
    action: '请保持静止',
  },
  COMMITTING: {
    title: '正在锁定结果',
    subtitle: 'LOCKING RESULT',
    action: '请稍候',
  },
  SCANNING: {
    title: '扫描信号中',
    subtitle: 'SCANNING SIGNALS',
    action: '分析中',
  },
  SEARCHING: {
    title: '搜索峰值中',
    subtitle: 'SEARCHING FOR PEAK',
    action: '测量中',
  },
  PEAK_DETECTED: {
    title: '检测到峰值',
    subtitle: 'PEAK DETECTED',
    action: '校验中',
  },
  LOCKING: {
    title: '锁定信号中',
    subtitle: 'LOCKING SIGNAL',
    action: '锁定中',
  },
  REVEALING: {
    title: '信号已锁定',
    subtitle: 'SIGNAL LOCKED',
    action: '揭晓中',
  },
  RESULT: {
    title: '幸运信号已锁定',
    subtitle: 'SIGNAL LOCKED',
    action: '下一位参与者',
  },
  RESETTING: {
    title: '系统复位中',
    subtitle: 'RESETTING',
    action: '请稍候',
  },
  PAUSED: {
    title: '系统已暂停',
    subtitle: 'SYSTEM PAUSED',
    action: '已暂停',
  },
  ERROR: {
    title: '需要工作人员协助',
    subtitle: 'STAFF ASSISTANCE REQUIRED',
    action: '出错',
  },
};

const NEXT_STATE: Partial<Record<DrawState, Partial<Record<DisplayEvent['type'], DrawState>>>> = {
  BOOT: {
    BOOT_READY: 'ATTRACT',
    BOOT_RECOVERED: 'RESULT',
    PAUSE: 'PAUSED',
  },
  ATTRACT: {
    TOUCH_ACCEPTED: 'ARMING',
    PAUSE: 'PAUSED',
  },
  ARMING: {
    COMMIT_STARTED: 'COMMITTING',
  },
  COMMITTING: {
    COMMIT_SUCCEEDED: 'SCANNING',
  },
  SCANNING: {
    SCAN_COMPLETE: 'SEARCHING',
  },
  SEARCHING: {
    SEARCH_COMPLETE: 'PEAK_DETECTED',
  },
  PEAK_DETECTED: {
    PEAK_CONFIRMED: 'LOCKING',
  },
  LOCKING: {
    LOCK_COMPLETE: 'REVEALING',
  },
  REVEALING: {
    REVEAL_COMPLETE: 'RESULT',
  },
  RESULT: {
    RESET_STARTED: 'RESETTING',
    RESET_COMPLETE: 'ATTRACT',
  },
  RESETTING: {
    RESET_COMPLETE: 'ATTRACT',
  },
  PAUSED: {
    RESUME: 'ATTRACT',
  },
  ERROR: {
    RESET_COMPLETE: 'ATTRACT',
  },
};

export function createInitialDisplayState(): DisplayState {
  return {
    status: 'BOOT',
    interactionLocked: false,
  };
}

export function transitionDisplayState(state: DisplayState, event: DisplayEvent): DisplayState {
  if (state.interactionLocked && event.type === 'TOUCH_ACCEPTED') {
    return state;
  }

  if (event.type === 'COMMIT_FAILED') {
    if (state.status !== 'COMMITTING') {
      throw createInvalidTransitionError(state.status, event.type);
    }

    return {
      status: 'ERROR',
      interactionLocked: true,
      errorMessage: event.message,
    };
  }

  const nextStatus = NEXT_STATE[state.status]?.[event.type];

  if (!nextStatus) {
    throw createInvalidTransitionError(state.status, event.type);
  }

  return {
    status: nextStatus,
    interactionLocked: shouldLockInteraction(nextStatus),
  };
}

export function isInteractionLocked(state: DisplayState): boolean {
  return state.interactionLocked;
}

export function getDisplayCopy(status: DrawState): DisplayCopy {
  return COPY_BY_STATE[status];
}

function shouldLockInteraction(status: DrawState): boolean {
  return status !== 'BOOT' && status !== 'ATTRACT';
}

function createInvalidTransitionError(status: DrawState, eventType: DisplayEvent['type']): Error {
  return new Error(`Invalid display transition: ${status} -> ${eventType}.`);
}

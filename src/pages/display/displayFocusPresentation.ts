import type {
  DisplayCopy,
  DrawState,
} from '../../features/display/displayStateMachine';

export type FocusPhase =
  | 'calibrating'
  | 'scanning'
  | 'focusing'
  | 'acquired'
  | 'locked'
  | 'resolving';

export type FocusStage = {
  phase: FocusPhase;
  sequence: string;
  title: string;
  subtitle: string;
};

const FOCUS_STAGE_BY_STATE: Partial<Record<DrawState, FocusStage>> = {
  ARMING: {
    phase: 'calibrating',
    sequence: '01',
    title: '正在建立观测通道',
    subtitle: 'CALIBRATING OPTICS',
  },
  COMMITTING: {
    phase: 'calibrating',
    sequence: '01',
    title: '正在建立观测通道',
    subtitle: 'CALIBRATING OPTICS',
  },
  SCANNING: {
    phase: 'scanning',
    sequence: '02',
    title: '正在校准观测区域',
    subtitle: 'CALIBRATING FIELD',
  },
  SEARCHING: {
    phase: 'focusing',
    sequence: '03',
    title: '正在聚焦目标信号',
    subtitle: 'FOCUSING TARGET SIGNAL',
  },
  PEAK_DETECTED: {
    phase: 'acquired',
    sequence: '04',
    title: '已捕获关键峰值',
    subtitle: 'TARGET ACQUIRED',
  },
  LOCKING: {
    phase: 'locked',
    sequence: '05',
    title: '观测目标已锁定',
    subtitle: 'TARGET LOCKED',
  },
  REVEALING: {
    phase: 'resolving',
    sequence: '06',
    title: '观测结果即将确认',
    subtitle: 'RESOLVING OBSERVATION',
  },
};

export function getDisplayFocusStage(status: DrawState): FocusStage | undefined {
  return FOCUS_STAGE_BY_STATE[status];
}

export function getDisplayFocusCopy(status: DrawState, fallback: DisplayCopy): DisplayCopy {
  const stage = getDisplayFocusStage(status);

  return stage
    ? {
        ...fallback,
        title: stage.title,
        subtitle: stage.subtitle,
      }
    : fallback;
}

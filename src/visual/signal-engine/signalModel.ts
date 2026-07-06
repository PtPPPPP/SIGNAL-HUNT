import type { DrawState } from '../../features/display/displayStateMachine';

export type SignalProfile = {
  amplitude: number;
  frequency: number;
  speed: number;
  noise: number;
  peakCount: number;
  opacity: number;
};

export type SignalPoint = {
  x: number;
  y: number;
};

export type SignalPeak = SignalPoint & {
  opacity: number;
  radius: number;
};

export type SignalFrame = {
  width: number;
  height: number;
  opacity: number;
  cursorX: number;
  points: SignalPoint[];
  peaks: SignalPeak[];
};

export type SignalFrameInput = {
  status: DrawState;
  timeMs: number;
  width: number;
  height: number;
};

const SAMPLE_COUNT = 160;

const PROFILE_BY_STATE: Record<DrawState, SignalProfile> = {
  BOOT: { amplitude: 0.08, frequency: 1.4, speed: 0.18, noise: 0.01, peakCount: 0, opacity: 0.35 },
  ATTRACT: { amplitude: 0.11, frequency: 1.8, speed: 0.24, noise: 0.015, peakCount: 0, opacity: 0.42 },
  ARMING: { amplitude: 0.18, frequency: 2.4, speed: 0.42, noise: 0.025, peakCount: 1, opacity: 0.58 },
  COMMITTING: { amplitude: 0.2, frequency: 2.7, speed: 0.52, noise: 0.03, peakCount: 1, opacity: 0.62 },
  SCANNING: { amplitude: 0.28, frequency: 3.5, speed: 0.82, noise: 0.055, peakCount: 3, opacity: 0.78 },
  SEARCHING: { amplitude: 0.32, frequency: 3.8, speed: 0.66, noise: 0.04, peakCount: 4, opacity: 0.84 },
  PEAK_DETECTED: { amplitude: 0.38, frequency: 4.1, speed: 0.38, noise: 0.025, peakCount: 2, opacity: 0.96 },
  LOCKING: { amplitude: 0.25, frequency: 2.6, speed: 0.16, noise: 0.012, peakCount: 1, opacity: 0.9 },
  REVEALING: { amplitude: 0.18, frequency: 2.1, speed: 0.08, noise: 0.008, peakCount: 1, opacity: 0.86 },
  RESULT: { amplitude: 0.1, frequency: 1.6, speed: 0, noise: 0, peakCount: 1, opacity: 0.72 },
  RESETTING: { amplitude: 0.07, frequency: 1.2, speed: 0.1, noise: 0.005, peakCount: 0, opacity: 0.32 },
  PAUSED: { amplitude: 0.04, frequency: 0.9, speed: 0, noise: 0, peakCount: 0, opacity: 0.18 },
  ERROR: { amplitude: 0.03, frequency: 0.6, speed: 0, noise: 0, peakCount: 0, opacity: 0.22 },
};

export function getSignalProfile(status: DrawState): SignalProfile {
  return PROFILE_BY_STATE[status];
}

export function createSignalFrame(input: SignalFrameInput): SignalFrame {
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const profile = getSignalProfile(input.status);
  const centerY = height / 2;
  const phase = (input.timeMs / 1000) * profile.speed;
  const points = createSignalPoints(width, height, centerY, profile, phase);
  const cursorX = input.status === 'RESULT' ? width / 2 : (phase % 1) * width;

  return {
    width,
    height,
    opacity: profile.opacity,
    cursorX,
    points,
    peaks: createSignalPeaks(input.status, width, height, profile, phase),
  };
}

function createSignalPoints(
  width: number,
  height: number,
  centerY: number,
  profile: SignalProfile,
  phase: number,
): SignalPoint[] {
  const amplitudePx = height * profile.amplitude;

  return Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const progress = index / (SAMPLE_COUNT - 1);
    const base = Math.sin((progress * profile.frequency + phase) * Math.PI * 2);
    const harmonic = Math.sin((progress * profile.frequency * 2.13 + phase * 0.72) * Math.PI * 2) * 0.28;
    const drift = Math.sin((progress * 0.7 + phase * 0.28) * Math.PI * 2) * 0.18;
    const noise = boundedNoise(index, phase) * profile.noise;
    const y = clamp(centerY - (base + harmonic + drift + noise) * amplitudePx, 0, height);

    return {
      x: progress * width,
      y,
    };
  });
}

function createSignalPeaks(
  status: DrawState,
  width: number,
  height: number,
  profile: SignalProfile,
  phase: number,
): SignalPeak[] {
  if (profile.peakCount === 0) {
    return [];
  }

  if (status === 'RESULT') {
    return [{ x: width / 2, y: height / 2, opacity: 0.78, radius: height * 0.05 }];
  }

  return Array.from({ length: profile.peakCount }, (_, index) => {
    const progress = (index + 1) / (profile.peakCount + 1);
    const pulse = (Math.sin((phase * 1.7 + index * 0.23) * Math.PI * 2) + 1) / 2;

    return {
      x: progress * width,
      y: height * (0.34 + boundedNoise(index + 13, phase) * 0.18),
      opacity: status === 'PEAK_DETECTED' ? 0.76 + pulse * 0.2 : 0.38 + pulse * 0.28,
      radius: height * (0.018 + pulse * 0.02),
    };
  });
}

function boundedNoise(index: number, phase: number): number {
  const value = Math.sin(index * 12.9898 + phase * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

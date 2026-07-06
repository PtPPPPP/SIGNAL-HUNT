import { describe, expect, it } from 'vitest';

import { createSignalFrame, getSignalProfile } from './signalModel';

describe('signal model', () => {
  it('uses calm low-intensity values for ATTRACT and stronger values for SCANNING', () => {
    const attract = getSignalProfile('ATTRACT');
    const scanning = getSignalProfile('SCANNING');

    expect(attract.amplitude).toBeLessThan(scanning.amplitude);
    expect(attract.noise).toBeLessThan(scanning.noise);
    expect(scanning.opacity).toBeGreaterThan(attract.opacity);
  });

  it('creates a stable waveform with bounded points', () => {
    const frame = createSignalFrame({
      status: 'SCANNING',
      timeMs: 1200,
      width: 800,
      height: 320,
    });

    expect(frame.points).toHaveLength(160);
    expect(frame.points.every((point) => point.x >= 0 && point.x <= 800)).toBe(true);
    expect(frame.points.every((point) => point.y >= 0 && point.y <= 320)).toBe(true);
  });

  it('places visible synthetic peaks during PEAK_DETECTED', () => {
    const frame = createSignalFrame({
      status: 'PEAK_DETECTED',
      timeMs: 2800,
      width: 1000,
      height: 400,
    });

    expect(frame.peaks.length).toBeGreaterThan(0);
    expect(frame.peaks.some((peak) => peak.opacity > 0.7)).toBe(true);
  });

  it('keeps RESULT visually locked with a centered marker', () => {
    const frame = createSignalFrame({
      status: 'RESULT',
      timeMs: 6000,
      width: 1200,
      height: 480,
    });

    expect(frame.cursorX).toBe(600);
    expect(frame.peaks).toHaveLength(1);
    expect(frame.peaks[0]?.x).toBe(600);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

import { readCanvasMetrics, resetCanvasMetrics } from './canvasDiagnostics';
import { SignalCanvas } from './SignalCanvas';

/**
 * jsdom has no real canvas renderer (vitest.setup mocks getContext -> null), so to
 * exercise the live rAF path we inject a no-op 2d context and drive requestAnimationFrame
 * manually. This proves the DPR cap and metrics reporting behave without needing a
 * real GPU.
 */
function makeFakeContext(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {};

  return new Proxy(state, {
    get(target, prop) {
      const key = prop as string;
      if (key in target) {
        return target[key];
      }

      // Every canvas drawing method is a no-op; we only care about the metrics math.
      return () => {};
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe('SignalCanvas 4K behaviour', () => {
  let originalDpr: number | undefined;
  const queue: FrameRequestCallback[] = [];

  beforeEach(() => {
    originalDpr = (window as { devicePixelRatio?: number }).devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true, writable: true });
    queue.length = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      queue.push(cb as FrameRequestCallback);
      return queue.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeFakeContext());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalDpr === undefined) {
      delete (window as { devicePixelRatio?: number }).devicePixelRatio;
    } else {
      Object.defineProperty(window, 'devicePixelRatio', {
        value: originalDpr,
        configurable: true,
        writable: true,
      });
    }
    resetCanvasMetrics();
  });

  it('caps the backing-buffer DPR and reports the effective values', () => {
    render(<SignalCanvas status="ATTRACT" />);

    // Drive one frame past the metrics-report throttle (500ms).
    act(() => {
      const cb = queue.shift();
      cb?.(600);
    });

    const metrics = readCanvasMetrics();

    // devicePixelRatio is 3 but the cap is 2 (DEFAULT_MAX_CANVAS_DPR).
    expect(metrics.cappedDpr).toBe(2);
    expect(metrics.dpr).toBe(3);
    expect(metrics.maxDpr).toBe(2);
    // cssWidth falls back to 1280 in jsdom; capped DPR 2 -> 2560px backing buffer.
    expect(metrics.backingWidth).toBe(2560);
    expect(metrics.rafRunning).toBe(true);
  });
});

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_MAX_CANVAS_DPR,
  getMaxCanvasDpr,
  readCanvasMetrics,
  reportCanvasMetrics,
  resetCanvasMetrics,
} from './canvasDiagnostics';

describe('canvas diagnostics singleton', () => {
  afterEach(() => {
    resetCanvasMetrics();
  });

  it('defaults to DEFAULT_MAX_CANVAS_DPR when no override is set', () => {
    expect(DEFAULT_MAX_CANVAS_DPR).toBe(2);
    expect(getMaxCanvasDpr()).toBe(DEFAULT_MAX_CANVAS_DPR);
  });

  it('honors a localStorage override for现场 tuning', () => {
    const original = localStorage.getItem('signal-hunt:maxCanvasDpr');
    localStorage.setItem('signal-hunt:maxCanvasDpr', '1.5');

    expect(getMaxCanvasDpr()).toBe(1.5);

    if (original === null) {
      localStorage.removeItem('signal-hunt:maxCanvasDpr');
    } else {
      localStorage.setItem('signal-hunt:maxCanvasDpr', original);
    }
  });

  it('ignores invalid override values', () => {
    localStorage.setItem('signal-hunt:maxCanvasDpr', 'not-a-number');
    expect(getMaxCanvasDpr()).toBe(DEFAULT_MAX_CANVAS_DPR);
    localStorage.removeItem('signal-hunt:maxCanvasDpr');
  });

  it('reports and reads back metrics with an updatedAt timestamp', () => {
    reportCanvasMetrics({ fps: 60, cappedDpr: 2, rafRunning: true });

    const metrics = readCanvasMetrics();

    expect(metrics.fps).toBe(60);
    expect(metrics.cappedDpr).toBe(2);
    expect(metrics.rafRunning).toBe(true);
    expect(metrics.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

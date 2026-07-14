import { useEffect, useRef } from 'react';

import type { DrawState } from '../../features/display/displayStateMachine';
import {
  getMaxCanvasDpr,
  readCanvasMetrics,
  reportCanvasMetrics,
  resetCanvasMetrics,
} from './canvasDiagnostics';
import { createSignalFrame } from './signalModel';
import { defaultSignalRenderColors, renderSignalFrame, type SignalRenderColors } from './signalRenderer';

type SignalCanvasProps = {
  status: DrawState;
};

/** Throttle metrics reports so we don't write to the singleton every frame. */
const METRICS_REPORT_INTERVAL_MS = 500;
/** Smooth FPS over a rolling window of recent frame intervals. */
const FPS_WINDOW = 30;

/**
 * 从 CSS 主题变量读取信号颜色，让 Canvas 的红色高亮与全局品牌 Token 统一，
 * 避免在渲染器里散落硬编码红色。主题在运行时不变，初始化时读取一次即可。
 */
function readSignalColors(): SignalRenderColors {
  if (typeof window === 'undefined' || !document.documentElement) {
    return defaultSignalRenderColors;
  }

  const style = window.getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim();
    return value || fallback;
  };

  return {
    background: pick('--color-bg-primary', defaultSignalRenderColors.background),
    grid: pick('--color-grid', defaultSignalRenderColors.grid),
    signal: pick('--color-signal', defaultSignalRenderColors.signal),
    signalDim: pick('--color-signal-dim', defaultSignalRenderColors.signalDim),
    peak: pick('--color-signal-peak', defaultSignalRenderColors.peak),
    cursor: pick('--color-cursor', defaultSignalRenderColors.cursor),
  };
}

export function SignalCanvas({ status }: SignalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef(status);

  statusRef.current = status;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      // Surface canvas init failures to the persistent diagnostic log path so a
      // blank kiosk screen is explainable on /diagnostics.
      reportCanvasMetrics({ rafRunning: false });
      return undefined;
    }

    const colors = readSignalColors();
    let animationFrameId = 0;
    let disposed = false;
    let lastReportMs = 0;
    const frameDeltas: number[] = [];
    let lastFrameMs = 0;

    // CSS size is read from a ref updated by ResizeObserver, so the render loop
    // never forces a synchronous layout read every frame. A pending flag coalesces
    // multiple observer callbacks into one backing-buffer reallocation per frame.
    let cssWidth = canvas.clientWidth || 1280;
    let cssHeight = canvas.clientHeight || 520;
    let sizeIsDirty = true;

    const applyResize = () => {
      sizeIsDirty = true;
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(applyResize) : undefined;
    resizeObserver?.observe(canvas);

    const report = (nowMs: number, backingWidth: number, backingHeight: number, dpr: number, maxDpr: number) => {
      if (nowMs - lastReportMs < METRICS_REPORT_INTERVAL_MS) {
        return;
      }

      lastReportMs = nowMs;
      const fps = frameDeltas.length > 1 ? computeFps(frameDeltas) : readCanvasMetrics().fps;

      reportCanvasMetrics({
        fps,
        cssWidth,
        cssHeight,
        backingWidth,
        backingHeight,
        dpr: Math.round(dpr * 100) / 100,
        cappedDpr: Math.round(Math.min(dpr, maxDpr) * 100) / 100,
        maxDpr,
        rafRunning: true,
        visibilityState: document.visibilityState,
      });
    };

    const render = (timeMs: number) => {
      if (disposed) {
        return;
      }

      // Frame timing for FPS (skip the first delta which includes warm-up).
      if (lastFrameMs > 0) {
        frameDeltas.push(timeMs - lastFrameMs);
        if (frameDeltas.length > FPS_WINDOW) {
          frameDeltas.shift();
        }
      }
      lastFrameMs = timeMs;

      // Pick up any ResizeObserver coalesced size change without a per-frame layout read.
      if (sizeIsDirty) {
        cssWidth = canvas.clientWidth || 1280;
        cssHeight = canvas.clientHeight || 520;
        sizeIsDirty = false;
      }

      // Cap the device pixel ratio so a 4K / HiDPI kiosk never allocates an
      // enormous backing buffer (and the per-frame fill cost stays bounded).
      const maxDpr = getMaxCanvasDpr();
      const rawDpr = Math.max(1, window.devicePixelRatio || 1);
      const pixelRatio = Math.min(rawDpr, maxDpr);
      const targetWidth = Math.floor(cssWidth * pixelRatio);
      const targetHeight = Math.floor(cssHeight * pixelRatio);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      renderSignalFrame(
        context,
        createSignalFrame({
          status: statusRef.current,
          timeMs,
          width: cssWidth,
          height: cssHeight,
        }),
        colors,
      );

      report(timeMs, targetWidth, targetHeight, rawDpr, maxDpr);

      animationFrameId = window.requestAnimationFrame(render);
    };

    const start = () => {
      if (animationFrameId === 0 && !disposed) {
        lastFrameMs = 0;
        animationFrameId = window.requestAnimationFrame(render);
        reportCanvasMetrics({ rafRunning: true });
      }
    };

    const stop = () => {
      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
      reportCanvasMetrics({ rafRunning: false, visibilityState: document.visibilityState });
    };

    // Pause the rAF loop when the kiosk tab is hidden so a backgrounded browser
    // tab stops burning CPU/GPU. A kiosk main screen is always visible, so this
    // only affects backgrounded preview tabs — it cannot blank the kiosk display.
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    if (document.hidden) {
      reportCanvasMetrics({ rafRunning: false, visibilityState: 'hidden' });
    } else {
      start();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stop();
      resetCanvasMetrics();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="signal-canvas"
      aria-label="Signal waveform visualization"
      role="img"
    />
  );
}

function computeFps(deltas: number[]): number {
  if (deltas.length === 0) {
    return 0;
  }

  const sum = deltas.reduce((total, delta) => total + delta, 0);
  const average = sum / deltas.length;

  return average > 0 ? Math.round(1000 / average) : 0;
}

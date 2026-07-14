/**
 * Shared canvas performance diagnostics.
 *
 * SignalCanvas reports a small metrics snapshot here each frame (throttled); the
 * /diagnostics page reads it back so现场 staff can see real FPS, CSS size, the
 * backing buffer size, the effective (capped) DPR and whether the rAF loop is
 * actually running. This is a single-canvas kiosk, so a module-level singleton is
 * sufficient and avoids plumbing props through the React tree.
 */

export type CanvasMetrics = {
  fps: number;
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  dpr: number;
  cappedDpr: number;
  maxDpr: number;
  rafRunning: boolean;
  visibilityState: string;
  updatedAt: string;
};

export const DEFAULT_MAX_CANVAS_DPR = 2;
const MAX_DPR_STORAGE_KEY = 'signal-hunt:maxCanvasDpr';

const initialMetrics: CanvasMetrics = {
  fps: 0,
  cssWidth: 0,
  cssHeight: 0,
  backingWidth: 0,
  backingHeight: 0,
  dpr: 0,
  cappedDpr: 0,
  maxDpr: DEFAULT_MAX_CANVAS_DPR,
  rafRunning: false,
  visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
  updatedAt: '',
};

let currentMetrics: CanvasMetrics = { ...initialMetrics };

/**
 * The maximum device-pixel ratio the canvas will allocate a backing buffer for.
 *
 * On a 4K kiosk the raw devicePixelRatio can be 1 (most 4K panels driven at
 * 100% scale) but the browser zoom or a HiDPI laptop previewing the kiosk can
 * push it to 2-3. Capping keeps the backing buffer (and thus per-frame fill cost)
 * bounded while staying crisp. Operators can override现场 without a rebuild via
 * `localStorage['signal-hunt:maxCanvasDpr'] = 2` in the kiosk console.
 */
export function getMaxCanvasDpr(): number {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(MAX_DPR_STORAGE_KEY);

      if (raw) {
        const parsed = Number(raw);

        if (Number.isFinite(parsed) && parsed >= 1) {
          return parsed;
        }
      }
    }
  } catch {
    // localStorage may be unavailable (private mode); fall back to default.
  }

  return DEFAULT_MAX_CANVAS_DPR;
}

export function reportCanvasMetrics(partial: Partial<CanvasMetrics>): void {
  currentMetrics = { ...currentMetrics, ...partial, updatedAt: new Date().toISOString() };
}

export function readCanvasMetrics(): CanvasMetrics {
  return currentMetrics;
}

export function resetCanvasMetrics(): void {
  currentMetrics = { ...initialMetrics };
}

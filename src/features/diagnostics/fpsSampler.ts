/** Samples animation-frame throughput and releases the pending frame on cleanup. */
export function sampleFps(durationMs: number, onSample: (fps: number) => void): () => void {
  if (typeof requestAnimationFrame !== 'function') {
    onSample(0);

    return () => {};
  }

  let frames = 0;
  let cancelled = false;
  let frameId: number | undefined;
  const start = performance.now();

  const tick = () => {
    if (cancelled) {
      return;
    }

    frames += 1;

    if (performance.now() - start < durationMs) {
      frameId = requestAnimationFrame(tick);
    } else {
      onSample(Math.max(0, Math.round((frames * 1000) / durationMs)));
    }
  };

  frameId = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (frameId !== undefined) {
      cancelAnimationFrame(frameId);
    }
  };
}

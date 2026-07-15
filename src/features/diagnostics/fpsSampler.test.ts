import { afterEach, describe, expect, it, vi } from 'vitest';

import { sampleFps } from './fpsSampler';

describe('sampleFps', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cancels the pending animation frame when the subscriber is disposed', () => {
    const requestFrame = vi.fn(() => 42);
    const cancelFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);

    const stop = sampleFps(1_000, vi.fn());
    stop();

    expect(requestFrame).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledWith(42);
  });
});

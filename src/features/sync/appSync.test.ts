import { afterEach, describe, expect, it, vi } from 'vitest';

import { isAppChange, subscribeAppChanges, type AppChange } from './appSync';

const STORAGE_KEY = 'signal-hunt-app-sync:event';

function change(overrides: Partial<AppChange> = {}): AppChange {
  return {
    type: 'EVENT_PAUSED',
    eventId: 'event-1',
    revision: 'revision-1',
    timestamp: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

function dispatchStorage(value: unknown): void {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: typeof value === 'string' ? value : JSON.stringify(value),
    }),
  );
}

describe('appSync', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts only complete supported invalidation messages', () => {
    expect(isAppChange(change())).toBe(true);
    expect(isAppChange({ ...change(), type: 'UNKNOWN' })).toBe(false);
    expect(isAppChange({ ...change(), revision: '' })).toBe(false);
    expect(isAppChange({ ...change(), timestamp: 'not-a-date' })).toBe(false);
    expect(isAppChange(null)).toBe(false);
  });

  it('delivers the same revision only once and ignores malformed payloads', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppChanges(listener);
    const first = change();

    dispatchStorage(first);
    dispatchStorage(first);
    dispatchStorage('{malformed');
    dispatchStorage({ ...first, revision: 'revision-2' });
    dispatchStorage({ ...first, revision: 'revision-3', type: 'UNKNOWN' });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, first);
    expect(listener).toHaveBeenNthCalledWith(2, { ...first, revision: 'revision-2' });

    unsubscribe();
  });
});

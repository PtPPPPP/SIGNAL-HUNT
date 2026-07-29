import { describe, expect, it } from 'vitest';

import { getErrorMessage } from './errorMessage';

describe('getErrorMessage', () => {
  it('keeps Error messages and stringifies other failures', () => {
    expect(getErrorMessage(new Error('database unavailable'))).toBe('database unavailable');
    expect(getErrorMessage({ code: 'FAILED' })).toBe('[object Object]');
  });
});

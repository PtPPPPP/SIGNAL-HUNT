import { describe, expect, it } from 'vitest';

import { resolveDesktopShortcut, type DesktopShortcutInput } from './shortcuts';

const baseInput: DesktopShortcutInput = {
  alt: false,
  control: true,
  isAutoRepeat: false,
  key: 'A',
  meta: false,
  shift: true,
  type: 'keyDown',
};

describe('resolveDesktopShortcut', () => {
  it('maps the admin shortcut', () => {
    expect(resolveDesktopShortcut(baseInput)).toBe('OPEN_ADMIN');
  });

  it('ignores incomplete, repeated, and key-up input', () => {
    expect(resolveDesktopShortcut({ ...baseInput, shift: false })).toBeUndefined();
    expect(resolveDesktopShortcut({ ...baseInput, isAutoRepeat: true })).toBeUndefined();
    expect(resolveDesktopShortcut({ ...baseInput, type: 'keyUp' })).toBeUndefined();
  });
});

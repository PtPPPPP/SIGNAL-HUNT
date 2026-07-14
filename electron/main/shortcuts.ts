export type DesktopShortcutAction = 'OPEN_ADMIN' | 'OPEN_STAFF';

export type DesktopShortcutInput = {
  alt: boolean;
  control: boolean;
  isAutoRepeat: boolean;
  key: string;
  meta: boolean;
  shift: boolean;
  type: string;
};

export function resolveDesktopShortcut(input: DesktopShortcutInput): DesktopShortcutAction | undefined {
  if (
    input.type !== 'keyDown' ||
    input.isAutoRepeat ||
    !input.control ||
    !input.shift ||
    input.alt ||
    input.meta
  ) {
    return undefined;
  }

  const key = input.key.toUpperCase();
  if (key === 'A') return 'OPEN_ADMIN';
  if (key === 'S') return 'OPEN_STAFF';
  return undefined;
}

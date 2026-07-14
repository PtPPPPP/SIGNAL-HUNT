import { describe, expect, it } from 'vitest';

import { buildRendererEntry, rendererUrlMatchesRoute } from './route';

describe('Electron renderer route resolution', () => {
  it('uses the dev server URL when one is provided', () => {
    expect(
      buildRendererEntry({
        devServerUrl: 'http://127.0.0.1:5180',
        route: '/admin/pacing',
      }),
    ).toEqual({
      kind: 'url',
      value: 'http://127.0.0.1:5180/#/admin/pacing',
    });
  });

  it('uses a local file and hash route for packaged offline launch', () => {
    expect(
      buildRendererEntry({
        distIndexHtml: 'D:/Program/signal-hunt/dist/index.html',
        route: '/display',
      }),
    ).toEqual({
      kind: 'file',
      value: 'D:/Program/signal-hunt/dist/index.html',
      hash: '/display',
    });
  });

  it('recognizes an already loaded control route without reloading the renderer', () => {
    expect(rendererUrlMatchesRoute('file:///D:/Program/signal-hunt/dist/index.html#/staff', '/staff')).toBe(true);
    expect(rendererUrlMatchesRoute('http://127.0.0.1:5180/#/admin/dashboard', '/admin/dashboard')).toBe(true);
    expect(rendererUrlMatchesRoute('file:///D:/Program/signal-hunt/dist/index.html#/staff', '/admin/dashboard')).toBe(false);
    expect(rendererUrlMatchesRoute('not-a-url', '/staff')).toBe(false);
  });
});

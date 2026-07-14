import type { BrowserWindow } from 'electron';

export function attachWindowSecurity(window: BrowserWindow, devServerUrl?: string): void {
  const allowedOrigins = new Set<string>();

  if (devServerUrl?.trim()) {
    allowedOrigins.add(new URL(devServerUrl).origin);
  }

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (isAllowedNavigation(targetUrl, allowedOrigins)) {
      return;
    }

    event.preventDefault();
  });
}

function isAllowedNavigation(targetUrl: string, allowedOrigins: Set<string>): boolean {
  const target = new URL(targetUrl);

  if (target.protocol === 'file:') {
    return true;
  }

  return allowedOrigins.has(target.origin);
}

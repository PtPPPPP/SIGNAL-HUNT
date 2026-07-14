import { dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';

import type { DesktopSaveResult } from '../../preload/api.types.js';

const CHANNELS = {
  exportCsv: 'desktop:file:export-csv',
  exportJson: 'desktop:file:export-json',
} as const;

type SaveTextFileInput = {
  contents: string;
  defaultFileName: string;
  extension: '.csv' | '.json';
  filters: Electron.FileFilter[];
};

export function registerFileIpc(): void {
  ipcMain.handle(CHANNELS.exportJson, (_event, defaultFileName: string, contents: string) =>
    saveTextFile({
      contents,
      defaultFileName,
      extension: '.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    }),
  );

  ipcMain.handle(CHANNELS.exportCsv, (_event, defaultFileName: string, contents: string) =>
    saveTextFile({
      contents,
      defaultFileName,
      extension: '.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    }),
  );
}

async function saveTextFile({
  contents,
  defaultFileName,
  extension,
  filters,
}: SaveTextFileInput): Promise<DesktopSaveResult> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: ensureExtension(sanitizeFileName(defaultFileName), extension),
    filters,
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  await writeFile(filePath, contents, 'utf8');
  return { canceled: false, filePath };
}

function sanitizeFileName(fileName: string): string {
  const sanitized = fileName
    .trim()
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('');

  return sanitized || 'signal-hunt-export';
}

function ensureExtension(fileName: string, extension: '.csv' | '.json'): string {
  return fileName.toLowerCase().endsWith(extension) ? fileName : `${fileName}${extension}`;
}

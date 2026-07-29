import { useCallback, useEffect, useState } from 'react';

import type { SignalHuntDatabase } from '../../../db/database';
import { clearStructuredLog } from '../../diagnostics/errorLog';
import { sampleFps } from '../../diagnostics/fpsSampler';
import {
  buildDiagnosticExport,
  type DiagnosticLogLevel,
} from '../../diagnostics/diagnosticLogStore';
import {
  collectDiagnosticsSnapshot,
  createEmptyDiagnosticsSnapshot,
} from './diagnosticsViewModel';

export function useDiagnosticsViewModel(
  db: SignalHuntDatabase,
  route: string,
) {
  const [snapshot, setSnapshot] = useState(() =>
    createEmptyDiagnosticsSnapshot(route),
  );
  const [fps, setFps] = useState<number>();
  const [sampling, setSampling] = useState(false);
  const [logLevel, setLogLevel] =
    useState<DiagnosticLogLevel | 'ALL'>('ALL');
  const [logCode, setLogCode] = useState('ALL');
  const [exporting, setExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const gather = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      setSnapshot(await collectDiagnosticsSnapshot({
        db,
        fps,
        logCode,
        logLevel,
        route,
        sampling,
      }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '诊断数据读取失败。');
    } finally {
      setIsLoading(false);
    }
  }, [db, fps, logCode, logLevel, route, sampling]);

  useEffect(() => {
    void gather();
  }, [gather]);

  useEffect(() => {
    const handler = () => void gather();
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
      window.removeEventListener('resize', handler);
    };
  }, [gather]);

  useEffect(() => {
    setSampling(true);
    return sampleFps(1000, (sampled) => {
      setFps(sampled);
      setSampling(false);
    });
  }, []);

  const clearLogs = useCallback(async () => {
    clearStructuredLog();
    await gather();
  }, [gather]);

  const exportLogs = useCallback(async () => {
    setExporting(true);
    try {
      const json = JSON.stringify(await buildDiagnosticExport(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `signal-hunt-diagnostics-${formatExportStamp()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, []);

  return {
    actions: {
      clearLogs,
      exportLogs,
      setLogCode,
      setLogLevel,
    },
    exporting,
    isLoading,
    loadError,
    filters: { logCode, logLevel },
    snapshot,
    refresh: gather,
  };
}

function formatExportStamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

import { useCallback, useEffect, useState } from 'react';

import type { DisplayWindowMode } from '../../../electron/shared/displayWindowMode';
import { Feedback, PageShell, SectionCard } from '../../components/ui/AdminUI';
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  signalHuntDatabase,
  type SignalHuntDatabase,
} from '../../db/database';
import {
  BackupValidationError,
  buildBackup,
  exportBackupString,
  inspectBackup,
  restoreBackup,
  summarizeBackup,
  validateBackupManifest,
  type BackupManifest,
  type BackupSummary,
  type BackupValidationResult,
} from '../../features/admin/backupRestore';
import {
  BackupExportSection,
  BackupRestoreSection,
  RestoreConfirmationDialog,
  WindowModeSection,
} from '../../features/admin/system/SystemSections';
import { logStructured } from '../../features/diagnostics/errorLog';
import { publishAppChange } from '../../features/sync/appSync';
import { getErrorMessage } from '../../lib/errorMessage';
import { AdminLayout } from './AdminLayout';

type AdminSystemPageProps = {
  db?: SignalHuntDatabase;
};

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function timestampForFilename(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export function AdminSystemPage({
  db = signalHuntDatabase,
}: AdminSystemPageProps) {
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const [parsedSummary, setParsedSummary] = useState<BackupSummary | null>(null);
  const [parsedBackup, setParsedBackup] = useState<BackupManifest | null>(null);
  const [validation, setValidation] =
    useState<BackupValidationResult | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [preRestoreBackup, setPreRestoreBackup] =
    useState<BackupManifest | null>(null);
  const [displayWindowMode, setDisplayWindowMode] =
    useState<DisplayWindowMode | null>(null);
  const [displayWindowModeDraft, setDisplayWindowModeDraft] =
    useState<DisplayWindowMode | null>(null);
  const [displayWindowModeLoading, setDisplayWindowModeLoading] =
    useState(false);
  const [displayWindowModeSaving, setDisplayWindowModeSaving] = useState(false);
  const [displayWindowModeMessage, setDisplayWindowModeMessage] = useState('');
  const [displayWindowModeError, setDisplayWindowModeError] = useState('');

  const refreshExport = useCallback(async () => {
    try {
      setExportText(await exportBackupString(db));
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  }, [db]);

  useEffect(() => {
    void refreshExport();
  }, [refreshExport]);

  useEffect(() => {
    const desktopSystem = window.signalHuntDesktop?.system;
    if (!desktopSystem) return;

    let active = true;
    setDisplayWindowModeLoading(true);
    setDisplayWindowModeError('');
    void desktopSystem.getDisplayWindowMode().then(
      (mode) => {
        if (!active) return;
        setDisplayWindowMode(mode);
        setDisplayWindowModeDraft(mode);
        setDisplayWindowModeLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
        setDisplayWindowModeError(
          `读取显示模式失败：${getErrorMessage(cause)}`,
        );
        setDisplayWindowModeLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const handleApplyDisplayWindowMode = async () => {
    const desktopSystem = window.signalHuntDesktop?.system;
    if (!desktopSystem || !displayWindowModeDraft) return;

    setDisplayWindowModeSaving(true);
    setDisplayWindowModeMessage('');
    setDisplayWindowModeError('');
    try {
      const savedMode = await desktopSystem.setDisplayWindowMode(
        displayWindowModeDraft,
      );
      setDisplayWindowMode(savedMode);
      setDisplayWindowModeDraft(savedMode);
      setDisplayWindowModeMessage(
        `显示模式已切换为${displayWindowModeLabel(savedMode)}。`,
      );
    } catch (cause) {
      setDisplayWindowModeError(
        `切换显示模式失败：${getErrorMessage(cause)}`,
      );
    } finally {
      setDisplayWindowModeSaving(false);
    }
  };

  const handleDownload = async () => {
    try {
      const text = await exportBackupString(db);
      setExportText(text);
      downloadText(`signal-hunt-backup-${timestampForFilename()}.json`, text);
      logStructured('BACKUP_EXPORTED', { bytes: text.length });
      setMessage('已导出完整备份文件。');
      setError('');
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const handleParse = async () => {
    setError('');
    setMessage('');
    try {
      const inspection = inspectBackup(importText);
      let report = inspection.validation;
      if (inspection.backup) {
        const protectedEndedEventIds = new Set(
          (
            await db.events.where('status').equals('ENDED').toArray()
          ).map((event) => event.id),
        );
        report = validateBackupManifest(inspection.backup, {
          protectedEndedEventIds,
        });
      }
      setValidation(report);
      setParsedSummary(report.summary);
      setParsedBackup(report.valid ? inspection.backup ?? null : null);
      if (!report.valid) setError('备份存在阻塞错误，不能恢复。');
    } catch (cause) {
      setParsedBackup(null);
      setParsedSummary(null);
      setValidation(null);
      setError(
        cause instanceof BackupValidationError
          ? cause.issues.join('；')
          : getErrorMessage(cause),
      );
    }
  };

  const performRestore = async () => {
    if (!parsedBackup) return;
    setConfirmRestore(false);
    try {
      const snapshot = await buildBackup(db);
      await restoreBackup(db, parsedBackup);
      publishAppChange('CONFIG_UPDATED');
      setPreRestoreBackup(snapshot);
      logStructured('BACKUP_RESTORED', summarizeBackup(parsedBackup));
      setMessage(
        '已恢复备份。当前数据已被替换；可使用“回滚到恢复前”恢复之前的状态。',
      );
      setError('');
      setParsedBackup(null);
      setParsedSummary(null);
      setValidation(null);
      setImportText('');
      await refreshExport();
    } catch (cause) {
      setError(`恢复失败（数据库未改动）：${getErrorMessage(cause)}`);
    }
  };

  const handleRollback = async () => {
    if (!preRestoreBackup) return;
    try {
      await restoreBackup(db, preRestoreBackup);
      publishAppChange('CONFIG_UPDATED');
      logStructured('BACKUP_RESTORED', {
        reason: 'rollback',
        ...summarizeBackup(preRestoreBackup),
      });
      setMessage('已回滚到恢复前的状态。');
      setPreRestoreBackup(null);
      await refreshExport();
    } catch (cause) {
      setError(`回滚失败：${getErrorMessage(cause)}`);
    }
  };

  return (
    <AdminLayout
      title="系统设置"
      db={db}
      hasUnsavedChanges={
        importText.trim().length > 0 ||
        (displayWindowModeDraft !== null &&
          displayWindowModeDraft !== displayWindowMode)
      }
    >
      <PageShell>
        {error ? <Feedback tone="danger">{error}</Feedback> : null}
        {message ? <Feedback tone="success">{message}</Feedback> : null}

        <WindowModeSection
          available={Boolean(window.signalHuntDesktop?.system)}
          currentMode={displayWindowMode}
          draftMode={displayWindowModeDraft}
          error={displayWindowModeError}
          loading={displayWindowModeLoading}
          message={displayWindowModeMessage}
          saving={displayWindowModeSaving}
          onApply={() => void handleApplyDisplayWindowMode()}
          onChange={setDisplayWindowModeDraft}
        />

        <SectionCard title="本机数据">
          <p className="admin-system-database">
            数据库：<strong>{DATABASE_NAME}</strong> · 数据结构版本{' '}
            <strong>{DATABASE_VERSION}</strong>
          </p>
        </SectionCard>

        <BackupExportSection
          exportText={exportText}
          onDownload={() => void handleDownload()}
          onRefresh={() => void refreshExport()}
        />
        <BackupRestoreSection
          canRestore={Boolean(parsedBackup && validation?.valid)}
          hasRollback={Boolean(preRestoreBackup)}
          importText={importText}
          summary={parsedSummary}
          validation={validation}
          onChange={setImportText}
          onParse={() => void handleParse()}
          onRestore={() => setConfirmRestore(true)}
          onRollback={() => void handleRollback()}
        />
      </PageShell>

      <RestoreConfirmationDialog
        open={confirmRestore}
        onCancel={() => setConfirmRestore(false)}
        onConfirm={() => void performRestore()}
      />
    </AdminLayout>
  );
}

function displayWindowModeLabel(mode: DisplayWindowMode): string {
  if (mode === 'WINDOWED') return '窗口模式';
  if (mode === 'FULLSCREEN') return '全屏模式';
  return '展会锁定模式（Kiosk）';
}

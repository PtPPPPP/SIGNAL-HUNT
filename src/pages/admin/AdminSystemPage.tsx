import { useCallback, useEffect, useState } from 'react';

import { DATABASE_NAME, DATABASE_VERSION, signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
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
import { logStructured } from '../../features/diagnostics/errorLog';
import { publishAppChange } from '../../features/sync/appSync';
import { AdminLayout } from './AdminLayout';
import type { DisplayWindowMode } from '../../../electron/shared/displayWindowMode';

type AdminSystemPageProps = {
  db?: SignalHuntDatabase;
};

const DISPLAY_WINDOW_MODE_OPTIONS: ReadonlyArray<{
  value: DisplayWindowMode;
  label: string;
  description: string;
}> = [
  {
    value: 'WINDOWED',
    label: '窗口模式',
    description: '展会大屏使用可移动、可缩放的普通窗口。',
  },
  {
    value: 'FULLSCREEN',
    label: '全屏模式',
    description: '展会大屏占满屏幕，但保留系统级退出全屏能力。',
  },
  {
    value: 'KIOSK',
    label: '展会锁定模式（Kiosk）',
    description: '锁定展会大屏，适合正式布展；后台窗口仍保持普通窗口。',
  },
];

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

export function AdminSystemPage({ db = signalHuntDatabase }: AdminSystemPageProps) {
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const [parsedSummary, setParsedSummary] = useState<BackupSummary | null>(null);
  const [parsedBackup, setParsedBackup] = useState<BackupManifest | null>(null);
  const [validation, setValidation] = useState<BackupValidationResult | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [preRestoreBackup, setPreRestoreBackup] = useState<BackupManifest | null>(null);
  const [displayWindowMode, setDisplayWindowMode] = useState<DisplayWindowMode | null>(null);
  const [displayWindowModeDraft, setDisplayWindowModeDraft] = useState<DisplayWindowMode | null>(null);
  const [displayWindowModeLoading, setDisplayWindowModeLoading] = useState(false);
  const [displayWindowModeSaving, setDisplayWindowModeSaving] = useState(false);
  const [displayWindowModeMessage, setDisplayWindowModeMessage] = useState('');
  const [displayWindowModeError, setDisplayWindowModeError] = useState('');

  const refreshExport = useCallback(async () => {
    try {
      setExportText(await exportBackupString(db));
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }, [db]);

  useEffect(() => {
    void refreshExport();
  }, [refreshExport]);

  useEffect(() => {
    const desktopSystem = window.signalHuntDesktop?.system;
    if (!desktopSystem) {
      return;
    }

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
      (err: unknown) => {
        if (!active) return;
        setDisplayWindowModeError(`读取显示模式失败：${toErrorMessage(err)}`);
        setDisplayWindowModeLoading(false);
      },
    );

    return () => {
      active = false;
    };
  }, []);

  const handleApplyDisplayWindowMode = async () => {
    const desktopSystem = window.signalHuntDesktop?.system;
    if (!desktopSystem || !displayWindowModeDraft) {
      return;
    }

    setDisplayWindowModeSaving(true);
    setDisplayWindowModeMessage('');
    setDisplayWindowModeError('');

    try {
      const savedMode = await desktopSystem.setDisplayWindowMode(displayWindowModeDraft);
      setDisplayWindowMode(savedMode);
      setDisplayWindowModeDraft(savedMode);
      setDisplayWindowModeMessage(`显示模式已切换为${displayWindowModeLabel(savedMode)}。`);
    } catch (err) {
      setDisplayWindowModeError(`切换显示模式失败：${toErrorMessage(err)}`);
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
    } catch (err) {
      setError(toErrorMessage(err));
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
          (await db.events.where('status').equals('ENDED').toArray()).map((event) => event.id),
        );
        report = validateBackupManifest(inspection.backup, { protectedEndedEventIds });
      }

      setValidation(report);
      setParsedSummary(report.summary);
      setParsedBackup(report.valid ? inspection.backup ?? null : null);

      if (!report.valid) {
        setError('备份存在阻塞错误，不能恢复。');
      }
    } catch (err) {
      setParsedBackup(null);
      setParsedSummary(null);
      setValidation(null);

      if (err instanceof BackupValidationError) {
        setError(err.issues.join('；'));
      } else {
        setError(toErrorMessage(err));
      }
    }
  };

  const performRestore = async () => {
    if (!parsedBackup) {
      return;
    }

    setConfirmRestore(false);

    try {
      // Always capture a pre-restore snapshot so the operator can roll back.
      const snapshot = await buildBackup(db);
      await restoreBackup(db, parsedBackup);
      publishAppChange('CONFIG_UPDATED');
      setPreRestoreBackup(snapshot);
      logStructured('BACKUP_RESTORED', summarizeBackup(parsedBackup));
      setMessage('已恢复备份。当前数据已被替换；可使用下方「回滚到恢复前」恢复之前的状态。');
      setError('');
      setParsedBackup(null);
      setParsedSummary(null);
      setValidation(null);
      setImportText('');
      await refreshExport();
    } catch (err) {
      // restoreBackup runs in a single transaction; on failure the DB is unchanged.
      setError(`恢复失败（数据库未改动）：${toErrorMessage(err)}`);
    }
  };

  const handleRollback = async () => {
    if (!preRestoreBackup) {
      return;
    }

    try {
      await restoreBackup(db, preRestoreBackup);
      publishAppChange('CONFIG_UPDATED');
      logStructured('BACKUP_RESTORED', { reason: 'rollback', ...summarizeBackup(preRestoreBackup) });
      setMessage('已回滚到恢复前的状态。');
      setPreRestoreBackup(null);
      await refreshExport();
    } catch (err) {
      setError(`回滚失败：${toErrorMessage(err)}`);
    }
  };

  return (
    <AdminLayout
      title="系统设置"
      db={db}
      hasUnsavedChanges={
        importText.trim().length > 0 ||
        (displayWindowModeDraft !== null && displayWindowModeDraft !== displayWindowMode)
      }
    >
      <section className="admin-form admin-display-mode" aria-label="桌面显示模式">
        <h2>桌面显示模式</h2>
        <p className="admin-helper">此设置只控制展会大屏窗口，不会改变后台控制窗口。</p>
        <label>
          显示模式
          <select
            value={displayWindowModeDraft ?? ''}
            disabled={!window.signalHuntDesktop?.system || displayWindowModeLoading || displayWindowModeSaving}
            onChange={(event) => setDisplayWindowModeDraft(event.target.value as DisplayWindowMode)}
          >
            {!displayWindowModeDraft ? <option value="">请选择显示模式</option> : null}
            {DISPLAY_WINDOW_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="admin-helper">
          {displayWindowModeDraft
            ? DISPLAY_WINDOW_MODE_OPTIONS.find((option) => option.value === displayWindowModeDraft)?.description
            : '正在读取桌面显示模式。'}
        </p>
        <p className="admin-helper">
          当前模式：{displayWindowMode ? displayWindowModeLabel(displayWindowMode) : '未读取'}
        </p>
        <div className="admin-actions">
          <button
            className="admin-button"
            type="button"
            disabled={
              !window.signalHuntDesktop?.system ||
              !displayWindowModeDraft ||
              displayWindowModeDraft === displayWindowMode ||
              displayWindowModeLoading ||
              displayWindowModeSaving
            }
            onClick={() => void handleApplyDisplayWindowMode()}
          >
            {displayWindowModeSaving ? '正在应用' : '应用显示模式'}
          </button>
        </div>
        {!window.signalHuntDesktop?.system ? (
          <p className="admin-helper">当前不是 Electron 桌面环境，不能修改桌面窗口模式。</p>
        ) : null}
        {displayWindowModeError ? (
          <p className="admin-message admin-field-error" role="alert">
            {displayWindowModeError}
          </p>
        ) : null}
        {displayWindowModeMessage ? <p className="admin-message">{displayWindowModeMessage}</p> : null}
      </section>

      <section className="admin-placeholder" aria-label="数据库信息">
        <p>
          数据库：<strong>{DATABASE_NAME}</strong> · 数据结构版本 <strong>{DATABASE_VERSION}</strong>
        </p>
        <p>完整备份包含活动、奖项、抽奖记录、抽奖会话。恢复前会自动生成一次回滚快照。</p>
      </section>

      <section className="admin-grid-two">
        <section className="admin-form">
          <h2>导出完整备份</h2>
          <p className="admin-message">点击下方按钮下载当前全部数据为 JSON 文件。</p>
          <div className="admin-actions">
            <button className="admin-button" type="button" onClick={() => void handleDownload()}>
              下载完整备份
            </button>
            <button className="admin-button secondary" type="button" onClick={() => void refreshExport()}>
              刷新预览
            </button>
          </div>
          <label>
            备份预览
            <textarea value={exportText} readOnly rows={10} />
          </label>
        </section>

        <section className="admin-form">
          <h2>导入 / 恢复备份</h2>
          <label>
            备份 JSON
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              rows={10}
              placeholder="粘贴此前导出的 signal-hunt-backup JSON"
            />
          </label>
          <div className="admin-actions">
            <button className="admin-button" type="button" onClick={() => void handleParse()}>
              解析并预览
            </button>
          </div>

          {parsedSummary ? (
            <div className="admin-message">
              <p>已解析备份：</p>
              <ul>
                <li>版本：{parsedSummary.version}（来源应用版本 {parsedSummary.appVersion}）</li>
                <li>备份时间：{parsedSummary.createdAt}</li>
                <li>
                  活动 {parsedSummary.counts.events} · 奖项 {parsedSummary.counts.prizes} · 记录{' '}
                  {parsedSummary.counts.drawRecords} · 会话 {parsedSummary.counts.drawSessions}
                </li>
                <li>警告 {validation?.warnings.length ?? 0} · 阻塞错误 {validation?.errors.length ?? 0}</li>
              </ul>
              {validation?.errors.length ? (
                <div role="alert">
                  <strong>阻塞错误</strong>
                  <ul>
                    {validation.errors.map((issue) => (
                      <li key={`${issue.code}-${issue.path}-${issue.message}`}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {validation?.warnings.length ? (
                <div>
                  <strong>警告</strong>
                  <ul>
                    {validation.warnings.map((issue) => (
                      <li key={`${issue.code}-${issue.path}-${issue.message}`}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p>恢复将<strong>完全替换</strong>当前全部数据。恢复前会自动生成回滚快照。</p>
              <button
                className="admin-button"
                type="button"
                disabled={!parsedBackup || !validation?.valid}
                onClick={() => setConfirmRestore(true)}
              >
                恢复备份
              </button>
            </div>
          ) : null}

          {confirmRestore ? (
            <div className="confirm-card" role="alertdialog" aria-label="确认恢复备份">
              <p>确认恢复？当前全部数据将被替换（会先自动备份以便回滚）。</p>
              <div className="confirm-card-actions">
                <button className="confirm-button-cancel" type="button" onClick={() => setConfirmRestore(false)}>
                  取消
                </button>
                <button className="confirm-button-ok" type="button" onClick={() => void performRestore()}>
                  确认恢复
                </button>
              </div>
            </div>
          ) : null}

          {preRestoreBackup ? (
            <div className="admin-message">
              <p>当前存在一次恢复前的快照，可回滚：</p>
              <button className="admin-button secondary" type="button" onClick={() => void handleRollback()}>
                回滚到恢复前
              </button>
            </div>
          ) : null}
        </section>
      </section>

      {error ? <p className="admin-message admin-field-error">{error}</p> : null}
      {message ? <p className="admin-message">{message}</p> : null}
    </AdminLayout>
  );
}

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function displayWindowModeLabel(mode: DisplayWindowMode): string {
  return DISPLAY_WINDOW_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

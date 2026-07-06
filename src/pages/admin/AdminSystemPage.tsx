import { useCallback, useEffect, useState } from 'react';

import { DATABASE_NAME, DATABASE_VERSION, signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import {
  BackupValidationError,
  buildBackup,
  exportBackupString,
  parseBackup,
  restoreBackup,
  summarizeBackup,
  type BackupManifest,
  type BackupSummary,
} from '../../features/admin/backupRestore';
import { logStructured } from '../../features/diagnostics/errorLog';
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

export function AdminSystemPage({ db = signalHuntDatabase }: AdminSystemPageProps) {
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const [parsedSummary, setParsedSummary] = useState<BackupSummary | null>(null);
  const [parsedBackup, setParsedBackup] = useState<BackupManifest | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [preRestoreBackup, setPreRestoreBackup] = useState<BackupManifest | null>(null);

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

  const handleParse = () => {
    setError('');
    setMessage('');

    try {
      const backup = parseBackup(importText);
      setParsedBackup(backup);
      setParsedSummary(summarizeBackup(backup));
    } catch (err) {
      setParsedBackup(null);
      setParsedSummary(null);

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
      setPreRestoreBackup(snapshot);
      logStructured('BACKUP_RESTORED', summarizeBackup(parsedBackup));
      setMessage('已恢复备份。当前数据已被替换；可使用下方「回滚到恢复前」恢复之前的状态。');
      setError('');
      setParsedBackup(null);
      setParsedSummary(null);
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
      logStructured('BACKUP_RESTORED', { reason: 'rollback', ...summarizeBackup(preRestoreBackup) });
      setMessage('已回滚到恢复前的状态。');
      setPreRestoreBackup(null);
      await refreshExport();
    } catch (err) {
      setError(`回滚失败：${toErrorMessage(err)}`);
    }
  };

  return (
    <AdminLayout title="系统">
      <section className="admin-placeholder" aria-label="数据库信息">
        <p>
          数据库：<strong>{DATABASE_NAME}</strong> · Schema 版本 <strong>{DATABASE_VERSION}</strong>
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
            <button className="admin-button" type="button" onClick={handleParse}>
              解析并预览
            </button>
          </div>

          {parsedSummary ? (
            <div className="admin-message">
              <p>已解析备份：</p>
              <ul>
                <li>版本：{parsedSummary.version}（来源 App 版本 {parsedSummary.appVersion}）</li>
                <li>备份时间：{parsedSummary.createdAt}</li>
                <li>
                  活动 {parsedSummary.counts.events} · 奖项 {parsedSummary.counts.prizes} · 记录{' '}
                  {parsedSummary.counts.drawRecords} · 会话 {parsedSummary.counts.drawSessions}
                </li>
              </ul>
              <p>恢复将<strong>完全替换</strong>当前全部数据。恢复前会自动生成回滚快照。</p>
              <button className="admin-button" type="button" onClick={() => setConfirmRestore(true)}>
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

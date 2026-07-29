import type { DisplayWindowMode } from '../../../../electron/shared/displayWindowMode';
import {
  Button,
  DangerZone,
  Dialog,
  Feedback,
  Field,
  LoadingState,
  SectionCard,
  Select,
} from '../../../components/ui/AdminUI';
import type {
  BackupSummary,
  BackupValidationResult,
} from '../backupRestore';

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

function getDisplayWindowModeLabel(mode: DisplayWindowMode): string {
  return (
    DISPLAY_WINDOW_MODE_OPTIONS.find((option) => option.value === mode)?.label ??
    mode
  );
}

export function WindowModeSection({
  available,
  currentMode,
  draftMode,
  error,
  loading,
  message,
  saving,
  onApply,
  onChange,
}: {
  available: boolean;
  currentMode: DisplayWindowMode | null;
  draftMode: DisplayWindowMode | null;
  error: string;
  loading: boolean;
  message: string;
  saving: boolean;
  onApply: () => void;
  onChange: (mode: DisplayWindowMode) => void;
}) {
  const description = draftMode
    ? DISPLAY_WINDOW_MODE_OPTIONS.find((option) => option.value === draftMode)
        ?.description
    : '正在读取桌面显示模式。';

  return (
    <SectionCard
      title="窗口设置"
      description="仅控制展会大屏窗口，不改变后台控制窗口。"
    >
      <div id="window" className="admin-system-section-anchor">
        {loading ? <LoadingState title="正在读取显示模式" /> : null}
        <Field label="显示模式" hint={description}>
          <Select
            value={draftMode ?? ''}
            disabled={!available || loading || saving}
            onChange={(event) =>
              onChange(event.target.value as DisplayWindowMode)
            }
          >
            {!draftMode ? <option value="">请选择显示模式</option> : null}
            {DISPLAY_WINDOW_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="admin-section-note">
          当前模式：
          {currentMode ? getDisplayWindowModeLabel(currentMode) : '未读取'}
        </p>
        <div className="admin-form-actions">
          <Button
            loading={saving}
            loadingLabel="正在应用…"
            disabled={
              !available ||
              !draftMode ||
              draftMode === currentMode ||
              loading
            }
            onClick={onApply}
          >
            应用显示模式
          </Button>
        </div>
        {!available ? (
          <Feedback tone="info">
            当前不是 Electron 桌面环境，不能修改桌面窗口模式。
          </Feedback>
        ) : null}
        {error ? <Feedback tone="danger">{error}</Feedback> : null}
        {message ? <Feedback tone="success">{message}</Feedback> : null}
      </div>
    </SectionCard>
  );
}

export function BackupExportSection({
  exportText,
  onDownload,
  onRefresh,
}: {
  exportText: string;
  onDownload: () => void;
  onRefresh: () => void;
}) {
  return (
    <SectionCard
      title="导出完整备份"
      description="包含活动、奖品、抽奖记录和当前抽奖会话。"
      actions={
        <div className="admin-table-actions">
          <Button variant="secondary" onClick={onRefresh}>
            刷新预览
          </Button>
          <Button onClick={onDownload}>下载完整备份</Button>
        </div>
      }
    >
      <Field label="备份预览">
        <textarea
          className="ui-input admin-textarea admin-json-textarea"
          value={exportText}
          readOnly
          rows={10}
        />
      </Field>
    </SectionCard>
  );
}

export function BackupRestoreSection({
  canRestore,
  hasRollback,
  importText,
  summary,
  validation,
  onChange,
  onParse,
  onRestore,
  onRollback,
}: {
  canRestore: boolean;
  hasRollback: boolean;
  importText: string;
  summary: BackupSummary | null;
  validation: BackupValidationResult | null;
  onChange: (value: string) => void;
  onParse: () => void;
  onRestore: () => void;
  onRollback: () => void;
}) {
  return (
    <SectionCard
      title="恢复备份"
      description="先解析和校验，确认无阻塞错误后才能恢复。"
    >
      <div id="backup" className="admin-system-section-anchor">
        <Field label="备份 JSON">
          <textarea
            className="ui-input admin-textarea admin-json-textarea"
            value={importText}
            onChange={(event) => onChange(event.target.value)}
            rows={10}
            placeholder="粘贴此前导出的 signal-hunt-backup JSON"
          />
        </Field>
        <div className="admin-form-actions">
          <Button variant="secondary" onClick={onParse}>
            解析并预览
          </Button>
        </div>

        {summary ? (
          <div className="admin-backup-summary">
            <h3>备份内容</h3>
            <p>
              警告 {validation?.warnings.length ?? 0} · 阻塞错误{' '}
              {validation?.errors.length ?? 0}
            </p>
            <dl className="admin-definition-grid admin-definition-grid--two">
              <div><dt>版本</dt><dd>{summary.version}</dd></div>
              <div><dt>来源应用版本</dt><dd>{summary.appVersion}</dd></div>
              <div><dt>备份时间</dt><dd>{summary.createdAt}</dd></div>
              <div>
                <dt>数据量</dt>
                <dd>
                  活动 {summary.counts.events} · 奖项 {summary.counts.prizes} ·
                  记录 {summary.counts.drawRecords} · 会话{' '}
                  {summary.counts.drawSessions}
                </dd>
              </div>
            </dl>
            {validation?.errors.length ? (
              <Feedback tone="danger">
                <strong>阻塞错误</strong>
                <ul>
                  {validation.errors.map((issue) => (
                    <li key={`${issue.code}-${issue.path}-${issue.message}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </Feedback>
            ) : null}
            {validation?.warnings.length ? (
              <Feedback tone="warning">
                <strong>警告</strong>
                <ul>
                  {validation.warnings.map((issue) => (
                    <li key={`${issue.code}-${issue.path}-${issue.message}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </Feedback>
            ) : null}
          </div>
        ) : null}

        <DangerZone
          title="替换当前全部数据"
          action={
            <Button variant="danger" disabled={!canRestore} onClick={onRestore}>
              恢复备份
            </Button>
          }
        >
          恢复会完全替换当前数据。系统会先生成一次内存回滚快照。
        </DangerZone>

        {hasRollback ? (
          <Feedback tone="warning">
            <div className="admin-backup-rollback">
              <span>当前存在一次恢复前快照。</span>
              <Button variant="secondary" onClick={onRollback}>
                回滚到恢复前
              </Button>
            </div>
          </Feedback>
        ) : null}
      </div>
    </SectionCard>
  );
}

export function RestoreConfirmationDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      role="alertdialog"
      onClose={onCancel}
      title="确认恢复备份"
      description="当前活动、奖池、抽奖记录和会话将被完全替换。"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            确认恢复
          </Button>
        </>
      }
    >
      <p>恢复前会自动生成一次回滚快照；恢复事务失败时数据库不会改变。</p>
    </Dialog>
  );
}

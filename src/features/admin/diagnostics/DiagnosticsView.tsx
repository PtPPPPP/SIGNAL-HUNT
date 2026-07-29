import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Feedback,
  Field,
  Input,
  LoadingState,
  MetricCard,
  PageShell,
  SectionCard,
  Select,
  StatusBadge,
  type BadgeTone,
} from '../../../components/ui/AdminUI';
import { DATABASE_NAME } from '../../../db/database';
import {
  DRAW_STATUS_LABELS,
  EVENT_STATUS_LABELS,
  formatAdminDateTime,
} from '../statusLabels';
import type { DiagnosticLogLevel } from '../../diagnostics/diagnosticLogStore';
import {
  formatDiagnosticBytes,
  type DiagnosticsSnapshot,
  type PreflightStatus,
} from './diagnosticsViewModel';

type DiagnosticsViewProps = {
  actions: {
    clearLogs: () => Promise<void>;
    exportLogs: () => Promise<void>;
    setLogCode: (value: string) => void;
    setLogLevel: (value: DiagnosticLogLevel | 'ALL') => void;
  };
  exporting: boolean;
  filters: {
    logCode: string;
    logLevel: DiagnosticLogLevel | 'ALL';
  };
  snapshot: DiagnosticsSnapshot;
  isLoading: boolean;
  loadError: string;
  refresh: () => Promise<void>;
};

export function DiagnosticsView({
  actions,
  exporting,
  filters,
  isLoading,
  loadError,
  refresh,
  snapshot,
}: DiagnosticsViewProps) {
  if (isLoading) {
    return <PageShell><LoadingState title="正在收集诊断数据" /></PageShell>;
  }
  if (loadError) {
    return (
      <PageShell>
        <ErrorState
          title="诊断数据读取失败"
          description={loadError}
          action={<Button onClick={() => void refresh()}>重新加载</Button>}
        />
      </PageShell>
    );
  }
  const { app, environment, database, draw, visual, storage } = snapshot;

  return (
    <PageShell>
      <Feedback tone="warning">
        本页仅供现场工作人员排查使用，请勿向访客展示。
      </Feedback>

      <SectionCard
        title="现场运行自检"
        actions={
          <StatusBadge tone={snapshot.preflight.ready ? 'success' : 'danger'}>
            {snapshot.preflight.ready ? '已就绪' : '未就绪'}
          </StatusBadge>
        }
      >
        {snapshot.sections.prizes.status === 'error' ||
        snapshot.sections.brand.status === 'error' ? (
          <Feedback tone="danger">
            部分预检数据读取失败，其他诊断结果仍可使用。
          </Feedback>
        ) : null}
        <DataTable label="现场运行自检">
          <table>
            <thead>
              <tr><th>检查项</th><th>结果</th><th>说明</th></tr>
            </thead>
            <tbody>
              {snapshot.preflight.checks.map((check) => (
                <tr key={check.id}>
                  <th scope="row">{check.label}</th>
                  <td>
                    <StatusBadge tone={toneForPreflight(check.status)}>
                      {labelForPreflight(check.status)}
                    </StatusBadge>
                  </td>
                  <td>{check.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </SectionCard>

      <section className="admin-metric-grid" aria-label="诊断概要">
        <MetricCard label="应用版本" value={app.version} />
        <MetricCard
          label="构建模式"
          value={app.mode === 'production' ? '生产' : '开发'}
          tone={app.mode === 'production' ? 'success' : 'warning'}
        />
        <MetricCard label="当前路由" value={app.route} />
        <MetricCard
          label="网络"
          value={environment.online ? '在线' : '离线'}
          tone="info"
        />
        <MetricCard label="视口" value={environment.viewport} />
        <MetricCard
          label="数据库"
          value={database.ok ? `正常 · v${database.schemaVersion}` : '异常'}
          tone={database.ok ? 'success' : 'danger'}
        />
        <MetricCard
          label="采样帧率"
          value={
            visual.fpsSampling
              ? '采样中…'
              : visual.fps != null
                ? visual.fps
                : '—'
          }
        />
      </section>

      <section className="admin-two-column">
        <DetailSection
          title="环境"
          rows={[
            ['视口', environment.viewport],
            ['设备像素比', String(environment.dpr)],
            ['网络', environment.online ? '在线' : '离线'],
            ['IndexedDB', environment.indexedDbAvailable ? '可用' : '不可用'],
            ['设备内存', environment.deviceMemory != null ? `${environment.deviceMemory} GB` : '不可用'],
            ['JS 堆已用', environment.jsHeapUsed != null ? formatDiagnosticBytes(environment.jsHeapUsed) : '不可用'],
            ['JS 堆上限', environment.jsHeapLimit != null ? formatDiagnosticBytes(environment.jsHeapLimit) : '不可用'],
            ['浏览器标识', environment.userAgent],
          ]}
        />
        <DetailSection
          title="数据库"
          error={snapshot.sections.database.error}
          rows={[
            ['数据库名', DATABASE_NAME],
            ['数据结构版本', String(database.schemaVersion)],
            ['状态', database.ok ? '正常' : `异常：${database.error ?? '未知'}`],
            ['活动数量', String(database.counts.events)],
            ['奖项数量', String(database.counts.prizes)],
            ['记录数量', String(database.counts.records)],
            ['会话数量', String(database.counts.sessions)],
          ]}
        />
        <DetailSection
          title="抽奖状态"
          error={snapshot.sections.draw.error}
          rows={[
            [
              '当前活动',
              draw.activeEvent
                ? `${draw.activeEvent.name} (${draw.activeEvent.code}) · ${eventStatusLabel(draw.activeEvent.status)}`
                : '无激活活动',
            ],
            ['未结束会话', draw.hasActiveSession ? `是 · ${draw.activeSessionRecordId ?? ''}` : '无'],
            [
              '最新提交记录',
              draw.latestRecord
                ? `${draw.latestRecord.prizeName} · ${drawStatusLabel(draw.latestRecord.status)}`
                : '无',
            ],
            [
              '最新揭示结果',
              draw.latestRevealed
                ? `${draw.latestRevealed.prizeName} · ${formatAdminDateTime(draw.latestRevealed.revealedAt)}`
                : '无',
            ],
          ]}
        />
        <DetailSection
          title="视觉与渲染"
          rows={[
            ['画布实时帧率', visual.canvas.fps > 0 ? String(visual.canvas.fps) : '—'],
            ['画布显示尺寸', visual.canvas.cssWidth ? `${visual.canvas.cssWidth}×${visual.canvas.cssHeight}` : '—'],
            ['画布缓冲区', visual.canvas.backingWidth ? `${visual.canvas.backingWidth}×${visual.canvas.backingHeight}` : '—'],
            ['动画循环', visual.canvas.rafRunning ? '运行中' : '已暂停 / 未启动'],
            ['画布已挂载', visual.canvasPresent ? '是' : '否'],
            ['WebGL 支持', visual.webgl ? '是' : '否'],
            ['减弱动效', visual.reducedMotion ? '已开启' : '未开启'],
          ]}
        />
        <DetailSection
          title="存储"
          error={snapshot.sections.storage.error}
          rows={[
            ['空间估算', storage.supported ? '可用' : '不可用'],
            ['已用估算', storage.usage != null ? formatDiagnosticBytes(storage.usage) : '不可用'],
            ['配额估算', storage.quota != null ? formatDiagnosticBytes(storage.quota) : '不可用'],
          ]}
        />
      </section>

      <SectionCard title="诊断日志" description="持久化保留最近 500 条">
        {snapshot.sections.log.status === 'error' ? (
          <Feedback tone="danger">
            诊断日志读取失败：{snapshot.sections.log.error}
          </Feedback>
        ) : null}
        <div className="admin-log-toolbar">
          <Field label="日志级别">
            <Select
              value={filters.logLevel}
              onChange={(event) =>
                actions.setLogLevel(
                  event.target.value as DiagnosticLogLevel | 'ALL',
                )
              }
            >
              <option value="ALL">全部级别</option>
              <option value="error">错误</option>
              <option value="warn">警告</option>
              <option value="info">信息</option>
            </Select>
          </Field>
          <Field label="错误代码">
            <Input
              value={filters.logCode === 'ALL' ? '' : filters.logCode}
              placeholder="留空为全部"
              onChange={(event) =>
                actions.setLogCode(event.target.value.trim() || 'ALL')
              }
            />
          </Field>
          <Button
            loading={exporting}
            loadingLabel="导出中…"
            onClick={() => void actions.exportLogs()}
          >
            导出诊断日志
          </Button>
          <Button
            variant="secondary"
            onClick={() => void actions.clearLogs()}
          >
            清空日志
          </Button>
        </div>
        {snapshot.log.length ? (
          <DataTable label="诊断日志">
            <table>
              <thead>
                <tr><th>时间</th><th>级别</th><th>代码</th><th>消息</th><th>技术上下文</th></tr>
              </thead>
              <tbody>
                {snapshot.log.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatAdminDateTime(entry.timestamp)}</td>
                    <td>{entry.level === 'error' ? '错误' : entry.level === 'warn' ? '警告' : '信息'}</td>
                    <td>{entry.code}</td>
                    <td>{entry.message}</td>
                    <td>{entry.context ? JSON.stringify(entry.context) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        ) : (
          <EmptyState title="所选条件下暂无日志" />
        )}
      </SectionCard>
    </PageShell>
  );
}

function DetailSection({
  error,
  rows,
  title,
}: {
  error?: string;
  rows: Array<[string, string]>;
  title: string;
}) {
  return (
    <SectionCard title={title}>
      {error ? <Feedback tone="danger">本项读取失败：{error}</Feedback> : null}
      <dl className="admin-diagnostic-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

function toneForPreflight(status: PreflightStatus): BadgeTone {
  if (status === 'pass') return 'success';
  if (status === 'fail') return 'danger';
  if (status === 'warn') return 'warning';
  return 'info';
}

function labelForPreflight(status: PreflightStatus): string {
  if (status === 'pass') return '通过';
  if (status === 'fail') return '失败';
  if (status === 'warn') return '警告';
  return '信息';
}

function eventStatusLabel(status: string): string {
  return status in EVENT_STATUS_LABELS
    ? EVENT_STATUS_LABELS[status as keyof typeof EVENT_STATUS_LABELS]
    : status;
}

function drawStatusLabel(status: string): string {
  return status in DRAW_STATUS_LABELS
    ? DRAW_STATUS_LABELS[status as keyof typeof DRAW_STATUS_LABELS]
    : status;
}

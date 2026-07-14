import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { AdminButton } from '../../components/ui/AdminUI';
import { signalHuntDatabase, type SignalHuntDatabase, DATABASE_NAME, DATABASE_VERSION } from '../../db/database';
import { getActiveEvent, recoverCommittedDraw } from '../../db/drawRepository';
import { clearStructuredLog } from '../../features/diagnostics/errorLog';
import {
  buildDiagnosticExport,
  readLogs,
  type DiagnosticLogLevel,
  type DiagnosticLogRecord,
} from '../../features/diagnostics/diagnosticLogStore';
import { readCanvasMetrics, type CanvasMetrics } from '../../visual/signal-engine/canvasDiagnostics';
import { BRAND_ASSETS } from '../../features/brand/brandAssets';
import { DRAW_STATUS_LABELS, EVENT_STATUS_LABELS, formatAdminDateTime } from '../../features/admin/statusLabels';
import { AdminLayout } from './AdminLayout';

type AdminDiagnosticsPageProps = {
  db?: SignalHuntDatabase;
};

type DrawSnapshot = {
  activeEvent?: { id: string; name: string; code: string; status: string };
  hasActiveSession: boolean;
  activeSessionRecordId?: string;
  latestRecord?: { id: string; prizeName: string; status: string; committedAt: string };
  latestRevealed?: { id: string; prizeName: string; revealedAt?: string };
};

type DatabaseSnapshot = {
  ok: boolean;
  error?: string;
  schemaVersion: number;
  counts: { events: number; prizes: number; records: number; sessions: number };
};

type StorageSnapshot = {
  supported: boolean;
  usage?: number;
  quota?: number;
};

type VisualSnapshot = {
  webgl: boolean;
  reducedMotion: boolean;
  canvasPresent: boolean;
  fps?: number;
  fpsSampling: boolean;
  canvas: CanvasMetrics;
};

type EnvironmentSnapshot = {
  viewport: string;
  dpr: number;
  online: boolean;
  indexedDbAvailable: boolean;
  userAgent: string;
  deviceMemory?: number;
  jsHeapUsed?: number;
  jsHeapLimit?: number;
};

type PrizeSummary = {
  total: number;
  enabledWithRemaining: number;
  inventoryViolations: string[];
};

type PreflightStatus = 'pass' | 'fail' | 'warn' | 'info';

type PreflightCheck = {
  id: string;
  label: string;
  status: PreflightStatus;
  detail?: string;
};

type PreflightSnapshot = {
  ready: boolean;
  checks: PreflightCheck[];
};

type Snapshot = {
  app: { version: string; mode: string; route: string };
  environment: EnvironmentSnapshot;
  database: DatabaseSnapshot;
  draw: DrawSnapshot;
  visual: VisualSnapshot;
  storage: StorageSnapshot;
  preflight: PreflightSnapshot;
  log: DiagnosticLogRecord[];
};

const initialCanvasMetrics: CanvasMetrics = {
  fps: 0,
  cssWidth: 0,
  cssHeight: 0,
  backingWidth: 0,
  backingHeight: 0,
  dpr: 0,
  cappedDpr: 0,
  maxDpr: 0,
  rafRunning: false,
  visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
  updatedAt: '',
};

const emptySnapshot: Snapshot = {
  app: { version: __APP_VERSION__, mode: import.meta.env.MODE, route: '/' },
  environment: {
    viewport: '—',
    dpr: 1,
    online: true,
    indexedDbAvailable: false,
    userAgent: '—',
  },
  database: { ok: false, schemaVersion: DATABASE_VERSION, counts: { events: 0, prizes: 0, records: 0, sessions: 0 } },
  draw: { hasActiveSession: false },
  visual: { webgl: false, reducedMotion: false, canvasPresent: false, fpsSampling: false, canvas: initialCanvasMetrics },
  storage: { supported: false },
  preflight: { ready: false, checks: [] },
  log: [],
};

function sampleFps(durationMs: number, onSample: (fps: number) => void): () => void {
  if (typeof requestAnimationFrame !== 'function') {
    onSample(0);

    return () => {};
  }

  let frames = 0;
  let cancelled = false;
  const start = performance.now();

  const tick = () => {
    if (cancelled) {
      return;
    }

    frames += 1;

    if (performance.now() - start < durationMs) {
      requestAnimationFrame(tick);
    } else {
      onSample(Math.max(0, Math.round((frames * 1000) / durationMs)));
    }
  };

  requestAnimationFrame(tick);

  return () => {
    cancelled = true;
  };
}

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');

    return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

async function gatherDatabase(db: SignalHuntDatabase): Promise<DatabaseSnapshot> {
  try {
    const [events, prizes, records, sessions] = await Promise.all([
      db.events.count(),
      db.prizes.count(),
      db.drawRecords.count(),
      db.drawSessions.count(),
    ]);

    return {
      ok: true,
      schemaVersion: DATABASE_VERSION,
      counts: { events, prizes, records, sessions },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      schemaVersion: DATABASE_VERSION,
      counts: { events: 0, prizes: 0, records: 0, sessions: 0 },
    };
  }
}

async function gatherDraw(db: SignalHuntDatabase): Promise<DrawSnapshot> {
  const activeEvent = await getActiveEvent(db);

  if (!activeEvent) {
    const latest = await db.drawRecords.orderBy('committedAt').reverse().first();

    return {
      hasActiveSession: false,
      latestRecord: latest
        ? { id: latest.id, prizeName: latest.prizeNameSnapshot, status: latest.status, committedAt: latest.committedAt }
        : undefined,
    };
  }

  const recovered = await recoverCommittedDraw(db, activeEvent.id);
  const latest = await db.drawRecords.orderBy('committedAt').reverse().first();
  const revealedRecords = (await db.drawRecords.toArray())
    .filter((record) => record.status === 'REVEALED' || record.status === 'REDEEMED')
    .sort((left, right) => (right.revealedAt ?? '').localeCompare(left.revealedAt ?? ''));
  const latestRevealed = revealedRecords[0];

  return {
    activeEvent: { id: activeEvent.id, name: activeEvent.name, code: activeEvent.code, status: activeEvent.status },
    hasActiveSession: Boolean(recovered),
    activeSessionRecordId: recovered?.record.id,
    latestRecord: latest
      ? { id: latest.id, prizeName: latest.prizeNameSnapshot, status: latest.status, committedAt: latest.committedAt }
      : undefined,
    latestRevealed: latestRevealed
      ? { id: latestRevealed.id, prizeName: latestRevealed.prizeNameSnapshot, revealedAt: latestRevealed.revealedAt }
      : undefined,
  };
}

async function gatherStorage(): Promise<StorageSnapshot> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { supported: false };
  }

  try {
    const estimate = await navigator.storage.estimate();

    return { supported: true, usage: estimate.usage, quota: estimate.quota };
  } catch {
    return { supported: false };
  }
}

function gatherEnvironment(): EnvironmentSnapshot {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  const nav = navigator as Navigator & { deviceMemory?: number };

  return {
    viewport: typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '—',
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    indexedDbAvailable: typeof indexedDB !== 'undefined',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '—',
    deviceMemory: nav.deviceMemory,
    jsHeapUsed: memory?.usedJSHeapSize,
    jsHeapLimit: memory?.jsHeapSizeLimit,
  };
}

/**
 * Reads the prize table once for the preflight panel: how many prizes exist,
 * how many are enabled with remaining stock, and any inventory that violates
 * `0 <= remaining <= total`. Kept separate from gatherDatabase (which only
 * counts) so a failure here never breaks the core metrics.
 */
async function gatherPrizeSummary(db: SignalHuntDatabase): Promise<PrizeSummary> {
  try {
    const prizes = await db.prizes.toArray();
    const inventoryViolations = prizes
      .filter((prize) => prize.inventoryRemaining < 0 || prize.inventoryRemaining > prize.inventoryTotal)
      .map((prize) => `${prize.shortName ?? prize.id}: ${prize.inventoryRemaining}/${prize.inventoryTotal}`);

    return {
      total: prizes.length,
      enabledWithRemaining: prizes.filter((prize) => prize.enabled && prize.inventoryRemaining > 0).length,
      inventoryViolations,
    };
  } catch {
    return { total: 0, enabledWithRemaining: 0, inventoryViolations: [] };
  }
}

/** Loads the real image URL so file:// packaged builds are checked correctly. */
async function checkLogoAsset(): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = BRAND_ASSETS.logo;
  });
}

/**
 * Composes already-gathered snapshot data into a single readiness verdict.
 * `ready` is true iff no check has status 'fail'. Warnings (e.g. an unfinished
 * session, dev mode) do not block but must be reviewed by staff.
 *
 * Offline is NOT a failure: the app is local-first (AGENTS.md §5), so the
 * network row is informational only.
 */
function computePreflight(args: {
  database: DatabaseSnapshot;
  draw: DrawSnapshot;
  prizeSummary: PrizeSummary;
  logoOk: boolean;
  online: boolean;
}): PreflightSnapshot {
  const { database, draw, prizeSummary, logoOk, online } = args;
  const checks: PreflightCheck[] = [
    {
      id: 'build',
      label: '生产构建',
      status: import.meta.env.PROD ? 'pass' : 'warn',
      detail: import.meta.env.PROD ? '生产模式' : `当前为开发模式（现场应使用生产构建）`,
    },
    {
      id: 'logo',
      label: '品牌 Logo 资源',
      status: logoOk ? 'pass' : 'fail',
      detail: logoOk ? 'Quantum Design Logo 可访问' : 'Quantum Design Logo 缺失或不可访问',
    },
    {
      id: 'database',
      label: '数据库可访问',
      status: database.ok ? 'pass' : 'fail',
      detail: database.ok ? `v${database.schemaVersion}` : `异常：${database.error ?? '未知'}`,
    },
    {
      id: 'activeEvent',
      label: '存在已激活活动',
      status: draw.activeEvent ? 'pass' : 'fail',
      detail: draw.activeEvent
        ? `${draw.activeEvent.name} (${draw.activeEvent.code})`
        : '无激活活动，请在 /admin/event 激活',
    },
    {
      id: 'enabledPrizes',
      label: '至少一个启用且有库存的奖项',
      status: prizeSummary.enabledWithRemaining > 0 ? 'pass' : 'fail',
      detail: `${prizeSummary.enabledWithRemaining} 个启用且有库存（共 ${prizeSummary.total} 个奖项）`,
    },
    {
      id: 'inventory',
      label: '库存数据一致',
      status: prizeSummary.inventoryViolations.length === 0 ? 'pass' : 'fail',
      detail:
        prizeSummary.inventoryViolations.length === 0
          ? '全部奖项库存正常'
          : `违规：${prizeSummary.inventoryViolations.join('；')}`,
    },
    {
      id: 'activeSession',
      label: '无未结束中奖会话',
      status: draw.hasActiveSession ? 'warn' : 'pass',
      detail: draw.hasActiveSession
        ? `存在未结束会话 ${draw.activeSessionRecordId ?? ''}，开展前请确认处理`
        : '无',
    },
    {
      id: 'network',
      label: '网络状态（离线可用，仅供参考）',
      status: 'info',
      detail: online ? '在线' : '离线（本系统本地优先，离线可正常抽奖）',
    },
  ];

  return { ready: checks.every((check) => check.status !== 'fail'), checks };
}

export function AdminDiagnosticsPage({ db = signalHuntDatabase }: AdminDiagnosticsPageProps) {
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<Snapshot>({
    ...emptySnapshot,
    app: { ...emptySnapshot.app, route: location.pathname },
  });
  const [fps, setFps] = useState<number | undefined>(undefined);
  const [sampling, setSampling] = useState(false);
  const [logLevel, setLogLevel] = useState<DiagnosticLogLevel | 'ALL'>('ALL');
  const [logCode, setLogCode] = useState('ALL');
  const [exporting, setExporting] = useState(false);

  const gather = useCallback(async () => {
    const [database, draw, storage, prizeSummary, logoOk] = await Promise.all([
      gatherDatabase(db),
      gatherDraw(db),
      gatherStorage(),
      gatherPrizeSummary(db),
      checkLogoAsset(),
    ]);
    const environment = gatherEnvironment();
    const log = await readLogs({
      level: logLevel === 'ALL' ? undefined : logLevel,
      code: logCode === 'ALL' ? undefined : logCode,
    });

    setSnapshot({
      app: { version: __APP_VERSION__, mode: import.meta.env.MODE, route: location.pathname },
      environment,
      database,
      draw,
      visual: {
        webgl: detectWebGL(),
        reducedMotion:
          typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        canvasPresent: typeof document !== 'undefined' && document.getElementsByTagName('canvas').length > 0,
        fps,
        fpsSampling: sampling,
        canvas: readCanvasMetrics(),
      },
      storage,
      preflight: computePreflight({ database, draw, prizeSummary, logoOk, online: environment.online }),
      log,
    });
  }, [db, location.pathname, fps, sampling, logLevel, logCode]);

  const handleClearLogs = useCallback(async () => {
    clearStructuredLog();
    await gather();
  }, [gather]);

  const handleExportLogs = useCallback(async () => {
    setExporting(true);
    try {
      const bundle = await buildDiagnosticExport();
      const json = JSON.stringify(bundle, null, 2);
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

  useEffect(() => {
    void gather();
  }, [gather]);

  // Refresh on online/offline and viewport changes (kiosk may be rotated / resized).
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

  // Sample FPS for ~1s once on mount.
  useEffect(() => {
    setSampling(true);
    const stop = sampleFps(1000, (sampled) => {
      setFps(sampled);
      setSampling(false);
    });

    return stop;
  }, []);

  const { app, environment, database, draw, visual, storage } = snapshot;

  return (
    <AdminLayout title="系统诊断" db={db}>
      <p className="admin-message">本页仅供现场工作人员排查使用，请勿向访客展示。</p>

      <section className="admin-table-wrap">
        <h2>现场运行自检</h2>
        <p className="admin-message">
          <strong>{snapshot.preflight.ready ? '✅ 就绪' : '⛔ 未就绪'}</strong>
          {snapshot.preflight.ready
            ? '：关键检查全部通过（警告项仍需现场复核）。'
            : '：存在阻塞性问题，开展前必须解决。'}
        </p>
        <table className="admin-table">
          <thead>
            <tr>
              <th>检查项</th>
              <th>结果</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.preflight.checks.map((check) => (
              <tr key={check.id}>
                <th scope="row">{check.label}</th>
                <td>
                  {check.status === 'pass'
                    ? '✓ 通过'
                    : check.status === 'fail'
                      ? '✗ 失败'
                      : check.status === 'warn'
                        ? '⚠ 警告'
                        : '· 信息'}
                </td>
                <td>{check.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="admin-metric-grid">
        <MetricCard label="应用版本" value={app.version} />
        <MetricCard label="构建模式" value={app.mode === 'production' ? '生产模式' : '开发模式'} />
        <MetricCard label="当前路由" value={app.route} />
        <MetricCard label="在线状态" value={environment.online ? '在线' : '离线'} />
        <MetricCard label="视口" value={environment.viewport} />
        <MetricCard label="设备像素比" value={String(environment.dpr)} />
        <MetricCard
          label="数据库"
          value={database.ok ? `正常 · v${database.schemaVersion}` : '异常'}
        />
        <MetricCard label="画面帧率" value={visual.fpsSampling ? '采样中…' : visual.fps != null ? String(visual.fps) : '—'} />
      </div>

      <section className="admin-table-wrap">
        <h2>环境</h2>
        <table className="admin-table">
          <tbody>
            <Row label="视口" value={environment.viewport} />
            <Row label="设备像素比" value={String(environment.dpr)} />
            <Row label="网络" value={environment.online ? '在线' : '离线'} />
            <Row label="IndexedDB 可用" value={environment.indexedDbAvailable ? '是' : '否'} />
            <Row label="设备内存" value={environment.deviceMemory != null ? `${environment.deviceMemory} GB` : '不可用'} />
            <Row label="JS 堆已用" value={environment.jsHeapUsed != null ? formatBytes(environment.jsHeapUsed) : '不可用'} />
            <Row label="JS 堆上限" value={environment.jsHeapLimit != null ? formatBytes(environment.jsHeapLimit) : '不可用'} />
            <Row label="浏览器标识（技术详情）" value={environment.userAgent} />
          </tbody>
        </table>
      </section>

      <section className="admin-table-wrap">
        <h2>数据库</h2>
        <table className="admin-table">
          <tbody>
            <Row label="数据库名" value={DATABASE_NAME} />
            <Row label="数据结构版本" value={String(database.schemaVersion)} />
            <Row label="状态" value={database.ok ? '正常' : `异常：${database.error ?? '未知'}`} />
            <Row label="活动数量" value={String(database.counts.events)} />
            <Row label="奖项数量" value={String(database.counts.prizes)} />
            <Row label="记录数量" value={String(database.counts.records)} />
            <Row label="会话数量" value={String(database.counts.sessions)} />
          </tbody>
        </table>
      </section>

      <section className="admin-table-wrap">
        <h2>抽奖状态</h2>
        <table className="admin-table">
          <tbody>
            <Row label="当前活动" value={draw.activeEvent ? `${draw.activeEvent.name} (${draw.activeEvent.code}) · ${eventStatusLabel(draw.activeEvent.status)}` : '无激活活动'} />
            <Row label="未结束中奖会话" value={draw.hasActiveSession ? `是 · ${draw.activeSessionRecordId ?? ''}` : '无'} />
            <Row label="最新提交记录" value={draw.latestRecord ? `${draw.latestRecord.prizeName} · ${drawStatusLabel(draw.latestRecord.status)}` : '无'} />
            <Row label="最新揭示结果" value={draw.latestRevealed ? `${draw.latestRevealed.prizeName} · ${formatAdminDateTime(draw.latestRevealed.revealedAt)}` : '无'} />
          </tbody>
        </table>
      </section>

      <section className="admin-table-wrap">
        <h2>视觉 / 渲染</h2>
        <table className="admin-table">
          <tbody>
            <Row label="画布实时帧率" value={visual.canvas.fps > 0 ? String(visual.canvas.fps) : '—'} />
            <Row label="一秒采样帧率" value={visual.fpsSampling ? '采样中…' : visual.fps != null ? String(visual.fps) : '不可用'} />
            <Row label="画布显示尺寸" value={visual.canvas.cssWidth ? `${visual.canvas.cssWidth}×${visual.canvas.cssHeight}` : '—'} />
            <Row label="画布缓冲区尺寸" value={visual.canvas.backingWidth ? `${visual.canvas.backingWidth}×${visual.canvas.backingHeight}` : '—'} />
            <Row label="设备像素比" value={visual.canvas.dpr ? String(visual.canvas.dpr) : '—'} />
            <Row label="限制后的像素比" value={visual.canvas.maxDpr ? `${visual.canvas.cappedDpr} / ${visual.canvas.maxDpr}` : '—'} />
            <Row label="动画循环" value={visual.canvas.rafRunning ? '运行中' : '已暂停 / 未启动'} />
            <Row label="页面可见性" value={visual.canvas.visibilityState} />
            <Row label="画布已挂载" value={visual.canvasPresent ? '是' : '否'} />
            <Row label="WebGL 支持" value={visual.webgl ? '是' : '否'} />
            <Row label="减弱动效" value={visual.reducedMotion ? '已开启' : '未开启'} />
          </tbody>
        </table>
      </section>

      <section className="admin-table-wrap">
        <h2>存储</h2>
        <table className="admin-table">
          <tbody>
            <Row label="存储空间估算" value={storage.supported ? '可用' : '不可用'} />
            <Row label="已用估算" value={storage.usage != null ? formatBytes(storage.usage) : '不可用'} />
            <Row label="配额估算" value={storage.quota != null ? formatBytes(storage.quota) : '不可用'} />
          </tbody>
        </table>
      </section>

      <section className="admin-table-wrap">
        <h2>诊断日志（持久化，最多 500 条）</h2>
        <div className="admin-filter-row">
          <label>
            日志级别
            <select value={logLevel} onChange={(event) => setLogLevel(event.target.value as DiagnosticLogLevel | 'ALL')}>
              <option value="ALL">全部级别</option>
              <option value="error">错误</option>
              <option value="warn">警告</option>
              <option value="info">信息</option>
            </select>
          </label>
          <label>
            错误代码
            <input
              value={logCode === 'ALL' ? '' : logCode}
              placeholder="例如 DATABASE_ERROR，留空为全部"
              onChange={(event) => setLogCode(event.target.value.trim() || 'ALL')}
            />
          </label>
          <AdminButton onClick={() => void handleExportLogs()} disabled={exporting}>
            {exporting ? '导出中…' : '导出诊断日志'}
          </AdminButton>
          <AdminButton variant="secondary" onClick={() => void handleClearLogs()}>
            清空日志
          </AdminButton>
        </div>
        {snapshot.log.length === 0 ? (
          <p className="admin-message">暂无日志（所选筛选条件下）。</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>级别</th>
                <th>代码</th>
                <th>消息</th>
                <th>技术上下文</th>
              </tr>
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
        )}
      </section>
    </AdminLayout>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="admin-metric">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{value}</td>
    </tr>
  );
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Local-time stamp for the export filename: signal-hunt-diagnostics-YYYYMMDD-HHmmss.json. */
function formatExportStamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');

  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { signalHuntDatabase, type SignalHuntDatabase, DATABASE_NAME, DATABASE_VERSION } from '../../db/database';
import { getActiveEvent, recoverCommittedDraw } from '../../db/drawRepository';
import { readStructuredLog, type LogEntry } from '../../features/diagnostics/errorLog';
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
  log: LogEntry[];
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
  visual: { webgl: false, reducedMotion: false, canvasPresent: false, fpsSampling: false },
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

/** Probes the brand logo via HEAD so the preflight can flag a missing asset. */
async function checkLogoAsset(): Promise<boolean> {
  if (typeof fetch !== 'function') {
    return false;
  }

  try {
    const response = await fetch('/brand/quantum-design-logo.png', { method: 'HEAD', cache: 'no-store' });

    return response.ok;
  } catch {
    return false;
  }
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
      detail: import.meta.env.PROD ? 'production' : `当前 ${import.meta.env.MODE}（现场应使用生产构建）`,
    },
    {
      id: 'logo',
      label: '品牌 Logo 资源',
      status: logoOk ? 'pass' : 'fail',
      detail: logoOk ? '/brand/quantum-design-logo.png 可访问' : 'Logo 缺失或不可访问',
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
      label: '库存一致（0 ≤ remaining ≤ total）',
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

  const gather = useCallback(async () => {
    const [database, draw, storage, prizeSummary, logoOk] = await Promise.all([
      gatherDatabase(db),
      gatherDraw(db),
      gatherStorage(),
      gatherPrizeSummary(db),
      checkLogoAsset(),
    ]);
    const environment = gatherEnvironment();

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
      },
      storage,
      preflight: computePreflight({ database, draw, prizeSummary, logoOk, online: environment.online }),
      log: readStructuredLog(),
    });
  }, [db, location.pathname, fps, sampling]);

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
    <AdminLayout title="诊断">
      <p className="admin-message">本页仅供现场工作人员排查使用，请勿向访客展示。</p>

      <section className="admin-table-wrap">
        <h2>现场自检 / Preflight</h2>
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
        <MetricCard label="App 版本" value={app.version} />
        <MetricCard label="构建模式" value={app.mode} />
        <MetricCard label="当前路由" value={app.route} />
        <MetricCard label="在线状态" value={environment.online ? '在线' : '离线'} />
        <MetricCard label="视口" value={environment.viewport} />
        <MetricCard label="DPR" value={String(environment.dpr)} />
        <MetricCard
          label="数据库"
          value={database.ok ? `正常 · v${database.schemaVersion}` : '异常'}
        />
        <MetricCard label="FPS" value={visual.fpsSampling ? '采样中…' : visual.fps != null ? String(visual.fps) : '—'} />
      </div>

      <section className="admin-table-wrap">
        <h2>环境</h2>
        <table className="admin-table">
          <tbody>
            <Row label="视口" value={environment.viewport} />
            <Row label="设备像素比 (DPR)" value={String(environment.dpr)} />
            <Row label="网络" value={environment.online ? '在线' : '离线'} />
            <Row label="IndexedDB 可用" value={environment.indexedDbAvailable ? '是' : '否'} />
            <Row label="设备内存 (deviceMemory)" value={environment.deviceMemory != null ? `${environment.deviceMemory} GB` : '不可用'} />
            <Row label="JS 堆已用" value={environment.jsHeapUsed != null ? formatBytes(environment.jsHeapUsed) : '不可用'} />
            <Row label="JS 堆上限" value={environment.jsHeapLimit != null ? formatBytes(environment.jsHeapLimit) : '不可用'} />
            <Row label="User-Agent" value={environment.userAgent} />
          </tbody>
        </table>
      </section>

      <section className="admin-table-wrap">
        <h2>数据库</h2>
        <table className="admin-table">
          <tbody>
            <Row label="数据库名" value={DATABASE_NAME} />
            <Row label="Schema 版本" value={String(database.schemaVersion)} />
            <Row label="状态" value={database.ok ? '正常' : `异常：${database.error ?? '未知'}`} />
            <Row label="活动 (events)" value={String(database.counts.events)} />
            <Row label="奖项 (prizes)" value={String(database.counts.prizes)} />
            <Row label="记录 (drawRecords)" value={String(database.counts.records)} />
            <Row label="会话 (drawSessions)" value={String(database.counts.sessions)} />
          </tbody>
        </table>
      </section>

      <section className="admin-table-wrap">
        <h2>抽奖状态</h2>
        <table className="admin-table">
          <tbody>
            <Row label="当前活动" value={draw.activeEvent ? `${draw.activeEvent.name} (${draw.activeEvent.code}) · ${draw.activeEvent.status}` : '无激活活动'} />
            <Row label="未结束中奖会话" value={draw.hasActiveSession ? `是 · ${draw.activeSessionRecordId ?? ''}` : '无'} />
            <Row label="最新提交记录" value={draw.latestRecord ? `${draw.latestRecord.prizeName} · ${draw.latestRecord.status}` : '无'} />
            <Row label="最新揭示结果" value={draw.latestRevealed ? `${draw.latestRevealed.prizeName} · ${draw.latestRevealed.revealedAt ?? '未记录'}` : '无'} />
          </tbody>
        </table>
      </section>

      <section className="admin-table-wrap">
        <h2>视觉 / 渲染</h2>
        <table className="admin-table">
          <tbody>
            <Row label="FPS（采样 1s）" value={visual.fpsSampling ? '采样中…' : visual.fps != null ? String(visual.fps) : '不可用'} />
            <Row label="Canvas 已挂载" value={visual.canvasPresent ? '是' : '否'} />
            <Row label="WebGL 支持" value={visual.webgl ? '是' : '否'} />
            <Row label="减弱动效 (prefers-reduced-motion)" value={visual.reducedMotion ? '已开启' : '未开启'} />
          </tbody>
        </table>
      </section>

      <section className="admin-table-wrap">
        <h2>存储</h2>
        <table className="admin-table">
          <tbody>
            <Row label="Storage Estimate API" value={storage.supported ? '可用' : '不可用'} />
            <Row label="已用估算" value={storage.usage != null ? formatBytes(storage.usage) : '不可用'} />
            <Row label="配额估算" value={storage.quota != null ? formatBytes(storage.quota) : '不可用'} />
          </tbody>
        </table>
      </section>

      <section className="admin-table-wrap">
        <h2>近期结构化事件（内存，最多 100 条）</h2>
        {snapshot.log.length === 0 ? (
          <p className="admin-message">暂无事件。</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>类型</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.log.map((entry, index) => (
                <tr key={`${entry.timestamp}-${index}`}>
                  <td>{entry.timestamp}</td>
                  <td>{entry.type}</td>
                  <td>{entry.details ? JSON.stringify(entry.details) : ''}</td>
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

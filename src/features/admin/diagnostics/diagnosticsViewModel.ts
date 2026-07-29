import {
  DATABASE_VERSION,
  type SignalHuntDatabase,
} from '../../../db/database';
import {
  getConfiguredActiveEvent,
  recoverCommittedDraw,
} from '../../../db/drawRepository';
import { BRAND_ASSETS } from '../../brand/brandAssets';
import {
  readLogs,
  type DiagnosticLogLevel,
  type DiagnosticLogRecord,
} from '../../diagnostics/diagnosticLogStore';
import {
  readCanvasMetrics,
  type CanvasMetrics,
} from '../../../visual/signal-engine/canvasDiagnostics';

export type DrawDiagnostics = {
  activeEvent?: { id: string; name: string; code: string; status: string };
  hasActiveSession: boolean;
  activeSessionRecordId?: string;
  latestRecord?: {
    id: string;
    prizeName: string;
    status: string;
    committedAt: string;
  };
  latestRevealed?: {
    id: string;
    prizeName: string;
    revealedAt?: string;
  };
};

export type DatabaseDiagnostics = {
  ok: boolean;
  error?: string;
  schemaVersion: number;
  counts: { events: number; prizes: number; records: number; sessions: number };
};

export type StorageDiagnostics = {
  supported: boolean;
  usage?: number;
  quota?: number;
};

export type VisualDiagnostics = {
  webgl: boolean;
  reducedMotion: boolean;
  canvasPresent: boolean;
  fps?: number;
  fpsSampling: boolean;
  canvas: CanvasMetrics;
};

export type EnvironmentDiagnostics = {
  viewport: string;
  dpr: number;
  online: boolean;
  indexedDbAvailable: boolean;
  userAgent: string;
  deviceMemory?: number;
  jsHeapUsed?: number;
  jsHeapLimit?: number;
};

export type PreflightStatus = 'pass' | 'fail' | 'warn' | 'info';

export type PreflightCheck = {
  id: string;
  label: string;
  status: PreflightStatus;
  detail?: string;
};

export type DiagnosticsSnapshot = {
  app: { version: string; mode: string; route: string };
  environment: EnvironmentDiagnostics;
  database: DatabaseDiagnostics;
  draw: DrawDiagnostics;
  visual: VisualDiagnostics;
  storage: StorageDiagnostics;
  preflight: { ready: boolean; checks: PreflightCheck[] };
  log: DiagnosticLogRecord[];
  sections: Record<
    'database' | 'draw' | 'storage' | 'prizes' | 'brand' | 'log',
    { status: 'success' | 'error'; error?: string }
  >;
};

type PrizeSummary = {
  total: number;
  enabledWithRemaining: number;
  inventoryViolations: string[];
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
  visibilityState:
    typeof document !== 'undefined' ? document.visibilityState : 'unknown',
  updatedAt: '',
};

export function createEmptyDiagnosticsSnapshot(
  route: string,
): DiagnosticsSnapshot {
  return {
    app: { version: __APP_VERSION__, mode: import.meta.env.MODE, route },
    environment: {
      viewport: '—',
      dpr: 1,
      online: true,
      indexedDbAvailable: false,
      userAgent: '—',
    },
    database: {
      ok: false,
      schemaVersion: DATABASE_VERSION,
      counts: { events: 0, prizes: 0, records: 0, sessions: 0 },
    },
    draw: { hasActiveSession: false },
    visual: {
      webgl: false,
      reducedMotion: false,
      canvasPresent: false,
      fpsSampling: false,
      canvas: initialCanvasMetrics,
    },
    storage: { supported: false },
    preflight: { ready: false, checks: [] },
    log: [],
    sections: {
      database: { status: 'success' },
      draw: { status: 'success' },
      storage: { status: 'success' },
      prizes: { status: 'success' },
      brand: { status: 'success' },
      log: { status: 'success' },
    },
  };
}

export async function collectDiagnosticsSnapshot({
  db,
  fps,
  logCode,
  logLevel,
  route,
  sampling,
}: {
  db: SignalHuntDatabase;
  fps?: number;
  logCode: string;
  logLevel: DiagnosticLogLevel | 'ALL';
  route: string;
  sampling: boolean;
}): Promise<DiagnosticsSnapshot> {
  const results = await Promise.allSettled([
    gatherDatabase(db),
    gatherDraw(db),
    gatherStorage(),
    gatherPrizeSummary(db),
    checkLogoAsset(),
    readLogs({
      level: logLevel === 'ALL' ? undefined : logLevel,
      code: logCode === 'ALL' ? undefined : logCode,
    }),
  ]);
  const database = settledValue(results[0], {
    ok: false,
    error: settledError(results[0]),
    schemaVersion: DATABASE_VERSION,
    counts: { events: 0, prizes: 0, records: 0, sessions: 0 },
  });
  const draw = settledValue<DrawDiagnostics>(results[1], { hasActiveSession: false });
  const storage = settledValue<StorageDiagnostics>(results[2], { supported: false });
  const prizeSummary = settledValue<PrizeSummary>(results[3], {
    total: 0,
    enabledWithRemaining: 0,
    inventoryViolations: [],
  });
  const logoOk = settledValue(results[4], false);
  const log = settledValue<DiagnosticLogRecord[]>(results[5], []);
  const environment = gatherEnvironment();

  return {
    app: { version: __APP_VERSION__, mode: import.meta.env.MODE, route },
    environment,
    database,
    draw,
    visual: {
      webgl: detectWebGL(),
      reducedMotion:
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      canvasPresent:
        typeof document !== 'undefined' &&
        document.getElementsByTagName('canvas').length > 0,
      fps,
      fpsSampling: sampling,
      canvas: readCanvasMetrics(),
    },
    storage,
    preflight: computePreflight({
      database,
      draw,
      prizeSummary,
      logoOk,
      online: environment.online,
    }),
    log,
    sections: {
      database: settledStatus(results[0]),
      draw: settledStatus(results[1]),
      storage: settledStatus(results[2]),
      prizes: settledStatus(results[3]),
      brand: settledStatus(results[4]),
      log: settledStatus(results[5]),
    },
  };
}

function settledValue<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function settledStatus(
  result: PromiseSettledResult<unknown>,
): { status: 'success' | 'error'; error?: string } {
  return result.status === 'fulfilled'
    ? { status: 'success' }
    : { status: 'error', error: settledError(result) };
}

function settledError(result: PromiseSettledResult<unknown>): string {
  if (result.status === 'fulfilled') return '';
  return result.reason instanceof Error
    ? result.reason.message
    : String(result.reason);
}

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

async function gatherDatabase(
  db: SignalHuntDatabase,
): Promise<DatabaseDiagnostics> {
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

async function gatherDraw(db: SignalHuntDatabase): Promise<DrawDiagnostics> {
  const activeEvent = await getConfiguredActiveEvent(db);
  if (!activeEvent) {
    const latest = await db.drawRecords.orderBy('committedAt').reverse().first();
    return {
      hasActiveSession: false,
      latestRecord: latest
        ? {
            id: latest.id,
            prizeName: latest.prizeNameSnapshot,
            status: latest.status,
            committedAt: latest.committedAt,
          }
        : undefined,
    };
  }

  const recovered = await recoverCommittedDraw(db, activeEvent.id);
  const latest = await db.drawRecords.orderBy('committedAt').reverse().first();
  const revealedRecords = (await db.drawRecords.toArray())
    .filter(
      (record) =>
        record.status === 'REVEALED' || record.status === 'REDEEMED',
    )
    .sort((left, right) =>
      (right.revealedAt ?? '').localeCompare(left.revealedAt ?? ''),
    );
  const latestRevealed = revealedRecords[0];

  return {
    activeEvent: {
      id: activeEvent.id,
      name: activeEvent.name,
      code: activeEvent.code,
      status: activeEvent.status,
    },
    hasActiveSession: Boolean(recovered),
    activeSessionRecordId: recovered?.record.id,
    latestRecord: latest
      ? {
          id: latest.id,
          prizeName: latest.prizeNameSnapshot,
          status: latest.status,
          committedAt: latest.committedAt,
        }
      : undefined,
    latestRevealed: latestRevealed
      ? {
          id: latestRevealed.id,
          prizeName: latestRevealed.prizeNameSnapshot,
          revealedAt: latestRevealed.revealedAt,
        }
      : undefined,
  };
}

async function gatherStorage(): Promise<StorageDiagnostics> {
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

function gatherEnvironment(): EnvironmentDiagnostics {
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    }
  ).memory;
  const nav = navigator as Navigator & { deviceMemory?: number };

  return {
    viewport:
      typeof window !== 'undefined'
        ? `${window.innerWidth}×${window.innerHeight}`
        : '—',
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    indexedDbAvailable: typeof indexedDB !== 'undefined',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '—',
    deviceMemory: nav.deviceMemory,
    jsHeapUsed: memory?.usedJSHeapSize,
    jsHeapLimit: memory?.jsHeapSizeLimit,
  };
}

async function gatherPrizeSummary(
  db: SignalHuntDatabase,
): Promise<PrizeSummary> {
  try {
    const prizes = await db.prizes.toArray();
    return {
      total: prizes.length,
      enabledWithRemaining: prizes.filter(
        (prize) => prize.enabled && prize.inventoryRemaining > 0,
      ).length,
      inventoryViolations: prizes
        .filter(
          (prize) =>
            prize.inventoryRemaining < 0 ||
            prize.inventoryRemaining > prize.inventoryTotal,
        )
        .map(
          (prize) =>
            `${prize.shortName ?? prize.id}: ${prize.inventoryRemaining}/${prize.inventoryTotal}`,
        ),
    };
  } catch {
    return { total: 0, enabledWithRemaining: 0, inventoryViolations: [] };
  }
}

async function checkLogoAsset(): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = BRAND_ASSETS.logo;
  });
}

function computePreflight({
  database,
  draw,
  prizeSummary,
  logoOk,
  online,
}: {
  database: DatabaseDiagnostics;
  draw: DrawDiagnostics;
  prizeSummary: PrizeSummary;
  logoOk: boolean;
  online: boolean;
}) {
  const checks: PreflightCheck[] = [
    {
      id: 'build',
      label: '生产构建',
      status: import.meta.env.PROD ? 'pass' : 'warn',
      detail: import.meta.env.PROD
        ? '生产模式'
        : '当前为开发模式（现场应使用生产构建）',
    },
    {
      id: 'logo',
      label: '品牌 Logo 资源',
      status: logoOk ? 'pass' : 'fail',
      detail: logoOk
        ? 'Quantum Design Logo 可访问'
        : 'Quantum Design Logo 缺失或不可访问',
    },
    {
      id: 'database',
      label: '数据库可访问',
      status: database.ok ? 'pass' : 'fail',
      detail: database.ok
        ? `v${database.schemaVersion}`
        : `异常：${database.error ?? '未知'}`,
    },
    {
      id: 'activeEvent',
      label: '存在已激活活动',
      status: draw.activeEvent ? 'pass' : 'fail',
      detail: draw.activeEvent
        ? `${draw.activeEvent.name} (${draw.activeEvent.code})`
        : '无激活活动，请在活动配置页激活',
    },
    {
      id: 'enabledPrizes',
      label: '至少一个启用且有库存的奖项',
      status: prizeSummary.enabledWithRemaining > 0 ? 'pass' : 'fail',
      detail: `${prizeSummary.enabledWithRemaining} 个可用（共 ${prizeSummary.total} 个奖项）`,
    },
    {
      id: 'inventory',
      label: '库存数据一致',
      status: prizeSummary.inventoryViolations.length ? 'fail' : 'pass',
      detail: prizeSummary.inventoryViolations.length
        ? `违规：${prizeSummary.inventoryViolations.join('；')}`
        : '全部奖项库存正常',
    },
    {
      id: 'activeSession',
      label: '无未结束中奖会话',
      status: draw.hasActiveSession ? 'warn' : 'pass',
      detail: draw.hasActiveSession
        ? `存在未结束会话 ${draw.activeSessionRecordId ?? ''}`
        : '无',
    },
    {
      id: 'network',
      label: '网络状态（离线可用）',
      status: 'info',
      detail: online ? '在线' : '离线，本地抽奖仍可运行',
    },
  ];
  return {
    ready: checks.every((check) => check.status !== 'fail'),
    checks,
  };
}

export function formatDiagnosticBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

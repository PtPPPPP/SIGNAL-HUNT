import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { AdminButton, EmptyState, StatusBadge } from '../../components/ui/AdminUI';
import { listDrawRecords, listPrizes, replacePrizes, savePrize } from '../../db/adminRepository';
import { getActiveEvent } from '../../db/drawRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { calculatePrizePacing } from '../../domain/draw/prizePacing';
import type { DrawRecord, Event, Prize, PrizeProbabilityMode, PrizeReleasePoint } from '../../domain/draw/types';
import {
  PrizeValidationError,
  type PrizeValidationIssues,
  validatePrize,
} from '../../domain/draw/prizeValidation';
import { parsePrizeImport, stringifyPrizeExport } from '../../features/admin/prizeImport';
import { AdminLayout } from './AdminLayout';

type AdminPrizesPageProps = {
  db?: SignalHuntDatabase;
};

type PrizeFormState = {
  id: string;
  name: string;
  shortName: string;
  level: string;
  inventoryTotal: string;
  inventoryRemaining: string;
  weight: string;
  enabled: boolean;
  probabilityMode: PrizeProbabilityMode;
  minMultiplier: string;
  maxMultiplier: string;
  sensitivity: string;
  minIntervalMinutes: string;
  catchUpEnabled: boolean;
  catchUpStartBeforeEndMinutes: string;
  catchUpMaxMultiplier: string;
  releaseScheduleText: string;
};

const defaultForm: PrizeFormState = {
  id: '',
  name: '',
  shortName: '',
  level: '1',
  inventoryTotal: '1',
  inventoryRemaining: '1',
  weight: '1',
  enabled: true,
  probabilityMode: 'FIXED',
  minMultiplier: '0.2',
  maxMultiplier: '3',
  sensitivity: '0.5',
  minIntervalMinutes: '0',
  catchUpEnabled: false,
  catchUpStartBeforeEndMinutes: '60',
  catchUpMaxMultiplier: '4',
  releaseScheduleText: '',
};

export function AdminPrizesPage({ db = signalHuntDatabase }: AdminPrizesPageProps) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [records, setRecords] = useState<DrawRecord[]>([]);
  const [activeEvent, setActiveEvent] = useState<Event | undefined>(undefined);
  const [form, setForm] = useState<PrizeFormState>(defaultForm);
  const [formErrors, setFormErrors] = useState<PrizeValidationIssues>({});
  const [jsonText, setJsonText] = useState('[]');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const exportText = useMemo(() => stringifyPrizeExport(prizes), [prizes]);
  const previewPrize = useMemo(() => createPrizeFromForm(form), [form]);
  const preview = useMemo(
    () => calculatePrizePacing({ prize: previewPrize, event: activeEvent, records }),
    [activeEvent, previewPrize, records],
  );
  const totalEffectiveWeight = useMemo(
    () =>
      prizes.reduce(
        (sum, prize) => sum + calculatePrizePacing({ prize, event: activeEvent, records }).effectiveWeight,
        preview.effectiveWeight,
      ),
    [activeEvent, preview.effectiveWeight, prizes, records],
  );
  const estimatedShare = totalEffectiveWeight > 0 ? (preview.effectiveWeight / totalEffectiveWeight) * 100 : 0;

  const refresh = useCallback(async (options: { syncJsonText: boolean | 'ifEmpty' }) => {
    const [nextPrizes, nextRecords, event] = await Promise.all([
      listPrizes(db),
      listDrawRecords(db),
      getActiveEvent(db),
    ]);
    setPrizes(nextPrizes);
    setRecords(nextRecords);
    setActiveEvent(event);
    if (options.syncJsonText === true) {
      setJsonText(stringifyPrizeExport(nextPrizes));
    } else if (options.syncJsonText === 'ifEmpty') {
      setJsonText((current) => (current === '[]' ? stringifyPrizeExport(nextPrizes) : current));
    }
  }, [db]);

  useEffect(() => {
    let disposed = false;

    void refresh({ syncJsonText: 'ifEmpty' }).finally(() => {
      if (!disposed) {
        setLoading(false);
      }
    });

    return () => {
      disposed = true;
    };
  }, [db, refresh]);

  const handleSavePrize = async () => {
    try {
      const prize = validatePrize(createPrizeFromForm(form));
      await savePrize(db, prize);
      setFormErrors({});
      setMessage('奖品已保存。');
      setForm(defaultForm);
      await refresh({ syncJsonText: true });
    } catch (error) {
      if (error instanceof PrizeValidationError) {
        setFormErrors(error.issues);
        setMessage('请修正奖品字段。');
        return;
      }

      throw error;
    }
  };

  const handleImport = async () => {
    try {
      const importedPrizes = parsePrizeImport(jsonText);
      await replacePrizes(db, importedPrizes);
      setMessage('奖品 JSON 已导入。');
      await refresh({ syncJsonText: true });
    } catch {
      setMessage('奖品 JSON 无效，请检查字段。');
    }
  };

  return (
    <AdminLayout title="Prize Management">
      {loading ? <section className="admin-panel">正在读取奖品...</section> : null}

      <section className="admin-toolbar">
        <AdminButton onClick={() => setForm(defaultForm)}>新增奖品</AdminButton>
        <AdminButton variant="secondary" onClick={() => setJsonText(exportText)}>导出 JSON</AdminButton>
        <AdminButton variant="secondary" onClick={() => void handleImport()}>导入 JSON</AdminButton>
      </section>

      <section className="admin-prize-editor">
        <form className="admin-form admin-prize-form" onSubmit={(event) => event.preventDefault()}>
          <FormSection title="Basic Information">
            <label>
              编号
              <input value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} />
              <FieldError message={formErrors.id} />
            </label>
            <label>
              奖项名称
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              <FieldError message={formErrors.name} />
            </label>
            <label>
              简称
              <input value={form.shortName} onChange={(event) => setForm({ ...form, shortName: event.target.value })} />
              <FieldError message={formErrors.shortName} />
            </label>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              />
              启用
            </label>
          </FormSection>

          <FormSection title="Inventory">
            <div className="admin-form-row">
              <NumberField label="等级" value={form.level} min={1} step={1} onChange={(value) => setForm({ ...form, level: value })} error={formErrors.level} />
              <NumberField label="总量" value={form.inventoryTotal} min={0} step={1} onChange={(value) => setForm({ ...form, inventoryTotal: value })} error={formErrors.inventoryTotal} />
              <NumberField label="剩余" value={form.inventoryRemaining} min={0} step={1} onChange={(value) => setForm({ ...form, inventoryRemaining: value })} error={formErrors.inventoryRemaining} />
            </div>
            <p className="admin-helper">已中奖数量会从抽奖记录中统计，库存字段保存前仍会走 Zod 校验。</p>
          </FormSection>

          <FormSection title="Probability Strategy">
            <label>
              Probability Mode
              <select
                value={form.probabilityMode}
                onChange={(event) => setForm({ ...form, probabilityMode: event.target.value as PrizeProbabilityMode })}
              >
                <option value="FIXED">Fixed Weight</option>
                <option value="TIME_RELEASE">Time Release</option>
                <option value="SMART_PACING">Smart Pacing</option>
              </select>
            </label>
            <NumberField label="Base Weight" value={form.weight} min={0} step={0.1} onChange={(value) => setForm({ ...form, weight: value })} error={formErrors.weight} />
            <p className="admin-helper">Estimated Share: {estimatedShare.toFixed(1)}%</p>

            {form.probabilityMode !== 'FIXED' ? (
              <label>
                Release Schedule
                <textarea
                  aria-label="Release Schedule"
                  value={form.releaseScheduleText}
                  onChange={(event) => setForm({ ...form, releaseScheduleText: event.target.value })}
                  rows={5}
                  placeholder={'09:00,1\n11:00,2\n13:00,3'}
                />
                <span className="admin-helper">每行格式：HH:mm, 累计最多中奖数。时间和累计数必须递增。</span>
                <FieldError message={formErrors.pacing} />
              </label>
            ) : null}

            {form.probabilityMode === 'SMART_PACING' ? (
              <div className="admin-form-block">
                <div className="admin-form-row">
                  <NumberField label="Minimum Multiplier" value={form.minMultiplier} min={0} step={0.1} onChange={(value) => setForm({ ...form, minMultiplier: value })} />
                  <NumberField label="Maximum Multiplier" value={form.maxMultiplier} min={0} step={0.1} onChange={(value) => setForm({ ...form, maxMultiplier: value })} />
                  <NumberField label="Sensitivity" value={form.sensitivity} min={0.1} max={1} step={0.1} onChange={(value) => setForm({ ...form, sensitivity: value })} />
                </div>
                <div className="admin-form-row">
                  <NumberField label="Minimum Win Interval" unit="min" value={form.minIntervalMinutes} min={0} step={1} onChange={(value) => setForm({ ...form, minIntervalMinutes: value })} />
                  <NumberField label="Catch-Up Start" unit="min before end" value={form.catchUpStartBeforeEndMinutes} min={0} step={1} onChange={(value) => setForm({ ...form, catchUpStartBeforeEndMinutes: value })} />
                  <NumberField label="Catch-Up Max" value={form.catchUpMaxMultiplier} min={0} step={0.1} onChange={(value) => setForm({ ...form, catchUpMaxMultiplier: value })} />
                </div>
                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={form.catchUpEnabled}
                    onChange={(event) => setForm({ ...form, catchUpEnabled: event.target.checked })}
                  />
                  Enable Catch-Up
                </label>
                <p className="admin-helper">响应强度越高，系统对“出奖偏快/偏慢”的权重调整越明显。</p>
              </div>
            ) : null}
          </FormSection>

          <AdminButton onClick={() => void handleSavePrize()}>保存奖品</AdminButton>
          {message ? <p className="admin-message">{message}</p> : null}
        </form>

        <aside className="admin-panel live-preview" aria-label="Live Preview">
          <div className="admin-panel-header">
            <div>
              <p>Live Preview</p>
              <h2>真实节奏计算</h2>
            </div>
            <StatusBadge tone={toneForPacing(preview.status)}>{preview.status}</StatusBadge>
          </div>
          <dl className="admin-definition-grid">
            <div><dt>Current Time</dt><dd>{formatDateTime(preview.currentTime)}</dd></div>
            <div><dt>Exhibition Progress</dt><dd>{Math.round(preview.eventProgress * 100)}%</dd></div>
            <div><dt>Expected Wins</dt><dd>{preview.expectedWins}</dd></div>
            <div><dt>Actual Wins</dt><dd>{preview.actualWins}</dd></div>
            <div><dt>Pacing Error</dt><dd>{preview.pacingError.toFixed(2)}</dd></div>
            <div><dt>Base Weight</dt><dd>{preview.baseWeight}</dd></div>
            <div><dt>Multiplier</dt><dd>{preview.multiplier.toFixed(2)}x</dd></div>
            <div><dt>Effective Weight</dt><dd>{preview.effectiveWeight.toFixed(2)}</dd></div>
          </dl>
          <p className="admin-helper">此预览调用 `calculatePrizePacing()`，与真实抽奖使用同一个 domain 计算。</p>
        </aside>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <p>Prize Table</p>
            <h2>奖品列表</h2>
          </div>
        </div>
        {prizes.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Prize</th>
                <th>Level</th>
                <th>Mode</th>
                <th>Base Weight</th>
                <th>Effective Weight</th>
                <th>Inventory</th>
                <th>Won</th>
                <th>Redeemed</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {prizes.map((prize) => {
                const snapshot = calculatePrizePacing({ prize, event: activeEvent, records });
                const won = records.filter((record) => record.prizeId === prize.id && record.status !== 'VOIDED').length;
                const redeemed = records.filter((record) => record.prizeId === prize.id && record.redeemed).length;

                return (
                  <tr key={prize.id}>
                    <td>{prize.name}</td>
                    <td>{prize.level}</td>
                    <td>{prize.probabilityMode ?? 'FIXED'}</td>
                    <td>{prize.weight}</td>
                    <td>{snapshot.effectiveWeight.toFixed(2)}</td>
                    <td>{prize.inventoryRemaining} / {prize.inventoryTotal}</td>
                    <td>{won}</td>
                    <td>{redeemed}</td>
                    <td><StatusBadge tone={toneForPacing(snapshot.status)}>{snapshot.status}</StatusBadge></td>
                    <td><AdminButton variant="ghost" onClick={() => setForm(toFormState(prize))}>编辑</AdminButton></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState title="暂无奖品" />
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <p>JSON Import / Export</p>
            <h2>奖品 JSON</h2>
          </div>
        </div>
        <label className="admin-json-field">
          奖品 JSON
          <textarea
            aria-label="Prize JSON"
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            rows={12}
          />
        </label>
      </section>
    </AdminLayout>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-form-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  unit,
  error,
  onChange,
}: {
  label: string;
  value: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <span className="number-input-wrap">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onChange(Number.isFinite(Number(value)) ? value : '')}
        />
        {unit ? <em>{unit}</em> : null}
      </span>
      <FieldError message={error} />
    </label>
  );
}

function createPrizeFromForm(form: PrizeFormState): Prize {
  const id = form.id.trim() || `prize-${crypto.randomUUID()}`;
  const name = form.name.trim();
  const shortName = form.shortName.trim() || name;
  const releaseSchedule = parseReleaseSchedule(form.releaseScheduleText);
  const pacing =
    form.probabilityMode === 'FIXED'
      ? undefined
      : {
          minMultiplier: toNumber(form.minMultiplier),
          maxMultiplier: toNumber(form.maxMultiplier),
          sensitivity: toNumber(form.sensitivity),
          minIntervalMinutes: toNumber(form.minIntervalMinutes),
          catchUpEnabled: form.catchUpEnabled,
          catchUpStartBeforeEndMinutes: toNumber(form.catchUpStartBeforeEndMinutes),
          catchUpMaxMultiplier: toNumber(form.catchUpMaxMultiplier),
          releaseSchedule,
        };

  return {
    id,
    name,
    shortName,
    level: toNumber(form.level),
    inventoryTotal: toNumber(form.inventoryTotal),
    inventoryRemaining: toNumber(form.inventoryRemaining),
    weight: toNumber(form.weight),
    enabled: form.enabled,
    probabilityMode: form.probabilityMode,
    pacing,
  };
}

function toFormState(prize: Prize): PrizeFormState {
  return {
    ...defaultForm,
    id: prize.id,
    name: prize.name,
    shortName: prize.shortName,
    level: String(prize.level),
    inventoryTotal: String(prize.inventoryTotal),
    inventoryRemaining: String(prize.inventoryRemaining),
    weight: String(prize.weight),
    enabled: prize.enabled,
    probabilityMode: prize.probabilityMode ?? 'FIXED',
    minMultiplier: String(prize.pacing?.minMultiplier ?? defaultForm.minMultiplier),
    maxMultiplier: String(prize.pacing?.maxMultiplier ?? defaultForm.maxMultiplier),
    sensitivity: String(prize.pacing?.sensitivity ?? defaultForm.sensitivity),
    minIntervalMinutes: String(prize.pacing?.minIntervalMinutes ?? defaultForm.minIntervalMinutes),
    catchUpEnabled: Boolean(prize.pacing?.catchUpEnabled),
    catchUpStartBeforeEndMinutes: String(
      prize.pacing?.catchUpStartBeforeEndMinutes ?? defaultForm.catchUpStartBeforeEndMinutes,
    ),
    catchUpMaxMultiplier: String(prize.pacing?.catchUpMaxMultiplier ?? defaultForm.catchUpMaxMultiplier),
    releaseScheduleText: (prize.pacing?.releaseSchedule ?? [])
      .map((point) => `${point.time},${point.maxCumulativeWins}`)
      .join('\n'),
  };
}

function parseReleaseSchedule(text: string): PrizeReleasePoint[] | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return undefined;
  }

  return lines.map((line) => {
    const [time, count] = line.split(',').map((part) => part.trim());

    return {
      time: time ?? '',
      maxCumulativeWins: Number(count),
    };
  });
}

function toNumber(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="admin-field-error">{message}</span> : null;
}

function toneForPacing(status: string) {
  if (status === 'LOCKED' || status === 'AHEAD') {
    return 'warning';
  }

  if (status === 'DEPLETED') {
    return 'danger';
  }

  if (status === 'BEHIND' || status === 'CATCH_UP') {
    return 'brand';
  }

  return 'success';
}

function formatDateTime(value: string): string {
  return value.replace('T', ' ').slice(0, 19);
}

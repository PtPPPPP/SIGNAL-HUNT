import type { Dispatch, SetStateAction } from 'react';

import {
  Button,
  DangerZone,
  DataTable,
  EmptyState,
  Field,
  Input,
  NumberInput,
  SectionCard,
  Select,
  StatusBadge,
  Switch,
  type BadgeTone,
} from '../../../components/ui/AdminUI';
import { calculatePrizePacing, type PrizePacingSnapshot } from '../../../domain/draw/prizePacing';
import type { DrawRecord, Event, Prize, PrizeProbabilityMode } from '../../../domain/draw/types';
import type { PrizeValidationIssues } from '../../../domain/draw/prizeValidation';
import {
  PACING_STATUS_LABELS,
  PROBABILITY_MODE_LABELS,
  formatAdminDateTime,
} from '../statusLabels';
import { toPrizeFormState, type PrizeFormState } from './prizeForm';

type EditorProps = {
  estimatedShare: number;
  form: PrizeFormState;
  issues: PrizeValidationIssues;
  preview: PrizePacingSnapshot;
  setForm: Dispatch<SetStateAction<PrizeFormState>>;
  onSave: () => void;
};

export function PrizeEditor({
  estimatedShare,
  form,
  issues,
  preview,
  setForm,
  onSave,
}: EditorProps) {
  const update = <Key extends keyof PrizeFormState>(
    key: Key,
    value: PrizeFormState[Key],
  ) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="admin-prize-editor-grid">
      <SectionCard
        title="奖品编辑"
        description="基础配置和发放策略使用同一保存入口。"
      >
        <form
          className="admin-prize-form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <Field label="编号" error={issues.id}>
            <Input value={form.id} onChange={(event) => update('id', event.target.value)} />
          </Field>
          <Field label="奖项名称" required error={issues.name}>
            <Input value={form.name} onChange={(event) => update('name', event.target.value)} />
          </Field>
          <Field label="简称" required error={issues.shortName}>
            <Input value={form.shortName} onChange={(event) => update('shortName', event.target.value)} />
          </Field>
          <Field label="等级" required error={issues.level}>
            <NumberInput min={1} step={1} value={form.level} onChange={(event) => update('level', event.target.value)} />
          </Field>
          <Switch
            label="启用奖品"
            description="关闭后不会进入抽奖候选池。"
            checked={form.enabled}
            onChange={(event) => update('enabled', event.target.checked)}
          />

          <div className="admin-form-divider" />
          <Field label="概率模式">
            <Select
              value={form.probabilityMode}
              onChange={(event) =>
                update('probabilityMode', event.target.value as PrizeProbabilityMode)
              }
            >
              <option value="FIXED">固定概率</option>
              <option value="TIME_RELEASE">分时释放</option>
              <option value="SMART_PACING">智能发放</option>
            </Select>
          </Field>
          <Field label="基础权重" error={issues.weight}>
            <NumberInput min={0} step={0.1} value={form.weight} onChange={(event) => update('weight', event.target.value)} />
          </Field>
          <p className="admin-inline-measurement">
            预计占比 <strong>{estimatedShare.toFixed(1)}%</strong>
          </p>

          {form.probabilityMode !== 'FIXED' ? (
            <Field
              label="释放计划"
              hint="每行格式：HH:mm, 累计最多中奖数；时间和累计数必须递增。"
              error={issues.pacing}
            >
              <textarea
                className="ui-input admin-textarea"
                aria-label="释放计划"
                value={form.releaseScheduleText}
                onChange={(event) => update('releaseScheduleText', event.target.value)}
                rows={5}
                placeholder={'09:00,1\n11:00,2\n13:00,3'}
              />
            </Field>
          ) : null}

          {form.probabilityMode === 'SMART_PACING' ? (
            <div className="admin-smart-pacing-fields">
              <CompactNumberField label="最小倍率" value={form.minMultiplier} min={0} step={0.1} onChange={(value) => update('minMultiplier', value)} />
              <CompactNumberField label="最大倍率" value={form.maxMultiplier} min={0} step={0.1} onChange={(value) => update('maxMultiplier', value)} />
              <CompactNumberField label="响应强度" value={form.sensitivity} min={0.1} max={1} step={0.1} onChange={(value) => update('sensitivity', value)} />
              <CompactNumberField label="最短中奖间隔（分钟）" value={form.minIntervalMinutes} min={0} step={1} onChange={(value) => update('minIntervalMinutes', value)} />
              <CompactNumberField label="追赶开始（结束前分钟）" value={form.catchUpStartBeforeEndMinutes} min={0} step={1} onChange={(value) => update('catchUpStartBeforeEndMinutes', value)} />
              <CompactNumberField label="追赶最大倍率" value={form.catchUpMaxMultiplier} min={0} step={0.1} onChange={(value) => update('catchUpMaxMultiplier', value)} />
              <Switch label="启用追赶发放" checked={form.catchUpEnabled} onChange={(event) => update('catchUpEnabled', event.target.checked)} />
            </div>
          ) : null}

          <div className="admin-form-actions">
            <Button type="submit">保存奖品</Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="实时测量"
        actions={
          <StatusBadge tone={toneForPacing(preview.status)}>
            {PACING_STATUS_LABELS[preview.status]}
          </StatusBadge>
        }
      >
        <dl className="admin-definition-grid admin-definition-grid--two">
          <div><dt>当前时间</dt><dd>{formatAdminDateTime(preview.currentTime)}</dd></div>
          <div><dt>活动进度</dt><dd>{Math.round(preview.eventProgress * 100)}%</dd></div>
          <div><dt>预计中奖</dt><dd>{preview.expectedWins}</dd></div>
          <div><dt>实际中奖</dt><dd>{preview.actualWins}</dd></div>
          <div><dt>节奏偏差</dt><dd>{preview.pacingError.toFixed(2)}</dd></div>
          <div><dt>当前倍率</dt><dd>{preview.multiplier.toFixed(2)} 倍</dd></div>
          <div><dt>基础权重</dt><dd>{preview.baseWeight}</dd></div>
          <div><dt>有效权重</dt><dd>{preview.effectiveWeight.toFixed(2)}</dd></div>
        </dl>
        <p className="admin-section-note">
          此预览与真实抽奖使用同一套发放节奏计算规则。
        </p>
      </SectionCard>
    </section>
  );
}

export function InventorySection({
  form,
  issues,
  setForm,
}: Pick<EditorProps, 'form' | 'issues' | 'setForm'>) {
  return (
    <SectionCard
      title="库存设置"
      description="保存前会验证剩余库存不能超过总库存。"
    >
      <div className="admin-filter-grid">
        <Field label="库存总量" error={issues.inventoryTotal}>
          <NumberInput
            min={0}
            step={1}
            value={form.inventoryTotal}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                inventoryTotal: event.target.value,
              }))
            }
          />
        </Field>
        <Field label="当前剩余" error={issues.inventoryRemaining}>
          <NumberInput
            min={0}
            step={1}
            value={form.inventoryRemaining}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                inventoryRemaining: event.target.value,
              }))
            }
          />
        </Field>
      </div>
    </SectionCard>
  );
}

export function PrizeList({
  activeEvent,
  prizes,
  records,
  onEdit,
}: {
  activeEvent?: Event;
  prizes: Prize[];
  records: DrawRecord[];
  onEdit: (form: PrizeFormState) => void;
}) {
  return (
    <SectionCard title="奖品列表">
      {prizes.length ? (
        <DataTable label="奖品列表" minWidth="76rem">
          <table>
            <thead>
              <tr>
                <th>奖项</th>
                <th>等级</th>
                <th>模式</th>
                <th>基础权重</th>
                <th>有效权重</th>
                <th>库存</th>
                <th>已中奖</th>
                <th>已兑奖</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {prizes.map((prize) => {
                const snapshot = calculatePrizePacing({
                  prize,
                  event: activeEvent,
                  records,
                });
                const won = records.filter(
                  (record) =>
                    record.prizeId === prize.id && record.status !== 'VOIDED',
                ).length;
                const redeemed = records.filter(
                  (record) => record.prizeId === prize.id && record.redeemed,
                ).length;
                return (
                  <tr key={prize.id}>
                    <td>{prize.name}</td>
                    <td data-nowrap>{prize.level}</td>
                    <td data-nowrap>{PROBABILITY_MODE_LABELS[prize.probabilityMode ?? 'FIXED']}</td>
                    <td data-nowrap>{prize.weight}</td>
                    <td data-nowrap>{snapshot.effectiveWeight.toFixed(2)}</td>
                    <td data-nowrap>{prize.inventoryRemaining} / {prize.inventoryTotal}</td>
                    <td data-nowrap>{won}</td>
                    <td data-nowrap>{redeemed}</td>
                    <td data-nowrap>
                      <StatusBadge tone={toneForPrizeAvailability(prize)}>
                        {labelForPrizeAvailability(prize)}
                      </StatusBadge>
                    </td>
                    <td data-nowrap>
                      <Button
                        variant="ghost"
                        onClick={() => onEdit(toPrizeFormState(prize))}
                      >
                        编辑
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTable>
      ) : (
        <EmptyState title="暂无奖品" />
      )}
    </SectionCard>
  );
}

export function ImportExportSection({
  exportText,
  jsonText,
  onChange,
  onExport,
  onImport,
}: {
  exportText: string;
  jsonText: string;
  onChange: (value: string) => void;
  onExport: () => void;
  onImport: () => void;
}) {
  return (
    <SectionCard
      title="导入与导出"
      description="导入会用文本中的完整奖池替换当前奖池。"
      actions={
        <div className="admin-table-actions">
          <Button variant="secondary" onClick={onExport}>
            导出 JSON
          </Button>
          <Button onClick={onImport}>导入 JSON</Button>
        </div>
      }
    >
      <Field label="奖品 JSON" hint={`当前导出长度：${exportText.length} 字符`}>
        <textarea
          className="ui-input admin-textarea admin-json-textarea"
          aria-label="奖品 JSON"
          value={jsonText}
          onChange={(event) => onChange(event.target.value)}
          rows={12}
        />
      </Field>
    </SectionCard>
  );
}

export function PrizeDangerZone({
  onReset,
  onRestoreDefaults,
}: {
  onReset: () => void;
  onRestoreDefaults: () => void;
}) {
  return (
    <DangerZone
      title="奖池危险操作"
      action={
        <div className="admin-table-actions">
          <Button variant="secondary" onClick={onRestoreDefaults}>
            恢复默认奖池
          </Button>
          <Button variant="danger" onClick={onReset}>
            重置奖品
          </Button>
        </div>
      }
    >
      恢复默认奖池或重置奖品会清空当前活动抽奖记录，请先完成必要备份。
    </DangerZone>
  );
}

function CompactNumberField({
  label,
  value,
  onChange,
  ...props
}: {
  label: string;
  value: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <NumberInput
        {...props}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function toneForPacing(status: string): BadgeTone {
  if (status === 'LOCKED' || status === 'AHEAD') return 'warning';
  if (status === 'DEPLETED') return 'danger';
  if (status === 'BEHIND' || status === 'CATCH_UP') return 'brand';
  return 'success';
}

function labelForPrizeAvailability(prize: Prize): string {
  if (prize.inventoryRemaining <= 0) return '库存已空';
  if (!prize.enabled) return '已停用';
  if (prize.weight <= 0) return '权重为零';
  return '可参与抽奖';
}

function toneForPrizeAvailability(prize: Prize): BadgeTone {
  if (prize.inventoryRemaining <= 0) return 'danger';
  if (!prize.enabled || prize.weight <= 0) return 'warning';
  return 'success';
}

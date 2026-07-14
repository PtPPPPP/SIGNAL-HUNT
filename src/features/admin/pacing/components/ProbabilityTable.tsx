import { useMemo } from 'react';

import { AdminButton, EmptyState, StatusBadge } from '../../../../components/ui/AdminUI';
import { calculatePrizePacing } from '../../../../domain/draw/prizePacing';
import {
  calculateExpectedWins,
  type InventoryRisk,
} from '../../../../domain/draw/prizeProbability';
import type { DrawRecord, Event, Prize } from '../../../../domain/draw/types';
import { applyDraftToPrize, createDraftFromPrize, toNonNegativeInteger, toProbability } from '../pacingDraft';
import type { DistributionStrategy, PacingMode, ProbabilityDraft } from '../types';
import { formatCount } from '../format';

type ProbabilityTableProps = {
  activeEvent?: Event;
  drafts: ProbabilityDraft[];
  expectedParticipants: number;
  mode: PacingMode;
  prizes: Prize[];
  records: DrawRecord[];
  risks: InventoryRisk[];
  onUpdateDraft: (prizeId: string, patch: Partial<ProbabilityDraft>) => void;
};

export function ProbabilityTable({
  activeEvent,
  drafts,
  expectedParticipants,
  mode,
  prizes,
  records,
  risks,
  onUpdateDraft,
}: ProbabilityTableProps) {
  const riskByPrizeId = useMemo(() => new Map(risks.map((risk) => [risk.prizeId, risk])), [risks]);

  if (prizes.length === 0) {
    return (
      <section className="admin-panel">
        <EmptyState title="暂无奖项，无法配置概率" />
      </section>
    );
  }

  return (
    <section className="admin-panel probability-table-panel">
      <div className="admin-panel-header">
        <div>
          <p>简单模式</p>
          <h2>直接编辑中奖概率</h2>
        </div>
      </div>

      <table className="admin-table probability-table">
        <thead>
          <tr>
            <th>奖项</th>
            <th>中奖概率</th>
            <th>剩余库存</th>
            <th>预计中奖</th>
            <th>发放方式</th>
            <th>锁定</th>
            <th>状态</th>
            {mode !== 'simple' ? <th>智能设置</th> : null}
            {mode === 'advanced' ? <th>高级设置</th> : null}
          </tr>
        </thead>
        <tbody>
          {prizes.map((prize) => {
            const draft = drafts.find((item) => item.prizeId === prize.id) ?? createDraftFromPrize(prize, 0);
            const snapshot = calculatePrizePacing({
              prize: applyDraftToPrize(prize, draft, draft.probability),
              event: activeEvent,
              records,
            });

            return (
              <ProbabilityRow
                draft={draft}
                expectedParticipants={expectedParticipants}
                key={prize.id}
                mode={mode}
                prize={prize}
                risk={riskByPrizeId.get(prize.id)}
                snapshotMultiplier={snapshot.multiplier}
                onUpdateDraft={onUpdateDraft}
              />
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function ProbabilityRow({
  draft,
  expectedParticipants,
  mode,
  prize,
  risk,
  snapshotMultiplier,
  onUpdateDraft,
}: {
  draft: ProbabilityDraft;
  expectedParticipants: number;
  mode: PacingMode;
  prize: Prize;
  risk?: InventoryRisk;
  snapshotMultiplier: number;
  onUpdateDraft: (prizeId: string, patch: Partial<ProbabilityDraft>) => void;
}) {
  return (
    <tr>
      <td>
        <strong>{prize.name}</strong>
        {prize.probabilityMode === 'SMART_PACING' ? (
          <span className="probability-row-note">当前相对倍率 {snapshotMultiplier.toFixed(2)} 倍</span>
        ) : null}
      </td>
      <td>
        <label className="probability-input">
          <span>{prize.name} 中奖概率</span>
          <input
            aria-label={`${prize.name} 中奖概率`}
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={draft.probability}
            onChange={(event) => onUpdateDraft(prize.id, { probability: toProbability(event.target.value) })}
          />
          <em>%</em>
        </label>
      </td>
      <td>
        {prize.inventoryRemaining} / {prize.inventoryTotal}
      </td>
      <td>预计约 {formatCount(calculateExpectedWins(draft.probability, expectedParticipants))} 人</td>
      <td>
        <select
          aria-label={`${prize.name} 发放策略`}
          value={draft.strategy}
          onChange={(event) => onUpdateDraft(prize.id, { strategy: event.target.value as DistributionStrategy })}
        >
          <option value="RANDOM">普通随机</option>
          <option value="EVEN">均匀发放</option>
          <option value="CUSTOM_TIME">自定义时间</option>
        </select>
      </td>
      <td>
        <AdminButton
          variant={draft.locked ? 'primary' : 'secondary'}
          onClick={() => onUpdateDraft(prize.id, { locked: !draft.locked })}
        >
          {draft.locked ? `已锁定 ${prize.name}` : `锁定 ${prize.name}`}
        </AdminButton>
      </td>
      <td>
        <InventoryRiskBadge risk={risk} />
      </td>
      {mode !== 'simple' ? (
        <td>
          <SmartControls draft={draft} prize={prize} onUpdateDraft={onUpdateDraft} />
        </td>
      ) : null}
      {mode === 'advanced' ? (
        <td>
          <AdvancedControls draft={draft} prize={prize} onUpdateDraft={onUpdateDraft} />
        </td>
      ) : null}
    </tr>
  );
}

function SmartControls({
  draft,
  prize,
  onUpdateDraft,
}: {
  draft: ProbabilityDraft;
  prize: Prize;
  onUpdateDraft: (prizeId: string, patch: Partial<ProbabilityDraft>) => void;
}) {
  return (
    <div className="probability-smart-controls">
      <label className="admin-checkbox">
        <input
          type="checkbox"
          checked={draft.strategy === 'EVEN'}
          onChange={(event) => onUpdateDraft(prize.id, { strategy: event.target.checked ? 'EVEN' : 'RANDOM' })}
        />
        大奖保护
      </label>
      <label>
        最小中奖间隔
        <input
          aria-label={`${prize.name} 最小中奖间隔`}
          type="number"
          min={0}
          step={1}
          value={draft.minIntervalMinutes}
          onChange={(event) => onUpdateDraft(prize.id, { minIntervalMinutes: toNonNegativeInteger(event.target.value) })}
        />
      </label>
      <label className="admin-checkbox">
        <input
          type="checkbox"
          checked={draft.catchUpEnabled}
          onChange={(event) => onUpdateDraft(prize.id, { catchUpEnabled: event.target.checked })}
        />
        闭展前追赶
      </label>
    </div>
  );
}

function AdvancedControls({
  draft,
  prize,
  onUpdateDraft,
}: {
  draft: ProbabilityDraft;
  prize: Prize;
  onUpdateDraft: (prizeId: string, patch: Partial<ProbabilityDraft>) => void;
}) {
  return (
    <div className="probability-advanced">
      <strong>高级算法参数</strong>
      <span>基础权重 {draft.probability.toFixed(1)}</span>
      <span>最小倍率 {draft.minMultiplier.toFixed(1)}</span>
      <span>最大倍率 {draft.maxMultiplier.toFixed(1)}</span>
      <label>
        响应强度
        <input
          aria-label={`${prize.name} 响应强度`}
          type="number"
          min={0.1}
          max={1}
          step={0.1}
          value={draft.sensitivity}
          onChange={(event) => onUpdateDraft(prize.id, { sensitivity: toProbability(event.target.value) })}
        />
      </label>
    </div>
  );
}

function InventoryRiskBadge({ risk }: { risk?: InventoryRisk }) {
  if (!risk) {
    return <StatusBadge tone="neutral">未计算</StatusBadge>;
  }

  if (risk.status === 'warning') {
    return <StatusBadge tone="warning">库存风险</StatusBadge>;
  }

  if (risk.status === 'disabled') {
    return <StatusBadge tone="neutral">已停用</StatusBadge>;
  }

  return <StatusBadge tone="success">正常</StatusBadge>;
}

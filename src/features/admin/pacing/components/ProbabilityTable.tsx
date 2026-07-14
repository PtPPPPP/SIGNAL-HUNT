import { useMemo, useState } from 'react';

import { AdminButton, EmptyState, StatusBadge } from '../../../../components/ui/AdminUI';
import { calculatePrizePacing } from '../../../../domain/draw/prizePacing';
import { calculateExpectedWins, type InventoryRisk } from '../../../../domain/draw/prizeProbability';
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

const strategyOptions: ReadonlyArray<{
  value: DistributionStrategy;
  label: string;
  description: string;
}> = [
  {
    value: 'RANDOM',
    label: '普通随机',
    description: '按当前概率即时抽取，不主动调整活动前后期的发放节奏。',
  },
  {
    value: 'EVEN',
    label: '均匀发放',
    description: '根据活动进度和已发数量动态调节，减少大奖过早发完或后期积压。',
  },
  {
    value: 'CUSTOM_TIME',
    label: '自定义时间',
    description: '沿用该奖项已有的分时释放表，在指定时间点逐步开放库存。',
  },
];

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
  const [expandedPrizeId, setExpandedPrizeId] = useState<string>();
  const riskByPrizeId = useMemo(() => new Map(risks.map((risk) => [risk.prizeId, risk])), [risks]);

  if (prizes.length === 0) {
    return (
      <section className="admin-panel">
        <EmptyState title="暂无奖项，无法配置概率" />
      </section>
    );
  }

  return (
    <section className="admin-panel probability-config-panel" aria-labelledby="probability-config-title">
      <div className="admin-panel-header probability-section-heading">
        <div>
          <p>奖项策略</p>
          <h2 id="probability-config-title">逐项配置中奖概率与发放策略</h2>
        </div>
        <span className="admin-helper">智能参数默认收起，需要时按奖项展开。</span>
      </div>

      <div className="probability-table" role="table" aria-label="奖项概率策略">
        <div className="probability-table-header probability-table-grid" role="row">
          <span role="columnheader">奖项</span>
          <span role="columnheader">中奖概率</span>
          <span role="columnheader">剩余库存</span>
          <span role="columnheader">预计中奖</span>
          <span role="columnheader">发放方式</span>
          <span role="columnheader">状态</span>
          <span role="columnheader">操作</span>
        </div>

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
              expanded={expandedPrizeId === prize.id}
              expectedParticipants={expectedParticipants}
              key={prize.id}
              mode={mode}
              prize={prize}
              risk={riskByPrizeId.get(prize.id)}
              snapshotMultiplier={snapshot.multiplier}
              onToggleExpanded={() =>
                setExpandedPrizeId((currentPrizeId) => (currentPrizeId === prize.id ? undefined : prize.id))
              }
              onUpdateDraft={onUpdateDraft}
            />
          );
        })}
      </div>
    </section>
  );
}

function ProbabilityRow({
  draft,
  expanded,
  expectedParticipants,
  mode,
  prize,
  risk,
  snapshotMultiplier,
  onToggleExpanded,
  onUpdateDraft,
}: {
  draft: ProbabilityDraft;
  expanded: boolean;
  expectedParticipants: number;
  mode: PacingMode;
  prize: Prize;
  risk?: InventoryRisk;
  snapshotMultiplier: number;
  onToggleExpanded: () => void;
  onUpdateDraft: (prizeId: string, patch: Partial<ProbabilityDraft>) => void;
}) {
  const idPrefix = `strategy-${prize.id}`;
  const expectedWins = calculateExpectedWins(draft.probability, expectedParticipants);
  const selectedStrategy = strategyOptions.find((option) => option.value === draft.strategy) ?? strategyOptions[0];

  return (
    <div className={`probability-row-group${expanded ? ' expanded' : ''}`} role="rowgroup">
      <div className="probability-table-row probability-table-grid" role="row">
        <div className="probability-table-cell probability-prize-cell" role="cell">
          <span className="probability-cell-label">奖项</span>
          <strong id={`${idPrefix}-title`}>{prize.name}</strong>
          <small>{prize.level} 级奖项</small>
        </div>

        <div className="probability-table-cell" role="cell">
          <label className="probability-cell-label" htmlFor={`${idPrefix}-probability`}>
            中奖概率
          </label>
          <div className="probability-inline-number">
            <input
              id={`${idPrefix}-probability`}
              aria-label={`${prize.name} 中奖概率`}
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={draft.probability}
              onChange={(event) => onUpdateDraft(prize.id, { probability: toProbability(event.target.value) })}
            />
            <span aria-hidden="true">%</span>
          </div>
        </div>

        <div className="probability-table-cell probability-metric-cell" role="cell">
          <span className="probability-cell-label">剩余库存</span>
          <strong>{prize.inventoryRemaining}</strong>
          <span>/ {prize.inventoryTotal}</span>
        </div>

        <div className="probability-table-cell probability-expected-cell" role="cell">
          <span className="probability-cell-label">预计中奖</span>
          <strong>约 {formatCount(expectedWins)} 人</strong>
        </div>

        <div className="probability-table-cell" role="cell">
          <span className="probability-cell-label">发放方式</span>
          {mode === 'simple' ? (
            <span className="probability-static-value">按概率随机</span>
          ) : (
            <DistributionStrategySelect
              draft={draft}
              prize={prize}
              onUpdateDraft={onUpdateDraft}
            />
          )}
        </div>

        <div className="probability-table-cell probability-status-cell" role="cell">
          <span className="probability-cell-label">状态</span>
          <InventoryRiskBadge risk={risk} />
        </div>

        <div className="probability-table-cell probability-action-cell" role="cell">
          <span className="probability-cell-label">操作</span>
          <AdminButton
            ariaControls={`${idPrefix}-details`}
            ariaExpanded={expanded}
            ariaLabel={`${prize.name} ${expanded ? '收起设置' : mode === 'simple' ? '配置奖项' : '配置智能策略'}`}
            variant="secondary"
            onClick={onToggleExpanded}
          >
            {expanded ? '收起设置' : mode === 'simple' ? '配置奖项' : '配置智能策略'}
          </AdminButton>
        </div>
      </div>

      {expanded ? (
        <section
          className="probability-expanded-panel"
          id={`${idPrefix}-details`}
          aria-labelledby={`${idPrefix}-details-title`}
        >
          <header className="probability-expanded-header">
            <div>
              <p>当前奖项配置</p>
              <h3 id={`${idPrefix}-details-title`}>{prize.name}</h3>
            </div>
            <span>{mode === 'simple' ? '基础设置' : selectedStrategy.label}</span>
          </header>

          <div className="probability-expanded-grid">
            <section className="probability-setting-card">
              <div>
                <h4>概率锁定</h4>
                <p>锁定后，自动平衡不会改动该奖项的中奖概率。</p>
              </div>
              <StrategySwitch
                ariaLabel={`${prize.name} 锁定中奖概率`}
                checked={draft.locked}
                label={draft.locked ? '已锁定' : '允许自动平衡'}
                onChange={(checked) => onUpdateDraft(prize.id, { locked: checked })}
              />
            </section>

            <section className="probability-setting-card">
              <div>
                <h4>效果预览</h4>
                <p>{risk?.message ?? '当前参与人数和库存条件下未发现明显风险。'}</p>
              </div>
              <strong>预计发放 {formatCount(expectedWins)} 件</strong>
            </section>
          </div>

          {mode !== 'simple' ? (
            <SmartPacingPanel
              description={selectedStrategy.description}
              draft={draft}
              mode={mode}
              prize={prize}
              snapshotMultiplier={snapshotMultiplier}
              onUpdateDraft={onUpdateDraft}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function DistributionStrategySelect({
  draft,
  prize,
  onUpdateDraft,
}: {
  draft: ProbabilityDraft;
  prize: Prize;
  onUpdateDraft: (prizeId: string, patch: Partial<ProbabilityDraft>) => void;
}) {
  return (
    <select
      className="probability-strategy-select"
      aria-label={`${prize.name} 发放方式`}
      value={draft.strategy}
      onChange={(event) =>
        onUpdateDraft(prize.id, { strategy: event.target.value as DistributionStrategy })
      }
    >
      {strategyOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function SmartPacingPanel({
  description,
  draft,
  mode,
  prize,
  snapshotMultiplier,
  onUpdateDraft,
}: {
  description: string;
  draft: ProbabilityDraft;
  mode: PacingMode;
  prize: Prize;
  snapshotMultiplier: number;
  onUpdateDraft: (prizeId: string, patch: Partial<ProbabilityDraft>) => void;
}) {
  return (
    <section className="smart-pacing-panel" aria-label={`${prize.name} 智能设置`}>
      <header>
        <div>
          <p>智能设置</p>
          <h4>{strategyOptions.find((option) => option.value === draft.strategy)?.label}</h4>
        </div>
        {draft.strategy === 'EVEN' ? <strong>当前相对倍率 {snapshotMultiplier.toFixed(2)} 倍</strong> : null}
      </header>
      <p className="smart-pacing-description">{description}</p>

      {draft.strategy === 'EVEN' ? (
        <SmartControls draft={draft} prize={prize} onUpdateDraft={onUpdateDraft} />
      ) : null}
      {mode === 'advanced' && draft.strategy === 'EVEN' ? (
        <AdvancedControls draft={draft} prize={prize} onUpdateDraft={onUpdateDraft} />
      ) : null}
    </section>
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
  const helpId = `strategy-${prize.id}-interval-help`;

  return (
    <div className="strategy-parameter-grid">
      <div className="strategy-compact-field">
        <label htmlFor={`strategy-${prize.id}-interval`}>最小中奖间隔</label>
        <div className="strategy-compact-number">
          <input
            id={`strategy-${prize.id}-interval`}
            aria-label={`${prize.name} 最小中奖间隔`}
            aria-describedby={helpId}
            type="number"
            min={0}
            step={1}
            value={draft.minIntervalMinutes}
            onChange={(event) =>
              onUpdateDraft(prize.id, { minIntervalMinutes: toNonNegativeInteger(event.target.value) })
            }
          />
          <span>分钟</span>
        </div>
        <small id={helpId}>设为 0 表示不限制两次中奖之间的间隔。</small>
      </div>

      <div className="strategy-switch-setting">
        <div>
          <strong>闭展前追赶</strong>
          <p>活动后期发放偏慢时提高相对权重，仍受库存约束。</p>
        </div>
        <StrategySwitch
          ariaLabel={`${prize.name} 闭展前追赶`}
          checked={draft.catchUpEnabled}
          label={draft.catchUpEnabled ? '已开启' : '已关闭'}
          onChange={(checked) => onUpdateDraft(prize.id, { catchUpEnabled: checked })}
        />
      </div>
    </div>
  );
}

function StrategySwitch({
  ariaLabel,
  checked,
  label,
  onChange,
}: {
  ariaLabel: string;
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="strategy-switch">
      <input
        type="checkbox"
        role="switch"
        aria-label={ariaLabel}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="strategy-switch-track" aria-hidden="true" />
      <span className="strategy-switch-label">{label}</span>
    </label>
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
    <div className="strategy-advanced-panel" aria-label={`${prize.name} 高级算法参数`}>
      <div className="strategy-advanced-heading">
        <h4>高级算法参数</h4>
        <p>仅供需要精细调节智能发放响应速度的工作人员使用。</p>
      </div>
      <dl className="strategy-metrics strategy-metrics-three">
        <div>
          <dt>基础权重</dt>
          <dd>{draft.probability.toFixed(1)}</dd>
        </div>
        <div>
          <dt>最小倍率</dt>
          <dd>{draft.minMultiplier.toFixed(1)}</dd>
        </div>
        <div>
          <dt>最大倍率</dt>
          <dd>{draft.maxMultiplier.toFixed(1)}</dd>
        </div>
      </dl>
      <div className="strategy-compact-field">
        <label htmlFor={`strategy-${prize.id}-sensitivity`}>响应强度</label>
        <input
          id={`strategy-${prize.id}-sensitivity`}
          aria-label={`${prize.name} 响应强度`}
          aria-describedby={`strategy-${prize.id}-sensitivity-help`}
          type="number"
          min={0.1}
          max={1}
          step={0.1}
          value={draft.sensitivity}
          onChange={(event) => onUpdateDraft(prize.id, { sensitivity: toProbability(event.target.value) })}
        />
        <small id={`strategy-${prize.id}-sensitivity-help`}>数值越高，系统对发放进度偏差的调整越快。</small>
      </div>
    </div>
  );
}

function InventoryRiskBadge({ risk }: { risk?: InventoryRisk }) {
  if (!risk) return <StatusBadge tone="neutral">未计算</StatusBadge>;
  if (risk.status === 'warning') return <StatusBadge tone="warning">库存风险</StatusBadge>;
  if (risk.status === 'disabled') return <StatusBadge tone="neutral">已停用</StatusBadge>;
  return <StatusBadge tone="success">正常</StatusBadge>;
}

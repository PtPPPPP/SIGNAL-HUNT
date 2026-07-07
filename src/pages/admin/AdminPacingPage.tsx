import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminButton, EmptyState, StatusBadge, type BadgeTone } from '../../components/ui/AdminUI';
import { listDrawRecords, listPrizes, replacePrizes } from '../../db/adminRepository';
import { getActiveEvent } from '../../db/drawRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { calculatePrizePacing } from '../../domain/draw/prizePacing';
import {
  autoBalanceProbabilities,
  calculateExpectedWins,
  generateInventoryProbabilitySuggestion,
  getInventoryRisks,
  getProbabilityTotalStatus,
  percentageConfigToWeights,
  type InventoryRisk,
} from '../../domain/draw/prizeProbability';
import type { DrawRecord, Event, Prize, PrizeProbabilityMode } from '../../domain/draw/types';
import { AdminLayout } from './AdminLayout';

type AdminPacingPageProps = {
  db?: SignalHuntDatabase;
};

type SettingMode = 'simple' | 'smart' | 'advanced';

type DistributionStrategy = 'RANDOM' | 'EVEN' | 'CUSTOM_TIME';

type ProbabilityDraft = {
  prizeId: string;
  probability: number;
  locked: boolean;
  strategy: DistributionStrategy;
  minIntervalMinutes: number;
  catchUpEnabled: boolean;
  catchUpStartBeforeEndMinutes: number;
  sensitivity: number;
  minMultiplier: number;
  maxMultiplier: number;
};

const DEFAULT_EXPECTED_PARTICIPANTS = 500;

const strategyByMode: Record<PrizeProbabilityMode, DistributionStrategy> = {
  FIXED: 'RANDOM',
  TIME_RELEASE: 'CUSTOM_TIME',
  SMART_PACING: 'EVEN',
};

export function AdminPacingPage({ db = signalHuntDatabase }: AdminPacingPageProps) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [records, setRecords] = useState<DrawRecord[]>([]);
  const [activeEvent, setActiveEvent] = useState<Event | undefined>(undefined);
  const [drafts, setDrafts] = useState<ProbabilityDraft[]>([]);
  const [mode, setMode] = useState<SettingMode>('simple');
  const [expectedParticipants, setExpectedParticipants] = useState(DEFAULT_EXPECTED_PARTICIPANTS);
  const [lastEditedPrizeId, setLastEditedPrizeId] = useState<string | undefined>(undefined);
  const [suggestion, setSuggestion] = useState<ProbabilityDraft[] | undefined>(undefined);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const [nextPrizes, nextRecords, event] = await Promise.all([
      listPrizes(db),
      listDrawRecords(db),
      getActiveEvent(db),
    ]);

    setPrizes(nextPrizes);
    setRecords(nextRecords);
    setActiveEvent(event);
    setDrafts((currentDrafts) => createDraftsFromPrizes(nextPrizes, currentDrafts));
  }, [db]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalStatus = useMemo(() => getProbabilityTotalStatus(drafts), [drafts]);
  const risks = useMemo(
    () => getInventoryRisks(prizes, drafts, expectedParticipants),
    [drafts, expectedParticipants, prizes],
  );
  const risksByPrizeId = useMemo(() => new Map(risks.map((risk) => [risk.prizeId, risk])), [risks]);
  const saveDisabled = totalStatus.state !== 'valid' || prizes.length === 0 || saving;

  const updateDraft = (prizeId: string, patch: Partial<ProbabilityDraft>) => {
    setLastEditedPrizeId(prizeId);
    setDrafts((currentDrafts) =>
      currentDrafts.map((draft) => (draft.prizeId === prizeId ? { ...draft, ...patch } : draft)),
    );
    setMessage('');
  };

  const handleAutoBalance = () => {
    try {
      setDrafts((currentDrafts) => mergeBalancedProbabilities(currentDrafts, lastEditedPrizeId));
      setMessage('已按未锁定奖项的当前比例自动平衡到 100%。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '自动平衡失败。');
    }
  };

  const handleGenerateSuggestion = () => {
    const suggestedItems = generateInventoryProbabilitySuggestion(prizes, expectedParticipants);
    setSuggestion(mergeSuggestionWithDrafts(suggestedItems, drafts));
    setMessage('已生成建议方案，确认后才会应用到当前配置。');
  };

  const handleApplySuggestion = () => {
    if (!suggestion) {
      return;
    }

    setDrafts(suggestion);
    setSuggestion(undefined);
    setMessage('建议方案已应用到当前页面，保存后才会写入抽奖配置。');
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const weights = percentageConfigToWeights(drafts);
      const weightByPrizeId = new Map(weights.map((item) => [item.prizeId, item.weight]));
      const draftByPrizeId = new Map(drafts.map((draft) => [draft.prizeId, draft]));
      const nextPrizes = prizes.map((prize) => {
        const draft = draftByPrizeId.get(prize.id);

        if (!draft) {
          return prize;
        }

        return applyDraftToPrize(prize, draft, weightByPrizeId.get(prize.id) ?? prize.weight);
      });

      await replacePrizes(db, nextPrizes);
      await refresh();
      setMessage('已保存并应用。下一次尚未开始的抽奖会使用新配置；已提交的结果不会改变。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="抽奖概率与发放策略">
      <section className="admin-panel probability-hero">
        <div className="admin-panel-header">
          <div>
            <p>Quantum Design Prize Probability Control Center</p>
            <h2>抽奖概率与发放策略</h2>
          </div>
          <StatusBadge tone={activeEvent ? 'success' : 'warning'}>
            {activeEvent ? `当前活动 ${activeEvent.code}` : 'NO ACTIVE EVENT'}
          </StatusBadge>
        </div>
        <p className="admin-helper">
          这里直接编辑百分比。保存时系统会把百分比转换为真实 weight，并继续使用现有 secure weighted selection。
        </p>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <p>Event Estimate</p>
            <h2>活动预估</h2>
          </div>
          <AdminButton variant="secondary" onClick={handleGenerateSuggestion} disabled={prizes.length === 0}>
            根据库存生成建议概率
          </AdminButton>
        </div>
        <div className="probability-estimate-grid">
          <label>
            预计参与人数
            <input
              aria-label="预计参与人数"
              type="number"
              min={1}
              step={1}
              value={expectedParticipants}
              onChange={(event) => setExpectedParticipants(toPositiveInteger(event.target.value))}
            />
          </label>
          <div>
            <span>活动时间</span>
            <strong>{formatEventWindow(activeEvent)}</strong>
          </div>
          <div>
            <span>合计概率</span>
            <strong>{totalStatus.total.toFixed(1)}%</strong>
          </div>
          <div>
            <span>状态</span>
            <StatusBadge tone={toneForTotal(totalStatus.state)}>{labelForTotal(totalStatus)}</StatusBadge>
          </div>
        </div>
      </section>

      {suggestion ? (
        <section className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <p>Suggestion Preview</p>
              <h2>建议方案预览</h2>
            </div>
            <div className="admin-toolbar">
              <AdminButton variant="secondary" onClick={() => setSuggestion(undefined)}>
                取消
              </AdminButton>
              <AdminButton onClick={handleApplySuggestion}>应用建议</AdminButton>
            </div>
          </div>
          <div className="probability-diff-grid">
            {suggestion.map((draft) => {
              const prize = prizes.find((item) => item.id === draft.prizeId);
              const current = drafts.find((item) => item.prizeId === draft.prizeId)?.probability ?? 0;
              return (
                <div key={draft.prizeId}>
                  <strong>{prize?.name ?? draft.prizeId}</strong>
                  <span>
                    {current.toFixed(1)}% → {draft.probability.toFixed(1)}%
                  </span>
                  <StatusBadge tone={draft.probability >= current ? 'brand' : 'neutral'}>
                    {formatSigned(draft.probability - current)}%
                  </StatusBadge>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <p>Mode</p>
            <h2>设置模式</h2>
          </div>
          <div className="probability-mode-selector" aria-label="设置模式">
            <AdminButton variant={mode === 'simple' ? 'primary' : 'secondary'} onClick={() => setMode('simple')}>
              简单模式
            </AdminButton>
            <AdminButton variant={mode === 'smart' ? 'primary' : 'secondary'} onClick={() => setMode('smart')}>
              智能模式
            </AdminButton>
            <AdminButton variant={mode === 'advanced' ? 'primary' : 'secondary'} onClick={() => setMode('advanced')}>
              高级模式
            </AdminButton>
          </div>
        </div>

        {prizes.length > 0 ? (
          <table className="admin-table probability-table">
            <thead>
              <tr>
                <th>Prize</th>
                <th>Probability</th>
                <th>Inventory</th>
                <th>Estimated Wins</th>
                <th>Distribution</th>
                <th>Lock</th>
                <th>Status</th>
                {mode !== 'simple' ? <th>Smart Controls</th> : null}
                {mode === 'advanced' ? <th>Advanced</th> : null}
              </tr>
            </thead>
            <tbody>
              {prizes.map((prize) => {
                const draft = drafts.find((item) => item.prizeId === prize.id) ?? createDraftFromPrize(prize, 0);
                const snapshot = calculatePrizePacing({ prize: applyDraftToPrize(prize, draft, draft.probability), event: activeEvent, records });
                const risk = risksByPrizeId.get(prize.id);

                return (
                  <tr key={prize.id}>
                    <td>
                      <strong>{prize.name}</strong>
                      <span className="probability-row-note">当前有效权重 {snapshot.effectiveWeight.toFixed(2)}</span>
                    </td>
                    <td>
                      <label className="probability-input">
                        <span>{prize.name}中奖概率</span>
                        <input
                          aria-label={`${prize.name}中奖概率`}
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={draft.probability}
                          onChange={(event) => updateDraft(prize.id, { probability: toProbability(event.target.value) })}
                        />
                        <em>%</em>
                      </label>
                    </td>
                    <td>{prize.inventoryRemaining} / {prize.inventoryTotal}</td>
                    <td>预计约 {formatCount(calculateExpectedWins(draft.probability, expectedParticipants))} 人</td>
                    <td>
                      <select
                        aria-label={`${prize.name}发放策略`}
                        value={draft.strategy}
                        onChange={(event) =>
                          updateDraft(prize.id, { strategy: event.target.value as DistributionStrategy })
                        }
                      >
                        <option value="RANDOM">普通随机</option>
                        <option value="EVEN">均匀发放</option>
                        <option value="CUSTOM_TIME">自定义时间</option>
                      </select>
                    </td>
                    <td>
                      <AdminButton
                        variant={draft.locked ? 'primary' : 'secondary'}
                        onClick={() => updateDraft(prize.id, { locked: !draft.locked })}
                      >
                        {draft.locked ? `已锁定 ${prize.name}` : `锁定 ${prize.name}`}
                      </AdminButton>
                    </td>
                    <td>
                      <InventoryRiskBadge risk={risk} />
                    </td>
                    {mode !== 'simple' ? (
                      <td>
                        <div className="probability-smart-controls">
                          <label className="admin-checkbox">
                            <input
                              type="checkbox"
                              checked={draft.strategy === 'EVEN'}
                              onChange={(event) =>
                                updateDraft(prize.id, { strategy: event.target.checked ? 'EVEN' : 'RANDOM' })
                              }
                            />
                            大奖保护
                          </label>
                          <label>
                            最小间隔
                            <input
                              aria-label={`${prize.name}最小中奖间隔`}
                              type="number"
                              min={0}
                              step={1}
                              value={draft.minIntervalMinutes}
                              onChange={(event) =>
                                updateDraft(prize.id, { minIntervalMinutes: toNonNegativeInteger(event.target.value) })
                              }
                            />
                          </label>
                          <label className="admin-checkbox">
                            <input
                              type="checkbox"
                              checked={draft.catchUpEnabled}
                              onChange={(event) => updateDraft(prize.id, { catchUpEnabled: event.target.checked })}
                            />
                            闭展前追赶
                          </label>
                        </div>
                      </td>
                    ) : null}
                    {mode === 'advanced' ? (
                      <td>
                        <div className="probability-advanced">
                          <strong>高级算法参数</strong>
                          <span>Base Weight {draft.probability.toFixed(1)}</span>
                          <span>Multiplier {snapshot.multiplier.toFixed(2)}x</span>
                          <label>
                            Sensitivity
                            <input
                              aria-label={`${prize.name}Sensitivity`}
                              type="number"
                              min={0.1}
                              max={1}
                              step={0.1}
                              value={draft.sensitivity}
                              onChange={(event) => updateDraft(prize.id, { sensitivity: toProbability(event.target.value) })}
                            />
                          </label>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState title="暂无奖项，无法配置概率" />
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <p>Preview</p>
            <h2>当前策略预览</h2>
          </div>
          <StatusBadge tone={toneForTotal(totalStatus.state)}>{labelForTotal(totalStatus)}</StatusBadge>
        </div>
        <div className="probability-diff-grid">
          {prizes.map((prize) => {
            const draft = drafts.find((item) => item.prizeId === prize.id);
            const current = probabilityFromWeights(prize.weight, prizes);
            const next = draft?.probability ?? 0;

            return (
              <div key={prize.id}>
                <strong>{prize.name}</strong>
                <span>
                  修改前 {current.toFixed(1)}% / 修改后 {next.toFixed(1)}%
                </span>
                <StatusBadge tone={Math.abs(next - current) < 0.1 ? 'neutral' : 'brand'}>
                  {formatSigned(next - current)}%
                </StatusBadge>
              </div>
            );
          })}
        </div>
        {risks.filter((risk) => risk.status === 'warning').map((risk) => (
          <p className="admin-error" key={risk.prizeId}>
            {risk.message}
          </p>
        ))}
      </section>

      <section className="probability-action-bar">
        <AdminButton variant="secondary" onClick={() => setDrafts(createDraftsFromPrizes(prizes, []))}>
          放弃修改
        </AdminButton>
        <AdminButton variant="secondary" onClick={handleAutoBalance} disabled={prizes.length === 0}>
          自动平衡
        </AdminButton>
        <AdminButton variant="secondary" onClick={() => setMessage('草稿只保留在当前页面，未写入真实抽奖配置。')}>
          保存草稿
        </AdminButton>
        <AdminButton onClick={() => void handleSave()} disabled={saveDisabled}>
          保存并应用
        </AdminButton>
        {message ? <p className="admin-message">{message}</p> : null}
      </section>
    </AdminLayout>
  );
}

function createDraftsFromPrizes(prizes: readonly Prize[], existingDrafts: readonly ProbabilityDraft[]): ProbabilityDraft[] {
  const existingByPrizeId = new Map(existingDrafts.map((draft) => [draft.prizeId, draft]));
  return prizes.map((prize) => {
    const existing = existingByPrizeId.get(prize.id);
    return existing ? { ...existing } : createDraftFromPrize(prize, probabilityFromWeights(prize.weight, prizes));
  });
}

function createDraftFromPrize(prize: Prize, probability: number): ProbabilityDraft {
  return {
    prizeId: prize.id,
    probability,
    locked: false,
    strategy: strategyByMode[prize.probabilityMode ?? 'FIXED'],
    minIntervalMinutes: prize.pacing?.minIntervalMinutes ?? 0,
    catchUpEnabled: Boolean(prize.pacing?.catchUpEnabled),
    catchUpStartBeforeEndMinutes: prize.pacing?.catchUpStartBeforeEndMinutes ?? 60,
    sensitivity: prize.pacing?.sensitivity ?? 0.5,
    minMultiplier: prize.pacing?.minMultiplier ?? 0.2,
    maxMultiplier: prize.pacing?.maxMultiplier ?? 3,
  };
}

function applyDraftToPrize(prize: Prize, draft: ProbabilityDraft, weight: number): Prize {
  const probabilityMode = probabilityModeFromStrategy(draft.strategy);
  const pacing =
    probabilityMode === 'FIXED'
      ? undefined
      : {
          minMultiplier: draft.minMultiplier,
          maxMultiplier: draft.maxMultiplier,
          sensitivity: draft.sensitivity,
          minIntervalMinutes: draft.minIntervalMinutes,
          catchUpEnabled: draft.catchUpEnabled,
          catchUpStartBeforeEndMinutes: draft.catchUpStartBeforeEndMinutes,
          catchUpMaxMultiplier: Math.max(draft.maxMultiplier, 4),
          releaseSchedule: prize.pacing?.releaseSchedule,
        };

  return {
    ...prize,
    weight,
    probabilityMode,
    pacing,
  };
}

function probabilityModeFromStrategy(strategy: DistributionStrategy): PrizeProbabilityMode {
  if (strategy === 'EVEN') {
    return 'SMART_PACING';
  }

  if (strategy === 'CUSTOM_TIME') {
    return 'TIME_RELEASE';
  }

  return 'FIXED';
}

function mergeSuggestionWithDrafts(
  suggestions: readonly { prizeId: string; probability: number }[],
  drafts: readonly ProbabilityDraft[],
): ProbabilityDraft[] {
  const probabilityByPrizeId = new Map(suggestions.map((item) => [item.prizeId, item.probability]));
  return drafts.map((draft) => ({
    ...draft,
    probability: probabilityByPrizeId.get(draft.prizeId) ?? draft.probability,
    locked: false,
  }));
}

function mergeBalancedProbabilities(
  drafts: readonly ProbabilityDraft[],
  editedPrizeId: string | undefined,
): ProbabilityDraft[] {
  const balanced = autoBalanceProbabilities(drafts, editedPrizeId);
  const probabilityByPrizeId = new Map(balanced.map((item) => [item.prizeId, item.probability]));

  return drafts.map((draft) => ({
    ...draft,
    probability: probabilityByPrizeId.get(draft.prizeId) ?? draft.probability,
  }));
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

function probabilityFromWeights(weight: number, prizes: readonly Prize[]): number {
  const totalWeight = prizes.reduce((sum, prize) => sum + (Number.isFinite(prize.weight) ? prize.weight : 0), 0);

  if (totalWeight <= 0) {
    return 0;
  }

  return Math.round((weight / totalWeight) * 1000) / 10;
}

function labelForTotal(status: { state: string; difference: number }): string {
  if (status.state === 'valid') {
    return '配置有效';
  }

  if (status.state === 'under') {
    return `还差 ${status.difference.toFixed(1)}%`;
  }

  return `超出 ${status.difference.toFixed(1)}%`;
}

function toneForTotal(state: string): BadgeTone {
  return state === 'valid' ? 'success' : 'warning';
}

function formatEventWindow(event: Event | undefined): string {
  if (!event?.startAt || !event.endAt) {
    return '未设置';
  }

  return `${formatTime(event.startAt)} - ${formatTime(event.endAt)}`;
}

function formatTime(value: string): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function toProbability(value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(parsed * 10) / 10));
}

function toPositiveInteger(value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.round(parsed);
}

function toNonNegativeInteger(value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed);
}

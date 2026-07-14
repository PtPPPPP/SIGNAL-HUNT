import { useCallback, useEffect, useMemo, useState } from 'react';

import { listDrawRecords, listPrizes, replacePrizes } from '../../../db/adminRepository';
import { getConfiguredActiveEvent } from '../../../db/drawRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../../db/database';
import {
  generateInventoryProbabilitySuggestion,
  getInventoryRisks,
  getProbabilityTotalStatus,
  percentageConfigToWeights,
} from '../../../domain/draw/prizeProbability';
import type { ProbabilityDraft, PacingMode, PacingPreview } from './types';
import {
  applyDraftToPrize,
  createDraftsFromPrizes,
  DEFAULT_EXPECTED_PARTICIPANTS,
  mergeBalancedProbabilities,
  mergeSuggestionWithDrafts,
  toPositiveInteger,
} from './pacingDraft';
import type { DrawRecord, Event, Prize } from '../../../domain/draw/types';
import { publishAppChange } from '../../sync/appSync';

export function usePacingConfig(db: SignalHuntDatabase = signalHuntDatabase) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [records, setRecords] = useState<DrawRecord[]>([]);
  const [activeEvent, setActiveEvent] = useState<Event | undefined>(undefined);
  const [drafts, setDrafts] = useState<ProbabilityDraft[]>([]);
  const [mode, setMode] = useState<PacingMode>('simple');
  const [expectedParticipants, setExpectedParticipantsState] = useState(DEFAULT_EXPECTED_PARTICIPANTS);
  const [lastEditedPrizeId, setLastEditedPrizeId] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<PacingPreview | undefined>(undefined);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const refresh = useCallback(async () => {
    const [nextPrizes, nextRecords, event] = await Promise.all([
      listPrizes(db),
      listDrawRecords(db),
      getConfiguredActiveEvent(db),
    ]);

    setPrizes(nextPrizes);
    setRecords(nextRecords);
    setActiveEvent(event);
    setDrafts((currentDrafts) => createDraftsFromPrizes(nextPrizes, currentDrafts));
  }, [db]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const totalStatus = useMemo(() => getProbabilityTotalStatus(drafts), [drafts]);
  const risks = useMemo(
    () => getInventoryRisks(prizes, drafts, expectedParticipants),
    [drafts, expectedParticipants, prizes],
  );

  const updateDraft = useCallback((prizeId: string, patch: Partial<ProbabilityDraft>) => {
    setLastEditedPrizeId(prizeId);
    setDrafts((currentDrafts) =>
      currentDrafts.map((draft) => (draft.prizeId === prizeId ? { ...draft, ...patch } : draft)),
    );
    setHasUnsavedChanges(true);
    setMessage('');
  }, []);

  const setExpectedParticipants = useCallback((value: string) => {
    setExpectedParticipantsState(toPositiveInteger(value));
    setMessage('');
  }, []);

  const resetDrafts = useCallback(() => {
    setDrafts(createDraftsFromPrizes(prizes, []));
    setPreview(undefined);
    setHasUnsavedChanges(false);
    setMessage('已放弃本页未保存修改。');
  }, [prizes]);

  const prepareAutoBalance = useCallback(() => {
    try {
      const balancedDrafts = mergeBalancedProbabilities(drafts, lastEditedPrizeId);
      setPreview({ title: '自动平衡预览', drafts: balancedDrafts });
      setMessage('请先确认自动平衡预览，确认后才会改动当前草稿。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '自动平衡失败。');
    }
  }, [drafts, lastEditedPrizeId]);

  const prepareInventorySuggestion = useCallback(() => {
    const suggestedItems = generateInventoryProbabilitySuggestion(prizes, expectedParticipants);
    setPreview({
      title: '库存建议预览',
      drafts: mergeSuggestionWithDrafts(suggestedItems, drafts),
    });
    setMessage('已根据库存生成建议，确认后才会改动当前草稿。');
  }, [drafts, expectedParticipants, prizes]);

  const applyPreview = useCallback(() => {
    if (!preview) {
      return;
    }

    setDrafts(preview.drafts);
    setPreview(undefined);
    setHasUnsavedChanges(true);
    setMessage('预览已应用到当前草稿，保存后才会写入真实抽奖配置。');
  }, [preview]);

  const save = useCallback(async () => {
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
      publishAppChange('PACING_UPDATED', activeEvent?.id);
      await refresh();
      setHasUnsavedChanges(false);
      setMessage('配置已保存。从下一次新抽奖开始生效；已经提交的结果不会改变。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败。');
    } finally {
      setSaving(false);
    }
  }, [activeEvent?.id, db, drafts, prizes, refresh]);

  return {
    activeEvent,
    drafts,
    expectedParticipants,
    hasUnsavedChanges,
    message,
    mode,
    preview,
    prizes,
    records,
    risks,
    saving,
    totalStatus,
    applyPreview,
    prepareAutoBalance,
    prepareInventorySuggestion,
    resetDrafts,
    save,
    setExpectedParticipants,
    setMode,
    setPreview,
    updateDraft,
  };
}

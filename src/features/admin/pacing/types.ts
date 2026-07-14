import type { PrizePacingSnapshot } from '../../../domain/draw/prizePacing';
import type { DrawRecord, Event, Prize } from '../../../domain/draw/types';

export type PacingMode = 'simple' | 'smart' | 'advanced';

export type DistributionStrategy = 'RANDOM' | 'EVEN' | 'CUSTOM_TIME';

export type ProbabilityDraft = {
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

export type PacingData = {
  prizes: Prize[];
  records: DrawRecord[];
  activeEvent?: Event;
};

export type PacingPreview = {
  title: string;
  drafts: ProbabilityDraft[];
};

export type PrizeRowView = {
  prize: Prize;
  draft: ProbabilityDraft;
  snapshot: PrizePacingSnapshot;
};

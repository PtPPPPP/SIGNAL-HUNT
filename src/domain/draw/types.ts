export type EventStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';

export interface Event {
  id: string;
  name: string;
  code: string;
  status: EventStatus;
  createdAt: string;
  /**
   * Optional ISO-8601 exhibition window. Non-indexed and optional: events created
   * before v2 simply have undefined values and remain valid.
   */
  startAt?: string;
  endAt?: string;
  participationWindows?: EventParticipationWindow[];
}

export interface EventParticipationWindow {
  startAt: string;
  endAt: string;
}

export interface Prize {
  id: string;
  name: string;
  shortName: string;
  level: number;
  inventoryTotal: number;
  inventoryRemaining: number;
  weight: number;
  enabled: boolean;
  imageUrl?: string;
  probabilityMode?: PrizeProbabilityMode;
  pacing?: PrizePacingConfig;
}

export type PrizeProbabilityMode = 'FIXED' | 'TIME_RELEASE' | 'SMART_PACING';

export interface PrizeReleasePoint {
  time: string;
  maxCumulativeWins: number;
}

export interface PrizePacingConfig {
  minMultiplier?: number;
  maxMultiplier?: number;
  sensitivity?: number;
  minIntervalMinutes?: number;
  catchUpEnabled?: boolean;
  catchUpStartBeforeEndMinutes?: number;
  catchUpMaxMultiplier?: number;
  releaseSchedule?: PrizeReleasePoint[];
}

export interface DrawSession {
  id: string;
  eventId: string;
  status: 'COMMITTED';
  committedRecordId: string;
  createdAt: string;
  committedAt: string;
}

export interface DrawRecord {
  id: string;
  eventId: string;
  sessionId: string;
  participantId?: string;
  prizeId: string;
  prizeNameSnapshot: string;
  createdAt: string;
  committedAt: string;
  revealedAt?: string;
  redeemed: boolean;
  redeemedAt?: string;
  voidedAt?: string;
  voidReason?: string;
  status: 'COMMITTED' | 'REVEALED' | 'REDEEMED' | 'VOIDED';
}

export interface CommitDrawInput {
  event: Event;
  prizes: readonly Prize[];
  records?: readonly DrawRecord[];
  participantId?: string;
  now?: () => string;
  random?: () => number;
  createId?: (prefix: 'session' | 'record') => string;
}

export interface CommitDrawResult {
  record: DrawRecord;
  session: DrawSession;
  prizes: Prize[];
}

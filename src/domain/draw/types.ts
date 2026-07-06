export type EventStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';

export interface Event {
  id: string;
  name: string;
  code: string;
  status: EventStatus;
  createdAt: string;
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
  status: 'COMMITTED' | 'REVEALED' | 'REDEEMED' | 'VOIDED';
}

export interface CommitDrawInput {
  event: Event;
  prizes: readonly Prize[];
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

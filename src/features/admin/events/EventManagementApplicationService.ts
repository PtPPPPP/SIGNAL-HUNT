import type { SignalHuntDatabase } from '../../../db/database';
import {
  activateEvent,
  createEvent,
  endEvent,
  pauseEvent,
} from '../../../db/eventRepository';
import type { Event } from '../../../domain/draw/types';
import { getEventValidationIssues, type EventValidationIssues } from '../../../domain/draw/eventValidation';
import { publishAppChange } from '../../sync/appSync';
import type { EventFormState } from './eventForm';

export type CreateDraftOutcome =
  | { type: 'CREATED'; event: Event }
  | { type: 'VALIDATION_FAILED'; issues: EventValidationIssues };

/** Coordinates activity persistence and renderer invalidation without UI state. */
export class EventManagementApplicationService {
  constructor(private readonly db: SignalHuntDatabase) {}

  async createDraft(form: EventFormState): Promise<CreateDraftOutcome> {
    const draft: Event = {
      id: form.id.trim() || `event-${crypto.randomUUID()}`,
      name: form.name,
      code: form.code,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      startAt: form.startAt || undefined,
      endAt: form.endAt || undefined,
    };
    const issues = getEventValidationIssues(draft);
    if (Object.keys(issues).length > 0) return { type: 'VALIDATION_FAILED', issues };

    const event = await createEvent(this.db, draft);
    publishAppChange('CONFIG_UPDATED', event.id);
    return { type: 'CREATED', event };
  }

  async activate(eventId: string, pauseExisting = false): Promise<void> {
    await activateEvent(this.db, eventId, { pauseExisting });
    publishAppChange('EVENT_ACTIVATED', eventId);
  }

  async pause(eventId: string): Promise<void> {
    await pauseEvent(this.db, eventId);
    publishAppChange('EVENT_PAUSED', eventId);
  }

  async end(eventId: string): Promise<void> {
    await endEvent(this.db, eventId);
    publishAppChange('EVENT_ENDED', eventId);
  }
}

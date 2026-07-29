import {
  endActiveDrawDisplay,
  redeemDrawRecord,
  voidActiveDraw,
} from '../../db/drawRepository';
import type { SignalHuntDatabase } from '../../db/database';
import type { DrawRecord, DrawSession } from '../../domain/draw/types';
import { publishAppChange } from '../sync/appSync';

export type StaffDrawOperationResult =
  | { operation: 'REDEEM'; alreadyCompleted: boolean }
  | { operation: 'VOID'; alreadyCompleted: boolean }
  | { operation: 'END'; alreadyCompleted: boolean };

export type RequestDisplaySync = () => Promise<void>;

/**
 * Coordinates staff-side persisted actions and renderer invalidation.
 * It deliberately has no React state, UI copy, dialog, or window dependency.
 */
export class StaffDrawApplicationService {
  constructor(
    private readonly db: SignalHuntDatabase,
    private readonly requestDisplaySync: RequestDisplaySync,
  ) {}

  async redeem(record: DrawRecord, session: DrawSession): Promise<StaffDrawOperationResult> {
    const result = await redeemDrawRecord(this.db, record.id);
    await this.notifyDisplay('DRAW_REDEEMED', session.eventId);
    return { operation: 'REDEEM', alreadyCompleted: result.status === 'ALREADY_REDEEMED' };
  }

  async void(record: DrawRecord, session: DrawSession, reason: string): Promise<StaffDrawOperationResult> {
    const result = await voidActiveDraw(this.db, { eventId: session.eventId, recordId: record.id, reason });
    await this.notifyDisplay('DRAW_VOIDED', session.eventId);
    return { operation: 'VOID', alreadyCompleted: result.status === 'ALREADY_VOIDED' };
  }

  async endDisplay(record: DrawRecord, session: DrawSession): Promise<StaffDrawOperationResult> {
    const result = await endActiveDrawDisplay(this.db, session.eventId, record.id);
    await this.notifyDisplay('DRAW_DISPLAY_ENDED', session.eventId);
    return { operation: 'END', alreadyCompleted: result.status === 'ALREADY_ENDED' };
  }

  private async notifyDisplay(type: 'DRAW_REDEEMED' | 'DRAW_VOIDED' | 'DRAW_DISPLAY_ENDED', eventId: string): Promise<void> {
    publishAppChange(type, eventId);
    await this.requestDisplaySync();
  }
}

export type AppChangeType =
  | 'CONFIG_UPDATED'
  | 'EVENT_ACTIVATED'
  | 'EVENT_ENDED'
  | 'EVENT_PAUSED'
  | 'PRIZES_UPDATED'
  | 'PACING_UPDATED'
  | 'DRAW_REDEEMED'
  | 'DRAW_VOIDED'
  | 'DRAW_DISPLAY_ENDED';

export type AppChange = {
  type: AppChangeType;
  eventId?: string;
  revision: string;
  timestamp: string;
};

const CHANNEL_NAME = 'signal-hunt-app-sync';
const STORAGE_KEY = `${CHANNEL_NAME}:event`;
const MAX_SEEN_REVISIONS = 128;
const APP_CHANGE_TYPES: ReadonlySet<AppChangeType> = new Set([
  'CONFIG_UPDATED',
  'EVENT_ACTIVATED',
  'EVENT_ENDED',
  'EVENT_PAUSED',
  'PRIZES_UPDATED',
  'PACING_UPDATED',
  'DRAW_REDEEMED',
  'DRAW_VOIDED',
  'DRAW_DISPLAY_ENDED',
]);
let channel: BroadcastChannel | undefined;

function getChannel(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  channel ??= new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function publishAppChange(type: AppChangeType, eventId?: string): AppChange {
  const change: AppChange = {
    type,
    eventId,
    revision: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  getChannel()?.postMessage(change);
  // Storage events are delivered to sibling renderer windows even where a
  // browser's IndexedDB observer or BroadcastChannel delivery is unavailable.
  // The payload is only an invalidation signal; business data stays in IndexedDB.
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(change));
  } catch {
    // Restricted storage must not prevent the already committed business action.
  }
  return change;
}

export function subscribeAppChanges(listener: (change: AppChange) => void): () => void {
  const activeChannel = getChannel();
  const seenRevisions = new Set<string>();
  const notify = (value: unknown) => {
    if (!isAppChange(value) || seenRevisions.has(value.revision)) {
      return;
    }

    seenRevisions.add(value.revision);
    if (seenRevisions.size > MAX_SEEN_REVISIONS) {
      const oldestRevision = seenRevisions.values().next().value;
      if (oldestRevision) {
        seenRevisions.delete(oldestRevision);
      }
    }

    listener(value);
  };

  const handleMessage = (event: MessageEvent<unknown>) => notify(event.data);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      notify(JSON.parse(event.newValue) as unknown);
    } catch {
      // Ignore malformed non-business invalidation data.
    }
  };

  activeChannel?.addEventListener('message', handleMessage);
  globalThis.addEventListener?.('storage', handleStorage);
  return () => {
    activeChannel?.removeEventListener('message', handleMessage);
    globalThis.removeEventListener?.('storage', handleStorage);
  };
}

export function isAppChange(value: unknown): value is AppChange {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.type === 'string' &&
    APP_CHANGE_TYPES.has(value.type as AppChangeType) &&
    (value.eventId === undefined || typeof value.eventId === 'string') &&
    typeof value.revision === 'string' &&
    value.revision.length > 0 &&
    typeof value.timestamp === 'string' &&
    !Number.isNaN(Date.parse(value.timestamp))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

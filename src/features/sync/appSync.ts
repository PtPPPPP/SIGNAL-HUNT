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
  const notify = (change: AppChange) => listener(change);

  const handleMessage = (event: MessageEvent<AppChange>) => notify(event.data);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      notify(JSON.parse(event.newValue) as AppChange);
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

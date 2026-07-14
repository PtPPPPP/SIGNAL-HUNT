export type AppChangeType =
  | 'CONFIG_UPDATED'
  | 'EVENT_ACTIVATED'
  | 'EVENT_ENDED'
  | 'EVENT_PAUSED'
  | 'PRIZES_UPDATED'
  | 'PACING_UPDATED'
  | 'DRAW_DISPLAY_ENDED';

export type AppChange = {
  type: AppChangeType;
  eventId?: string;
  revision: string;
  timestamp: string;
};

const CHANNEL_NAME = 'signal-hunt-app-sync';
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
  return change;
}

export function subscribeAppChanges(listener: (change: AppChange) => void): () => void {
  const activeChannel = getChannel();
  if (!activeChannel) return () => undefined;

  const handleMessage = (event: MessageEvent<AppChange>) => listener(event.data);
  activeChannel.addEventListener('message', handleMessage);
  return () => activeChannel.removeEventListener('message', handleMessage);
}

import type { Event } from '../../../domain/draw/types';

export function formatEventWindow(event: Event | undefined): string {
  if (!event?.startAt || !event.endAt) {
    return '未设置';
  }

  return `${formatTime(event.startAt)} - ${formatTime(event.endAt)}`;
}

export function formatSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

export function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function labelForTotal(status: { state: string; difference: number }): string {
  if (status.state === 'valid') {
    return '配置有效';
  }

  return `还差或超出 ${status.difference.toFixed(1)}%`;
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

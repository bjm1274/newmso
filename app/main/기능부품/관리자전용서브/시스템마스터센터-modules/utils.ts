import { formatWon } from '@/lib/date-formatter';
import type { SystemMasterChatRoom } from './types';

export const formatCurrency = (value: unknown) => formatWon(Number(value || 0));

export function maskResidentNo(value: string, reveal: boolean) {
  if (!value) return '-';
  if (reveal) return value;
  const normalized = value.replace(/\s/g, '');
  if (normalized.length <= 7) return `${normalized.slice(0, 1)}******`;
  return `${normalized.slice(0, 7)}******`;
}

export function maskAccount(value: string, reveal: boolean) {
  if (!value) return '-';
  if (reveal) return value;
  const normalized = value.replace(/\s/g, '');
  if (normalized.length <= 4) return `****${normalized.slice(-2)}`;
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

export function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatDateTime(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString('ko-KR');
}

export function formatPushPlatformLabel(platform: unknown) {
  const normalized = String(platform || '').trim();
  if (!normalized || normalized === 'unknown') return '미분류';
  if (normalized === 'ios-webapp') return 'iPhone 설치형';
  if (normalized === 'ios-browser') return 'iPhone 브라우저';
  if (normalized === 'android') return 'Android';
  if (normalized === 'web') return 'Desktop Web';
  return normalized;
}

export async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || '데이터를 불러오지 못했습니다.');
  }
  return payload as T;
}

export function roomHasMessageHistory(room: SystemMasterChatRoom | null | undefined) {
  if (!room) return false;
  const loose = room as Record<string, unknown>;
  if (typeof loose.has_message_history === 'boolean') {
    return loose.has_message_history;
  }
  if (typeof loose.message_count === 'number') {
    return loose.message_count > 0;
  }
  return Boolean(String(loose.last_message_at || loose.last_activity_at || '').trim());
}

export function isEmptyChatRoom(room: SystemMasterChatRoom | null | undefined) {
  return Boolean(room?.id) && !roomHasMessageHistory(room);
}

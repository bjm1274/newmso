import {
  normalizeRoomNotificationKeyword,
  normalizeRoomNotificationMode,
  readStoredRoomPreferences,
  readStoredThreadPreferences } from '../메신저유틸';
import type { NotifSettings } from './settings';

export function normalizeKeywordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 30),
    ),
  );
}

export function isInDND(s: NotifSettings): boolean {
  if (!s.dndEnabled) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = s.dndFrom.split(':').map(Number);
  const [th, tm] = s.dndTo.split(':').map(Number);
  const from = fh * 60 + fm, to = th * 60 + tm;
  return from <= to ? cur >= from && cur < to : cur >= from || cur < to;
}

export function isWeekendQuiet(s: NotifSettings): boolean {
  if (!s.weekendMute) return false;
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

export function shouldApplyKeywordFilter(type: string) {
  return type === 'message' || type === 'board' || type === 'notification';
}

export function matchesNotificationKeywords(
  settings: NotifSettings,
  type: string,
  title: string,
  body: string,
  metadata: Record<string, unknown>,
) {
  if (!settings.keywordAlertsEnabled) return true;
  const keywords = normalizeKeywordList(settings.keywords);
  if (keywords.length === 0) return true;
  if (!shouldApplyKeywordFilter(type)) return true;

  const haystack = [
    title,
    body,
    metadata.sender_name,
    metadata.room_name,
    metadata.board_type,
    metadata.open_menu,
    metadata.open_subview,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return keywords.some((keyword) => haystack.includes(keyword));
}

export function matchesChatRoomKeywordPreference(
  keyword: string,
  title: string,
  body: string,
  metadata: Record<string, unknown>,
) {
  const normalizedKeyword = normalizeRoomNotificationKeyword(keyword).toLowerCase();
  if (!normalizedKeyword) return false;

  const haystack = [
    title,
    body,
    metadata.sender_name,
    metadata.room_name,
    metadata.message_preview,
    metadata.content,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return haystack.includes(normalizedKeyword);
}

export function resolveChatRoomSurfaceSuppression(params: {
  effectiveUserId: string | null | undefined;
  roomId: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}) {
  const preferences = readStoredRoomPreferences(params.effectiveUserId);
  const preference = preferences[params.roomId] || {};
  const mode = normalizeRoomNotificationMode(preference.notifyMode);
  const keyword = normalizeRoomNotificationKeyword(preference.notifyKeyword);

  if (mode === 'mute') {
    return {
      suppressLiveSurface: true,
      mode,
      keyword };
  }

  if (mode === 'mention_only') {
    return {
      suppressLiveSurface: params.type !== 'mention',
      mode,
      keyword };
  }

  if (mode === 'keyword') {
    return {
      suppressLiveSurface:
        params.type !== 'mention' &&
        !matchesChatRoomKeywordPreference(keyword, params.title, params.body, params.metadata),
      mode,
      keyword };
  }

  return {
    suppressLiveSurface: false,
    mode,
    keyword };
}

export function isFollowedThreadNotification(
  effectiveUserId: string | null | undefined,
  metadata: Record<string, unknown>,
) {
  const preferences = readStoredThreadPreferences(effectiveUserId);
  const candidateIds = [
    metadata.thread_root_id,
    metadata.reply_to_id,
    metadata.message_id,
    metadata.id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return candidateIds.some((threadId) => preferences[threadId]?.followed === true);
}

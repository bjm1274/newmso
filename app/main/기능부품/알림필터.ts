import {
  normalizeKeywordList,
  type NotifSettings,
} from './알림설정';
import {
  normalizeRoomNotificationKeyword,
  normalizeRoomNotificationMode,
  readStoredRoomPreferences,
} from './메신저유틸';

// ─── DND / 억제 로직 ───
export function isInDND(s: NotifSettings): boolean {
  if (!s.dndEnabled) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = s.dndFrom.split(':').map(Number);
  const [th, tm] = s.dndTo.split(':').map(Number);
  const from = fh * 60 + (fm || 0);
  const to = th * 60 + (tm || 0);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
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
      keyword,
    };
  }

  if (mode === 'mention_only') {
    return {
      suppressLiveSurface: params.type !== 'mention',
      mode,
      keyword,
    };
  }

  if (mode === 'keyword') {
    return {
      suppressLiveSurface:
        params.type !== 'mention' &&
        !matchesChatRoomKeywordPreference(keyword, params.title, params.body, params.metadata),
      mode,
      keyword,
    };
  }

  return {
    suppressLiveSurface: false,
    mode,
    keyword,
  };
}

// ─── 타입별 스타일 ───
export const TYPE_CFG: Record<string, { icon: string; bg: string; progress: string; accent: string }> = {
  message: { icon: 'MessageSquare', bg: 'bg-blue-500/100', progress: 'bg-blue-400', accent: 'border-blue-400' },
  mention: { icon: 'Megaphone', bg: 'bg-indigo-500/100', progress: 'bg-indigo-400', accent: 'border-indigo-400' },
  approval: { icon: 'ClipboardList', bg: 'bg-violet-600', progress: 'bg-violet-400', accent: 'border-violet-400' },
  payroll: { icon: 'Coins', bg: 'bg-emerald-600', progress: 'bg-emerald-400', accent: 'border-emerald-400' },
  inventory: { icon: 'Package', bg: 'bg-orange-500/100', progress: 'bg-orange-400', accent: 'border-orange-400' },
  attendance: { icon: 'Clock', bg: 'bg-teal-500', progress: 'bg-teal-400', accent: 'border-teal-400' },
  board: { icon: 'Pin', bg: 'bg-pink-500/100', progress: 'bg-pink-400', accent: 'border-pink-400' },
  인사: { icon: 'Users', bg: 'bg-cyan-600', progress: 'bg-cyan-400', accent: 'border-cyan-400' },
  education: { icon: 'BookOpen', bg: 'bg-purple-500/100', progress: 'bg-purple-400', accent: 'border-purple-400' },
  todo: { icon: 'CalendarDays', bg: 'bg-sky-600', progress: 'bg-sky-400', accent: 'border-sky-400' },
  notification: { icon: 'Bell', bg: 'bg-[var(--toss-gray-4)]', progress: 'bg-[var(--toss-gray-3)]', accent: 'border-[var(--border)]' },
};

export const DEFAULT_CFG = { icon: 'Bell', bg: 'bg-[var(--toss-gray-4)]', progress: 'bg-[var(--toss-gray-3)]', accent: 'border-[var(--border)]' };

export const getTypeCfg = (type: string) => TYPE_CFG[type] || DEFAULT_CFG;

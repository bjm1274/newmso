import { STORAGE_KEYS } from '@/lib/storage-keys';
import { normalizeKeywordList } from './filter-helpers';

// ─── 알림 설정 타입 ───
export interface NotifSettings {
  sound: boolean;
  vibration: boolean;
  dndEnabled: boolean;
  dndFrom: string;
  dndTo: string;
  weekendMute: boolean;
  keywordAlertsEnabled: boolean;
  keywords: string[];
  types: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: NotifSettings = {
  sound: true, vibration: true, dndEnabled: false,
  dndFrom: '22:00', dndTo: '08:00',
  weekendMute: false,
  keywordAlertsEnabled: false,
  keywords: [],
  types: {
    message: true, mention: true, approval: true, payroll: true,
    inventory: true, attendance: true, board: true, 인사: true,
    education: true, notification: true, todo: true,
  },
};

export function saveNotifSettings(next: NotifSettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.NOTIF_SETTINGS, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

export function loadNotifSettings(): NotifSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIF_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...p,
      keywords: normalizeKeywordList(p.keywords),
      types: { ...DEFAULT_SETTINGS.types, ...(p.types || {}) },
    };
  } catch { return DEFAULT_SETTINGS; }
}

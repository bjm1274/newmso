'use client';

/**
 * 채팅 온라인 presence 폴링.
 *
 * write path: usePresenceHeartbeat → POST/DELETE /api/chat/presence
 * read path:  이 훅 → GET /api/chat/presence → presenceMap
 *
 * 메신저(구독훅)와 모바일 채팅이 동일 엔드포인트를 공유한다.
 * 탭이 숨겨진 동안은 폴링을 건너뛰고, 다시 보이면 즉시 1회 갱신한다.
 */

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export type ChatPresenceInfo = {
  userId: string;
  name: string;
  roomId: string | null;
  onlineAt: string;
};

/** 온라인 판정 freshness 대비 고속 폴링 주기 (오라클 전용 서버 10초) */
export const PRESENCE_POLL_MS = 10_000;

type PresenceRow = {
  userId?: unknown;
  user_id?: unknown;
  name?: unknown;
  roomId?: unknown;
  onlineAt?: unknown;
  last_seen_at?: unknown;
};

export async function fetchChatPresenceMap(): Promise<Record<string, ChatPresenceInfo>> {
  const res = await fetch('/api/chat/presence', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!res.ok) return {};
  const data = (await res.json()) as { presence?: PresenceRow[] };
  const rows = Array.isArray(data?.presence) ? data.presence : [];
  const next: Record<string, ChatPresenceInfo> = {};
  for (const row of rows) {
    const id = String(row.userId ?? row.user_id ?? '').trim();
    if (!id) continue;
    next[id] = {
      userId: id,
      name: String(row.name ?? ''),
      roomId: row.roomId != null && String(row.roomId).trim() ? String(row.roomId) : null,
      onlineAt: String(row.onlineAt ?? row.last_seen_at ?? new Date().toISOString()),
    };
  }
  return next;
}

/** 외부 presenceMap setter로 폴링 (데스크톱 메신저 구독훅). */
export function useChatPresencePolling(
  setPresenceMap: Dispatch<SetStateAction<Record<string, ChatPresenceInfo>>>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) {
      setPresenceMap({});
      return;
    }

    let disposed = false;

    const pull = async () => {
      if (disposed) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const next = await fetchChatPresenceMap();
        if (!disposed) setPresenceMap(next);
      } catch {
        // presence는 비필수 — 실패 시 이전 맵 유지
      }
    };

    void pull();
    const timer = setInterval(pull, PRESENCE_POLL_MS);
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void pull();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      disposed = true;
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [enabled, setPresenceMap]);
}

/** 자체 state를 가진 presence 맵 (모바일 채팅 등). */
export function useChatPresenceMap(enabled: boolean): Record<string, ChatPresenceInfo> {
  const [presenceMap, setPresenceMap] = useState<Record<string, ChatPresenceInfo>>({});
  useChatPresencePolling(setPresenceMap, enabled);
  return presenceMap;
}

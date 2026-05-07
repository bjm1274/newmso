'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isRelationMarkedMissing, rememberMissingRelation } from '@/lib/supabase-compat';
import {
  getPinnedRoomOrderStorageKey,
  getRoomPrefsStorageKey,
  normalizeRoomNotificationKeyword,
  normalizeRoomNotificationMode,
  type RoomPreference,
} from './메신저유틸';

type UseChatPreferenceStateParams = {
  roomPrefsUserId: string | null;
  selectedRoomId: string | null;
};

export function useChatPreferenceState({
  roomPrefsUserId,
  selectedRoomId,
}: UseChatPreferenceStateParams) {
  const [roomPrefs, setRoomPrefs] = useState<Record<string, RoomPreference>>({});
  const [pinnedRoomOrder, setPinnedRoomOrder] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let active = true;
    try {
      const raw = window.localStorage.getItem(getRoomPrefsStorageKey(roomPrefsUserId));
      setRoomPrefs(raw ? JSON.parse(raw) : {});
    } catch {
      setRoomPrefs({});
    }
    try {
      const rawPinnedOrder = window.localStorage.getItem(getPinnedRoomOrderStorageKey(roomPrefsUserId));
      const parsedPinnedOrder = rawPinnedOrder ? JSON.parse(rawPinnedOrder) : [];
      setPinnedRoomOrder(Array.isArray(parsedPinnedOrder) ? parsedPinnedOrder.map((value) => String(value)) : []);
    } catch {
      setPinnedRoomOrder([]);
    }
    if (!roomPrefsUserId || isRelationMarkedMissing('chat_room_prefs')) {
      return () => {
        active = false;
      };
    }

    let timeoutId: number | null = null;
    const idleWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let idleId: number | null = null;

    const loadRoomPrefsFromDb = () => {
      void supabase
        .from('chat_room_prefs')
        .select('room_id, pinned, hidden')
        .eq('user_id', roomPrefsUserId)
        .then(({ data, error }) => {
          if (!active) return;
          if (rememberMissingRelation(error, 'chat_room_prefs')) return;
          if (error || !Array.isArray(data) || data.length === 0) return;
          const dbPrefs: Record<string, RoomPreference> = {};
          data.forEach((row: Record<string, unknown>) => {
            const roomId = String(row.room_id || '');
            if (roomId) dbPrefs[roomId] = { pinned: Boolean(row.pinned), hidden: Boolean(row.hidden) };
          });
          if (Object.keys(dbPrefs).length > 0) {
            setRoomPrefs(dbPrefs);
            try {
              window.localStorage.setItem(getRoomPrefsStorageKey(roomPrefsUserId), JSON.stringify(dbPrefs));
            } catch {
              // ignore
            }
          }
        });
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleId = idleWindow.requestIdleCallback(loadRoomPrefsFromDb);
    } else {
      timeoutId = window.setTimeout(loadRoomPrefsFromDb, 200);
    }

    return () => {
      active = false;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (idleId !== null && typeof idleWindow.cancelIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(idleId);
      }
    };
  }, [roomPrefsUserId]);

  const selectedRoomPreference = selectedRoomId ? (roomPrefs[selectedRoomId] || {}) : {};
  const selectedRoomNotificationMode = useMemo(
    () => normalizeRoomNotificationMode(selectedRoomPreference.notifyMode),
    [selectedRoomPreference.notifyMode],
  );
  const selectedRoomNotificationKeyword = useMemo(
    () => normalizeRoomNotificationKeyword(selectedRoomPreference.notifyKeyword),
    [selectedRoomPreference.notifyKeyword],
  );

  return {
    roomPrefs,
    setRoomPrefs,
    pinnedRoomOrder,
    setPinnedRoomOrder,
    selectedRoomPreference,
    selectedRoomNotificationMode,
    selectedRoomNotificationKeyword,
  };
}

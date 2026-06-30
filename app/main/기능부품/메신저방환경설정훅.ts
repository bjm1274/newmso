'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { db } from '@/lib/db-client';
import {
  getPinnedRoomOrderStorageKey,
  getRoomPrefsStorageKey,
  type RoomPreference } from './메신저유틸';

type UseChatRoomPreferencesParams = {
  roomPrefsUserId: string | null | undefined;
  pinnedRoomOrder: string[];
  setRoomPrefs: Dispatch<SetStateAction<Record<string, RoomPreference>>>;
  setPinnedRoomOrder: Dispatch<SetStateAction<string[]>>;
};

export function useChatRoomPreferences({
  roomPrefsUserId,
  pinnedRoomOrder,
  setRoomPrefs,
  setPinnedRoomOrder }: UseChatRoomPreferencesParams) {
  const updateRoomPreference = useCallback(
    (roomId: string, patch: RoomPreference) => {
      setRoomPrefs((prev) => {
        const next = {
          ...prev,
          [roomId]: {
            ...(prev[roomId] || {}),
            ...patch } };

        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(
              getRoomPrefsStorageKey(roomPrefsUserId),
              JSON.stringify(next),
            );
          } catch {
            // ignore
          }
        }

        if (roomPrefsUserId) {
          const merged = next[roomId] || {};
          void db
            .from('chat_room_prefs')
            .upsert(
              {
                user_id: roomPrefsUserId,
                room_id: roomId,
                pinned: merged.pinned ?? false,
                hidden: merged.hidden ?? false,
                updated_at: new Date().toISOString() },
              { onConflict: 'user_id,room_id' },
            )
            .then(({ error }) => {
              if (error) {
                console.debug('chat_room_prefs DB sync skip:', error.message);
              }
            });
        }

        return next;
      });
    },
    [roomPrefsUserId, setRoomPrefs],
  );

  const persistPinnedRoomOrder = useCallback(
    (nextOrder: string[]) => {
      const normalized = Array.from(new Set(nextOrder.map((roomId) => String(roomId))));
      setPinnedRoomOrder(normalized);

      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            getPinnedRoomOrderStorageKey(roomPrefsUserId),
            JSON.stringify(normalized),
          );
        } catch {
          // ignore
        }
      }
    },
    [roomPrefsUserId, setPinnedRoomOrder],
  );

  const toggleRoomPinned = useCallback(
    (roomId: string, shouldPin: boolean) => {
      updateRoomPreference(roomId, { pinned: shouldPin });
      persistPinnedRoomOrder(
        shouldPin
          ? [...pinnedRoomOrder.filter((id) => String(id) !== String(roomId)), String(roomId)]
          : pinnedRoomOrder.filter((id) => String(id) !== String(roomId)),
      );
    },
    [persistPinnedRoomOrder, pinnedRoomOrder, updateRoomPreference],
  );

  const movePinnedRoom = useCallback(
    (roomId: string, direction: 'up' | 'down') => {
      const currentOrder = [...pinnedRoomOrder];
      const currentIndex = currentOrder.findIndex((id) => String(id) === String(roomId));
      if (currentIndex < 0) return;

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= currentOrder.length) return;

      const [moved] = currentOrder.splice(currentIndex, 1);
      currentOrder.splice(targetIndex, 0, moved);
      persistPinnedRoomOrder(currentOrder);
    },
    [persistPinnedRoomOrder, pinnedRoomOrder],
  );

  const toggleRoomHidden = useCallback(
    (roomId: string, hidden: boolean) => {
      updateRoomPreference(roomId, { hidden });
    },
    [updateRoomPreference],
  );

  return {
    updateRoomPreference,
    persistPinnedRoomOrder,
    toggleRoomPinned,
    movePinnedRoom,
    toggleRoomHidden };
}

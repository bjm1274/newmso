'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '@/lib/supabase';
import { pokeChannel } from '@/lib/polling-bus';
import { normalizeRoomReadCursorIds } from '@/lib/chat-read-cursors';
import type { MessengerMentionInboxItem } from './메신저사이드바';
import { bindMockNotificationInsert } from './메신저테스트이벤트';

type UseChatReadSyncParams = {
  effectiveChatUserId: string | null | undefined;
  roomUnreadCounts: Record<string, number>;
};

const NOTIFICATION_READ_ROOM_CHUNK_SIZE = 60;
const NOTIFICATION_READ_DEDUPE_MS = 5_000;

function chunkRoomIds(roomIds: string[]) {
  const chunks: string[][] = [];
  for (let index = 0; index < roomIds.length; index += NOTIFICATION_READ_ROOM_CHUNK_SIZE) {
    chunks.push(roomIds.slice(index, index + NOTIFICATION_READ_ROOM_CHUNK_SIZE));
  }
  return chunks;
}

export function useChatReadSync({
  effectiveChatUserId,
  roomUnreadCounts,
}: UseChatReadSyncParams) {
  const [mentionInboxItems, setMentionInboxItems] = useState<MessengerMentionInboxItem[]>([]);
  const prevTotalUnreadRef = useRef<number | null>(null);
  const notificationReadLastAtByRoomRef = useRef<Record<string, number>>({});

  const persistRoomReadCursors = useCallback(
    async (
      roomIds: Array<string | null | undefined>,
      readAt?: string | null,
    ): Promise<boolean> => {
      // 읽음 커서 쓰기는 서버 라우트에 위임한다. 클라이언트는 D1 binding에
      // 직접 접근할 수 없어 upsertRoomReadCursors를 브라우저에서 호출하면
      // 항상 실패한다(안 읽음 카운트가 사라지지 않던 원인).
      const normalizedRoomIds = normalizeRoomReadCursorIds(roomIds);
      if (!effectiveChatUserId || normalizedRoomIds.length === 0) return false;
      try {
        const res = await fetch('/api/chat/read-cursors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomIds: normalizedRoomIds, readAt: readAt ?? undefined }),
          credentials: 'same-origin',
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        const ok = Boolean(res.ok && json?.ok);
        if (ok) {
          // 본인 읽음 처리 직후 다른 방·다른 탭의 polling이 다음 주기를 기다리지
          // 않고 즉시 변경 감지하도록 트리거(상대방의 "1" 배지 빠른 해제).
          normalizedRoomIds.forEach((roomId) => pokeChannel(`chat-realtime-${roomId}`));
          pokeChannel('chat-rooms-list');
        }
        return ok;
      } catch {
        return false;
      }
    },
    [effectiveChatUserId],
  );

  const markConversationNotificationsAsRead = useCallback(
    async (
      roomIds: Array<string | null | undefined>,
      readAt?: string | null,
    ) => {
      if (!effectiveChatUserId) return;

      const now = Date.now();
      const targetRoomIds = Array.from(
        new Set(roomIds.map((roomId) => String(roomId || '').trim()).filter(Boolean)),
      ).filter((roomId) => {
        const lastReadAt = notificationReadLastAtByRoomRef.current[roomId] || 0;
        return now - lastReadAt >= NOTIFICATION_READ_DEDUPE_MS;
      });
      if (targetRoomIds.length === 0) return;

      targetRoomIds.forEach((roomId) => {
        notificationReadLastAtByRoomRef.current[roomId] = now;
      });
      Object.keys(notificationReadLastAtByRoomRef.current).forEach((roomId) => {
        if (now - notificationReadLastAtByRoomRef.current[roomId] > 60_000) {
          delete notificationReadLastAtByRoomRef.current[roomId];
        }
      });

      const resolvedReadAt = readAt || new Date().toISOString();
      await Promise.allSettled(
        chunkRoomIds(targetRoomIds).map((targetRoomIdChunk) => {
          let query = supabase
            .from('notifications')
            .update({ read_at: resolvedReadAt })
            .eq('user_id', effectiveChatUserId)
            .in('type', ['message', 'mention'])
            .is('read_at', null);

          query = targetRoomIdChunk.length === 1
            ? query.filter('metadata->>room_id', 'eq', targetRoomIdChunk[0])
            : query.filter('metadata->>room_id', 'in', `(${targetRoomIdChunk.join(',')})`);

          return query;
        }),
      );

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erp-notification-read'));
      }
    },
    [effectiveChatUserId],
  );

  useEffect(() => {
    if (!effectiveChatUserId) return;
    const total = Object.values(roomUnreadCounts).reduce((sum, count) => sum + (count || 0), 0);
    const roomCount = Object.keys(roomUnreadCounts).length;
    if (roomCount === 0) return;

    const prevTotal = prevTotalUnreadRef.current;
    if (total === 0 && prevTotal !== 0) {
      prevTotalUnreadRef.current = 0;
      if (prevTotal !== null && prevTotal > 0) {
        void markConversationNotificationsAsRead(Object.keys(roomUnreadCounts), new Date().toISOString());
      }
      return;
    }

    prevTotalUnreadRef.current = total;
  }, [effectiveChatUserId, markConversationNotificationsAsRead, roomUnreadCounts]);

  const loadNotificationInboxes = useCallback(async () => {
    if (!effectiveChatUserId) {
      setMentionInboxItems([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, body, created_at, read_at, metadata')
        .eq('user_id', effectiveChatUserId)
        .eq('type', 'mention')
        .order('created_at', { ascending: false })
        .limit(32);

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const mentionItems = rows
        .filter((row: Record<string, unknown>) => String(row.type || '').trim() === 'mention')
        .map((row: Record<string, unknown>) => {
          const metadata =
            row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
              ? (row.metadata as Record<string, unknown>)
              : {};
          return {
            id: String(row.id || '').trim(),
            roomId: String(metadata.room_id || '').trim(),
            messageId: String(metadata.message_id || metadata.id || '').trim(),
            roomName: String(metadata.room_name || '채팅방').trim() || '채팅방',
            senderName: String(metadata.sender_name || row.title || '알 수 없음').replace(/^📣\s*/, '').trim() || '알 수 없음',
            body: String(row.body || '').trim() || '멘션 메시지',
            createdAt: String(row.created_at || '').trim(),
            unread: !row.read_at,
          } satisfies MessengerMentionInboxItem;
        })
        .filter((item) => item.id && item.roomId && item.messageId)
        .slice(0, 8);

      setMentionInboxItems(mentionItems);
    } catch {
      setMentionInboxItems([]);
    }
  }, [effectiveChatUserId]);

  useEffect(() => {
    if (!effectiveChatUserId) {
      setMentionInboxItems([]);
      return;
    }

    if (typeof window === 'undefined') return;
    let timeoutId: number | null = null;
    const idleWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let idleId: number | null = null;

    const scheduleInitialLoad = () => {
      void loadNotificationInboxes();
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleId = idleWindow.requestIdleCallback(scheduleInitialLoad);
    } else {
      timeoutId = window.setTimeout(scheduleInitialLoad, 180);
    }

    const reloadNotificationInboxes = () => {
      void loadNotificationInboxes();
    };

    window.addEventListener('erp-notification-read', reloadNotificationInboxes);
    const unbindMockNotificationInsert = bindMockNotificationInsert(reloadNotificationInboxes);
    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (idleId !== null && typeof idleWindow.cancelIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(idleId);
      }
      window.removeEventListener('erp-notification-read', reloadNotificationInboxes);
      unbindMockNotificationInsert();
    };
  }, [effectiveChatUserId, loadNotificationInboxes]);

  return {
    mentionInboxItems,
    setMentionInboxItems: setMentionInboxItems as Dispatch<SetStateAction<MessengerMentionInboxItem[]>>,
    persistRoomReadCursors,
    markConversationNotificationsAsRead,
  };
}

/**
 * 채팅 모니터링용 데이터 페처
 *
 * 관리자 화면 특성상 실시간성이 중요하므로 TTL은 짧게 설정한다.
 * mutation(메시지 삭제) 후 자동 캐시 무효화.
 */

import { eq } from 'drizzle-orm';
import { fetcher, invalidateCache } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';
import {
  getD1Binding,
  getD1Drizzle,
  messages as messagesTable,
} from '@/lib/db';

const ROOM_TTL = 60_000; // 1분
const MESSAGE_TTL = 30_000; // 30초 — 실시간성 우선

export type ChatRoomRow = {
  id: string;
  name?: string;
  type?: string;
  members?: string[];
  last_message?: string;
  last_message_at?: string;
  updated_at?: string;
};

export type ChatMessageRow = {
  id: string;
  room_id: string;
  sender_id: string;
  content?: string;
  file_url?: string;
  file_name?: string;
  created_at: string;
};

export async function fetchChatRoomsForStaff(staffId: string): Promise<ChatRoomRow[]> {
  if (!staffId) return [];
  return fetcher(
    `chat:rooms:by-staff:${staffId}`,
    async () => {
      const { data } = await supabase
        .from('chat_rooms')
        .select('*')
        .contains('members', [staffId])
        .order('updated_at', { ascending: false });
      return (data ?? []) as ChatRoomRow[];
    },
    { ttl: ROOM_TTL },
  );
}

export async function fetchMessagesForRoom(roomId: string): Promise<ChatMessageRow[]> {
  if (!roomId) return [];
  return fetcher(
    `chat:messages:by-room:${roomId}`,
    async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });
      return (data ?? []) as ChatMessageRow[];
    },
    { ttl: MESSAGE_TTL },
  );
}

/**
 * 메시지 삭제. 성공 시 해당 방의 messages 캐시 자동 무효화.
 */
export async function deleteChatMessage(
  id: string,
  roomId?: string,
): Promise<{ error: Error | null }> {
  try {
    const d1 = await getD1Binding();
    if (!d1) {
      throw new Error('[chat-monitoring] D1 binding not available');
    }
    const db = getD1Drizzle(d1);
    await db.delete(messagesTable).where(eq(messagesTable.id, id));
    if (roomId) {
      invalidateCache(`chat:messages:by-room:${roomId}`);
    } else {
      invalidateCache(/^chat:messages:by-room:/);
    }
    return { error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { error };
  }
}

'use client';

/**
 * 모바일 채팅방 상단 공지.
 *
 * 공지는 `pinned_messages`(room_id, message_id)에 이미 저장돼 있고 PC 는 이걸
 * 읽어 상단에 띄운다. 모바일은 상세 시트에 "등록된 대화방 공지가 없습니다."
 * 라는 **고정 문구**만 있었다 — PC 에서 등록한 공지가 모바일에서는 영영 보이지
 * 않았다. PC 와 같은 규칙(가장 마지막 pin 1건)으로 읽어 온다.
 *
 * 제약: JM(단일 책임), JM4(any 금지).
 */

import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import { CHAT_MESSAGE_SELECT } from '@/lib/chat-query-columns';
import type { ChatMessage } from '@/types';

export type RoomNotice = {
  messageId: string;
  text: string;
  senderName: string;
};

/** 공지 본문으로 쓸 한 줄 텍스트. 첨부만 있는 메시지는 파일명을 쓴다. */
function toNoticeText(message: ChatMessage): string {
  const content = typeof message.content === 'string' ? message.content.trim() : '';
  if (content) return content.replace(/\s+/g, ' ');
  const fileName = typeof message.file_name === 'string' ? message.file_name.trim() : '';
  return fileName || '첨부 파일';
}

export function useRoomNotice(roomId: string | null | undefined) {
  const [notice, setNotice] = useState<RoomNotice | null>(null);

  const refresh = useCallback(async () => {
    const rid = String(roomId || '').trim();
    if (!rid) {
      setNotice(null);
      return;
    }

    try {
      const pinned = await db.from('pinned_messages').select('message_id').eq('room_id', rid);
      if (pinned.error) throw pinned.error;

      // PC 와 같이 마지막 1건만 상단 공지로 쓴다.
      const messageId = (pinned.data || [])
        .map((row: Record<string, unknown>) => String(row.message_id || ''))
        .filter(Boolean)
        .slice(-1)[0];
      if (!messageId) {
        setNotice(null);
        return;
      }

      const { data, error } = await db
        .from('messages')
        .select(CHAT_MESSAGE_SELECT)
        .eq('id', messageId)
        .limit(1);
      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : null) as ChatMessage | null;
      // 원문이 지워졌으면 공지도 내린다 — 없는 글을 가리키는 바를 띄우지 않는다.
      if (!row || row.is_deleted === true) {
        setNotice(null);
        return;
      }

      setNotice({
        messageId: String(row.id),
        text: toNoticeText(row),
        senderName: typeof row.sender_name === 'string' ? row.sender_name : '' });
    } catch (err) {
      console.error('[useRoomNotice]', err);
      setNotice(null);
    }
  }, [roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { notice, refreshNotice: refresh };
}

'use client';

import { useCallback, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { buildChatNotificationMetadata } from '@/lib/notification-metadata';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import { getMessageDisplayText } from './메신저첨부';
import { isMessageReadByCursor } from './메신저유틸';

type UseChatNoticeAdminParams = {
  selectedRoom: ChatRoom | null;
  selectedRoomLabel: string;
  roomMembers: Array<StaffMember | null>;
  currentNoticeMessage: ChatMessage | null;
  roomReadCursorMap: Record<string, string>;
  loadReadStatusForMessage: (message: ChatMessage) => Promise<void> | void;
  scrollToMessage: (messageId: string) => void;
  setShowDrawer: (value: boolean) => void;
};

export function useChatNoticeAdmin({
  selectedRoom,
  selectedRoomLabel,
  roomMembers,
  currentNoticeMessage,
  roomReadCursorMap,
  loadReadStatusForMessage,
  scrollToMessage,
  setShowDrawer,
}: UseChatNoticeAdminParams) {
  const [noticeReminderBusy, setNoticeReminderBusy] = useState(false);

  const noticeReadStats = useMemo(() => {
    const audienceMembers = roomMembers.filter(
      (member): member is StaffMember =>
        Boolean(member && member.id) && String(member?.id || '') !== String(currentNoticeMessage?.sender_id || ''),
    );

    if (!currentNoticeMessage?.id || !currentNoticeMessage.created_at) {
      return {
        readCount: 0,
        unreadCount: 0,
        recipientCount: audienceMembers.length,
        unreadMembers: [] as StaffMember[],
      };
    }

    const unreadMembers = audienceMembers.filter(
      (member) => !isMessageReadByCursor(currentNoticeMessage.created_at, roomReadCursorMap[String(member.id)]),
    );

    return {
      readCount: Math.max(0, audienceMembers.length - unreadMembers.length),
      unreadCount: unreadMembers.length,
      recipientCount: audienceMembers.length,
      unreadMembers,
    };
  }, [currentNoticeMessage, roomMembers, roomReadCursorMap]);

  const openCurrentNoticeReadStatus = useCallback(() => {
    if (!currentNoticeMessage) return;
    void loadReadStatusForMessage(currentNoticeMessage);
  }, [currentNoticeMessage, loadReadStatusForMessage]);

  const handleJumpToNoticeMessage = useCallback(() => {
    if (!currentNoticeMessage?.id) return;
    setShowDrawer(false);
    scrollToMessage(String(currentNoticeMessage.id));
  }, [currentNoticeMessage, scrollToMessage, setShowDrawer]);

  const handleSendNoticeReminder = useCallback(async () => {
    if (!selectedRoom?.id || !currentNoticeMessage?.id) return;
    if (noticeReadStats.unreadMembers.length === 0) {
      toast('이미 전원이 상단 공지를 확인했습니다.', 'warning');
      return;
    }

    const previewText = getMessageDisplayText(
      currentNoticeMessage.content,
      currentNoticeMessage.file_name,
      currentNoticeMessage.file_url,
      '상단 공지',
    ).replace(/\s+/g, ' ').trim();

    setNoticeReminderBusy(true);
    try {
      const payload = noticeReadStats.unreadMembers.map((member) => ({
        user_id: member.id,
        type: 'message',
        title: `${selectedRoomLabel || '채팅방'} 공지 리마인드`,
        body: previewText
          ? `${previewText.slice(0, 80)}${previewText.length > 80 ? '...' : ''}`
          : '상단 공지를 확인해 주세요.',
        read_at: null,
        metadata: buildChatNotificationMetadata({
          roomId: String(selectedRoom.id),
          messageId: String(currentNoticeMessage.id),
          notificationType: 'message',
          extra: {
            reminder_kind: 'pinned_notice',
            room_name: selectedRoomLabel || null,
          },
        }),
      }));

      const { error } = await supabase.from('notifications').insert(payload);
      if (error) throw error;
      toast(`${noticeReadStats.unreadMembers.length}명에게 공지 리마인드를 보냈습니다.`, 'success');
    } catch (error) {
      console.error('send notice reminder failed', error);
      toast('공지 리마인드 발송에 실패했습니다.', 'error');
    } finally {
      setNoticeReminderBusy(false);
    }
  }, [currentNoticeMessage, noticeReadStats.unreadMembers, selectedRoom, selectedRoomLabel]);

  return {
    noticeReadStats,
    noticeReminderBusy,
    openCurrentNoticeReadStatus,
    handleJumpToNoticeMessage,
    handleSendNoticeReminder,
  };
}

'use client';

import { useEffect, type MutableRefObject } from 'react';
import { insertChatMessageWithFallback } from '@/lib/chat-message-write';
import { buildChatNotificationMetadata } from '@/lib/notification-metadata';
import { supabase, d1 } from '@/lib/supabase';
import type { ChatMessage, StaffMember } from '@/types';
import { getMessageDisplayText } from './메신저첨부';
import {
  isActiveNoticeMember,
  isMessageReadByCursor,
  NOTICE_ROOM_ID,
  NOTICE_ROOM_NAME,
} from './메신저유틸';
import {
  CHAT_NOTICE_SCHEDULE_EVENT,
  getDueScheduledNoticeJobs,
  getDueScheduledNoticeReminderStages,
  getNextScheduledNoticeRunAt,
  markScheduledNoticeSent,
  recordScheduledNoticeReminder,
} from './메신저공지스케줄';

type UseScheduledNoticeDispatcherParams = {
  allKnownStaffs: StaffMember[];
  canManageNoticeOps: boolean;
  currentUserId?: string | null;
  fetchDataRef: MutableRefObject<(() => Promise<void>) | null>;
  fetchMessageByIdWithRetry: (messageId: string, attempts?: number) => Promise<ChatMessage | null>;
  roomPrefsUserId: string | null | undefined;
  triggerChatPush: (roomId: string, messageId: string) => Promise<void> | void;
};

const SCHEDULED_NOTICE_IDLE_CHECK_MS = 5 * 60 * 1000;
const SCHEDULED_NOTICE_MIN_DELAY_MS = 1000;
const SCHEDULED_NOTICE_EVENT_GAP_MS = 3000;

export function useScheduledNoticeDispatcher({
  allKnownStaffs,
  canManageNoticeOps,
  currentUserId,
  fetchDataRef,
  fetchMessageByIdWithRetry,
  roomPrefsUserId,
  triggerChatPush,
}: UseScheduledNoticeDispatcherParams) {
  useEffect(() => {
    if (!roomPrefsUserId || !canManageNoticeOps || typeof window === 'undefined') return;
    let timeoutId: number | null = null;
    let disposed = false;
    let running = false;
    let lastRunAt = 0;

    const processScheduledNotices = async () => {
      const dueJobs = getDueScheduledNoticeJobs(roomPrefsUserId);
      for (const job of dueJobs) {
        const { data: inserted, error } = await insertChatMessageWithFallback<Pick<ChatMessage, 'id' | 'room_id'>>(
          supabase,
          {
            room_id: NOTICE_ROOM_ID,
            sender_id: roomPrefsUserId,
            content: job.content,
            file_url: null,
            file_name: null,
          },
          'id, room_id',
        );

        if (error || !inserted?.id) {
          console.error('scheduled notice dispatch failed', error);
          continue;
        }

        markScheduledNoticeSent(roomPrefsUserId, job.id, String(inserted.id));
        void triggerChatPush(String(inserted.room_id || NOTICE_ROOM_ID), String(inserted.id));
        await fetchDataRef.current?.();
      }

      const dueReminderStages = getDueScheduledNoticeReminderStages(roomPrefsUserId);
      if (dueReminderStages.length === 0) return;

      const activeAudience = allKnownStaffs.filter(
        (staff) =>
          isActiveNoticeMember(staff) &&
          String(staff.id || '') &&
          String(staff.id || '') !== String(currentUserId || ''),
      );
      if (activeAudience.length === 0) return;

      for (const { job, offsetMinutes } of dueReminderStages) {
        const messageId = String(job.sentMessageId || '').trim();
        if (!messageId) continue;

        const [messageRow, { data: readCursors }] = await Promise.all([
          fetchMessageByIdWithRetry(messageId, 1),
          supabase
            .from('room_read_cursors')
            .select('user_id, last_read_at')
            .eq('room_id', NOTICE_ROOM_ID)
            .in('user_id', activeAudience.map((staff) => String(staff.id))),
        ]);

        if (!messageRow?.created_at) {
          recordScheduledNoticeReminder(roomPrefsUserId, job.id, offsetMinutes, 0);
          continue;
        }

        const cursorMap = new Map<string, string>();
        (readCursors || []).forEach((cursor: Record<string, unknown>) => {
          const userId = String(cursor.user_id || '').trim();
          const lastReadAt = String(cursor.last_read_at || '').trim();
          if (userId && lastReadAt) cursorMap.set(userId, lastReadAt);
        });

        const unreadMembers = activeAudience.filter(
          (member) => !isMessageReadByCursor(String(messageRow.created_at || ''), cursorMap.get(String(member.id)) || null),
        );

        if (unreadMembers.length > 0) {
          const previewText = getMessageDisplayText(
            messageRow.content,
            messageRow.file_name,
            messageRow.file_url,
            '예약 공지',
          ).replace(/\s+/g, ' ').trim();

          const payload = unreadMembers.map((member) => ({
            user_id: member.id,
            type: 'message',
            title: `예약 공지 리마인드 (+${offsetMinutes}분)`,
            body: previewText
              ? `${previewText.slice(0, 80)}${previewText.length > 80 ? '...' : ''}`
              : '예약 공지를 확인해 주세요.',
            read_at: null,
            metadata: buildChatNotificationMetadata({
              roomId: NOTICE_ROOM_ID,
              messageId,
              notificationType: 'message',
              extra: {
                reminder_kind: 'scheduled_notice_auto',
                reminder_offset_minutes: offsetMinutes,
                room_name: NOTICE_ROOM_NAME,
              },
            }),
          }));

          const { error } = await d1.from('notifications').insert(payload);
          if (error) {
            console.error('scheduled notice reminder failed', error);
            continue;
          }
        }

        recordScheduledNoticeReminder(roomPrefsUserId, job.id, offsetMinutes, unreadMembers.length);
      }
    };

    const clearPendingRun = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleNextRun = () => {
      if (disposed) return;
      clearPendingRun();

      const nextDueAt = getNextScheduledNoticeRunAt(roomPrefsUserId);
      const delay =
        nextDueAt === null
          ? SCHEDULED_NOTICE_IDLE_CHECK_MS
          : Math.max(
              SCHEDULED_NOTICE_MIN_DELAY_MS,
              Math.min(nextDueAt - Date.now(), SCHEDULED_NOTICE_IDLE_CHECK_MS),
            );

      timeoutId = window.setTimeout(() => {
        void runScheduledNotices('timer');
      }, delay);
    };

    const runScheduledNotices = async (reason: 'initial' | 'timer' | 'event') => {
      if (disposed || running) return;
      const now = Date.now();
      if (reason === 'event' && now - lastRunAt < SCHEDULED_NOTICE_EVENT_GAP_MS) return;

      running = true;
      lastRunAt = now;
      try {
        await processScheduledNotices();
      } finally {
        running = false;
        if (!disposed) scheduleNextRun();
      }
    };

    const refreshScheduledNotices = () => {
      clearPendingRun();
      void runScheduledNotices('event');
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      refreshScheduledNotices();
    };

    void runScheduledNotices('initial');
    window.addEventListener(CHAT_NOTICE_SCHEDULE_EVENT, refreshScheduledNotices as EventListener);
    window.addEventListener('focus', refreshScheduledNotices);
    window.addEventListener('online', refreshScheduledNotices);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      disposed = true;
      clearPendingRun();
      window.removeEventListener(CHAT_NOTICE_SCHEDULE_EVENT, refreshScheduledNotices as EventListener);
      window.removeEventListener('focus', refreshScheduledNotices);
      window.removeEventListener('online', refreshScheduledNotices);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [
    allKnownStaffs,
    canManageNoticeOps,
    currentUserId,
    fetchDataRef,
    fetchMessageByIdWithRetry,
    roomPrefsUserId,
    triggerChatPush,
  ]);
}

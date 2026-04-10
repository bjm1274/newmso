'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

export type ChatRealtimeState = 'idle' | 'connecting' | 'connected' | 'reconnecting';

type UseRoomNotificationSettingParams = {
  selectedRoomId: string | null;
  effectiveChatUserId: string | null | undefined;
  userId: string | null | undefined;
};

export function useRoomNotificationSetting({
  selectedRoomId,
  effectiveChatUserId,
  userId,
}: UseRoomNotificationSettingParams) {
  const [roomNotifyOn, setRoomNotifyOn] = useState(true);
  const roomNotifyRef = useRef(true);

  useEffect(() => {
    roomNotifyRef.current = roomNotifyOn;
  }, [roomNotifyOn]);

  useEffect(() => {
    const load = async () => {
      if (!(effectiveChatUserId || userId) || !selectedRoomId) {
        setRoomNotifyOn(true);
        return;
      }

      const { data, error } = await supabase
        .from('room_notification_settings')
        .select('notifications_enabled')
        .eq('user_id', effectiveChatUserId || userId)
        .eq('room_id', selectedRoomId)
        .maybeSingle();

      if (error) {
        setRoomNotifyOn(true);
        return;
      }

      setRoomNotifyOn(data?.notifications_enabled !== false);
    };

    void load();
  }, [effectiveChatUserId, selectedRoomId, userId]);

  const toggleRoomNotify = useCallback(async () => {
    if (!(effectiveChatUserId || userId) || !selectedRoomId) return;

    const previousValue = roomNotifyRef.current;
    const nextValue = !previousValue;
    setRoomNotifyOn(nextValue);
    roomNotifyRef.current = nextValue;

    try {
      const { error } = await supabase.from('room_notification_settings').upsert(
        {
          user_id: effectiveChatUserId || userId,
          room_id: selectedRoomId,
          notifications_enabled: nextValue,
        },
        { onConflict: 'user_id,room_id' }
      );

      if (error) {
        throw error;
      }
    } catch (error) {
      console.warn('room_notification_settings upsert failed', error);
      setRoomNotifyOn(previousValue);
      roomNotifyRef.current = previousValue;
      toast('채팅방 알림 설정을 저장하지 못했습니다.', 'error');
    }
  }, [effectiveChatUserId, selectedRoomId, userId]);

  return {
    roomNotifyOn,
    roomNotifyRef,
    setRoomNotifyOn,
    toggleRoomNotify,
  };
}

export function useRealtimeConnectionMeta(
  selectedRoomId: string | null,
  globalRealtimeState: ChatRealtimeState,
  roomRealtimeState: ChatRealtimeState,
) {
  return useMemo(() => {
    const state = selectedRoomId ? roomRealtimeState : globalRealtimeState;

    if (state === 'connected') {
      return {
        label: '실시간 연결됨',
        dotClassName: 'bg-emerald-500',
        textClassName: 'text-emerald-500',
      };
    }

    if (state === 'reconnecting') {
      return {
        label: '실시간 재연결 중',
        dotClassName: 'bg-amber-500',
        textClassName: 'text-amber-500',
      };
    }

    if (state === 'connecting') {
      return {
        label: '실시간 연결 중',
        dotClassName: 'bg-sky-500',
        textClassName: 'text-sky-500',
      };
    }

    return {
      label: '실시간 대기 중',
      dotClassName: 'bg-[var(--toss-gray-4)]',
      textClassName: 'text-[var(--toss-gray-4)]',
    };
  }, [globalRealtimeState, roomRealtimeState, selectedRoomId]);
}

'use client';
import { useState, useEffect, useRef } from 'react';

type ChatNotificationDetail = { title: string; body: string; room_id?: string };

/** 웹·모바일 공통: 채팅 실시간 알림 시 인앱 배너 (푸시 권한 없어도 표시, 탭하면 해당 채팅방으로 이동) */
export default function ChatAlertBanner({ onOpenChat }: { onOpenChat: (roomId: string) => void }) {
  const [item, setItem] = useState<ChatNotificationDetail | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ChatNotificationDetail>).detail;
      if (detail?.title) {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        setItem({ title: detail.title, body: detail.body || '', room_id: detail.room_id });
        hideTimerRef.current = setTimeout(() => setItem(null), 5000);
      }
    };
    window.addEventListener('erp-chat-notification', handler);
    return () => {
      window.removeEventListener('erp-chat-notification', handler);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!item) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (item.room_id) onOpenChat(item.room_id);
        setItem(null);
      }}
      className="fixed top-0 left-0 right-0 z-[100] flex items-center gap-3 px-4 py-3 bg-[#3182F6] text-white shadow-lg animate-in slide-in-from-top duration-300 safe-area-inset-top"
    >
      <span className="text-xl shrink-0">💬</span>
      <div className="flex-1 min-w-0 text-left">
        <p className="font-bold text-sm truncate">{item.title}</p>
        <p className="text-xs opacity-90 truncate">{item.body}</p>
      </div>
      <span className="text-xs font-bold shrink-0">열기</span>
    </button>
  );
}

'use client';
import { useState, useEffect, useRef } from 'react';

type ChatDetail = { title: string; body: string; room_id?: string };
type AlertDetail = { title: string; body: string; type: string; data?: any };

type BannerItem = 
  | { kind: 'chat'; title: string; body: string; room_id?: string }
  | { kind: 'alert'; title: string; body: string; type: string; data?: any };

/** 채팅·전자결재·연차촉진·출퇴근 등 실시간 알림 통합 배너 (웹·모바일 즉시 표시) */
export default function ChatAlertBanner({
  onOpenChat,
  onOpenApproval,
  onOpenNotifications,
}: {
  onOpenChat: (roomId: string) => void;
  onOpenApproval?: () => void;
  onOpenNotifications?: () => void;
}) {
  const [item, setItem] = useState<BannerItem | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (payload: BannerItem) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setItem(payload);
    hideTimerRef.current = setTimeout(() => setItem(null), 5000);
  };

  useEffect(() => {
    const chatHandler = (e: Event) => {
      const d = (e as CustomEvent<ChatDetail>).detail;
      if (d?.title) show({ kind: 'chat', title: d.title, body: d.body || '', room_id: d.room_id });
    };
    const alertHandler = (e: Event) => {
      const d = (e as CustomEvent<AlertDetail>).detail;
      if (d?.title) show({ kind: 'alert', title: d.title, body: d.body || '', type: d.type || '', data: d.data });
    };
    window.addEventListener('erp-chat-notification', chatHandler);
    window.addEventListener('erp-alert', alertHandler);
    return () => {
      window.removeEventListener('erp-chat-notification', chatHandler);
      window.removeEventListener('erp-alert', alertHandler);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!item) return null;

  const handleClick = () => {
    if (item.kind === 'chat' && item.room_id) onOpenChat(item.room_id);
    else if (item.kind === 'alert') {
      if (item.type === 'approval' && onOpenApproval) onOpenApproval();
      else if (onOpenNotifications) onOpenNotifications();
    }
    setItem(null);
  };

  const isApproval = item.kind === 'alert' && item.type === 'approval';
  const isAttendance = item.kind === 'alert' && item.type === 'attendance';
  const bg = isApproval ? 'bg-[#3182F6]' : isAttendance ? 'bg-emerald-600' : 'bg-[#3182F6]';
  const icon = isApproval ? '📋' : isAttendance ? '⏰' : '💬';

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`fixed top-0 left-0 right-0 z-[100] flex items-center gap-3 px-4 py-3 ${bg} text-white shadow-lg animate-in slide-in-from-top duration-300 safe-area-inset-top`}
    >
      <span className="text-xl shrink-0">{icon}</span>
      <div className="flex-1 min-w-0 text-left">
        <p className="font-bold text-sm truncate">{item.title}</p>
        <p className="text-xs opacity-90 truncate">{item.body}</p>
      </div>
      <span className="text-xs font-bold shrink-0">열기</span>
    </button>
  );
}

'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

type ChatDetail  = { title: string; body: string; room_id?: string };
type AlertDetail = { title: string; body: string; type: string; data?: any };

type BannerItem =
  | { kind: 'chat';  id: string; title: string; body: string; room_id?: string }
  | { kind: 'alert'; id: string; title: string; body: string; type: string; data?: any };

const DISPLAY_MS = 6000;

const TYPE_CFG: Record<string, { bg: string; icon: string; label: string }> = {
  message:    { bg: 'bg-[var(--toss-blue)]',  icon: '💬', label: '채팅 열기' },
  mention:    { bg: 'bg-indigo-600',          icon: '📣', label: '채팅 열기' },
  approval:   { bg: 'bg-violet-600',          icon: '📋', label: '결재 확인' },
  inventory:  { bg: 'bg-orange-500',          icon: '📦', label: '재고 확인' },
  payroll:    { bg: 'bg-emerald-600',         icon: '💰', label: '확인' },
  attendance: { bg: 'bg-teal-600',            icon: '⏰', label: '확인' },
  education:  { bg: 'bg-amber-500',           icon: '📚', label: '확인' },
  board:      { bg: 'bg-pink-600',            icon: '📌', label: '게시물 열기' },
  인사:        { bg: 'bg-cyan-600',            icon: '👥', label: '확인' },
};

/** 채팅·전자결재·재고·출퇴근 등 실시간 통합 상단 배너 — 큐 기반 */
export default function ChatAlertBanner({
  onOpenChat,
  onOpenApproval,
  onOpenNotifications,
  onOpenInventory,
}: {
  onOpenChat: (roomId: string) => void;
  onOpenApproval?: () => void;
  onOpenNotifications?: () => void;
  onOpenInventory?: () => void;
}) {
  const [current, setCurrent] = useState<BannerItem | null>(null);
  const [progressKey, setProgressKey] = useState(0);   // 진행바 리셋용
  const queueRef = useRef<BannerItem[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showingRef = useRef(false);

  const showNext = useCallback(() => {
    if (queueRef.current.length === 0) { showingRef.current = false; setCurrent(null); return; }
    const next = queueRef.current.shift()!;
    showingRef.current = true;
    setCurrent(next);
    setProgressKey(k => k + 1);  // 진행바 애니메이션 재시작
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(showNext, DISPLAY_MS);
  }, []);

  const enqueue = useCallback((item: BannerItem) => {
    if (item.kind === 'chat' && item.room_id && queueRef.current.some(q => q.kind === 'chat' && q.room_id === item.room_id)) return;
    queueRef.current.push(item);
    if (!showingRef.current) showNext();
  }, [showNext]);

  const dismiss = useCallback(() => { if (timerRef.current) clearTimeout(timerRef.current); showNext(); }, [showNext]);

  useEffect(() => {
    const chatHandler = (e: Event) => {
      const d = (e as CustomEvent<ChatDetail>).detail;
      if (!d?.title) return;
      enqueue({ kind: 'chat', id: Date.now().toString(), title: d.title, body: d.body || '', room_id: d.room_id });
    };
    const alertHandler = (e: Event) => {
      const d = (e as CustomEvent<AlertDetail>).detail;
      if (!d?.title) return;
      enqueue({ kind: 'alert', id: Date.now().toString(), title: d.title, body: d.body || '', type: d.type || 'notification', data: d.data });
    };
    window.addEventListener('erp-chat-notification', chatHandler);
    window.addEventListener('erp-alert', alertHandler);
    return () => {
      window.removeEventListener('erp-chat-notification', chatHandler);
      window.removeEventListener('erp-alert', alertHandler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enqueue]);

  if (!current) return null;

  const handleClick = () => {
    if (current.kind === 'chat' && current.room_id) onOpenChat(current.room_id);
    else if (current.kind === 'alert') {
      if (current.type === 'approval' && onOpenApproval) onOpenApproval();
      else if (current.type === 'inventory' && onOpenInventory) onOpenInventory();
      else if (onOpenNotifications) onOpenNotifications();
    }
    dismiss();
  };

  const cfg = current.kind === 'chat'
    ? TYPE_CFG['message']
    : TYPE_CFG[(current as any).type] || { bg: 'bg-[var(--toss-blue)]', icon: '🔔', label: '확인' };

  const pendingCount = queueRef.current.length;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`fixed top-0 left-0 right-0 z-[100] flex items-center gap-3 px-4 py-3 ${cfg.bg}/90 text-white shadow-xl animate-in slide-in-from-top duration-200 safe-area-inset-top select-none`}
    >
      {/* 아이콘 */}
      <span className="text-2xl shrink-0 drop-shadow-sm">{cfg.icon}</span>

      {/* 내용 */}
      <div className="flex-1 min-w-0 text-left">
        <p className="font-black text-sm truncate leading-tight">{current.title}</p>
        <p className="text-xs opacity-90 truncate mt-0.5">{current.body}</p>
      </div>

      {/* 대기 알림 수 */}
      {pendingCount > 0 && (
        <span className="bg-white/25 text-white text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 backdrop-blur-sm">
          +{pendingCount}
        </span>
      )}

      {/* 액션 레이블 */}
      <span className="text-xs font-black shrink-0 opacity-95 hidden sm:block">{cfg.label}</span>

      {/* 닫기 */}
      <button type="button" onClick={e => { e.stopPropagation(); dismiss(); }}
        className="text-white/80 hover:text-white text-lg shrink-0 ml-1 leading-none" aria-label="닫기">
        ✕
      </button>

      {/* 6초 진행바 */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/10 overflow-hidden">
        <div key={progressKey} className="h-full bg-white/50 animate-progress-6s" style={{ transformOrigin: 'left center' }} />
      </div>
    </button>
  );
}

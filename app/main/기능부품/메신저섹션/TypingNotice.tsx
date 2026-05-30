'use client';

// 메신저.tsx에서 추출한 "입력 중" 알림 배지. 순수 프레젠테이션.

interface TypingNoticeProps {
  text: string;
}

export function TypingNotice({ text }: TypingNoticeProps) {
  if (!text) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none relative z-20 flex h-0 justify-center px-3"
    >
      <span className="-translate-y-[calc(100%+6px)] rounded-full border border-[var(--border)] bg-[var(--card)]/95 px-3 py-1 text-[11px] font-semibold text-[var(--toss-gray-4)] shadow-sm backdrop-blur">
        {text}
      </span>
    </div>
  );
}

'use client';

// 메신저.tsx에서 추출한 전송 실패 메시지 재시도 배너. 순수 프레젠테이션.

interface RetryQueueBannerProps {
  failedCount: number;
  onRetryAll: () => void;
}

export function RetryQueueBanner({ failedCount, onRetryAll }: RetryQueueBannerProps) {
  if (failedCount <= 0) return null;
  return (
    <div
      data-testid="chat-retry-queue-banner"
      className="mx-3 mb-2 rounded-2xl border border-red-200 bg-red-500/5 px-4 py-3 md:mx-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-red-600">
            전송 실패 메시지 {failedCount}건
          </p>
          <p className="text-[11px] text-[var(--toss-gray-3)]">
            새로고침 후에도 보관되며, 네트워크가 복구되면 자동으로 다시 시도합니다.
          </p>
        </div>
        <button
          type="button"
          data-testid="chat-retry-all-failed"
          onClick={onRetryAll}
          className="shrink-0 rounded-[var(--radius-md)] bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-500/20"
        >
          모두 재시도
        </button>
      </div>
    </div>
  );
}

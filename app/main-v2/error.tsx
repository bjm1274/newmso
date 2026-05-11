/**
 * main-v2/error.tsx — 라우트 레벨 에러 바운더리
 *
 * JM3: 에러 메시지 + reset 버튼, 실제 에러 객체는 console로만
 * JM6: role="alert", 버튼 접근성
 */

'use client';

import { useEffect } from 'react';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MainV2Error({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // JM3: 실제 에러 상세는 로그만, 사용자에게는 일반 메시지 표시
    console.error('[main-v2] 렌더링 오류:', error);
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center"
    >
      {/* 아이콘 */}
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl"
        aria-hidden="true"
      >
        ⚠
      </span>

      <div className="space-y-1">
        <h2 className="text-base font-bold text-[var(--foreground)]">
          화면을 표시하는 중 오류가 발생했습니다
        </h2>
        <p className="text-sm text-[var(--toss-gray-4)]">
          잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.
        </p>
        {error.digest ? (
          <p className="text-[11px] text-[var(--toss-gray-4)]">
            오류 코드: {error.digest}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={reset}
        className="btn-premium-secondary"
        aria-label="화면 다시 불러오기"
      >
        다시 시도
      </button>
    </div>
  );
}

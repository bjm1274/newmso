/**
 * main-v2/not-found.tsx — 404 페이지
 *
 * JM6: 시맨틱 구조, 키보드 접근 가능한 링크
 *
 * ─ W-GG 의존 import ──────────────────────────────────────────────────
 * import { EmptyState } from '@/app/components/v2/EmptyState';
 * ──────────────────────────────────────────────────────────────────────
 * W-GG 완료 후 아래 인라인 마크업을 <EmptyState /> 컴포넌트로 교체한다.
 * 현재는 기존 StatePanel의 EmptyState를 직접 사용한다.
 */

import Link from 'next/link';
import { EmptyState } from '@/app/components/StatePanel';

export default function MainV2NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-16 text-center">
      <span
        className="text-5xl"
        aria-hidden="true"
      >
        🔍
      </span>

      <EmptyState
        title="페이지를 찾을 수 없습니다"
        description="요청하신 주소가 올바른지 확인해 주세요."
        actions={
          <Link
            href="/main-v2"
            className="btn-premium-secondary"
            aria-label="v2 홈으로 돌아가기"
          >
            홈으로 돌아가기
          </Link>
        }
      />
    </div>
  );
}

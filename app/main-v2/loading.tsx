/**
 * main-v2/loading.tsx — 라우트 레벨 로딩 UI (스켈레톤)
 *
 * JM2: RSC, 인터랙션 없음
 *
 * ─ W-GG 의존 import ──────────────────────────────────────────────────
 * import { Loader } from '@/app/components/v2/Loader';
 * ──────────────────────────────────────────────────────────────────────
 * W-GG 완료 후 아래 인라인 스켈레톤을 <Loader /> 컴포넌트로 교체한다.
 */

export default function MainV2Loading() {
  return (
    <div
      className="mx-auto max-w-3xl animate-pulse px-4 py-8"
      aria-label="화면 불러오는 중"
      role="status"
    >
      {/* 헤더 스켈레톤 */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-4 w-12 rounded-[var(--radius-md)] bg-[var(--muted)]" />
          <div className="h-7 w-28 rounded-[var(--radius-md)] bg-[var(--muted)]" />
          <div className="h-4 w-56 rounded-[var(--radius-md)] bg-[var(--muted)]" />
        </div>
        <div className="h-7 w-24 rounded-[var(--radius-md)] bg-[var(--muted)]" />
      </div>

      {/* 카드 그리드 스켈레톤 */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="list">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="app-card p-4">
            <div className="mb-2 h-6 w-6 rounded-[var(--radius-md)] bg-[var(--muted)]" />
            <div className="mb-1 h-4 w-16 rounded-[var(--radius-md)] bg-[var(--muted)]" />
            <div className="h-3 w-full rounded-[var(--radius-md)] bg-[var(--muted)]" />
          </li>
        ))}
      </ul>

      <span className="sr-only">화면을 불러오는 중입니다...</span>
    </div>
  );
}

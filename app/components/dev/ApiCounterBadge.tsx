'use client';

/**
 * app/components/dev/ApiCounterBadge.tsx
 * K8 API 호출 카운터 dev 전용 floating 위젯 (JM2·JM3·JM4·JM6)
 *
 * - production에서는 null 반환 → 번들 영향 없음
 * - 1초마다 카운터 갱신 (측정 자체는 fetcher.ts가 담당, 이 setInterval은 표시 전용)
 * - 클릭 / Enter → axe-core 접근성 검사 실행
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getApiCallCount,
  getLastMinuteCallCount,
  resetApiCallCount,
} from '@/lib/measurement/api-counter';
import { runAxe } from '@/lib/measurement/axe-runner';

// ─────────────────────────────────────────────
// production 가드 (JM2)
// ─────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== 'production';

// ─────────────────────────────────────────────
// 상태 타입
// ─────────────────────────────────────────────

interface CounterState {
  total: number;
  lastMinute: number;
}

// ─────────────────────────────────────────────
// 위젯 컴포넌트
// ─────────────────────────────────────────────

function ApiCounterBadgeInner(): React.ReactElement {
  const [counts, setCounts] = useState<CounterState>({ total: 0, lastMinute: 0 });
  const [axeRunning, setAxeRunning] = useState(false);
  const badgeRef = useRef<HTMLDivElement>(null);

  // 1초마다 카운터 동기화 (표시 전용 — K8 측정에 영향 없음)
  useEffect(() => {
    const tick = (): void => {
      setCounts({
        total: getApiCallCount(),
        lastMinute: getLastMinuteCallCount(),
      });
    };

    tick(); // 즉시 1회
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);

  const handleReset = useCallback((): void => {
    resetApiCallCount();
    setCounts({ total: 0, lastMinute: 0 });
  }, []);

  const handleAxe = useCallback(async (): Promise<void> => {
    if (axeRunning) return;
    setAxeRunning(true);
    try {
      await runAxe();
    } finally {
      setAxeRunning(false);
    }
  }, [axeRunning]);

  // 키보드: Enter / Space → axe 실행
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        void handleAxe();
      }
    },
    [handleAxe],
  );

  // 총 호출 수에 따른 색상 (≤5 good, ≤10 warn, >10 bad)
  const totalColor =
    counts.total <= 5
      ? 'text-emerald-400'
      : counts.total <= 10
        ? 'text-yellow-400'
        : 'text-red-400';

  const minuteColor =
    counts.lastMinute <= 2
      ? 'text-emerald-400'
      : counts.lastMinute <= 5
        ? 'text-yellow-400'
        : 'text-red-400';

  return (
    <div
      ref={badgeRef}
      role="status"
      aria-live="polite"
      aria-label={`API 호출 카운터: 총 ${counts.total}회, 최근 1분 ${counts.lastMinute}회`}
      tabIndex={0}
      onClick={() => void handleAxe()}
      onKeyDown={handleKeyDown}
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-slate-900/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
      title="클릭 또는 Enter → axe-core 접근성 검사 실행"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-slate-300 tracking-wide">K8 API</span>
        <button
          type="button"
          aria-label="API 카운터 초기화"
          onClick={(e) => {
            e.stopPropagation();
            handleReset();
          }}
          className="rounded px-1 text-slate-500 hover:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        >
          ↺
        </button>
      </div>

      {/* 카운터 */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center">
          <span className={`text-base font-bold leading-none ${totalColor}`}>
            {counts.total}
          </span>
          <span className="text-[10px] text-slate-500">total</span>
        </div>
        <div className="h-6 w-px bg-slate-700" aria-hidden="true" />
        <div className="flex flex-col items-center">
          <span className={`text-base font-bold leading-none ${minuteColor}`}>
            {counts.lastMinute}
          </span>
          <span className="text-[10px] text-slate-500">1min</span>
        </div>
      </div>

      {/* axe 상태 */}
      <div className="text-center text-[10px] text-slate-500">
        {axeRunning ? '⏳ a11y 검사 중…' : '↵ Enter → axe'}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 공개 export — production에서 null
// ─────────────────────────────────────────────

export default function ApiCounterBadge(): React.ReactElement | null {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isDev) return null;
  if (!mounted) return null;

  // E2E 테스트(Playwright 등) 환경에서는 UI를 가려 클릭 방해하는 것을 막기 위해 비활성화
  const isE2E =
    typeof window !== 'undefined' &&
    (window.navigator.webdriver ||
      (window as any).__playwright ||
      (window as any).__setMockNow ||
      (typeof window.location !== 'undefined' && window.location.search.includes('e2e=true')));

  if (isE2E) return null;

  return <ApiCounterBadgeInner />;
}

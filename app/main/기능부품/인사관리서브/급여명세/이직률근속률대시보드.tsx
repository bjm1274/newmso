'use client';
import { useState } from 'react';

export default function TurnoverDashboard({ staffs = [] }: any) {
  const total = staffs.length;
  const resigned = staffs.filter((s: any) => (s.status || '').toLowerCase() === '퇴사').length;
  const active = total - resigned;
  const turnover = total ? ((resigned / total) * 100).toFixed(1) : '0';

  // 컴포넌트 최초 렌더 시점 기준으로만 "오늘"을 고정해
  // React의 순수성 규칙을 지키면서 계산합니다.
  const [now] = useState(() => Date.now());

  const workDaysList = staffs
    .filter((s: any) => (s.status || '재직') !== '퇴사')
    .map((s: any) => {
      const j = s.joined_at || s.join_date;
      if (!j) return 0;
      return Math.floor((now - new Date(j).getTime()) / (1000 * 60 * 60 * 24));
    });
  const avgTenure = workDaysList.length ? Math.round(workDaysList.reduce((a: number, b: number) => a + b, 0) / workDaysList.length) : 0;
  const avgYears = (avgTenure / 365).toFixed(1);

  return (
    <div className="border border-[var(--toss-border)] p-4 bg-[var(--toss-card)] rounded-lg shadow-sm">
      <div className="pb-2 border-b border-[var(--toss-border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">이직률 · 근속률</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-[var(--page-bg)] rounded-lg border border-[var(--toss-border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)]">이직률</p>
          <p className="text-lg font-bold text-red-600 mt-0.5">{turnover}%</p>
          <p className="text-[10px] text-[var(--toss-gray-3)] mt-1">퇴사 {resigned}명 / 전체 {total}명</p>
        </div>
        <div className="p-3 bg-[var(--page-bg)] rounded-lg border border-[var(--toss-border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)]">평균 근속</p>
          <p className="text-lg font-bold text-[var(--toss-blue)] mt-0.5">{avgYears}년</p>
          <p className="text-[10px] text-[var(--toss-gray-3)] mt-1">재직 {active}명 기준</p>
        </div>
      </div>
    </div>
  );
}

'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { usePayrollData } from '../payroll-context';
import { buildWagePeakRows } from '../payroll-domain';

const LegacyWagePeak = dynamic(
  () => import('@/app/main/기능부품/인사관리서브/급여명세/임금피크제'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[120px] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <span className="text-[12px] text-[var(--toss-gray-3)]">임금피크제 화면 불러오는 중…</span>
      </div>
    ),
  },
);

/**
 * #8 임금피크제 — 만 60세 이상 자동 감지 + 연차별 비율 (정책 hardcoded)
 *
 * - 1년차 90% / 2년차 80% / 3년차 70% (기본값, payroll-policy.ts)
 * - admin 설정으로 override 가능 (구조만 — 현재 미연동)
 *
 * JM6: <table> + scope, 상태 변경 버튼 aria-label
 */

export default function ModWagePeak() {
  const data = usePayrollData();
  const rows = useMemo(() => buildWagePeakRows(data), [data]);
  const policy = data.policy;

  const totalGap = rows.reduce((acc, r) => acc + (r.originalSalary - r.peakedSalary), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">적용 대상</div>
          <div className="text-[20px] font-extrabold">{rows.length}<span className="text-[12px] font-medium ml-1">명</span></div>
          <div className="text-[10px] text-[var(--toss-gray-3)]">만 {policy.wagePeakStartAge}세 이상</div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">정책 단계</div>
          <div className="text-[14px] font-bold mt-1">
            {policy.wagePeakStages.map((s) => s.label).join(' / ')}
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">월 절감 (추정)</div>
          <div className="text-[18px] font-extrabold tabular-nums text-[var(--accent)]">
            {totalGap.toLocaleString()}<span className="text-[11px] font-medium ml-1">원</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">정년</div>
          <div className="text-[20px] font-extrabold">만 {policy.retirementAge}<span className="text-[12px] font-medium ml-1">세</span></div>
        </div>
      </div>

      <div className="app-card p-0 overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-[var(--border)]">
          <h3 className="section-title">적용 대상자 명단 / 통지서 · 요율 설정</h3>
        </div>
        <LegacyWagePeak
          staffs={data.staffs}
          selectedCo={data.selectedCo}
        />
      </div>
    </div>
  );
}

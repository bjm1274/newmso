'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { usePayrollData } from '../payroll-context';
import { calculateTenureYears } from '../payroll-policy';

const LegacyPensionManager = dynamic(
  () => import('@/app/main/기능부품/인사관리서브/급여명세/퇴직연금관리'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[120px] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <span className="text-[12px] text-[var(--toss-gray-3)]">퇴직연금 관리 화면 불러오는 중…</span>
      </div>
    ),
  },
);

/**
 * #5 퇴직연금 — DC/DB 가입자 현황 (admin 미설정 시 안내)
 *
 * 실제 가입정보(pension_subscriptions 등)는 별도 테이블이 필요해
 * 현재는 staff의 근속/충당금만 집계하고, 가입 유형은 회사 정책 안내로 대체.
 *
 * JM3: 가입 데이터 없을 때 사용자 메시지 명확.
 */

function calculatePensionReserve(monthlySalary: number, tenureYears: number): number {
  if (monthlySalary <= 0 || tenureYears <= 0) return 0;
  // 단순 추정: 월급 × 근속연수 / 12 → 월 충당금
  return Math.floor((monthlySalary * tenureYears) / 12);
}

export default function ModPension() {
  const data = usePayrollData();

  const summary = useMemo(() => {
    let totalReserve = 0;
    let avgTenure = 0;
    let validCount = 0;
    data.staffs.forEach((s) => {
      const tenure = calculateTenureYears(s.hire_date);
      if (tenure === null) return;
      const reserve = calculatePensionReserve(s.salary ?? 0, tenure);
      totalReserve += reserve;
      avgTenure += tenure;
      validCount += 1;
    });
    return {
      totalReserve,
      avgTenure: validCount > 0 ? avgTenure / validCount : 0,
      validCount,
    };
  }, [data.staffs]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">대상 직원</div>
          <div className="text-[20px] font-extrabold">{summary.validCount}<span className="text-[12px] font-medium ml-1">명</span></div>
          <div className="text-[10px] text-[var(--toss-gray-3)]">입사일 등록 직원</div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">평균 근속</div>
          <div className="text-[20px] font-extrabold">{summary.avgTenure.toFixed(1)}<span className="text-[12px] font-medium ml-1">년</span></div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">월 충당금 합계</div>
          <div className="text-[20px] font-extrabold tabular-nums">
            {summary.totalReserve.toLocaleString()}<span className="text-[12px] font-medium ml-1">원</span>
          </div>
        </div>
      </div>

      <div className="app-card p-0 overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-[var(--border)]">
          <h3 className="section-title">가입자 명부 등록 / DC·DB 관리</h3>
        </div>
        <LegacyPensionManager
          staffs={data.staffs}
          selectedCo={data.selectedCo}
          user={null}
        />
      </div>
    </div>
  );
}

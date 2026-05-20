'use client';

import { useMemo } from 'react';
import { usePayrollData } from '../payroll-context';
import { calculateTenureYears } from '../payroll-policy';

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="app-card p-4">
          <h3 className="section-title">DC형 (확정기여)</h3>
          <p className="text-[12px] text-[var(--toss-gray-4)] mt-2">
            사용자가 매월 일정 금액(연간 1/12 임금 이상)을 근로자 개인 계좌에 납입.
            운용 성과에 따라 퇴직 시 수령액이 결정됩니다.
          </p>
          <button
            type="button"
            className="mt-3 text-[11px] font-semibold px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] hover:bg-[var(--muted)]"
          >
            가입자 명부 등록 →
          </button>
        </div>
        <div className="app-card p-4">
          <h3 className="section-title">DB형 (확정급여)</h3>
          <p className="text-[12px] text-[var(--toss-gray-4)] mt-2">
            사용자가 운용 책임을 지고, 근로자에게 사전에 정해진 금액(평균임금 30일분 × 근속연수)을
            지급. 매년 부채평가가 필요합니다.
          </p>
          <button
            type="button"
            className="mt-3 text-[11px] font-semibold px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] hover:bg-[var(--muted)]"
          >
            DB 부채 평가 의뢰 →
          </button>
        </div>
      </div>

      <div className="app-card p-4 border-l-4 border-[var(--warning)] bg-[var(--warning-light)]">
        <h4 className="text-[12px] font-bold text-[var(--warning)]">가입 형태 미설정</h4>
        <p className="text-[11px] text-[var(--toss-gray-4)] mt-1">
          현재 시스템에 퇴직연금 가입 정보(DC/DB) 테이블이 없습니다.
          관리자 설정 화면에서 가입 유형을 등록한 뒤 정확한 납입 현황을 확인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

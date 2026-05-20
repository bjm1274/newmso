'use client';

import { useMemo } from 'react';
import { usePayrollData } from '../payroll-context';
import { buildWagePeakRows } from '../payroll-domain';

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

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
          <h3 className="section-title">적용 대상자 명단</h3>
          <button
            type="button"
            className="text-[11px] font-bold px-2.5 py-1 rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            적용 통지서 발송
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[var(--page-bg)] text-[var(--toss-gray-4)]">
              <tr>
                <th scope="col" className="text-left px-3 py-2 font-semibold">이름</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold">부서</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">만나이</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold">단계</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">기존 월급</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">적용 월급</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">차감</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--toss-gray-3)]">
                    임금피크 적용 대상자가 없습니다. (생년월일 미등록 또는 60세 미만)
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.staff_id} className="border-t border-[var(--border)] hover:bg-[var(--muted)]">
                    <td className="px-3 py-2 font-bold">{r.name}</td>
                    <td className="px-3 py-2 text-[var(--toss-gray-4)]">{r.dept}</td>
                    <td className="px-3 py-2 text-right">{r.age}세</td>
                    <td className="px-3 py-2">{r.ratioLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.originalSalary.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{r.peakedSalary.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--danger)]">
                      -{(r.originalSalary - r.peakedSalary).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="app-card p-4 border-l-4 border-[var(--accent)] bg-[var(--accent-light)]">
        <h4 className="text-[12px] font-bold text-[var(--accent)]">정책 안내</h4>
        <p className="text-[11px] text-[var(--toss-gray-4)] mt-1">
          임금피크 적용 시작 나이와 단계별 비율은 회사 정책에 따라 다릅니다.
          현재 표시 값은 기본값(보건복지부 권고안 평균)이며,
          관리자 설정에서 override 가능한 구조로 설계되어 있습니다.
        </p>
      </div>
    </div>
  );
}

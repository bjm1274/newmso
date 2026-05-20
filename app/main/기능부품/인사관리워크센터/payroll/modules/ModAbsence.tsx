'use client';

import { useMemo } from 'react';
import { usePayrollData } from '../payroll-context';
import { buildAbsenceRows } from '../payroll-domain';

/**
 * #13 무급결근 차감 — 전월 대비 base_salary 감소 자동 감지
 *
 * 감지 룰:
 *   - 이번달 base_salary < 전월 × 0.98 → 결근 차감 의심
 *   - 일급 = base / 209 × 8
 *   - 추정 결근일수 = (전월 base - 이번달 base) / 일급
 *
 * JM6: <table> + scope, 결근 사유 select label 연결
 */

export default function ModAbsence() {
  const data = usePayrollData();
  const rows = useMemo(() => buildAbsenceRows(data), [data]);

  const totalDeduction = rows.reduce((acc, r) => acc + r.deduction, 0);
  const totalDays = rows.reduce((acc, r) => acc + r.estimatedDays, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">의심 대상자</div>
          <div className={`text-[20px] font-extrabold ${rows.length > 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
            {rows.length}<span className="text-[12px] font-medium ml-1">명</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">총 추정 결근일</div>
          <div className="text-[20px] font-extrabold">{totalDays}<span className="text-[12px] font-medium ml-1">일</span></div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">총 차감액 (추정)</div>
          <div className="text-[18px] font-extrabold tabular-nums text-[var(--danger)]">
            {totalDeduction.toLocaleString()}<span className="text-[11px] font-medium ml-1">원</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">일급 산정</div>
          <div className="text-[13px] font-bold">월급 / 209h × 8h</div>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
          <h3 className="section-title">차감 적용 대상</h3>
          <button
            type="button"
            disabled={rows.length === 0}
            className="text-[11px] font-bold px-2.5 py-1 rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            결근 사유 확인
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[var(--page-bg)] text-[var(--toss-gray-4)]">
              <tr>
                <th scope="col" className="text-left px-3 py-2 font-semibold">이름</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold">부서</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">전월 기본급</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">이번달 기본급</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">차감액</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">추정 결근일</th>
                <th scope="col" className="text-center px-3 py-2 font-semibold">확인</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--toss-gray-3)]">
                    무급결근 의심 대상자가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.staff_id} className="border-t border-[var(--border)] hover:bg-[var(--muted)]">
                    <td className="px-3 py-2 font-bold">{r.name}</td>
                    <td className="px-3 py-2 text-[var(--toss-gray-4)]">{r.dept}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.prevBase.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--toss-gray-3)]">{r.curBase.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--danger)]">
                      -{r.deduction.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.estimatedDays}일</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        aria-label={`${r.name} 결근 상세 확인`}
                        className="text-[10px] font-semibold px-1.5 py-1 rounded-[var(--radius-sm)] border border-[var(--border)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                      >
                        상세
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="app-card p-4 border-l-4 border-[var(--accent)] bg-[var(--accent-light)]">
        <h4 className="text-[12px] font-bold text-[var(--accent)]">차감 규칙</h4>
        <ul className="text-[11px] text-[var(--toss-gray-4)] mt-1 leading-relaxed list-disc list-inside">
          <li>일급 = 월 기본급 / 209h × 8h (소정근로 기준)</li>
          <li>유급휴일은 차감 대상 아님 (근로기준법 제55조)</li>
          <li>경조 휴가, 병가는 회사 정책에 따라 무급/유급 처리</li>
          <li>본 화면은 의심 대상만 표시 — 실제 차감은 정산 워크플로에서 수행</li>
        </ul>
      </div>
    </div>
  );
}

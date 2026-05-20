'use client';

import { useEffect, useState } from 'react';
import { usePayroll } from '../payroll-context';
import {
  fetchRecentRetirees,
  type RetirementComputed,
} from '../payroll-fetch';

/**
 * #4 퇴직 정산 — staff_members.resign_date IS NOT NULL 기준
 *
 * 표시:
 *   - 퇴사일 / 근속 / 추정 퇴직금 (월급 × 근속연수, 단순)
 *   - 중간정산 / 정산서 발행 액션
 *
 * JM3: fetch 실패 시 빈 결과 + console.warn
 * JM6: <table> + scope, label 명시
 */

export default function ModRetirement() {
  const { selectedCo } = usePayroll();
  const [rows, setRows] = useState<RetirementComputed[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    fetchRecentRetirees(selectedCo, controller.signal)
      .then((r) => {
        if (cancelled) return;
        setRows(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedCo]);

  const totalPay = rows.reduce((acc, r) => acc + r.estimatedPay, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">퇴사자 (최근 20명)</div>
          <div className="text-[20px] font-extrabold">{rows.length}<span className="text-[12px] font-medium ml-1">명</span></div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">총 퇴직금 추정</div>
          <div className="text-[20px] font-extrabold tabular-nums">
            {(totalPay / 1_000_000).toFixed(1)}<span className="text-[12px] font-medium ml-1">M원</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">계산 기준</div>
          <div className="text-[13px] font-bold">월 평균임금 × 근속연수</div>
          <div className="text-[10px] text-[var(--toss-gray-3)]">단순 추정 · 실제는 평균/통상임금 비교</div>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
          <h3 className="section-title">최근 퇴직 정산 내역</h3>
          <button
            type="button"
            className="text-[11px] font-bold px-2.5 py-1 rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            중간정산 등록
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[var(--page-bg)] text-[var(--toss-gray-4)]">
              <tr>
                <th scope="col" className="text-left px-3 py-2 font-semibold">이름</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold">퇴사일</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold">근속</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">퇴직금(추정)</th>
                <th scope="col" className="text-center px-3 py-2 font-semibold">처리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-8 text-center text-[var(--toss-gray-3)]">불러오는 중…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-[var(--toss-gray-3)]">최근 퇴사자가 없습니다.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.staff_id} className="border-t border-[var(--border)] hover:bg-[var(--muted)]">
                    <td className="px-3 py-2 font-bold">{r.name}</td>
                    <td className="px-3 py-2 text-[var(--toss-gray-4)]">{r.resignDate ?? '-'}</td>
                    <td className="px-3 py-2 text-[var(--toss-gray-4)]">{r.tenureLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">
                      {r.estimatedPay > 0 ? r.estimatedPay.toLocaleString() : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        aria-label={`${r.name} 퇴직금 정산서 발행`}
                        className="text-[10px] font-semibold px-1.5 py-1 rounded-[var(--radius-sm)] border border-[var(--border)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                      >
                        정산서
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

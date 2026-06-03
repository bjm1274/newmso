'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { usePayroll, usePayrollData } from '../payroll-context';
import {
  fetchRecentRetirees,
  type RetirementComputed,
} from '../payroll-fetch';

// 중간정산.tsx의 export default는 props 타입이 Record<string, unknown>
const LegacyInterimSettlement = dynamic<Record<string, unknown>>(
  () => import('../../../인사관리서브/급여명세/중간정산'),
  { ssr: false, loading: () => <div className="py-8 text-center text-sm text-[var(--toss-gray-3)]">중간정산 로드 중…</div> },
);

const LegacyEmailSender = dynamic<Record<string, unknown>>(
  () => import('../../../인사관리서브/급여명세/급여명세서발송'),
  { ssr: false, loading: () => <div className="py-8 text-center text-sm text-[var(--toss-gray-3)]">발송 패널 로드 중…</div> },
);

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
  const { selectedCo, data, reload, yearMonth } = usePayroll();
  const allData = usePayrollData();
  const [rows, setRows] = useState<RetirementComputed[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInterim, setShowInterim] = useState(false);
  const [showEmailSender, setShowEmailSender] = useState(false);

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
          <div className="text-[13px] font-bold">DC 기준 (기본급+식대)</div>
          <div className="text-[10px] text-[var(--toss-gray-3)]">재직일수/365 · 1년 미만 제외 · 중간정산과 동일식</div>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
          <h3 className="section-title">최근 퇴직 정산 내역</h3>
          <button
            type="button"
            onClick={() => setShowInterim((v) => !v)}
            className="text-[11px] font-bold px-2.5 py-1 rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            {showInterim ? '닫기' : '중간정산 등록'}
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

      {showInterim && (
        <div className="app-card overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
            <h3 className="section-title">중간정산 등록</h3>
            <button
              type="button"
              onClick={() => setShowInterim(false)}
              className="text-[11px] font-semibold px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border)] hover:bg-[var(--muted)]"
            >
              닫기
            </button>
          </div>
          <div className="p-3">
            <LegacyInterimSettlement
              staffs={data?.staffs ?? []}
              selectedCo={selectedCo}
              onRefresh={reload}
            />
          </div>
        </div>
      )}

      {/* 급여명세서 발송 섹션 */}
      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
          <h3 className="section-title">급여명세서 발송</h3>
          <button
            type="button"
            onClick={() => setShowEmailSender((v) => !v)}
            className="text-[11px] font-bold px-2.5 py-1 rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            {showEmailSender ? '닫기' : '발송 패널 열기'}
          </button>
        </div>
        {showEmailSender && (
          <div className="p-3">
            <LegacyEmailSender
              staffs={allData.staffs}
              yearMonth={yearMonth}
            />
          </div>
        )}
      </div>
    </div>
  );
}

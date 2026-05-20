'use client';

import { useMemo } from 'react';
import { usePayrollData } from '../payroll-context';
import { TAX_FREE_LEGAL_LIMITS } from '@/lib/tax-free-limits';

/**
 * #10 비과세 점검 — 법정 한도 표 + 현재 정산 적용 통계
 *
 * - 한도: lib/tax-free-limits.ts TAX_FREE_LEGAL_LIMITS (2025-2026 기준)
 * - 적용: 현재월 payroll_records의 meal/vehicle 등 컬럼 평균
 *
 * JM6: <table> + caption + scope
 */

interface TaxFreeStat {
  key: string;
  label: string;
  limit: number;
  basis: string;
  avgApplied: number;
  staffCount: number;
  exceededCount: number;
}

const TAX_FREE_COLUMN_MAP: Record<string, keyof typeof TAX_FREE_LEGAL_LIMITS> = {
  meal_allowance: 'meal',
  vehicle_allowance: 'vehicle',
  childcare_allowance: 'childcare',
  research_allowance: 'research',
};

export default function ModTaxFree() {
  const data = usePayrollData();

  const stats = useMemo<TaxFreeStat[]>(() => {
    const out: TaxFreeStat[] = [];
    for (const [col, limitKey] of Object.entries(TAX_FREE_COLUMN_MAP)) {
      const limit = TAX_FREE_LEGAL_LIMITS[limitKey];
      const applied: number[] = [];
      let exceeded = 0;
      data.records.forEach((r) => {
        const v = Number((r as unknown as Record<string, unknown>)[col] ?? 0);
        if (v > 0) applied.push(v);
        if (v > limit.limit) exceeded += 1;
      });
      const avg = applied.length > 0 ? Math.floor(applied.reduce((a, b) => a + b, 0) / applied.length) : 0;
      out.push({
        key: col,
        label: limit.name,
        limit: limit.limit,
        basis: limit.basis,
        avgApplied: avg,
        staffCount: applied.length,
        exceededCount: exceeded,
      });
    }
    // 추가 표시용 (법정 한도만 노출)
    (['uniform', 'congratulations', 'housing'] as const).forEach((k) => {
      const l = TAX_FREE_LEGAL_LIMITS[k];
      out.push({
        key: k,
        label: l.name,
        limit: l.limit,
        basis: l.basis,
        avgApplied: 0,
        staffCount: 0,
        exceededCount: 0,
      });
    });
    return out;
  }, [data.records]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">비과세 항목 종류</div>
          <div className="text-[20px] font-extrabold">{stats.length}<span className="text-[12px] font-medium ml-1">개</span></div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">적용 인원</div>
          <div className="text-[20px] font-extrabold">
            {stats.reduce((acc, s) => acc + s.staffCount, 0)}
            <span className="text-[12px] font-medium ml-1">건</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">한도 초과</div>
          <div className={`text-[20px] font-extrabold ${
            stats.some((s) => s.exceededCount > 0) ? 'text-[var(--danger)]' : 'text-[var(--success)]'
          }`}>
            {stats.reduce((acc, s) => acc + s.exceededCount, 0)}
            <span className="text-[12px] font-medium ml-1">건</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">기준</div>
          <div className="text-[13px] font-bold">2025-2026 세법</div>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <table className="w-full text-[12px]">
          <caption className="sr-only">비과세 항목 법정 한도 및 현재월 적용 현황</caption>
          <thead className="bg-[var(--page-bg)] text-[var(--toss-gray-4)]">
            <tr>
              <th scope="col" className="text-left px-3 py-2 font-semibold">항목</th>
              <th scope="col" className="text-right px-3 py-2 font-semibold">법정 한도(월)</th>
              <th scope="col" className="text-right px-3 py-2 font-semibold">적용 인원</th>
              <th scope="col" className="text-right px-3 py-2 font-semibold">평균 적용액</th>
              <th scope="col" className="text-center px-3 py-2 font-semibold">초과</th>
              <th scope="col" className="text-left px-3 py-2 font-semibold">근거</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.key} className="border-t border-[var(--border)] hover:bg-[var(--muted)]">
                <td className="px-3 py-2 font-bold">{s.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.limit.toLocaleString()}원</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.staffCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {s.avgApplied > 0 ? `${s.avgApplied.toLocaleString()}원` : '-'}
                </td>
                <td className="px-3 py-2 text-center">
                  {s.exceededCount > 0 ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-[var(--danger-light)] text-[var(--danger)]">
                      {s.exceededCount}건
                    </span>
                  ) : (
                    <span className="text-[10px] text-[var(--toss-gray-3)]">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-[var(--toss-gray-4)] text-[11px]">{s.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

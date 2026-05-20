'use client';

import { useMemo, useState } from 'react';
import { usePayroll, usePayrollData } from '../payroll-context';
import { buildLedgerRows } from '../payroll-domain';

/**
 * #2 급여 대장 — 월별·부서 필터 + 표 (실데이터 staff_members + payroll_records)
 * JM5: 금액은 정수 toLocaleString
 * JM6: <table> + scope, label 연결
 */

export default function ModLedger() {
  const data = usePayrollData();
  const { yearMonth, setYearMonth } = usePayroll();
  const [dept, setDept] = useState<string>('전체');

  const rows = useMemo(() => buildLedgerRows(data), [data]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.dept));
    return ['전체', ...Array.from(set).sort()];
  }, [rows]);

  const filteredRows = useMemo(
    () => (dept === '전체' ? rows : rows.filter((r) => r.dept === dept)),
    [rows, dept],
  );

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, r) => ({
          base: acc.base + r.base,
          allowance: acc.allowance + r.allowance,
          deduction: acc.deduction + r.deduction,
          net: acc.net + r.net,
        }),
        { base: 0, allowance: 0, deduction: 0, net: 0 },
      ),
    [filteredRows],
  );

  const handleExportCsv = () => {
    const header = ['이름', '부서', '기본급', '수당', '공제', '실수령', '상태'];
    const lines = filteredRows.map((r) =>
      [r.name, r.dept, r.base, r.allowance, r.deduction, r.net, r.status].join(','),
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `급여대장_${yearMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-[var(--border)] bg-[var(--page-bg)]">
        <div className="flex gap-2 items-center">
          <label className="text-[11px] font-bold text-[var(--toss-gray-4)]" htmlFor="ledger-month">
            월
          </label>
          <input
            id="ledger-month"
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="text-[12px] px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] font-bold"
          />
          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-2" htmlFor="ledger-dept">
            부서
          </label>
          <select
            id="ledger-dept"
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            className="text-[12px] px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)]"
          >
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-[var(--toss-gray-3)] ml-2">
            {filteredRows.length}명
          </span>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleExportCsv}
            className="text-[11px] font-semibold px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border)] hover:bg-[var(--muted)]"
          >
            CSV 내보내기
          </button>
          <button
            type="button"
            className="text-[11px] font-bold px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            명세서 일괄 발송
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-[var(--page-bg)] text-[var(--toss-gray-4)]">
            <tr>
              <th scope="col" className="text-left px-3 py-2 font-semibold">이름</th>
              <th scope="col" className="text-left px-3 py-2 font-semibold">부서</th>
              <th scope="col" className="text-right px-3 py-2 font-semibold">기본급</th>
              <th scope="col" className="text-right px-3 py-2 font-semibold">수당</th>
              <th scope="col" className="text-right px-3 py-2 font-semibold">공제</th>
              <th scope="col" className="text-right px-3 py-2 font-semibold">실수령</th>
              <th scope="col" className="text-center px-3 py-2 font-semibold">상태</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[var(--toss-gray-3)]">
                  표시할 데이터가 없습니다. (직원 없음 또는 정산 미실행)
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={r.staff_id} className="border-t border-[var(--border)] hover:bg-[var(--muted)]">
                  <td className="px-3 py-2 font-bold">{r.name}</td>
                  <td className="px-3 py-2 text-[var(--toss-gray-4)]">{r.dept}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.base.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--accent)]">
                    {r.allowance > 0 ? `+${r.allowance.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--danger)]">
                    {r.deduction > 0 ? `-${r.deduction.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-extrabold">
                    {r.net > 0 ? r.net.toLocaleString() : '-'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[var(--radius-xs)] ${
                        r.hasRecord
                          ? 'bg-[var(--success-light)] text-[var(--success)]'
                          : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filteredRows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--border)] bg-[var(--page-bg)] font-bold">
                <td className="px-3 py-2" colSpan={2}>
                  합계
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.base.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--accent)]">
                  +{totals.allowance.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--danger)]">
                  -{totals.deduction.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.net.toLocaleString()}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

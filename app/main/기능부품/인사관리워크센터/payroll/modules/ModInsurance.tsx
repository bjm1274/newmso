'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { usePayroll, usePayrollData } from '../payroll-context';
import { calculateInsuranceRows } from '../payroll-domain';

const LegacyInsuranceEDI = dynamic(
  () => import('@/app/main/기능부품/인사관리서브/급여명세/4대보험EDI'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[120px] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <span className="text-[12px] text-[var(--toss-gray-3)]">4대보험 EDI 불러오는 중…</span>
      </div>
    ),
  },
);

/**
 * #6 4대보험 — 요율표 + 회사별 산재 + 신고 일정
 *
 * - 요율: `lib/payroll-insurance-rates.ts` 2026 상수 사용
 * - 산재: 회사명으로 업종 분류 (의료/도소매/기타)
 *
 * JM4: 요율은 number, 표시는 (x*100).toFixed(3) %
 * JM6: <table> + scope, 신고일은 <time>
 */

function fmtRate(r: number): string {
  return `${(r * 100).toFixed(3)}%`;
}

export default function ModInsurance() {
  const data = usePayrollData();
  const { yearMonth } = usePayroll();
  const [companyOverride, setCompanyOverride] = useState<string>('');

  const companyForRate = companyOverride || data.selectedCo || '';

  const rows = useMemo(
    () => calculateInsuranceRows(data, companyForRate),
    [data, companyForRate],
  );

  const totalEmp = rows.reduce((acc, r) => acc + r.amountEmployee, 0);
  const totalEmpr = rows.reduce((acc, r) => acc + r.amountEmployer, 0);

  const [, mStr] = yearMonth.split('-');
  const reportingDate = `${parseInt(mStr || '0', 10)}/22`;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">근로자 부담 합계</div>
          <div className="text-[18px] font-extrabold tabular-nums text-[var(--danger)]">
            {totalEmp.toLocaleString()}<span className="text-[11px] font-medium ml-1">원</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">사업주 부담 합계</div>
          <div className="text-[18px] font-extrabold tabular-nums text-[var(--accent)]">
            {totalEmpr.toLocaleString()}<span className="text-[11px] font-medium ml-1">원</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">합계 (4대보험)</div>
          <div className="text-[18px] font-extrabold tabular-nums">
            {(totalEmp + totalEmpr).toLocaleString()}<span className="text-[11px] font-medium ml-1">원</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">EDI 신고 예정</div>
          <div className="text-[18px] font-extrabold"><time dateTime={`${yearMonth}-22`}>{reportingDate}</time></div>
          <div className="text-[10px] text-[var(--toss-gray-3)]">매월 22일</div>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <h3 className="section-title">2026 요율 · 회사: {companyForRate || '(전체)'}</h3>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-[var(--toss-gray-4)]" htmlFor="ins-company">
              산재 업종 적용
            </label>
            <input
              id="ins-company"
              type="text"
              placeholder="회사명 (예: 의원, 도소매)"
              value={companyOverride}
              onChange={(e) => setCompanyOverride(e.target.value)}
              className="text-[12px] px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)]"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[var(--page-bg)] text-[var(--toss-gray-4)]">
              <tr>
                <th scope="col" className="text-left px-3 py-2 font-semibold">보험</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">근로자 요율</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">사업주 요율</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">근로자 부담</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">사업주 부담</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">합계</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t border-[var(--border)] hover:bg-[var(--muted)]">
                  <td className="px-3 py-2 font-bold">{r.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtRate(r.rateEmployee)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtRate(r.rateEmployer)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--danger)]">
                    {r.amountEmployee.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--accent)]">
                    {r.amountEmployer.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-extrabold">{r.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--border)] bg-[var(--page-bg)] font-bold">
                <td className="px-3 py-2">합계</td>
                <td className="px-3 py-2" colSpan={2} />
                <td className="px-3 py-2 text-right tabular-nums text-[var(--danger)]">
                  {totalEmp.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--accent)]">
                  {totalEmpr.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {(totalEmp + totalEmpr).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="app-card p-0 overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-[var(--border)]">
          <h3 className="section-title">EDI 신고 / 개인별 4대보험 산출</h3>
        </div>
        <LegacyInsuranceEDI
          staffs={data.staffs}
          selectedCo={data.selectedCo}
          user={null}
        />
      </div>
    </div>
  );
}

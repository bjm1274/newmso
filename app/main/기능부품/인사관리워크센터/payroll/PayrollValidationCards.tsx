'use client';

import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePayroll, usePayrollData } from './payroll-context';
import {
  buildAbsenceRows,
  calculateInsuranceRows,
  buildLedgerRows,
  buildMinWageRows,
  buildUnpaidRows,
  buildWagePeakRows } from './payroll-domain';
import LaborCostTrend from '@/app/main/기능부품/인사관리서브/급여명세/인건비추이분석';
import TotalLaborCostForecast from '@/app/main/기능부품/인사관리서브/급여명세/총인건비예측';
import UnpaidAllowanceAlert from '@/app/main/기능부품/인사관리서브/급여명세/미지급수당알림';
import {
  ORDINARY_WAGE_INCLUDED_KEYS,
  ORDINARY_WAGE_EXCLUDED_KEYS,
  calculateTenureYears,
  calculateAge } from './payroll-policy';
import { fetchRecentRetirees, type RetirementComputed } from './payroll-fetch';
import { calculateKpis } from './payroll-kpi';
import type { StaffMember } from '@/types';
import { toast } from '@/lib/toast';
import { db } from '@/lib/db-client';
import { calculateEmployeeInsuranceDeductions } from '@/lib/payroll-insurance-rates';
import {
  calculateMonthlyIncomeTax,
  fetchTaxInsuranceRates,
  DEFAULT_TAX_INSURANCE_RATES,
  hasExactIncomeTaxBracket,
  type TaxInsuranceRates } from '@/lib/use-tax-insurance-rates';
import { TAX_FREE_LEGAL_LIMITS } from '@/lib/tax-free-limits';

function parseNumber(v: string): number {
  const clean = v.replace(/,/g, '').trim();
  const n = Number(clean);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

// ==========================================
// ModAbsence.tsx
// ==========================================
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

export function ModAbsence() {
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

// ==========================================
// ModInsurance.tsx
// ==========================================
const LegacyInsuranceEDI = dynamic(
  () => import('@/app/main/기능부품/인사관리서브/급여명세/4대보험EDI'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[120px] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <span className="text-[12px] text-[var(--toss-gray-3)]">4대보험 EDI 불러오는 중…</span>
      </div>
    ) },
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

export function ModInsurance() {
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

// ==========================================
// ModLedger.tsx
// ==========================================
const LegacySalaryDetail = dynamic(
  () => import('@/app/main/기능부품/인사관리서브/급여명세/급여상세'),
  {
    ssr: false,
    loading: () => (
      <div className="py-10 text-center text-sm text-[var(--toss-gray-3)]">
        명세서 로드 중…
      </div>
    ) },
);

/**
 * #2 급여 대장 — 월별·부서 필터 + 표 및 시각적 분석 대시보드
 */

export function ModLedger({ user }: { user?: any }) {
  const data = usePayrollData();
  const { yearMonth, setYearMonth, selectedCo } = usePayroll();
  const [activeTab, setActiveTab] = useState<'ledger' | 'analysis'>('ledger');
  const [dept, setDept] = useState<string>('전체');
  const [selectedStaffId, setSelectedStaffId] = useState<string | number | null>(null);

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
          net: acc.net + r.net }),
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
    <div className="flex flex-col gap-4">
      {/* 프리미엄 탭 세그먼트 */}
      <div className="flex bg-[var(--tab-bg)] p-1 rounded-[var(--radius-md)] border border-[var(--border)] max-w-md self-start">
        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          className={`flex-1 px-4 py-1.5 text-xs font-bold rounded-[var(--radius-sm)] transition-all ${
            activeTab === 'ledger'
              ? 'bg-white text-[var(--accent)] shadow-sm'
              : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
          }`}
        >
          급여대장 명단
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('analysis')}
          className={`flex-1 px-4 py-1.5 text-xs font-bold rounded-[var(--radius-sm)] transition-all ${
            activeTab === 'analysis'
              ? 'bg-white text-[var(--accent)] shadow-sm'
              : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
          }`}
        >
          인건비 다차원 분석
        </button>
      </div>

      {activeTab === 'analysis' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TotalLaborCostForecast
            staffs={data.staffs}
            selectedCo={selectedCo}
            user={user}
          />
          <div className="p-4 bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)]">
            <LaborCostTrend selectedCo={selectedCo} />
          </div>
        </div>
      ) : (
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
                    <tr
                      key={r.staff_id}
                      className="border-t border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer"
                      onClick={() => setSelectedStaffId(r.staff_id)}
                      data-testid={`payroll-ledger-row-${r.staff_id}`}
                    >
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
      )}

      {/* 급여 상세 모달 */}
      {selectedStaffId !== null && (() => {
        const staff = data.staffs.find((s) => String(s.id) === String(selectedStaffId));
        const record = data.records.find((r) => String(r.staff_id) === String(selectedStaffId));
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="급여 상세"
            data-testid="payroll-ledger-detail-modal"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setSelectedStaffId(null)}
          >
            <div
              className="relative w-full max-w-[680px] max-h-[90vh] overflow-y-auto bg-white rounded-[var(--radius-lg)] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
                <span className="text-[13px] font-bold">
                  {staff ? `${staff.name} 급여 명세서` : '급여 명세서'}
                </span>
                <button
                  type="button"
                  aria-label="닫기"
                  onClick={() => setSelectedStaffId(null)}
                  className="text-[18px] leading-none text-[var(--toss-gray-3)] hover:text-[var(--foreground)] px-1"
                >
                  ×
                </button>
              </div>
              <div className="p-2">
                {record ? (
                  <LegacySalaryDetail record={record as any} staff={staff as any} />
                ) : (
                  <div
                    data-testid="payroll-ledger-pending-placeholder"
                    className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-10 text-center"
                  >
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--muted)] text-2xl">🧾</div>
                    <h3 className="mt-4 text-xl font-bold text-[var(--foreground)]">
                      {staff?.name}님의 급여는 아직 정산중입니다
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--toss-gray-3)]">
                      급여정산에서 저장 또는 확정한 뒤 다시 확인해 주세요.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ==========================================
// ModMinWage.tsx
// ==========================================
/**
 * #9 최저임금 점검 — 2026 기준 시급 10,320원 (정책 hardcoded)
 *
 * - 시급 환산 = 월 기본급 / 209h (Korean standard)
 * - 미달자만 우선 표시 옵션
 *
 * JM6: 필터 체크박스 label 연결, <table> + scope
 */

export function ModMinWage() {
  const data = usePayrollData();
  const rows = useMemo(() => buildMinWageRows(data), [data]);
  const [onlyBelow, setOnlyBelow] = useState<boolean>(true);

  const filtered = useMemo(
    () => (onlyBelow ? rows.filter((r) => r.status === '미달') : rows),
    [rows, onlyBelow],
  );

  const policy = data.policy;
  const belowCount = rows.filter((r) => r.status === '미달').length;
  const lowestHourly = rows.reduce((acc, r) => (r.hourly > 0 && r.hourly < acc ? r.hourly : acc), Number.POSITIVE_INFINITY);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">2026 최저시급</div>
          <div className="text-[20px] font-extrabold tabular-nums">
            {policy.minimumWageHourly.toLocaleString()}<span className="text-[11px] font-medium ml-1">원</span>
          </div>
          <div className="text-[10px] text-[var(--toss-gray-3)]">전년 {policy.minimumWageHourlyPrev.toLocaleString()}원</div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">전체 환산 대상</div>
          <div className="text-[20px] font-extrabold">{rows.length}<span className="text-[12px] font-medium ml-1">명</span></div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">미달자</div>
          <div className={`text-[20px] font-extrabold ${belowCount > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
            {belowCount}<span className="text-[12px] font-medium ml-1">명</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">최저 시급(환산)</div>
          <div className="text-[18px] font-extrabold tabular-nums">
            {Number.isFinite(lowestHourly) ? lowestHourly.toLocaleString() : '-'}
            <span className="text-[11px] font-medium ml-1">원</span>
          </div>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
          <h3 className="section-title">시급 환산 점검 표</h3>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--toss-gray-4)] cursor-pointer">
            <input
              type="checkbox"
              checked={onlyBelow}
              onChange={(e) => setOnlyBelow(e.target.checked)}
            />
            미달자만 표시
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[var(--page-bg)] text-[var(--toss-gray-4)]">
              <tr>
                <th scope="col" className="text-left px-3 py-2 font-semibold">이름</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold">부서</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">월 기본급</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">시급(환산)</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">기준 대비</th>
                <th scope="col" className="text-center px-3 py-2 font-semibold">판정</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--toss-gray-3)]">
                    {onlyBelow ? '미달자가 없습니다.' : '표시할 데이터가 없습니다.'}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.staff_id} className="border-t border-[var(--border)] hover:bg-[var(--muted)]">
                    <td className="px-3 py-2 font-bold">{r.name}</td>
                    <td className="px-3 py-2 text-[var(--toss-gray-4)]">{r.dept}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.monthlySalary.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{r.hourly.toLocaleString()}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.gap >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {r.gap >= 0 ? '+' : ''}{r.gap.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[var(--radius-xs)] ${
                          r.status === '적합'
                            ? 'bg-[var(--success-light)] text-[var(--success)]'
                            : 'bg-[var(--danger-light)] text-[var(--danger)]'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="app-card p-4 border-l-4 border-[var(--accent)] bg-[var(--accent-light)]">
        <h4 className="text-[12px] font-bold text-[var(--accent)]">기준 안내</h4>
        <p className="text-[11px] text-[var(--toss-gray-4)] mt-1">
          시급 환산은 월 209시간 기준 (주 40시간 / 월 평균 4.345주 + 유급주휴 8시간).
          판정에는 정기상여, 식대 등 통상임금 산입분이 포함되지 않을 수 있으므로
          미달자는 통상임금 계산기로 재확인 권장.
        </p>
      </div>
    </div>
  );
}

// ==========================================
// ModOrdinary.tsx
// ==========================================
/**
 * #11 통상임금 계산기 — 시간당 통상임금 + 수당 계산식
 *
 * 통상임금:
 *   포함: 기본급, 직책수당, 정기 식대(고정), 정기 자가운전(고정)
 *   제외: 초과/야간/휴일 수당, 정기상여(판례 변경 가능), 보너스
 *
 * 계산:
 *   시간당 통상임금 = 통상임금 월 합계 / 209h
 *   연장 1h = 시간당 × 1.5
 *   야간 1h = 시간당 × 1.5
 *   휴일 1h = 시간당 × 1.5
 *
 * JM6: 입력 label 연결, 결과 영역 aria-live
 */



export function ModOrdinary() {
  const data = usePayrollData();

  const [staffId, setStaffId] = useState<string>('');
  const [base, setBase] = useState<string>('3,800,000');
  const [positionAllowance, setPositionAllowance] = useState<string>('100,000');
  const [mealAllowance, setMealAllowance] = useState<string>('200,000');
  const [vehicleAllowance, setVehicleAllowance] = useState<string>('0');

  const monthlyHours = data.policy.monthlyStandardHours;

  const ordinarySum =
    parseNumber(base) +
    parseNumber(positionAllowance) +
    parseNumber(mealAllowance) +
    parseNumber(vehicleAllowance);

  const hourly = useMemo(() => Math.floor(ordinarySum / Math.max(1, monthlyHours)), [ordinarySum, monthlyHours]);

  const overtime1h = Math.floor(hourly * 1.5);
  const night1h = Math.floor(hourly * 1.5);
  const holiday1h = Math.floor(hourly * 1.5);

  const handlePickStaff = (id: string) => {
    setStaffId(id);
    const s = data.staffs.find((st) => String(st.id) === id);
    if (s?.salary) setBase(s.salary.toLocaleString());
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <form
          className="app-card p-4 flex flex-col gap-3"
          onSubmit={(e) => e.preventDefault()}
        >
          <h3 className="section-title">통상임금 산입 항목</h3>

          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            대상 직원 (선택 시 기본급 자동)
            <select
              value={staffId}
              onChange={(e) => handlePickStaff(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
            >
              <option value="">— 직접 입력 —</option>
              {data.staffs.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name} · {s.department ?? '-'}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            기본급 (원)
            <input
              type="text"
              inputMode="numeric"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            직책수당 (원)
            <input
              type="text"
              inputMode="numeric"
              value={positionAllowance}
              onChange={(e) => setPositionAllowance(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            정기 식대 (원)
            <input
              type="text"
              inputMode="numeric"
              value={mealAllowance}
              onChange={(e) => setMealAllowance(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            정기 자가운전보조비 (원)
            <input
              type="text"
              inputMode="numeric"
              value={vehicleAllowance}
              onChange={(e) => setVehicleAllowance(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>

          <div className="text-[10px] text-[var(--toss-gray-3)] mt-1 leading-relaxed">
            <b>포함:</b> {ORDINARY_WAGE_INCLUDED_KEYS.join(', ')}<br />
            <b>제외:</b> {ORDINARY_WAGE_EXCLUDED_KEYS.join(', ')}
          </div>
        </form>

        <div className="app-card p-4" aria-live="polite">
          <h3 className="section-title">계산 결과</h3>
          <div className="mt-3 p-4 rounded-[var(--radius-md)] bg-[var(--accent-light)]">
            <div className="text-[11px] text-[var(--toss-gray-4)]">시간당 통상임금</div>
            <div className="text-[28px] font-extrabold tabular-nums text-[var(--accent)]">
              {hourly.toLocaleString()}<span className="ml-1 text-[14px] font-bold">원</span>
            </div>
            <div className="text-[11px] text-[var(--toss-gray-4)]">
              월 통상임금 {ordinarySum.toLocaleString()}원 / {monthlyHours}h
            </div>
          </div>

          <ul className="mt-3 flex flex-col gap-1.5">
            <li className="flex justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
              <span className="text-[12px] text-[var(--toss-gray-4)]">연장근로 1h (1.5배)</span>
              <b className="tabular-nums">{overtime1h.toLocaleString()}원</b>
            </li>
            <li className="flex justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
              <span className="text-[12px] text-[var(--toss-gray-4)]">야간근로 1h (1.5배)</span>
              <b className="tabular-nums">{night1h.toLocaleString()}원</b>
            </li>
            <li className="flex justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
              <span className="text-[12px] text-[var(--toss-gray-4)]">휴일근로 1h (1.5배)</span>
              <b className="tabular-nums">{holiday1h.toLocaleString()}원</b>
            </li>
            <li className="flex justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
              <span className="text-[12px] text-[var(--toss-gray-4)]">연차수당 1일 (8h)</span>
              <b className="tabular-nums">{(hourly * 8).toLocaleString()}원</b>
            </li>
          </ul>
        </div>
      </div>

      <div className="app-card p-4 border-l-4 border-[var(--warning)] bg-[var(--warning-light)]">
        <h4 className="text-[12px] font-bold text-[var(--warning)]">통상임금 산입 룰</h4>
        <p className="text-[11px] text-[var(--toss-gray-4)] mt-1 leading-relaxed">
          정기상여는 2024년 대법원 판례 변경(2024다394541)으로 통상임금 산입 여부 재검토 권장.
          본 계산기는 보수적으로 정기상여를 제외하며, 회사 정책에 따라 조정 필요.
        </p>
      </div>
    </div>
  );
}

// ==========================================
// ModPension.tsx
// ==========================================
const LegacyPensionManager = dynamic(
  () => import('@/app/main/기능부품/인사관리서브/급여명세/퇴직연금관리'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[120px] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <span className="text-[12px] text-[var(--toss-gray-3)]">퇴직연금 관리 화면 불러오는 중…</span>
      </div>
    ) },
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

export function ModPension() {
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
      validCount };
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

// ==========================================
// ModRetirement.tsx
// ==========================================
// 중간정산.tsx의 export default는 props 타입이 Record<string, unknown>
const LegacyInterimSettlement = dynamic<Record<string, unknown>>(
  () => import('@/app/main/기능부품/인사관리서브/급여명세/중간정산'),
  { ssr: false, loading: () => <div className="py-8 text-center text-sm text-[var(--toss-gray-3)]">중간정산 로드 중…</div> },
);

const LegacyEmailSender = dynamic<Record<string, unknown>>(
  () => import('@/app/main/기능부품/인사관리서브/급여명세/급여명세서발송'),
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

export function ModRetirement() {
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

// ==========================================
// ModSettlement.tsx
// ==========================================
type SalarySettlementProps = {
  staffs: StaffMember[];
  selectedCo: string;
  onRefresh?: () => void;
  initialStep?: number;
};

const LegacySalarySettlement = dynamic<SalarySettlementProps>(
  () => import('@/app/main/기능부품/인사관리서브/급여명세/급여정산'),
  { ssr: false, loading: () => <div className="py-8 text-center text-sm text-[var(--toss-gray-3)]">급여정산 로드 중…</div> },
);

/**
 * #1 급여 정산 — 5단계 워크플로 (근태 마감 → 수당·공제 → 결재 → 지급 → 원천징수)
 * JM6: <ol> + aria-current="step", 액션 버튼 disabled aria 명시
 */

type StepState = 'done' | 'on' | 'pending';

interface StepDef {
  id: number;
  label: string;
  body: string;
  state: StepState;
  actionLabel: string;
  date: string;
}

function stepBoxClass(state: StepState): string {
  if (state === 'done') return 'bg-[var(--success-light)] border-[var(--success)]';
  if (state === 'on')   return 'bg-[var(--accent-light)] border-[var(--accent)]';
  return 'bg-[var(--card)] border-[var(--border)]';
}

function stepBadgeClass(state: StepState): string {
  if (state === 'done') return 'bg-[var(--success)] text-white';
  if (state === 'on')   return 'bg-[var(--accent)] text-white';
  return 'bg-[var(--muted)] text-[var(--toss-gray-4)]';
}

export function ModSettlement() {
  const data = usePayrollData();
  const { selectedCo, reload } = usePayroll();
  const kpis = useMemo(() => calculateKpis(data), [data]);
  const [advancing, setAdvancing] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [initialStep, setInitialStep] = useState(1);

  const hasRecord = data.records.length > 0;
  const allConfirmed =
    hasRecord && data.records.every((r) => r.status === '확정' || r.status === 'CONFIRMED');
  const [y, m] = data.yearMonth.split('-');
  const isLocked = data.isLocked;
  const payrollDay = data.payrollDay ?? 15;

  const steps: StepDef[] = [
    {
      id: 1,
      label: '근태 마감',
      body: `${y}년 ${m}월 근로시간 확정 · 지각·조퇴 반영. 총 ${kpis.headcount}명 대상.`,
      state: hasRecord ? 'done' : 'on',
      actionLabel: '근태 워크센터 열기',
      date: `${m}/3` },
    {
      id: 2,
      label: '수당·공제 산정',
      body: `초과·야간·휴일 수당 + 4대보험·소득세 자동 산정. 수당 합계 ${kpis.allowanceSum.toLocaleString()}원.`,
      state: hasRecord ? 'done' : 'pending',
      actionLabel: '시뮬레이션',
      date: `${m}/7` },
    {
      id: 3,
      label: '결재 상신',
      body: `정산 ${data.records.length}건을 결재 상신합니다. 검토자/전결자 지정 필요.`,
      state: allConfirmed ? 'done' : hasRecord ? 'on' : 'pending',
      actionLabel: '결재 상신',
      date: `${m}/10` },
    {
      id: 4,
      label: '지급 처리',
      body: `은행 이체 파일(.xlsx) 생성 · 총 ${kpis.netPaySum.toLocaleString()}원 지급.`,
      state: allConfirmed ? 'on' : 'pending',
      actionLabel: '이체 파일 다운로드',
      date: `예정 ${m}/${payrollDay}` },
    {
      id: 5,
      label: '원천징수 신고',
      body: '국세청 제출 파일 생성 · 지방세 포함 · 간이세액 적용.',
      state: allConfirmed ? 'on' : 'pending',
      actionLabel: '신고 파일 생성',
      date: `예정 ${m}/20` },
  ];

  const doneCount = steps.filter((s) => s.state === 'done').length;

  const downloadTransferFile = async () => {
    const confirmedRecords = data.records.filter(r => (r.status === '확정' || r.status === 'CONFIRMED') && r.net_pay > 0);
    if (confirmedRecords.length === 0) {
      toast('확정된 급여 내역이 없습니다. 먼저 급여 정산을 완료하여 확정해 주세요.', 'warning');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const staffIds = Array.from(new Set(confirmedRecords.map(r => String(r.staff_id))));

      const { data: dbStaffs, error: dbError } = await db
        .from('staff_members')
        .select('id, name, bank_name, bank_account, permissions')
        .in('id', staffIds);

      if (dbError) {
        throw new Error(dbError.message);
      }

      const staffMap = new Map<string, any>();
      if (dbStaffs) {
        dbStaffs.forEach((s: any) => {
          staffMap.set(String(s.id), s);
        });
      }

      const excelData = confirmedRecords.map(record => {
        const staffIdStr = String(record.staff_id);
        const dbStaff = staffMap.get(staffIdStr);
        const fallbackStaff = data.staffs.find(s => String(s.id) === staffIdStr);
        
        const staff = dbStaff || fallbackStaff;
        const perms = staff?.permissions as Record<string, any> | undefined;
        const name = (staff?.name || '미지정').trim();
        const bankName = (
          staff?.bank_name || 
          perms?.bank_name || 
          (perms?.payroll_allowances as Record<string, any> | undefined)?.bank_name || 
          '미지정'
        ).toString().trim();
        const bankAccount = (
          staff?.bank_account || 
          perms?.bank_account || 
          (perms?.payroll_allowances as Record<string, any> | undefined)?.bank_account || 
          '미지정'
        ).toString().trim();
        const amount = record.net_pay;
        return {
          '이름': name,
          '은행명': bankName,
          '계좌번호': bankAccount,
          '이체금액': amount
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '급여이체내역');

      XLSX.writeFile(workbook, `급여이체내역_${data.yearMonth}.xlsx`);
      toast('급여 이체 파일 다운로드가 시작되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to export excel file:', error);
      toast('엑셀 파일 생성 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleAdvance = () => {
    if (isLocked) return;
    setInitialStep(1);
    setAdvancing(true);
    setShowLegacy(true);
    setTimeout(() => setAdvancing(false), 300);
  };

  const handleStepAction = (stepId: number) => {
    if (stepId === 1) {
      window.dispatchEvent(new CustomEvent('hr-menu-change', { detail: 'attend' }));
    } else if (stepId === 2 || stepId === 3) {
      setInitialStep(2);
      setShowLegacy(true);
    } else if (stepId === 4) {
      downloadTransferFile();
    } else if (stepId === 5) {
      window.dispatchEvent(new CustomEvent('payroll-module-change', { detail: 'withholding' }));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {isLocked && (
        <div className="bg-[var(--warning-light)] border border-[var(--warning)] text-[var(--warning-dark)] px-3 py-2.5 rounded-[var(--radius-md)] text-[12.5px] font-semibold flex items-center gap-2">
          <span>⚠️</span>
          <span>해당 월의 급여 정산이 마감(잠금)되어 데이터를 수정하거나 추가적인 정산 단계를 진행할 수 없습니다.</span>
        </div>
      )}
      {showLegacy && (
        <div className="app-card overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
            <h3 className="section-title">급여 정산 실행</h3>
            <button
              type="button"
              onClick={() => setShowLegacy(false)}
              className="text-[11px] font-semibold px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border)] hover:bg-[var(--muted)]"
            >
              닫기
            </button>
          </div>
          <div className="p-3">
            <LegacySalarySettlement
              staffs={data.staffs}
              selectedCo={selectedCo}
              onRefresh={reload}
              initialStep={initialStep}
            />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">정산 진행 단계</div>
          <div className="text-[20px] font-extrabold">{doneCount}<span className="text-[12px] font-medium ml-0.5">/5</span></div>
          <div className="text-[10px] text-[var(--warning)]">지급 예정 {m}/{payrollDay}</div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">정산 대상자</div>
          <div className="text-[20px] font-extrabold">{kpis.headcount}<span className="text-[12px] font-medium ml-1">명</span></div>
          <div className="text-[10px] text-[var(--toss-gray-3)]">상시 {kpis.regularCount} · 시급 {kpis.hourlyCount}</div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">레코드 생성</div>
          <div className="text-[20px] font-extrabold">{data.records.length}<span className="text-[12px] font-medium ml-1">건</span></div>
          <div className="text-[10px] text-[var(--success)]">{Math.max(0, kpis.headcount - data.records.length)}명 누락</div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">총 지급 예정액</div>
          <div className="text-[20px] font-extrabold tabular-nums">{(kpis.netPaySum / 1_000_000).toFixed(1)}<span className="text-[12px] font-medium ml-1">M원</span></div>
          <div className="text-[10px] text-[var(--toss-gray-3)]">전월 비교 KPI 참조</div>
        </div>
      </div>

      <div className="app-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title">정산 5단계 워크플로</h3>
          <button
            type="button"
            data-testid="mod-settlement-start-button"
            disabled={advancing || doneCount >= 5 || isLocked}
            onClick={handleAdvance}
            aria-disabled={advancing || doneCount >= 5 || isLocked}
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {advancing ? '진행 중…' : doneCount >= 5 ? '정산 완료' : '다음 단계 시작'}
          </button>
        </div>
        <ol className="flex flex-col gap-2">
          {steps.map((step) => (
            <li
              key={step.id}
              aria-current={step.state === 'on' ? 'step' : undefined}
              className={`flex items-start gap-3 p-3 rounded-[var(--radius-md)] border ${stepBoxClass(step.state)}`}
            >
              <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-extrabold ${stepBadgeClass(step.state)}`}>
                {step.state === 'done' ? '✓' : step.id}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <div className="text-[13px] font-bold">
                    {step.id}. {step.label}
                  </div>
                  <span className="text-[11px] font-medium text-[var(--toss-gray-4)]">{step.date}</span>
                </div>
                <div className="text-[11px] text-[var(--toss-gray-4)] mt-0.5">{step.body}</div>
              </div>
              {step.state !== 'pending' && (
                <button
                  type="button"
                  onClick={() => handleStepAction(step.id)}
                  disabled={isLocked && step.id !== 1 && step.id !== 4}
                  className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {step.actionLabel}
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ==========================================
// ModSimulator.tsx
// ==========================================
/**
 * #3 급여 시뮬레이터 — 좌측 입력 / 우측 실시간 계산
 *
 * 계산:
 *   gross = base + overtime + night + holiday
 *   4대보험 = calculateEmployeeInsuranceDeductions(taxable, age)
 *   간이세액 = (taxable - 비과세) × 6% (단순 추정 — 실제는 간이세액표)
 *   지방세 = 소득세 × 10%
 *   net = gross - 4대보험 - 소득세 - 지방세
 *
 * JM6: 모든 input label 연결, 키보드 포커스, aria-live 결과 영역
 * JM5: 정수 계산만 (Math.floor)
 */



function formatInt(n: number): string {
  return n.toLocaleString();
}

interface SimulatorInputs {
  staffId: string;
  base: number;
  overtimeHours: number;
  nightHours: number;
  holidayHours: number;
  taxableExtra: number;
  taxFreeExtra: number;
}

interface SimulatorResult {
  gross: number;
  overtimePay: number;
  nightPay: number;
  holidayPay: number;
  insurance: number;
  incomeTax: number;
  localTax: number;
  netPay: number;
  hourly: number;
}

function computeSimulation(
  input: SimulatorInputs,
  age: number,
  taxInsuranceRates: TaxInsuranceRates | null,
  dependentCount: number
): SimulatorResult {
  const hourly = Math.floor(input.base / 209);
  const overtimePay = Math.floor(hourly * input.overtimeHours * 1.5);
  const nightPay = Math.floor(hourly * input.nightHours * 1.5);
  const holidayPay = Math.floor(hourly * input.holidayHours * 1.5);
  const gross = input.base + overtimePay + nightPay + holidayPay + input.taxableExtra;

  const taxable = Math.max(0, gross - input.taxFreeExtra);
  const ins = calculateEmployeeInsuranceDeductions(taxable, age);
  
  const rates = taxInsuranceRates || DEFAULT_TAX_INSURANCE_RATES;
  const incomeTax = calculateMonthlyIncomeTax(
    taxable,
    rates,
    dependentCount,
    {
      withholdingRatePercent: 100,
      qualifyingChildCount: 0 }
  );
  const localTax = Math.floor((incomeTax * 0.1) / 10) * 10;

  const netPay = gross - ins.total - incomeTax - localTax;

  return {
    gross,
    overtimePay,
    nightPay,
    holidayPay,
    insurance: ins.total,
    incomeTax,
    localTax,
    netPay,
    hourly };
}

export function ModSimulator() {
  const data = usePayrollData();

  const [staffId, setStaffId] = useState<string>('');
  const [base, setBase] = useState<string>('3,800,000');
  const [overtimeHours, setOvertimeHours] = useState<string>('18');
  const [nightHours, setNightHours] = useState<string>('12');
  const [holidayHours, setHolidayHours] = useState<string>('4');
  const [taxableExtra, setTaxableExtra] = useState<string>('0');
  const [taxFreeExtra, setTaxFreeExtra] = useState<string>('200000');

  const [taxInsuranceRates, setTaxInsuranceRates] = useState<TaxInsuranceRates | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const year = new Date().getFullYear();
        const rates = await fetchTaxInsuranceRates(data.selectedCo || '전체', year);
        if (active) setTaxInsuranceRates(rates);
      } catch (err) {
        console.error('Failed to fetch tax rates in simulator:', err);
      }
    })();
    return () => {
      active = false;
    };
  }, [data.selectedCo]);

  // 직원 선택 시 그 직원의 salary로 base 자동 채우기
  const selectedStaff = useMemo(
    () => data.staffs.find((s) => String(s.id) === staffId),
    [data.staffs, staffId],
  );
  const age = useMemo(() => calculateAge(selectedStaff?.birth_date) ?? 30, [selectedStaff]);

  const dependentCount = useMemo(() => {
    if (!selectedStaff) return 1;
    return Number(
      selectedStaff.dependent_count ??
      (selectedStaff.permissions?.payroll as Record<string, unknown> | undefined)?.dependent_count ??
      (selectedStaff.permissions?.tax as Record<string, unknown> | undefined)?.dependent_count ??
      1
    ) || 1;
  }, [selectedStaff]);

  const inputs: SimulatorInputs = {
    staffId,
    base: parseNumber(base),
    overtimeHours: parseNumber(overtimeHours),
    nightHours: parseNumber(nightHours),
    holidayHours: parseNumber(holidayHours),
    taxableExtra: parseNumber(taxableExtra),
    taxFreeExtra: parseNumber(taxFreeExtra) };

  const result = useMemo(
    () => computeSimulation(inputs, age, taxInsuranceRates, dependentCount),
    [inputs, age, taxInsuranceRates, dependentCount],
  );

  const handlePickStaff = (id: string) => {
    setStaffId(id);
    const s = data.staffs.find((st) => String(st.id) === id);
    if (s?.salary) setBase(s.salary.toLocaleString());
  };

  const breakdown: { label: string; amount: number; type: 'add' | 'sub' | 'neutral' }[] = [
    { label: '기본급',     amount: inputs.base,        type: 'neutral' },
    { label: '초과수당',   amount: result.overtimePay, type: 'add' },
    { label: '야간수당',   amount: result.nightPay,    type: 'add' },
    { label: '휴일수당',   amount: result.holidayPay,  type: 'add' },
    { label: '과세 기타',  amount: inputs.taxableExtra, type: 'add' },
    { label: '비과세 차감(식대 등)', amount: inputs.taxFreeExtra, type: 'neutral' },
    { label: '4대보험',    amount: result.insurance,   type: 'sub' },
    { label: '소득세',     amount: result.incomeTax,   type: 'sub' },
    { label: '지방세',     amount: result.localTax,    type: 'sub' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <form
        className="app-card p-4 flex flex-col gap-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <h3 className="section-title">직원 선택 · 계산 조건</h3>

        <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
          대상 직원
          <select
            value={staffId}
            onChange={(e) => handlePickStaff(e.target.value)}
            className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] font-medium text-[var(--foreground)]"
          >
            <option value="">— 직접 입력 (미선택) —</option>
            {data.staffs.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name} · {s.department ?? '-'} · {s.position ?? '-'}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            월 기본급 (원)
            <input
              type="text"
              inputMode="numeric"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            시급 환산
            <output className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] bg-[var(--muted)] text-right tabular-nums text-[var(--foreground)] font-bold">
              {formatInt(result.hourly)} 원
            </output>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            초과 (h)
            <input
              type="number"
              min="0"
              value={overtimeHours}
              onChange={(e) => setOvertimeHours(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            야간 (h)
            <input
              type="number"
              min="0"
              value={nightHours}
              onChange={(e) => setNightHours(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            휴일 (h)
            <input
              type="number"
              min="0"
              value={holidayHours}
              onChange={(e) => setHolidayHours(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            과세 기타 (원)
            <input
              type="text"
              inputMode="numeric"
              value={taxableExtra}
              onChange={(e) => setTaxableExtra(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            비과세 (식대 등)
            <input
              type="text"
              inputMode="numeric"
              value={taxFreeExtra}
              onChange={(e) => setTaxFreeExtra(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
        </div>

        <p className="text-[10px] text-[var(--toss-gray-3)] mt-1">
          ※ 4대보험 요율은 2026 기준 / 소득세는 회사의 간이세액표 및 부양가족 수 기준으로 정확하게 자동 계산됩니다.
        </p>
      </form>

      <div className="app-card p-4" aria-live="polite">
        <h3 className="section-title">예상 지급액</h3>
        <div className="mt-3 p-4 rounded-[var(--radius-md)] bg-[var(--accent-light)]">
          <div className="text-[11px] text-[var(--toss-gray-4)]">실수령 예상</div>
          <div className="text-[28px] font-extrabold tabular-nums text-[var(--accent)]">
            {formatInt(result.netPay)}
            <span className="ml-1 text-[14px] font-bold">원</span>
          </div>
          <div className="text-[11px] text-[var(--toss-gray-4)]">
            세전 {formatInt(result.gross)} · 공제 {formatInt(result.insurance + result.incomeTax + result.localTax)}
          </div>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5">
          {breakdown.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between px-2 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]"
            >
              <span className="text-[12px] text-[var(--toss-gray-4)]">{row.label}</span>
              <b
                className={`text-[12px] tabular-nums ${
                  row.type === 'add'
                    ? 'text-[var(--accent)]'
                    : row.type === 'sub'
                      ? 'text-[var(--danger)]'
                      : 'text-[var(--foreground)]'
                }`}
              >
                {row.type === 'add' && '+'}
                {row.type === 'sub' && '-'}
                {formatInt(row.amount)}
              </b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ==========================================
// ModTaxFree.tsx
// ==========================================
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
  research_allowance: 'research' };

export function ModTaxFree() {
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
        exceededCount: exceeded });
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
        exceededCount: 0 });
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

// ==========================================
// ModUnpaid.tsx
// ==========================================
/**
 * #12 미지급 수당 점검 — 전월 대비 야간/연장수당 누락 자동 감지 및 실시간 근태 대조
 */

export function ModUnpaid({ user }: { user?: any }) {
  const data = usePayrollData();
  const [activeTab, setActiveTab] = useState<'legacy' | 'realtime'>('realtime');
  const rows = useMemo(() => buildUnpaidRows(data), [data]);

  const total = rows.reduce((acc, r) => acc + r.diff, 0);
  const dangerCount = rows.filter((r) => r.tone === 'danger').length;
  const warnCount = rows.filter((r) => r.tone === 'warn').length;

  return (
    <div className="flex flex-col gap-4">
      {/* 프리미엄 세그먼트/탭 컨트롤 */}
      <div className="flex bg-[var(--tab-bg)] p-1 rounded-[var(--radius-md)] border border-[var(--border)] max-w-md self-start">
        <button
          type="button"
          onClick={() => setActiveTab('realtime')}
          className={`flex-1 px-4 py-1.5 text-xs font-bold rounded-[var(--radius-sm)] transition-all ${
            activeTab === 'realtime'
              ? 'bg-white text-[var(--accent)] shadow-sm'
              : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
          }`}
        >
          실시간 근태 미지급 알림
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('legacy')}
          className={`flex-1 px-4 py-1.5 text-xs font-bold rounded-[var(--radius-sm)] transition-all ${
            activeTab === 'legacy'
              ? 'bg-white text-[var(--accent)] shadow-sm'
              : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
          }`}
        >
          전월 대비 변동액 점검
        </button>
      </div>

      {activeTab === 'realtime' ? (
        <div className="app-card p-4">
          <UnpaidAllowanceAlert
            staffs={data.staffs}
            selectedCo={data.selectedCo}
            user={user}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <div className="app-card p-3">
              <div className="text-[11px] text-[var(--toss-gray-4)]">의심 건수</div>
              <div className={`text-[20px] font-extrabold ${rows.length > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                {rows.length}
              </div>
            </div>
            <div className="app-card p-3">
              <div className="text-[11px] text-[var(--toss-gray-4)]">야간수당 누락</div>
              <div className="text-[20px] font-extrabold tabular-nums">{dangerCount}<span className="text-[12px] font-medium ml-1">건</span></div>
            </div>
            <div className="app-card p-3">
              <div className="text-[11px] text-[var(--toss-gray-4)]">연장수당 누락</div>
              <div className="text-[20px] font-extrabold tabular-nums">{warnCount}<span className="text-[12px] font-medium ml-1">건</span></div>
            </div>
            <div className="app-card p-3">
              <div className="text-[11px] text-[var(--toss-gray-4)]">예상 누락액</div>
              <div className="text-[18px] font-extrabold tabular-nums text-[var(--danger)]">
                {total.toLocaleString()}<span className="text-[11px] font-medium ml-1">원</span>
              </div>
            </div>
          </div>

          <div className="app-card overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
              <h3 className="section-title">의심 항목 명단 (전월 대비)</h3>
              <button
                type="button"
                disabled={rows.length === 0}
                className="text-[11px] font-bold px-2.5 py-1 rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                일괄 반영
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-[var(--page-bg)] text-[var(--toss-gray-4)]">
                  <tr>
                    <th scope="col" className="text-left px-3 py-2 font-semibold">분류</th>
                    <th scope="col" className="text-left px-3 py-2 font-semibold">이름</th>
                    <th scope="col" className="text-left px-3 py-2 font-semibold">부서</th>
                    <th scope="col" className="text-right px-3 py-2 font-semibold">전월</th>
                    <th scope="col" className="text-right px-3 py-2 font-semibold">이번달</th>
                    <th scope="col" className="text-right px-3 py-2 font-semibold">차이</th>
                    <th scope="col" className="text-center px-3 py-2 font-semibold">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[var(--toss-gray-3)]">
                        미지급 수당 의심 항목이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => (
                      <tr key={`${r.staff_id}-${i}-${r.category}`} className="border-t border-[var(--border)] hover:bg-[var(--muted)]">
                        <td className="px-3 py-2">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[var(--radius-xs)] ${
                              r.tone === 'danger'
                                ? 'bg-[var(--danger-light)] text-[var(--danger)]'
                                : 'bg-[var(--warning-light)] text-[var(--warning)]'
                            }`}
                          >
                            {r.category}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-bold">{r.name}</td>
                        <td className="px-3 py-2 text-[var(--toss-gray-4)]">{r.dept}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.prevAmount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--toss-gray-3)]">{r.curAmount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--danger)]">
                          +{r.diff.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            aria-label={`${r.name} ${r.category} 반영`}
                            className="text-[10px] font-semibold px-1.5 py-1 rounded-[var(--radius-sm)] border border-[var(--border)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                          >
                            반영
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
            <h4 className="text-[12px] font-bold text-[var(--accent)]">감지 룰</h4>
            <p className="text-[11px] text-[var(--toss-gray-4)] mt-1 leading-relaxed">
              전월에 야간/연장 수당이 지급되었으나 이번 달에는 0인 직원을 감지합니다.
              실제 무지급이 정당한 경우(예: 근무 패턴 변경)도 포함될 수 있으므로 반영 전 확인하세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// ModWagePeak.tsx
// ==========================================
const LegacyWagePeak = dynamic(
  () => import('@/app/main/기능부품/인사관리서브/급여명세/임금피크제'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[120px] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <span className="text-[12px] text-[var(--toss-gray-3)]">임금피크제 화면 불러오는 중…</span>
      </div>
    ) },
);

/**
 * #8 임금피크제 — 만 60세 이상 자동 감지 + 연차별 비율 (정책 hardcoded)
 *
 * - 1년차 90% / 2년차 80% / 3년차 70% (기본값, payroll-policy.ts)
 * - admin 설정으로 override 가능 (구조만 — 현재 미연동)
 *
 * JM6: <table> + scope, 상태 변경 버튼 aria-label
 */

export function ModWagePeak() {
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

// ==========================================
// ModWithholding.tsx
// ==========================================
const LegacyTaxFileGenerator = dynamic(
  () => import('@/app/main/기능부품/인사관리서브/원천징수파일생성'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[120px] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <span className="text-[12px] text-[var(--toss-gray-3)]">원천징수 파일 생성기 불러오는 중…</span>
      </div>
    ) },
);

/**
 * #7 원천징수 — 소득세·지방세 집계 + 국세청 제출 파일 생성 폼
 *
 * - 원천징수 신고 일자: 매월 10일까지 전월 분 (hardcoded)
 * - 신고 파일은 CSV(.txt) 다운로드만 — 실 서명·전송은 별도 외부 시스템
 *
 * JM5: 금액은 정수 toLocaleString — 부동소수 누적 X
 */

export function ModWithholding() {
  const data = usePayrollData();
  const { yearMonth } = usePayroll();

  const summary = useMemo(() => {
    const incomeTax = data.records.reduce((acc, r) => acc + r.income_tax, 0);
    const localTax = data.records.reduce((acc, r) => acc + r.local_tax, 0);
    const taxable = data.records.reduce((acc, r) => acc + r.total_taxable, 0);
    return {
      incomeTax,
      localTax,
      total: incomeTax + localTax,
      taxable,
      count: data.records.length };
  }, [data.records]);

  const [companyName, setCompanyName] = useState<string>(data.selectedCo);
  const [businessNo, setBusinessNo] = useState<string>('');

  const [, mStr] = yearMonth.split('-');
  const filingDate = `${parseInt(mStr || '0', 10)}/10`;

  const handleDownload = () => {
    const header = ['직원명', '주민번호', '과세대상', '소득세', '지방세'];
    const lines = data.records.map((r) => {
      const s = data.staffs.find((st) => String(st.id) === r.staff_id);
      return [s?.name ?? r.staff_id, '-', r.total_taxable, r.income_tax, r.local_tax].join(',');
    });
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\n')], {
      type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `원천징수_${yearMonth}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="payroll-utility-tax-file">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">정산 인원</div>
          <div className="text-[20px] font-extrabold">{summary.count}<span className="text-[12px] font-medium ml-1">명</span></div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">소득세 합계</div>
          <div className="text-[18px] font-extrabold tabular-nums text-[var(--danger)]">
            {summary.incomeTax.toLocaleString()}<span className="text-[11px] font-medium ml-1">원</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">지방세 합계</div>
          <div className="text-[18px] font-extrabold tabular-nums text-[var(--danger)]">
            {summary.localTax.toLocaleString()}<span className="text-[11px] font-medium ml-1">원</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">신고 예정일</div>
          <div className="text-[20px] font-extrabold">{filingDate}</div>
          <div className="text-[10px] text-[var(--toss-gray-3)]">매월 10일까지</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <form
          className="app-card p-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleDownload();
          }}
        >
          <h3 className="section-title">국세청 제출 파일 생성</h3>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            회사명
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            사업자등록번호 (XXX-XX-XXXXX)
            <input
              type="text"
              value={businessNo}
              onChange={(e) => setBusinessNo(e.target.value)}
              placeholder="123-45-67890"
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            귀속 월
            <input
              type="month"
              value={yearMonth}
              readOnly
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]"
            />
          </label>
          <button
            type="submit"
            data-testid="payroll-tax-download-button"
            className="mt-2 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-[13px] font-bold hover:bg-[var(--accent-hover)]"
          >
            CSV 파일 다운로드
          </button>
          <p className="text-[10px] text-[var(--toss-gray-3)]">
            ※ 홈택스 일괄 업로드 양식에 맞게 가공 필요. 실 신고는 인증서 서명 후 진행.
          </p>
        </form>

        <div className="app-card p-0 overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-[var(--border)]">
            <h3 className="section-title">홈택스 / EDI / 사내대장 파일 생성</h3>
          </div>
          <LegacyTaxFileGenerator staffs={data.staffs} selectedCo={data.selectedCo} />
        </div>
      </div>
    </div>
  );
}
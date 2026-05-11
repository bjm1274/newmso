'use client';

/**
 * StepLedger.tsx — STEP 2: 대장 단계
 *
 * 포함 뷰:
 *   - 급여대장(#43): 전체/부서별/직종별 탭
 *   - 임금피크제(#49)
 *   - 통상임금 계산기(#51)
 *
 * JM2: 계산기 input은 useState 최소 사용, 실시간 계산 없이 버튼 클릭 시만
 * JM4: any 금지
 * JM6: tablist, aria
 */

import React, { useState } from 'react';
import Badge from '@/app/components/v2/Badge';
import Button from '@/app/components/v2/Button';
import Card from '@/app/components/v2/Card';
import Table from '@/app/components/v2/Table';
import Tabs from '@/app/components/v2/Tabs';
import {
  PAYROLL_RECORDS, WAGE_PEAK_RECORDS, EMPLOYEES,
  getEmployeeName, getEmployeeDept, formatKRW,
  type PayrollRecord, type WagePeakRecord,
} from '../dummy-data';

// ── 서브뷰 ID ───────────────────────────────────────────────────────────────────

export type Step2View = 'payroll-ledger' | 'wage-peak' | 'ordinary-wage';

interface Props {
  activeView: Step2View;
}

// ── 급여대장 (#43) ──────────────────────────────────────────────────────────────

type LedgerTab = 'all' | 'dept' | 'type';

type LedgerRow = PayrollRecord & {
  name: string;
  dept: string;
  empType: string;
} & Record<string, unknown>;

function ViewPayrollLedger() {
  const [tab, setTab] = useState<LedgerTab>('all');

  const allRows: LedgerRow[] = PAYROLL_RECORDS.map((r) => {
    const emp = EMPLOYEES.find((e) => e.id === r.employeeId);
    return {
      ...r,
      name:    getEmployeeName(r.employeeId),
      dept:    getEmployeeDept(r.employeeId),
      empType: emp?.empType ?? '-',
    };
  });

  const filteredRows = tab === 'dept'
    ? [...allRows].sort((a, b) => a.dept.localeCompare(b.dept))
    : tab === 'type'
    ? [...allRows].sort((a, b) => a.empType.localeCompare(b.empType))
    : allRows;

  const ledgerTabs: Array<{ id: LedgerTab; label: string }> = [
    { id: 'all',  label: '전체'   },
    { id: 'dept', label: '부서별' },
    { id: 'type', label: '직종별' },
  ];

  return (
    <section aria-labelledby="ttl-ledger">
      <div className="flex items-center justify-between mb-3">
        <h2 id="ttl-ledger" className="text-base font-bold flex items-center gap-2">
          급여대장 <Badge color="gray">#43</Badge>
        </h2>
        <Button variant="secondary" size="sm">엑셀 다운로드</Button>
      </div>

      <Tabs
        tabs={ledgerTabs}
        activeId={tab}
        onChange={(id) => setTab(id as LedgerTab)}
        variant="pill"
        className="mb-3"
      />

      <Card padding="none">
        <Table<LedgerRow>
          ariaLabel="급여대장"
          data={filteredRows}
          rowKey={(r) => r.employeeId}
          columns={[
            { key: 'name',               header: '직원' },
            { key: 'dept',               header: '부서' },
            { key: 'baseSalary',         header: '기본급',   render: (v) => formatKRW(v as number) },
            { key: 'overtimePay',        header: '연장수당', render: (v) => formatKRW(v as number) },
            { key: 'nightPay',           header: '야간수당', render: (v) => formatKRW(v as number) },
            { key: 'holidayPay',         header: '휴일수당', render: (v) => formatKRW(v as number) },
            { key: 'nationalPension',    header: '국민연금', render: (v) => formatKRW(v as number) },
            { key: 'healthInsurance',    header: '건강보험', render: (v) => formatKRW(v as number) },
            { key: 'employmentInsurance',header: '고용보험', render: (v) => formatKRW(v as number) },
            { key: 'incomeTax',          header: '소득세',   render: (v) => formatKRW(v as number) },
            { key: 'netPay',             header: '실수령액', render: (v) => formatKRW(v as number) },
          ]}
        />
      </Card>
    </section>
  );
}

// ── 임금피크제 (#49) ───────────────────────────────────────────────────────────

function ViewWagePeak() {
  type Row = WagePeakRecord & { name: string } & Record<string, unknown>;
  const rows: Row[] = WAGE_PEAK_RECORDS.map((r) => ({ ...r, name: `직원${r.employeeId.slice(-2)}` }));

  return (
    <section aria-labelledby="ttl-wp">
      <div className="flex items-center justify-between mb-3">
        <h2 id="ttl-wp" className="text-base font-bold flex items-center gap-2">
          임금피크제 <Badge color="gray">#49</Badge>
        </h2>
      </div>
      <Card padding="none">
        <Table<Row>
          ariaLabel="임금피크제 적용 현황"
          data={rows}
          rowKey={(r) => r.employeeId}
          columns={[
            { key: 'name',             header: '직원' },
            { key: 'age',              header: '만 나이',       render: (v) => `${v}세` },
            { key: 'peakAge',          header: '피크 기준연령', render: (v) => `${v}세` },
            { key: 'rate',             header: '적용률',        render: (v) => `${v}%` },
            { key: 'prevBaseSalary',   header: '피크 전 기본급', render: (v) => formatKRW(v as number) },
            { key: 'currentBaseSalary',header: '현재 기본급',   render: (v) => formatKRW(v as number) },
            { key: 'reduction',        header: '감액',          render: (v) => (
              <span className="text-[var(--danger)] font-semibold">{formatKRW(v as number)}</span>
            )},
          ]}
        />
      </Card>
    </section>
  );
}

// ── 통상임금 계산기 (#51) ───────────────────────────────────────────────────────

interface OrdinaryWageResult {
  monthly: number;
  hourly:  number;
  ot1h:    number;
  night1h: number;
}

function computeOrdinaryWage(base: number, meal: number, fixed: number, hours: number): OrdinaryWageResult {
  // 식대는 비과세이므로 통상임금 제외 (단순 모델)
  const monthly = base + fixed;
  const hourly  = hours > 0 ? monthly / hours : 0;
  return {
    monthly,
    hourly:  Math.round(hourly),
    ot1h:    Math.round(hourly * 1.5),
    night1h: Math.round(hourly * 0.5),
  };
}

function ViewOrdinaryWage() {
  const [base,  setBase ] = useState(3_000_000);
  const [meal,  setMeal ] = useState(150_000);
  const [fixed, setFixed] = useState(200_000);
  const [hours, setHours] = useState(209);
  const [result, setResult] = useState<OrdinaryWageResult>(() => computeOrdinaryWage(3_000_000, 150_000, 200_000, 209));

  function handleCalc() {
    setResult(computeOrdinaryWage(base, meal, fixed, hours));
  }

  return (
    <section aria-labelledby="ttl-ow">
      <div className="flex items-center justify-between mb-3">
        <h2 id="ttl-ow" className="text-base font-bold flex items-center gap-2">
          통상임금 계산기 <Badge color="gray">#51</Badge>
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card padding="md">
          <h3 className="text-sm font-bold mb-3">입력값</h3>
          <div className="flex flex-col gap-2.5">
            {[
              { id: 'ow-base',  label: '기본급 (월)',      value: base,  setter: setBase  },
              { id: 'ow-meal',  label: '식대',             value: meal,  setter: setMeal  },
              { id: 'ow-fixed', label: '고정 수당 합계',   value: fixed, setter: setFixed },
              { id: 'ow-hours', label: '소정근로시간 (월)',value: hours, setter: setHours },
            ].map(({ id, label, value, setter }) => (
              <div key={id}>
                <label htmlFor={id} className="block text-xs text-[var(--toss-gray-4)] mb-1">{label}</label>
                <input
                  id={id}
                  type="number"
                  value={value}
                  onChange={(e) => setter(Number(e.target.value))}
                  className="w-full h-9 px-3 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                />
              </div>
            ))}
            <Button variant="primary" fullWidth onClick={handleCalc}>계산</Button>
          </div>
        </Card>

        <Card padding="md">
          <h3 className="text-sm font-bold mb-3">계산 결과</h3>
          <div className="rounded-[var(--radius-md)] bg-[var(--accent-light)] p-3" aria-live="polite" aria-label="통상임금 계산 결과">
            {[
              { label: '통상임금 (월)',  value: formatKRW(result.monthly)  },
              { label: '통상임금 (시간)',value: formatKRW(result.hourly)   },
              { label: '연장근로 1h',    value: formatKRW(result.ot1h)     },
              { label: '야간근로 1h',    value: formatKRW(result.night1h)  },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm py-1.5 border-b border-[var(--border)] last:border-0">
                <span className="text-[var(--toss-gray-4)]">{label}</span>
                <span className="font-semibold text-[var(--foreground)]">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

// ── 메인 내보내기 ──────────────────────────────────────────────────────────────

export default function StepLedger({ activeView }: Props) {
  return (
    <>
      {activeView === 'payroll-ledger' && <ViewPayrollLedger />}
      {activeView === 'wage-peak'      && <ViewWagePeak />}
      {activeView === 'ordinary-wage'  && <ViewOrdinaryWage />}
    </>
  );
}

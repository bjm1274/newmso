'use client';

/**
 * StepDashboard.tsx — STEP 1: 정산 단계
 *
 * 포함 뷰:
 *   - 대시보드(#41): 통계 카드 + 단계별 현황 + 주요 이슈
 *   - 급여정산(#42): 직원별 정산 테이블
 *   - 퇴직정산(#44): 퇴직자 목록
 *   - 최저임금/비과세 점검(#50)
 *   - 미지급 수당 점검(#52)
 *   - 무급결근차감(#53)
 *
 * JM2: 정적 더미 데이터, 최소 state
 * JM4: any 금지
 * JM6: role/aria 사용
 */

import React from 'react';
import {
  Users, DollarSign, AlertCircle, TrendingUp,
  CheckCircle, AlertTriangle, XCircle,
} from 'lucide-react';
import Badge from '@/app/components/v2/Badge';
import Button from '@/app/components/v2/Button';
import Card from '@/app/components/v2/Card';
import Table from '@/app/components/v2/Table';
import {
  DASHBOARD_SUMMARY, PAYROLL_ISSUES, PAYROLL_RECORDS, RETIREMENT_RECORDS,
  UNPAID_ALLOWANCES, UNPAID_DEDUCTIONS, EMPLOYEES,
  getEmployeeName, getEmployeeDept, formatKRW,
  type PayrollRecord, type RetirementRecord, type UnpaidAllowance, type UnpaidDeductRecord,
} from '../dummy-data';

// ── 서브뷰 ID ───────────────────────────────────────────────────────────────────

export type Step1View =
  | 'dashboard'
  | 'payroll-calc'
  | 'retirement-calc'
  | 'min-wage'
  | 'unpaid-check'
  | 'unpaid-deduct';

interface Props {
  activeView: Step1View;
}

// ── 공통: 진행 바 ──────────────────────────────────────────────────────────────

function ProgressBar({ value, color = 'accent' }: { value: number; color?: 'accent' | 'warn' | 'ok' }) {
  const colorClass = {
    accent: 'bg-[var(--accent)]',
    warn:   'bg-[var(--warning)]',
    ok:     'bg-[var(--success)]',
  }[color];
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`완료율 ${value}%`}
      className="mt-1.5 h-1.5 rounded-full bg-[var(--muted)] overflow-hidden"
    >
      <div className={`h-full rounded-full ${colorClass} transition-[width] duration-300`} style={{ width: `${value}%` }} />
    </div>
  );
}

// ── 대시보드 (#41) ─────────────────────────────────────────────────────────────

function ViewDashboard() {
  const { targetCount, totalPayAmount, issueCount, completionRate, stepStatus } = DASHBOARD_SUMMARY;

  const stepLabels = ['정산', '대장', '검증', '출력'] as const;
  const stepKeys   = ['settlement', 'ledger', 'verify', 'output'] as const;

  return (
    <section aria-labelledby="ttl-dashboard">
      <div className="flex items-center justify-between mb-3">
        <h2 id="ttl-dashboard" className="text-base font-bold flex items-center gap-2">
          급여 대시보드
          <Badge color="gray">#41</Badge>
        </h2>
        <Badge color="yellow">정산 진행 중</Badge>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Card padding="md">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--accent-light)] text-[var(--accent)] grid place-items-center mb-2" aria-hidden="true">
            <Users size={18} />
          </div>
          <div className="text-2xl font-bold">{targetCount}<span className="text-sm font-normal text-[var(--toss-gray-4)]">명</span></div>
          <div className="text-xs text-[var(--toss-gray-4)] mt-0.5">정산 대상 직원</div>
        </Card>
        <Card padding="md">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--success-light)] text-[var(--success)] grid place-items-center mb-2" aria-hidden="true">
            <DollarSign size={18} />
          </div>
          <div className="text-2xl font-bold">₩128.4M</div>
          <div className="text-xs text-[var(--toss-gray-4)] mt-0.5">총 지급 예정액</div>
        </Card>
        <Card padding="md">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--danger-light)] text-[var(--danger)] grid place-items-center mb-2" aria-hidden="true">
            <AlertCircle size={18} />
          </div>
          <div className="text-2xl font-bold text-[var(--danger)]">{issueCount}</div>
          <div className="text-xs text-[var(--toss-gray-4)] mt-0.5">검증 이슈</div>
        </Card>
        <Card padding="md">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--warning-light)] text-[var(--warning)] grid place-items-center mb-2" aria-hidden="true">
            <TrendingUp size={18} />
          </div>
          <div className="text-2xl font-bold">{completionRate}%</div>
          <div className="text-xs text-[var(--toss-gray-4)] mt-0.5">정산 완료율</div>
          <ProgressBar value={completionRate} color="warn" />
        </Card>
      </div>

      {/* 단계별 진행 현황 */}
      <Card padding="md" className="mb-3">
        <h3 className="text-sm font-bold mb-3">단계별 진행 현황</h3>
        <div className="grid grid-cols-4 gap-3 text-center">
          {stepKeys.map((key, i) => {
            const status = stepStatus[key];
            return (
              <div key={key}>
                <div className={`text-xl font-bold ${status === 'done' ? 'text-[var(--success)]' : status === 'active' ? 'text-[var(--warning)]' : 'text-[var(--toss-gray-3)]'}`} aria-hidden="true">
                  {status === 'done' ? '✓' : status === 'active' ? '↻' : '○'}
                </div>
                <div className="text-xs text-[var(--toss-gray-4)] mt-1">{stepLabels[i]}</div>
                <div className="flex justify-center mt-1">
                  {status === 'done'   && <Badge color="green">완료</Badge>}
                  {status === 'active' && <Badge color="yellow">진행 중</Badge>}
                  {status === 'pending' && <Badge color="gray">대기</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 주요 이슈 */}
      <Card padding="md">
        <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
          주요 이슈
          <span className="w-2 h-2 rounded-full bg-[var(--danger)] inline-block" aria-hidden="true" />
        </h3>
        <ul className="flex flex-col gap-1.5" role="list">
          {PAYROLL_ISSUES.map((issue, idx) => (
            <li
              key={idx}
              role={issue.type === 'err' ? 'alert' : undefined}
              className={`flex items-center gap-2 p-2 rounded-[var(--radius-md)] text-sm ${
                issue.type === 'err'  ? 'bg-[var(--danger-light)]'  :
                issue.type === 'warn' ? 'bg-[var(--warning-light)]' : 'bg-[var(--success-light)]'
              }`}
            >
              {issue.type === 'err'  && <XCircle      size={16} className="text-[var(--danger)]  shrink-0" aria-hidden="true" />}
              {issue.type === 'warn' && <AlertTriangle size={16} className="text-[var(--warning)] shrink-0" aria-hidden="true" />}
              {issue.type === 'ok'   && <CheckCircle   size={16} className="text-[var(--success)] shrink-0" aria-hidden="true" />}
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

// ── 급여정산 (#42) ─────────────────────────────────────────────────────────────

function ViewPayrollCalc() {
  type Row = PayrollRecord & { name: string; dept: string } & Record<string, unknown>;
  const rows: Row[] = PAYROLL_RECORDS.map((r) => ({
    ...r,
    name: getEmployeeName(r.employeeId),
    dept: getEmployeeDept(r.employeeId),
  }));

  return (
    <section aria-labelledby="ttl-calc">
      <div className="flex items-center justify-between mb-3">
        <h2 id="ttl-calc" className="text-base font-bold flex items-center gap-2">
          급여정산 <Badge color="gray">#42</Badge>
        </h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">일괄 계산</Button>
          <Button variant="primary"   size="sm">저장</Button>
        </div>
      </div>
      <Card padding="none">
        <Table<Row>
          ariaLabel="급여정산 목록"
          data={rows}
          rowKey={(r) => r.employeeId}
          columns={[
            { key: 'name',           header: '직원' },
            { key: 'dept',           header: '부서' },
            { key: 'baseSalary',     header: '기본급',   render: (v) => formatKRW(v as number) },
            { key: 'overtimePay',    header: '수당',     render: (_, r) => formatKRW((r.overtimePay + r.nightPay + r.holidayPay) as number) },
            { key: 'totalDeductions',header: '공제',     render: (v) => formatKRW(v as number) },
            { key: 'netPay',         header: '실수령액', render: (v) => formatKRW(v as number) },
            { key: 'status',         header: '상태',     render: (v) => {
              const s = v as string;
              return s === '완료'      ? <Badge color="green">{s}</Badge>
                   : s === '오류'      ? <Badge color="red">{s}</Badge>
                   : <Badge color="yellow">{s}</Badge>;
            }},
          ]}
        />
      </Card>
    </section>
  );
}

// ── 퇴직정산 (#44) ─────────────────────────────────────────────────────────────

function ViewRetirementCalc() {
  type Row = RetirementRecord & { name: string } & Record<string, unknown>;
  const rows: Row[] = RETIREMENT_RECORDS.map((r) => ({ ...r, name: `직원${r.employeeId.slice(-1)}` }));

  return (
    <section aria-labelledby="ttl-ret">
      <div className="flex items-center justify-between mb-3">
        <h2 id="ttl-ret" className="text-base font-bold flex items-center gap-2">
          퇴직정산 <Badge color="gray">#44</Badge>
        </h2>
        <Button variant="primary" size="sm">정산 계산</Button>
      </div>
      <Card padding="none">
        <Table<Row>
          ariaLabel="퇴직정산 목록"
          data={rows}
          rowKey={(r) => r.employeeId}
          columns={[
            { key: 'name',          header: '직원' },
            { key: 'dept',          header: '부서' },
            { key: 'hireDate',      header: '입사일' },
            { key: 'retireDate',    header: '퇴직일' },
            { key: 'yearsOfService',header: '근속년수' },
            { key: 'severancePay',  header: '퇴직금',   render: (v) => formatKRW(v as number) },
            { key: 'status',        header: '상태',     render: (v) => {
              const s = v as string;
              return s === '확정' ? <Badge color="green">{s}</Badge> : <Badge color="yellow">{s}</Badge>;
            }},
          ]}
        />
      </Card>
    </section>
  );
}

// ── 최저임금/비과세 (#50) ───────────────────────────────────────────────────────

function ViewMinWage() {
  const MIN_WAGE_HOURLY = 10_030;

  interface MinWageRow extends Record<string, unknown> {
    name: string; hours: number; hourlyWage: number; mealAllowance: number; transportAllowance: number;
  }
  const rows: MinWageRow[] = EMPLOYEES.map((e) => {
    const record = PAYROLL_RECORDS.find((r) => r.employeeId === e.id);
    const hourly = Math.round(e.baseSalary / e.monthlyHours);
    return {
      name: e.name, hours: e.monthlyHours, hourlyWage: hourly,
      mealAllowance:       record?.mealAllowance ?? 0,
      transportAllowance:  record?.transportAllowance ?? 0,
    };
  });

  return (
    <section aria-labelledby="ttl-mw">
      <div className="flex items-center justify-between mb-3">
        <h2 id="ttl-mw" className="text-base font-bold flex items-center gap-2">
          최저임금 / 비과세 점검 <Badge color="gray">#50</Badge>
        </h2>
      </div>
      <Card padding="md" className="mb-3">
        <div className="flex gap-6 items-center flex-wrap">
          <div>
            <span className="text-xs text-[var(--toss-gray-4)]">2026년 최저임금</span>
            <div className="text-lg font-bold">₩10,030/h</div>
          </div>
          <div className="w-px h-10 bg-[var(--border)]" aria-hidden="true" />
          <div>
            <span className="text-xs text-[var(--toss-gray-4)]">식대 비과세 한도</span>
            <div className="text-lg font-bold">월 200,000원</div>
          </div>
          <div className="w-px h-10 bg-[var(--border)]" aria-hidden="true" />
          <div>
            <span className="text-xs text-[var(--toss-gray-4)]">차량유지비 비과세 한도</span>
            <div className="text-lg font-bold">월 200,000원</div>
          </div>
        </div>
      </Card>
      <Card padding="none">
        <Table<MinWageRow>
          ariaLabel="최저임금 및 비과세 점검 결과"
          data={rows}
          rowKey={(r) => r.name as string}
          columns={[
            { key: 'name',               header: '직원' },
            { key: 'hours',              header: '월 소정근로시간', render: (v) => `${v}h` },
            { key: 'hourlyWage',         header: '시급 환산',       render: (v) => {
              const n = v as number;
              const ok = n >= MIN_WAGE_HOURLY;
              return <span className={ok ? '' : 'text-[var(--danger)] font-semibold'}>{formatKRW(n)}</span>;
            }},
            { key: 'hourlyWage',         header: '최저임금 충족',   render: (v) => (v as number) >= MIN_WAGE_HOURLY
              ? <Badge color="green">충족</Badge> : <Badge color="red">미달</Badge>
            },
            { key: 'mealAllowance',      header: '식대',            render: (v) => v ? formatKRW(v as number) : '—' },
            { key: 'transportAllowance', header: '차량유지비',       render: (v) => v ? formatKRW(v as number) : '—' },
            { key: 'mealAllowance',      header: '비과세 초과',      render: (v) => (v as number) > 200_000
              ? <Badge color="yellow">식대 초과</Badge> : <Badge color="green">정상</Badge>
            },
          ]}
        />
      </Card>
    </section>
  );
}

// ── 미지급 수당 (#52) ──────────────────────────────────────────────────────────

function ViewUnpaidCheck() {
  type Row = UnpaidAllowance & { name: string } & Record<string, unknown>;
  const rows: Row[] = UNPAID_ALLOWANCES.map((r) => ({ ...r, name: getEmployeeName(r.employeeId) }));

  return (
    <section aria-labelledby="ttl-uc">
      <div className="flex items-center justify-between mb-3">
        <h2 id="ttl-uc" className="text-base font-bold flex items-center gap-2">
          미지급 수당 점검 <Badge color="gray">#52</Badge>
        </h2>
        <Button variant="primary" size="sm">일괄 반영</Button>
      </div>
      <Card padding="none">
        <Table<Row>
          ariaLabel="미지급 수당 목록"
          data={rows}
          rowKey={(r) => `${r.employeeId}-${r.date}`}
          columns={[
            { key: 'name',          header: '직원' },
            { key: 'allowanceType', header: '수당 유형' },
            { key: 'date',          header: '발생일' },
            { key: 'amount',        header: '금액',   render: (v) => formatKRW(v as number) },
            { key: 'reason',        header: '미지급 사유' },
          ]}
        />
      </Card>
    </section>
  );
}

// ── 무급결근차감 (#53) ─────────────────────────────────────────────────────────

function ViewUnpaidDeduct() {
  type Row = UnpaidDeductRecord & { name: string } & Record<string, unknown>;
  const rows: Row[] = UNPAID_DEDUCTIONS.map((r) => ({ ...r, name: getEmployeeName(r.employeeId) }));

  return (
    <section aria-labelledby="ttl-ud">
      <div className="flex items-center justify-between mb-3">
        <h2 id="ttl-ud" className="text-base font-bold flex items-center gap-2">
          무급결근차감 <Badge color="gray">#53</Badge>
        </h2>
        <Button variant="primary" size="sm">차감 확정</Button>
      </div>
      <Card padding="none">
        <Table<Row>
          ariaLabel="무급결근차감 목록"
          data={rows}
          rowKey={(r) => r.employeeId}
          columns={[
            { key: 'name',         header: '직원' },
            { key: 'absentDays',   header: '무급 결근일수', render: (v) => `${v}일` },
            { key: 'dailyRate',    header: '일급 단가',     render: (v) => formatKRW(v as number) },
            { key: 'deductAmount', header: '차감액',        render: (v) => formatKRW(v as number) },
            { key: 'confirmed',    header: '확인',          render: (v) => v
              ? <Badge color="green">확인 완료</Badge>
              : <Badge color="yellow">확인 필요</Badge>
            },
          ]}
        />
      </Card>
    </section>
  );
}

// ── 메인 내보내기 ──────────────────────────────────────────────────────────────

export default function StepDashboard({ activeView }: Props) {
  return (
    <>
      {activeView === 'dashboard'      && <ViewDashboard />}
      {activeView === 'payroll-calc'   && <ViewPayrollCalc />}
      {activeView === 'retirement-calc'&& <ViewRetirementCalc />}
      {activeView === 'min-wage'       && <ViewMinWage />}
      {activeView === 'unpaid-check'   && <ViewUnpaidCheck />}
      {activeView === 'unpaid-deduct'  && <ViewUnpaidDeduct />}
    </>
  );
}

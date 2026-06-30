'use client';

/**
 * 급여 워크센터 — 8 KPI + 5건 점검 자동 감지
 *
 * payroll-domain.ts 에서 KPI/Alerts 부분만 분리.
 * 단일 책임 — 대시보드 상단 데이터.
 *
 * JM4: any 금지, 모든 타입 명시
 * JM5: 정수 누적만
 */

import {
  calculateHourlyRateFromMonthlySalary,
  resolveWeeklyWorkingHours } from '@/lib/payroll-working-hours';
import { calculateAge } from './payroll-policy';
import type {
  PayrollRecordNormalized,
  PayrollWorkcenterData } from './payroll-fetch';

// ─── KPI ────────────────────────────────────────────
export interface PayrollKpiCalculated {
  headcount: number;
  hourlyCount: number;
  regularCount: number;
  baseSalarySum: number;
  allowanceSum: number;
  deductionSum: number;
  netPaySum: number;
  pensionReserveSum: number;
  insurancePayDate: string;
  withholdingPayDate: string;
  prevBaseSalarySum: number;
  prevNetPaySum: number;
}

export function calculateKpis(data: PayrollWorkcenterData): PayrollKpiCalculated {
  const { records, recordsPrev, staffs } = data;
  const sum = (rows: PayrollRecordNormalized[], key: keyof PayrollRecordNormalized) =>
    rows.reduce((acc, r) => acc + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0);

  const baseSalarySum = sum(records, 'base_salary');
  const allowanceSum =
    sum(records, 'meal_allowance') +
    sum(records, 'night_duty_allowance') +
    sum(records, 'vehicle_allowance') +
    sum(records, 'childcare_allowance') +
    sum(records, 'research_allowance') +
    sum(records, 'other_taxfree') +
    sum(records, 'extra_allowance') +
    sum(records, 'overtime_pay') +
    sum(records, 'bonus');
  const deductionSum = sum(records, 'total_deduction');
  const netPaySum = sum(records, 'net_pay');

  const prevBaseSalarySum = sum(recordsPrev, 'base_salary');
  const prevNetPaySum = sum(recordsPrev, 'net_pay');

  const grossSum = baseSalarySum + allowanceSum;
  const pensionReserveSum = Math.floor(grossSum / 12);

  const hourlyCount = staffs.filter((s) => !s.salary || (s.salary ?? 0) < 1_000_000).length;
  const regularCount = staffs.length - hourlyCount;

  const [, mStr] = data.yearMonth.split('-');
  const monthLabel = `${parseInt(mStr || '0', 10)}`;
  const insurancePayDate = `${monthLabel}/22`;
  const withholdingPayDate = `${monthLabel}/10`;

  return {
    headcount: staffs.length,
    hourlyCount,
    regularCount,
    baseSalarySum,
    allowanceSum,
    deductionSum,
    netPaySum,
    pensionReserveSum,
    insurancePayDate,
    withholdingPayDate,
    prevBaseSalarySum,
    prevNetPaySum };
}

// ─── 5건 점검 자동 감지 ───────────────────────────────
export interface DetectedAlert {
  tag: '미지급 수당' | '최저임금' | '통상임금' | '무급결근' | '임금피크';
  body: string;
  amount?: string;
  actionLabel: string;
  tone: 'danger' | 'warn' | 'info';
  targetModule: 'unpaid' | 'minWage' | 'ordinary' | 'absence' | 'wagePeak';
  count: number;
}

export function detectAlerts(data: PayrollWorkcenterData): DetectedAlert[] {
  const { policy, staffs, records, recordsPrev } = data;
  const alerts: DetectedAlert[] = [];

  // 1) 미지급 수당
  const prevNightMap = new Map<string, number>();
  recordsPrev.forEach((r) => {
    const night = r.night_duty_allowance + r.overtime_pay;
    if (night > 0) prevNightMap.set(r.staff_id, night);
  });
  const unpaidStaffIds: string[] = [];
  records.forEach((r) => {
    const prev = prevNightMap.get(r.staff_id) ?? 0;
    if (prev > 0 && r.night_duty_allowance + r.overtime_pay === 0) {
      unpaidStaffIds.push(r.staff_id);
    }
  });
  if (unpaidStaffIds.length > 0) {
    const total = unpaidStaffIds.reduce((acc, id) => acc + (prevNightMap.get(id) ?? 0), 0);
    const sample = staffs.find((s) => s.id === unpaidStaffIds[0]);
    alerts.push({
      tag: '미지급 수당',
      body: `${sample?.name ?? '(직원)'} 외 ${unpaidStaffIds.length - 1}명 야간/연장수당 누락 가능`,
      amount: `+ ${total.toLocaleString()}원`,
      actionLabel: '반영 처리',
      tone: 'danger',
      targetModule: 'unpaid',
      count: unpaidStaffIds.length });
  }

  // 2) 최저임금
  const minHourly = policy.minimumWageHourly;
  let minWageBelow = 0;
  staffs.forEach((s) => {
    if (!s.salary || s.salary <= 0) return;
    const isAlternateDayShift = !!((s as any).isAlternateDayShift || (s.permissions as any)?.isAlternateDayShift || (s.permissions as any)?.work_conditions?.isAlternateDayShift);
    const weeklyHours = resolveWeeklyWorkingHours(s, 40);
    const hourly = calculateHourlyRateFromMonthlySalary(s.salary, weeklyHours, 'ceil', isAlternateDayShift);
    if (hourly < minHourly) minWageBelow += 1;
  });
  if (minWageBelow > 0) {
    alerts.push({
      tag: '최저임금',
      body: `시급 환산 ${minHourly.toLocaleString()}원 미달 ${minWageBelow}명 (${policy.minimumWageYear} 기준)`,
      actionLabel: '시뮬레이션',
      tone: 'warn',
      targetModule: 'minWage',
      count: minWageBelow });
  }

  // 3) 통상임금
  const bonusStaff = records.filter((r) => r.bonus > 0).length;
  if (bonusStaff > 0) {
    alerts.push({
      tag: '통상임금',
      body: `정기상여 포함 재산정 권고 — ${bonusStaff}명`,
      actionLabel: '계산기',
      tone: 'warn',
      targetModule: 'ordinary',
      count: bonusStaff });
  }

  // 4) 무급결근
  let absenceCnt = 0;
  const prevBase = new Map<string, number>();
  recordsPrev.forEach((r) => prevBase.set(r.staff_id, r.base_salary));
  records.forEach((r) => {
    const prev = prevBase.get(r.staff_id) ?? 0;
    if (prev > 0 && r.base_salary > 0 && r.base_salary < prev * 0.95) absenceCnt += 1;
  });
  if (absenceCnt > 0) {
    alerts.push({
      tag: '무급결근',
      body: `전월 대비 5% 이상 기본급 감소 ${absenceCnt}명 — 무급결근 가능`,
      actionLabel: '상세',
      tone: 'info',
      targetModule: 'absence',
      count: absenceCnt });
  }

  // 5) 임금피크
  const peakAge = policy.wagePeakStartAge;
  const today = new Date();
  let peakCnt = 0;
  staffs.forEach((s) => {
    const age = calculateAge(s.birth_date, today);
    if (age !== null && age >= peakAge) peakCnt += 1;
  });
  if (peakCnt > 0) {
    alerts.push({
      tag: '임금피크',
      body: `만 ${peakAge}세 이상 ${peakCnt}명 — 임금피크 적용 검토 필요`,
      actionLabel: '설정',
      tone: 'info',
      targetModule: 'wagePeak',
      count: peakCnt });
  }

  return alerts;
}

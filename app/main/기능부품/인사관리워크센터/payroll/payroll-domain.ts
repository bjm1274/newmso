'use client';

/**
 * 급여 워크센터 — 도메인 가공 (표 빌더)
 *
 * payroll-fetch.ts 에서 가져온 PayrollWorkcenterData 를 입력 받아,
 * 13개 모듈이 useMemo로 호출할 순수 함수들을 모은다.
 *
 * KPI / 점검 감지는 ./payroll-kpi.ts 로 분리.
 *
 * JM: 단일 책임 — 표 빌더 순수 함수만, supabase·DOM 의존 없음
 * JM4: any 금지, 모든 input/output 타입 export
 * JM5: 정수 누적만 (Math.floor)
 */

import {
  calculateEmployeeInsuranceDeductions,
  calculateIndustrialAccidentInsurance,
} from '@/lib/payroll-insurance-rates';
import { calculateHourlyRateFromMonthlySalary } from '@/lib/payroll-working-hours';
import { calculateAge } from './payroll-policy';
import type { PayrollWorkcenterData } from './payroll-fetch';

// ─── 대장 행 ───────────────────────────────────────────
export interface LedgerRowComputed {
  staff_id: string;
  name: string;
  dept: string;
  base: number;
  allowance: number;
  deduction: number;
  net: number;
  status: string;
  hasRecord: boolean;
}

export function buildLedgerRows(data: PayrollWorkcenterData): LedgerRowComputed[] {
  const recMap = new Map(data.records.map((r) => [r.staff_id, r]));
  return data.staffs.map((s) => {
    const r = recMap.get(String(s.id));
    if (!r) {
      return {
        staff_id: String(s.id),
        name: s.name,
        dept: s.department ?? '-',
        base: s.salary ?? 0,
        allowance: 0,
        deduction: 0,
        net: 0,
        status: '미정산',
        hasRecord: false,
      };
    }
    const allowance =
      r.meal_allowance +
      r.night_duty_allowance +
      r.vehicle_allowance +
      r.childcare_allowance +
      r.research_allowance +
      r.other_taxfree +
      r.extra_allowance +
      r.overtime_pay +
      r.bonus;
    return {
      staff_id: String(s.id),
      name: s.name,
      dept: s.department ?? '-',
      base: r.base_salary,
      allowance,
      deduction: r.total_deduction,
      net: r.net_pay,
      status: r.status || '확정',
      hasRecord: true,
    };
  });
}

// ─── 4대보험 ──────────────────────────────────────────
export interface InsuranceCalcRow {
  name: string;
  rateEmployee: number;
  rateEmployer: number;
  amountEmployee: number;
  amountEmployer: number;
  total: number;
}

export function calculateInsuranceRows(
  data: PayrollWorkcenterData,
  companyName: string,
): InsuranceCalcRow[] {
  const taxableSum = data.records.length
    ? data.records.reduce((acc, r) => acc + (r.total_taxable || r.base_salary), 0)
    : data.staffs.reduce((acc, s) => acc + (s.salary ?? 0), 0);

  const empSum = data.records.length
    ? data.records.reduce(
        (acc, r) => ({
          national: acc.national + r.national_pension,
          health: acc.health + r.health_insurance,
          longTerm: acc.longTerm + r.long_term_care,
          employment: acc.employment + r.employment_insurance,
        }),
        { national: 0, health: 0, longTerm: 0, employment: 0 },
      )
    : (() => {
        const d = calculateEmployeeInsuranceDeductions(taxableSum, 30);
        return {
          national: d.nationalPension,
          health: d.healthInsurance,
          longTerm: d.longTermCare,
          employment: d.employmentInsurance,
        };
      })();

  const accident = calculateIndustrialAccidentInsurance(taxableSum, companyName);
  const employerHealth = Math.floor(taxableSum * data.policy.insuranceEmployer.healthInsurance);
  const employerNational = Math.floor(taxableSum * data.policy.insuranceEmployer.nationalPension);
  const employerLongTerm = Math.floor(employerHealth * data.policy.longTermCareRatio);
  const employerEmployment = Math.floor(
    taxableSum * data.policy.insuranceEmployer.employmentInsuranceMin,
  );

  return [
    {
      name: '국민연금',
      rateEmployee: data.policy.insuranceEmployee.nationalPension,
      rateEmployer: data.policy.insuranceEmployer.nationalPension,
      amountEmployee: empSum.national,
      amountEmployer: employerNational,
      total: empSum.national + employerNational,
    },
    {
      name: '건강보험',
      rateEmployee: data.policy.insuranceEmployee.healthInsurance,
      rateEmployer: data.policy.insuranceEmployer.healthInsurance,
      amountEmployee: empSum.health,
      amountEmployer: employerHealth,
      total: empSum.health + employerHealth,
    },
    {
      name: '장기요양',
      rateEmployee: data.policy.insuranceEmployee.longTermCare,
      rateEmployer: data.policy.insuranceEmployer.longTermCare,
      amountEmployee: empSum.longTerm,
      amountEmployer: employerLongTerm,
      total: empSum.longTerm + employerLongTerm,
    },
    {
      name: '고용보험',
      rateEmployee: data.policy.insuranceEmployee.employmentInsurance,
      rateEmployer: data.policy.insuranceEmployer.employmentInsuranceMin,
      amountEmployee: empSum.employment,
      amountEmployer: employerEmployment,
      total: empSum.employment + employerEmployment,
    },
    {
      name: `산재보험 (${accident.industryLabel})`,
      rateEmployee: 0,
      rateEmployer: accident.employerRate,
      amountEmployee: 0,
      amountEmployer: accident.employerAmount,
      total: accident.employerAmount,
    },
  ];
}

// ─── 최저임금 ─────────────────────────────────────────
export interface MinWageRowComputed {
  staff_id: string;
  name: string;
  dept: string;
  monthlySalary: number;
  hourly: number;
  gap: number;
  status: '적합' | '미달';
}

export function buildMinWageRows(data: PayrollWorkcenterData): MinWageRowComputed[] {
  const limit = data.policy.minimumWageHourly;
  return data.staffs
    .map((s) => {
      const monthly = s.salary ?? 0;
      const hourly = monthly > 0 ? calculateHourlyRateFromMonthlySalary(monthly, 40) : 0;
      const gap = hourly - limit;
      const status: '적합' | '미달' = hourly >= limit ? '적합' : '미달';
      return {
        staff_id: String(s.id),
        name: s.name,
        dept: s.department ?? '-',
        monthlySalary: monthly,
        hourly,
        gap,
        status,
      };
    })
    .filter((r) => r.monthlySalary > 0)
    .sort((a, b) => a.hourly - b.hourly);
}

// ─── 임금피크 ─────────────────────────────────────────
export interface WagePeakRow {
  staff_id: string;
  name: string;
  dept: string;
  age: number;
  yearsOverPeak: number;
  ratio: number;
  ratioLabel: string;
  originalSalary: number;
  peakedSalary: number;
}

export function buildWagePeakRows(data: PayrollWorkcenterData, today: Date = new Date()): WagePeakRow[] {
  const peakAge = data.policy.wagePeakStartAge;
  const stages = data.policy.wagePeakStages;
  return data.staffs
    .map((s) => {
      const age = calculateAge(s.birth_date, today);
      if (age === null || age < peakAge) return null;
      const yearsOver = age - peakAge;
      const stage = stages[Math.min(yearsOver, stages.length - 1)];
      const original = s.salary ?? 0;
      return {
        staff_id: String(s.id),
        name: s.name,
        dept: s.department ?? '-',
        age,
        yearsOverPeak: yearsOver,
        ratio: stage.ratio,
        ratioLabel: stage.label,
        originalSalary: original,
        peakedSalary: Math.floor(original * stage.ratio),
      };
    })
    .filter((r): r is WagePeakRow => r !== null);
}

// ─── 미지급 수당 ───────────────────────────────────────
export interface UnpaidDetailRow {
  staff_id: string;
  name: string;
  dept: string;
  category: string;
  prevAmount: number;
  curAmount: number;
  diff: number;
  tone: 'danger' | 'warn';
}

export function buildUnpaidRows(data: PayrollWorkcenterData): UnpaidDetailRow[] {
  const prevMap = new Map(data.recordsPrev.map((r) => [r.staff_id, r]));
  const staffMap = new Map(data.staffs.map((s) => [String(s.id), s]));
  const out: UnpaidDetailRow[] = [];
  data.records.forEach((r) => {
    const prev = prevMap.get(r.staff_id);
    if (!prev) return;
    const s = staffMap.get(r.staff_id);
    if (!s) return;
    if (prev.night_duty_allowance > 0 && r.night_duty_allowance === 0) {
      out.push({
        staff_id: r.staff_id,
        name: s.name,
        dept: s.department ?? '-',
        category: '야간수당',
        prevAmount: prev.night_duty_allowance,
        curAmount: 0,
        diff: prev.night_duty_allowance,
        tone: 'danger',
      });
    }
    if (prev.overtime_pay > 0 && r.overtime_pay === 0) {
      out.push({
        staff_id: r.staff_id,
        name: s.name,
        dept: s.department ?? '-',
        category: '연장수당',
        prevAmount: prev.overtime_pay,
        curAmount: 0,
        diff: prev.overtime_pay,
        tone: 'warn',
      });
    }
  });
  return out;
}

// ─── 무급결근 ─────────────────────────────────────────
export interface AbsenceDetailRow {
  staff_id: string;
  name: string;
  dept: string;
  prevBase: number;
  curBase: number;
  deduction: number;
  estimatedDays: number;
}

export function buildAbsenceRows(data: PayrollWorkcenterData): AbsenceDetailRow[] {
  const prevMap = new Map(data.recordsPrev.map((r) => [r.staff_id, r]));
  const staffMap = new Map(data.staffs.map((s) => [String(s.id), s]));
  const dailyRate = (monthly: number) => Math.floor((monthly / 209) * 8);
  const out: AbsenceDetailRow[] = [];
  data.records.forEach((r) => {
    const prev = prevMap.get(r.staff_id);
    if (!prev || prev.base_salary <= 0 || r.base_salary <= 0) return;
    if (r.base_salary < prev.base_salary * 0.98) {
      const s = staffMap.get(r.staff_id);
      if (!s) return;
      const deduction = prev.base_salary - r.base_salary;
      const daily = dailyRate(prev.base_salary);
      const estimatedDays = daily > 0 ? Math.round(deduction / daily) : 0;
      out.push({
        staff_id: r.staff_id,
        name: s.name,
        dept: s.department ?? '-',
        prevBase: prev.base_salary,
        curBase: r.base_salary,
        deduction,
        estimatedDays,
      });
    }
  });
  return out;
}

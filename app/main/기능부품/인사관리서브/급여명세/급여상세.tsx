'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  alphaColor,
  fetchDocumentDesignStore,
  resolveDocumentDesign,
} from '@/lib/document-designs';
import {
  calculateHourlyRateFromMonthlySalary,
  getMonthlyWorkingHours,
  resolveWeeklyWorkingHours,
} from '@/lib/payroll-working-hours';
import {
  calculateEmployeeInsuranceDeductions,
  getIndustrialAccidentInsuranceInfo,
} from '@/lib/payroll-insurance-rates';

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDateLabel(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR');
}

function InfoItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3">
      <p className="text-[11px] font-bold tracking-wide text-[var(--toss-gray-3)]">{label}</p>
      <p
        className={`mt-1 text-sm font-extrabold ${
          highlight ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'
        }`}
      >
        {value || '-'}
      </p>
    </div>
  );
}

function SalaryRow({
  label,
  value,
  note,
  toneColor,
  isDeduction = false,
  isTaxFree = false,
}: {
  label: string;
  value: number;
  note?: string;
  toneColor: string;
  isDeduction?: boolean;
  isTaxFree?: boolean;
}) {
  return (
    <div className="border-b border-[var(--border-subtle)] py-3 last:border-0 print:py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-[var(--foreground)]">{label}</span>
            {isTaxFree && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{
                  backgroundColor: alphaColor(toneColor, 0.12),
                  color: toneColor,
                }}
              >
                비과세
              </span>
            )}
          </div>
          {note && <p className="mt-1 text-[11px] leading-relaxed text-[var(--toss-gray-3)]">{note}</p>}
        </div>
        <span
          className={`shrink-0 text-sm font-extrabold tracking-tight ${
            isDeduction ? 'text-red-600' : 'text-[var(--foreground)]'
          }`}
        >
          {isDeduction ? '-' : ''}
          {Math.floor(value || 0).toLocaleString()}원
        </span>
      </div>
    </div>
  );
}

interface SalaryRecord {
  company?: string;
  base_salary?: number;
  meal_allowance?: number;
  night_duty_allowance?: number;
  vehicle_allowance?: number;
  childcare_allowance?: number;
  research_allowance?: number;
  other_taxfree?: number;
  extra_allowance?: number;
  overtime_pay?: number;
  bonus?: number;
  year_month?: string;
  status?: string | null;
  deduction_detail?: Record<string, unknown>;
  total_taxable?: number;
  total_taxfree?: number;
  total_deduction?: number;
  national_pension?: number;
  health_insurance?: number;
  long_term_care?: number;
  employment_insurance?: number;
  income_tax?: number;
  local_tax?: number;
  net_pay?: number;
  advance_pay?: number;
}

interface StaffInfo {
  company?: string;
  name?: string;
  employee_no?: string;
  id?: string;
  join_date?: string;
  joined_at?: string;
  department?: string;
  position?: string;
  base_salary?: number;
  position_allowance?: number;
  overtime_allowance?: number;
  night_work_allowance?: number;
  holiday_work_allowance?: number;
  annual_leave_pay?: number;
  meal_allowance?: number;
  night_duty_allowance?: number;
  vehicle_allowance?: number;
  childcare_allowance?: number;
  research_allowance?: number;
  other_taxfree?: number;
  working_hours_per_week?: number;
}

export default function SalaryDetail({
  record,
  staff,
}: {
  record?: SalaryRecord;
  staff?: StaffInfo;
}) {
  const [companySeal, setCompanySeal] = useState<string | null>(null);
  const [design, setDesign] = useState(() =>
    resolveDocumentDesign(null, 'payroll_slip', staff?.company),
  );

  useEffect(() => {
    let cancelled = false;

    const loadResources = async () => {
      const companyName = staff?.company || 'SY INC.';
      const [designStore, templateResult, companyResult] = await Promise.all([
        fetchDocumentDesignStore(),
        supabase
          .from('contract_templates')
          .select('seal_url')
          .eq('company_name', companyName)
          .maybeSingle(),
        supabase.from('companies').select('seal_url').eq('name', companyName).maybeSingle(),
      ]);

      if (cancelled) return;

      setDesign(resolveDocumentDesign(designStore, 'payroll_slip', companyName));
      setCompanySeal(templateResult.data?.seal_url || companyResult.data?.seal_url || null);
    };

    loadResources().catch((error) => {
      console.error('급여명세서 리소스 로딩 실패:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [staff?.company]);

  const data = useMemo(() => {
    if (record) return record;

    return {
      base_salary: toNumber(staff?.base_salary),
      meal_allowance: toNumber(staff?.meal_allowance),
      night_duty_allowance: toNumber(staff?.night_duty_allowance),
      vehicle_allowance: toNumber(staff?.vehicle_allowance),
      childcare_allowance: toNumber(staff?.childcare_allowance),
      research_allowance: toNumber(staff?.research_allowance),
      other_taxfree: toNumber(staff?.other_taxfree),
      extra_allowance:
        toNumber(staff?.position_allowance) +
        toNumber(staff?.overtime_allowance) +
        toNumber(staff?.night_work_allowance) +
        toNumber(staff?.holiday_work_allowance) +
        toNumber(staff?.annual_leave_pay),
      overtime_pay: 0,
      bonus: 0,
      year_month: new Date().toISOString().slice(0, 7),
      status: null,
    } satisfies SalaryRecord;
  }, [record, staff]);

  const deductionDetail = useMemo(
    () =>
      record?.deduction_detail && typeof record.deduction_detail === 'object'
        ? (record.deduction_detail as Record<string, unknown>)
        : {},
    [record?.deduction_detail],
  );

  const calc = useMemo(() => {
    if (record) {
      const totalTaxable = toNumber(record.total_taxable);
      const totalTaxfree = toNumber(record.total_taxfree);
      const detail = deductionDetail;
      const incomeTax = toNumber(detail.income_tax ?? record.income_tax);
      const insuranceFallback = calculateEmployeeInsuranceDeductions(totalTaxable);

      return {
        totalPayment: totalTaxable + totalTaxfree,
        totalDeduction: toNumber(record.total_deduction),
        pension: toNumber(
          detail.national_pension ?? record.national_pension ?? insuranceFallback.nationalPension,
        ),
        health: toNumber(
          detail.health_insurance ?? record.health_insurance ?? insuranceFallback.healthInsurance,
        ),
        longTerm: toNumber(detail.long_term_care ?? record.long_term_care ?? insuranceFallback.longTermCare),
        employment: toNumber(
          detail.employment_insurance ??
            record.employment_insurance ??
            insuranceFallback.employmentInsurance,
        ),
        incomeTax,
        localTax: toNumber(detail.local_tax ?? record.local_tax),
        customDeduction: toNumber(detail.custom_deduction),
        net: toNumber(record.net_pay),
      };
    }

    const taxable =
      toNumber(data.base_salary) +
      toNumber(data.extra_allowance) +
      toNumber(data.overtime_pay) +
      toNumber(data.bonus);
    const taxfree =
      toNumber(data.meal_allowance) +
      toNumber(data.night_duty_allowance) +
      toNumber(data.vehicle_allowance) +
      toNumber(data.childcare_allowance) +
      toNumber(data.research_allowance) +
      toNumber(data.other_taxfree);
    const insuranceFallback = calculateEmployeeInsuranceDeductions(taxable);
    const pension = insuranceFallback.nationalPension;
    const health = insuranceFallback.healthInsurance;
    const longTerm = insuranceFallback.longTermCare;
    const employment = insuranceFallback.employmentInsurance;
    const incomeTax = Math.floor(taxable * 0.03);
    const localTax = Math.floor(incomeTax * 0.1);
    const totalDeduction = pension + health + longTerm + employment + incomeTax + localTax;

    return {
      totalPayment: taxable + taxfree,
      totalDeduction,
      pension,
      health,
      longTerm,
      employment,
      incomeTax,
      localTax,
      customDeduction: 0,
      net: taxable + taxfree - totalDeduction,
    };
  }, [data, deductionDetail, record]);

  const companyName = staff?.company || design.companyLabel || 'SY INC.';
  const industrialAccidentInfo = getIndustrialAccidentInsuranceInfo(companyName);
  const companyLabel = design.companyLabel || companyName;
  const primaryColor = design.primaryColor || '#163b70';
  const borderColor = design.borderColor || '#d8e1ee';
  const yearMonth = String(data.year_month || new Date().toISOString().slice(0, 7));
  const [year, month] = yearMonth.split('-');
  const monthLabel = `${year}년 ${Number(month || '1')}월`;
  const advancePayAmount = toNumber(record?.advance_pay);
  const isAdvancePay = advancePayAmount > 0;
  const weeklyHours = resolveWeeklyWorkingHours(staff, 40);
  const monthlyWorkingHours = getMonthlyWorkingHours(weeklyHours);
  const fixedMonthlySalary =
    toNumber(data.base_salary) +
    toNumber(data.extra_allowance) +
    toNumber(data.meal_allowance) +
    toNumber(data.night_duty_allowance) +
    toNumber(data.vehicle_allowance) +
    toNumber(data.childcare_allowance) +
    toNumber(data.research_allowance) +
    toNumber(data.other_taxfree);
  const hourlyRate = calculateHourlyRateFromMonthlySalary(fixedMonthlySalary, weeklyHours, 'ceil');
  const settlementAmount = isAdvancePay ? advancePayAmount : calc.net;

  const taxableAllowanceBreakdown = useMemo(() => {
    const savedBreakdown =
      deductionDetail.taxable_allowance_breakdown &&
      typeof deductionDetail.taxable_allowance_breakdown === 'object'
        ? (deductionDetail.taxable_allowance_breakdown as Record<string, unknown>)
        : null;

    const source = savedBreakdown || {
      position_allowance: staff?.position_allowance || 0,
      overtime_allowance: staff?.overtime_allowance || 0,
      night_work_allowance: staff?.night_work_allowance || 0,
      holiday_work_allowance: staff?.holiday_work_allowance || 0,
      annual_leave_pay: staff?.annual_leave_pay || 0,
      manual_extra_allowance: 0,
    };

    return {
      position_allowance: toNumber(source.position_allowance),
      overtime_allowance: toNumber(source.overtime_allowance),
      night_work_allowance: toNumber(source.night_work_allowance),
      holiday_work_allowance: toNumber(source.holiday_work_allowance),
      annual_leave_pay: toNumber(source.annual_leave_pay),
      manual_extra_allowance: toNumber(source.manual_extra_allowance),
    };
  }, [deductionDetail, staff]);

  const fixedTaxableAllowanceTotal =
    taxableAllowanceBreakdown.position_allowance +
    taxableAllowanceBreakdown.overtime_allowance +
    taxableAllowanceBreakdown.night_work_allowance +
    taxableAllowanceBreakdown.holiday_work_allowance +
    taxableAllowanceBreakdown.annual_leave_pay +
    taxableAllowanceBreakdown.manual_extra_allowance;
  const remainingExtraAllowance = Math.max(0, toNumber(data.extra_allowance) - fixedTaxableAllowanceTotal);

  const paymentRows = [
    {
      label: '기본급',
      value: toNumber(data.base_salary),
      note: '월 기본 급여',
    },
    {
      label: '직책수당',
      value: taxableAllowanceBreakdown.position_allowance,
      note: '직책 기준 과세 수당',
    },
    {
      label: '연장수당',
      value: taxableAllowanceBreakdown.overtime_allowance,
      note: '고정 또는 포괄 연장수당',
    },
    {
      label: '야간근로수당',
      value: taxableAllowanceBreakdown.night_work_allowance,
      note: '고정 야간근로 과세수당',
    },
    {
      label: '휴일근로수당',
      value: taxableAllowanceBreakdown.holiday_work_allowance,
      note: '휴일근무 과세수당',
    },
    {
      label: '연차휴가수당',
      value: taxableAllowanceBreakdown.annual_leave_pay,
      note: '미사용 연차 또는 연차보전 수당',
    },
    {
      label: '추가 연장근로수당',
      value: toNumber(data.overtime_pay),
      note: hourlyRate > 0 ? `시급 ${hourlyRate.toLocaleString()}원 기준 추가 반영` : undefined,
    },
    {
      label: '상여',
      value: toNumber(data.bonus),
      note: '성과 또는 별도 상여',
    },
    {
      label: '기타 과세수당',
      value: taxableAllowanceBreakdown.manual_extra_allowance + remainingExtraAllowance,
      note: '직접 조정된 과세수당',
    },
  ].filter((row) => row.value > 0);

  const taxFreeRows = [
    {
      label: '식대',
      value: toNumber(data.meal_allowance),
      note: '월 비과세 식대',
    },
    {
      label: '야간 수당',
      value: toNumber(data.night_duty_allowance),
      note: '야간 근무 반영',
    },
    {
      label: '차량 유지비',
      value: toNumber(data.vehicle_allowance),
      note: '업무용 차량 지원',
    },
    {
      label: '보육 수당',
      value: toNumber(data.childcare_allowance),
      note: '보육 지원 수당',
    },
    {
      label: '연구 활동비',
      value: toNumber(data.research_allowance),
      note: '연구 활동 지원',
    },
    {
      label: '기타 비과세',
      value: toNumber(data.other_taxfree),
      note: '기타 비과세 수당',
    },
  ].filter((row) => row.value > 0);

  const deductionRows = [
    { label: '국민연금', value: calc.pension },
    { label: '건강보험', value: calc.health },
    { label: '장기요양보험', value: calc.longTerm },
    { label: '고용보험', value: calc.employment },
    { label: '소득세', value: calc.incomeTax },
    { label: '지방소득세', value: calc.localTax },
    { label: '기타 공제', value: calc.customDeduction },
  ].filter((row) => row.value > 0);

  return (
    <div
      data-testid="salary-detail-card"
      className="mx-auto mb-4 w-full max-w-[860px] overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--card)] shadow-sm print:mb-0 print:max-w-none print:rounded-none print:border-0 print:shadow-none"
      style={{ borderColor, background: `linear-gradient(180deg, #ffffff 0%, ${alphaColor(primaryColor, 0.03)} 100%)` }}
    >
      <style>{`
        @media print {
          @page { size: portrait; margin: 8mm; }
        }
      `}</style>

      <div
        className="border-b px-4 py-3 print:px-3 print:py-2.5"
        style={{ borderColor, background: `linear-gradient(135deg, ${alphaColor(primaryColor, 0.12)}, ${alphaColor(primaryColor, 0.03)})` }}
      >
        <h2 className="text-2xl font-black tracking-tight text-[var(--foreground)]">
          {monthLabel} 급여명세서
        </h2>
      </div>

      <div className="space-y-4 px-4 py-4 print:space-y-3 print:px-3 print:py-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <InfoItem
            label="산재보험(회사부담)"
            value={`${(industrialAccidentInfo.employerRate * 100).toFixed(2)}% · ${industrialAccidentInfo.industryLabel}`}
          />
          <InfoItem label="성명" value={staff?.name} />
          <InfoItem label="사번" value={staff?.employee_no || staff?.id} />
          <InfoItem label="입사일" value={formatDateLabel(staff?.join_date || staff?.joined_at)} />
          <InfoItem label="부서" value={staff?.department} />
          <InfoItem label="직위" value={staff?.position} />
          <InfoItem label="주당 근로시간" value={`${weeklyHours.toLocaleString()}시간`} />
          <InfoItem label="월 소정근로시간" value={`${monthlyWorkingHours.toLocaleString()}시간`} />
          <InfoItem label="시급 환산" value={`${hourlyRate.toLocaleString()}원`} highlight />
        </div>

        {isAdvancePay ? (
          <div
            className="rounded-[var(--radius-xl)] border px-5 py-4"
            style={{
              borderColor: alphaColor('#d97706', 0.28),
              backgroundColor: alphaColor('#d97706', 0.06),
            }}
          >
            <p className="text-sm font-bold text-amber-800">
              이 문서는 가불 지급 내역입니다. 기본 급여와 공제 항목은 제외하고 지급 금액만 표시합니다.
            </p>
            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-[var(--toss-gray-4)]">가불 지급액</span>
              <span className="text-xl font-black text-amber-700">{advancePayAmount.toLocaleString()}원</span>
            </div>
          </div>
        ) : (
          <>
            <section
              className="rounded-[var(--radius-xl)] border bg-[var(--card)] px-5 py-4 print:px-4 print:py-3"
              style={{ borderColor: alphaColor(primaryColor, 0.18) }}
            >
              <div className="flex items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-3">
                <div>
                  <h3 className="text-lg font-black text-[var(--foreground)]">지급내역</h3>
                  <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                    기본급과 과세수당, 비과세수당을 포함한 지급 항목입니다.
                  </p>
                </div>
                <p className="text-right">
                  <span className="block text-[11px] font-bold tracking-wide text-[var(--toss-gray-3)]">
                    지급합계
                  </span>
                  <span className="text-lg font-black" style={{ color: primaryColor }}>
                    {calc.totalPayment.toLocaleString()}원
                  </span>
                </p>
              </div>

              <div className="pt-1">
                {paymentRows.map((row) => (
                  <SalaryRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    note={row.note}
                    toneColor={primaryColor}
                  />
                ))}

                {taxFreeRows.length > 0 && (
                  <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--muted)]/40 px-4 py-3 print:mt-2">
                    <p className="text-sm font-black text-[var(--foreground)]">비과세 항목</p>
                    <div className="mt-2">
                      {taxFreeRows.map((row) => (
                        <SalaryRow
                          key={row.label}
                          label={row.label}
                          value={row.value}
                          note={row.note}
                          toneColor={primaryColor}
                          isTaxFree
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section
              className="rounded-[var(--radius-xl)] border bg-[var(--card)] px-5 py-4 print:px-4 print:py-3"
              style={{ borderColor: alphaColor('#991b1b', 0.18) }}
            >
              <div className="flex items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-3">
                <div>
                  <h3 className="text-lg font-black text-[var(--foreground)]">공제내역</h3>
                  <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                    4대 보험과 세금, 기타 공제를 포함한 차감 항목입니다.
                  </p>
                </div>
                <p className="text-right">
                  <span className="block text-[11px] font-bold tracking-wide text-[var(--toss-gray-3)]">
                    공제합계
                  </span>
                  <span className="text-lg font-black text-red-600">
                    {calc.totalDeduction.toLocaleString()}원
                  </span>
                </p>
              </div>

              <div className="pt-1">
                {deductionRows.map((row) => (
                  <SalaryRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    toneColor={primaryColor}
                    isDeduction
                  />
                ))}
              </div>
            </section>
          </>
        )}

        <div
          className="rounded-[var(--radius-xl)] border px-5 py-4 print:px-4 print:py-3"
          style={{
            borderColor: alphaColor(primaryColor, 0.16),
            background: `linear-gradient(135deg, ${alphaColor(primaryColor, 0.1)}, ${alphaColor(primaryColor, 0.04)})`,
          }}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-base font-black text-[var(--foreground)]">귀하의 노고에 감사드립니다.</p>
            <div className="text-right">
              <p className="text-[11px] font-bold tracking-wide text-[var(--toss-gray-3)]">총 정산금액</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-[var(--foreground)]">
                {settlementAmount.toLocaleString()}원
              </p>
            </div>
          </div>
        </div>

        <div
          className="flex flex-col gap-4 border-t pt-4 md:flex-row md:items-end md:justify-between"
          style={{ borderColor }}
        >
          <div>
            <p className="text-xl font-black tracking-tight text-[var(--foreground)]">{companyLabel}</p>
            <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
              발행일 {new Date().toLocaleDateString('ko-KR')}
            </p>
          </div>

          <div className="flex items-end gap-4">
            <div className="text-right">
              <p className="text-xs font-bold tracking-wide text-[var(--toss-gray-3)]">회사명 및 직인</p>
              <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{companyLabel}</p>
            </div>
            {companySeal ? (
              <div className="relative flex h-20 w-20 items-center justify-center">
                <div
                  className="absolute inset-1 rounded-full blur-lg"
                  style={{ backgroundColor: alphaColor(primaryColor, 0.12) }}
                />
                <img
                  src={companySeal}
                  alt="회사 직인"
                  className="relative h-16 w-16 object-contain mix-blend-multiply"
                />
              </div>
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-double border-red-600 text-sm font-black text-red-600 opacity-80">
                직인
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

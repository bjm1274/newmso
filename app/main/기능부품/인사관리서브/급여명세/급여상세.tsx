'use client';
import { logger } from '@/lib/logger';
import { getKoreanMonthString } from '@/lib/seoul-time';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import {
  alphaColor,
  fetchDocumentDesignStore,
  resolveDocumentDesign } from '@/lib/document-designs';
import {
  calculateHourlyRateFromMonthlySalary,
  getMonthlyWorkingHours,
  resolveWeeklyWorkingHours } from '@/lib/payroll-working-hours';
import {
  calculateEmployeeInsuranceDeductions } from '@/lib/payroll-insurance-rates';

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDateLabel(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function InfoItem({
  label,
  value,
  highlight = false,
  colSpanClass = '' }: {
  label: string;
  value?: string;
  highlight?: boolean;
  colSpanClass?: string;
}) {
  return (
    <div className={`min-w-0 border-r border-b border-slate-200 bg-white px-3 py-2 print:px-2 print:py-1.5 ${colSpanClass}`}>
      <p className="text-[10px] font-bold text-slate-500 print:text-[8.5px]">{label}</p>
      <p
        className={`mt-1 truncate text-[13px] font-extrabold print:text-[10px] ${
          highlight ? 'text-[var(--accent)]' : 'text-slate-950'
        }`}
        title={value || '-'}
      >
        {value || '-'}
      </p>
    </div>
  );
}

type RowDensity = 'regular' | 'compact' | 'dense' | 'ultra';

function SalaryRow({
  label,
  value,
  note,
  toneColor,
  isDeduction = false,
  isTaxFree = false,
  density = 'regular' }: {
  label: string;
  value: number;
  note?: string;
  toneColor: string;
  isDeduction?: boolean;
  isTaxFree?: boolean;
  density?: RowDensity;
}) {
  const rowClass = {
    regular: 'py-2.5 print:py-1.5',
    compact: 'py-1.5 print:py-1',
    dense: 'py-1 print:py-0.5',
    ultra: 'py-0.5 print:py-[1px]' }[density];
  const labelClass = density === 'regular' ? 'text-[12px] print:text-[9.5px]' : 'text-[11px] print:text-[8.5px]';
  const amountClass = density === 'regular' ? 'text-[12px] print:text-[9.5px]' : 'text-[11px] print:text-[8.5px]';
  const showNote = density === 'regular';

  return (
    <div className={`border-b border-slate-200 px-3 last:border-0 print:px-2 ${rowClass}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`truncate font-bold text-slate-800 ${labelClass}`} title={label}>
              {label}
            </span>
            {isTaxFree && (
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold print:hidden"
                style={{
                  backgroundColor: alphaColor(toneColor, 0.12),
                  color: toneColor }}
              >
                비과세
              </span>
            )}
          </div>
          {showNote && note && <p className="mt-0.5 truncate text-[10px] text-slate-500 print:hidden">{note}</p>}
        </div>
        <span
          className={`shrink-0 whitespace-nowrap text-right font-extrabold ${amountClass} ${
            isDeduction ? 'text-red-700' : 'text-slate-950'
          }`}
        >
          {isDeduction ? '-' : ''}
          {Math.floor(value || 0).toLocaleString('ko-KR')}원
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
  shift_type?: string | null;
  isAlternateDayShift?: boolean;
  agreed_overtime_allowance?: number;
  agreed_night_allowance?: number;
  permissions?: any;
}

export default function SalaryDetail({
  record,
  staff }: {
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
      const [designStore, templateResult] = await Promise.all([
        fetchDocumentDesignStore(),
        db
          .from('contract_templates')
          .select('seal_url')
          .eq('company_name', companyName)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      setDesign(resolveDocumentDesign(designStore, 'payroll_slip', companyName));
      setCompanySeal(templateResult.data?.seal_url || null);
    };

    loadResources().catch((error) => {
      logger.error('급여명세서 리소스 로딩 실패:', error);
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
      year_month: getKoreanMonthString(),
      status: null } satisfies SalaryRecord;
  }, [record, staff]);

  const deductionDetail = useMemo(
    () =>
      record?.deduction_detail && typeof record.deduction_detail === 'object'
        ? (record.deduction_detail as Record<string, unknown>)
        : {},
    [record?.deduction_detail],
  );

  const calc = useMemo(() => {
    const nationalAmount = (staff as any)?.permissions?.insurance?.national_amount;
    const joinedAt = staff?.join_date || staff?.joined_at || null;
    const targetYearMonth = record?.year_month || getKoreanMonthString();

    if (record) {
      const totalTaxable = toNumber(record.total_taxable);
      const totalTaxfree = toNumber(record.total_taxfree);
      const detail = deductionDetail;
      const incomeTax = toNumber(detail.income_tax ?? record.income_tax);
      const insuranceFallback = calculateEmployeeInsuranceDeductions(totalTaxable, 30, targetYearMonth, nationalAmount, joinedAt);

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
        net: toNumber(record.net_pay) };
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
    const insuranceFallback = calculateEmployeeInsuranceDeductions(taxable, 30, targetYearMonth, nationalAmount, joinedAt);
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
      net: taxable + taxfree - totalDeduction };
  }, [data, deductionDetail, record]);

  const companyName = staff?.company || design.companyLabel || 'SY INC.';
  const companyLabel = design.companyLabel || companyName;
  const primaryColor = design.primaryColor || '#163b70';
  const borderColor = design.borderColor || '#d8e1ee';
  const yearMonth = String(data.year_month || getKoreanMonthString());
  const [year, month] = yearMonth.split('-');
  const monthLabel = `${year}년 ${Number(month || '1')}월`;
  const advancePayAmount = toNumber(record?.advance_pay);
  const isAdvancePay = advancePayAmount > 0;
  const isAlternateDayShift = !!(staff?.isAlternateDayShift || staff?.shift_type === '1일근무1일휴무');
  const weeklyHours = resolveWeeklyWorkingHours(staff, 40);
  const monthlyWorkingHours = getMonthlyWorkingHours(weeklyHours, isAlternateDayShift);
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
      manual_extra_allowance: 0 };

    return {
      position_allowance: toNumber(source.position_allowance),
      overtime_allowance: toNumber(source.overtime_allowance),
      night_work_allowance: toNumber(source.night_work_allowance),
      holiday_work_allowance: toNumber(source.holiday_work_allowance),
      annual_leave_pay: toNumber(source.annual_leave_pay),
      manual_extra_allowance: toNumber(source.manual_extra_allowance) };
  }, [deductionDetail, staff]);

  // 약정연장/약정야간수당은 통상임금에 산입되므로 비례 배분 추출
  const masterAgreedOvertime = Number(staff?.agreed_overtime_allowance || 0);
  const masterTotalOvertime = Number(staff?.overtime_allowance || 0) + masterAgreedOvertime;
  const resolvedOvertime = toNumber(taxableAllowanceBreakdown.overtime_allowance);
  const resolvedAgreedOvertime = masterTotalOvertime > 0
    ? Math.round((resolvedOvertime * masterAgreedOvertime) / masterTotalOvertime)
    : masterAgreedOvertime;

  const masterAgreedNight = Number(staff?.agreed_night_allowance || 0);
  const masterTotalNight = Number(staff?.night_work_allowance || 0) + masterAgreedNight;
  const resolvedNight = toNumber(taxableAllowanceBreakdown.night_work_allowance);
  const resolvedAgreedNight = masterTotalNight > 0
    ? Math.round((resolvedNight * masterAgreedNight) / masterTotalNight)
    : masterAgreedNight;

  const fixedMonthlySalary =
    toNumber(data.base_salary) +
    toNumber(data.meal_allowance) +
    toNumber(data.night_duty_allowance) +
    toNumber(data.vehicle_allowance) +
    toNumber(data.childcare_allowance) +
    toNumber(data.research_allowance) +
    toNumber(data.other_taxfree) +
    toNumber(taxableAllowanceBreakdown.position_allowance) +
    toNumber(taxableAllowanceBreakdown.manual_extra_allowance) +
    resolvedAgreedOvertime +
    resolvedAgreedNight;

  const hourlyRate = calculateHourlyRateFromMonthlySalary(toNumber(data.base_salary), weeklyHours, 'ceil', isAlternateDayShift);
  const settlementAmount = isAdvancePay ? advancePayAmount : calc.net;

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
      note: '월 기본 급여' },
    {
      label: '직책수당',
      value: taxableAllowanceBreakdown.position_allowance,
      note: '직책 기준 과세 수당' },
    {
      label: '연장수당',
      value: taxableAllowanceBreakdown.overtime_allowance - resolvedAgreedOvertime,
      note: '고정 또는 포괄 연장수당' },
    {
      label: '약정연장수당',
      value: resolvedAgreedOvertime,
      note: '약정 연장수당' },
    {
      label: '야간근로수당',
      value: taxableAllowanceBreakdown.night_work_allowance - resolvedAgreedNight,
      note: '고정 야간근로 과세수당' },
    {
      label: '약정야간수당',
      value: resolvedAgreedNight,
      note: '약정 야간수당' },
    {
      label: '휴일근로수당',
      value: taxableAllowanceBreakdown.holiday_work_allowance,
      note: '휴일근무 과세수당' },
    {
      label: '연차휴가수당',
      value: taxableAllowanceBreakdown.annual_leave_pay,
      note: '미사용 연차 또는 연차보전 수당' },
    {
      label: '추가 연장근로수당',
      value: toNumber(data.overtime_pay),
      note: hourlyRate > 0 ? `시급 ${hourlyRate.toLocaleString()}원 기준 추가 반영` : undefined },
    {
      label: '상여',
      value: toNumber(data.bonus),
      note: '성과 또는 별도 상여' },
    {
      label: '기타 과세수당',
      value: taxableAllowanceBreakdown.manual_extra_allowance + remainingExtraAllowance,
      note: '직접 조정된 과세수당' },
  ].filter((row) => row.value > 0);

  const taxFreeRows = [
    {
      label: '식대',
      value: toNumber(data.meal_allowance),
      note: '월 비과세 식대' },
    {
      label: '야간 수당',
      value: toNumber(data.night_duty_allowance),
      note: '야간 근무 반영' },
    {
      label: '차량 유지비',
      value: toNumber(data.vehicle_allowance),
      note: '업무용 차량 지원' },
    {
      label: '보육 수당',
      value: toNumber(data.childcare_allowance),
      note: '보육 지원 수당' },
    {
      label: '연구 활동비',
      value: toNumber(data.research_allowance),
      note: '연구 활동 지원' },
    {
      label: '기타 비과세',
      value: toNumber(data.other_taxfree),
      note: '기타 비과세 수당' },
  ];

  const deductionRows = [
    { label: '국민연금', value: calc.pension },
    { label: '건강보험', value: calc.health },
    { label: '장기요양보험', value: calc.longTerm },
    { label: '고용보험', value: calc.employment },
    { label: '소득세', value: calc.incomeTax },
    { label: '지방소득세', value: calc.localTax },
    { label: '기타 공제', value: calc.customDeduction },
  ].filter((row) => row.value > 0);

  const paymentSlipRows = [
    ...paymentRows.map((row) => ({ ...row, isTaxFree: false })),
    ...taxFreeRows.map((row) => ({ ...row, isTaxFree: true })),
  ];
  const renderedPaymentRows =
    paymentSlipRows.length > 0
      ? paymentSlipRows
      : [{ label: '지급 항목 없음', value: 0, note: undefined, isTaxFree: false }];
  const renderedDeductionRows =
    deductionRows.length > 0 ? deductionRows : [{ label: '공제 항목 없음', value: 0 }];
  const rowCount = Math.max(renderedPaymentRows.length, renderedDeductionRows.length);
  const rowDensity: RowDensity =
    rowCount > 28 ? 'ultra' : rowCount > 18 ? 'dense' : rowCount > 12 ? 'compact' : 'regular';
  const issueDate = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  const summaryPaymentTotal = isAdvancePay ? advancePayAmount : calc.totalPayment;
  const summaryDeductionTotal = isAdvancePay ? 0 : calc.totalDeduction;

  return (
    <div
      data-testid="salary-detail-card"
      className="mx-auto mb-4 flex w-full max-w-[210mm] flex-col overflow-hidden border bg-white text-slate-950 shadow-sm print:mb-0 print:max-w-none print:shadow-none"
      style={{ borderColor, minHeight: '260mm' }}
    >
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          [data-testid="salary-detail-card"] {
            width: 190mm !important;
            max-width: 190mm !important;
            height: 270mm !important;
            min-height: 270mm !important;
            margin: 0 auto !important;
            overflow: hidden !important;
            break-inside: avoid;
            page-break-inside: avoid;
            color: #020617 !important;
            background: #ffffff !important;
          }
          [data-testid="salary-detail-card"] * {
            box-sizing: border-box;
          }
          .salary-print-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div
        className="salary-print-avoid flex items-start justify-between gap-4 border-b-[3px] px-7 py-5 print:px-4 print:py-3"
        style={{ borderColor: primaryColor, background: alphaColor(primaryColor, 0.04) }}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-black text-slate-500 print:text-[9px]">PAYSLIP</p>
          <h2 className="mt-1 text-3xl font-black text-slate-950 print:text-[22px]">{monthLabel} 급여명세서</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500 print:text-[9px]">발행일 {issueDate}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-bold text-slate-500 print:text-[9px]">지급처</p>
          <p className="mt-1 max-w-[220px] truncate text-lg font-black text-slate-950 print:max-w-[170px] print:text-[13px]" title={companyLabel}>
            {companyLabel}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-7 py-5 print:px-4 print:py-3">
        <div className="salary-print-avoid mb-4 grid grid-cols-3 overflow-hidden border border-slate-200 print:mb-2">
          <InfoItem label="성명" value={staff?.name} />
          <InfoItem label="사번" value={staff?.employee_no || staff?.id} />
          <InfoItem label="입사일" value={formatDateLabel(staff?.join_date || staff?.joined_at)} />
          <InfoItem label="부서" value={staff?.department} />
          <InfoItem label="직위" value={staff?.position} />
          <InfoItem label="지급월" value={monthLabel} />
          <InfoItem label="통상시급" value={`${hourlyRate.toLocaleString('ko-KR')}원`} highlight colSpanClass="col-span-3" />
        </div>

        <div className="salary-print-avoid mb-4 grid grid-cols-3 overflow-hidden border border-slate-300 print:mb-2">
          <div className="border-r border-slate-300 px-4 py-3 print:px-2 print:py-1.5">
            <p className="text-[11px] font-bold text-slate-500 print:text-[8.5px]">지급합계</p>
            <p className="mt-1 text-lg font-black text-slate-950 print:text-[12px]">
              {summaryPaymentTotal.toLocaleString('ko-KR')}원
            </p>
          </div>
          <div className="border-r border-slate-300 px-4 py-3 print:px-2 print:py-1.5">
            <p className="text-[11px] font-bold text-slate-500 print:text-[8.5px]">공제합계</p>
            <p className="mt-1 text-lg font-black text-red-700 print:text-[12px]">
              {summaryDeductionTotal.toLocaleString('ko-KR')}원
            </p>
          </div>
          <div className="px-4 py-3 print:px-2 print:py-1.5" style={{ backgroundColor: alphaColor(primaryColor, 0.08) }}>
            <p className="text-[11px] font-bold text-slate-500 print:text-[8.5px]">차인지급액</p>
            <p className="mt-1 text-xl font-black print:text-[13px]" style={{ color: primaryColor }}>
              {settlementAmount.toLocaleString('ko-KR')}원
            </p>
          </div>
        </div>

        {isAdvancePay ? (
          <div
            className="salary-print-avoid border px-5 py-4 print:px-3 print:py-2"
            style={{
              borderColor: alphaColor('#d97706', 0.28),
              backgroundColor: alphaColor('#d97706', 0.06) }}
          >
            <p className="text-sm font-bold text-amber-800 print:text-[10px]">
              이 문서는 가불 지급 내역입니다. 기본 급여와 공제 항목은 제외하고 지급 금액만 표시합니다.
            </p>
            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-slate-600 print:text-[10px]">가불 지급액</span>
              <span className="text-xl font-black text-amber-700 print:text-[13px]">
                {advancePayAmount.toLocaleString('ko-KR')}원
              </span>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-2 gap-4 print:gap-2">
            <section
              className="salary-print-avoid flex min-w-0 flex-col overflow-hidden border bg-white"
              style={{ borderColor: alphaColor(primaryColor, 0.18) }}
            >
              <div className="flex items-center justify-between gap-3 px-4 py-2 text-white print:px-2 print:py-1.5" style={{ backgroundColor: primaryColor }}>
                <h3 className="text-sm font-black print:text-[10px]">지급내역</h3>
                <span className="text-[11px] font-bold print:text-[8px]">Earnings</span>
              </div>
              <div className="flex-1">
                {renderedPaymentRows.map((row) => (
                  <SalaryRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    note={row.note}
                    toneColor={primaryColor}
                    isTaxFree={row.isTaxFree}
                    density={rowDensity}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 print:px-2 print:py-1">
                <span className="text-[11px] font-bold text-slate-600 print:text-[8px]">지급 합계</span>
                <span className="text-sm font-black print:text-[9.5px]" style={{ color: primaryColor }}>
                  {calc.totalPayment.toLocaleString('ko-KR')}원
                </span>
              </div>
            </section>

            <section
              className="salary-print-avoid flex min-w-0 flex-col overflow-hidden border bg-white"
              style={{ borderColor: alphaColor('#991b1b', 0.18) }}
            >
              <div className="flex items-center justify-between gap-3 bg-red-800 px-4 py-2 text-white print:px-2 print:py-1.5">
                <h3 className="text-sm font-black print:text-[10px]">공제내역</h3>
                <span className="text-[11px] font-bold print:text-[8px]">Deductions</span>
              </div>
              <div className="flex-1">
                {renderedDeductionRows.map((row) => (
                  <SalaryRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    toneColor={primaryColor}
                    isDeduction
                    density={rowDensity}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 bg-red-50 px-4 py-2 print:px-2 print:py-1">
                <span className="text-[11px] font-bold text-slate-600 print:text-[8px]">공제 합계</span>
                <span className="text-sm font-black text-red-700 print:text-[9.5px]">
                  {calc.totalDeduction.toLocaleString('ko-KR')}원
                </span>
              </div>
            </section>
          </div>
        )}

        {!record && (
          <div className="salary-print-avoid my-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
            💡 확정된 급여 대장 기록이 존재하지 않아 소득세가 3% 단일세율로 임시 계산되었습니다. 실제 지급 시 국세청 간이세액표에 따라 세액이 달라질 수 있습니다.
          </div>
        )}

        <div
          className="salary-print-avoid mt-auto flex items-end justify-between gap-4 border-t pt-5 print:pt-3"
          style={{ borderColor }}
        >
          <div>
            <p className="text-sm font-black text-slate-950 print:text-[10px]">귀하의 노고에 감사드립니다.</p>
            <p className="mt-2 text-xs font-semibold text-slate-500 print:text-[8.5px]">
              위와 같이 급여가 지급되었음을 확인합니다.
            </p>
          </div>

          <div className="flex items-end gap-4 print:gap-2">
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-500 print:text-[8px]">회사명 및 직인</p>
              <p className="mt-1 max-w-[280px] truncate text-xl font-black text-slate-950 print:max-w-[190px] print:text-[13px]" title={companyLabel}>
                {companyLabel}
              </p>
            </div>
            {companySeal ? (
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center print:h-14 print:w-14">
                <div
                  className="absolute inset-1 rounded-full blur-lg print:hidden"
                  style={{ backgroundColor: alphaColor(primaryColor, 0.12) }}
                />
                <img
                  src={companySeal}
                  alt="회사 직인"
                  className="relative h-16 w-16 object-contain mix-blend-multiply print:h-12 print:w-12"
                />
              </div>
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-double border-red-600 text-sm font-black text-red-600 opacity-80 print:h-14 print:w-14 print:text-[9px]">
                직인
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

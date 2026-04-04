import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  alphaColor,
  fetchDocumentDesignStore,
  resolveDocumentDesign,
} from '@/lib/document-designs';
import { calculateHourlyRateFromMonthlySalary, getMonthlyWorkingHours } from '@/lib/payroll-working-hours';

function InfoItem({ label, value, highlight = false }: { label: string; value?: string; highlight?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--toss-gray-3)]">
        {label}
      </p>
      <p className={`text-sm font-bold ${highlight ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'}`}>
        {value || '-'}
      </p>
    </div>
  );
}

function SalaryRow({
  label,
  value,
  note,
  highlightColor,
  isDeduction = false,
  isTaxFree = false,
}: {
  label: string;
  value: number;
  note?: string;
  highlightColor: string;
  isDeduction?: boolean;
  isTaxFree?: boolean;
}) {
  return (
    <div className="border-b border-[var(--border-subtle)] py-2.5 last:border-0 print:py-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-[var(--toss-gray-4)]">{label}</span>
          {isTaxFree && (
            <span
              className="rounded-[var(--radius-md)] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide"
              style={{ backgroundColor: alphaColor(highlightColor, 0.12), color: highlightColor }}
            >
              Non-Taxable
            </span>
          )}
        </div>
        <span className={`text-sm font-extrabold tracking-tight ${isDeduction ? 'text-red-600' : 'text-[var(--foreground)]'}`}>
          {isDeduction ? '-' : ''} {Math.floor(Number(value) || 0).toLocaleString()}원
        </span>
      </div>
      {note && (
        <p className="mt-1 text-[10px] font-medium leading-relaxed text-[var(--toss-gray-3)]">
          {note}
        </p>
      )}
    </div>
  );
}

function formatDateLabel(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR');
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
  deduction_detail?: Record<string, number>;
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
  meal_allowance?: number;
  night_duty_allowance?: number;
  vehicle_allowance?: number;
  childcare_allowance?: number;
  research_allowance?: number;
  other_taxfree?: number;
  working_hours_per_week?: number;
}

export default function SalaryDetail({ record, staff }: { record?: SalaryRecord; staff?: StaffInfo }) {
  const [companySeal, setCompanySeal] = useState<string | null>(null);
  const [design, setDesign] = useState(() => resolveDocumentDesign(null, 'payroll_slip'));

  useEffect(() => {
    const loadResources = async () => {
      const companyName = staff?.company || 'SY INC.';
      const [designStore, templateResult, companyResult] = await Promise.all([
        fetchDocumentDesignStore(),
        supabase
          .from('contract_templates')
          .select('seal_url')
          .eq('company_name', companyName)
          .maybeSingle(),
        supabase
          .from('companies')
          .select('seal_url')
          .eq('name', companyName)
          .maybeSingle(),
      ]);

      setDesign(resolveDocumentDesign(designStore, 'payroll_slip', companyName));
      setCompanySeal(templateResult.data?.seal_url || companyResult.data?.seal_url || null);
    };

    loadResources().catch((error) => {
      console.error('급여명세서 리소스 로딩 실패:', error);
    });
  }, [staff?.company]);

  const data = useMemo(() => {
    return record || {
      base_salary: staff?.base_salary || 0,
      meal_allowance: staff?.meal_allowance || 0,
      night_duty_allowance: staff?.night_duty_allowance || 0,
      vehicle_allowance: staff?.vehicle_allowance || 0,
      childcare_allowance: staff?.childcare_allowance || 0,
      research_allowance: staff?.research_allowance || 0,
      other_taxfree: staff?.other_taxfree || 0,
      extra_allowance: staff?.position_allowance || 0,
      overtime_pay: 0,
      bonus: 0,
      year_month: new Date().toISOString().slice(0, 7),
    };
  }, [record, staff]);

  const calc = useMemo(() => {
    if (record) {
      const detail = record.deduction_detail || {};
      return {
        totalPayment: Number(record.total_taxable || 0) + Number(record.total_taxfree || 0),
        totalDeduction: Number(record.total_deduction || 0),
        pension: detail.national_pension ?? record.national_pension ?? Math.floor(Number(record.total_taxable || 0) * 0.045),
        health: detail.health_insurance ?? record.health_insurance ?? Math.floor(Number(record.total_taxable || 0) * 0.03545),
        longTerm: detail.long_term_care ?? record.long_term_care ?? 0,
        employment: detail.employment_insurance ?? record.employment_insurance ?? Math.floor(Number(record.total_taxable || 0) * 0.009),
        incomeTax: detail.income_tax ?? record.income_tax ?? Math.floor(Number(record.total_taxable || 0) * 0.03),
        localTax: detail.local_tax ?? record.local_tax ?? 0,
        customDeduction: detail.custom_deduction ?? 0,
        net: Number(record.net_pay || 0),
      };
    }

    const taxable =
      Number(data.base_salary || 0) +
      Number(data.extra_allowance || 0) +
      Number(data.overtime_pay || 0) +
      Number(data.bonus || 0);
    const taxfree =
      Number(data.meal_allowance || 0) +
      Number(data.night_duty_allowance || 0) +
      Number(data.vehicle_allowance || 0) +
      Number(data.childcare_allowance || 0) +
      Number(data.research_allowance || 0) +
      Number(data.other_taxfree || 0);

    const pension = Math.floor(taxable * 0.045);
    const health = Math.floor(taxable * 0.03545);
    const longTerm = Math.floor(health * 0.1295);
    const employment = Math.floor(taxable * 0.009);
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
  }, [data, record]);

  const companyName = staff?.company || design.companyLabel || 'SY INC.';
  const companyLabel = design.companyLabel || companyName;
  const primaryColor = design.primaryColor;
  const borderColor = design.borderColor;
  const headerBackground = `linear-gradient(135deg, ${primaryColor}, ${alphaColor(primaryColor, 0.9)})`;
  const highlightSurface = alphaColor(primaryColor, 0.08);
  const sectionBorder = alphaColor(primaryColor, 0.18);
  const watermarkSrc = companySeal || '/logo.png';

  const yearMonth = String(data.year_month || new Date().toISOString().slice(0, 7));
  const [year, month] = yearMonth.split('-');
  const monthLabel = `${year}년 ${Number(month || '1')}월`;
  const advancePayAmount = Number(record?.advance_pay || 0);
  const isAdvancePay = advancePayAmount > 0;
  const wphForPayslip = staff?.working_hours_per_week || 40;
  const fixedMonthlySalary =
    Number(data.base_salary || 0) +
    Number(data.extra_allowance || 0) +
    Number(data.meal_allowance || 0) +
    Number(data.night_duty_allowance || 0) +
    Number(data.vehicle_allowance || 0) +
    Number(data.childcare_allowance || 0) +
    Number(data.research_allowance || 0) +
    Number(data.other_taxfree || 0);
  const monthlyHoursForPayslip = getMonthlyWorkingHours(wphForPayslip);
  const hourlyRate = calculateHourlyRateFromMonthlySalary(fixedMonthlySalary, wphForPayslip, 'floor');

  return (
    <div
      className="relative mx-auto mb-4 w-full max-w-7xl overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--card)] shadow-sm print:mb-0 print:max-w-none print:shadow-sm"
      style={{ background: `linear-gradient(180deg, #ffffff 0%, ${alphaColor(primaryColor, 0.028)} 100%)` }}
    >
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -right-16 top-24 h-56 w-56 rounded-full blur-3xl"
          style={{ backgroundColor: alphaColor(primaryColor, 0.08) }}
        />
        <div
          className="absolute -left-12 bottom-28 h-44 w-44 rounded-full blur-3xl"
          style={{ backgroundColor: alphaColor(primaryColor, 0.05) }}
        />
        <img
          src={watermarkSrc}
          alt=""
          className="absolute left-1/2 top-[52%] h-64 w-64 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.045] mix-blend-multiply"
        />
      </div>

      <div className="relative overflow-hidden px-4 py-4 text-white print:py-4" style={{ background: headerBackground }}>
        <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full bg-[var(--card)]/10 blur-3xl" />
        <div className="absolute left-10 top-8 rounded-[var(--radius-md)] border border-white/15 bg-[var(--card)]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] backdrop-blur-sm">
          Premium Payroll
        </div>
        <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] opacity-80">{companyLabel}</p>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight">{design.title}</h2>
            <p className="mt-1 text-sm font-medium opacity-90">{design.subtitle}</p>
            <p className="mt-4 text-[13px] font-semibold opacity-90">{monthLabel}</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-black/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-xs font-black uppercase tracking-[0.2em] opacity-70">
              {isAdvancePay ? 'Advance Pay' : 'Net Pay'}
            </p>
            <p className="mt-1 text-2xl font-black tracking-tight">
              {(isAdvancePay ? advancePayAmount : calc.net).toLocaleString()}원
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-10 space-y-4 p-4 print:space-y-4 print:px-4 print:py-4">
        <div
          className="grid grid-cols-2 gap-4 rounded-[var(--radius-xl)] p-4 md:grid-cols-3 lg:grid-cols-6 print:grid-cols-6 print:gap-4 print:p-4"
          style={{ backgroundColor: highlightSurface, border: `1px solid ${borderColor}` }}
        >
          <InfoItem label="성명" value={staff?.name} />
          <InfoItem label="사번" value={staff?.employee_no || staff?.id} />
          <InfoItem label="입사일" value={formatDateLabel(staff?.join_date || staff?.joined_at)} />
          <InfoItem label="부서" value={staff?.department} />
          <InfoItem label="직위" value={staff?.position} />
          <InfoItem label="시급 환산" value={`${hourlyRate.toLocaleString()}원`} highlight />
        </div>

        {isAdvancePay ? (
          <div
            className="rounded-[var(--radius-xl)] bg-amber-50 p-4"
            style={{ border: `1px solid ${alphaColor('#d97706', 0.28)}` }}
          >
            <p className="text-sm font-bold text-amber-800">
              이 문서는 가불 지급 내역입니다. 기본급과 공제 항목은 제외하고 지급 금액만 표시합니다.
            </p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--toss-gray-5)]">가불 지급액</span>
              <span className="text-xl font-black text-amber-700">{advancePayAmount.toLocaleString()}원</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:grid-cols-2 print:gap-4">
            <div className="space-y-4">
              <div className="flex items-end justify-between px-1">
                <h4 className="text-sm font-black text-[var(--foreground)]">지급내역</h4>
                <span className="text-xs font-black" style={{ color: primaryColor }}>
                  지급합계 {calc.totalPayment.toLocaleString()}원
                </span>
              </div>
              <div className="overflow-hidden rounded-[var(--radius-xl)] bg-[var(--card)]" style={{ border: `2px solid ${sectionBorder}` }}>
                <div className="space-y-3 p-4 print:space-y-2 print:px-4 print:py-3">
                  <SalaryRow label="기본급" value={Number(data.base_salary || 0)} note="월 기본 급여" highlightColor={primaryColor} />
                  {Number(data.overtime_pay || 0) > 0 && (
                    <SalaryRow
                      label="연장근로수당"
                      value={Number(data.overtime_pay || 0)}
                      note={`시급 ${hourlyRate.toLocaleString()}원 기준 연장근로 반영`}
                      highlightColor={primaryColor}
                    />
                  )}
                  {Number(data.bonus || 0) > 0 && (
                    <SalaryRow label="상여" value={Number(data.bonus || 0)} note="성과 또는 별도 상여" highlightColor={primaryColor} />
                  )}
                  {Number(data.extra_allowance || 0) > 0 && (
                    <SalaryRow label="기타 수당" value={Number(data.extra_allowance || 0)} note="직책 / 자격 / 기타 수당" highlightColor={primaryColor} />
                  )}

                  <div className="mt-3 border-t pt-3" style={{ borderColor }}>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: primaryColor }}>
                      Tax-Free Benefits
                    </p>
                    <div className="mt-2 space-y-3 print:space-y-2">
                      <SalaryRow label="식대" value={Number(data.meal_allowance || 0)} note="월 비과세 식대" isTaxFree highlightColor={primaryColor} />
                      {Number(data.night_duty_allowance || 0) > 0 && (
                        <SalaryRow label="야간 수당" value={Number(data.night_duty_allowance || 0)} note="야간 근무 반영" isTaxFree highlightColor={primaryColor} />
                      )}
                      {Number(data.vehicle_allowance || 0) > 0 && (
                        <SalaryRow label="차량 유지비" value={Number(data.vehicle_allowance || 0)} note="업무용 차량 지원" isTaxFree highlightColor={primaryColor} />
                      )}
                      {Number(data.childcare_allowance || 0) > 0 && (
                        <SalaryRow label="보육 수당" value={Number(data.childcare_allowance || 0)} note="보육 지원 수당" isTaxFree highlightColor={primaryColor} />
                      )}
                      {Number(data.research_allowance || 0) > 0 && (
                        <SalaryRow label="연구 활동비" value={Number(data.research_allowance || 0)} note="연구 활동 지원" isTaxFree highlightColor={primaryColor} />
                      )}
                      {Number(data.other_taxfree || 0) > 0 && (
                        <SalaryRow label="기타 비과세" value={Number(data.other_taxfree || 0)} note="기타 비과세 수당" isTaxFree highlightColor={primaryColor} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-end justify-between px-1">
                <h4 className="text-sm font-black text-[var(--foreground)]">공제내역</h4>
                <span className="text-xs font-black text-red-600">
                  공제합계 {calc.totalDeduction.toLocaleString()}원
                </span>
              </div>
              <div className="overflow-hidden rounded-[var(--radius-xl)] bg-[var(--card)]" style={{ border: `2px solid ${alphaColor('#991b1b', 0.22)}` }}>
                <div className="space-y-3 p-4 print:space-y-2 print:px-4 print:py-3">
                  <SalaryRow label="국민연금" value={calc.pension} isDeduction highlightColor={primaryColor} />
                  <SalaryRow label="건강보험" value={calc.health} isDeduction highlightColor={primaryColor} />
                  <SalaryRow label="장기요양보험" value={calc.longTerm} isDeduction highlightColor={primaryColor} />
                  <SalaryRow label="고용보험" value={calc.employment} isDeduction highlightColor={primaryColor} />
                  <SalaryRow label="소득세" value={calc.incomeTax} isDeduction highlightColor={primaryColor} />
                  <SalaryRow label="지방소득세" value={calc.localTax} isDeduction highlightColor={primaryColor} />
                  {Number(calc.customDeduction || 0) > 0 && (
                    <SalaryRow label="기타 공제" value={calc.customDeduction} isDeduction highlightColor={primaryColor} />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div
          className="rounded-[var(--radius-xl)] px-4 py-3 text-white"
          style={{ background: `linear-gradient(135deg, ${alphaColor(primaryColor, 0.95)}, ${alphaColor(primaryColor, 0.76)})` }}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] opacity-75">Payment Summary</p>
              <p className="mt-1 text-sm font-semibold opacity-90">
                본 지급 내역은 회사 기준 급여 마감 결과를 반영합니다.
              </p>
            </div>
            <p className="text-xl font-black tracking-tight">{calc.net.toLocaleString()}원</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t pt-4 md:flex-row md:items-end md:justify-between" style={{ borderColor }}>
          <div className="space-y-1">
            {design.footerText && (
              <p className="text-[11px] font-medium leading-relaxed text-[var(--toss-gray-3)]">
                {design.footerText}
              </p>
            )}
            <p className="text-[10px] text-[var(--toss-gray-3)]">
              발급 시각: {new Date().toLocaleString('ko-KR')}
            </p>
          </div>

          {design.showSignArea && (
            <div
              className="flex items-center gap-4 rounded-[var(--radius-xl)] border bg-[var(--card)] px-4 py-3 shadow-sm"
              style={{ borderColor: alphaColor(primaryColor, 0.16) }}
            >
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: primaryColor }}>
                  Verified By
                </p>
                <p className="text-xl font-black tracking-tight text-[var(--foreground)]">{companyLabel}</p>
                <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">직인 / 담당자 승인</p>
              </div>
              {companySeal ? (
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <div
                    className="absolute inset-1 rounded-full blur-lg"
                    style={{ backgroundColor: alphaColor(primaryColor, 0.12) }}
                  />
                  <img
                    src={companySeal}
                    alt="회사 직인"
                    className="relative h-14 w-14 rotate-12 object-contain opacity-90 mix-blend-multiply"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-double border-red-600 text-xs font-black text-red-600 opacity-80">
                  직인
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

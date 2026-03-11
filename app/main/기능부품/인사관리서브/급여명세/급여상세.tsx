'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  alphaColor,
  fetchDocumentDesignStore,
  resolveDocumentDesign,
} from '@/lib/document-designs';
import AppLogo from '@/app/components/AppLogo';

function toNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return `${Math.floor(toNumber(value)).toLocaleString()}??;
}

function formatDateLabel(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR');
}

function parseDeductionDetail(value: unknown) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (typeof value === 'object') return value as Record<string, any>;
  return {};
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
    <div className="space-y-1.5">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--toss-gray-3)]">
        {label}
      </p>
      <p className={`text-sm font-bold ${highlight ? 'text-[var(--toss-blue)]' : 'text-[var(--foreground)]'}`}>
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
    <div className="border-b border-slate-100 py-2.5 last:border-0 print:py-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-[var(--toss-gray-4)]">{label}</span>
          {isTaxFree && (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-black tracking-wide"
              style={{ backgroundColor: alphaColor(highlightColor, 0.12), color: highlightColor }}
            >
              鍮꾧낵??            </span>
          )}
        </div>
        <span className={`text-sm font-extrabold tracking-tight ${isDeduction ? 'text-red-600' : 'text-[var(--foreground)]'}`}>
          {isDeduction ? '-' : ''}
          {formatCurrency(value)}
        </span>
      </div>
      {note ? (
        <p className="mt-1 text-[10px] font-medium leading-relaxed text-[var(--toss-gray-3)]">
          {note}
        </p>
      ) : null}
    </div>
  );
}

export default function SalaryDetail({ record, staff, displayYearMonth }: any) {
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
      console.error('湲됱뿬紐낆꽭??由ъ냼??濡쒕뵫 ?ㅽ뙣:', error);
    });
  }, [staff?.company]);

  const data = useMemo(() => {
    return (
      record || {
        base_salary: staff?.base_salary || 0,
        meal_allowance: staff?.meal_allowance || 0,
        night_duty_allowance: staff?.night_duty_allowance || 0,
        vehicle_allowance: staff?.vehicle_allowance || 0,
        childcare_allowance: staff?.childcare_allowance || 0,
        research_allowance: staff?.research_allowance || 0,
        other_taxfree: staff?.other_taxfree || 0,
        extra_allowance: 0,
        overtime_pay: 0,
        bonus: 0,
        year_month: new Date().toISOString().slice(0, 7),
      }
    );
  }, [record, staff]);

  const calc = useMemo(() => {
    if (record) {
      const detail = parseDeductionDetail(record.deduction_detail);
      const taxable = toNumber(record.total_taxable);

      return {
        totalPayment: taxable + toNumber(record.total_taxfree),
        totalDeduction: toNumber(record.total_deduction),
        pension: toNumber(detail.national_pension ?? record.national_pension ?? Math.floor(taxable * 0.045)),
        health: toNumber(detail.health_insurance ?? record.health_insurance ?? Math.floor(taxable * 0.03545)),
        longTerm: toNumber(detail.long_term_care ?? record.long_term_care),
        employment: toNumber(detail.employment_insurance ?? record.employment_insurance ?? Math.floor(taxable * 0.009)),
        incomeTax: toNumber(detail.income_tax ?? record.income_tax ?? Math.floor(taxable * 0.03)),
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
  const sectionBorder = alphaColor(primaryColor, 0.18);
  const highlightSurface = alphaColor(primaryColor, 0.08);
  const headerSurface = `linear-gradient(180deg, ${alphaColor(primaryColor, 0.12)}, rgba(255,255,255,1))`;

  const yearMonth = String(displayYearMonth || data.year_month || new Date().toISOString().slice(0, 7));
  const [year, month] = yearMonth.split('-');
  const monthLabel = `${year}??${Number(month || '1')}??湲됱뿬紐낆꽭??;
  const advancePayAmount = toNumber(record?.advance_pay);
  const isAdvancePay = advancePayAmount > 0;
  const hourlyRate = Math.floor(toNumber(data.base_salary) / 209);

  return (
    <div className="mx-auto mb-10 w-full max-w-7xl overflow-hidden rounded-[24px] border bg-white shadow-xl print:mb-0 print:max-w-none print:shadow-md">
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
        }
      `}</style>

      <div
        className="border-b px-8 py-10 text-center print:py-7"
        style={{ background: headerSurface, borderColor }}
      >
        <h2 className="text-3xl font-extrabold tracking-tight text-[var(--foreground)]">
          {monthLabel}
        </h2>
      </div>

      <div className="space-y-8 p-8 print:space-y-5 print:px-8 print:py-5">
        <div
          className="grid grid-cols-2 gap-6 rounded-[20px] p-6 md:grid-cols-3 lg:grid-cols-6 print:grid-cols-6 print:gap-4 print:p-5"
          style={{ backgroundColor: highlightSurface, border: `1px solid ${borderColor}` }}
        >
          <InfoItem label="?깅챸" value={staff?.name} />
          <InfoItem label="?щ쾲" value={staff?.employee_no || staff?.id} />
          <InfoItem label="?낆궗?? value={formatDateLabel(staff?.join_date || staff?.joined_at)} />
          <InfoItem label="遺?? value={staff?.department} />
          <InfoItem label="吏곸쐞" value={staff?.position} />
          <InfoItem label="?쒓툒 ?섏궛" value={formatCurrency(hourlyRate)} highlight />
        </div>

        <div
          className="relative overflow-hidden rounded-[24px] border px-6 py-7 text-center print:py-4"
          style={{
            borderColor,
            background: 'radial-gradient(circle at top, ' + alphaColor(primaryColor, 0.16) + ', rgba(255,255,255,0.96) 58%)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(circle at center, ' + alphaColor(primaryColor, 0.12) + ', transparent 72%)' }}
          />
          <div className="relative flex flex-col items-center gap-3 print:gap-2">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-[24px] border bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.08)] print:h-14 print:w-14"
              style={{ borderColor: alphaColor(primaryColor, 0.18) }}
            >
              <AppLogo size={52} className="rounded-[16px]" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-black tracking-tight text-[var(--foreground)] print:text-base">
                {companyLabel}
              </p>
              <p className="text-xs font-medium text-[var(--toss-gray-3)] print:text-[10px]">
                이번 달 급여 지급과 공제 내역을 한눈에 확인할 수 있도록 정리했습니다.
              </p>
            </div>
          </div>
        </div>

        {isAdvancePay ? (
          <div
            className="rounded-[20px] bg-amber-50 p-6"
            style={{ border: `1px solid ${alphaColor('#d97706', 0.28)}` }}
          >
            <p className="text-sm font-bold text-amber-800">
              ??臾몄꽌??媛遺?吏湲??댁뿭?낅땲?? 吏湲?湲덉븸留??쒖떆?⑸땲??
            </p>
            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-slate-700">媛遺?吏湲됱븸</span>
              <span className="text-2xl font-black text-amber-700">{formatCurrency(advancePayAmount)}</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 print:grid-cols-2 print:gap-6">
            <div className="space-y-4">
              <div className="flex items-end justify-between px-1">
                <h4 className="text-sm font-black text-[var(--foreground)]">吏湲됰궡??/h4>
                <span className="text-xs font-black" style={{ color: primaryColor }}>
                  吏湲됲빀怨?{formatCurrency(calc.totalPayment)}
                </span>
              </div>
              <div className="overflow-hidden rounded-[18px] bg-white" style={{ border: `2px solid ${sectionBorder}` }}>
                <div className="space-y-3 p-5 print:space-y-2 print:px-5 print:py-4">
                  <SalaryRow label="湲곕낯湲? value={toNumber(data.base_salary)} note="??湲곕낯 湲됱뿬" highlightColor={primaryColor} />
                  {toNumber(data.overtime_pay) > 0 ? (
                    <SalaryRow
                      label="?곗옣洹쇰줈?섎떦"
                      value={toNumber(data.overtime_pay)}
                      note={`?쒓툒 ${formatCurrency(hourlyRate)} 湲곗? ?곗옣洹쇰줈 諛섏쁺`}
                      highlightColor={primaryColor}
                    />
                  ) : null}
                  {toNumber(data.bonus) > 0 ? (
                    <SalaryRow label="?곸뿬" value={toNumber(data.bonus)} note="?깃낵 ?먮뒗 蹂꾨룄 ?곸뿬" highlightColor={primaryColor} />
                  ) : null}
                  {toNumber(data.extra_allowance) > 0 ? (
                    <SalaryRow label="湲고? ?섎떦" value={toNumber(data.extra_allowance)} note="吏곸콉 ?먮뒗 湲고? ?섎떦" highlightColor={primaryColor} />
                  ) : null}

                  <div className="mt-3 border-t pt-3" style={{ borderColor }}>
                    <div className="space-y-3 print:space-y-2">
                      <SalaryRow label="?앸?" value={toNumber(data.meal_allowance)} note="??鍮꾧낵???앸?" isTaxFree highlightColor={primaryColor} />
                      {toNumber(data.night_duty_allowance) > 0 ? (
                        <SalaryRow label="?쇨컙 ?섎떦" value={toNumber(data.night_duty_allowance)} note="?쇨컙 洹쇰Т 諛섏쁺" isTaxFree highlightColor={primaryColor} />
                      ) : null}
                      {toNumber(data.vehicle_allowance) > 0 ? (
                        <SalaryRow label="李⑤웾 ?좎?鍮? value={toNumber(data.vehicle_allowance)} note="?낅Т??李⑤웾 吏?? isTaxFree highlightColor={primaryColor} />
                      ) : null}
                      {toNumber(data.childcare_allowance) > 0 ? (
                        <SalaryRow label="蹂댁쑁 ?섎떦" value={toNumber(data.childcare_allowance)} note="蹂댁쑁 吏???섎떦" isTaxFree highlightColor={primaryColor} />
                      ) : null}
                      {toNumber(data.research_allowance) > 0 ? (
                        <SalaryRow label="?곌뎄 ?쒕룞鍮? value={toNumber(data.research_allowance)} note="?곌뎄 ?쒕룞 吏?? isTaxFree highlightColor={primaryColor} />
                      ) : null}
                      {toNumber(data.other_taxfree) > 0 ? (
                        <SalaryRow label="湲고? 鍮꾧낵?? value={toNumber(data.other_taxfree)} note="湲고? 鍮꾧낵???섎떦" isTaxFree highlightColor={primaryColor} />
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-end justify-between px-1">
                <h4 className="text-sm font-black text-[var(--foreground)]">怨듭젣?댁뿭</h4>
                <span className="text-xs font-black text-red-600">
                  怨듭젣?⑷퀎 {formatCurrency(calc.totalDeduction)}
                </span>
              </div>
              <div className="overflow-hidden rounded-[18px] bg-white" style={{ border: `2px solid ${alphaColor('#991b1b', 0.22)}` }}>
                <div className="space-y-3 p-5 print:space-y-2 print:px-5 print:py-4">
                  <SalaryRow label="援???곌툑" value={calc.pension} isDeduction highlightColor={primaryColor} />
                  <SalaryRow label="嫄닿컯蹂댄뿕" value={calc.health} isDeduction highlightColor={primaryColor} />
                  <SalaryRow label="?κ린?붿뼇蹂댄뿕" value={calc.longTerm} isDeduction highlightColor={primaryColor} />
                  <SalaryRow label="怨좎슜蹂댄뿕" value={calc.employment} isDeduction highlightColor={primaryColor} />
                  <SalaryRow label="?뚮뱷?? value={calc.incomeTax} isDeduction highlightColor={primaryColor} />
                  <SalaryRow label="吏諛⑹냼?앹꽭" value={calc.localTax} isDeduction highlightColor={primaryColor} />
                  {toNumber(calc.customDeduction) > 0 ? (
                    <SalaryRow label="湲고? 怨듭젣" value={calc.customDeduction} isDeduction highlightColor={primaryColor} />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-5 border-t pt-6 md:flex-row md:items-end md:justify-between" style={{ borderColor }}>
          <div className="space-y-1">
            {design.footerText ? (
              <p className="text-[11px] font-medium leading-relaxed text-[var(--toss-gray-3)]">
                {design.footerText}
              </p>
            ) : null}
            <p className="text-[10px] text-[var(--toss-gray-3)]">
              諛쒓툒 ?쒓컖: {new Date().toLocaleString('ko-KR')}
            </p>
          </div>

          {design.showSignArea ? (
            <div className="flex items-center gap-4">
              <div className="relative flex items-center justify-end pr-5">
                <p className="text-3xl font-black tracking-tight text-[var(--foreground)]">{companyLabel}</p>
                <div className="pointer-events-none absolute -right-1 top-1/2 -translate-y-1/2">
                  {companySeal ? (
                    <img
                      src={companySeal}
                      alt="?뚯궗 吏곸씤"
                      className="h-14 w-14 rotate-12 object-contain opacity-85 mix-blend-multiply"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-double border-red-600 text-xs font-black text-red-600 opacity-80">
                      吏곸씤
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}




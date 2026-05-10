'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type SalaryData = {
  base_salary: number;
  overtime_pay: number;
  bonus: number;
  national_pension: number;
  health_insurance: number;
  income_tax: number;
  meal_allowance?: number;
  long_term_care?: number;
  employment_insurance?: number;
  local_tax?: number;
  extra_allowance?: number;
  total_taxfree?: number;
};

type UserInfo = {
  name?: string;
  employee_no?: string;
  department?: string;
  position?: string;
  company?: string;
  join_date?: string;
  joined_at?: string;
};

type SalarySlipUIProps = {
  user: UserInfo;
  currentDate: Date;
  salaryData: SalaryData | null;
  totalPayment: number;
  totalDeduction: number;
};

function money(value: number) {
  return Math.floor(value || 0).toLocaleString('ko-KR');
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR');
}

function InfoCell({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0 border-r border-b border-slate-200 bg-white px-3 py-2 print:px-2 print:py-1.5">
      <p className="text-[10px] font-bold text-slate-500 print:text-[8.5px]">{label}</p>
      <p className="mt-1 truncate text-[13px] font-extrabold text-slate-950 print:text-[10px]" title={value || '-'}>
        {value || '-'}
      </p>
    </div>
  );
}

function AmountRow({
  label,
  value,
  deduction = false,
  compact = false,
}: {
  label: string;
  value: number;
  deduction?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-slate-200 px-3 last:border-0 print:px-2 ${compact ? 'py-1 print:py-0.5' : 'py-2 print:py-1'}`}>
      <span className="truncate text-[12px] font-bold text-slate-800 print:text-[9px]" title={label}>
        {label}
      </span>
      <span className={`whitespace-nowrap text-right text-[12px] font-extrabold print:text-[9px] ${deduction ? 'text-red-700' : 'text-slate-950'}`}>
        {deduction ? '-' : ''}
        {money(value)}원
      </span>
    </div>
  );
}

export default function SalarySlipUI({
  user,
  currentDate,
  salaryData,
  totalPayment,
  totalDeduction,
}: SalarySlipUIProps) {
  const [sealUrl, setSealUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.company) return;
    supabase
      .from('contract_templates')
      .select('seal_url')
      .eq('company_name', user.company)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.seal_url) setSealUrl(data.seal_url as string);
      });
  }, [user?.company]);

  const rows = useMemo(() => {
    if (!salaryData) return null;

    const mealAllowance = salaryData.meal_allowance ?? 100000;
    const paymentRows = [
      { label: '기본급', value: salaryData.base_salary },
      { label: '연장근로수당', value: salaryData.overtime_pay },
      { label: '식대', value: mealAllowance },
      { label: '상여금', value: salaryData.bonus },
      { label: '기타수당', value: salaryData.extra_allowance || 0 },
      { label: '기타 비과세', value: salaryData.total_taxfree || 0 },
    ].filter((row) => row.value > 0);

    const deductionRows = [
      { label: '국민연금', value: salaryData.national_pension },
      { label: '건강보험', value: salaryData.health_insurance },
      { label: '장기요양보험', value: salaryData.long_term_care || Math.floor(salaryData.health_insurance * 0.1281) },
      { label: '고용보험', value: salaryData.employment_insurance || Math.floor(totalPayment * 0.009) },
      { label: '소득세', value: salaryData.income_tax },
      { label: '지방소득세', value: salaryData.local_tax || Math.floor(salaryData.income_tax * 0.1) },
    ].filter((row) => row.value > 0);

    return {
      paymentRows: paymentRows.length > 0 ? paymentRows : [{ label: '지급 항목 없음', value: 0 }],
      deductionRows: deductionRows.length > 0 ? deductionRows : [{ label: '공제 항목 없음', value: 0 }],
    };
  }, [salaryData, totalPayment]);

  if (!salaryData || !rows) return null;

  const realPayment = totalPayment - totalDeduction;
  const monthLabel = `${currentDate.getFullYear()}년 ${String(currentDate.getMonth() + 1).padStart(2, '0')}월`;
  const companyName = user.company || '박철홍정형외과';
  const compactRows = Math.max(rows.paymentRows.length, rows.deductionRows.length) > 12;

  return (
    <div
      data-testid="legacy-salary-slip"
      className="mx-auto flex w-full max-w-[210mm] flex-col overflow-hidden border border-slate-300 bg-white text-slate-950 shadow-sm print:max-w-none print:shadow-none"
      style={{ minHeight: '260mm' }}
    >
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          [data-testid="legacy-salary-slip"] {
            width: 194mm !important;
            max-width: 194mm !important;
            min-height: 0 !important;
            margin: 0 auto !important;
            overflow: visible !important;
            break-inside: avoid;
            page-break-inside: avoid;
            background: #ffffff !important;
            color: #020617 !important;
          }
          [data-testid="legacy-salary-slip"] * {
            box-sizing: border-box;
          }
          .legacy-slip-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <header className="legacy-slip-avoid flex items-start justify-between gap-4 border-b-[3px] border-slate-900 bg-slate-50 px-7 py-5 print:px-4 print:py-3">
        <div>
          <p className="text-[11px] font-black text-slate-500 print:text-[9px]">PAYSLIP</p>
          <h1 className="mt-1 text-3xl font-black text-slate-950 print:text-[22px]">{monthLabel} 급여명세서</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500 print:text-[9px]">
            발행일 {new Date().toLocaleDateString('ko-KR')}
          </p>
        </div>
        <div className="max-w-[220px] shrink-0 text-right print:max-w-[170px]">
          <p className="text-[11px] font-bold text-slate-500 print:text-[9px]">지급처</p>
          <p className="mt-1 truncate text-lg font-black text-slate-950 print:text-[13px]" title={companyName}>
            {companyName}
          </p>
        </div>
      </header>

      <main className="flex flex-1 flex-col px-7 py-5 print:px-4 print:py-3">
        <section className="legacy-slip-avoid mb-4 grid grid-cols-3 overflow-hidden border border-slate-200 print:mb-2">
          <InfoCell label="성명" value={user.name} />
          <InfoCell label="사번" value={user.employee_no} />
          <InfoCell label="입사일" value={formatDate(user.join_date || user.joined_at)} />
          <InfoCell label="부서" value={user.department} />
          <InfoCell label="직위" value={user.position} />
          <InfoCell label="지급월" value={monthLabel} />
        </section>

        <section className="legacy-slip-avoid mb-4 grid grid-cols-3 overflow-hidden border border-slate-300 print:mb-2">
          <div className="border-r border-slate-300 px-4 py-3 print:px-2 print:py-1.5">
            <p className="text-[11px] font-bold text-slate-500 print:text-[8.5px]">지급합계</p>
            <p className="mt-1 text-lg font-black text-slate-950 print:text-[12px]">{money(totalPayment)}원</p>
          </div>
          <div className="border-r border-slate-300 px-4 py-3 print:px-2 print:py-1.5">
            <p className="text-[11px] font-bold text-slate-500 print:text-[8.5px]">공제합계</p>
            <p className="mt-1 text-lg font-black text-red-700 print:text-[12px]">{money(totalDeduction)}원</p>
          </div>
          <div className="bg-blue-50 px-4 py-3 print:px-2 print:py-1.5">
            <p className="text-[11px] font-bold text-slate-500 print:text-[8.5px]">차인지급액</p>
            <p className="mt-1 text-xl font-black text-blue-900 print:text-[13px]">{money(realPayment)}원</p>
          </div>
        </section>

        <section className="grid flex-1 grid-cols-2 gap-4 print:gap-2">
          <div className="legacy-slip-avoid flex min-w-0 flex-col overflow-hidden border border-blue-900 bg-white">
            <div className="flex items-center justify-between bg-blue-900 px-4 py-2 text-white print:px-2 print:py-1.5">
              <h2 className="text-sm font-black print:text-[10px]">지급내역</h2>
              <span className="text-[11px] font-bold print:text-[8px]">Earnings</span>
            </div>
            <div className="flex-1">
              {rows.paymentRows.map((row) => (
                <AmountRow key={row.label} label={row.label} value={row.value} compact={compactRows} />
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 print:px-2 print:py-1">
              <span className="text-[11px] font-bold text-slate-600 print:text-[8px]">지급 합계</span>
              <span className="text-sm font-black text-blue-900 print:text-[9.5px]">{money(totalPayment)}원</span>
            </div>
          </div>

          <div className="legacy-slip-avoid flex min-w-0 flex-col overflow-hidden border border-red-800 bg-white">
            <div className="flex items-center justify-between bg-red-800 px-4 py-2 text-white print:px-2 print:py-1.5">
              <h2 className="text-sm font-black print:text-[10px]">공제내역</h2>
              <span className="text-[11px] font-bold print:text-[8px]">Deductions</span>
            </div>
            <div className="flex-1">
              {rows.deductionRows.map((row) => (
                <AmountRow key={row.label} label={row.label} value={row.value} deduction compact={compactRows} />
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 bg-red-50 px-4 py-2 print:px-2 print:py-1">
              <span className="text-[11px] font-bold text-slate-600 print:text-[8px]">공제 합계</span>
              <span className="text-sm font-black text-red-700 print:text-[9.5px]">{money(totalDeduction)}원</span>
            </div>
          </div>
        </section>

        <footer className="legacy-slip-avoid mt-auto flex items-end justify-between gap-4 border-t border-slate-300 pt-5 print:pt-3">
          <div>
            <p className="text-sm font-black text-slate-950 print:text-[10px]">귀하의 노고에 감사드립니다.</p>
            <p className="mt-2 text-xs font-semibold text-slate-500 print:text-[8.5px]">
              위와 같이 급여가 지급되었음을 확인합니다.
            </p>
          </div>
          <div className="flex items-end gap-4 print:gap-2">
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-500 print:text-[8px]">회사명 및 직인</p>
              <p className="mt-1 max-w-[280px] truncate text-xl font-black text-slate-950 print:max-w-[190px] print:text-[13px]" title={companyName}>
                {companyName}
              </p>
            </div>
            {sealUrl ? (
              <img
                src={sealUrl}
                alt="사업자 직인"
                className="h-16 w-16 shrink-0 object-contain mix-blend-multiply print:h-12 print:w-12"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-double border-red-600 text-sm font-black text-red-600 opacity-80 print:h-14 print:w-14 print:text-[9px]">
                직인
              </div>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}

'use client';

/**
 * 모바일 전용 본인 급여명세서.
 * - 데스크탑(A4 출력용 SalaryDetail) 대신 모바일 폭(<=767px)에서 사용.
 * - 라벨/값 페어를 세로 카드로 표시, 실지급액 강조.
 * - 월 선택은 native select(모바일 OS picker 활용).
 * - 인쇄/공유는 OS 공유 시트(Web Share API) → 미지원 시 print 폴백.
 *
 * JM: 단일 책임(본인 명세서 모바일 뷰), 200줄 이내 유지.
 * JM3: 데이터 fetch는 상위(index.tsx)에서 끝낸 결과만 받아서 렌더만 담당.
 * JM4: props 타입 명시, any 금지.
 * JM5: 본인 데이터 가정(상위에서 비밀번호 확인 후 fetch).
 * JM6: 버튼 aria-label, label-for 연결.
 */

import { useMemo } from 'react';
import { Share2, Printer } from 'lucide-react';

type StaffInfo = {
  company?: string;
  name?: string;
  employee_no?: string;
  department?: string;
  position?: string;
};

type SalaryRecord = {
  year_month?: string;
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
};

type MobileSalarySlipProps = {
  staff: StaffInfo;
  record: SalaryRecord | null;
  availableMonths: string[];
  selectedYearMonth: string;
  onSelectMonth: (yearMonth: string) => void;
};

function money(value: number | undefined | null): string {
  return Math.floor(Number(value) || 0).toLocaleString('ko-KR');
}

function formatYearMonthLabel(yearMonth: string): string {
  const [year, month] = String(yearMonth || '').split('-');
  if (!year || !month) return yearMonth;
  return `${year}년 ${Number(month)}월`;
}

type AmountRow = { label: string; value: number };

function buildPaymentRows(record: SalaryRecord): AmountRow[] {
  return [
    { label: '기본급', value: Number(record.base_salary || 0) },
    { label: '연장근로수당', value: Number(record.overtime_pay || 0) },
    { label: '식대', value: Number(record.meal_allowance || 0) },
    { label: '야간당직수당', value: Number(record.night_duty_allowance || 0) },
    { label: '차량유지비', value: Number(record.vehicle_allowance || 0) },
    { label: '보육수당', value: Number(record.childcare_allowance || 0) },
    { label: '연구수당', value: Number(record.research_allowance || 0) },
    { label: '기타 비과세', value: Number(record.other_taxfree || 0) },
    { label: '기타수당', value: Number(record.extra_allowance || 0) },
    { label: '상여금', value: Number(record.bonus || 0) },
  ].filter((row) => row.value > 0);
}

function buildDeductionRows(record: SalaryRecord): AmountRow[] {
  return [
    { label: '국민연금', value: Number(record.national_pension || 0) },
    { label: '건강보험', value: Number(record.health_insurance || 0) },
    { label: '장기요양보험', value: Number(record.long_term_care || 0) },
    { label: '고용보험', value: Number(record.employment_insurance || 0) },
    { label: '소득세', value: Number(record.income_tax || 0) },
    { label: '지방소득세', value: Number(record.local_tax || 0) },
    { label: '가불금', value: Number(record.advance_pay || 0) },
  ].filter((row) => row.value > 0);
}

export default function MobileSalarySlip({
  staff,
  record,
  availableMonths,
  selectedYearMonth,
  onSelectMonth,
}: MobileSalarySlipProps) {
  const paymentRows = useMemo(() => (record ? buildPaymentRows(record) : []), [record]);
  const deductionRows = useMemo(() => (record ? buildDeductionRows(record) : []), [record]);
  const totalPayment = useMemo(
    () => paymentRows.reduce((acc, row) => acc + row.value, 0),
    [paymentRows],
  );
  const totalDeduction = useMemo(
    () => deductionRows.reduce((acc, row) => acc + row.value, 0),
    [deductionRows],
  );
  const netPay = Number(record?.net_pay ?? totalPayment - totalDeduction) || 0;

  const handleShare = async () => {
    const monthLabel = formatYearMonthLabel(selectedYearMonth);
    const text = `${monthLabel} 급여명세서\n지급: ${money(totalPayment)}원\n공제: ${money(totalDeduction)}원\n실지급: ${money(netPay)}원`;
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share({ title: `${monthLabel} 급여명세서`, text });
        return;
      }
    } catch {
      // 사용자가 공유 취소했거나 미지원 — print 폴백
    }
    window.print();
  };

  return (
    <div
      data-testid="mobile-salary-slip"
      className="flex flex-col gap-3 px-3 pb-6 pt-2"
    >
      <header className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <label htmlFor="mobile-salary-month" className="block text-[11px] font-bold tracking-wider text-[var(--toss-gray-3)]">
          월 선택
        </label>
        <select
          id="mobile-salary-month"
          value={selectedYearMonth}
          onChange={(event) => onSelectMonth(event.target.value)}
          className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
        >
          {availableMonths.map((yearMonth) => (
            <option key={yearMonth} value={yearMonth}>
              {formatYearMonthLabel(yearMonth)}
            </option>
          ))}
        </select>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-1.5">
            <p className="text-[10px] text-[var(--toss-gray-3)]">성명</p>
            <p className="truncate font-bold text-[var(--foreground)]">{staff.name || '-'}</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-1.5">
            <p className="text-[10px] text-[var(--toss-gray-3)]">사번</p>
            <p className="truncate font-bold text-[var(--foreground)]">{staff.employee_no || '-'}</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-1.5">
            <p className="text-[10px] text-[var(--toss-gray-3)]">부서</p>
            <p className="truncate font-bold text-[var(--foreground)]">{staff.department || '-'}</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-1.5">
            <p className="text-[10px] text-[var(--toss-gray-3)]">직위</p>
            <p className="truncate font-bold text-[var(--foreground)]">{staff.position || '-'}</p>
          </div>
        </div>
      </header>

      <section
        aria-label="실지급액"
        className="rounded-[var(--radius-lg)] border-2 border-[var(--accent)] bg-[var(--accent)]/10 p-4 text-center"
      >
        <p className="text-[11px] font-bold tracking-wider text-[var(--accent)]">실지급액</p>
        <p className="mt-1 text-3xl font-black text-[var(--accent)]">{money(netPay)}원</p>
        <div className="mt-3 flex justify-center gap-4 text-[11px] font-semibold text-[var(--toss-gray-3)]">
          <span>지급 {money(totalPayment)}원</span>
          <span aria-hidden="true">·</span>
          <span>공제 {money(totalDeduction)}원</span>
        </div>
      </section>

      <section
        aria-label="지급내역"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
      >
        <h3 className="mb-2 text-sm font-bold text-[var(--foreground)]">지급내역</h3>
        <dl className="divide-y divide-[var(--border)]">
          {paymentRows.length === 0 ? (
            <p className="py-2 text-center text-[12px] text-[var(--toss-gray-3)]">지급 항목 없음</p>
          ) : (
            paymentRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2">
                <dt className="text-[13px] font-medium text-[var(--toss-gray-4)]">{row.label}</dt>
                <dd className="text-[13px] font-bold text-[var(--foreground)]">{money(row.value)}원</dd>
              </div>
            ))
          )}
        </dl>
      </section>

      <section
        aria-label="공제내역"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
      >
        <h3 className="mb-2 text-sm font-bold text-[var(--foreground)]">공제내역</h3>
        <dl className="divide-y divide-[var(--border)]">
          {deductionRows.length === 0 ? (
            <p className="py-2 text-center text-[12px] text-[var(--toss-gray-3)]">공제 항목 없음</p>
          ) : (
            deductionRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2">
                <dt className="text-[13px] font-medium text-[var(--toss-gray-4)]">{row.label}</dt>
                <dd className="text-[13px] font-bold text-red-600">-{money(row.value)}원</dd>
              </div>
            ))
          )}
        </dl>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleShare}
          aria-label="명세서 공유"
          className="flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-sm font-bold text-white hover:opacity-95"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          공유
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          aria-label="명세서 인쇄"
          className="flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] py-3 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          인쇄
        </button>
      </div>
    </div>
  );
}

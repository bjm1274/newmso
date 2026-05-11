# Codex 지시서 — 급여명세서 디자인 전면 교체

> 대상 파일: `app/main/기능부품/마이페이지/급여명세서/명세서디자인.tsx`
> 목적: 직원용 세로형 A4, 수당 수 제한 없이 1장 내 출력

---

## 규칙
- 대상 파일 1개만 수정
- TypeScript 타입 오류 없어야 함
- 주석 추가 금지
- 기존 `supabase` 직인 로딩 로직 유지

---

## 파일 전체 교체

아래 코드로 `명세서디자인.tsx` 파일 전체를 교체한다.

```tsx
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type EarningsItem = { label: string; amount: number; taxFree?: boolean };
type DeductionItem = { label: string; amount: number };

type SalaryData = {
  base_salary: number;
  overtime_pay: number;
  bonus: number;
  national_pension: number;
  health_insurance: number;
  income_tax: number;
};

type UserInfo = {
  name?: string;
  department?: string;
  position?: string;
  company?: string;
  hireDate?: string;
};

type SalarySlipUIProps = {
  user: UserInfo;
  currentDate: Date;
  salaryData: SalaryData | null;
  totalPayment: number;
  totalDeduction: number;
  extraEarnings?: EarningsItem[];
  extraDeductions?: DeductionItem[];
  paymentDate?: string;
};

export default function SalarySlipUI({
  user,
  currentDate,
  salaryData,
  totalPayment,
  totalDeduction,
  extraEarnings = [],
  extraDeductions = [],
  paymentDate,
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

  if (!salaryData) return null;

  const netPay = totalPayment - totalDeduction;
  const yyyy = currentDate.getFullYear();
  const mm = String(currentDate.getMonth() + 1).padStart(2, '0');

  const longTermCare = Math.floor(salaryData.health_insurance * 0.1281);
  const employmentInsurance = Math.floor(totalPayment * 0.009);
  const localIncomeTax = Math.floor(salaryData.income_tax * 0.1);

  const baseEarnings: EarningsItem[] = [
    { label: '기본급', amount: salaryData.base_salary },
    ...(salaryData.overtime_pay > 0 ? [{ label: '연장근로수당', amount: salaryData.overtime_pay }] : []),
    { label: '식대', amount: 100000, taxFree: true },
    ...(salaryData.bonus > 0 ? [{ label: '상여금', amount: salaryData.bonus }] : []),
    ...extraEarnings,
  ];

  const baseDeductions: DeductionItem[] = [
    { label: '국민연금', amount: salaryData.national_pension },
    { label: '건강보험', amount: salaryData.health_insurance },
    { label: '장기요양보험', amount: longTermCare },
    { label: '고용보험', amount: employmentInsurance },
    { label: '소득세', amount: salaryData.income_tax },
    { label: '지방소득세', amount: localIncomeTax },
    ...extraDeductions,
  ];

  const maxRows = Math.max(baseEarnings.length, baseDeductions.length);

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm 14mm; }
          body * { visibility: hidden; }
          #payslip-root, #payslip-root * { visibility: visible; }
          #payslip-root { position: fixed; inset: 0; }
        }
      `}</style>

      <div
        id="payslip-root"
        className="mx-auto flex w-full max-w-[210mm] flex-col bg-white text-black"
        style={{ minHeight: '277mm', fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}
      >
        {/* ── 헤더 ── */}
        <div className="flex items-start justify-between border-b-2 border-black px-7 pb-4 pt-6">
          <div>
            <p className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">
              {user.company || 'SY INC.'}
            </p>
            <h1 className="mt-1 text-[26px] font-black tracking-[0.3em] text-black">
              급여명세서
            </h1>
          </div>
          <div className="text-right">
            <p className="text-[13px] font-bold text-gray-700">{yyyy}년 {mm}월분</p>
            {paymentDate && (
              <p className="mt-0.5 text-[11px] text-gray-400">지급일 {paymentDate}</p>
            )}
          </div>
        </div>

        {/* ── 인적사항 ── */}
        <div className="grid grid-cols-3 gap-px border-b border-gray-200 bg-gray-200 px-0">
          {[
            { label: '성명', value: user.name },
            { label: '소속', value: user.department },
            { label: '직위', value: user.position },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white px-5 py-3">
              <p className="text-[10px] font-bold tracking-wide text-gray-400">{label}</p>
              <p className="mt-0.5 text-[13px] font-bold text-black">{value || '-'}</p>
            </div>
          ))}
        </div>

        {/* ── 지급 / 공제 테이블 ── */}
        <div className="flex flex-1 border-b border-gray-200">
          {/* 지급 */}
          <div className="flex flex-1 flex-col border-r border-gray-200">
            <div className="border-b border-gray-200 bg-[#1a2744] px-5 py-2.5 text-center">
              <span className="text-[11px] font-black tracking-widest text-white uppercase">
                지 급 내 역
              </span>
            </div>
            <div className="flex flex-1 flex-col px-5 py-2">
              {baseEarnings.map((item, i) => (
                <SlipRow key={i} label={item.label} amount={item.amount} taxFree={item.taxFree} />
              ))}
              {Array.from({ length: Math.max(0, maxRows - baseEarnings.length) }).map((_, i) => (
                <div key={`ep-${i}`} className="border-b border-gray-100 py-[9px]" />
              ))}
            </div>
            <div className="border-t border-gray-300 bg-gray-50 px-5 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-500">지급 합계</span>
                <span className="text-[15px] font-black text-[#1a2744]">
                  {totalPayment.toLocaleString('ko-KR')} 원
                </span>
              </div>
            </div>
          </div>

          {/* 공제 */}
          <div className="flex flex-1 flex-col">
            <div className="border-b border-gray-200 bg-[#7f1d1d] px-5 py-2.5 text-center">
              <span className="text-[11px] font-black tracking-widest text-white uppercase">
                공 제 내 역
              </span>
            </div>
            <div className="flex flex-1 flex-col px-5 py-2">
              {baseDeductions.map((item, i) => (
                <SlipRow key={i} label={item.label} amount={item.amount} isDeduction />
              ))}
              {Array.from({ length: Math.max(0, maxRows - baseDeductions.length) }).map((_, i) => (
                <div key={`dp-${i}`} className="border-b border-gray-100 py-[9px]" />
              ))}
            </div>
            <div className="border-t border-gray-300 bg-gray-50 px-5 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-500">공제 합계</span>
                <span className="text-[15px] font-black text-red-800">
                  {totalDeduction.toLocaleString('ko-KR')} 원
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 실수령액 ── */}
        <div className="flex items-center justify-between bg-[#1a2744] px-7 py-5">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-blue-300 uppercase">
              Net Pay
            </p>
            <p className="mt-0.5 text-[13px] font-bold text-white">실 수 령 액</p>
          </div>
          <p className="text-[32px] font-black tracking-tight text-white">
            {netPay.toLocaleString('ko-KR')}
            <span className="ml-1.5 text-[18px] font-bold text-blue-300">원</span>
          </p>
        </div>

        {/* ── 푸터 / 직인 ── */}
        <div className="flex items-center justify-between border-t border-gray-200 px-7 pb-6 pt-4">
          <p className="text-[11px] text-gray-400">
            위와 같이 급여가 정히 지급되었음을 통지합니다.
          </p>
          <div className="relative flex items-center gap-3">
            <p className="text-[14px] font-black tracking-[0.2em] text-black">
              {user.company || 'SY INC.'}
            </p>
            {sealUrl ? (
              <img
                src={sealUrl}
                alt="직인"
                className="absolute -right-10 -top-3 h-16 w-16 object-contain mix-blend-multiply"
              />
            ) : (
              <div className="absolute -right-10 -top-3 flex h-16 w-16 rotate-12 items-center justify-center rounded-full border-4 border-double border-red-700 opacity-70 mix-blend-multiply">
                <span className="text-center text-[9px] font-bold leading-tight text-red-700">
                  {user.company || 'SY INC.'}
                  <br />(인)
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SlipRow({
  label,
  amount,
  taxFree = false,
  isDeduction = false,
}: {
  label: string;
  amount: number;
  taxFree?: boolean;
  isDeduction?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-[9px] last:border-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-semibold text-gray-700">{label}</span>
        {taxFree && (
          <span className="rounded px-1 py-0.5 text-[9px] font-bold text-blue-600 bg-blue-50">
            비과세
          </span>
        )}
      </div>
      <span
        className={`text-[12px] font-bold tabular-nums ${
          isDeduction ? 'text-red-700' : 'text-gray-900'
        }`}
      >
        {amount.toLocaleString('ko-KR')} 원
      </span>
    </div>
  );
}
```

---

## 변경 사항 요약

| 항목 | 이전 | 이후 |
|------|------|------|
| 방향 | 가로형 (landscape) | 세로형 A4 (portrait) |
| 수당 추가 | 하드코딩 4개 | `extraEarnings[]` 배열로 가변 |
| 공제 추가 | 하드코딩 4개 | `extraDeductions[]` 배열로 가변 |
| 행 높이 | py-2.5 | py-[9px] (compact, 10+개 수용) |
| 숫자 포맷 | `.toLocaleString()` | `.toLocaleString('ko-KR')` |
| `₩` 기호 | 사용 | `원` 으로 통일 |
| 배경 | var(--card) | `bg-white` (인쇄 전용) |
| 0원 수당 | 항상 표시 | `> 0`인 경우만 표시 (overtime, bonus) |

---

## 부모 컴포넌트에서 새 props 활용 예시

```tsx
// 추가 수당이 있을 때만 넘기면 됨 — 없으면 기본 항목만 출력
<SalarySlipUI
  user={user}
  currentDate={currentDate}
  salaryData={salaryData}
  totalPayment={totalPayment}
  totalDeduction={totalDeduction}
  paymentDate="2025-05-25"
  extraEarnings={[
    { label: '직책수당', amount: 50000 },
    { label: '자격수당', amount: 30000 },
    { label: '야간수당', amount: 80000, taxFree: false },
  ]}
/>
```

---

## 검증

```bash
npx tsc --noEmit
npm run build
```

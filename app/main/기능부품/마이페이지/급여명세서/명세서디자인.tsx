'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

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
};

type SalarySlipUIProps = {
  user: UserInfo;
  currentDate: Date;
  salaryData: SalaryData | null;
  totalPayment: number;
  totalDeduction: number;
};

export default function SalarySlipUI({ user, currentDate, salaryData, totalPayment, totalDeduction }: SalarySlipUIProps) {
  const [sealUrl, setSealUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.company) return;
    supabase.from('contract_templates').select('seal_url').eq('company_name', user.company).maybeSingle().then(({ data }) => {
      if (data?.seal_url) setSealUrl(data.seal_url as string);
    });
  }, [user?.company]);
  if (!salaryData) return null;
  const realPayment = totalPayment - totalDeduction;

  return (
    // [핵심] 고정폭(210mm) 제거 -> w-full로 변경하여 프린터 여백에 유동적 대응
    <div className="w-full max-w-[210mm] mx-auto bg-white text-black p-5 print:p-5 box-border flex flex-col h-full min-h-[280mm]">
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
        }
      `}</style>
      {/* 1. 헤더 */}
      <div className="text-center border-b-4 border-double border-[var(--foreground)] pb-5 mb-5">
        <h1 className="text-4xl font-semibold tracking-[0.5em] text-[var(--foreground)] mb-2">급 여 명 세 서</h1>
        <p className="text-xs font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">
          {currentDate.getFullYear()}년 {String(currentDate.getMonth() + 1).padStart(2, '0')}월분 (Salary Statement)
        </p>
      </div>

      {/* 2. 인적 사항 */}
      <div className="mb-5">
        <table className="w-full text-sm border-collapse border-2 border-[var(--foreground)]">
          <tbody>
            <tr className="bg-[var(--muted)]">
              <th className="p-3 border border-[var(--border)] w-[10%] font-semibold text-center text-[var(--foreground)]">성 명</th>
              <td className="p-3 border border-[var(--border)] w-[23%] text-center font-bold text-base bg-white">{user.name}</td>
              <th className="p-3 border border-[var(--border)] w-[10%] font-semibold text-center text-[var(--foreground)]">소 속</th>
              <td className="p-3 border border-[var(--border)] w-[23%] text-center font-bold text-base bg-white">{user.department}</td>
              <th className="p-3 border border-[var(--border)] w-[10%] font-semibold text-center text-[var(--foreground)]">직 위</th>
              <td className="p-3 border border-[var(--border)] w-[24%] text-center font-bold text-base bg-white">{user.position}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 3. 상세 내역 (가변 높이) */}
      <div className="flex gap-4 mb-5 flex-1">
        {/* 지급 내역 */}
        <div className="flex-1 border-2 border-[var(--accent)] rounded-[var(--radius-md)] overflow-hidden flex flex-col">
          <div className="bg-[var(--accent)] p-2.5 text-center text-white font-semibold text-sm">지급 내역 (EARNINGS)</div>
          <div className="flex-1 p-4 bg-white">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--border)]">
                <TableRow label="기 본 급" value={salaryData.base_salary} />
                <TableRow label="연장근로수당" value={salaryData.overtime_pay} />
                <TableRow label="식 대" value={100000} />
                <TableRow label="상 여 금" value={salaryData.bonus} />
              </tbody>
            </table>
          </div>
          <div className="bg-[var(--toss-blue-light)] p-3 border-t-2 border-[var(--accent)] flex justify-between items-center font-semibold text-[var(--accent)]">
            <span className="text-xs">지급 합계</span>
            <span className="text-lg">₩ {totalPayment.toLocaleString()}</span>
          </div>
        </div>

        {/* 공제 내역 */}
        <div className="flex-1 border-2 border-red-900 rounded-[var(--radius-md)] overflow-hidden flex flex-col">
          <div className="bg-red-900 p-2.5 text-center text-white font-semibold text-sm">공제 내역 (DEDUCTIONS)</div>
          <div className="flex-1 p-4 bg-white">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--border)]">
                <TableRow label="국민연금" value={salaryData.national_pension} />
                <TableRow label="건강보험" value={salaryData.health_insurance} />
                <TableRow label="장기요양/고용" value={Math.floor(salaryData.health_insurance * 0.1281) + Math.floor(totalPayment * 0.009)} />
                <TableRow label="소득세/지방세" value={salaryData.income_tax + Math.floor(salaryData.income_tax * 0.1)} />
              </tbody>
            </table>
          </div>
          <div className="bg-red-50 p-3 border-t-2 border-red-900 flex justify-between items-center font-semibold text-red-900">
            <span className="text-xs">공제 합계</span>
            <span className="text-lg">₩ {totalDeduction.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 4. 실 수령액 */}
      <div className="mb-10 p-4 bg-[var(--foreground)] text-white rounded-[var(--radius-lg)] flex justify-between items-center shadow-sm border-l-[12px] border-[var(--accent)]">
        <div>
          <p className="text-xs font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">총 지급액</p>
          <p className="text-sm font-semibold text-[var(--muted)]">차인 지급액 (실 수령액)</p>
        </div>
        <p className="text-4xl font-semibold tracking-tight">
          ₩ {realPayment.toLocaleString()}
        </p>
      </div>

      {/* 5. 하단 직인 – 회사명 옆에 직인 공통 배치 */}
      <div className="text-center mt-auto pb-4">
        <p className="text-sm font-bold text-[var(--toss-gray-4)] mb-4">위와 같이 급여가 정히 지급되었음을 통지합니다.</p>
        <div className="relative inline-flex items-center gap-4 justify-center">
          <h2 className="text-3xl font-semibold text-[var(--foreground)] tracking-[0.4em] relative z-10 whitespace-nowrap">
            {user.company || '박철홍정형외과'}
          </h2>
          {sealUrl ? (
            <img src={sealUrl} alt="사업자 직인" className="absolute -right-16 -top-2 w-20 h-20 object-contain mix-blend-multiply" />
          ) : (
            <div className="absolute -right-16 -top-2 w-20 h-20 border-[5px] border-red-600 rounded-full flex items-center justify-center text-red-600 font-semibold text-base rotate-12 opacity-80 border-double mix-blend-multiply">
              <span className="text-[11px] leading-tight text-center">
                {user.company || '박철홍정형외과'}
                <br />
                (인)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TableRow({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <td className="py-2.5 text-[var(--toss-gray-4)] font-bold">{label}</td>
      <td className="py-2.5 text-right text-[var(--foreground)] font-semibold text-base">₩{(value ?? 0).toLocaleString()}</td>
    </tr>
  );
}

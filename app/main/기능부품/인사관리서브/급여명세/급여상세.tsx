'use client';
import React from 'react';

export default function SalaryDetail({ record, staff }: any) {
  // record가 없을 경우 staff 정보를 기반으로 가상 계산 (미리보기용)
  const data = record || {
    base_salary: staff?.base_salary || 0,
    meal_allowance: staff?.meal_allowance || 0,
    night_duty_allowance: record?.night_duty_allowance ?? staff?.night_duty_allowance ?? 0,
    vehicle_allowance: staff?.vehicle_allowance || 0,
    childcare_allowance: staff?.childcare_allowance || 0,
    research_allowance: staff?.research_allowance || 0,
    other_taxfree: staff?.other_taxfree || 0,
    extra_allowance: 0,
    overtime_pay: 0,
    bonus: 0,
    year_month: new Date().toISOString().slice(0, 7)
  };

  // 실시간 계산 로직 (record가 없을 때만 사용)
  const calculateTotals = () => {
    const taxable = Number(data.base_salary) + Number(data.extra_allowance) + Number(data.overtime_pay) + Number(data.bonus);
    const taxfree = Number(data.meal_allowance) + Number(data.night_duty_allowance || 0) + Number(data.vehicle_allowance) + Number(data.childcare_allowance) + Number(data.research_allowance) + Number(data.other_taxfree);
    
    const pension = Math.floor(taxable * 0.045);
    const health = Math.floor(taxable * 0.03545);
    const longTerm = Math.floor(health * 0.1295);
    const employment = Math.floor(taxable * 0.009);
    const incomeTax = Math.floor(taxable * 0.03);
    const localTax = Math.floor(incomeTax * 0.1);
    
    const totalDeduction = pension + health + longTerm + employment + incomeTax + localTax;
    const totalPayment = taxable + taxfree;
    
    return {
      taxable, taxfree, totalPayment, totalDeduction,
      pension, health, longTerm, employment, incomeTax, localTax,
      net: totalPayment - totalDeduction
    };
  };

  const dd = record?.deduction_detail;
  const calc = record ? {
    taxable: record.total_taxable,
    taxfree: record.total_taxfree,
    totalPayment: record.total_taxable + record.total_taxfree,
    totalDeduction: record.total_deduction,
    pension: dd?.national_pension ?? record.national_pension ?? Math.floor(record.total_taxable * 0.045),
    health: dd?.health_insurance ?? record.health_insurance ?? Math.floor(record.total_taxable * 0.03545),
    longTerm: dd?.long_term_care ?? record.long_term_care ?? 0,
    employment: dd?.employment_insurance ?? record.employment_insurance ?? Math.floor(record.total_taxable * 0.009),
    incomeTax: dd?.income_tax ?? record.income_tax ?? Math.floor(record.total_taxable * 0.03),
    localTax: dd?.local_tax ?? record.local_tax ?? 0,
    net: record.net_pay
  } : calculateTotals();

  const companyName = staff?.company || 'SY INC.';
  const ym = String(data.year_month || new Date().toISOString().slice(0, 7));
  const [y, m] = ym.split('-');
  const monthLabel = `${y}년 ${Number(m || '1')}월`;
  const isAdvancePay = !!(record && (Number(record.advance_pay) || 0) > 0);
  const advancePayAmount = record ? Number(record.advance_pay) || 0 : 0;

  return (
    <div className="bg-[var(--toss-card)] rounded-lg border border-[var(--toss-border)] shadow-sm overflow-hidden animate-in fade-in duration-300">
      {/* 명세서 헤더 – 메디플로우 스타일: 연한 띠 + 제목 */}
      <div className="px-6 py-5 bg-[var(--tab-bg)] border-b border-[var(--toss-border)]">
        <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">{companyName}</p>
        <h2 className="text-lg font-bold text-[var(--foreground)]">
          {monthLabel} 급여명세서 {isAdvancePay && <span className="text-amber-700">(선지급)</span>}
        </h2>
      </div>

      <div className="p-6 space-y-6">
        {/* 인적 사항 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-[var(--page-bg)] rounded-lg border border-[var(--toss-border)]">
          <div>
            <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-0.5">성명</p>
            <p className="text-sm font-semibold text-[var(--foreground)]">{staff?.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-0.5">사번</p>
            <p className="text-sm font-semibold text-[var(--foreground)]">{staff?.employee_no}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-0.5">부서</p>
            <p className="text-sm font-semibold text-[var(--foreground)]">{staff?.department}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-0.5">직위</p>
            <p className="text-sm font-semibold text-[var(--foreground)]">{staff?.position}</p>
          </div>
        </div>

        {/* 지급/공제 상세 내역 – 선지급 건은 본급·공제 0원, 선지급 금액만 표시 */}
        {isAdvancePay ? (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-medium text-amber-800 mb-2">선지급 (본 건은 선지급 건입니다. 본급·공제·차인 0원)</p>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-[var(--foreground)]">선지급</span>
                <span className="text-lg font-semibold text-amber-700">₩ {advancePayAmount.toLocaleString()}</span>
              </div>
            </div>
            <div className="pt-4 border-t border-[var(--toss-border)] text-center">
              <p className="text-xs text-[var(--toss-gray-3)] mb-1">차인지급액 (선지급)</p>
              <p className="text-xl font-bold text-[var(--toss-blue)]">₩ {advancePayAmount.toLocaleString()}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 지급 내역 */}
              <div className="space-y-3 border border-[var(--toss-border)] rounded-lg overflow-hidden">
                <div className="flex justify-between items-center px-4 py-2.5 bg-[var(--tab-bg)] border-b border-[var(--toss-border)]">
                  <h4 className="text-xs font-semibold text-[var(--foreground)]">지급 내역</h4>
                  <span className="text-xs font-medium text-[var(--toss-blue)]">지급합계 ₩{calc.totalPayment.toLocaleString()}</span>
                </div>
                <div className="p-4 space-y-2">
                  <SalaryRow label="기본급" value={data.base_salary} />
                  {data.extra_allowance > 0 && <SalaryRow label="기타 수당" value={data.extra_allowance} />}
                  {data.overtime_pay > 0 && <SalaryRow label="연장근로수당" value={data.overtime_pay} />}
                  <div className="pt-2 mt-2 border-t border-[var(--toss-border)] space-y-2">
                    <p className="text-[10px] font-medium text-green-700">비과세 항목</p>
                    <SalaryRow label="식대" value={data.meal_allowance} isTaxFree />
                    {(data.night_duty_allowance || 0) > 0 && <SalaryRow label="당직수당(야간)" value={data.night_duty_allowance} isTaxFree />}
                    {data.vehicle_allowance > 0 && <SalaryRow label="자가운전보조금" value={data.vehicle_allowance} isTaxFree />}
                    {data.childcare_allowance > 0 && <SalaryRow label="보육수당" value={data.childcare_allowance} isTaxFree />}
                    {data.research_allowance > 0 && <SalaryRow label="연구활동비" value={data.research_allowance} isTaxFree />}
                  </div>
                </div>
              </div>

              {/* 공제 내역 */}
              <div className="space-y-3 border border-[var(--toss-border)] rounded-lg overflow-hidden">
                <div className="flex justify-between items-center px-4 py-2.5 bg-[#fef2f2] border-b border-red-100">
                  <h4 className="text-xs font-semibold text-[var(--foreground)]">공제 내역</h4>
                  <span className="text-xs font-medium text-red-600">공제합계 ₩{calc.totalDeduction.toLocaleString()}</span>
                </div>
                <div className="p-4 space-y-2">
                  <SalaryRow label="국민연금" value={calc.pension} isDeduction />
                  <SalaryRow label="건강보험" value={calc.health} isDeduction />
                  <SalaryRow label="장기요양보험" value={calc.longTerm} isDeduction />
                  <SalaryRow label="고용보험" value={calc.employment} isDeduction />
                  <SalaryRow label="소득세" value={calc.incomeTax} isDeduction />
                  <SalaryRow label="지방소득세" value={calc.localTax} isDeduction />
                </div>
              </div>
            </div>

            {/* 차인지급액 */}
            <div className="pt-4 border-t-2 border-[var(--toss-border)] text-center">
              <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">차인지급액</p>
              <p className="text-xl font-bold text-[var(--toss-blue)]">₩ {calc.net.toLocaleString()}</p>
            </div>
          </>
        )}

        {/* 하단 안내 및 직인 */}
        <div className="pt-6 border-t border-[var(--toss-border)] flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-[var(--toss-gray-3)] leading-relaxed text-center md:text-left">
            * 본 명세서는 법적 효력을 갖는 전자 문서입니다. · 급여 문의: 경영지원팀
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[var(--toss-gray-4)]">{staff?.company || 'SY INC.'} 대표원장</span>
            <span className="w-10 h-10 border-2 border-[var(--toss-border)] rounded flex items-center justify-center text-[10px] text-[var(--toss-gray-3)] font-medium">(인)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SalaryRow({ label, value, isDeduction, isTaxFree }: any) {
  return (
    <div className="flex justify-between items-center py-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--toss-gray-4)]">{label}</span>
        {isTaxFree && <span className="text-[10px] font-medium text-[var(--toss-blue)] bg-[var(--toss-blue-light)] px-1.5 py-0.5 rounded">비과세</span>}
      </div>
      <span className={`text-sm font-medium ${isDeduction ? 'text-red-600' : 'text-[var(--foreground)]'}`}>
        {isDeduction ? '-' : ''} ₩{(Number(value) || 0).toLocaleString()}
      </span>
    </div>
  );
}

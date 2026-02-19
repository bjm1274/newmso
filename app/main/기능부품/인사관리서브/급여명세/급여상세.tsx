'use client';
import React from 'react';

export default function SalaryDetail({ record, staff }: any) {
  // record가 없을 경우 staff 정보를 기반으로 가상 계산 (미리보기용)
  const data = record || {
    base_salary: staff?.base_salary || 0,
    meal_allowance: staff?.meal_allowance || 0,
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
    const taxfree = Number(data.meal_allowance) + Number(data.vehicle_allowance) + Number(data.childcare_allowance) + Number(data.research_allowance) + Number(data.other_taxfree);
    
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

  const calc = record ? {
    taxable: record.total_taxable,
    taxfree: record.total_taxfree,
    totalPayment: record.total_taxable + record.total_taxfree,
    totalDeduction: record.total_deduction,
    pension: record.national_pension || Math.floor(record.total_taxable * 0.045),
    health: record.health_insurance || Math.floor(record.total_taxable * 0.03545),
    longTerm: record.long_term_care || 0,
    employment: record.employment_insurance || Math.floor(record.total_taxable * 0.009),
    incomeTax: record.income_tax || Math.floor(record.total_taxable * 0.03),
    localTax: record.local_tax || 0,
    net: record.net_pay
  } : calculateTotals();

  return (
    <div className="bg-white border border-gray-100 shadow-2xl rounded-[2.5rem] overflow-hidden animate-in fade-in zoom-in duration-700">
      {/* 명세서 헤더 (마이페이지 스타일) */}
      <div className="p-8 md:p-10 bg-gray-900 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="px-3 py-1 bg-blue-600 text-white text-[10px] font-black rounded-lg uppercase tracking-widest">{staff?.company || 'SY INC.'}</span>
            {(() => {
              const ym = String(data.year_month || new Date().toISOString().slice(0, 7));
              const [y, m] = ym.split('-');
              const monthLabel = `${y}-${Number(m || '1')}월`;
              return (
                <h3 className="text-2xl font-black tracking-tighter italic">
                  {monthLabel} 급여명세서
                </h3>
              );
            })()}
          </div>
          {/* 보조 설명 문구는 간단히 한국어만 표기 */}
          <p className="text-xs font-bold text-gray-400">해당 월 급여 내역</p>
        </div>
        <div className="text-left md:text-right">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">실 수령액 (Net Pay)</p>
          <p className="text-4xl font-black text-blue-400 tracking-tighter">₩ {calc.net.toLocaleString()}</p>
        </div>
      </div>

      <div className="p-8 md:p-10 space-y-10">
        {/* 인적 사항 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6 bg-gray-50 rounded-2xl border border-gray-100">
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">성명</p>
            <p className="text-sm font-black text-gray-900">{staff?.name}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">사번</p>
            <p className="text-sm font-black text-gray-900">{staff?.employee_no}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">부서</p>
            <p className="text-sm font-black text-gray-900">{staff?.department}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">직위</p>
            <p className="text-sm font-black text-gray-900">{staff?.position}</p>
          </div>
        </div>

        {/* 지급/공제 상세 내역 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* 지급 내역 */}
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b-2 border-gray-900">
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">지급 내역 (Earnings)</h4>
              <span className="text-[10px] font-bold text-blue-600">Total: ₩{calc.totalPayment.toLocaleString()}</span>
            </div>
            <div className="space-y-3">
              <SalaryRow label="기본급" value={data.base_salary} />
              {data.extra_allowance > 0 && <SalaryRow label="기타 수당" value={data.extra_allowance} />}
              {data.overtime_pay > 0 && <SalaryRow label="연장근로수당" value={data.overtime_pay} />}
              <div className="pt-2 mt-2 border-t border-gray-50 space-y-2">
                <p className="text-[8px] font-black text-green-600 uppercase">비과세 항목 (Tax-Free)</p>
                <SalaryRow label="식대" value={data.meal_allowance} isTaxFree />
                {data.vehicle_allowance > 0 && <SalaryRow label="자가운전보조금" value={data.vehicle_allowance} isTaxFree />}
                {data.childcare_allowance > 0 && <SalaryRow label="보육수당" value={data.childcare_allowance} isTaxFree />}
                {data.research_allowance > 0 && <SalaryRow label="연구활동비" value={data.research_allowance} isTaxFree />}
              </div>
            </div>
          </div>

          {/* 공제 내역 */}
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b-2 border-red-600">
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">공제 내역 (Deductions)</h4>
              <span className="text-[10px] font-bold text-red-600">Total: ₩{calc.totalDeduction.toLocaleString()}</span>
            </div>
            <div className="space-y-3">
              <SalaryRow label="국민연금" value={calc.pension} isDeduction />
              <SalaryRow label="건강보험" value={calc.health} isDeduction />
              <SalaryRow label="고용보험" value={calc.employment} isDeduction />
              <SalaryRow label="소득세/지방세" value={calc.incomeTax + (calc.localTax || 0)} isDeduction />
            </div>
          </div>
        </div>

        {/* 하단 안내 및 직인 */}
        <div className="pt-10 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-[11px] font-bold text-gray-400 leading-relaxed text-center md:text-left">
            * 본 명세서는 법적 효력을 갖는 전자 문서입니다.<br/>
            * 급여 관련 문의는 SY INC. 경영지원팀으로 연락 바랍니다.
          </p>
          <div className="relative flex items-center gap-4">
            <p className="text-sm font-black text-gray-900 tracking-widest">{staff?.company || 'SY INC.'} 대표원장</p>
            <div className="w-14 h-14 border-4 border-red-600/30 rounded-full flex items-center justify-center text-red-600/50 font-black text-[10px] rotate-12 border-double">
              (인)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SalaryRow({ label, value, isDeduction, isTaxFree }: any) {
  return (
    <div className="flex justify-between items-center group">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-gray-500 group-hover:text-gray-900 transition-colors">{label}</span>
        {isTaxFree && <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">비과세</span>}
      </div>
      <span className={`text-sm font-black ${isDeduction ? 'text-red-500' : 'text-gray-900'}`}>
        {isDeduction ? '-' : ''} ₩{(Number(value) || 0).toLocaleString()}
      </span>
    </div>
  );
}

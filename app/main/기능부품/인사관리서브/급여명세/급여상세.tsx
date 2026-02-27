import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import ContractPreview from '../계약문서/계약서미리보기';
import { supabase } from '@/lib/supabase';

function InfoItem({ label, value, highlight }: any) {
  return (
    <div>
      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-1 uppercase tracking-widest">{label}</p>
      <p className={`text-sm font-bold ${highlight ? 'text-[var(--toss-blue)]' : 'text-[var(--foreground)]'}`}>{value || '-'}</p>
    </div>
  );
}

function SalaryRow({ label, value, isDeduction, isTaxFree, note }: any) {
  return (
    <div className="py-2 print:py-1 border-b border-gray-50 last:border-0">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-[var(--toss-gray-4)]">{label}</span>
          {isTaxFree && <span className="text-[9px] font-black tracking-tighter text-[var(--toss-blue)] bg-blue-50 px-1.5 py-0.5 rounded uppercase">Non-Taxable</span>}
        </div>
        <span className={`text-sm font-extrabold tracking-tight ${isDeduction ? 'text-red-600' : 'text-[var(--foreground)]'}`}>
          {isDeduction ? '-' : ''} ₩{(Number(value) || 0).toLocaleString()}
        </span>
      </div>
      {note && (
        <div className="mt-1 ml-1 text-[10px] text-[var(--toss-gray-3)] font-medium leading-relaxed flex items-start gap-1">
          <span className="opacity-50">└</span>
          <span>{note}</span>
        </div>
      )}
    </div>
  );
}

export default function SalaryDetail({ record, staff }: any) {
  const [showContract, setShowContract] = useState(false);
  const [companySeal, setCompanySeal] = useState<string | null>(null);

  // 회사 직인 자동 연동
  useEffect(() => {
    const fetchSeal = async () => {
      const companyName = staff?.company || 'SY INC.';
      if (!companyName) return;

      const { data: tmpl } = await supabase
        .from('contract_templates')
        .select('seal_url')
        .eq('company_name', companyName)
        .maybeSingle();

      if (tmpl?.seal_url) {
        setCompanySeal(tmpl.seal_url);
      } else {
        // Fallback to companies table if not in template
        const { data: co } = await supabase
          .from('companies')
          .select('seal_url')
          .eq('name', companyName)
          .maybeSingle();
        setCompanySeal(co?.seal_url || null);
      }
    };
    fetchSeal();
  }, [staff?.company]);

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
      net: totalPayment - totalDeduction,
      deductionDetail: { national_pension: pension, health_insurance: health, long_term_care: longTerm, employment_insurance: employment, income_tax: incomeTax, local_tax: localTax, custom_deduction: 0 }
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
    net: record.net_pay,
    deductionDetail: dd || {
      national_pension: record.national_pension,
      health_insurance: record.health_insurance,
      long_term_care: record.long_term_care,
      employment_insurance: record.employment_insurance,
      income_tax: record.income_tax,
      local_tax: record.local_tax,
      custom_deduction: 0
    }
  } : calculateTotals();

  const companyName = staff?.company || 'SY INC.';
  const ym = String(data.year_month || new Date().toISOString().slice(0, 7));
  const [y, m] = ym.split('-');
  const monthLabel = `${y}년 ${Number(m || '1')}월`;
  const isAdvancePay = !!(record && (Number(record.advance_pay) || 0) > 0);
  const advancePayAmount = record ? Number(record.advance_pay) || 0 : 0;

  // 시급 계산 (기본급 / 월 소정근로시간 209시간 기준 또는 근태룰 기준)
  const hourlyRate = Math.floor((Number(data.base_salary) || 0) / 209);

  return (
    <div className="bg-white rounded-[24px] border border-[var(--toss-border)] shadow-xl print:shadow-md overflow-hidden animate-in fade-in zoom-in-95 duration-500 w-full max-w-7xl print:max-w-none print:w-full mx-auto mb-10 print:mb-0">
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
        }
      `}</style>
      {/* 프리미엄 헤더 */}
      <div className="px-8 py-10 print:py-6 bg-gradient-to-br from-[var(--toss-blue)] to-indigo-700 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl" />
        <div className="relative z-10 flex justify-between items-end">
          <div>
            <p className="text-sm font-bold opacity-80 mb-2 uppercase tracking-widest">{companyName} Payroll Service</p>
            <h2 className="text-3xl font-extrabold tracking-tight">
              {monthLabel} 급여명세서
            </h2>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold opacity-70 mb-1">차인 지급액 (실 수령액)</p>
            <p className="text-4xl font-black italic">₩ {isAdvancePay ? advancePayAmount.toLocaleString() : calc.net.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="p-8 print:py-4 print:px-8 space-y-10 print:space-y-4">
        {/* 인적 사항 & 시급 정보 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 print:grid-cols-6 gap-6 p-6 print:py-4 print:px-6 bg-[var(--toss-gray-1)] rounded-[20px] border border-[var(--toss-border)]">
          <InfoItem label="성명" value={staff?.name} />
          <InfoItem label="사번" value={staff?.employee_no || staff?.id} />
          <InfoItem label="입사일" value={staff?.join_date} />
          <InfoItem label="소속" value={staff?.department} />
          <InfoItem label="직위" value={staff?.position} />
          <InfoItem label="책정시급" value={`₩ ${hourlyRate.toLocaleString()}`} highlight />
        </div>

        {/* 지급/공제 상세 내역 – 선지급 건은 본급·공제 0원, 선지급 금액만 표시 */}
        {isAdvancePay ? (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-[12px]">
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

            <div className="grid grid-cols-1 lg:grid-cols-2 print:grid-cols-2 gap-8 print:gap-x-8 print:gap-y-4 flex-1">
              {/* 지급 내역 */}
              <div className="space-y-4">
                <div className="flex justify-between items-end px-1">
                  <h4 className="text-sm font-bold text-[var(--foreground)]">지급 내역 (EARNINGS)</h4>
                  <span className="text-xs font-bold text-[var(--toss-blue)]">지급합계 ₩{calc.totalPayment.toLocaleString()}</span>
                </div>
                <div className="bg-white border-2 border-[var(--toss-blue)] rounded-[16px] overflow-hidden">
                  <div className="p-5 print:py-3 print:px-5 space-y-3 print:space-y-1.5">
                    <SalaryRow label="기본급" value={data.base_salary} note="계약된 월 고정 급여" />
                    {data.overtime_pay > 0 && (
                      <SalaryRow
                        label="연장근로수당"
                        value={data.overtime_pay}
                        note={`산출근거: [${hourlyRate.toLocaleString()}원(시급) × 1.5(가산)] × ${((Number(data.overtime_pay) || 0) / (hourlyRate * 1.5)).toFixed(1)}시간`}
                      />
                    )}
                    {data.bonus > 0 && <SalaryRow label="상여금" value={data.bonus} note="성과 및 상여 지급분" />}
                    {data.extra_allowance > 0 && <SalaryRow label="기타 수당" value={data.extra_allowance} note="직책/자격 등 기타 법정외 수당" />}

                    <div className="pt-3 mt-3 border-t border-blue-100 space-y-3">
                      <p className="text-[11px] font-bold text-blue-600 uppercase tracking-tighter">Tax-Free Benefits (비과세)</p>
                      <SalaryRow label="식대" value={data.meal_allowance} isTaxFree note="월 20만원 한도 비과세" />
                      {(data.night_duty_allowance || 0) > 0 && <SalaryRow label="당직수당(야간)" value={data.night_duty_allowance} isTaxFree note="당직/야간 근무에 따른 비과세 수당" />}
                      {data.vehicle_allowance > 0 && <SalaryRow label="자가운전보조금" value={data.vehicle_allowance} isTaxFree note="월 20만원 한도 비과세(본인명의 차량)" />}
                      {data.childcare_allowance > 0 && <SalaryRow label="보육수당" value={data.childcare_allowance} isTaxFree note="6세 이하 자녀 보육 비과세" />}
                      {data.research_allowance > 0 && <SalaryRow label="연구활동비" value={data.research_allowance} isTaxFree note="연구활동 목적의 비과세 수당" />}
                    </div>
                  </div>
                </div>
              </div>

              {/* 공제 내역 */}
              <div className="space-y-4">
                <div className="flex justify-between items-end px-1">
                  <h4 className="text-sm font-bold text-[var(--foreground)]">공제 내역 (DEDUCTIONS)</h4>
                  <span className="text-xs font-bold text-red-600">공제합계 ₩{calc.totalDeduction.toLocaleString()}</span>
                </div>
                <div className="bg-white border-2 border-red-900 rounded-[16px] overflow-hidden">
                  <div className="p-5 print:py-3 print:px-5 space-y-3 print:space-y-1.5">
                    <SalaryRow label="국민연금" value={calc.pension} isDeduction />
                    <SalaryRow label="건강보험" value={calc.health} isDeduction />
                    <SalaryRow label="장기요양보험" value={calc.longTerm} isDeduction />
                    <SalaryRow label="고용보험" value={calc.employment} isDeduction />
                    <SalaryRow label="소득세" value={calc.incomeTax} isDeduction />
                    <SalaryRow label="지방소득세" value={calc.localTax} isDeduction />
                    {calc.deductionDetail?.custom_deduction > 0 && <SalaryRow label="기타 공제" value={calc.deductionDetail.custom_deduction} isDeduction />}
                  </div>
                </div>
              </div>
            </div>

          </>
        )}

        {/* 하단 안내 및 직인 */}
        <div className="pt-10 print:pt-4 border-t border-[var(--toss-border)] flex flex-col md:flex-row print:flex-row justify-between items-center print:items-end gap-6 print:gap-2">
          <div className="space-y-1 text-center md:text-left print:text-left">
            <p className="text-[11px] font-bold text-[var(--toss-gray-3)] leading-relaxed">
              * 본 명세서는 근로기준법 제48조 제2항에 의거하여 지급되는 정식 급여명세서입니다.
            </p>
            <p className="text-[10px] text-[var(--toss-gray-3)] opacity-60">
              Generated: {new Date().toLocaleString()} · 전자문서 확인번호: PAY-{crypto.randomUUID().split('-')[0].toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-3xl font-black text-[var(--foreground)] tracking-tighter">{companyName}</p>
            </div>
            {companySeal ? (
              <div className="relative w-16 h-16 flex items-center justify-center">
                <img src={companySeal} alt="회사직인" className="w-14 h-14 object-contain opacity-90 mix-blend-multiply rotate-12" />
              </div>
            ) : (
              <div className="w-16 h-16 border-4 border-double border-red-600 rounded-full flex items-center justify-center text-red-600 font-black text-sm rotate-12 opacity-80 mix-blend-multiply">
                (인)
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}


function ContractModal({ isOpen, onClose, staff }: any) {
  const [contract, setContract] = useState<any>(null);

  useEffect(() => {
    if (!isOpen || !staff?.id) return;
    const fetchContract = async () => {
      const { data } = await supabase
        .from('employment_contracts')
        .select('*')
        .eq('staff_id', staff.id)
        .eq('status', '서명완료')
        .maybeSingle();
      setContract(data);
    };
    fetchContract();
  }, [isOpen, staff?.id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-4xl h-full max-h-[90vh] rounded-[24px] shadow-2xl flex flex-col overflow-hidden border-2 border-[var(--toss-border)]">
        <div className="p-4 border-b border-[var(--toss-border)] flex justify-between items-center bg-slate-50">
          <h3 className="text-sm font-bold text-[var(--foreground)]">내 근로계약서 확인</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-10 scroll-smooth custom-scrollbar bg-[var(--page-bg)]">
          <div className="max-w-[800px] mx-auto">
            {contract ? (
              <ContractPreview staff={staff} contract={contract} />
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-4">
                <span className="text-4xl text-slate-200">📋</span>
                <p className="text-sm font-bold">서명 완료된 계약서가 없습니다.</p>
                <button onClick={onClose} className="text-xs font-bold text-[var(--toss-blue)] underline">닫기</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function SalarySettlement({ staffs, selectedCo, onRefresh }: any) {
  const [step, setStep] = useState(1); // 1: 대상 선택, 2: 수당 설정, 3: 정산 완료
  const [selectedStaffs, setSelectedStaffs] = useState<any[]>([]);
  const [settlementData, setSettlementData] = useState<any>({});
  const [loading, setLoading] = useState(false);

  // 법적 비과세 한도 정의 (2024-2025 기준)
  const TAX_FREE_LIMITS = {
    meal: 200000,      // 식대
    vehicle: 200000,   // 자가운전보조금
    childcare: 100000, // 보육수당
    research: 200000   // 연구활동비
  };

  const filteredStaffs = staffs.filter((s: any) => selectedCo === '전체' || s.company === selectedCo);

  const toggleStaff = (staff: any) => {
    if (selectedStaffs.find(s => s.id === staff.id)) {
      setSelectedStaffs(selectedStaffs.filter(s => s.id !== staff.id));
    } else {
      setSelectedStaffs([...selectedStaffs, staff]);
    }
  };

  const handleNextStep = () => {
    if (selectedStaffs.length === 0) return alert("정산 대상을 선택해 주세요.");
    
    const initialData: any = {};
    selectedStaffs.forEach(s => {
      initialData[s.id] = {
        base_salary: s.base_salary || 0,
        meal_allowance: s.meal_allowance || 0,
        vehicle_allowance: s.vehicle_allowance || 0,
        childcare_allowance: s.childcare_allowance || 0,
        research_allowance: s.research_allowance || 0,
        other_taxfree: s.other_taxfree || 0,
        extra_allowance: 0, // 기타 수당 항목 (추가 입력용)
        overtime_pay: 0,
        bonus: 0,
        apply_tax: true,
        apply_insurance: true
      };
    });
    setSettlementData(initialData);
    setStep(2);
  };

  const updateData = (id: string, field: string, value: any) => {
    setSettlementData({
      ...settlementData,
      [id]: { ...settlementData[id], [field]: value }
    });
  };

  const calculateSalary = (id: string) => {
    const data = settlementData[id];
    
    // 비과세 한도 체크 및 과세 전환 계산
    const meal_tf = Math.min(Number(data.meal_allowance), TAX_FREE_LIMITS.meal);
    const meal_taxable = Math.max(0, Number(data.meal_allowance) - TAX_FREE_LIMITS.meal);

    const vehicle_tf = Math.min(Number(data.vehicle_allowance), TAX_FREE_LIMITS.vehicle);
    const vehicle_taxable = Math.max(0, Number(data.vehicle_allowance) - TAX_FREE_LIMITS.vehicle);

    const childcare_tf = Math.min(Number(data.childcare_allowance), TAX_FREE_LIMITS.childcare);
    const childcare_taxable = Math.max(0, Number(data.childcare_allowance) - TAX_FREE_LIMITS.childcare);

    const research_tf = Math.min(Number(data.research_allowance), TAX_FREE_LIMITS.research);
    const research_taxable = Math.max(0, Number(data.research_allowance) - TAX_FREE_LIMITS.research);

    const total_taxfree = meal_tf + vehicle_tf + childcare_tf + research_tf + Number(data.other_taxfree);
    
    // 과세 대상: 기본급 + 한도초과 비과세분 + 연장수당 + 상여 + 기타수당
    const total_taxable = Number(data.base_salary) + meal_taxable + vehicle_taxable + childcare_taxable + research_taxable + 
                          Number(data.overtime_pay) + Number(data.bonus) + Number(data.extra_allowance);
    
    const total_payment = total_taxable + total_taxfree;
    
    // 공제 계산 (과세 대상 기준)
    let deduction = 0;
    if (data.apply_insurance) {
      deduction += total_taxable * 0.0932; // 4대보험 약 9.32% (국민4.5+건강3.545+장기0.459+고용0.9)
    }
    if (data.apply_tax) {
      deduction += total_taxable * 0.033; // 소득세/지방소득세 약 3.3% (간이세액표 기준 근사치)
    }

    return {
      taxable: total_taxable,
      taxfree: total_taxfree,
      total: total_payment,
      deduction: Math.floor(deduction),
      net: total_payment - Math.floor(deduction)
    };
  };

  const handleFinalize = async () => {
    if (!confirm(`${selectedStaffs.length}명의 급여 정산을 확정하고 명세서를 생성하시겠습니까?`)) return;
    
    setLoading(true);
    try {
      const records = selectedStaffs.map(s => {
        const calc = calculateSalary(s.id);
        const data = settlementData[s.id];
        return {
          staff_id: s.id,
          year_month: new Date().toISOString().slice(0, 7),
          base_salary: data.base_salary,
          meal_allowance: data.meal_allowance,
          vehicle_allowance: data.vehicle_allowance,
          childcare_allowance: data.childcare_allowance,
          research_allowance: data.research_allowance,
          other_taxfree: data.other_taxfree,
          extra_allowance: data.extra_allowance,
          overtime_pay: data.overtime_pay,
          bonus: data.bonus,
          total_taxable: calc.taxable,
          total_taxfree: calc.taxfree,
          total_deduction: calc.deduction,
          net_pay: calc.net,
          status: '확정'
        };
      });

      await supabase.from('payroll_records').upsert(records, { onConflict: 'staff_id,year_month' });
      
      alert("급여 정산 및 명세서 생성이 완료되었습니다. 법적 비과세 한도가 자동 적용되었습니다.");
      setStep(3);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert("정산 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-100 shadow-2xl rounded-[2.5rem] overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      <div className="p-8 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-gray-900 tracking-tighter italic">전문 급여 정산 시스템</h3>
          <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase tracking-widest">Payroll Settlement with Legal Tax-Free Limits</p>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${step >= s ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200 text-gray-400'}`}>
              {s}
            </div>
          ))}
        </div>
      </div>

      <div className="p-8">
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex justify-between items-end">
              <p className="text-sm font-bold text-gray-500">정산 대상을 선택하세요. (연봉 계약 정보 자동 연동)</p>
              <button onClick={() => setSelectedStaffs(filteredStaffs)} className="text-[10px] font-black text-blue-600 hover:underline">전체 선택</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto p-2 custom-scrollbar">
              {filteredStaffs.map((s: any) => (
                <div 
                  key={s.id} 
                  onClick={() => toggleStaff(s)}
                  className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-4 ${
                    selectedStaffs.find(ts => ts.id === s.id) ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center font-black text-blue-600 shadow-sm border border-gray-100">
                    {s.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-black text-gray-900">{s.name}</p>
                    <p className="text-[10px] font-bold text-gray-400">기본급: ₩{(s.base_salary || 0).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={handleNextStep} className="w-full py-5 bg-gray-900 text-white font-black rounded-2xl text-sm shadow-xl hover:scale-[0.99] transition-all">다음 단계: 수당 설정 및 정산</button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8">
            <div className="max-h-[500px] overflow-y-auto space-y-6 p-2 custom-scrollbar">
              {selectedStaffs.map((s: any) => {
                const res = calculateSalary(s.id);
                const data = settlementData[s.id];
                return (
                  <div key={s.id} className="p-8 bg-gray-50 border border-gray-100 rounded-[2.5rem] space-y-6">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-blue-600 text-white text-[10px] font-black rounded-lg">{s.company}</span>
                        <span className="text-lg font-black text-gray-900">{s.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-gray-400 uppercase">최종 실수령액</p>
                        <p className="text-xl font-black text-blue-600">₩ {res.net.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">기본급 (계약연동)</label>
                        <input type="number" value={data.base_salary} readOnly className="w-full p-4 bg-gray-100 border border-gray-200 rounded-xl font-black text-sm text-gray-500 outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest">기타 수당 (추가입력)</label>
                        <input type="number" value={data.extra_allowance} onChange={(e) => updateData(s.id, 'extra_allowance', e.target.value)} className="w-full p-4 bg-white border-2 border-blue-200 rounded-xl font-black text-sm outline-none focus:border-blue-600 transition-all" placeholder="0" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">연장/상여</label>
                        <input type="number" value={Number(data.overtime_pay) + Number(data.bonus)} onChange={(e) => updateData(s.id, 'overtime_pay', e.target.value)} className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black text-sm outline-none focus:border-blue-600 transition-all" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">비과세 합계 (한도 자동체크)</label>
                        <div className="w-full p-4 bg-gray-100 border border-gray-200 rounded-xl font-black text-sm text-green-600">
                          ₩ {res.taxfree.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-gray-200/50">
                      <div className="flex gap-6">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input type="checkbox" checked={data.apply_insurance} onChange={(e) => updateData(s.id, 'apply_insurance', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          <span className="text-[11px] font-black text-gray-500 group-hover:text-gray-900">4대보험 적용</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input type="checkbox" checked={data.apply_tax} onChange={(e) => updateData(s.id, 'apply_tax', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          <span className="text-[11px] font-black text-gray-500 group-hover:text-gray-900">소득세 적용</span>
                        </label>
                      </div>
                      <p className="text-[10px] font-bold text-gray-400">과세대상: ₩{res.taxable.toLocaleString()} / 비과세: ₩{res.taxfree.toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4">
              <button onClick={() => setStep(1)} className="flex-1 py-5 bg-white border border-gray-200 text-gray-400 font-black rounded-2xl text-sm hover:bg-gray-50 transition-all">이전 단계</button>
              <button onClick={handleFinalize} disabled={loading} className="flex-[2] py-5 bg-blue-600 text-white font-black rounded-2xl text-sm shadow-xl hover:scale-[0.99] transition-all disabled:opacity-50">
                {loading ? '처리 중...' : '급여 정산 확정 및 명세서 생성'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="py-20 text-center space-y-6 animate-in zoom-in duration-500">
            <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto shadow-inner">✓</div>
            <h3 className="text-2xl font-black text-gray-900 tracking-tighter">급여 정산이 완료되었습니다!</h3>
            <p className="text-sm text-gray-500 font-bold">
              법적 비과세 한도가 자동 적용된 명세서가 생성되었습니다.
            </p>
            <button onClick={() => setStep(1)} className="px-10 py-4 bg-gray-900 text-white font-black rounded-2xl text-xs shadow-xl hover:scale-[0.98] transition-all">처음으로 돌아가기</button>
          </div>
        )}
      </div>
    </div>
  );
}

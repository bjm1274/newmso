'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateAttendanceDeduction } from '@/lib/attendance-deduction';
import { logAudit } from '@/lib/audit';
import { fetchTaxFreeSettings, DEFAULT_SETTINGS, type TaxFreeSettings } from '@/lib/use-tax-free-settings';

export default function SalarySettlement({ staffs, selectedCo, onRefresh }: any) {
  const [step, setStep] = useState(1);
  const [yearMonth, setYearMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedStaffs, setSelectedStaffs] = useState<any[]>([]);
  const [settlementData, setSettlementData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [taxFreeLimits, setTaxFreeLimits] = useState<TaxFreeSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let ok = true;
    (async () => {
      const s = await fetchTaxFreeSettings(selectedCo || '전체', parseInt(yearMonth.slice(0, 4)));
      if (ok) setTaxFreeLimits(s);
    })();
    return () => { ok = false; };
  }, [selectedCo, yearMonth]);

  const TAX_FREE_LIMITS = {
    meal: taxFreeLimits.meal_limit,
    vehicle: taxFreeLimits.vehicle_limit,
    childcare: taxFreeLimits.childcare_limit,
    research: taxFreeLimits.research_limit,
  };

  const filteredStaffs = staffs.filter((s: any) => selectedCo === '전체' || s.company === selectedCo);

  const toggleStaff = (staff: any) => {
    if (selectedStaffs.find(s => s.id === staff.id)) {
      setSelectedStaffs(selectedStaffs.filter(s => s.id !== staff.id));
    } else {
      setSelectedStaffs([...selectedStaffs, staff]);
    }
  };

  const handleNextStep = async () => {
    if (selectedStaffs.length === 0) return alert("정산 대상을 선택해 주세요.");

    // 기본급여가 설정되지 않은 직원은 명세서를 생성하지 못하도록 1단계에서 차단
    const noBase = selectedStaffs.filter((s: any) => !s.base_salary || s.base_salary <= 0);
    if (noBase.length > 0) {
      const names = noBase.map((s: any) => s.name).join(', ');
      alert(
        `기본급(연봉)이 0원으로 설정된 직원이 포함되어 있어 급여 정산을 진행할 수 없습니다.\n\n` +
        `기본급을 먼저 직원 등록 화면에서 입력해 주세요.\n\n문제 대상: ${names}`
      );
      return;
    }
    setLoading(true);
    try {
      const staffIds = selectedStaffs.map((s: any) => s.id);
      const [startDate, endDate] = [`${yearMonth}-01`, `${yearMonth}-31`];

      const { data: attendances } = await supabase
        .from('attendances')
        .select('*')
        .in('staff_id', staffIds)
        .gte('work_date', startDate)
        .lte('work_date', endDate);

      const ruleCompany = selectedCo === '전체' ? '전체' : selectedCo;
      const { data: rule } = await supabase
        .from('attendance_deduction_rules')
        .select('*')
        .eq('company_name', ruleCompany)
        .single();
      const fallback = await supabase.from('attendance_deduction_rules').select('*').eq('company_name', '전체').single();
      const r = rule || fallback.data;

      const initialData: any = {};
      selectedStaffs.forEach((s: any) => {
        const staffAtts = (attendances || []).filter((a: any) => a.staff_id === s.id);
        const { total, detail } = calculateAttendanceDeduction(
          s.base_salary || 0,
          yearMonth,
          staffAtts,
          r ? { late_deduction_type: r.late_deduction_type, late_deduction_amount: r.late_deduction_amount, early_leave_deduction_type: r.early_leave_deduction_type, early_leave_deduction_amount: r.early_leave_deduction_amount } : undefined
        );
        initialData[s.id] = {
          base_salary: s.base_salary || 0,
          meal_allowance: s.meal_allowance || 0,
          night_duty_allowance: s.night_duty_allowance || 0,
          vehicle_allowance: s.vehicle_allowance || 0,
          childcare_allowance: s.childcare_allowance || 0,
          research_allowance: s.research_allowance || 0,
          other_taxfree: s.other_taxfree || 0,
          extra_allowance: 0,
          overtime_pay: 0,
          bonus: 0,
          apply_tax: true,
          apply_insurance: true,
          attendance_deduction: total,
          attendance_deduction_detail: { ...detail, original_deduction: total },
          custom_deduction: 0,
          advance_pay: 0,
        };
      });
      setSettlementData(initialData);
      setStep(2);
    } catch (e) {
      console.error(e);
      alert('근태 데이터 로드 실패');
    } finally {
      setLoading(false);
    }
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

    const nightDuty = Number(data.night_duty_allowance) || 0;

    const research_tf = Math.min(Number(data.research_allowance), TAX_FREE_LIMITS.research);
    const research_taxable = Math.max(0, Number(data.research_allowance) - TAX_FREE_LIMITS.research);

    const total_taxfree = meal_tf + vehicle_tf + childcare_tf + research_tf + nightDuty + Number(data.other_taxfree);

    // 과세 대상: 기본급 + 한도초과 비과세분 + 연장수당 + 상여 + 기타수당 - 근태차감
    const attendance_deduction = Number(data.attendance_deduction) || 0;
    const total_taxable = Number(data.base_salary) + meal_taxable + vehicle_taxable + childcare_taxable + research_taxable +
      Number(data.overtime_pay) + Number(data.bonus) + Number(data.extra_allowance) - attendance_deduction;

    const total_payment = total_taxable + total_taxfree;

    // 공제 상세: 4대보험·소득세는 과세표준(급여−비과세) 기준, 항목별 계산 (학습 문서 §8·§14.3)
    let national_pension = 0, health_insurance = 0, long_term_care = 0, employment_insurance = 0, income_tax = 0, local_tax = 0;
    if (data.apply_insurance) {
      national_pension = Math.floor(total_taxable * 0.045);   // 국민연금 근로자 4.5%
      health_insurance = Math.floor(total_taxable * 0.03545);  // 건강보험 근로자 3.545%
      long_term_care = Math.floor(health_insurance * 0.1295); // 장기요양 12.95%
      employment_insurance = Math.floor(total_taxable * 0.009); // 고용보험 근로자 0.9%
    }
    if (data.apply_tax) {
      income_tax = Math.floor(total_taxable * 0.03);  // 소득세 간이세액표 근사
      local_tax = Math.floor(income_tax * 0.1 / 10) * 10; // 지방소득세 10%, 10원 단위 절사 (국고금관리법 제47조)
    }
    const custom_deduction = Number(data.custom_deduction) || 0;
    const deduction = national_pension + health_insurance + long_term_care + employment_insurance + income_tax + local_tax + custom_deduction;
    const deductionDetail = {
      national_pension,
      health_insurance,
      long_term_care,
      employment_insurance,
      income_tax,
      local_tax,
      custom_deduction
    };

    return {
      taxable: total_taxable,
      taxfree: total_taxfree,
      total: total_payment,
      deduction,
      deductionDetail,
      attendance_deduction,
      net: total_payment - deduction
    };
  };

  const handleFinalize = async () => {
    if (!confirm(`${selectedStaffs.length}명의 급여 정산을 확정하고 명세서를 생성하시겠습니까?`)) return;

    setLoading(true);
    try {
      const advancePayAmount = (id: string) => Number(settlementData[id]?.advance_pay) || 0;
      const records = selectedStaffs.map(s => {
        const data = settlementData[s.id];
        const advancePay = advancePayAmount(s.id);
        const isAdvanceOnly = advancePay > 0;
        const calc = isAdvanceOnly ? null : calculateSalary(s.id);
        return {
          staff_id: s.id,
          year_month: yearMonth,
          base_salary: data.base_salary,
          meal_allowance: data.meal_allowance,
          night_duty_allowance: data.night_duty_allowance ?? 0,
          vehicle_allowance: data.vehicle_allowance,
          childcare_allowance: data.childcare_allowance,
          research_allowance: data.research_allowance,
          other_taxfree: data.other_taxfree,
          extra_allowance: data.extra_allowance,
          overtime_pay: data.overtime_pay,
          bonus: data.bonus,
          total_taxable: isAdvanceOnly ? 0 : calc!.taxable,
          total_taxfree: isAdvanceOnly ? 0 : calc!.taxfree,
          total_deduction: isAdvanceOnly ? 0 : calc!.deduction,
          deduction_detail: isAdvanceOnly ? {} : (calc!.deductionDetail || {}),
          net_pay: isAdvanceOnly ? advancePay : calc!.net,
          attendance_deduction: data.attendance_deduction || 0,
          attendance_deduction_detail: data.attendance_deduction_detail || {},
          advance_pay: advancePay,
          status: '확정'
        };
      });

      await supabase.from('payroll_records').upsert(records, { onConflict: 'staff_id,year_month' });
      const u = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('erp_user') || '{}') : {};
      await logAudit('급여수정', 'payroll', yearMonth, { count: records.length, total: records.reduce((s: number, r: any) => s + (Number(r.net_pay) || 0), 0) }, u.id, u.name);

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
    <div className="bg-[var(--toss-card)] rounded-[12px] border border-[var(--toss-border)] shadow-sm overflow-hidden animate-in fade-in duration-300">
      <div className="bg-[var(--page-bg)] border-b border-[var(--toss-border)] px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">급여 정산</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">법적 비과세 한도 자동 반영</p>
        </div>
        <div className="flex border border-[var(--toss-border)] rounded-[12px] p-0.5 bg-[var(--toss-card)]">
          {[
            { step: 1, label: '대상 선택' },
            { step: 2, label: '수당·공제' },
            { step: 3, label: '완료' },
          ].map(({ step: s, label }) => (
            <div key={s} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${step === s ? 'bg-[var(--toss-blue)] text-white' : step > s ? 'text-[var(--toss-blue)]' : 'text-[var(--toss-gray-3)]'}`}>
              {s}. {label}
            </div>
          ))}
        </div>
      </div>

      <div className="p-6">
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <label className="text-sm text-[var(--toss-gray-4)]">정산 월</label>
                <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium" />
              </div>
              <p className="text-sm text-[var(--toss-gray-3)]">정산 대상을 선택하세요. (근태 자동 반영)</p>
              <button onClick={() => setSelectedStaffs(filteredStaffs)} className="text-sm font-medium text-[var(--toss-blue)] hover:underline">전체 선택</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[380px] overflow-y-auto custom-scrollbar">
              {filteredStaffs.map((s: any) => (
                <div
                  key={s.id}
                  onClick={() => toggleStaff(s)}
                  className={`p-4 rounded-[12px] border cursor-pointer transition-colors flex items-center gap-3 ${selectedStaffs.find(ts => ts.id === s.id) ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]/70 ring-1 ring-[var(--toss-blue)]/30' : 'border-[var(--toss-border)] bg-[var(--toss-card)] hover:bg-[var(--toss-gray-1)]'
                    }`}
                >
                  <div className="w-10 h-10 rounded-[12px] bg-[var(--tab-bg)] flex items-center justify-center text-sm font-semibold text-[var(--toss-blue)]">{s.name[0]}</div>
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">{s.name}</p>
                    <p className="text-xs text-[var(--toss-gray-3)]">기본급 ₩{(s.base_salary || 0).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={handleNextStep} disabled={loading} className="w-full py-3.5 bg-[var(--toss-blue)] text-white text-sm font-semibold rounded-[12px] hover:opacity-90 transition-colors disabled:opacity-50">{loading ? '로딩 중...' : '다음: 수당 설정 및 정산'}</button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8">
            <div className="max-h-[500px] overflow-y-auto space-y-6 p-2 custom-scrollbar">
              {selectedStaffs.map((s: any) => {
                const data = settlementData[s.id];
                const advancePay = Number(data?.advance_pay) || 0;
                const isAdvanceOnly = advancePay > 0;
                const res = isAdvanceOnly ? { net: advancePay, taxable: 0, taxfree: 0 } : calculateSalary(s.id);
                return (
                  <div key={s.id} className="p-5 bg-[var(--page-bg)] border border-[var(--toss-border)] rounded-[12px] space-y-5">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-[var(--toss-blue-light)] text-[var(--toss-blue)] text-xs font-medium rounded">{s.company}</span>
                        <span className="text-base font-semibold text-[var(--foreground)]">{s.name}</span>
                        {isAdvanceOnly && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-medium rounded">선지급</span>}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[var(--toss-gray-3)]">차인지급액</p>
                        <p className="text-lg font-semibold text-[var(--toss-blue)]">₩ {res.net.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--toss-gray-4)]">과세 · 기본급</label>
                        <input type="number" value={data.base_salary} readOnly className="w-full h-9 px-3 bg-[var(--toss-gray-1)] border border-[var(--toss-border)] rounded-md text-sm text-[var(--toss-gray-4)]" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--toss-gray-4)]">기타 수당</label>
                        <input type="number" value={data.extra_allowance} onChange={(e) => updateData(s.id, 'extra_allowance', e.target.value)} className="w-full h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm focus:ring-2 focus:ring-[var(--toss-blue)] focus:border-[var(--toss-blue)]" placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--toss-gray-4)]">비과세 · 당직수당(야간)</label>
                        <input type="number" value={Number(data.night_duty_allowance) || 0} onChange={(e) => updateData(s.id, 'night_duty_allowance', e.target.value)} className="w-full h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm focus:ring-2 focus:ring-[var(--toss-blue)]" placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--toss-gray-4)]">연장/상여</label>
                        <input type="number" value={Number(data.overtime_pay) + Number(data.bonus)} onChange={(e) => updateData(s.id, 'overtime_pay', e.target.value)} className="w-full h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--toss-gray-4)]">비과세 합계</label>
                        <div className="h-9 px-3 flex items-center bg-[var(--toss-gray-1)] border border-[var(--toss-border)] rounded-md text-sm font-medium text-[var(--foreground)]">₩ {(isAdvanceOnly ? 0 : res.taxfree).toLocaleString()}</div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-amber-700">기타 공제 (원)</label>
                        <input type="number" min={0} value={Number(data.custom_deduction) || 0} onChange={(e) => updateData(s.id, 'custom_deduction', Number(e.target.value) || 0)} className="w-full h-9 px-3 border border-amber-200 rounded-md text-sm focus:ring-2 focus:ring-amber-400" placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-amber-700">선지급 (원)</label>
                        <input type="number" min={0} value={advancePay} onChange={(e) => updateData(s.id, 'advance_pay', Number(e.target.value) || 0)} className="w-full h-9 px-3 border border-amber-200 rounded-md text-sm focus:ring-2 focus:ring-amber-400" placeholder="0" />
                        <p className="text-[11px] text-[var(--toss-gray-3)]">0 초과 시 해당 월 선지급만 적용</p>
                      </div>
                      {(data.attendance_deduction !== undefined && (data.attendance_deduction > 0 || data.attendance_deduction_detail?.original_deduction > 0)) && (
                        <div className="sm:col-span-2 lg:col-span-3 space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-orange-700">근태 차감 (지각/조퇴/결근)</label>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  if (confirm('이 직원의 근태 차감을 전액 면제(0원)하시겠습니까?\n사유: 관리자 재량 예외처리 / 보상휴가 전환 등')) {
                                    updateData(s.id, 'attendance_deduction', 0);
                                  }
                                }}
                                className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-[6px] hover:bg-emerald-200 transition-colors"
                              >
                                ✨ 전액 면제
                              </button>
                              <button
                                onClick={() => {
                                  const ans = prompt('수동으로 차감할 금액을 입력하세요 (원 단위):', data.attendance_deduction);
                                  if (ans !== null && !isNaN(Number(ans))) {
                                    updateData(s.id, 'attendance_deduction', Number(ans));
                                  }
                                }}
                                className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-1 rounded-[6px] hover:bg-orange-200 transition-colors shadow-sm"
                              >
                                📝 금액 직접수정
                              </button>
                            </div>
                          </div>
                          <div className="px-3 py-2.5 bg-orange-50/80 border border-orange-200 rounded-lg text-sm font-extrabold text-orange-800 flex justify-between items-center shadow-inner">
                            <span>-₩ {(data.attendance_deduction || 0).toLocaleString()}</span>
                            {data.attendance_deduction_detail?.original_deduction !== undefined && data.attendance_deduction_detail.original_deduction !== data.attendance_deduction && (
                              <span className="text-[10px] font-semibold text-orange-400/80 line-through">원래 산출액: -₩{data.attendance_deduction_detail.original_deduction.toLocaleString()}</span>
                            )}
                          </div>
                          {data.attendance_deduction === 0 && data.attendance_deduction_detail?.original_deduction > 0 && (
                            <p className="text-[10px] text-emerald-600 font-bold mt-1 text-right">※ 관리자 권한으로 차감이 면제되었습니다.</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--toss-border)]">
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--toss-gray-4)]">
                          <input type="checkbox" checked={data.apply_insurance} onChange={(e) => updateData(s.id, 'apply_insurance', e.target.checked)} className="w-4 h-4 rounded border-[var(--toss-border)] text-[var(--toss-blue)]" />
                          4대보험
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--toss-gray-4)]">
                          <input type="checkbox" checked={data.apply_tax} onChange={(e) => updateData(s.id, 'apply_tax', e.target.checked)} className="w-4 h-4 rounded border-[var(--toss-border)] text-[var(--toss-blue)]" />
                          소득세
                        </label>
                      </div>
                      <p className="text-xs text-[var(--toss-gray-3)]">과세 ₩{(isAdvanceOnly ? 0 : res.taxable).toLocaleString()} / 비과세 ₩{(isAdvanceOnly ? 0 : res.taxfree).toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(1)} className="flex-1 py-3 bg-[var(--toss-card)] border border-[var(--toss-border)] text-[var(--toss-gray-4)] text-sm font-medium rounded-[12px] hover:bg-[var(--toss-gray-1)]">이전</button>
              <button onClick={handleFinalize} disabled={loading} className="flex-[2] py-3 bg-[var(--toss-blue)] text-white text-sm font-semibold rounded-[12px] hover:opacity-90 disabled:opacity-50">
                {loading ? '처리 중...' : '저장하기 · 정산 확정'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="py-16 text-center space-y-5 animate-in fade-in duration-300">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto">✓</div>
            <h3 className="text-xl font-bold text-[var(--foreground)]">정산이 완료되었습니다</h3>
            <p className="text-sm text-[var(--toss-gray-3)]">명세서가 생성되었습니다. 대장에서 확인하세요.</p>
            <button onClick={() => setStep(1)} className="px-6 py-2.5 bg-[var(--toss-blue)] text-white text-sm font-medium rounded-[12px] hover:opacity-90">다시 정산하기</button>
          </div>
        )}
      </div>
    </div>
  );
}

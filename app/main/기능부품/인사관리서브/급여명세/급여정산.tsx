'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateAttendanceDeduction } from '@/lib/attendance-deduction';
import { logAudit } from '@/lib/audit';
import { fetchTaxFreeSettings, DEFAULT_SETTINGS, type TaxFreeSettings } from '@/lib/use-tax-free-settings';
import {
  fetchTaxInsuranceRates,
  DEFAULT_TAX_INSURANCE_RATES,
  hasExactIncomeTaxBracket,
  type TaxInsuranceRates,
} from '@/lib/use-tax-insurance-rates';

export default function SalarySettlement({ staffs, selectedCo, onRefresh }: any) {
  const [step, setStep] = useState(1);
  const [yearMonth, setYearMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedStaffs, setSelectedStaffs] = useState<any[]>([]);
  const [settlementData, setSettlementData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [taxFreeLimits, setTaxFreeLimits] = useState<TaxFreeSettings>(DEFAULT_SETTINGS);
  const [taxInsuranceRates, setTaxInsuranceRates] = useState<TaxInsuranceRates>(DEFAULT_TAX_INSURANCE_RATES);

  useEffect(() => {
    let ok = true;
    (async () => {
      const s = await fetchTaxFreeSettings(selectedCo || '전체', parseInt(yearMonth.slice(0, 4)));
      if (ok) setTaxFreeLimits(s);
    })();
    return () => { ok = false; };
  }, [selectedCo, yearMonth]);

  useEffect(() => {
    let ok = true;
    (async () => {
      const rates = await fetchTaxInsuranceRates(selectedCo || '전체', parseInt(yearMonth.slice(0, 4), 10));
      if (ok) setTaxInsuranceRates(rates);
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
          extra_allowance: Number(s.overtime_allowance || 0) + Number(s.night_work_allowance || 0) + Number(s.holiday_work_allowance || 0) + Number(s.annual_leave_pay || 0),
          overtime_pay: 0,
          bonus: 0,
          apply_tax: s.permissions?.insurance?.income_tax !== false,
          apply_insurance: s.permissions?.insurance?.national !== false,
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

    // 직원별 보험/복지 설정 가져오기 (Duru-nuri, Medical Benefit 등)
    const staff = staffs.find((s: any) => String(s.id) === String(id));
    const insSettings = staff?.permissions?.insurance || {};
    const isMedicalBenefit = staff?.permissions?.is_medical_benefit || false;

    // 두루누리 적용 여부 판단 (기간 체크)
    let isDuruNuriActive = insSettings.duru_nuri || false;
    if (isDuruNuriActive && insSettings.duru_nuri_start && insSettings.duru_nuri_end) {
      const current = yearMonth; // "YYYY-MM"
      isDuruNuriActive = (current >= insSettings.duru_nuri_start && current <= insSettings.duru_nuri_end);
    }

    // 공제 상세: 4대보험은 저장된 연도별 요율을 사용합니다.
    let national_pension = 0, health_insurance = 0, long_term_care = 0, employment_insurance = 0, income_tax = 0, local_tax = 0;
    if (data.apply_insurance) {
      // 1. 국민연금 - 두루누리 80% 지원 적용 시 20%만 부과
      const full_national = Math.floor(total_taxable * taxInsuranceRates.national_pension_rate);
      national_pension = isDuruNuriActive ? Math.floor(full_national * 0.2) : full_national;

      // 2. 건강보험 - 의료급여 수급자는 제외(0원)
      if (!isMedicalBenefit) {
        health_insurance = Math.floor(total_taxable * taxInsuranceRates.health_insurance_rate);
        long_term_care = Math.floor(total_taxable * taxInsuranceRates.long_term_care_rate);
      }

      // 3. 고용보험 - 두루누리 80% 지원 적용 시 20%만 부과
      const full_employment = Math.floor(total_taxable * taxInsuranceRates.employment_insurance_rate);
      employment_insurance = isDuruNuriActive ? Math.floor(full_employment * 0.2) : full_employment;
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
      custom_deduction,
      is_duru_nuri: isDuruNuriActive,
      is_medical_benefit: isMedicalBenefit,
      tax_estimated: data.apply_tax && !hasExactIncomeTaxBracket(taxInsuranceRates),
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

    const needsExactIncomeTax = selectedStaffs.some((staff: any) => settlementData[staff.id]?.apply_tax);
    if (needsExactIncomeTax && !hasExactIncomeTaxBracket(taxInsuranceRates)) {
      alert(
        '근로소득세 간이세액표가 설정되지 않아 급여를 안전하게 확정할 수 없습니다.\n\n' +
        '세율·보험요율 관리에서 income_tax_bracket을 먼저 설정한 뒤 다시 진행해 주세요.'
      );
      return;
    }

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
      const u = typeof window !== 'undefined' ? (() => { try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); } catch { return {}; } })() : {};
      await logAudit(
        '급여수정',
        'payroll',
        yearMonth,
        {
          count: records.length,
          total: records.reduce((sum: number, record: any) => sum + (Number(record.net_pay) || 0), 0),
          year_month: yearMonth,
          records: records.map((record: any) => {
            const staff = selectedStaffs.find((candidate: any) => candidate.id === record.staff_id);
            return {
              staff_id: record.staff_id,
              staff_name: staff?.name || '-',
              employee_no: staff?.employee_no || null,
              company: staff?.company || '',
              department: staff?.department || '',
              base_salary: record.base_salary,
              total_taxable: record.total_taxable,
              total_taxfree: record.total_taxfree,
              total_deduction: record.total_deduction,
              attendance_deduction: record.attendance_deduction,
              advance_pay: record.advance_pay,
              net_pay: record.net_pay,
            };
          }),
        },
        u.id,
        u.name
      );

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
    <div className="bg-[var(--toss-card)] rounded-[12px] border border-[var(--toss-border)] shadow-sm overflow-hidden animate-in fade-in duration-300" data-testid="salary-settlement-view">
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
            {!hasExactIncomeTaxBracket(taxInsuranceRates) && (
              <div data-testid="salary-settlement-missing-tax-warning" className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-bold text-amber-800">주의: 근로소득세 간이세액표가 설정되지 않았습니다.</p>
                <p className="mt-1 text-xs font-medium text-amber-700">
                  보험요율은 반영되지만, 소득세는 운영 확정에 사용할 수 없습니다. 정확한 세액표를 먼저 입력해야 합니다.
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <label className="text-sm text-[var(--toss-gray-4)]">정산 월</label>
                <input data-testid="salary-settlement-month-input" type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium" />
              </div>
              <p className="text-sm text-[var(--toss-gray-3)]">정산 대상을 선택하세요. (근태 자동 반영)</p>
              <button data-testid="salary-settlement-select-all" onClick={() => setSelectedStaffs(filteredStaffs)} className="text-sm font-medium text-[var(--toss-blue)] hover:underline">전체 선택</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[380px] overflow-y-auto custom-scrollbar">
              {filteredStaffs.map((s: any) => (
                <div
                  key={s.id}
                  data-testid={`salary-settlement-staff-${s.id}`}
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
            <button data-testid="salary-settlement-next-button" onClick={handleNextStep} disabled={loading} className="w-full py-3.5 bg-[var(--toss-blue)] text-white text-sm font-semibold rounded-[12px] hover:opacity-90 transition-colors disabled:opacity-50">{loading ? '로딩 중...' : '다음: 수당 설정 및 정산'}</button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8">
            {!hasExactIncomeTaxBracket(taxInsuranceRates) && (
              <div data-testid="salary-settlement-finalize-block-warning" className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-bold text-red-700">급여 확정 차단: 정확한 근로소득세표가 없습니다.</p>
                <p className="mt-1 text-xs font-medium text-red-600">
                  보험요율은 적용되지만, 소득세는 아직 근사 계산입니다. 세액표가 설정되기 전에는 저장을 막습니다.
                </p>
              </div>
            )}
            <div className="max-h-[500px] overflow-y-auto space-y-6 p-2 custom-scrollbar">
              {selectedStaffs.map((s: any) => {
                const data = settlementData[s.id];
                const advancePay = Number(data?.advance_pay) || 0;
                const isAdvanceOnly = advancePay > 0;
                const res = isAdvanceOnly ? { net: advancePay, taxable: 0, taxfree: 0 } : calculateSalary(s.id);
                return (
                  <div key={s.id} data-testid={`salary-settlement-card-${s.id}`} className="p-4 bg-white border border-[var(--toss-border)] rounded-[16px] shadow-sm space-y-4 hover:border-[var(--toss-blue)] transition-all">
                    <div className="flex justify-between items-center border-b border-[var(--toss-gray-1)] pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[var(--toss-blue-light)] flex items-center justify-center text-xs font-bold text-[var(--toss-blue)]">{s.name[0]}</div>
                        <div>
                          <p className="text-sm font-bold text-[var(--foreground)] leading-none">{s.name}</p>
                          <p className="text-[10px] text-[var(--toss-gray-3)] mt-1">{s.company} · {s.department}</p>
                        </div>
                        {isAdvanceOnly && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">선지급</span>}
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-[var(--toss-gray-3)] font-bold">합계 예상 실지급액</p>
                        <p className="text-lg font-black text-[var(--toss-blue)]">₩ {res.net.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">과세·기본급</label>
                        <input type="text" value={Number(data.base_salary).toLocaleString()} readOnly className="w-full h-8 px-3 bg-[var(--toss-gray-1)] border-none rounded-lg text-xs font-bold text-[var(--toss-gray-4)]" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--toss-blue)] ml-1">수당 합계(고정포함)</label>
                        <input type="text" value={Number(data.extra_allowance).toLocaleString()} onChange={(e) => updateData(s.id, 'extra_allowance', parseInt(e.target.value.replace(/,/g, '')) || 0)} className="w-full h-8 px-3 border border-[var(--toss-border)] rounded-lg text-xs font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/20 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">야간/당직 (비과세)</label>
                        <input type="text" value={Number(data.night_duty_allowance).toLocaleString()} onChange={(e) => updateData(s.id, 'night_duty_allowance', parseInt(e.target.value.replace(/,/g, '')) || 0)} className="w-full h-8 px-3 border border-[var(--toss-border)] rounded-lg text-xs font-bold outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">연장/상여</label>
                        <input type="text" value={(Number(data.overtime_pay) + Number(data.bonus)).toLocaleString()} onChange={(e) => updateData(s.id, 'overtime_pay', parseInt(e.target.value.replace(/,/g, '')) || 0)} className="w-full h-8 px-3 border border-[var(--toss-border)] rounded-lg text-xs font-bold outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-orange-600 ml-1">근태/기타차감</label>
                        <input type="text" value={(Number(data.attendance_deduction) + Number(data.custom_deduction)).toLocaleString()} onChange={(e) => updateData(s.id, 'custom_deduction', parseInt(e.target.value.replace(/,/g, '')) || 0)} className="w-full h-8 px-3 border border-orange-200 bg-orange-50/30 rounded-lg text-xs font-bold text-orange-700 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-amber-600 ml-1">선지급(차감)</label>
                        <input type="text" value={Number(data.advance_pay).toLocaleString()} onChange={(e) => updateData(s.id, 'advance_pay', parseInt(e.target.value.replace(/,/g, '')) || 0)} className="w-full h-8 px-3 border border-amber-200 bg-amber-50/30 rounded-lg text-xs font-bold text-amber-700 outline-none" />
                      </div>
                      <div className="col-span-2 flex items-center justify-between bg-[var(--toss-gray-1)] px-4 py-2 rounded-xl mt-1">
                        <div className="flex gap-4">
                          <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">과세: ₩{res.taxable.toLocaleString()}</span>
                          <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">비과세: ₩{res.taxfree.toLocaleString()}</span>
                        </div>
                        <div className="flex gap-2">
                          {data.attendance_deduction > 0 && (
                            <button onClick={() => updateData(s.id, 'attendance_deduction', 0)} className="text-[9px] font-bold text-emerald-600 bg-white px-2 py-0.5 rounded shadow-sm border border-emerald-100">근태차감 면제</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 pt-2">
              <button data-testid="salary-settlement-back-button" onClick={() => setStep(1)} className="flex-1 py-3 bg-[var(--toss-card)] border border-[var(--toss-border)] text-[var(--toss-gray-4)] text-sm font-medium rounded-[12px] hover:bg-[var(--toss-gray-1)]">이전</button>
              <button data-testid="salary-settlement-finalize-button" onClick={handleFinalize} disabled={loading || !hasExactIncomeTaxBracket(taxInsuranceRates)} className="flex-[2] py-3 bg-[var(--toss-blue)] text-white text-sm font-semibold rounded-[12px] hover:opacity-90 disabled:opacity-50">
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

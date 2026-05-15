'use client';
import { toast } from '@/lib/toast';
import { isMissingColumnError, withMissingColumnsFallback } from '@/lib/supabase-compat';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { resolveWeeklyWorkingHours, resolveWorkingDaysPerWeek } from '@/lib/payroll-working-hours';
import { getStaffProbationMonths, toIntegerOrFallback } from '@/lib/staff-meta';
import { getPrimaryShiftBatch } from '@/lib/staff-shift-resolver';
import ContractList from './계약문서/계약서명단';
import ContractPreview from './계약문서/계약서미리보기';
import ContractTemplateEditor from './계약문서/계약서양식편집';
import RiskActionDialog from './RiskActionDialog';

const formatWon = (amount: number) => `₩${Math.round(Number(amount) || 0).toLocaleString()}`;

export default function ContractMain({
  staffs,
  selectedCo,
  onRefresh,
  showAdminPolicyTabs = true,
  showTemplateEditor = true,
}: Record<string, unknown>) {
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('계약현황');
  const [contractSubType, setContractSubType] = useState<'신규' | '변경'>('신규'); // 신규/변경계약서용
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [showSignatureReview, setShowSignatureReview] = useState(false);

  // 확장된 비과세 항목 상태 (근로계약서·변경계약서·연봉계약서 공통)
  const [salaryInfo, setSalaryInfo] = useState({
    base_salary: 0,
    meal_allowance: 0,       // 식대 (한도 20만)
    vehicle_allowance: 0,    // 자가운전 (한도 20만)
    childcare_allowance: 200000, // 보육수당 (20만원)
    position_allowance: 0,   // 직책수당
    research_allowance: 0,   // 연구활동비 (한도 20만)
    other_taxfree: 0,        // 기타 비과세
    effective_date: new Date().toISOString().split('T')[0],
    working_hours_per_week: 40,
    working_days_per_week: 5,
    shift_start_time: '09:00',
    shift_end_time: '18:00',
    break_start_time: '12:00',
    break_end_time: '13:00'
  });

  const optionalEmploymentContractColumns = [
    'conditions_applied_at',
    'contract_start_date',
    'shift_id',
    'shift_start_time',
    'shift_end_time',
    'break_start_time',
    'break_end_time',
    'probation_months',
    'working_hours_per_week',
    'working_days_per_week',
  ];

  const omitColumnsFromRecord = (
    record: Record<string, unknown>,
    omittedColumns: ReadonlySet<string>,
  ) => {
    if (omittedColumns.size === 0) return record;
    return Object.fromEntries(
      Object.entries(record).filter(([key]) => !omittedColumns.has(key))
    );
  };

  const upsertEmploymentContracts = async (
    requests: Record<string, unknown>[],
    omittedColumns: ReadonlySet<string>,
  ) =>
    supabase
      .from('employment_contracts')
      .upsert(
        requests.map((request) => omitColumnsFromRecord(request, omittedColumns)),
        { onConflict: 'staff_id,contract_type' }
      );

  const getContractType = () => activeTab === '연봉계약갱신' ? '연봉계약서'
    : activeTab === '신규/변경계약서' ? (contractSubType === '신규' ? '신규계약서' : '변경계약서')
      : '표준근로계약서';

  const selectedContractStaffs = useMemo(() => {
    if (!checkedIds.length) return [] as any[];
    const checkedKeySet = new Set(checkedIds.map((id) => String(id)));
    return ((staffs as any[]) || []).filter((staff: any) => checkedKeySet.has(String(staff?.id)));
  }, [checkedIds, staffs]);

  const fetchContracts = async () => {
    const { data, error } = await supabase.from('employment_contracts').select('*');
    if (!error && data) setContracts(data);
  };

  useEffect(() => { fetchContracts(); }, []);

  const visibleTabs = [
    '계약현황',
    ...(showAdminPolicyTabs ? ['신규/변경계약서', '연봉계약갱신'] : []),
    ...(showTemplateEditor ? ['양식 편집'] : []),
  ];

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0] || '계약현황');
    }
  }, [activeTab, visibleTabs]);

  const handleRequestSignature = async () => {
    if (checkedIds.length === 0) return toast("직원을 선택해주세요.", 'warning');
    setLoading(true);
    try {
      const includeTaxFree = activeTab === '연봉계약갱신' || activeTab === '신규/변경계약서';
      const contractType = getContractType();

      // 선택된 직원들의 주근무유형 배치 조회 (staff_shift_assignments.is_primary → staff_members.shift_id 폴백)
      const checkedStaffIds = checkedIds.map((id: number) => String(id));
      const primaryShiftByStaff = await getPrimaryShiftBatch(checkedStaffIds);

      const resolvedShiftIds = [...new Set([...primaryShiftByStaff.values()].filter(Boolean))] as string[];
      let shiftMap: Record<string, any> = {};
      if (resolvedShiftIds.length > 0) {
        const { data: shiftRows } = await supabase
          .from('work_shifts')
          .select('id, start_time, end_time, break_start_time, break_end_time')
          .in('id', resolvedShiftIds);
        if (shiftRows) shiftMap = Object.fromEntries(shiftRows.map((sh: any) => [sh.id, sh]));
      }

      const requests = checkedIds.map((staffId: number) => {
        const s = (staffs as any[])?.find((x: any) => x.id === staffId);
        const probationMonths = getStaffProbationMonths(s, 0);
        const workingDaysPerWeek = toIntegerOrFallback(
          resolveWorkingDaysPerWeek(s, salaryInfo.working_days_per_week || 5),
          salaryInfo.working_days_per_week || 5,
        );
        const joinDate = s?.joined_at || s?.join_date;

        // 근로조건 적용일 계산 (수습 종료 익일)
        let conditionsAppDate = salaryInfo.effective_date;
        if (joinDate && probationMonths > 0) {
          const d = new Date(joinDate as string);
          d.setMonth(d.getMonth() + probationMonths);
          conditionsAppDate = d.toISOString().split('T')[0];
        }

        // 직원의 주근무유형 ID (staff_shift_assignments.is_primary → staff_members.shift_id)
        const resolvedShiftId = primaryShiftByStaff.get(String(staffId)) ?? s?.shift_id ?? null;
        const staffShift = shiftMap[resolvedShiftId as string] ?? null;

        const pay = includeTaxFree
          ? {
            base_salary: salaryInfo.base_salary ?? s?.base_salary ?? 0,
            meal_allowance: salaryInfo.meal_allowance ?? s?.meal_allowance ?? 0,
            vehicle_allowance: salaryInfo.vehicle_allowance ?? s?.vehicle_allowance ?? 0,
            childcare_allowance: salaryInfo.childcare_allowance ?? s?.childcare_allowance ?? 0,
            position_allowance: salaryInfo.position_allowance ?? s?.position_allowance ?? 0,
            research_allowance: salaryInfo.research_allowance ?? s?.research_allowance ?? 0,
            other_taxfree: salaryInfo.other_taxfree ?? s?.other_taxfree ?? 0,
            effective_date: conditionsAppDate
          }
          : {
            base_salary: s?.base_salary ?? 0,
            meal_allowance: s?.meal_allowance ?? 0,
            vehicle_allowance: s?.vehicle_allowance ?? 0,
            childcare_allowance: s?.childcare_allowance ?? 0,
            position_allowance: s?.position_allowance ?? 0,
            research_allowance: s?.research_allowance ?? 0,
            other_taxfree: s?.other_taxfree ?? 0,
            effective_date: conditionsAppDate
          };
        return {
          staff_id: staffId,
          status: '서명대기',
          requested_at: new Date().toISOString(),
          contract_type: contractType,
          working_hours_per_week: resolveWeeklyWorkingHours(s, salaryInfo.working_hours_per_week || 40),
          working_days_per_week: workingDaysPerWeek,
          shift_id: resolvedShiftId,
          shift_start_time: staffShift ? String(staffShift.start_time).slice(0, 5) : salaryInfo.shift_start_time,
          shift_end_time: staffShift ? String(staffShift.end_time).slice(0, 5) : salaryInfo.shift_end_time,
          break_start_time: staffShift ? String(staffShift.break_start_time || '12:00').slice(0, 5) : salaryInfo.break_start_time,
          break_end_time: staffShift ? String(staffShift.break_end_time || '13:00').slice(0, 5) : salaryInfo.break_end_time,
          probation_months: probationMonths,
          contract_start_date: joinDate,
          conditions_applied_at: conditionsAppDate,
          ...pay
        };
      });

      // 기존 미발송/반려 상태 레코드를 먼저 서명대기로 업데이트, 없으면 신규 insert
      const staffIdList = checkedIds.map((id: number) => id);
      await supabase
        .from('employment_contracts')
        .update({ status: '서명대기', requested_at: new Date().toISOString() })
        .in('staff_id', staffIdList)
        .eq('contract_type', contractType)
        .in('status', ['미발송', '반려']);

      let { error: upsertError } = await withMissingColumnsFallback(
        (omittedColumns) =>
          upsertEmploymentContracts(
            requests as Record<string, unknown>[],
            omittedColumns,
          ),
        optionalEmploymentContractColumns,
      );

      // Some older schema-cache responses still bubble through once; retry explicitly without optional columns.
      if (
        upsertError &&
        optionalEmploymentContractColumns.some((columnName) =>
          isMissingColumnError(upsertError, columnName)
        )
      ) {
        const fallbackResult = await upsertEmploymentContracts(
          requests as Record<string, unknown>[],
          new Set(optionalEmploymentContractColumns),
        );
        upsertError = fallbackResult.error;
      }

      if (
        upsertError &&
        String(upsertError.message || '').includes('invalid input syntax for type integer') &&
        requests.some((request) => {
          const weeklyHours = Number(request.working_hours_per_week);
          return Number.isFinite(weeklyHours) && !Number.isInteger(weeklyHours);
        })
      ) {
        const workConditionFallbackResult = await withMissingColumnsFallback(
          (omittedColumns) =>
            upsertEmploymentContracts(
              requests as Record<string, unknown>[],
              new Set([...omittedColumns, 'working_hours_per_week']),
            ),
          optionalEmploymentContractColumns,
        );
        upsertError = workConditionFallbackResult.error;
      }

      if (upsertError) {
        console.error('employment_contracts upsert failed:', upsertError);
        toast(`계약서 발송 실패: ${upsertError.message || '저장 오류'}`, 'error');
        return;
      }


      if (includeTaxFree) {
        await Promise.all(checkedIds.map((id: number) => {
          const s = (staffs as any[])?.find((x: any) => x.id === id);
          return supabase.from('staff_members').update({
            base_salary: salaryInfo.base_salary ?? s?.base_salary ?? 0,
            meal_allowance: salaryInfo.meal_allowance ?? s?.meal_allowance ?? 0,
            vehicle_allowance: salaryInfo.vehicle_allowance ?? s?.vehicle_allowance ?? 0,
            childcare_allowance: salaryInfo.childcare_allowance ?? s?.childcare_allowance ?? 0,
            position_allowance: salaryInfo.position_allowance ?? s?.position_allowance ?? 0,
            research_allowance: salaryInfo.research_allowance ?? s?.research_allowance ?? 0,
            other_taxfree: salaryInfo.other_taxfree ?? s?.other_taxfree ?? 0
          }).eq('id', id);
        }));
      }

      // 발송 시 알림함으로 노티 발송
      await supabase.from('notifications').insert(
        checkedIds.map((id: number) => ({
          user_id: String(id),
          title: '계약서 서명 요청',
          message: `${contractType}발송이 완료되었습니다. 확인 후 서명해 주세요.`,
          type: 'INFO',
          read_at: null
        }))
      );

      toast("계약서가 발송되었습니다. 직원이 로그인 시 즉시 서명 화면이 표시됩니다.", 'success');
      fetchContracts(); setCheckedIds([]); if (onRefresh) (onRefresh as () => void)();
    } catch (err) { toast("오류가 발생했습니다.", 'error'); } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 bg-[var(--tab-bg)]/20">
      <header className="px-5 py-2 border-b border-[var(--border)] bg-[var(--card)] flex flex-col md:flex-row justify-between items-start md:items-center gap-2 shrink-0">
        <div>
          <span className="text-[12px] font-bold text-[var(--toss-gray-3)] truncate">{selectedCo as string}</span>
          <div className="flex gap-0.5 p-1 app-tab-bar w-fit mt-1">
            {['계약현황', '신규/변경계약서', '연봉계약갱신', '양식 편집'].map(tab => (
              visibleTabs.includes(tab) ? (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${activeTab === tab ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-[var(--card)]/60'}`}>{tab}</button>
              ) : null
            ))}
          </div>
        </div>
        {activeTab !== '양식 편집' && (
          <button onClick={() => checkedIds.length === 0 ? toast("직원을 선택해주세요.", 'warning') : setShowSignatureReview(true)} disabled={loading || checkedIds.length === 0} className="px-4 py-3 bg-[var(--foreground)] text-white text-[12px] font-semibold rounded-[var(--radius-md)] shadow-sm hover:scale-[0.98] transition-all disabled:opacity-50">
            {loading ? '처리 중...' : `${activeTab === '연봉계약갱신' ? '연봉 갱신 및 계약 발송' : activeTab === '신규/변경계약서' ? `${contractSubType} 계약서 발송` : '근로계약서 발송'} (${checkedIds.length}명)`}
          </button>
        )}
      </header>

      <div className="flex-1 overflow-hidden">
        {/* 양식 편집 탭: 전체 화면 에디터 */}
        {activeTab === '양식 편집' ? (
          <ContractTemplateEditor selectedCo={selectedCo as string} />
        ) : (
        <div className="flex flex-col md:flex-row h-full">
          {/* 모바일: 직원 선택 토글 버튼 */}
          <div className="md:hidden shrink-0 border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[var(--foreground)]">
              {selectedStaffId
                ? `선택됨 · ${checkedIds.length}명 체크`
                : '직원을 선택하세요'}
            </span>
            <button
              onClick={() => setMobileListOpen(v => !v)}
              className="px-3 py-1.5 bg-[var(--accent)] text-white text-[12px] font-semibold rounded-[var(--radius-md)] flex items-center gap-1"
            >
              직원 선택 {mobileListOpen ? '▲' : '▼'}
            </button>
          </div>

          {/* 모바일 오버레이 드로워 */}
          {mobileListOpen && (
            <div className="md:hidden fixed inset-0 z-50 flex">
              {/* 배경 딤 */}
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setMobileListOpen(false)}
              />
              {/* 드로워 패널 */}
              <div className="relative z-10 w-[80%] max-w-xs h-full bg-[var(--card)] overflow-y-auto custom-scrollbar shadow-xl flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
                  <span className="text-[13px] font-bold text-[var(--foreground)]">직원 선택</span>
                  <button onClick={() => setMobileListOpen(false)} className="text-[var(--toss-gray-3)] text-lg leading-none px-1">✕</button>
                </div>
                <div className="p-4 flex-1">
                  {activeTab === '신규/변경계약서' && (
                    <div className="mb-4 p-4 bg-[var(--accent)] text-white rounded-[var(--radius-lg)] shadow-sm space-y-3 animate-in slide-in-from-top-4 duration-500">
                      <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-bold">비과세 항목 설정</h3>
                        <div className="flex gap-1.5 p-1 bg-[var(--card)]/10 rounded-lg">
                          <button onClick={() => setContractSubType('신규')} className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-all ${contractSubType === '신규' ? 'bg-[var(--card)] text-[var(--accent)]' : 'text-white hover:bg-[var(--card)]/10'}`}>신규</button>
                          <button onClick={() => setContractSubType('변경')} className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-all ${contractSubType === '변경' ? 'bg-[var(--card)] text-[var(--accent)]' : 'text-white hover:bg-[var(--card)]/10'}`}>변경</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2.5">
                        <label className="space-y-1 block">
                          <span className="text-[11px] font-bold">기본급 (월)</span>
                          <input type="number" value={salaryInfo.base_salary} onChange={(e) => setSalaryInfo({ ...salaryInfo, base_salary: Number(e.target.value) })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" />
                        </label>
                        <label className="space-y-1 block">
                          <span className="text-[11px] font-bold">식대 (한도 20만)</span>
                          <input type="number" value={salaryInfo.meal_allowance} onChange={(e) => setSalaryInfo({ ...salaryInfo, meal_allowance: Number(e.target.value) })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" />
                        </label>
                        <label className="space-y-1 block">
                          <span className="text-[11px] font-bold">적용일자</span>
                          <input type="text" value={salaryInfo.effective_date} onChange={(e) => setSalaryInfo({ ...salaryInfo, effective_date: e.target.value })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white selection:bg-[var(--card)]/30" placeholder="0000-00-00" />
                        </label>
                        <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-white/10 mt-1">
                          <label className="space-y-1 block">
                            <span className="text-[11px] font-bold">주당 시간</span>
                            <input type="number" value={salaryInfo.working_hours_per_week} onChange={(e) => setSalaryInfo({ ...salaryInfo, working_hours_per_week: Number.parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" inputMode="decimal" step="0.1" />
                          </label>
                          <label className="space-y-1 block">
                            <span className="text-[11px] font-bold">주당 일수</span>
                            <input type="number" value={salaryInfo.working_days_per_week} onChange={(e) => setSalaryInfo({ ...salaryInfo, working_days_per_week: Number(e.target.value) })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" />
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <label className="space-y-1 block">
                            <span className="text-[11px] font-bold">출근시간</span>
                            <input type="text" value={salaryInfo.shift_start_time} onChange={(e) => setSalaryInfo({ ...salaryInfo, shift_start_time: e.target.value })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" placeholder="09:00" />
                          </label>
                          <label className="space-y-1 block">
                            <span className="text-[11px] font-bold">퇴근시간</span>
                            <input type="text" value={salaryInfo.shift_end_time} onChange={(e) => setSalaryInfo({ ...salaryInfo, shift_end_time: e.target.value })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" placeholder="18:00" />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeTab === '연봉계약갱신' && (
                    <div className="mb-4 p-4 bg-[var(--foreground)] text-white rounded-[var(--radius-lg)] shadow-sm space-y-3 animate-in slide-in-from-top-4 duration-500">
                      <h3 className="text-sm font-bold text-[var(--accent)]">연봉 계약 갱신 설정</h3>
                      <div className="grid grid-cols-1 gap-2.5">
                        <label className="space-y-1 block">
                          <span className="text-[11px] font-bold">갱신 기본급</span>
                          <input type="number" value={salaryInfo.base_salary} onChange={(e) => setSalaryInfo({ ...salaryInfo, base_salary: Number(e.target.value) })} className="w-full px-3 py-2.5 bg-[var(--card)]/5 border border-white/10 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/10 text-white" />
                        </label>
                        <label className="space-y-1 block">
                          <span className="text-[11px] font-bold">적용 시작일</span>
                          <input type="text" value={salaryInfo.effective_date} onChange={(e) => setSalaryInfo({ ...salaryInfo, effective_date: e.target.value })} className="w-full px-3 py-2.5 bg-[var(--card)]/5 border border-white/10 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/10 text-white selection:bg-[var(--card)]/20" placeholder="0000-00-00" />
                        </label>
                      </div>
                    </div>
                  )}
                  <ContractList
                    selectedCo={selectedCo as string}
                    staffs={staffs as any[]}
                    contracts={contracts}
                    onSelect={(id: number) => { setSelectedStaffId(id); setMobileListOpen(false); }}
                    checkedIds={checkedIds}
                    setCheckedIds={setCheckedIds}
                    isCompact={true}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 데스크탑 좌측 패널 */}
          <div className="hidden md:block md:w-1/3 lg:w-1/4 border-r border-[var(--border)] bg-[var(--card)] overflow-y-auto custom-scrollbar">
            <div className="p-4">
              {activeTab === '신규/변경계약서' && (
                <div className="mb-4 p-5 bg-[var(--accent)] text-white rounded-[var(--radius-lg)] shadow-sm space-y-4 animate-in slide-in-from-top-4 duration-500">
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-bold">비과세 항목 설정</h3>
                    <div className="flex gap-1.5 p-1 bg-[var(--card)]/10 rounded-lg">
                      <button onClick={() => setContractSubType('신규')} className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-all ${contractSubType === '신규' ? 'bg-[var(--card)] text-[var(--accent)]' : 'text-white hover:bg-[var(--card)]/10'}`}>신규</button>
                      <button onClick={() => setContractSubType('변경')} className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-all ${contractSubType === '변경' ? 'bg-[var(--card)] text-[var(--accent)]' : 'text-white hover:bg-[var(--card)]/10'}`}>변경</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <label className="space-y-1 block">
                      <span className="text-[11px] font-bold">기본급 (월)</span>
                      <input type="number" value={salaryInfo.base_salary} onChange={(e) => setSalaryInfo({ ...salaryInfo, base_salary: Number(e.target.value) })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" />
                    </label>
                    <label className="space-y-1 block">
                      <span className="text-[11px] font-bold">식대 (한도 20만)</span>
                      <input type="number" value={salaryInfo.meal_allowance} onChange={(e) => setSalaryInfo({ ...salaryInfo, meal_allowance: Number(e.target.value) })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" />
                    </label>
                    <label className="space-y-1 block">
                      <span className="text-[11px] font-bold">적용일자</span>
                      <input type="text" value={salaryInfo.effective_date} onChange={(e) => setSalaryInfo({ ...salaryInfo, effective_date: e.target.value })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white selection:bg-[var(--card)]/30" placeholder="0000-00-00" />
                    </label>
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10 mt-2">
                      <label className="space-y-1 block">
                        <span className="text-[11px] font-bold">주당 시간</span>
                        <input type="number" value={salaryInfo.working_hours_per_week} onChange={(e) => setSalaryInfo({ ...salaryInfo, working_hours_per_week: Number.parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" inputMode="decimal" step="0.1" />
                      </label>
                      <label className="space-y-1 block">
                        <span className="text-[11px] font-bold">주당 일수</span>
                        <input type="number" value={salaryInfo.working_days_per_week} onChange={(e) => setSalaryInfo({ ...salaryInfo, working_days_per_week: Number(e.target.value) })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1 block">
                        <span className="text-[11px] font-bold">출근시간</span>
                        <input type="text" value={salaryInfo.shift_start_time} onChange={(e) => setSalaryInfo({ ...salaryInfo, shift_start_time: e.target.value })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" placeholder="09:00" />
                      </label>
                      <label className="space-y-1 block">
                        <span className="text-[11px] font-bold">퇴근시간</span>
                        <input type="text" value={salaryInfo.shift_end_time} onChange={(e) => setSalaryInfo({ ...salaryInfo, shift_end_time: e.target.value })} className="w-full px-3 py-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" placeholder="18:00" />
                      </label>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === '연봉계약갱신' && (
                <div className="mb-4 p-5 bg-[var(--foreground)] text-white rounded-[var(--radius-lg)] shadow-sm space-y-4 animate-in slide-in-from-top-4 duration-500">
                  <h3 className="text-sm font-bold text-[var(--accent)]">연봉 계약 갱신 설정</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <label className="space-y-1 block">
                      <span className="text-[11px] font-bold">갱신 기본급</span>
                      <input type="number" value={salaryInfo.base_salary} onChange={(e) => setSalaryInfo({ ...salaryInfo, base_salary: Number(e.target.value) })} className="w-full px-3 py-2.5 bg-[var(--card)]/5 border border-white/10 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/10 text-white" />
                    </label>
                    <label className="space-y-1 block">
                      <span className="text-[11px] font-bold">적용 시작일</span>
                      <input type="text" value={salaryInfo.effective_date} onChange={(e) => setSalaryInfo({ ...salaryInfo, effective_date: e.target.value })} className="w-full px-3 py-2.5 bg-[var(--card)]/5 border border-white/10 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/10 text-white selection:bg-[var(--card)]/20" placeholder="0000-00-00" />
                    </label>
                  </div>
                </div>
              )}
              <ContractList selectedCo={selectedCo as string} staffs={staffs as any[]} contracts={contracts} onSelect={setSelectedStaffId} checkedIds={checkedIds} setCheckedIds={setCheckedIds} isCompact={true} />
            </div>
          </div>

          {/* 우측: 계약서 대화면 프리뷰 (Live Preview) */}
          <div className="flex-1 bg-[var(--page-bg)] overflow-y-auto custom-scrollbar p-5">
            <div className="max-w-[850px] mx-auto">
              {(() => {
                const staffList = staffs as any[];
                return (
                  <ContractPreview
                    staff={staffList.find((s: any) => s.id === selectedStaffId)}
                    contract={contracts.find((c: any) => c.staff_id === selectedStaffId)}
                  />
                );
              })()}
            </div>
          </div>
        </div>
        )}
      </div>

      <RiskActionDialog
        open={showSignatureReview}
        title="계약 발송 전 영향 범위 확인"
        description="선택한 직원에게 전자서명 요청과 알림이 발송됩니다. 연봉/변경 계약은 직원 급여 정보도 함께 갱신될 수 있습니다."
        targetLabel={`${getContractType()} · ${selectedContractStaffs.length}명`}
        tone="warning"
        loading={loading}
        items={[
          { label: '계약 유형', value: getContractType() },
          { label: '대상자', value: selectedContractStaffs.length > 0 ? selectedContractStaffs.slice(0, 4).map((staff: any) => staff.name).join(', ') + (selectedContractStaffs.length > 4 ? ` 외 ${selectedContractStaffs.length - 4}명` : '') : '-' },
          { label: '적용일', value: salaryInfo.effective_date || '직원 입사일 기준' },
          { label: '기본급', value: activeTab === '계약현황' ? '직원 현재 기본급 사용' : formatWon(salaryInfo.base_salary) },
          { label: '주당 근무', value: activeTab === '계약현황' ? '직원별 현재 근무유형 사용' : `${salaryInfo.working_hours_per_week}시간 · ${salaryInfo.working_days_per_week}일` },
          { label: '근무 시간', value: activeTab === '계약현황' ? '직원별 현재 근무유형 사용' : `${salaryInfo.shift_start_time} - ${salaryInfo.shift_end_time}` },
        ]}
        changes={activeTab === '계약현황' ? [] : [
          { label: '계약 상태', before: '미발송/반려', after: '서명대기' },
          { label: '기본급', before: '직원별 기존 값', after: formatWon(salaryInfo.base_salary) },
          { label: '식대', before: '직원별 기존 값', after: formatWon(salaryInfo.meal_allowance) },
        ]}
        impacts={[
          'employment_contracts에 서명대기 계약 레코드가 생성 또는 갱신됩니다.',
          '선택 직원에게 계약서 서명 요청 알림이 발송됩니다.',
          activeTab === '계약현황'
            ? '표준근로계약서는 직원의 현재 급여/근무 조건을 기준으로 생성됩니다.'
            : '신규/변경/연봉 계약은 입력한 급여 항목이 직원 마스터에도 반영됩니다.',
        ]}
        warnings={[
          '계약 발송 후 직원 로그인 시 즉시 서명 화면이 표시됩니다.',
          '연봉 갱신과 변경 계약은 적용일과 비과세 한도를 다시 확인하세요.',
        ]}
        confirmLabel="계약 발송"
        onCancel={() => setShowSignatureReview(false)}
        onConfirm={async () => {
          await handleRequestSignature();
          setShowSignatureReview(false);
        }}
      />
    </div>
  );
}

'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import ContractList from './계약문서/계약서명단';
import ContractPreview from './계약문서/계약서미리보기';
import ContractTemplateEditor from './계약문서/계약서양식편집';

export default function ContractMain({ staffs, selectedCo, onRefresh }: Record<string, unknown>) {
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('계약현황');
  const [contractSubType, setContractSubType] = useState<'신규' | '변경'>('신규'); // 신규/변경계약서용

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

  const fetchContracts = async () => {
    const { data, error } = await supabase.from('employment_contracts').select('*');
    if (!error && data) setContracts(data);
  };

  useEffect(() => { fetchContracts(); }, []);

  const handleRequestSignature = async () => {
    if (checkedIds.length === 0) return toast("직원을 선택해주세요.", 'warning');
    setLoading(true);
    try {
      const includeTaxFree = activeTab === '연봉계약갱신' || activeTab === '신규/변경계약서';
      const contractType = activeTab === '연봉계약갱신' ? '연봉계약서'
        : activeTab === '신규/변경계약서' ? (contractSubType === '신규' ? '신규계약서' : '변경계약서')
          : '표준근로계약서';

      // 선택된 직원들의 shift_id로 근무형태 데이터 일괄 조회
      const shiftIds = [...new Set(checkedIds.map((staffId: number) => {
        const s = (staffs as any[])?.find((x: any) => x.id === staffId);
        return s?.shift_id;
      }).filter(Boolean))];
      let shiftMap: Record<string, any> = {};
      if (shiftIds.length > 0) {
        const { data: shiftRows } = await supabase
          .from('work_shifts')
          .select('id, start_time, end_time, break_start_time, break_end_time')
          .in('id', shiftIds);
        if (shiftRows) shiftMap = Object.fromEntries(shiftRows.map((sh: any) => [sh.id, sh]));
      }

      const requests = checkedIds.map((staffId: number) => {
        const s = (staffs as any[])?.find((x: any) => x.id === staffId);
        const probationMonths = s?.permissions?.probation_months || 0;
        const joinDate = s?.joined_at || s?.join_date;

        // 근로조건 적용일 계산 (수습 종료 익일)
        let conditionsAppDate = salaryInfo.effective_date;
        if (joinDate && probationMonths > 0) {
          const d = new Date(joinDate as string);
          d.setMonth(d.getMonth() + probationMonths);
          conditionsAppDate = d.toISOString().split('T')[0];
        }

        // 직원에게 지정된 근무형태 데이터 (없으면 salaryInfo 폼 값 사용)
        const staffShift = shiftMap[s?.shift_id];

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
          working_hours_per_week: s?.working_hours_per_week || salaryInfo.working_hours_per_week || 40,
          working_days_per_week: s?.working_days_per_week || salaryInfo.working_days_per_week || 5,
          shift_id: s?.shift_id || null,
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

      await supabase.from('employment_contracts').upsert(requests, { onConflict: 'staff_id,contract_type,status' });


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
      <header className="p-5 border-b border-[var(--border)] bg-[var(--card)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)] tracking-tight">전자 계약 및 법적 비과세 관리 <span className="text-sm text-[var(--accent)] ml-2">[{selectedCo as string}]</span></h2>
          <div className="flex gap-0.5 p-1 app-tab-bar w-fit mt-2">
            {['계약현황', '신규/변경계약서', '연봉계약갱신', '양식 편집'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${activeTab === tab ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-[var(--card)]/60'}`}>{tab}</button>
            ))}
          </div>
        </div>
        {activeTab !== '양식 편집' && (
          <button onClick={handleRequestSignature} disabled={loading || checkedIds.length === 0} className="px-4 py-3 bg-[var(--foreground)] text-white text-[11px] font-semibold rounded-[var(--radius-md)] shadow-sm hover:scale-[0.98] transition-all disabled:opacity-50">
            {loading ? '처리 중...' : `${activeTab === '연봉계약갱신' ? '연봉 갱신 및 계약 발송' : activeTab === '신규/변경계약서' ? `${contractSubType} 계약서 발송` : '근로계약서 발송'} (${checkedIds.length}명)`}
          </button>
        )}
      </header>

      <div className="flex-1 overflow-hidden">
        {/* 양식 편집 탭: 전체 화면 에디터 */}
        {activeTab === '양식 편집' ? (
          <ContractTemplateEditor selectedCo={selectedCo as string} />
        ) : (
        <div className="flex h-full">
          {/* 좌측: 계약 대상자 명단 (Compact List) */}
          <div className="w-1/3 lg:w-1/4 border-r border-[var(--border)] bg-[var(--card)] overflow-y-auto custom-scrollbar">
            <div className="p-4">
              {activeTab === '신규/변경계약서' && (
                <div className="mb-4 p-5 bg-[var(--accent)] text-white rounded-[var(--radius-lg)] shadow-sm space-y-4 animate-in slide-in-from-top-4 duration-500">
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-bold">비과세 항목 설정</h3>
                    <div className="flex gap-1.5 p-1 bg-[var(--card)]/10 rounded-lg">
                      <button onClick={() => setContractSubType('신규')} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${contractSubType === '신규' ? 'bg-[var(--card)] text-[var(--accent)]' : 'text-white hover:bg-[var(--card)]/10'}`}>신규</button>
                      <button onClick={() => setContractSubType('변경')} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${contractSubType === '변경' ? 'bg-[var(--card)] text-[var(--accent)]' : 'text-white hover:bg-[var(--card)]/10'}`}>변경</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-80">기본급 (월)</label>
                      <input type="number" value={salaryInfo.base_salary} onChange={(e) => setSalaryInfo({ ...salaryInfo, base_salary: Number(e.target.value) })} className="w-full p-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-80">식대 (한도 20만)</label>
                      <input type="number" value={salaryInfo.meal_allowance} onChange={(e) => setSalaryInfo({ ...salaryInfo, meal_allowance: Number(e.target.value) })} className="w-full p-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-80">적용일자</label>
                      <input type="text" value={salaryInfo.effective_date} onChange={(e) => setSalaryInfo({ ...salaryInfo, effective_date: e.target.value })} className="w-full p-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white selection:bg-[var(--card)]/30" placeholder="0000-00-00" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10 mt-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-80">주당 시간</label>
                        <input type="number" value={salaryInfo.working_hours_per_week} onChange={(e) => setSalaryInfo({ ...salaryInfo, working_hours_per_week: Number(e.target.value) })} className="w-full p-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-80">주당 일수</label>
                        <input type="number" value={salaryInfo.working_days_per_week} onChange={(e) => setSalaryInfo({ ...salaryInfo, working_days_per_week: Number(e.target.value) })} className="w-full p-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-80">출근시간</label>
                        <input type="text" value={salaryInfo.shift_start_time} onChange={(e) => setSalaryInfo({ ...salaryInfo, shift_start_time: e.target.value })} className="w-full p-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" placeholder="09:00" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-80">퇴근시간</label>
                        <input type="text" value={salaryInfo.shift_end_time} onChange={(e) => setSalaryInfo({ ...salaryInfo, shift_end_time: e.target.value })} className="w-full p-2.5 bg-[var(--card)]/10 border border-white/20 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/20 text-white" placeholder="18:00" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === '연봉계약갱신' && (
                <div className="mb-4 p-5 bg-slate-800 text-white rounded-[var(--radius-lg)] shadow-sm space-y-4 animate-in slide-in-from-top-4 duration-500">
                  <h3 className="text-sm font-bold text-blue-400">연봉 계약 갱신 설정</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-70">갱신 기본급</label>
                      <input type="number" value={salaryInfo.base_salary} onChange={(e) => setSalaryInfo({ ...salaryInfo, base_salary: Number(e.target.value) })} className="w-full p-2.5 bg-[var(--card)]/5 border border-white/10 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/10 text-white" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-70">적용 시작일</label>
                      <input type="text" value={salaryInfo.effective_date} onChange={(e) => setSalaryInfo({ ...salaryInfo, effective_date: e.target.value })} className="w-full p-2.5 bg-[var(--card)]/5 border border-white/10 rounded-[var(--radius-md)] font-bold text-xs outline-none focus:bg-[var(--card)]/10 text-white selection:bg-[var(--card)]/20" placeholder="0000-00-00" />
                    </div>
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
    </div>
  );
}

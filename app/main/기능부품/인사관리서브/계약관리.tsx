'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import ContractList from './계약문서/계약서명단';
import ContractPreview from './계약문서/계약서미리보기';

export default function ContractMain({ staffs, selectedCo, onRefresh }: any) {
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
    if (checkedIds.length === 0) return alert("직원을 선택해주세요.");
    setLoading(true);
    try {
      const includeTaxFree = activeTab === '연봉계약갱신' || activeTab === '신규/변경계약서';
      const contractType = activeTab === '연봉계약갱신' ? '연봉계약서'
        : activeTab === '신규/변경계약서' ? (contractSubType === '신규' ? '신규계약서' : '변경계약서')
          : '표준근로계약서';

      const requests = checkedIds.map((staffId: number) => {
        const s = staffs?.find((x: any) => x.id === staffId);
        const pay = includeTaxFree
          ? {
            base_salary: salaryInfo.base_salary ?? s?.base_salary ?? 0,
            meal_allowance: salaryInfo.meal_allowance ?? s?.meal_allowance ?? 0,
            vehicle_allowance: salaryInfo.vehicle_allowance ?? s?.vehicle_allowance ?? 0,
            childcare_allowance: salaryInfo.childcare_allowance ?? s?.childcare_allowance ?? 0,
            position_allowance: salaryInfo.position_allowance ?? s?.position_allowance ?? 0,
            research_allowance: salaryInfo.research_allowance ?? s?.research_allowance ?? 0,
            other_taxfree: salaryInfo.other_taxfree ?? s?.other_taxfree ?? 0,
            effective_date: salaryInfo.effective_date
          }
          : {
            base_salary: s?.base_salary ?? 0,
            meal_allowance: s?.meal_allowance ?? 0,
            vehicle_allowance: s?.vehicle_allowance ?? 0,
            childcare_allowance: s?.childcare_allowance ?? 0,
            position_allowance: s?.position_allowance ?? 0,
            research_allowance: s?.research_allowance ?? 0,
            other_taxfree: s?.other_taxfree ?? 0,
            effective_date: salaryInfo.effective_date
          };
        return {
          staff_id: staffId,
          status: '서명대기',
          requested_at: new Date().toISOString(),
          contract_type: contractType,
          working_hours_per_week: salaryInfo.working_hours_per_week ?? s?.working_hours_per_week ?? 40,
          working_days_per_week: salaryInfo.working_days_per_week ?? s?.working_days_per_week ?? 5,
          shift_start_time: salaryInfo.shift_start_time ?? '09:00',
          shift_end_time: salaryInfo.shift_end_time ?? '18:00',
          break_start_time: salaryInfo.break_start_time ?? '12:00',
          break_end_time: salaryInfo.break_end_time ?? '13:00',
          ...pay
        };
      });

      await supabase.from('employment_contracts').upsert(requests, { onConflict: 'staff_id,contract_type,status' });


      if (includeTaxFree) {
        await Promise.all(checkedIds.map((id: number) => {
          const s = staffs?.find((x: any) => x.id === id);
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
          is_read: false
        }))
      );

      alert("계약서가 발송되었습니다. 직원이 로그인 시 즉시 서명 화면이 표시됩니다.");
      fetchContracts(); setCheckedIds([]); if (onRefresh) onRefresh();
    } catch (err) { alert("오류가 발생했습니다."); } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 bg-[var(--tab-bg)]/20">
      <header className="p-8 border-b border-[var(--toss-border)] bg-[var(--toss-card)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)] tracking-tight">전자 계약 및 법적 비과세 관리 <span className="text-sm text-[var(--toss-blue)] ml-2">[{selectedCo}]</span></h2>
          <div className="flex gap-0.5 p-1 app-tab-bar w-fit mt-2">
            {['계약현황', '신규/변경계약서', '연봉계약갱신'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${activeTab === tab ? 'bg-[var(--toss-card)] text-[var(--toss-blue)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-[var(--toss-card)]/60'}`}>{tab}</button>
            ))}
          </div>
        </div>
        <button onClick={handleRequestSignature} disabled={loading || checkedIds.length === 0} className="px-6 py-3 bg-[var(--foreground)] text-white text-[11px] font-semibold rounded-[12px] shadow-xl hover:scale-[0.98] transition-all disabled:opacity-50">
          {loading ? '처리 중...' : `${activeTab === '연봉계약갱신' ? '연봉 갱신 및 계약 발송' : activeTab === '신규/변경계약서' ? `${contractSubType} 계약서 발송` : '근로계약서 발송'} (${checkedIds.length}명)`}
        </button>
      </header>

      <div className="flex-1 overflow-hidden">
        <div className="flex h-full">
          {/* 좌측: 계약 대상자 명단 (Compact List) */}
          <div className="w-1/3 lg:w-1/4 border-r border-[var(--toss-border)] bg-[var(--toss-card)] overflow-y-auto custom-scrollbar">
            <div className="p-6">
              {activeTab === '신규/변경계약서' && (
                <div className="mb-6 p-5 bg-[var(--toss-blue)] text-white rounded-[16px] shadow-sm space-y-4 animate-in slide-in-from-top-4 duration-500">
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-bold">비과세 항목 설정</h3>
                    <div className="flex gap-1.5 p-1 bg-white/10 rounded-lg">
                      <button onClick={() => setContractSubType('신규')} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${contractSubType === '신규' ? 'bg-white text-[var(--toss-blue)]' : 'text-white hover:bg-white/10'}`}>신규</button>
                      <button onClick={() => setContractSubType('변경')} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${contractSubType === '변경' ? 'bg-white text-[var(--toss-blue)]' : 'text-white hover:bg-white/10'}`}>변경</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-80">기본급 (월)</label>
                      <input type="number" value={salaryInfo.base_salary} onChange={(e) => setSalaryInfo({ ...salaryInfo, base_salary: Number(e.target.value) })} className="w-full p-2.5 bg-white/10 border border-white/20 rounded-[8px] font-bold text-xs outline-none focus:bg-white/20 text-white" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-80">식대 (한도 20만)</label>
                      <input type="number" value={salaryInfo.meal_allowance} onChange={(e) => setSalaryInfo({ ...salaryInfo, meal_allowance: Number(e.target.value) })} className="w-full p-2.5 bg-white/10 border border-white/20 rounded-[8px] font-bold text-xs outline-none focus:bg-white/20 text-white" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-80">적용일자</label>
                      <input type="text" value={salaryInfo.effective_date} onChange={(e) => setSalaryInfo({ ...salaryInfo, effective_date: e.target.value })} className="w-full p-2.5 bg-white/10 border border-white/20 rounded-[8px] font-bold text-xs outline-none focus:bg-white/20 text-white selection:bg-white/30" placeholder="0000-00-00" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10 mt-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-80">주당 시간</label>
                        <input type="number" value={salaryInfo.working_hours_per_week} onChange={(e) => setSalaryInfo({ ...salaryInfo, working_hours_per_week: Number(e.target.value) })} className="w-full p-2.5 bg-white/10 border border-white/20 rounded-[8px] font-bold text-xs outline-none focus:bg-white/20 text-white" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-80">주당 일수</label>
                        <input type="number" value={salaryInfo.working_days_per_week} onChange={(e) => setSalaryInfo({ ...salaryInfo, working_days_per_week: Number(e.target.value) })} className="w-full p-2.5 bg-white/10 border border-white/20 rounded-[8px] font-bold text-xs outline-none focus:bg-white/20 text-white" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-80">출근시간</label>
                        <input type="text" value={salaryInfo.shift_start_time} onChange={(e) => setSalaryInfo({ ...salaryInfo, shift_start_time: e.target.value })} className="w-full p-2.5 bg-white/10 border border-white/20 rounded-[8px] font-bold text-xs outline-none focus:bg-white/20 text-white" placeholder="09:00" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-80">퇴근시간</label>
                        <input type="text" value={salaryInfo.shift_end_time} onChange={(e) => setSalaryInfo({ ...salaryInfo, shift_end_time: e.target.value })} className="w-full p-2.5 bg-white/10 border border-white/20 rounded-[8px] font-bold text-xs outline-none focus:bg-white/20 text-white" placeholder="18:00" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === '연봉계약갱신' && (
                <div className="mb-6 p-5 bg-slate-800 text-white rounded-[16px] shadow-sm space-y-4 animate-in slide-in-from-top-4 duration-500">
                  <h3 className="text-sm font-bold text-blue-400">연봉 계약 갱신 설정</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-70">갱신 기본급</label>
                      <input type="number" value={salaryInfo.base_salary} onChange={(e) => setSalaryInfo({ ...salaryInfo, base_salary: Number(e.target.value) })} className="w-full p-2.5 bg-white/5 border border-white/10 rounded-[8px] font-bold text-xs outline-none focus:bg-white/10 text-white" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-70">적용 시작일</label>
                      <input type="text" value={salaryInfo.effective_date} onChange={(e) => setSalaryInfo({ ...salaryInfo, effective_date: e.target.value })} className="w-full p-2.5 bg-white/5 border border-white/10 rounded-[8px] font-bold text-xs outline-none focus:bg-white/10 text-white selection:bg-white/20" placeholder="0000-00-00" />
                    </div>
                  </div>
                </div>
              )}
              <ContractList selectedCo={selectedCo} staffs={staffs} contracts={contracts} onSelect={setSelectedStaffId} checkedIds={checkedIds} setCheckedIds={setCheckedIds} isCompact={true} />
            </div>
          </div>

          {/* 우측: 계약서 대화면 프리뷰 (Live Preview) */}
          <div className="flex-1 bg-[var(--page-bg)] overflow-y-auto custom-scrollbar p-10">
            <div className="max-w-[850px] mx-auto">
              <ContractPreview
                staff={staffs.find((s: any) => s.id === selectedStaffId)}
                contract={contracts.find((c: any) => c.staff_id === selectedStaffId)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    effective_date: new Date().toISOString().split('T')[0]
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
          ...pay
        };
      });

      await supabase.from('employment_contracts').upsert(requests, { onConflict: 'staff_id' });

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
      
      alert("계약서가 발송되었습니다. 직원이 로그인 시 즉시 서명 화면이 표시됩니다.");
      fetchContracts(); setCheckedIds([]); if (onRefresh) onRefresh();
    } catch (err) { alert("오류가 발생했습니다."); } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 bg-[var(--tab-bg)]/20">
      <header className="p-8 border-b border-[var(--toss-border)] bg-[var(--toss-card)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)] tracking-tighter italic">전자 계약 및 법적 비과세 관리 <span className="text-sm text-[var(--toss-blue)] ml-2">[{selectedCo}]</span></h2>
          <div className="flex gap-0.5 p-1 app-tab-bar w-fit mt-2">
            {['계약현황', '신규/변경계약서', '연봉계약갱신'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${activeTab === tab ? 'bg-[var(--toss-card)] text-[var(--toss-blue)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-[var(--toss-card)]/60'}`}>{tab}</button>
            ))}
          </div>
        </div>
        <button onClick={handleRequestSignature} disabled={loading || checkedIds.length === 0} className="px-6 py-3 bg-[var(--foreground)] text-white text-[11px] font-semibold rounded-lg shadow-xl hover:scale-[0.98] transition-all disabled:opacity-50">
          {loading ? '처리 중...' : `${activeTab === '연봉계약갱신' ? '연봉 갱신 및 계약 발송' : activeTab === '신규/변경계약서' ? `${contractSubType} 계약서 발송` : '근로계약서 발송'} (${checkedIds.length}명)`}
        </button>
      </header>

      <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-8">
            {activeTab === '신규/변경계약서' && (
              <div className="p-8 bg-[var(--toss-blue)] text-white rounded-[2rem] shadow-xl space-y-6 animate-in slide-in-from-top-4 duration-500">
                <div className="flex gap-4 items-center">
                  <h3 className="text-lg font-bold">각종 비과세 항목 등록 (신규/변경 계약서)</h3>
                  <div className="flex gap-2">
                    <button onClick={() => setContractSubType('신규')} className={`px-4 py-2 rounded-[12px] text-[11px] font-semibold transition-all ${contractSubType === '신규' ? 'bg-[var(--toss-card)] text-[var(--toss-blue)]' : 'bg-[var(--toss-card)]/20 hover:bg-[var(--toss-card)]/30'}`}>신규 계약서</button>
                    <button onClick={() => setContractSubType('변경')} className={`px-4 py-2 rounded-[12px] text-[11px] font-semibold transition-all ${contractSubType === '변경' ? 'bg-[var(--toss-card)] text-[var(--toss-blue)]' : 'bg-[var(--toss-card)]/20 hover:bg-[var(--toss-card)]/30'}`}>변경 계약서</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-90">기본급 (월)</label>
                    <input type="number" value={salaryInfo.base_salary} onChange={(e) => setSalaryInfo({...salaryInfo, base_salary: Number(e.target.value)})} className="w-full p-3 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-90">식대 (비과세 한도 20만)</label>
                    <input type="number" value={salaryInfo.meal_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, meal_allowance: Number(e.target.value)})} className="w-full p-3 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-90">자가운전 (비과세 한도 20만)</label>
                    <input type="number" value={salaryInfo.vehicle_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, vehicle_allowance: Number(e.target.value)})} className="w-full p-3 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-90">보육수당 (20만원)</label>
                    <input type="number" value={salaryInfo.childcare_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, childcare_allowance: Number(e.target.value)})} className="w-full p-3 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-90">직책수당</label>
                    <input type="number" value={salaryInfo.position_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, position_allowance: Number(e.target.value)})} className="w-full p-3 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-90">연구활동비 (비과세 한도 20만)</label>
                    <input type="number" value={salaryInfo.research_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, research_allowance: Number(e.target.value)})} className="w-full p-3 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-90">기타 비과세</label>
                    <input type="number" value={salaryInfo.other_taxfree} onChange={(e) => setSalaryInfo({...salaryInfo, other_taxfree: Number(e.target.value)})} className="w-full p-3 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-90">적용 시작일</label>
                    <input type="date" value={salaryInfo.effective_date} onChange={(e) => setSalaryInfo({...salaryInfo, effective_date: e.target.value})} className="w-full p-3 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 text-white" />
                  </div>
                </div>
                <p className="text-[11px] opacity-90">* 발송된 계약서는 직원이 로그인 시 즉시 서명 화면으로 표시됩니다.</p>
              </div>
            )}
            {activeTab === '연봉계약갱신' && (
              <div className="p-8 bg-[var(--toss-blue)] text-white rounded-[2rem] shadow-xl space-y-6 animate-in slide-in-from-top-4 duration-500">
                <h3 className="text-lg font-bold">법적 비과세 항목 및 연봉 설정</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-70">기본급 (월)</label>
                    <input type="number" value={salaryInfo.base_salary} onChange={(e) => setSalaryInfo({...salaryInfo, base_salary: Number(e.target.value)})} className="w-full p-4 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 transition-all text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-70">식대 (비과세 한도 20만)</label>
                    <input type="number" value={salaryInfo.meal_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, meal_allowance: Number(e.target.value)})} className="w-full p-4 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 transition-all text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-70">자가운전 (비과세 한도 20만)</label>
                    <input type="number" value={salaryInfo.vehicle_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, vehicle_allowance: Number(e.target.value)})} className="w-full p-4 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 transition-all text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-70">보육수당 (20만원)</label>
                    <input type="number" value={salaryInfo.childcare_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, childcare_allowance: Number(e.target.value)})} className="w-full p-4 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 transition-all text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-70">직책수당</label>
                    <input type="number" value={salaryInfo.position_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, position_allowance: Number(e.target.value)})} className="w-full p-4 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 transition-all text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-70">연구활동비 (비과세 한도 20만)</label>
                    <input type="number" value={salaryInfo.research_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, research_allowance: Number(e.target.value)})} className="w-full p-4 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 transition-all text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase opacity-70">적용 시작일</label>
                    <input type="date" value={salaryInfo.effective_date} onChange={(e) => setSalaryInfo({...salaryInfo, effective_date: e.target.value})} className="w-full p-4 bg-white/10 border border-white/20 rounded-lg font-semibold text-sm outline-none focus:bg-white/20 transition-all text-white" />
                  </div>
                </div>
              </div>
            )}
            <ContractList selectedCo={selectedCo} staffs={staffs} contracts={contracts} onSelect={setSelectedStaffId} checkedIds={checkedIds} setCheckedIds={setCheckedIds} />
          </div>
          <aside className="space-y-8">
            <ContractPreview staff={staffs.find((s: any) => s.id === selectedStaffId)} contract={contracts.find((c: any) => c.staff_id === selectedStaffId)} />
          </aside>
        </div>
      </div>
    </div>
  );
}

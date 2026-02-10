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

  // 확장된 비과세 항목 상태
  const [salaryInfo, setSalaryInfo] = useState({
    base_salary: 0,
    meal_allowance: 200000, // 식대 (2024 한도 20만)
    vehicle_allowance: 0,   // 자가운전 (한도 20만)
    childcare_allowance: 0, // 보육수당 (한도 10만)
    research_allowance: 0,  // 연구활동비 (한도 20만)
    other_taxfree: 0,       // 기타 비과세
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
      const requests = checkedIds.map(staffId => ({
        staff_id: staffId,
        status: '서명대기',
        requested_at: new Date().toISOString(),
        contract_type: activeTab === '연봉계약갱신' ? '연봉계약서' : '표준근로계약서',
        ...(activeTab === '연봉계약갱신' && {
          base_salary: salaryInfo.base_salary,
          meal_allowance: salaryInfo.meal_allowance,
          vehicle_allowance: salaryInfo.vehicle_allowance,
          childcare_allowance: salaryInfo.childcare_allowance,
          research_allowance: salaryInfo.research_allowance,
          other_taxfree: salaryInfo.other_taxfree,
          effective_date: salaryInfo.effective_date
        })
      }));

      await supabase.from('employment_contracts').upsert(requests, { onConflict: 'staff_id' });

      if (activeTab === '연봉계약갱신') {
        await Promise.all(checkedIds.map(id => 
          supabase.from('staff_members').update({
            base_salary: salaryInfo.base_salary,
            meal_allowance: salaryInfo.meal_allowance,
            vehicle_allowance: salaryInfo.vehicle_allowance,
            childcare_allowance: salaryInfo.childcare_allowance,
            research_allowance: salaryInfo.research_allowance,
            other_taxfree: salaryInfo.other_taxfree
          }).eq('id', id)
        ));
      }
      
      alert("계약서 발송 및 정보 업데이트가 완료되었습니다.");
      fetchContracts(); setCheckedIds([]); if (onRefresh) onRefresh();
    } catch (err) { alert("오류가 발생했습니다."); } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 bg-gray-50/20">
      <header className="p-8 border-b border-gray-100 bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-xl font-black text-gray-800 tracking-tighter italic">전자 계약 및 법적 비과세 관리 <span className="text-sm text-blue-600 ml-2">[{selectedCo}]</span></h2>
          <div className="flex gap-4 mt-2">
            {['계약현황', '연봉계약갱신'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`text-[11px] font-black tracking-widest uppercase transition-all ${activeTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-300 hover:text-gray-500'}`}>{tab}</button>
            ))}
          </div>
        </div>
        <button onClick={handleRequestSignature} disabled={loading || checkedIds.length === 0} className="px-6 py-3 bg-gray-900 text-white text-[11px] font-black rounded-xl shadow-xl hover:scale-[0.98] transition-all disabled:opacity-50">
          {loading ? '처리 중...' : `${activeTab === '연봉계약갱신' ? '연봉 갱신 및 계약 발송' : '근로계약서 발송'} (${checkedIds.length}명)`}
        </button>
      </header>

      <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-8">
            {activeTab === '연봉계약갱신' && (
              <div className="p-8 bg-blue-600 text-white rounded-[2.5rem] shadow-2xl space-y-6 animate-in slide-in-from-top-4 duration-500">
                <h3 className="text-lg font-black italic">법적 비과세 항목 및 연봉 설정</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase opacity-70">기본급 (월)</label>
                    <input type="number" value={salaryInfo.base_salary} onChange={(e) => setSalaryInfo({...salaryInfo, base_salary: Number(e.target.value)})} className="w-full p-4 bg-white/10 border border-white/20 rounded-xl font-black text-sm outline-none focus:bg-white/20 transition-all text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase opacity-70">식대 (비과세 한도 20만)</label>
                    <input type="number" value={salaryInfo.meal_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, meal_allowance: Number(e.target.value)})} className="w-full p-4 bg-white/10 border border-white/20 rounded-xl font-black text-sm outline-none focus:bg-white/20 transition-all text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase opacity-70">자가운전 (비과세 한도 20만)</label>
                    <input type="number" value={salaryInfo.vehicle_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, vehicle_allowance: Number(e.target.value)})} className="w-full p-4 bg-white/10 border border-white/20 rounded-xl font-black text-sm outline-none focus:bg-white/20 transition-all text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase opacity-70">보육수당 (비과세 한도 10만)</label>
                    <input type="number" value={salaryInfo.childcare_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, childcare_allowance: Number(e.target.value)})} className="w-full p-4 bg-white/10 border border-white/20 rounded-xl font-black text-sm outline-none focus:bg-white/20 transition-all text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase opacity-70">연구활동비 (비과세 한도 20만)</label>
                    <input type="number" value={salaryInfo.research_allowance} onChange={(e) => setSalaryInfo({...salaryInfo, research_allowance: Number(e.target.value)})} className="w-full p-4 bg-white/10 border border-white/20 rounded-xl font-black text-sm outline-none focus:bg-white/20 transition-all text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase opacity-70">적용 시작일</label>
                    <input type="date" value={salaryInfo.effective_date} onChange={(e) => setSalaryInfo({...salaryInfo, effective_date: e.target.value})} className="w-full p-4 bg-white/10 border border-white/20 rounded-xl font-black text-sm outline-none focus:bg-white/20 transition-all text-white" />
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

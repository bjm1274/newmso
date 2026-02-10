'use client';
import { useState } from 'react';
import SalaryDetail from './급여명세/급여상세';
import PayrollTable from './급여명세/급여대장표';
import CompliancePanel from './급여명세/노무준수패널';
import InterimSettlement from './급여명세/중간정산';
import YearEndSettlement from './급여명세/연말정산';
import SalarySettlement from './급여명세/급여정산';

export default function PayrollMain({ staffs = [], selectedCo, onRefresh }: any) {
  const [activeTab, setActiveTab] = useState('대장');
  const [selectedStaffId, setSelectedStaffId] = useState(1);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  
  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s:any) => s.company === selectedCo);
  const current = filtered.find((s:any) => s.id === selectedStaffId) || filtered[0];

  const handleAction = (type: string) => {
    if (checkedIds.length === 0) return alert("대상을 선택해 주세요.");
    alert(`${type === 'bank' ? '은행 이체 파일' : '알림톡 명세서'}를 생성합니다.`);
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      <header className="p-6 md:p-8 border-b border-gray-50 bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-xl font-black text-gray-800 tracking-tighter">급여 통합 관리 <span className="text-sm text-blue-600 ml-2">[{selectedCo}]</span></h2>
          <div className="flex gap-4 mt-2">
            {['대장', '급여정산', '중간정산', '연말정산'].map(tab => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)}
                className={`text-[11px] font-black tracking-widest uppercase transition-all ${activeTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-300 hover:text-gray-500'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        {activeTab === '대장' && (
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => handleAction('bank')} className="flex-1 md:flex-none px-5 py-2.5 bg-[#232933] text-white text-[10px] font-black rounded-xl shadow-lg">이체 SAM 생성</button>
            <button onClick={() => handleAction('send')} className="flex-1 md:flex-none px-5 py-2.5 bg-[#2563EB] text-white text-[10px] font-black rounded-xl shadow-xl">명세서 발송</button>
          </div>
        )}
      </header>

      <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-gray-50/20 custom-scrollbar">
        {filtered.length > 0 ? (
          <>
            {activeTab === '대장' && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2 space-y-8">
                    {current && <SalaryDetail staff={current} />}
                    <PayrollTable staffs={filtered} checkedIds={checkedIds} setCheckedIds={setCheckedIds} onSelect={setSelectedStaffId} />
                </div>
                <aside className="space-y-8">
                    <CompliancePanel staffs={filtered.filter((s:any) => checkedIds.includes(s.id))} companyName={selectedCo} />
                </aside>
              </div>
            )}
            {activeTab === '급여정산' && <SalarySettlement staffs={staffs} selectedCo={selectedCo} onRefresh={onRefresh} />}
            {activeTab === '중간정산' && <InterimSettlement staffs={staffs} selectedCo={selectedCo} />}
            {activeTab === '연말정산' && <YearEndSettlement staffs={staffs} selectedCo={selectedCo} />}
          </>
        ) : (
          <div className="h-full flex items-center justify-center bg-white border border-dashed border-gray-200 rounded-[2rem] p-20">
            <p className="text-sm font-black text-gray-400">"{selectedCo}" 소속 인원이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

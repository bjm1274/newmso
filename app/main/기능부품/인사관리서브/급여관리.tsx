'use client';
import { useState } from 'react';
import SalaryDetail from './급여명세/급여상세';
import PayrollTable from './급여명세/급여대장표';
import CompliancePanel from './급여명세/노무준수패널';
import InterimSettlement from './급여명세/중간정산';
import YearEndSettlement from './급여명세/연말정산';
import SalarySettlement from './급여명세/급여정산';

type Staff = {
  id: number;
  name: string;
  company?: string;
  position?: string;
  base?: number;
};

export default function PayrollMain({ staffs = [], selectedCo, onRefresh }: any) {
  const [activeTab, setActiveTab] = useState('대장');
  const [selectedStaffId, setSelectedStaffId] = useState(1);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  
  const filtered: Staff[] = selectedCo === '전체' ? staffs : staffs.filter((s: Staff) => s.company === selectedCo);
  const current = filtered.find((s) => s.id === selectedStaffId) || filtered[0];

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
                <aside className="space-y-6">
                  <CompliancePanel staffs={filtered.filter((s: Staff) => checkedIds.includes(s.id))} companyName={selectedCo} />
                  {current && <BenefitSummary staff={current} />}
                  {current && <SalarySimulationSummary staff={current} />}
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

// 복리후생 요약 (DEMO 버전 – 나중에 Supabase 연동 예정)
function BenefitSummary({ staff }: { staff: Staff }) {
  const base = staff.base ?? 3_000_000;
  const welfare = Math.round(base * 0.05);   // 예: 기본급의 5%를 복리후생 예산으로 가정
  const pension = Math.round(base * 0.045);
  const health = Math.round(base * 0.03545);

  return (
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <h3 className="text-[11px] font-black text-gray-800 uppercase tracking-widest mb-4">
        Benefits & Social Insurance (DEMO)
      </h3>
      <div className="space-y-2 text-xs font-bold text-gray-600">
        <div className="flex justify-between">
          <span>복리후생 예산 (추정)</span>
          <span className="text-blue-600">{welfare.toLocaleString()}원 / 월</span>
        </div>
        <div className="flex justify-between">
          <span>국민연금 (회사부담 추정)</span>
          <span className="text-red-500">-{pension.toLocaleString()}원</span>
        </div>
        <div className="flex justify-between">
          <span>건강보험 (회사부담 추정)</span>
          <span className="text-red-500">-{health.toLocaleString()}원</span>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-gray-400">
        * 실제 수치는 향후 Supabase 급여/복리후생 테이블과 연동하여 자동 계산됩니다.
      </p>
    </div>
  );
}

// 급여 시뮬레이션 간단 요약 (DEMO)
function SalarySimulationSummary({ staff }: { staff: Staff }) {
  const base = staff.base ?? 3_000_000;
  const scenarios = [
    { name: '기준안', total: base },
    { name: '인상안 A (+5%)', total: Math.round(base * 1.05) },
    { name: '인상안 B (+10%)', total: Math.round(base * 1.1) },
  ];

  return (
    <div className="border border-blue-100 p-6 bg-blue-50/40 rounded-[1.75rem] shadow-sm">
      <h3 className="text-[11px] font-black text-blue-700 uppercase tracking-widest mb-4">
        Salary Simulation (DEMO)
      </h3>
      <div className="space-y-2 text-xs font-bold text-gray-700">
        {scenarios.map((s) => (
          <div key={s.name} className="flex justify-between">
            <span>{s.name}</span>
            <span className="text-blue-700">{s.total.toLocaleString()}원</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-blue-500">
        * 향후 `salary_simulations` 테이블과 연동하여 실제 시나리오를 저장/비교할 수 있습니다.
      </p>
    </div>
  );
}

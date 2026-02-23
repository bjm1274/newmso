'use client';
import { useState } from 'react';
// 세분화했던 컴포넌트들을 경로에 맞춰 호출합니다.
import AllowanceList from './수당목록';
import DeductionSummary from './공제요약';
import TaxReporter from './세금신고';
import MessageTemplate from './메시지양식';

export default function PayrollPage() {
  const [selectedEmpId, setSelectedEmpId] = useState(1);
  
  // [조직도 데이터 연동] image_22a542.png의 인원 구성 반영
  const employees = [
    { id: 1, name: '백정민', dept: '병원장', base: 10000000, overtime: 0 },
    { id: 2, name: '박철홍', dept: 'MSO', base: 5000000, overtime: 8 },
    { id: 3, name: '김간호', dept: '수술팀', base: 3500000, overtime: 15 },
    { id: 4, name: '이행정', dept: '원무팀', base: 3000000, overtime: 5 },
  ];

  const currentEmp = employees.find(e => e.id === selectedEmpId) || employees[0];

  return (
    <div className="flex flex-col h-full bg-[#FDFDFD] animate-in fade-in duration-500">
      {/* 1. 상단 마스터 헤더: image_2d03bd.png의 레이아웃 유지 */}
      <header className="px-10 py-8 bg-white border-b border-gray-100 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">인사 관리 : 급여 정산</h1>
          <p className="text-xs text-blue-600 font-medium mt-0.5">Park Cheol Hong Orthopedic x SY Medical</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2.5 bg-gray-800 text-white text-xs font-medium rounded-lg hover:bg-gray-900">은행 이체 데이터 생성</button>
          <button className="px-4 py-2.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">명세서 일괄 발송</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* 2. 좌측 조직도 기반 명단 */}
        <aside className="w-80 bg-white border-r border-gray-50 flex flex-col">
          <div className="p-8">
            <h2 className="text-xs font-semibold text-gray-500 mb-4">전체 직원 ({employees.length}명)</h2>
            <div className="space-y-1">
              {employees.map(emp => (
                <button 
                  key={emp.id} 
                  onClick={() => setSelectedEmpId(emp.id)}
                  className={`w-full text-left p-4 transition-all border-l-4 ${
                    selectedEmpId === emp.id ? 'bg-blue-50 border-blue-600' : 'hover:bg-gray-25 border-transparent'
                  }`}
                >
                  <p className={`text-sm font-semibold ${selectedEmpId === emp.id ? 'text-blue-600' : 'text-gray-700'}`}>{emp.name}</p>
                  <p className="text-xs text-gray-500">{emp.dept}</p>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* 3. 우측 실무 관리 영역 (기존 '준비 중' 자리에 들어갈 내용) */}
        <main className="flex-1 p-10 bg-gray-50/20 overflow-y-auto custom-scrollbar">
          <div className="max-w-6xl grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* 정산 요약 및 세부 수당/공제 섹션 */}
            <div className="xl:col-span-2 space-y-8">
              <div className="bg-white border border-gray-100 p-8 shadow-sm">
                <div className="flex justify-between items-end mb-8 border-b border-gray-50 pb-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">{currentEmp.name} <span className="text-xs font-medium text-gray-500">{currentEmp.dept}</span></h2>
                    <p className="text-xs text-gray-500 mt-0.5">Employee Monthly Settlement</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-gray-500">Total Net Salary</p>
                    <p className="text-2xl font-bold text-blue-600">{(currentEmp.base * 0.91).toLocaleString()}원</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <AllowanceList />
                  <DeductionSummary base={currentEmp.base} />
                </div>
              </div>
            </div>

            {/* 국세청 신고 및 알림톡 패널 */}
            <aside className="space-y-8">
              <TaxReporter employees={employees} />
              <MessageTemplate />
              <div className="p-8 bg-[#2563EB] shadow-2xl">
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest mb-4">Final Approval</p>
                <button className="w-full py-4 bg-white text-blue-600 text-xs font-semibold hover:bg-gray-100 transition-all">
                  2월 급여 최종 마감
                </button>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
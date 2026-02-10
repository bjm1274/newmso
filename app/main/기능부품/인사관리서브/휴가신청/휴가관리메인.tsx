'use client';
import { useState, useEffect } from 'react';
import AnnualLeavePromotion from './연차촉진시스템';

type StaffLite = {
  id: string;
  name: string;
  company?: string;
  department?: string;
};

type Leave = {
  id: string;
  staff: StaffLite;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: '대기' | '승인' | '반려';
};

export default function LeaveManagement({ staffs, selectedCo, onRefresh }: any) {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('연차/휴가 신청내역');
  const [leaveConfig, setLeaveConfig] = useState<'입사일 기준' | '회계연도 기준'>('입사일 기준');

  useEffect(() => {
    // DEMO: staffs 정보를 기반으로 임시 휴가 신청 데이터 생성
    setLoading(true);
    const baseDate = new Date();
    const demoLeaves: Leave[] = (staffs as StaffLite[])
      .filter((s) => selectedCo === '전체' || s.company === selectedCo)
      .slice(0, 10)
      .map((s, idx) => {
        const start = new Date(baseDate);
        start.setDate(start.getDate() - idx * 3);
        const end = new Date(start);
        end.setDate(start.getDate() + 1);
        return {
          id: `${idx}`,
          staff: s,
          leave_type: idx % 4 === 0 ? '연차' : idx % 4 === 1 ? '반차' : idx % 4 === 2 ? '병가' : '경조',
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          reason: idx % 3 === 0 ? '가족행사' : idx % 3 === 1 ? '개인 사유' : '건강검진',
          status: idx % 5 === 0 ? '대기' : '승인',
        };
      });
    setLeaves(demoLeaves);
    setLoading(false);
  }, [staffs, selectedCo]);

  const handleStatusUpdate = (id: string, status: Leave['status']) => {
    setLeaves((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    alert(`신청이 ${status} 처리되었습니다. (DEMO 모드, 실제 DB에는 반영되지 않음)`);
    if (onRefresh) onRefresh();
  };

  const handleApplyLeaveConfig = (type: '입사일 기준' | '회계연도 기준') => {
    if (!confirm(`${type}으로 연차 산정 방식을 변경하고 전 직원의 연차를 재계산한다고 가정합니다.`)) return;
    setLeaveConfig(type);
    alert(`${type} 기준 연차 재계산이 완료되었다고 가정합니다. (DEMO)`);
    if (onRefresh) onRefresh();
  };

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] animate-in fade-in duration-500">
      <div className="p-4 md:p-8 border-b border-gray-100 bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter italic">전문 연차/휴가 통합 관리</h2>
          <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase tracking-widest">Professional Leave & Vacation System</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto no-scrollbar">
          {['연차/휴가 신청내역', '연차사용촉진 자동화', '연차 자동부여 설정'].map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-2xl text-[11px] font-black whitespace-nowrap transition-all ${
                activeTab === tab 
                  ? 'bg-gray-900 text-white shadow-xl' 
                  : 'bg-white text-gray-400 border border-gray-100 hover:bg-gray-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 md:p-10 overflow-y-auto custom-scrollbar">
        {activeTab === '연차/휴가 신청내역' && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-6 bg-white border border-gray-100 shadow-sm rounded-[1.5rem] text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase">승인 대기</p>
                <p className="text-2xl font-black text-orange-500 mt-1">{leaves.filter(l => l.status === '대기').length}</p>
              </div>
              <div className="p-6 bg-white border border-gray-100 shadow-sm rounded-[1.5rem] text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase">연차 사용</p>
                <p className="text-2xl font-black text-blue-600 mt-1">{leaves.filter(l => l.leave_type === '연차' && l.status === '승인').length}</p>
              </div>
              <div className="p-6 bg-white border border-gray-100 shadow-sm rounded-[1.5rem] text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase">기타 휴가</p>
                <p className="text-2xl font-black text-purple-600 mt-1">{leaves.filter(l => l.leave_type !== '연차' && l.status === '승인').length}</p>
              </div>
              <div className="p-6 bg-white border border-gray-100 shadow-sm rounded-[1.5rem] text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase">준수율</p>
                <p className="text-2xl font-black text-green-600 mt-1">98%</p>
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-xl">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 border-b border-gray-100 uppercase">
                    <tr>
                      <th className="px-8 py-5">신청자 정보</th>
                      <th className="px-8 py-5">구분</th>
                      <th className="px-8 py-5">신청 기간</th>
                      <th className="px-8 py-5">사유</th>
                      <th className="px-8 py-5">상태</th>
                      <th className="px-8 py-5 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-xs font-bold">
                    {leaves.map((l: any) => (
                      <tr key={l.id} className="hover:bg-blue-50/30 transition-all group">
                        <td className="px-8 py-5">
                          <div className="flex flex-col">
                            <span className="font-black text-gray-900 group-hover:text-blue-600 transition-colors">{l.staff_members?.name}</span>
                            <span className="text-[9px] text-gray-400 uppercase">{l.staff_members?.company} / {l.staff_members?.department}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black ${
                            l.leave_type === '연차' ? 'bg-blue-100 text-blue-600' :
                            l.leave_type === '병가' ? 'bg-red-100 text-red-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {l.leave_type}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-gray-500">{l.start_date} ~ {l.end_date}</td>
                        <td className="px-8 py-5 text-gray-400 max-w-xs truncate">{l.reason}</td>
                        <td className="px-8 py-5">
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black ${
                            l.status === '승인' ? 'bg-green-100 text-green-600' :
                            l.status === '반려' ? 'bg-red-100 text-red-600' :
                            'bg-orange-100 text-orange-600'
                          }`}>
                            {l.status}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          {l.status === '대기' && (
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleStatusUpdate(l.id, '승인')} className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black rounded-xl shadow-lg hover:scale-[0.98] transition-all">승인</button>
                              <button onClick={() => handleStatusUpdate(l.id, '반려')} className="px-4 py-2 bg-white border border-gray-200 text-[10px] font-black text-gray-400 rounded-xl hover:text-red-600 hover:border-red-600 transition-all">반려</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === '연차사용촉진 자동화' && <AnnualLeavePromotion staffs={staffs} selectedCo={selectedCo} />}
        
        {activeTab === '연차 자동부여 설정' && (
          <div className="bg-white p-10 border border-gray-100 shadow-xl rounded-[2.5rem] text-center max-w-2xl mx-auto">
            <p className="text-5xl mb-6">⚙️</p>
            <h3 className="text-xl font-black text-gray-900 mb-4">연차 자동 부여 로직 설정</h3>
            <p className="text-sm text-gray-500 font-bold mb-8 leading-relaxed">
              근로기준법에 따른 연차 산정 방식을 선택해 주세요.<br/>
              현재 설정: <span className="text-blue-600 font-black underline underline-offset-4">{leaveConfig}</span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={() => handleApplyLeaveConfig('입사일 기준')}
                className={`px-8 py-6 rounded-[2rem] text-xs font-black transition-all ${
                  leaveConfig === '입사일 기준' 
                  ? 'bg-gray-900 text-white shadow-2xl scale-105' 
                  : 'bg-gray-50 text-gray-400 border border-gray-100 hover:bg-white hover:shadow-lg'
                }`}
              >
                <p className="text-lg mb-2">📅</p>
                입사일 기준 적용
                <p className="text-[9px] mt-2 font-normal opacity-60">개별 입사일로부터 1년 단위 산정</p>
              </button>
              <button 
                onClick={() => handleApplyLeaveConfig('회계연도 기준')}
                className={`px-8 py-6 rounded-[2rem] text-xs font-black transition-all ${
                  leaveConfig === '회계연도 기준' 
                  ? 'bg-gray-900 text-white shadow-2xl scale-105' 
                  : 'bg-gray-50 text-gray-400 border border-gray-100 hover:bg-white hover:shadow-lg'
                }`}
              >
                <p className="text-lg mb-2">🏢</p>
                회계연도 기준 적용
                <p className="text-[9px] mt-2 font-normal opacity-60">매년 1월 1일 일괄 산정 (정산 필요)</p>
              </button>
            </div>
            <div className="mt-10 p-6 bg-blue-50 rounded-2xl text-left">
              <h4 className="text-[11px] font-black text-blue-800 mb-2">💡 연차 산정 기준 안내</h4>
              <p className="text-[10px] text-blue-600 font-bold leading-relaxed">
                - 입사일 기준: 근로자별 입사일에 맞춰 연차가 발생하여 관리가 정확합니다.<br/>
                - 회계연도 기준: 전 직원의 연차를 특정 일자(예: 1월 1일)에 맞춰 일괄 관리하여 행정 편의성이 높습니다. (단, 퇴사 시 입사일 기준보다 불리할 경우 정산 의무 발생)
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

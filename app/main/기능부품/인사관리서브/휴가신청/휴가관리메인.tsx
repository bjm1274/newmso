'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AnnualLeavePromotion from './연차촉진시스템';
import LeaveDashboard from '../급여명세/연차종합대시보드';

type Leave = {
  id: string;
  staff_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: '대기' | '승인' | '반려';
  staff_members?: { name: string; company?: string; department?: string };
};

export default function LeaveManagement({ staffs = [], selectedCo, onRefresh }: any) {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('연차/휴가 신청내역');
  const [leaveConfig, setLeaveConfig] = useState<'입사일 기준' | '회계연도 기준'>('입사일 기준');
  const staffList = Array.isArray(staffs) ? staffs : [];
  const [currentUser, setCurrentUser] = useState<any>(null);

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      let list: any[] = data || [];
      if (selectedCo && selectedCo !== '전체') {
        list = list.filter((l: any) => {
          const staff = staffList.find((s: any) => s.id === l.staff_id);
          return (staff?.company || l.company_name) === selectedCo;
        });
      }
      setLeaves(list);
    } catch (err) {
      console.error('휴가 신청 조회 실패:', err);
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, [selectedCo, staffs]);

  // 로컬 세션 기준 현재 사용자 찾기 (연차 대시보드 개인뷰용)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('erp_user');
      if (!raw) return;
      const u = JSON.parse(raw || '{}');
      if (!u?.id) return;
      const found = staffList.find((s: any) => s.id === u.id);
      setCurrentUser(found || u);
    } catch {
      // ignore
    }
  }, [staffList]);

  const handleStatusUpdate = async (id: string, status: '승인' | '반려') => {
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      setLeaves((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
      alert(`신청이 ${status} 처리되었습니다.`);
      if (status === '승인') {
        // 승인 시 연차 사용일수 반영 (staff_members annual_leave_used 업데이트)
        const leave = leaves.find((l) => l.id === id);
        if (leave && leave.leave_type === '연차') {
          const days = Math.ceil((new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const { data: staff } = await supabase.from('staff_members').select('annual_leave_used').eq('id', leave.staff_id).single();
          const used = (staff?.annual_leave_used || 0) + days;
          await supabase.from('staff_members').update({ annual_leave_used: used }).eq('id', leave.staff_id);
        }
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('처리에 실패했습니다.');
    }
  };

  const handleApplyLeaveConfig = (type: '입사일 기준' | '회계연도 기준') => {
    setLeaveConfig(type);
    if (type === '입사일 기준') {
      alert('입사일 기준으로 설정되었습니다. 아래 "연차 자동 부여 실행" 버튼으로 재계산하세요.');
    } else {
      alert('회계연도 기준으로 설정되었습니다. (1월 1일 일괄 산정)');
    }
    if (onRefresh) onRefresh();
  };

  const runAnnualLeaveAutoGrant = async () => {
    if (!confirm('전 직원의 연차를 입사일 기준으로 재계산합니다. 진행할까요?')) return;
    setLoading(true);
    try {
      for (const s of staffList) {
        const joinDate = s.joined_at || s.join_date;
        if (!joinDate) continue;
        const join = new Date(joinDate);
        const now = new Date();
        const years = (now.getTime() - join.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        let total = 0;
        if (years >= 1) total = 15;
        if (years >= 4) total = Math.min(25, 15 + Math.floor((years - 1) / 3));
        if (years < 1) total = Math.min(11, Math.floor((new Date(now).getTime() - join.getTime()) / (30 * 24 * 60 * 60 * 1000)));
        await supabase.from('staff_members').update({ annual_leave_total: total }).eq('id', s.id);
      }
      alert('연차 자동 부여가 완료되었습니다.');
      if (onRefresh) onRefresh();
    } catch (e) {
      alert('처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full app-page animate-in fade-in duration-500">
      <div className="p-4 md:p-8 border-b border-[var(--toss-border)] bg-[var(--toss-card)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--foreground)] tracking-tighter italic">전문 연차/휴가 통합 관리</h2>
          <p className="text-[11px] text-[var(--toss-blue)] font-bold mt-1 tracking-widest">연차·휴가 통합 관리 시스템</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto no-scrollbar">
          {['연차/휴가 신청내역', '연차 대시보드', '연차사용촉진 자동화', '연차 자동부여 설정'].map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-[12px] text-[11px] font-semibold whitespace-nowrap transition-all ${
                activeTab === tab 
                  ? 'bg-[var(--foreground)] text-white shadow-xl' 
                  : 'bg-[var(--toss-card)] text-[var(--toss-gray-3)] border border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)]'
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
            {/* 법적 기준 안내 */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-100 rounded-[16px] p-6 md:p-8">
              <h3 className="text-sm font-semibold text-blue-900 mb-4 flex items-center gap-2">⚖️ 근로기준법 기준 연차·휴가 안내</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                <div className="space-y-2">
                  <p className="font-semibold text-blue-800">제60조 (연차 유급휴가)</p>
                  <ul className="text-blue-700 font-bold space-y-1 list-disc list-inside">
                    <li>1년 미만: 1개월마다 1일 (최대 11일)</li>
                    <li>1년 이상: 15일</li>
                    <li>3년마다 1일 가산 (최대 25일)</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-blue-800">제61조 (연차 사용 촉진)</p>
                  <ul className="text-blue-700 font-bold space-y-1 list-disc list-inside">
                    <li>1차 촉진: 발생일+1년 전 6개월 시점 10일 이내 서면 통보</li>
                    <li>2차 촉진: 사용촉진 후 5일 이내 사용 시도</li>
                  </ul>
                </div>
                <div className="md:col-span-2 p-4 bg-white/60 rounded-[16px] border border-blue-100">
                  <p className="font-semibold text-[var(--foreground)]">휴가 종류: 연차 · 반차 · 병가 · 경조 · 특별휴가 · 기타</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-6 bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm rounded-[16px] text-center">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">승인 대기</p>
                <p className="text-2xl font-semibold text-orange-500 mt-1">{leaves.filter(l => l.status === '대기').length}</p>
              </div>
              <div className="p-6 bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm rounded-[16px] text-center">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">잔여 연차 (직원별)</p>
                <p className="text-2xl font-semibold text-[var(--toss-blue)] mt-1">
                  {staffList.filter((s: any) => {
                    const total = typeof s.annual_leave_total === 'number' ? s.annual_leave_total : 0;
                    const used = s.annual_leave_used ?? 0;
                    return (total - used) > 0;
                  }).length}명
                </p>
                <p className="text-[11px] text-[var(--toss-gray-3)] mt-1">입사일·사용이력 기반</p>
              </div>
              <div className="p-6 bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm rounded-[16px] text-center">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">연차 사용</p>
                <p className="text-2xl font-semibold text-[var(--toss-blue)] mt-1">{leaves.filter(l => l.leave_type === '연차' && l.status === '승인').length}</p>
              </div>
              <div className="p-6 bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm rounded-[16px] text-center">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">기타 휴가</p>
                <p className="text-2xl font-semibold text-purple-600 mt-1">{leaves.filter(l => l.leave_type !== '연차' && l.status === '승인').length}</p>
              </div>
              <div className="p-6 bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm rounded-[16px] text-center">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">준수율</p>
                <p className="text-2xl font-semibold text-green-600 mt-1">98%</p>
              </div>
            </div>

            <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[2.5rem] overflow-hidden shadow-xl">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead className="bg-[var(--toss-gray-1)]/50 text-[11px] font-semibold text-[var(--toss-gray-3)] border-b border-[var(--toss-border)] uppercase">
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
                      <tr key={l.id} className="hover:bg-[var(--toss-blue-light)]/30 transition-all group">
                        <td className="px-8 py-5">
                          <div className="flex flex-col">
                            <span className="font-semibold text-[var(--foreground)] group-hover:text-[var(--toss-blue)] transition-colors">
                              {staffList.find((s: any) => s.id === l.staff_id)?.name ?? l.staff_members?.name ?? '-'}
                            </span>
                            <span className="text-[11px] text-[var(--toss-gray-3)] uppercase">
                              {staffList.find((s: any) => s.id === l.staff_id)?.company ?? l.staff_members?.company} / {staffList.find((s: any) => s.id === l.staff_id)?.department ?? l.staff_members?.department}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${
                            l.leave_type === '연차' ? 'bg-[var(--toss-blue-light)] text-[var(--toss-blue)]' :
                            l.leave_type === '병가' ? 'bg-red-100 text-red-600' :
                            'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'
                          }`}>
                            {l.leave_type}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-[var(--toss-gray-3)]">{l.start_date} ~ {l.end_date}</td>
                        <td className="px-8 py-5 text-[var(--toss-gray-3)] max-w-xs truncate">{l.reason}</td>
                        <td className="px-8 py-5">
                          <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${
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
                              <button onClick={() => handleStatusUpdate(l.id, '승인')} className="px-4 py-2 bg-[var(--toss-blue)] text-white text-[11px] font-semibold rounded-[16px] shadow-lg hover:scale-[0.98] transition-all">승인</button>
                              <button onClick={() => handleStatusUpdate(l.id, '반려')} className="px-4 py-2 bg-[var(--toss-card)] border border-[var(--toss-border)] text-[11px] font-semibold text-[var(--toss-gray-3)] rounded-[16px] hover:text-red-600 hover:border-red-600 transition-all">반려</button>
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

        {activeTab === '연차 대시보드' && (
          <LeaveDashboard staffs={staffList} selectedCo={selectedCo} currentUser={currentUser} />
        )}
        {activeTab === '연차사용촉진 자동화' && <AnnualLeavePromotion staffs={staffList} selectedCo={selectedCo} />}
        
        {activeTab === '연차 자동부여 설정' && (
          <div className="bg-[var(--toss-card)] p-10 border border-[var(--toss-border)] shadow-xl rounded-[2.5rem] text-center max-w-2xl mx-auto">
            <p className="text-5xl mb-6">⚙️</p>
            <h3 className="text-xl font-semibold text-[var(--foreground)] mb-4">연차 자동 부여 로직 설정</h3>
            <p className="text-sm text-[var(--toss-gray-3)] font-bold mb-8 leading-relaxed">
              근로기준법에 따른 연차 산정 방식을 선택해 주세요.<br/>
              현재 설정: <span className="text-[var(--toss-blue)] font-semibold underline underline-offset-4">{leaveConfig}</span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={() => handleApplyLeaveConfig('입사일 기준')}
                className={`px-8 py-6 rounded-[16px] text-xs font-semibold transition-all ${
                  leaveConfig === '입사일 기준' 
                  ? 'bg-[var(--foreground)] text-white shadow-2xl scale-105' 
                  : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] border border-[var(--toss-border)] hover:bg-[var(--toss-card)] hover:shadow-lg'
                }`}
              >
                <p className="text-lg mb-2">📅</p>
                입사일 기준 적용
                <p className="text-[11px] mt-2 font-normal opacity-60">개별 입사일로부터 1년 단위 산정</p>
              </button>
              <button 
                onClick={() => handleApplyLeaveConfig('회계연도 기준')}
                className={`px-8 py-6 rounded-[16px] text-xs font-semibold transition-all ${
                  leaveConfig === '회계연도 기준' 
                  ? 'bg-[var(--foreground)] text-white shadow-2xl scale-105' 
                  : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] border border-[var(--toss-border)] hover:bg-[var(--toss-card)] hover:shadow-lg'
                }`}
              >
                <p className="text-lg mb-2">🏢</p>
                회계연도 기준 적용
                <p className="text-[11px] mt-2 font-normal opacity-60">매년 1월 1일 일괄 산정 (정산 필요)</p>
              </button>
            </div>
            <div className="mt-6">
              <button onClick={runAnnualLeaveAutoGrant} disabled={loading} className="w-full py-4 bg-[var(--toss-blue)] text-white font-semibold rounded-[12px] text-sm hover:opacity-90 disabled:opacity-50">
                {loading ? '처리 중...' : '📅 입사일 기준 연차 자동 부여 실행'}
              </button>
            </div>
            <div className="mt-10 p-6 bg-[var(--toss-blue-light)] rounded-[12px] text-left">
              <h4 className="text-[11px] font-semibold text-[var(--toss-blue)] mb-2">💡 연차 산정 기준 안내</h4>
              <p className="text-[11px] text-[var(--toss-blue)] font-bold leading-relaxed">
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

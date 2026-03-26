'use client';
import { toast } from '@/lib/toast';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { syncAnnualLeaveUsedForStaff } from '@/lib/annual-leave-ledger';
import AnnualLeavePromotion from './연차촉진시스템';
import LeaveDashboard from '../급여명세/연차종합대시보드';
import HolidayCalendar from '../공휴일달력';

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

type LeaveManagementTabId =
  | '연차/휴가 신청내역'
  | '연차 대시보드'
  | '연차사용촉진 자동화'
  | '연차 자동부여 설정'
  | '공휴일 달력';

const LEAVE_TAB_DEFS: { id: LeaveManagementTabId; label: string }[] = [
  { id: '연차/휴가 신청내역', label: '연차/휴가 신청내역' },
  { id: '연차 대시보드', label: '연차 대시보드' },
  { id: '연차사용촉진 자동화', label: '연차사용촉진 자동화' },
  { id: '연차 자동부여 설정', label: '연차 자동부여 설정' },
  { id: '공휴일 달력', label: '공휴일 달력' },
];

export default function LeaveManagement({
  staffs = [],
  selectedCo,
  onRefresh,
  user,
  initialTab,
  allowLeaveTabs = true,
  allowHolidayTab = true,
}: Record<string, unknown>) {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<LeaveManagementTabId>((initialTab as LeaveManagementTabId) ?? '연차/휴가 신청내역');
  const [leaveConfig, setLeaveConfig] = useState<'입사일 기준' | '회계연도 기준'>('입사일 기준');
  const staffList = Array.isArray(staffs) ? staffs : [];
  const [currentUser, setCurrentUser] = useState<Record<string, unknown> | null>(null);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const availableTabs = useMemo(
    () =>
      LEAVE_TAB_DEFS.filter((tab) => {
        if (tab.id === '공휴일 달력') return allowHolidayTab;
        return allowLeaveTabs;
      }),
    [allowHolidayTab, allowLeaveTabs]
  );

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

  useEffect(() => {
    if (initialTab && availableTabs.some((tab) => tab.id === initialTab)) {
      setActiveTab(initialTab as LeaveManagementTabId);
    }
  }, [availableTabs, initialTab]);

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(availableTabs[0]?.id || '연차/휴가 신청내역');
    }
  }, [activeTab, availableTabs]);

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
      if (status === '승인') {
        const leave = leaves.find((l) => l.id === id);
        if (leave) {
          await syncAnnualLeaveUsedForStaff(leave.staff_id);
        }
      }
      toast(`신청이 ${status} 처리되었습니다.`, 'success');
      if (onRefresh) (onRefresh as () => void)();
    } catch (err) {
      toast('처리에 실패했습니다.', 'error');
    }
  };

  const handleApplyLeaveConfig = (type: '입사일 기준' | '회계연도 기준') => {
    setLeaveConfig(type);
    if (type === '입사일 기준') {
      toast('입사일 기준으로 설정되었습니다. 아래 "연차 자동 부여 실행" 버튼으로 재계산하세요.');
    } else {
      toast('회계연도 기준으로 설정되었습니다. (1월 1일 일괄 산정)');
    }
    if (onRefresh) (onRefresh as () => void)();
  };

  const runAnnualLeaveAutoGrant = async () => {
    if (!confirm('전 직원의 연차를 입사일 기준으로 재계산합니다. 진행할까요?')) return;
    setLoading(true);
    try {
      for (const s of staffList) {
        const joinDate = s.joined_at || s.join_date;
        if (!joinDate) continue;
        const join = new Date(joinDate as string);
        const now = new Date();
        const years = (now.getTime() - join.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        let total = 0;
        if (years >= 1) total = 15;
        if (years >= 3) total = Math.min(25, 15 + Math.floor((years - 1) / 2));
        if (years < 1) total = Math.min(11, Math.floor((new Date(now).getTime() - join.getTime()) / (30 * 24 * 60 * 60 * 1000)));
        await supabase.from('staff_members').update({ annual_leave_total: total }).eq('id', s.id);
      }
      toast('연차 자동 부여가 완료되었습니다.', 'success');
      if (onRefresh) (onRefresh as () => void)();
    } catch (e) {
      toast('처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="app-page flex h-full min-h-0 flex-col overflow-hidden animate-in fade-in duration-500"
      data-testid="leave-management-view"
    >
      <div className="relative z-10 flex shrink-0 flex-col gap-4 border-b border-[var(--border)] bg-[var(--card)] p-4 md:flex-row md:items-center md:justify-between md:p-4">
        <div className="flex min-h-[48px] shrink-0 items-center">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] tracking-tight">전문 연차/휴가 통합 관리</h2>
        </div>
        <div className="relative z-20 flex w-full gap-2 overflow-x-auto no-scrollbar md:w-auto">
          {availableTabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`leave-tab-${tab.id.replace(/[^\w가-힣]+/g, '-')}`}
              className={`px-4 py-3 rounded-[var(--radius-md)] text-[11px] font-semibold whitespace-nowrap transition-all ${activeTab === tab.id
                ? 'bg-[var(--foreground)] text-white shadow-sm'
                : 'bg-[var(--card)] text-[var(--toss-gray-3)] border border-[var(--border)] hover:bg-[var(--muted)]'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
        {activeTab === '연차/휴가 신청내역' && (
          <div className="space-y-5">
            {/* 법적 기준 안내 */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-100 rounded-[var(--radius-lg)] p-4 md:p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-4 flex items-center gap-2">⚖️ 근로기준법 기준 연차·휴가 안내</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <p className="font-semibold text-blue-800">제60조 (연차 유급휴가)</p>
                  <ul className="text-blue-700 font-bold space-y-1 list-disc list-inside">
                    <li>1년 미만: 1개월마다 1일 (최대 11일)</li>
                    <li>1년 이상: 15일</li>
                    <li>최초 1년 초과 후 매 2년마다 1일 가산 (최대 25일)</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-blue-800">제61조 (연차 사용 촉진)</p>
                  <ul className="text-blue-700 font-bold space-y-1 list-disc list-inside">
                    <li>1차 촉진: 발생일+1년 전 6개월 시점 10일 이내 서면 통보</li>
                    <li>2차 촉진: 사용촉진 후 5일 이내 사용 시도</li>
                  </ul>
                </div>
                <div className="md:col-span-2 p-4 bg-[var(--card)]/60 rounded-[var(--radius-lg)] border border-blue-100">
                  <p className="font-semibold text-[var(--foreground)]">휴가 종류: 연차 · 반차 · 병가 · 경조 · 특별휴가 · 기타</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div
                onClick={() => setShowPendingModal(true)}
                className="p-4 bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] text-center cursor-pointer hover:shadow-md transition-all group"
              >
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase group-hover:text-[var(--accent)] transition-colors">승인 대기</p>
                <p className="text-2xl font-semibold text-orange-500 mt-1">{leaves.filter(l => l.status === '대기').length}</p>
              </div>
              <div className="p-4 bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] text-center">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">잔여 연차 (직원별)</p>
                <p className="text-2xl font-semibold text-[var(--accent)] mt-1">
                  {staffList.filter((s: any) => {
                    const total = typeof s.annual_leave_total === 'number' ? s.annual_leave_total : 0;
                    const used = s.annual_leave_used ?? 0;
                    return (total - used) > 0;
                  }).length}명
                </p>
                <p className="text-[11px] text-[var(--toss-gray-3)] mt-1">입사일·사용이력 기반</p>
              </div>
              <div className="p-4 bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] text-center">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">연차 사용</p>
                <p className="text-2xl font-semibold text-[var(--accent)] mt-1">{leaves.filter(l => l.leave_type === '연차' && l.status === '승인').length}</p>
              </div>
              <div className="p-4 bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] text-center">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">기타 휴가</p>
                <p className="text-2xl font-semibold text-purple-600 mt-1">{leaves.filter(l => l.leave_type !== '연차' && l.status === '승인').length}</p>
              </div>
              <div className="p-4 bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] text-center">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">준수율</p>
                <p className="text-2xl font-semibold text-green-600 mt-1">
                  {staffList.length > 0 ? '100%' : '0%'}
                </p>
              </div>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead className="bg-[var(--muted)]/50 text-[11px] font-semibold text-[var(--toss-gray-3)] border-b border-[var(--border)] uppercase">
                    <tr>
                      <th className="px-5 py-5">신청자 정보</th>
                      <th className="px-5 py-5">구분</th>
                      <th className="px-5 py-5">신청 기간</th>
                      <th className="px-5 py-5">사유</th>
                      <th className="px-5 py-5">상태</th>
                      <th className="px-5 py-5 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-xs font-bold">
                    {leaves.map((l: any) => (
                      <tr key={l.id} className="hover:bg-[var(--toss-blue-light)]/30 transition-all group">
                        <td className="px-5 py-5">
                          <div className="flex flex-col">
                            <span className="font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
                              {staffList.find((s: any) => s.id === l.staff_id)?.name ?? l.staff_members?.name ?? '-'}
                            </span>
                            <span className="text-[11px] text-[var(--toss-gray-3)] uppercase">
                              {staffList.find((s: any) => s.id === l.staff_id)?.company ?? l.staff_members?.company} / {staffList.find((s: any) => s.id === l.staff_id)?.department ?? l.staff_members?.department}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-5">
                          <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${l.leave_type === '연차' ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]' :
                            l.leave_type === '병가' ? 'bg-red-100 text-red-600' :
                              'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                            }`}>
                            {l.leave_type}
                          </span>
                        </td>
                        <td className="px-5 py-5 text-[var(--toss-gray-3)]">{l.start_date} ~ {l.end_date}</td>
                        <td className="px-5 py-5 text-[var(--toss-gray-3)] max-w-xs truncate">{l.reason}</td>
                        <td className="px-5 py-5">
                          <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${l.status === '승인' ? 'bg-green-100 text-green-600' :
                            l.status === '반려' ? 'bg-red-100 text-red-600' :
                              'bg-orange-100 text-orange-600'
                            }`}>
                            {l.status}
                          </span>
                        </td>
                        <td className="px-5 py-5 text-right">
                          {l.status === '대기' && (
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => handleStatusUpdate(l.id, '승인')} className="px-4 py-2 bg-[var(--accent)] text-white text-[11px] font-semibold rounded-[var(--radius-lg)] shadow-sm hover:scale-[0.98] transition-all">승인</button>
                              <button type="button" onClick={() => handleStatusUpdate(l.id, '반려')} className="px-4 py-2 bg-red-50 border border-red-200 text-[11px] font-semibold text-red-600 rounded-[var(--radius-lg)] hover:bg-red-100 transition-all">반려</button>
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
          <LeaveDashboard staffs={staffList} selectedCo={selectedCo as string} currentUser={currentUser} />
        )}
        {activeTab === '연차사용촉진 자동화' && <AnnualLeavePromotion staffs={staffList} selectedCo={selectedCo as string} />}

        {activeTab === '연차 자동부여 설정' && (
          <div className="bg-[var(--card)] p-5 border border-[var(--border)] shadow-sm rounded-2xl text-center max-w-2xl mx-auto">
            <p className="text-5xl mb-4">⚙️</p>
            <h3 className="text-xl font-semibold text-[var(--foreground)] mb-4">연차 자동 부여 로직 설정</h3>
            <p className="text-sm text-[var(--toss-gray-3)] font-bold mb-4 leading-relaxed">
              근로기준법에 따른 연차 산정 방식을 선택해 주세요.<br />
              현재 설정: <span className="text-[var(--accent)] font-semibold underline underline-offset-4">{leaveConfig}</span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => handleApplyLeaveConfig('입사일 기준')}
                className={`px-5 py-4 rounded-[var(--radius-lg)] text-xs font-semibold transition-all ${leaveConfig === '입사일 기준'
                  ? 'bg-[var(--foreground)] text-white shadow-sm scale-105'
                  : 'bg-[var(--muted)] text-[var(--toss-gray-3)] border border-[var(--border)] hover:bg-[var(--card)] hover:shadow-sm'
                  }`}
              >
                <p className="text-lg mb-2">📅</p>
                입사일 기준 적용
                <p className="text-[11px] mt-2 font-normal opacity-60">개별 입사일로부터 1년 단위 산정</p>
              </button>
              <button
                type="button"
                onClick={() => handleApplyLeaveConfig('회계연도 기준')}
                className={`px-5 py-4 rounded-[var(--radius-lg)] text-xs font-semibold transition-all ${leaveConfig === '회계연도 기준'
                  ? 'bg-[var(--foreground)] text-white shadow-sm scale-105'
                  : 'bg-[var(--muted)] text-[var(--toss-gray-3)] border border-[var(--border)] hover:bg-[var(--card)] hover:shadow-sm'
                  }`}
              >
                <p className="text-lg mb-2">🏢</p>
                회계연도 기준 적용
                <p className="text-[11px] mt-2 font-normal opacity-60">매년 1월 1일 일괄 산정 (정산 필요)</p>
              </button>
            </div>
            <div className="mt-4">
              <button type="button" onClick={runAnnualLeaveAutoGrant} disabled={loading} className="w-full py-4 bg-[var(--accent)] text-white font-semibold rounded-[var(--radius-md)] text-sm hover:opacity-90 disabled:opacity-50">
                {loading ? '처리 중...' : '📅 입사일 기준 연차 자동 부여 실행'}
              </button>
            </div>
            <div className="mt-10 p-4 bg-[var(--toss-blue-light)] rounded-[var(--radius-md)] text-left">
              <h4 className="text-[11px] font-semibold text-[var(--accent)] mb-2">💡 연차 산정 기준 안내</h4>
              <p className="text-[11px] text-[var(--accent)] font-bold leading-relaxed">
                - 입사일 기준: 근로자별 입사일에 맞춰 연차가 발생하여 관리가 정확합니다.<br />
                - 회계연도 기준: 전 직원의 연차를 특정 일자(예: 1월 1일)에 맞춰 일괄 관리하여 행정 편의성이 높습니다. (단, 퇴사 시 입사일 기준보다 불리할 경우 정산 의무 발생)
              </p>
            </div>
          </div>
        )}

        {activeTab === '공휴일 달력' && (
          <HolidayCalendar staffs={staffList} selectedCo={selectedCo as string} user={user} />
        )}
      </div>

      {/* 승인 대기 상세 모달 */}
      {showPendingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4" onClick={() => setShowPendingModal(false)}>
          <div className="bg-[var(--card)] w-full max-w-2xl rounded-2xl overflow-hidden shadow-sm flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--card)]">
              <div>
                <h3 className="text-lg font-bold text-[var(--foreground)]">휴가 승인 대기 명단</h3>
                <p className="text-xs text-[var(--toss-gray-3)] font-bold mt-1">총 {leaves.filter(l => l.status === '대기').length}건의 신규 요청이 있습니다.</p>
              </div>
              <button type="button" onClick={() => setShowPendingModal(false)} className="text-[var(--toss-gray-3)] hover:text-red-500 text-2xl font-bold p-2 transition-colors">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-4 space-y-4 bg-[var(--muted)]/30 custom-scrollbar">
              {leaves.filter(l => l.status === '대기').length === 0 ? (
                <div className="py-20 text-center text-[var(--toss-gray-3)] font-bold text-sm">대기 중인 요청이 없습니다.</div>
              ) : (
                leaves.filter(l => l.status === '대기').map(l => {
                  const staff = staffList.find((s: any) => s.id === l.staff_id) || (l as any).staff_members;
                  return (
                    <div key={l.id} className="bg-[var(--card)] p-4 rounded-[var(--radius-xl)] border border-[var(--border)] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:shadow-md transition-all">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-[var(--foreground)]">{staff?.name}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${l.leave_type === '연차' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                            {l.leave_type}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--toss-gray-3)] font-semibold mb-2">{staff?.company} | {staff?.department}</p>
                        <div className="flex flex-col gap-1">
                          <p className="text-[12px] font-bold text-[var(--toss-gray-4)]">📅 {l.start_date} ~ {l.end_date}</p>
                          <p className="text-[12px] text-[var(--toss-gray-3)] italic">&quot; {l.reason} &quot;</p>
                        </div>
                      </div>
                      <div className="flex gap-2 w-full md:w-auto shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStatusUpdate(l.id, '반려')}
                          className="flex-1 md:flex-none px-5 py-2.5 bg-red-50 text-red-600 rounded-xl text-[11px] font-bold border border-red-100 hover:bg-red-100 transition-all"
                        >
                          반려
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusUpdate(l.id, '승인')}
                          className="flex-1 md:flex-none px-4 py-2.5 bg-[var(--accent)] text-white rounded-xl text-[11px] font-bold shadow-sm shadow-blue-500/20 hover:scale-[0.98] active:scale-95 transition-all"
                        >
                          승인하기
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 bg-[var(--card)] border-t border-[var(--border)] text-center">
              <button type="button" onClick={() => setShowPendingModal(false)} className="px-5 py-3 bg-[var(--muted)] text-[var(--toss-gray-4)] rounded-xl text-[11px] font-bold hover:bg-[var(--toss-gray-2)] transition-all">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

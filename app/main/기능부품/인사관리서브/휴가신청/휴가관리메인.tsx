'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { syncAnnualLeaveUsedForStaff } from '@/lib/annual-leave-ledger';
import { recalculateLeaveBalance } from '@/lib/annual-leave-balance';
import { logAudit, readClientAuditActor } from '@/lib/audit';
import { isNamedSystemMasterAccount } from '@/lib/system-master';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import AnnualLeavePromotion from './연차촉진시스템';
import AnnualLeaveLedger from './연차원장';
import LeaveRequestList from './연차휴가신청내역';
import HolidayWorkPolicySettings from './휴일근무규칙설정';
import LeaveDashboard from '../급여명세/연차종합대시보드';
import HolidayCalendar from '../공휴일달력';
import AnnualLeaveExpiryAlert from '../연차소멸알림';

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
  | '연차소멸알림'
  | '연차사용촉진 자동화'
  | '연차 자동부여 설정'
  | '공휴일 달력'
  | '연차 원장'
  | '휴일/대체휴무 규칙';

const LEAVE_TAB_DEFS: { id: LeaveManagementTabId; label: string }[] = [
  { id: '연차/휴가 신청내역', label: '연차/휴가 신청내역' },
  { id: '연차 대시보드', label: '연차 대시보드' },
  { id: '연차소멸알림', label: '연차소멸알림' },
  { id: '연차사용촉진 자동화', label: '연차사용촉진 자동화' },
  { id: '연차 자동부여 설정', label: '연차 자동부여 설정' },
  { id: '공휴일 달력', label: '공휴일 달력' },
  { id: '연차 원장', label: '연차 원장' },
  { id: '휴일/대체휴무 규칙', label: '휴일/대체휴무 규칙' },
];

const LEGACY_ADMIN_REDIRECT_TABS = new Set<LeaveManagementTabId>([
  '연차사용촉진 자동화',
]);

const ADMIN_ONLY_LEAVE_TABS = new Set<LeaveManagementTabId>([
  '연차 자동부여 설정',
  '공휴일 달력',
  '휴일/대체휴무 규칙',
]);

export default function LeaveManagement({
  staffs = [],
  selectedCo,
  onRefresh,
  user,
  initialTab,
  allowLeaveTabs = true,
  allowHolidayTab = true,
  tabMode = 'all',
}: Record<string, unknown>) {
  const { dialog, openConfirm } = useActionDialog();
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<LeaveManagementTabId>((initialTab as LeaveManagementTabId) ?? '연차/휴가 신청내역');
  const [leaveConfig, setLeaveConfig] = useState<'입사일 기준' | '회계연도 기준'>('입사일 기준');
  const [leaveConfigLoading, setLeaveConfigLoading] = useState(false);
  const staffList = Array.isArray(staffs) ? staffs : [];
  const canManageLeaves = isNamedSystemMasterAccount(user as Record<string, unknown> | null);
  const [currentUser, setCurrentUser] = useState<Record<string, unknown> | null>(null);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const availableTabs = useMemo(
    () =>
      LEAVE_TAB_DEFS.filter((tab) => {
        if (LEGACY_ADMIN_REDIRECT_TABS.has(tab.id)) return tabMode === 'all' && allowLeaveTabs;
        if (tabMode === 'admin') {
          if (!ADMIN_ONLY_LEAVE_TABS.has(tab.id)) return false;
          if (tab.id === '공휴일 달력') return allowHolidayTab;
          return true;
        }
        if (ADMIN_ONLY_LEAVE_TABS.has(tab.id)) return false;
        if (tab.id === '공휴일 달력') return allowHolidayTab;
        return allowLeaveTabs;
      }),
    [allowHolidayTab, allowLeaveTabs, tabMode]
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

  // 선택된 회사의 leave_policy 조회
  useEffect(() => {
    const coName = selectedCo as string;
    if (!coName || coName === '전체') return;
    setLeaveConfigLoading(true);
    void Promise.resolve(
      supabase
        .from('companies')
        .select('leave_policy')
        .eq('name', coName)
        .maybeSingle()
    ).then(({ data }) => {
      if (data?.leave_policy === '회계연도') {
        setLeaveConfig('회계연도 기준');
      } else {
        setLeaveConfig('입사일 기준');
      }
    }).catch((err: unknown) => {
      console.error('[LeaveManagement] 회사 정책 조회 실패:', err);
    }).finally(() => setLeaveConfigLoading(false));
  }, [selectedCo]);

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
      const raw = localStorage.getItem(STORAGE_KEYS.USER);
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
      const targetLeave = leaves.find((leave) => leave.id === id);
      const previousStatus = targetLeave?.status;
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status,
          approved_at: status === '승인' ? new Date().toISOString() : null,
        })
        .eq('id', id);

      if (error) throw error;
      setLeaves((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));

      let recalculatedUsedDays: number | null = null;
      if (targetLeave?.staff_id) {
        recalculatedUsedDays = await syncAnnualLeaveUsedForStaff(targetLeave.staff_id);
        // leave_balances 정합성 갱신 (JM3: 실패해도 메인 흐름 차단 안 함)
        recalculateLeaveBalance(targetLeave.staff_id).catch((err) => {
          console.error('[handleStatusUpdate] recalculateLeaveBalance 실패:', err);
          toast('연차 잔액 갱신에 실패했습니다. 잔액이 일시적으로 부정확할 수 있습니다.', 'warning');
        });
      }

      const actor = readClientAuditActor();
      await logAudit(
        'leave_request_status_updated',
        'leave_request',
        id,
        {
          staff_id: targetLeave?.staff_id ?? null,
          leave_type: targetLeave?.leave_type ?? null,
          before_status: previousStatus ?? null,
          after_status: status,
          rollback_applied: previousStatus === '승인' && status !== '승인',
          annual_leave_used_recalculated: recalculatedUsedDays,
        },
        actor.userId,
        actor.userName
      );

      toast(`신청이 ${status} 처리되었습니다.`, 'success');
      if (onRefresh) (onRefresh as () => void)();
    } catch (err) {
      toast('처리에 실패했습니다.', 'error');
    }
  };

  // 시스템마스터 전용 — 휴가 신청내역 수정
  const handleEditLeave = async (id: string, patch: Partial<Leave>) => {
    if (!canManageLeaves) {
      toast('시스템마스터 관리자만 수정할 수 있습니다.', 'error');
      return;
    }
    try {
      const target = leaves.find((l) => l.id === id);
      const nextStatus = patch.status ?? target?.status;
      const { error } = await supabase
        .from('leave_requests')
        .update({
          leave_type: patch.leave_type,
          start_date: patch.start_date,
          end_date: patch.end_date,
          reason: patch.reason,
          status: nextStatus,
          approved_at: nextStatus === '승인' ? new Date().toISOString() : null,
        })
        .eq('id', id);
      if (error) throw error;
      setLeaves((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

      if (target?.staff_id) {
        await syncAnnualLeaveUsedForStaff(target.staff_id);
        recalculateLeaveBalance(target.staff_id).catch((err) => {
          console.error('[handleEditLeave] recalculateLeaveBalance 실패:', err);
          toast('연차 잔액 갱신에 실패했습니다. 잔액이 일시적으로 부정확할 수 있습니다.', 'warning');
        });
      }

      const actor = readClientAuditActor();
      await logAudit(
        'leave_request_updated',
        'leave_request',
        id,
        {
          staff_id: target?.staff_id ?? null,
          before: target
            ? {
                leave_type: target.leave_type,
                start_date: target.start_date,
                end_date: target.end_date,
                reason: target.reason,
                status: target.status,
              }
            : null,
          after: patch,
        },
        actor.userId,
        actor.userName
      );

      toast('휴가 신청내역이 수정되었습니다.', 'success');
      if (onRefresh) (onRefresh as () => void)();
    } catch (err) {
      toast('수정에 실패했습니다.', 'error');
    }
  };

  // 시스템마스터 전용 — 휴가 신청내역 삭제
  const handleDeleteLeave = async (id: string) => {
    if (!canManageLeaves) {
      toast('시스템마스터 관리자만 삭제할 수 있습니다.', 'error');
      return;
    }
    const target = leaves.find((l) => l.id === id);
    const staffName = staffList.find((s: any) => s.id === target?.staff_id)?.name ?? '직원';
    const confirmed = await openConfirm({
      title: '휴가 신청내역 삭제',
      description: `${staffName}의 ${target?.leave_type ?? '휴가'} 신청(${target?.start_date})을 삭제합니다.\n삭제 후 연차 사용일수가 재계산됩니다.`,
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const { error } = await supabase.from('leave_requests').delete().eq('id', id);
      if (error) throw error;
      setLeaves((prev) => prev.filter((l) => l.id !== id));

      if (target?.staff_id) {
        await syncAnnualLeaveUsedForStaff(target.staff_id);
        recalculateLeaveBalance(target.staff_id).catch((err) => {
          console.error('[handleDeleteLeave] recalculateLeaveBalance 실패:', err);
          toast('연차 잔액 갱신에 실패했습니다. 잔액이 일시적으로 부정확할 수 있습니다.', 'warning');
        });
      }

      const actor = readClientAuditActor();
      await logAudit(
        'leave_request_deleted',
        'leave_request',
        id,
        {
          staff_id: target?.staff_id ?? null,
          leave_type: target?.leave_type ?? null,
          start_date: target?.start_date ?? null,
          end_date: target?.end_date ?? null,
          status: target?.status ?? null,
        },
        actor.userId,
        actor.userName
      );

      toast('휴가 신청내역이 삭제되었습니다.', 'success');
      if (onRefresh) (onRefresh as () => void)();
    } catch (err) {
      toast('삭제에 실패했습니다.', 'error');
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
    const policyLabel = leaveConfig === '회계연도 기준' ? '회계연도(1월 1일)' : '입사일';
    const confirmed = await openConfirm({
      title: '전 직원 연차 재계산',
      description: `전 직원의 연차를 ${policyLabel} 기준으로 재계산합니다.\n기존 연차 총량이 갱신될 수 있습니다.`,
      confirmText: '재계산',
      tone: 'danger',
    });
    if (!confirmed) return;
    setLoading(true);
    try {
      const now = new Date();
      for (const s of staffList) {
        const joinDate = (s as Record<string, unknown>).joined_at || (s as Record<string, unknown>).join_date;
        if (!joinDate) continue;
        const join = new Date(joinDate as string);
        const years = (now.getTime() - join.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

        let total = 0;
        if (leaveConfig === '회계연도 기준') {
          // 회계연도: 올해 1월 1일 기준 근속연수로 산정
          const fiscalYears = now.getFullYear() - join.getFullYear();
          if (fiscalYears >= 1) total = Math.min(25, 15 + Math.floor((fiscalYears - 1) / 2));
          else total = Math.min(11, now.getMonth() + 1); // 입사 연도는 월 비례
        } else {
          // 입사일 기준
          if (years >= 1) total = Math.min(25, 15 + Math.floor((years - 1) / 2));
          else total = Math.min(11, Math.floor((now.getTime() - join.getTime()) / (30 * 24 * 60 * 60 * 1000)));
        }

        await supabase.from('staff_members').update({ annual_leave_total: total }).eq('id', (s as Record<string, unknown>).id);
        // leave_balances 동기화
        recalculateLeaveBalance(String((s as Record<string, unknown>).id)).catch((err) => {
          console.error('[runAnnualLeaveAutoGrant] recalculateLeaveBalance 실패:', err, (s as Record<string, unknown>).id);
        });
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
      {dialog}
      <div className="relative z-10 flex shrink-0 flex-col gap-4 border-b border-[var(--border)] bg-[var(--card)] p-4 md:flex-row md:items-center md:justify-between md:p-4">
        <div className="relative z-20 flex w-full gap-2 overflow-x-auto no-scrollbar md:w-auto">
          {availableTabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`leave-tab-${tab.id.replace(/[^\w가-힣]+/g, '-')}`}
              className={`px-3 py-2.5 rounded-[var(--radius-md)] text-[12px] font-semibold whitespace-nowrap transition-all ${activeTab === tab.id
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
          <LeaveRequestList
            leaves={leaves}
            staffList={staffList as any[]}
            onStatusUpdate={handleStatusUpdate}
            onShowPending={() => setShowPendingModal(true)}
            canManage={canManageLeaves}
            onEdit={handleEditLeave}
            onDelete={handleDeleteLeave}
          />
        )}

        {activeTab === '연차 대시보드' && (
          <LeaveDashboard staffs={staffList} selectedCo={selectedCo as string} currentUser={currentUser} />
        )}
        {activeTab === '연차소멸알림' && (
          <AnnualLeaveExpiryAlert staffs={staffList} selectedCo={selectedCo as string} user={user} />
        )}
        {activeTab === '연차사용촉진 자동화' && <AnnualLeavePromotion staffs={staffList} selectedCo={selectedCo as string} />}

        {activeTab === '연차 자동부여 설정' && (
          <div className="bg-[var(--card)] p-5 border border-[var(--border)] shadow-sm rounded-2xl text-center max-w-2xl mx-auto">
            <p className="text-5xl mb-4">⚙️</p>
            <h3 className="text-xl font-semibold text-[var(--foreground)] mb-4">연차 자동 부여 로직 설정</h3>
            <p className="text-sm text-[var(--toss-gray-3)] font-bold mb-4 leading-relaxed">
              근로기준법에 따른 연차 산정 방식을 선택해 주세요.<br />
              현재 설정: <span className="text-[var(--accent)] font-semibold underline underline-offset-4">{leaveConfigLoading ? '로딩 중...' : leaveConfig}</span>
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
        {activeTab === '연차 원장' && (
          <AnnualLeaveLedger staffs={staffList as any[]} selectedCo={selectedCo as string} />
        )}
        {activeTab === '휴일/대체휴무 규칙' && (
          <HolidayWorkPolicySettings selectedCo={selectedCo as string} />
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
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${l.leave_type === '연차' ? 'bg-blue-500/10 text-blue-600' : 'bg-purple-500/10 text-purple-600'}`}>
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
                          className="flex-1 md:flex-none px-5 py-2.5 bg-red-500/10 text-red-600 rounded-xl text-[11px] font-bold border border-red-100 hover:bg-red-500/20 transition-all"
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

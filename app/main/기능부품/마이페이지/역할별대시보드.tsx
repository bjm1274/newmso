'use client';

import { useCallback, useEffect, useState } from 'react';
import { resolveApprovalDelegateConfig } from '@/lib/approval-workflow';
import { calculateApprovedAnnualLeaveUsage } from '@/lib/annual-leave-ledger';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';

interface Props {
  user: any;
  setMainMenu?: (menu: string) => void;
  onOpenApproval?: (options?: Record<string, unknown>) => void;
  selectedCo?: string | null;
  selectedCompanyId?: string | null;
}

type ApprovalRow = Record<string, unknown>;

type PendingApprovalItem = {
  id: string;
  title: string;
  department: string;
  created_at: string;
};

type TodayAttendance = {
  in: string | null;
  out: string | null;
  status: string | null;
};

type AnnualLeaveSummary = {
  remaining: number;
  total: number;
};

const MANAGER_POSITIONS = ['과장', '간호과장', '실장', '수간호사', '파트장', '센터장', '부장', '본부장', '이사', '원장', '병원장', '대표'];
function formatTodayAttendancePrimary(todayAttendance: TodayAttendance, formatTime: (value: string | null) => string) {
  const normalizedStatus = String(todayAttendance.status ?? '').trim().toLowerCase();
  if (normalizedStatus === 'annual_leave' || normalizedStatus === '연차휴가') return '연차';
  if (normalizedStatus === 'half_leave' || normalizedStatus === '반차휴가') return '반차';
  if (normalizedStatus === 'sick_leave' || normalizedStatus === '병가') return '병가';
  return formatTime(todayAttendance.in);
}

function formatTodayAttendanceSecondary(todayAttendance: TodayAttendance, formatTime: (value: string | null) => string) {
  const normalizedStatus = String(todayAttendance.status ?? '').trim().toLowerCase();
  if (normalizedStatus === 'annual_leave' || normalizedStatus === '연차휴가') return '승인된 연차 일정';
  if (normalizedStatus === 'half_leave' || normalizedStatus === '반차휴가') return '승인된 반차 일정';
  if (normalizedStatus === 'sick_leave' || normalizedStatus === '병가') return '승인된 병가 일정';
  return todayAttendance.out ? `퇴근 ${formatTime(todayAttendance.out)}` : null;
}

function normalizeApprovalLineIds(line: unknown): string[] {
  if (!Array.isArray(line)) return [];
  const ids = line
    .map((entry) => {
      if (entry == null) return null;
      if (typeof entry === 'string' || typeof entry === 'number') return String(entry);
      if (typeof entry === 'object' && entry !== null && 'id' in entry && (entry as Record<string, unknown>).id != null) {
        return String((entry as Record<string, unknown>).id);
      }
      return null;
    })
    .filter(Boolean) as string[];
  return Array.from(new Set(ids));
}

function resolveApprovalLineIds(item: ApprovalRow): string[] {
  const metaData = item?.meta_data as Record<string, unknown> | null | undefined;
  const explicitLineIds = normalizeApprovalLineIds(item?.approver_line ?? metaData?.approver_line);
  if (explicitLineIds.length > 0) return explicitLineIds;
  if (item?.current_approver_id != null) return [String(item.current_approver_id)];
  return [];
}

function resolveStoredCurrentApproverId(item: ApprovalRow): string | null {
  const metaData = item?.meta_data as Record<string, unknown> | null | undefined;
  if (item?.current_approver_id != null) {
    const currentApproverId = String(item.current_approver_id);
    const delegatedToId = String(metaData?.delegated_to_id || '');
    const delegatedFromId = String(metaData?.delegated_from_id || '');
    if (delegatedToId && delegatedToId === currentApproverId && delegatedFromId) {
      return delegatedFromId;
    }
    return currentApproverId;
  }

  const lineIds = resolveApprovalLineIds(item);
  return lineIds[0] ?? null;
}

function resolveEffectiveApproverId(
  approverId: string | null | undefined,
  approverMap: Map<string, Record<string, unknown>>,
) {
  if (!approverId) return null;
  const matchedApprover = approverMap.get(String(approverId));
  const delegateConfig = resolveApprovalDelegateConfig(matchedApprover ?? null);
  if (delegateConfig.active && delegateConfig.delegateId) {
    return String(delegateConfig.delegateId);
  }
  return String(approverId);
}

export default function RoleDashboard({
  user,
  setMainMenu,
  onOpenApproval,
  selectedCo,
}: Props) {
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [pendingApprovalItems, setPendingApprovalItems] = useState<PendingApprovalItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendance>({ in: null, out: null, status: null });
  const [annualLeave, setAnnualLeave] = useState<AnnualLeaveSummary | null>(null);
  const [teamCount, setTeamCount] = useState(0);
  const [teamCheckedIn, setTeamCheckedIn] = useState(0);

  const isAdmin = user?.role === 'admin' || user?.company === 'SY INC.' || user?.permissions?.mso;
  const isManager = MANAGER_POSITIONS.includes(user?.position);

  const fetchPending = useCallback(async () => {
    if (!user?.id) return;

    const { data, error } = await withMissingColumnsFallback(
      async (omittedColumns) => {
        const selectColumns = [
          'id',
          'status',
          'current_approver_id',
          'sender_company',
          'created_at',
          ...(omittedColumns.has('title') ? [] : ['title']),
          ...(omittedColumns.has('sender_department') ? [] : ['sender_department']),
          ...(omittedColumns.has('company_id') ? [] : ['company_id']),
          ...(omittedColumns.has('approver_line') ? [] : ['approver_line']),
          ...(omittedColumns.has('meta_data') ? [] : ['meta_data']),
        ];

        let query = supabase
          .from('approvals')
          .select(selectColumns.join(', '))
          .eq('status', '대기');

        return query;
      },
      ['company_id', 'approver_line', 'meta_data', 'title', 'sender_department'],
    );

    if (error) {
      console.error('Failed to load pending approvals:', error);
      setLoadError(true);
      setPendingApprovals(0);
      return;
    }

    const approvalRows = Array.isArray(data) ? (data as unknown as ApprovalRow[]) : [];
    const approverIds = Array.from(
      new Set(
        approvalRows
          .map((item) => resolveStoredCurrentApproverId(item))
          .map((approverId) => String(approverId || '').trim())
          .filter(Boolean)
      )
    );

    const approverMap = new Map<string, Record<string, unknown>>();
    if (approverIds.length > 0) {
      const { data: approverRows, error: approverError } = await supabase
        .from('staff_members')
        .select('id, permissions')
        .in('id', approverIds);

      if (approverError) {
        console.error('Failed to load approval approvers:', approverError);
      } else {
        (approverRows || []).forEach((staff) => {
          approverMap.set(String(staff.id), staff as Record<string, unknown>);
        });
      }
    }

    const myPendingItems = approvalRows.filter((item) => {
      const effectiveApproverId = resolveEffectiveApproverId(resolveStoredCurrentApproverId(item), approverMap);
      if (!effectiveApproverId) return false;
      return effectiveApproverId === String(user.id);
    });

    setPendingApprovals(myPendingItems.length);
    setPendingApprovalItems(
      myPendingItems
        .sort((a, b) => new Date(String(a.created_at || 0)).getTime() - new Date(String(b.created_at || 0)).getTime())
        .slice(0, 5)
        .map((item) => ({
          id: String(item.id || ''),
          title: String(item.title || (item.meta_data as Record<string, unknown>)?.title || '결재 문서'),
          department: String(item.sender_department || item.sender_company || ''),
          created_at: String(item.created_at || ''),
        }))
    );
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const fetchToday = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('attendances')
        .select('check_in_time, check_out_time, status')
        .eq('staff_id', user.id)
        .eq('work_date', today)
        .maybeSingle();

      if (data) {
        setTodayAttendance({
          in: data.check_in_time,
          out: data.check_out_time,
          status: data.status,
        });
      } else {
        setTodayAttendance({ in: null, out: null, status: null });
      }
    };

    const fetchLeave = async () => {
      const currentYear = new Date().getFullYear();
      const yearStart = `${currentYear}-01-01`;
      const yearEnd = `${currentYear}-12-31`;

      const [{ data }, { data: approvedLeaves }] = await Promise.all([
        supabase
          .from('staff_members')
          .select('annual_leave_total, annual_leave_used')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('leave_requests')
          .select('leave_type, start_date, end_date, status')
          .eq('staff_id', user.id)
          .lte('start_date', yearEnd)
          .gte('end_date', yearStart),
      ]);

      if (data) {
        const used = Math.max(
          Number(data.annual_leave_used || 0),
          calculateApprovedAnnualLeaveUsage(
            Array.isArray(approvedLeaves) ? (approvedLeaves as Record<string, unknown>[]) : [],
            currentYear
          )
        );

        setAnnualLeave({
          remaining: Math.max(0, (data.annual_leave_total || 0) - used),
          total: data.annual_leave_total || 0,
        });
      } else {
        setAnnualLeave(null);
      }
    };

    void fetchPending();
    fetchToday();
    fetchLeave();

    if (isAdmin || isManager) {
      const fetchLowStock = async () => {
        const { count } = await supabase
          .from('inventory')
          .select('*', { count: 'exact', head: true })
          .lt('quantity', 5);

        setLowStockCount(count || 0);
      };

      const fetchTeam = async () => {
        if (!user?.department) return;

        const today = new Date().toISOString().slice(0, 10);
        const [{ count: totalCount }, { count: checkedInCount }] = await Promise.all([
          supabase
            .from('staff_members')
            .select('*', { count: 'exact', head: true })
            .eq('department', user.department)
            .eq('status', '재직'),
          supabase
            .from('attendances')
            .select('*', { count: 'exact', head: true })
            .eq('work_date', today)
            .not('check_in_time', 'is', null),
        ]);

        setTeamCount(totalCount || 0);
        setTeamCheckedIn(checkedInCount || 0);
      };

      fetchLowStock();
      fetchTeam();
    }
  }, [fetchPending, isAdmin, isManager, user?.department, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`mypage-pending-approvals-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, () => {
        void fetchPending();
      })
      .subscribe();

    const handleFocus = () => {
      void fetchPending();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
      }
      supabase.removeChannel(channel);
    };
  }, [fetchPending, user?.id]);

  const formatTime = (value: string | null) => {
    if (!value) return '-';
    return value.slice(11, 16);
  };

  const openApprovalInbox = () => {
    if (typeof onOpenApproval === 'function') {
      // Open the actionable inbox view first; the legacy navigation stays below as a fallback.
      if (selectedCo !== '__legacy__') {
        onOpenApproval({
          viewMode: '결재함',
          statusFilter: '대기',
          documentFilter: '전체 문서',
          keyword: '',
          dateMode: 'range',
          dateFrom: '',
          dateTo: '',
        });
        return;
      }
      onOpenApproval({ viewMode: '결재함' });
      return;
    }

    setMainMenu?.('전자결재');
  };

  return (
    <div className="mb-0">
      {loadError && (
        <div className="text-center py-4 text-[var(--toss-gray-3)] text-[12px]">
          데이터를 불러오지 못했습니다
        </div>
      )}
      {isAdmin ? (
        <AdminDashboard
          pendingApprovals={pendingApprovals}
          pendingApprovalItems={pendingApprovalItems}
          lowStockCount={lowStockCount}
          setMainMenu={setMainMenu}
          openApprovalInbox={openApprovalInbox}
        />
      ) : isManager ? (
        <ManagerDashboard
          teamCount={teamCount}
          teamCheckedIn={teamCheckedIn}
          department={user?.department}
          pendingApprovals={pendingApprovals}
          pendingApprovalItems={pendingApprovalItems}
          todayAttendance={todayAttendance}
          lowStockCount={lowStockCount}
          setMainMenu={setMainMenu}
          openApprovalInbox={openApprovalInbox}
          formatTime={formatTime}
        />
      ) : (
        <UserDashboard
          todayAttendance={todayAttendance}
          annualLeave={annualLeave}
          pendingApprovals={pendingApprovals}
          pendingApprovalItems={pendingApprovalItems}
          setMainMenu={setMainMenu}
          openApprovalInbox={openApprovalInbox}
          formatTime={formatTime}
        />
      )}
    </div>
  );
}

function AdminActionCard({
  title,
  value,
  icon,
  active,
  onValueClick,
}: {
  title: string;
  value: string;
  icon: string;
  active: boolean;
  onValueClick?: () => void;
}) {
  return (
    <div className="flex min-h-[88px] w-full items-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-left sm:min-h-[104px] sm:w-[calc(50%-0.375rem)] xl:min-h-[128px] xl:w-[164px]">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--card)]/85 text-sm shadow-sm ring-1 ring-black/5 sm:h-9 sm:w-9 sm:text-base">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">
            {title}
          </p>
          {active ? (
            <button
              type="button"
              onClick={onValueClick}
              className="mt-1 text-left text-lg font-black text-[var(--accent)] transition hover:opacity-80 focus:outline-none sm:mt-1.5 sm:text-xl"
            >
              {value}
            </button>
          ) : (
            <p className="mt-1 text-lg font-black text-[var(--foreground)] sm:mt-1.5 sm:text-xl">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function _LegacyUserDashboard({
  todayAttendance,
  annualLeave,
  pendingApprovals,
  setMainMenu,
  openApprovalInbox,
  formatTime,
}: {
  todayAttendance: TodayAttendance;
  annualLeave: AnnualLeaveSummary | null;
  pendingApprovals: number;
  setMainMenu?: (menu: string) => void;
  openApprovalInbox: () => void;
  formatTime: (value: string | null) => string;
}) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">오늘 출근</p>
        <p className="text-lg font-bold text-[var(--foreground)]">{formatTodayAttendancePrimary(todayAttendance, formatTime)}</p>
        {todayAttendance.out ? <p className="text-[11px] text-[var(--toss-gray-3)]">퇴근 {formatTime(todayAttendance.out)}</p> : null}
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">연차 잔여</p>
        <p className="text-lg font-bold text-[var(--accent)]">{annualLeave?.remaining ?? '-'}일</p>
        {annualLeave ? <p className="text-[11px] text-[var(--toss-gray-3)]">총 {annualLeave.total}일</p> : null}
      </div>

      <button
        type="button"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-all hover:bg-[var(--toss-blue-light)]/30"
        onClick={openApprovalInbox}
      >
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">결재 대기</p>
        <p className={`text-lg font-bold ${pendingApprovals > 0 ? 'text-orange-500' : 'text-[var(--foreground)]'}`}>{pendingApprovals}건</p>
        <p className="text-[11px] text-[var(--accent)]">바로가기</p>
      </button>

      <button
        type="button"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-all hover:bg-[var(--toss-blue-light)]/30"
        onClick={() => setMainMenu?.('채팅')}
      >
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">채팅</p>
        <p className="text-lg font-bold text-[var(--foreground)]">열기</p>
        <p className="text-[11px] text-[var(--accent)]">바로가기</p>
      </button>
    </div>
  );
}

function _LegacyManagerDashboard({
  teamCount,
  department,
  pendingApprovals,
  todayAttendance,
  lowStockCount,
  setMainMenu,
  openApprovalInbox,
  formatTime,
}: {
  teamCount: number;
  department?: string;
  pendingApprovals: number;
  todayAttendance: TodayAttendance;
  lowStockCount: number;
  setMainMenu?: (menu: string) => void;
  openApprovalInbox: () => void;
  formatTime: (value: string | null) => string;
}) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">팀 인원</p>
        <p className="text-lg font-bold text-[var(--foreground)]">{teamCount}명</p>
        <p className="text-[11px] text-[var(--toss-gray-3)]">{department || '-'}</p>
      </div>

      <button
        type="button"
        className={`rounded-[var(--radius-lg)] border p-4 text-left transition-all ${
          pendingApprovals > 0
            ? 'border-orange-200 bg-orange-50 hover:bg-orange-100'
            : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
        }`}
        onClick={openApprovalInbox}
      >
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">결재 대기</p>
        <p className={`text-lg font-bold ${pendingApprovals > 0 ? 'text-orange-600' : 'text-[var(--foreground)]'}`}>{pendingApprovals}건</p>
        <p className="text-[11px] text-[var(--accent)]">바로가기</p>
      </button>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">오늘 출근</p>
        <p className="text-lg font-bold text-[var(--foreground)]">{formatTime(todayAttendance.in)}</p>
      </div>

      <button
        type="button"
        className={`rounded-[var(--radius-lg)] border p-4 text-left transition-all ${
          lowStockCount > 0
            ? 'border-red-200 bg-red-50 hover:bg-red-100'
            : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
        }`}
        onClick={() => setMainMenu?.('재고관리')}
      >
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">재고 부족</p>
        <p className={`text-lg font-bold ${lowStockCount > 0 ? 'text-red-600' : 'text-[var(--foreground)]'}`}>{lowStockCount}건</p>
        <p className="text-[11px] text-[var(--accent)]">바로가기</p>
      </button>
    </div>
  );
}

function PendingApprovalPreview({ items, onOpen }: { items: PendingApprovalItem[]; onOpen: () => void }) {
  if (items.length === 0) return null;
  const now = Date.now();
  return (
    <div className="mt-2 space-y-1">
      {items.map((item) => {
        const isOld = now - new Date(item.created_at).getTime() > 24 * 60 * 60 * 1000;
        return (
          <button
            key={item.id}
            type="button"
            onClick={onOpen}
            className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition hover:bg-[var(--muted)]"
          >
            <span className={`truncate text-[11px] font-medium ${isOld ? 'text-red-500' : 'text-[var(--foreground)]'}`}>
              {isOld && <span className="mr-1">🔴</span>}
              {item.title}
            </span>
            {item.department && (
              <span className="shrink-0 rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--toss-gray-3)]">
                {item.department}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function UserDashboard({
  todayAttendance,
  annualLeave,
  pendingApprovals,
  pendingApprovalItems,
  setMainMenu,
  openApprovalInbox,
  formatTime,
}: {
  todayAttendance: TodayAttendance;
  annualLeave: AnnualLeaveSummary | null;
  pendingApprovals: number;
  pendingApprovalItems: PendingApprovalItem[];
  setMainMenu?: (menu: string) => void;
  openApprovalInbox: () => void;
  formatTime: (value: string | null) => string;
}) {
  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">오늘 근태</p>
          <p className="text-lg font-bold text-[var(--foreground)]">{formatTodayAttendancePrimary(todayAttendance, formatTime)}</p>
          {formatTodayAttendanceSecondary(todayAttendance, formatTime) ? (
            <p className="text-[11px] text-[var(--toss-gray-3)]">{formatTodayAttendanceSecondary(todayAttendance, formatTime)}</p>
          ) : null}
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">연차 잔여</p>
          <p className="text-lg font-bold text-[var(--accent)]">{annualLeave?.remaining ?? '-'}일</p>
          {annualLeave ? <p className="text-[11px] text-[var(--toss-gray-3)]">총 {annualLeave.total}일</p> : null}
        </div>

        <button
          type="button"
          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-all hover:bg-[var(--toss-blue-light)]/30"
          onClick={openApprovalInbox}
        >
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">결재 대기</p>
          <p className={`text-lg font-bold ${pendingApprovals > 0 ? 'text-orange-500' : 'text-[var(--foreground)]'}`}>{pendingApprovals}건</p>
          <p className="text-[11px] text-[var(--accent)]">바로가기</p>
        </button>

        <button
          type="button"
          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-all hover:bg-[var(--toss-blue-light)]/30"
          onClick={() => setMainMenu?.('채팅')}
        >
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">채팅</p>
          <p className="text-lg font-bold text-[var(--foreground)]">열기</p>
          <p className="text-[11px] text-[var(--accent)]">바로가기</p>
        </button>
      </div>

      {pendingApprovalItems.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">결재 대기 목록</p>
          <PendingApprovalPreview items={pendingApprovalItems} onOpen={openApprovalInbox} />
        </div>
      )}
    </div>
  );
}

function ManagerDashboard({
  teamCount,
  teamCheckedIn,
  department,
  pendingApprovals,
  pendingApprovalItems,
  todayAttendance,
  lowStockCount,
  setMainMenu,
  openApprovalInbox,
  formatTime,
}: {
  teamCount: number;
  teamCheckedIn: number;
  department?: string;
  pendingApprovals: number;
  pendingApprovalItems: PendingApprovalItem[];
  todayAttendance: TodayAttendance;
  lowStockCount: number;
  setMainMenu?: (menu: string) => void;
  openApprovalInbox: () => void;
  formatTime: (value: string | null) => string;
}) {
  const teamNotCheckedIn = Math.max(0, teamCount - teamCheckedIn);
  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">팀 출근 현황</p>
          <p className="text-lg font-bold text-[var(--foreground)]">
            <span className="text-green-600">{teamCheckedIn}</span>
            <span className="text-[13px] text-[var(--toss-gray-3)]"> / {teamCount}명</span>
          </p>
          <p className="text-[11px]">
            {teamNotCheckedIn > 0 ? (
              <span className="text-orange-500">미출근 {teamNotCheckedIn}명</span>
            ) : (
              <span className="text-[var(--toss-gray-3)]">{department || '-'}</span>
            )}
          </p>
        </div>

        <button
          type="button"
          className={`rounded-[var(--radius-lg)] border p-4 text-left transition-all ${
            pendingApprovals > 0
              ? 'border-orange-200 bg-orange-500/10 hover:bg-orange-500/20'
              : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
          }`}
          onClick={openApprovalInbox}
        >
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">결재 대기</p>
          <p className={`text-lg font-bold ${pendingApprovals > 0 ? 'text-orange-500' : 'text-[var(--foreground)]'}`}>{pendingApprovals}건</p>
          <p className="text-[11px] text-[var(--accent)]">바로가기</p>
        </button>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">내 근태</p>
          <p className="text-lg font-bold text-[var(--foreground)]">{formatTodayAttendancePrimary(todayAttendance, formatTime)}</p>
          {formatTodayAttendanceSecondary(todayAttendance, formatTime) ? (
            <p className="text-[11px] text-[var(--toss-gray-3)]">{formatTodayAttendanceSecondary(todayAttendance, formatTime)}</p>
          ) : null}
        </div>

        <button
          type="button"
          className={`rounded-[var(--radius-lg)] border p-4 text-left transition-all ${
            lowStockCount > 0
              ? 'border-red-200 bg-red-500/10 hover:bg-red-500/20'
              : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
          }`}
          onClick={() => setMainMenu?.('재고관리')}
        >
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">재고 부족</p>
          <p className={`text-lg font-bold ${lowStockCount > 0 ? 'text-red-600' : 'text-[var(--foreground)]'}`}>{lowStockCount}건</p>
          <p className="text-[11px] text-[var(--accent)]">바로가기</p>
        </button>
      </div>

      {pendingApprovalItems.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">결재 대기 목록</p>
          <PendingApprovalPreview items={pendingApprovalItems} onOpen={openApprovalInbox} />
        </div>
      )}
    </div>
  );
}

function AdminDashboard({
  pendingApprovals,
  pendingApprovalItems,
  lowStockCount,
  setMainMenu,
  openApprovalInbox,
}: {
  pendingApprovals: number;
  pendingApprovalItems: PendingApprovalItem[];
  lowStockCount: number;
  setMainMenu?: (menu: string) => void;
  openApprovalInbox: () => void;
}) {
  return (
    <div className="mb-0 space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-stretch sm:gap-3">
      <AdminActionCard
        title="결재 대기"
        value={`${pendingApprovals}건`}
        icon="✅"
        active={pendingApprovals > 0}
        onValueClick={openApprovalInbox}
      />
      <AdminActionCard
        title="재고 부족"
        value={`${lowStockCount}건`}
        icon="📦"
        active={lowStockCount > 0}
        onValueClick={() => setMainMenu?.('재고관리')}
      />
      </div>
      {pendingApprovalItems.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">결재 대기 목록</p>
          <PendingApprovalPreview items={pendingApprovalItems} onOpen={openApprovalInbox} />
        </div>
      )}
    </div>
  );
}

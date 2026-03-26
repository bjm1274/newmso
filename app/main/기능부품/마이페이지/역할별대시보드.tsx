'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  user: any;
  setMainMenu?: (menu: string) => void;
  onOpenApproval?: (options?: Record<string, unknown>) => void;
}

type TodayAttendance = {
  in: string | null;
  out: string | null;
};

type AnnualLeaveSummary = {
  remaining: number;
  total: number;
};

const MANAGER_POSITIONS = ['과장', '간호과장', '실장', '수간호사', '파트장', '센터장', '부장', '본부장', '이사', '원장', '병원장', '대표'];

export default function RoleDashboard({ user, setMainMenu, onOpenApproval }: Props) {
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendance>({ in: null, out: null });
  const [annualLeave, setAnnualLeave] = useState<AnnualLeaveSummary | null>(null);
  const [teamCount, setTeamCount] = useState(0);

  const isAdmin = user?.role === 'admin' || user?.company === 'SY INC.' || user?.permissions?.mso;
  const isManager = MANAGER_POSITIONS.includes(user?.position);

  useEffect(() => {
    if (!user?.id) return;

    const fetchPending = async () => {
      const { count, error } = await supabase
        .from('approvals')
        .select('id', { count: 'exact', head: true })
        .eq('status', '대기')
        .eq('current_approver_id', user.id);

      if (error) {
        console.error('Failed to load pending approvals:', error);
        setPendingApprovals(0);
        return;
      }

      setPendingApprovals(count || 0);
    };

    const fetchToday = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('attendances')
        .select('check_in_time, check_out_time')
        .eq('staff_id', user.id)
        .eq('work_date', today)
        .maybeSingle();

      if (data) {
        setTodayAttendance({
          in: data.check_in_time,
          out: data.check_out_time,
        });
      }
    };

    const fetchLeave = async () => {
      const { data } = await supabase
        .from('staff_members')
        .select('annual_leave_total, annual_leave_used')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setAnnualLeave({
          remaining: (data.annual_leave_total || 0) - (data.annual_leave_used || 0),
          total: data.annual_leave_total || 0,
        });
      }
    };

    fetchPending();
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

        const { count } = await supabase
          .from('staff_members')
          .select('*', { count: 'exact', head: true })
          .eq('department', user.department)
          .eq('status', '재직');

        setTeamCount(count || 0);
      };

      fetchLowStock();
      fetchTeam();
    }
  }, [isAdmin, isManager, user?.department, user?.id]);

  const formatTime = (value: string | null) => {
    if (!value) return '-';
    return value.slice(11, 16);
  };

  const openApprovalInbox = () => {
    if (typeof onOpenApproval === 'function') {
      onOpenApproval({ viewMode: '결재함' });
      return;
    }

    setMainMenu?.('전자결재');
  };

  return (
    <div className="mb-0">
      {isAdmin ? (
        <AdminDashboard
          pendingApprovals={pendingApprovals}
          lowStockCount={lowStockCount}
          setMainMenu={setMainMenu}
          openApprovalInbox={openApprovalInbox}
        />
      ) : isManager ? (
        <ManagerDashboard
          teamCount={teamCount}
          department={user?.department}
          pendingApprovals={pendingApprovals}
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
    <div className="flex h-[128px] w-full items-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-left sm:w-[calc(50%-0.375rem)] xl:w-[164px]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--card)]/85 text-base shadow-sm ring-1 ring-black/5">
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
              className="mt-1.5 text-left text-xl font-black text-[var(--accent)] transition hover:opacity-80 focus:outline-none"
            >
              {value}
            </button>
          ) : (
            <p className="mt-1.5 text-xl font-black text-[var(--foreground)]">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function UserDashboard({
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
        <p className="text-lg font-bold text-[var(--foreground)]">{formatTime(todayAttendance.in)}</p>
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

function ManagerDashboard({
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

function AdminDashboard({
  pendingApprovals,
  lowStockCount,
  setMainMenu,
  openApprovalInbox,
}: {
  pendingApprovals: number;
  lowStockCount: number;
  setMainMenu?: (menu: string) => void;
  openApprovalInbox: () => void;
}) {
  return (
    <div className="mb-0 flex flex-wrap items-stretch gap-3">
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
  );
}

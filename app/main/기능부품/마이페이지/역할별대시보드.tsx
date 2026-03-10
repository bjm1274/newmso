'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  user: any;
  setMainMenu?: (menu: string) => void;
}

export default function RoleDashboard({ user, setMainMenu }: Props) {
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [todayAttendance, setTodayAttendance] = useState<{ in: string | null; out: string | null }>({ in: null, out: null });
  const [annualLeave, setAnnualLeave] = useState<{ remaining: number; total: number } | null>(null);
  const [teamCount, setTeamCount] = useState(0);

  const isAdmin = user?.role === 'admin' || user?.company === 'SY INC.' || user?.permissions?.mso;
  const isManager = ['팀장', '간호과장', '실장', '부장', '이사', '병원장'].includes(user?.position);

  useEffect(() => {
    if (!user?.id) return;

    // 결재 대기 수 조회
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

    // 오늘 출퇴근 기록
    const fetchToday = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('attendances')
        .select('check_in_time, check_out_time')
        .eq('staff_id', user.id)
        .eq('work_date', today)
        .maybeSingle();
      if (data) setTodayAttendance({ in: data.check_in_time, out: data.check_out_time });
    };

    // 연차 잔여
    const fetchLeave = async () => {
      const { data } = await supabase
        .from('staff_members')
        .select('annual_leave_total, annual_leave_used')
        .eq('id', user.id)
        .single();
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

    // 관리자/팀장 전용
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
  }, [user?.id, isAdmin, isManager]);

  const formatTime = (t: string | null) => {
    if (!t) return '-';
    return t.slice(11, 16);
  };

  return (
    <div className="mb-2">
      {!isAdmin && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">
            {isManager ? '팀장 현황' : '내 현황'}
          </span>
        </div>
      )}
      {isAdmin ? (
        <AdminDashboard
          pendingApprovals={pendingApprovals}
          lowStockCount={lowStockCount}
          setMainMenu={setMainMenu}
        />
      ) : isManager ? (
        <ManagerDashboard
          teamCount={teamCount}
          user={user}
          pendingApprovals={pendingApprovals}
          todayAttendance={todayAttendance}
          lowStockCount={lowStockCount}
          setMainMenu={setMainMenu}
          formatTime={formatTime}
        />
      ) : (
        <UserDashboard
          todayAttendance={todayAttendance}
          annualLeave={annualLeave}
          pendingApprovals={pendingApprovals}
          setMainMenu={setMainMenu}
          formatTime={formatTime}
        />
      )}
    </div>
  );
}

// ─── 하위 컴포넌트 추출 (렌더링 외부) ───

const AdminActionCard = ({
  title,
  value,
  actionLabel,
  icon,
  onClick,
  tone = 'default',
}: any) => {
  const toneClass =
    tone === 'warning'
      ? 'border-orange-200 bg-orange-50 hover:bg-orange-100'
      : tone === 'danger'
      ? 'border-red-200 bg-red-50 hover:bg-red-100'
      : 'border-[var(--toss-border)] bg-[var(--toss-card)] hover:bg-[var(--toss-blue-light)]/30';

  const valueClass =
    tone === 'warning'
      ? 'text-orange-600'
      : tone === 'danger'
        ? 'text-red-600'
        : 'text-[var(--foreground)]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full sm:w-[calc(50%-0.375rem)] xl:w-[220px] rounded-[16px] border px-4 py-3 text-left transition-all ${toneClass}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white/85 text-lg shadow-sm ring-1 ring-black/5">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">
            {title}
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className={`shrink-0 text-lg font-black ${valueClass}`}>{value}</p>
            <p className="truncate text-[11px] font-semibold text-[var(--toss-blue)]">{actionLabel}</p>
          </div>
        </div>
      </div>
    </button>
  );
};

const UserDashboard = ({ todayAttendance, annualLeave, pendingApprovals, setMainMenu, formatTime }: any) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-4">
      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-1">오늘 출근</p>
      <p className="text-lg font-bold text-[var(--foreground)]">{formatTime(todayAttendance.in)}</p>
      {todayAttendance.out && <p className="text-[11px] text-[var(--toss-gray-3)]">퇴근 {formatTime(todayAttendance.out)}</p>}
    </div>
    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-4">
      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-1">잔여 연차</p>
      <p className="text-lg font-bold text-[var(--toss-blue)]">{annualLeave?.remaining ?? '-'}일</p>
      {annualLeave && <p className="text-[11px] text-[var(--toss-gray-3)]">총 {annualLeave.total}일</p>}
    </div>
    <div
      className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-4 cursor-pointer hover:bg-[var(--toss-blue-light)]/30 transition-all"
      onClick={() => setMainMenu?.('전자결재')}
    >
      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-1">결재 대기</p>
      <p className={`text-lg font-bold ${pendingApprovals > 0 ? 'text-orange-500' : 'text-[var(--foreground)]'}`}>{pendingApprovals}건</p>
      <p className="text-[11px] text-[var(--toss-blue)]">바로가기 →</p>
    </div>
    <div
      className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-4 cursor-pointer hover:bg-[var(--toss-blue-light)]/30 transition-all"
      onClick={() => setMainMenu?.('채팅')}
    >
      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-1">채팅</p>
      <p className="text-lg font-bold text-[var(--foreground)]">💬</p>
      <p className="text-[11px] text-[var(--toss-blue)]">바로가기 →</p>
    </div>
  </div>
);

const ManagerDashboard = ({ teamCount, user, pendingApprovals, todayAttendance, lowStockCount, setMainMenu, formatTime }: any) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-4">
      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-1">우리 팀</p>
      <p className="text-lg font-bold text-[var(--foreground)]">{teamCount}명</p>
      <p className="text-[11px] text-[var(--toss-gray-3)]">{user?.department}</p>
    </div>
    <div
      className={`bg-[var(--toss-card)] border rounded-[16px] p-4 cursor-pointer transition-all ${pendingApprovals > 0 ? 'border-orange-200 bg-orange-50 hover:bg-orange-100' : 'border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)]'}`}
      onClick={() => setMainMenu?.('전자결재')}
    >
      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-1">결재 대기</p>
      <p className={`text-lg font-bold ${pendingApprovals > 0 ? 'text-orange-600' : 'text-[var(--foreground)]'}`}>{pendingApprovals}건</p>
      <p className="text-[11px] text-[var(--toss-blue)]">바로가기 →</p>
    </div>
    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-4">
      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-1">오늘 출근</p>
      <p className="text-lg font-bold text-[var(--foreground)]">{formatTime(todayAttendance.in)}</p>
    </div>
    <div
      className={`bg-[var(--toss-card)] border rounded-[16px] p-4 cursor-pointer transition-all ${lowStockCount > 0 ? 'border-red-200 bg-red-50 hover:bg-red-100' : 'border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)]'}`}
      onClick={() => setMainMenu?.('재고관리')}
    >
      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-1">재고 부족</p>
      <p className={`text-lg font-bold ${lowStockCount > 0 ? 'text-red-600' : 'text-[var(--foreground)]'}`}>{lowStockCount}건</p>
      <p className="text-[11px] text-[var(--toss-blue)]">바로가기 →</p>
    </div>
  </div>
);

const AdminDashboard = ({ pendingApprovals, lowStockCount, setMainMenu }: any) => (
  <div className="mb-4 flex flex-wrap gap-3">
    <AdminActionCard
      title="결재 대기"
      value={`${pendingApprovals}건`}
      actionLabel="결재함 이동"
      icon="✅"
      tone={pendingApprovals > 0 ? 'warning' : 'default'}
      onClick={() => setMainMenu?.('전자결재')}
    />
    <AdminActionCard
      title="재고 부족"
      value={`${lowStockCount}건`}
      actionLabel="재고관리 이동"
      icon="📦"
      tone={lowStockCount > 0 ? 'danger' : 'default'}
      onClick={() => setMainMenu?.('재고관리')}
    />
    <AdminActionCard
      title="경영 대시보드"
      value="📊"
      actionLabel="관리자 이동"
      icon="📈"
      onClick={() => setMainMenu?.('관리자')}
    />
    <AdminActionCard
      title="인사관리"
      value="👥"
      actionLabel="인사관리 이동"
      icon="🧑‍💼"
      onClick={() => setMainMenu?.('인사관리')}
    />
  </div>
);

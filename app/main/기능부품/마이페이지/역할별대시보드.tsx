'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime-bus';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { calculateApprovedAnnualLeaveUsage } from '@/lib/annual-leave-ledger';
import { useLocalDateKey } from '@/lib/use-local-date-key';
import type { Props, ApprovalRow, PendingApprovalItem, TodayAttendance, AnnualLeaveSummary, BirthdayStaffItem } from './역할별대시보드/types';
import { resolveStoredCurrentApproverId, resolveEffectiveApproverId } from './역할별대시보드/format-utils';
import { UserDashboard } from './역할별대시보드/UserDashboard';
import { ManagerDashboard } from './역할별대시보드/ManagerDashboard';
import { AdminDashboard } from './역할별대시보드/AdminDashboard';

const MANAGER_POSITIONS = ['과장', '간호과장', '실장', '수간호사', '파트장', '센터장', '부장', '본부장', '이사', '원장', '병원장', '대표'];

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
  const [expiringCount, setExpiringCount] = useState(0);
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendance>({ in: null, out: null, status: null });
  const [annualLeave, setAnnualLeave] = useState<AnnualLeaveSummary | null>(null);
  const [teamCount, setTeamCount] = useState(0);
  const [teamCheckedIn, setTeamCheckedIn] = useState(0);
  const [birthdayStaff, setBirthdayStaff] = useState<BirthdayStaffItem[]>([]);
  const currentDateKey = useLocalDateKey();

  const isAdmin = user?.role === 'admin' || user?.company === 'SY INC.' || (user?.permissions as Record<string, unknown>)?.mso;
  const isManager = MANAGER_POSITIONS.includes(user?.position as string);

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

        const query = supabase
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
      const { data } = await supabase
        .from('attendances')
        .select('check_in_time, check_out_time, status')
        .eq('staff_id', user.id)
        .eq('work_date', currentDateKey)
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

    const fetchBirthdayStaff = async () => {
      const { data, error } = await withMissingColumnsFallback(
        async (omittedColumns) => {
          if (omittedColumns.has('birth_date')) {
            return { data: [] as Record<string, unknown>[], error: null };
          }
          return supabase
            .from('staff_members')
            .select('name, birth_date')
            .eq('status', '재직')
            .not('birth_date', 'is', null);
        },
        ['birth_date'],
      );

      if (error || !data) return;

      const today = new Date();
      const todayMonth = today.getMonth() + 1;
      const todayDay = today.getDate();

      const upcoming: BirthdayStaffItem[] = [];
      for (const staff of data as Record<string, unknown>[]) {
        const birthDate = staff.birth_date as string | null;
        const name = staff.name as string | null;
        if (!birthDate || !name) continue;

        const parts = birthDate.split('-');
        if (parts.length < 3) continue;
        const birthMonth = parseInt(parts[1], 10);
        const birthDay = parseInt(parts[2], 10);
        if (isNaN(birthMonth) || isNaN(birthDay)) continue;

        const thisYearBirthday = new Date(today.getFullYear(), birthMonth - 1, birthDay);
        let diff = Math.floor((thisYearBirthday.getTime() - new Date(today.getFullYear(), todayMonth - 1, todayDay).getTime()) / (1000 * 60 * 60 * 24));

        if (diff < 0) {
          const nextYearBirthday = new Date(today.getFullYear() + 1, birthMonth - 1, birthDay);
          diff = Math.floor((nextYearBirthday.getTime() - new Date(today.getFullYear(), todayMonth - 1, todayDay).getTime()) / (1000 * 60 * 60 * 24));
        }

        if (diff >= 0 && diff <= 3) {
          upcoming.push({ name, daysUntil: diff });
        }
      }

      upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
      setBirthdayStaff(upcoming.slice(0, 3));
    };

    void fetchPending();
    fetchToday();
    fetchLeave();
    fetchBirthdayStaff();

    if (isAdmin || isManager) {
      const fetchLowStock = async () => {
        const { count } = await supabase
          .from('inventory')
          .select('*', { count: 'exact', head: true })
          .lt('quantity', 5);

        setLowStockCount(count || 0);
      };

      const fetchExpiringItems = async () => {
        try {
          const today = new Date();
          const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
          const todayStr = today.toISOString().slice(0, 10);
          const in30DaysStr = in30Days.toISOString().slice(0, 10);

          const { count, error } = await supabase
            .from('inventory')
            .select('*', { count: 'exact', head: true })
            .gte('expiration_date', todayStr)
            .lte('expiration_date', in30DaysStr);

          if (error) {
            console.warn('Failed to load expiring items (column may not exist):', error);
            setExpiringCount(0);
            return;
          }
          setExpiringCount(count || 0);
        } catch {
          setExpiringCount(0);
        }
      };

      const fetchTeam = async () => {
        if (!user?.department) return;

        const [{ count: totalCount }, { count: checkedInCount }] = await Promise.all([
          supabase
            .from('staff_members')
            .select('*', { count: 'exact', head: true })
            .eq('department', user.department)
            .eq('status', '재직'),
          supabase
            .from('attendances')
            .select('*', { count: 'exact', head: true })
            .eq('work_date', currentDateKey)
            .not('check_in_time', 'is', null),
        ]);

        setTeamCount(totalCount || 0);
        setTeamCheckedIn(checkedInCount || 0);
      };

      fetchLowStock();
      fetchExpiringItems();
      fetchTeam();
    }
  }, [currentDateKey, fetchPending, isAdmin, isManager, user?.department, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = subscribeRealtime(
      `mypage-pending-approvals-${user.id}`,
      [{ table: 'approvals', event: '*' }],
      () => { void fetchPending(); },
      { pollIntervalMs: 5000 },
    );

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
      unsubscribe();
    };
  }, [fetchPending, user?.id]);

  const formatTime = (value: string | null) => {
    if (!value) return '-';
    return value.slice(11, 16);
  };

  const openApprovalInbox = () => {
    if (typeof onOpenApproval === 'function') {
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
          expiringCount={expiringCount}
          birthdayStaff={birthdayStaff}
          setMainMenu={setMainMenu}
          openApprovalInbox={openApprovalInbox}
        />
      ) : isManager ? (
        <ManagerDashboard
          teamCount={teamCount}
          teamCheckedIn={teamCheckedIn}
          department={user?.department as string | undefined}
          pendingApprovals={pendingApprovals}
          pendingApprovalItems={pendingApprovalItems}
          todayAttendance={todayAttendance}
          lowStockCount={lowStockCount}
          expiringCount={expiringCount}
          birthdayStaff={birthdayStaff}
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
          birthdayStaff={birthdayStaff}
          setMainMenu={setMainMenu}
          openApprovalInbox={openApprovalInbox}
          formatTime={formatTime}
        />
      )}
    </div>
  );
}

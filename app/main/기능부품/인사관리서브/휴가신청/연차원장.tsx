'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import { calculateLeaveDays, isAnnualLeaveType, isApprovedLeaveStatus } from '@/lib/annual-leave-ledger';
import { isActiveStaff } from '@/lib/active-staff';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

type StaffLite = {
  id: string;
  name: string;
  company?: string;
  department?: string;
  annual_leave_total?: number;
  annual_leave_used?: number;
  status?: string;
};

type LeaveLedgerRow = {
  id: string;
  staff_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason?: string;
  approved_at?: string | null;
};

type LeaveRollbackAuditRow = {
  id: string;
  action: string;
  target_id?: string | null;
  user_name?: string | null;
  created_at: string;
  details?: {
    staff_id?: string;
    leave_type?: string | null;
    before_status?: string | null;
    after_status?: string | null;
    rollback_applied?: boolean;
    annual_leave_used_recalculated?: number | null;
  } | null;
};

type LeaveBalanceRow = {
  staff_id: string;
  expired_days: number | null;
  compensated_days: number | null;
};

type AnnualLeaveLedgerProps = {
  staffs: StaffLite[];
  selectedCo: string;
};

export default function AnnualLeaveLedger({ staffs, selectedCo }: AnnualLeaveLedgerProps) {
  const [leaveRows, setLeaveRows] = useState<LeaveLedgerRow[]>([]);
  const [rollbackAudits, setRollbackAudits] = useState<LeaveRollbackAuditRow[]>([]);
  const [balancesByStaff, setBalancesByStaff] = useState<Record<string, { expired: number; compensated: number }>>({});
  const [loading, setLoading] = useState(false);

  const filteredStaffs = useMemo(
    () =>
      staffs.filter((staff) => {
        if (selectedCo !== '전체' && staff.company !== selectedCo) return false;
        return isActiveStaff(staff);
      }),
    [selectedCo, staffs]
  );

  useEffect(() => {
    let active = true;

    const fetchLeaveLedger = async () => {
      setLoading(true);
      try {
        const staffIds = filteredStaffs.map((staff) => staff.id);
        if (staffIds.length === 0) {
          if (active) {
            setLeaveRows([]);
            setBalancesByStaff({});
          }
          return;
        }

        const currentYear = new Date().getFullYear();
        const [
          { data, error },
          { data: auditData, error: auditError },
          { data: balanceData, error: balanceError },
          { data: ledgerData, error: ledgerError }
        ] = await Promise.all([
          db
            .from('leave_requests')
            .select('id, staff_id, leave_type, start_date, end_date, status, reason, approved_at')
            .in('staff_id', staffIds)
            .order('approved_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false }),
          db
            .from('audit_logs')
            .select('id, action, target_id, user_name, created_at, details')
            .eq('target_type', 'leave_request')
            .eq('action', 'leave_request_status_updated')
            .order('created_at', { ascending: false })
            .limit(200),
          db
            .from('leave_balances')
            .select('staff_id, expired_days, compensated_days')
            .in('staff_id', staffIds)
            .eq('year', currentYear),
          db
            .from('leave_ledger')
            .select('staff_id, entry_type, days')
            .in('staff_id', staffIds),
        ]);

        if (error) throw error;
        if (auditError) throw auditError;
        if (balanceError) throw balanceError;

        const leaveIds = new Set((data || []).map((row: any) => String(row.id)));
        const nextRollbackAudits = ((auditData || []) as LeaveRollbackAuditRow[]).filter((row) => {
          const auditedStaffId = String(row.details?.staff_id || '');
          return leaveIds.has(String(row.target_id || '')) || staffIds.includes(auditedStaffId);
        });

        const nextBalances: Record<string, { total: number; used: number; expired: number; compensated: number; remaining: number }> = {};

        // leave_ledger 우선 집계
        if (ledgerData && ledgerData.length > 0) {
          (ledgerData as any[]).forEach((row) => {
            const sId = String(row.staff_id || '');
            if (!sId) return;
            const entryType = String(row.entry_type || '');
            const days = Number(row.days) || 0;

            if (!nextBalances[sId]) {
              nextBalances[sId] = { total: 0, used: 0, expired: 0, compensated: 0, remaining: 0 };
            }
            const current = nextBalances[sId];
            current.remaining += days;
            if (entryType === 'use' || entryType === 'manual_used_adjustment') {
              current.used += -days;
            } else if (entryType === 'expire' || entryType === 'manual_expire_adjustment') {
              current.expired += -days;
            } else if (entryType === 'compensate' || entryType === 'manual_compensate_adjustment') {
              current.compensated += -days;
            } else {
              current.total += days;
            }
          });
        } else {
          ((balanceData || []) as LeaveBalanceRow[]).forEach((row) => {
            nextBalances[String(row.staff_id)] = {
              total: 0,
              used: 0,
              expired: Number(row.expired_days) || 0,
              compensated: Number(row.compensated_days) || 0,
              remaining: 0,
            };
          });
        }

        if (active) {
          setLeaveRows((data || []) as LeaveLedgerRow[]);
          setRollbackAudits(nextRollbackAudits);
          setBalancesByStaff(nextBalances as any);
        }
      } catch (error) {
        console.error('연차 원장 조회 실패:', error);
        if (active) {
          setLeaveRows([]);
          setRollbackAudits([]);
          setBalancesByStaff({});
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchLeaveLedger();
    return () => {
      active = false;
    };
  }, [filteredStaffs]);

  const approvedAnnualLeaveRows = useMemo(
    () =>
      leaveRows.filter((row) => isApprovedLeaveStatus(row.status) && isAnnualLeaveType(row.leave_type)),
    [leaveRows]
  );

  const summaryRows = useMemo(
    () =>
      filteredStaffs
        .map((staff) => {
          const approvedRows = approvedAnnualLeaveRows.filter((row) => row.staff_id === staff.id);
          const approvedDays = approvedRows.reduce(
            (sum, row) => sum + calculateLeaveDays(row.start_date, row.end_date),
            0
          );
          const balance = balancesByStaff[staff.id] as any;
          const total = balance?.total ?? Number(staff.annual_leave_total || 0);
          const used = balance?.used ?? Number(staff.annual_leave_used ?? approvedDays);
          const expired = balance?.expired ?? 0;
          const compensated = balance?.compensated ?? 0;
          const remaining = balance?.remaining !== undefined
            ? Math.max(0, balance.remaining)
            : Math.max(0, total - used - expired - compensated);
          return {
            id: staff.id,
            staff,
            total,
            approvedDays,
            used,
            expired,
            compensated,
            remaining,
            approvedCount: approvedRows.length };
        })
        .sort((a, b) => a.staff.name.localeCompare(b.staff.name, 'ko')),
    [approvedAnnualLeaveRows, balancesByStaff, filteredStaffs]
  );

  type SummaryRow = (typeof summaryRows)[number];

  const summaryColumns = useMemo(
    (): Column<SummaryRow>[] => [
      {
        key: 'name',
        label: '직원',
        primary: true,
        render: (row) => <span className="font-semibold text-[var(--foreground)]">{row.staff.name}</span> },
      {
        key: 'company',
        label: '회사/부서',
        render: (row) =>
          `${row.staff.company || '회사 미지정'} / ${row.staff.department || '부서 미지정'}` },
      {
        key: 'total',
        label: '총 연차',
        align: 'right',
        render: (row) => <span className="font-semibold">{row.total.toFixed(1)}</span> },
      {
        key: 'used',
        label: '사용',
        align: 'right',
        render: (row) => <span className="font-semibold text-[var(--accent)]">{row.used.toFixed(1)}</span> },
      {
        key: 'expired',
        label: '소멸',
        align: 'right',
        render: (row) => <span className="font-semibold text-red-500">{row.expired.toFixed(1)}</span> },
      {
        key: 'compensated',
        label: '수당지급',
        align: 'right',
        render: (row) => <span className="font-semibold text-amber-600">{row.compensated.toFixed(1)}</span> },
      {
        key: 'remaining',
        label: '잔여',
        align: 'right',
        render: (row) => <span className="font-semibold text-green-600">{row.remaining.toFixed(1)}</span> },
      {
        key: 'approvedCount',
        label: '승인 건수',
        align: 'right',
        render: (row) => <span className="text-[var(--toss-gray-4)]">{row.approvedCount}</span> },
    ],
    []
  );

  const rollbackTimelineRows = useMemo(
    () =>
      rollbackAudits.map((row) => {
        const details = row.details || {};
        const staff = filteredStaffs.find((item) => item.id === details.staff_id);
        const beforeStatus = String(details.before_status || '-');
        const afterStatus = String(details.after_status || '-');
        return {
          id: row.id,
          staffName: staff?.name || details.staff_id || '-',
          leaveType: details.leave_type || '-',
          beforeStatus,
          afterStatus,
          rollbackApplied: Boolean(details.rollback_applied),
          recalculatedUsedDays:
            typeof details.annual_leave_used_recalculated === 'number'
              ? details.annual_leave_used_recalculated
              : null,
          actor: row.user_name || '시스템',
          createdAt: row.created_at };
      }),
    [filteredStaffs, rollbackAudits]
  );

  return (
    <div className="space-y-4" data-testid="annual-leave-ledger-view">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)]">연차 원장</h3>
            <p className="mt-1 text-xs font-medium text-[var(--toss-gray-4)]">
              승인된 연차 사용일수, 촉진 후 소멸·미사용연차수당 지급 일수까지 반영한 잔여 연차를 확인합니다.
              <span className="ml-1 text-[var(--toss-gray-3)]">(잔여 = 부여 − 사용 − 소멸 − 수당지급)</span>
            </p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-500/10 px-3 py-2 text-[11px] font-bold text-blue-600">
            직원 {summaryRows.length}명
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h4 className="text-sm font-bold text-[var(--foreground)]">직원별 연차 잔여 현황</h4>
        </div>
        <div className="p-2 md:p-0">
          <ResponsiveTable<SummaryRow>
            columns={summaryColumns}
            rows={summaryRows}
            keyField="id"
            emptyMessage={loading ? '불러오는 중입니다…' : '표시할 직원이 없습니다.'}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h4 className="text-sm font-bold text-[var(--foreground)]">승인된 최근 연차 사용 이력</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--hover-bg)]">
              <tr className="text-left text-[11px] font-bold text-[var(--toss-gray-4)]">
                <th className="px-4 py-3">직원</th>
                <th className="px-4 py-3">기간</th>
                <th className="px-4 py-3 text-right">일수</th>
                <th className="px-4 py-3">승인일</th>
                <th className="px-4 py-3">사유</th>
              </tr>
            </thead>
            <tbody>
              {approvedAnnualLeaveRows.slice(0, 20).map((row) => {
                const staff = filteredStaffs.find((item) => item.id === row.staff_id);
                return (
                  <tr key={row.id} className="border-t border-[var(--border)] align-top">
                    <td className="px-4 py-3 font-semibold text-[var(--foreground)]">{staff?.name || row.staff_id}</td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">
                      {row.start_date} ~ {row.end_date}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {calculateLeaveDays(row.start_date, row.end_date).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">
                      {row.approved_at ? row.approved_at.slice(0, 10) : '-'}
                    </td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{row.reason || '-'}</td>
                  </tr>
                );
              })}
              {!loading && approvedAnnualLeaveRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--toss-gray-4)]">
                    승인된 연차 사용 이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h4 className="text-sm font-bold text-[var(--foreground)]">승인 취소/반려 롤백 추적</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--hover-bg)]">
              <tr className="text-left text-[11px] font-bold text-[var(--toss-gray-4)]">
                <th className="px-4 py-3">직원</th>
                <th className="px-4 py-3">휴가 종류</th>
                <th className="px-4 py-3">상태 변경</th>
                <th className="px-4 py-3 text-right">재계산 사용일수</th>
                <th className="px-4 py-3">처리자</th>
                <th className="px-4 py-3">처리 시각</th>
              </tr>
            </thead>
            <tbody>
              {rollbackTimelineRows.slice(0, 30).map((row) => (
                <tr key={row.id} className="border-t border-[var(--border)] align-top">
                  <td className="px-4 py-3 font-semibold text-[var(--foreground)]">{row.staffName}</td>
                  <td className="px-4 py-3 text-[var(--toss-gray-4)]">{row.leaveType}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--hover-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
                        {row.beforeStatus}
                      </span>
                      <span className="text-[var(--toss-gray-3)]">→</span>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                          row.rollbackApplied
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                        }`}
                      >
                        {row.afterStatus}
                      </span>
                      {row.rollbackApplied && (
                        <span className="rounded-full bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-600">
                          롤백 적용
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[var(--foreground)]">
                    {row.recalculatedUsedDays !== null ? row.recalculatedUsedDays.toFixed(1) : '-'}
                  </td>
                  <td className="px-4 py-3 text-[var(--toss-gray-4)]">{row.actor}</td>
                  <td className="px-4 py-3 text-[var(--toss-gray-4)]">
                    {new Date(row.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                  </td>
                </tr>
              ))}
              {!loading && rollbackTimelineRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--toss-gray-4)]">
                    최근 승인/반려 롤백 추적 이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

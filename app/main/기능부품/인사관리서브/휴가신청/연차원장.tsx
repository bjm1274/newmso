'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateLeaveDays, isAnnualLeaveType, isApprovedLeaveStatus } from '@/lib/annual-leave-ledger';

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

type AnnualLeaveLedgerProps = {
  staffs: StaffLite[];
  selectedCo: string;
};

export default function AnnualLeaveLedger({ staffs, selectedCo }: AnnualLeaveLedgerProps) {
  const [leaveRows, setLeaveRows] = useState<LeaveLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const filteredStaffs = useMemo(
    () =>
      staffs.filter((staff) => {
        if (selectedCo !== '전체' && staff.company !== selectedCo) return false;
        return staff.status !== '퇴사';
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
          if (active) setLeaveRows([]);
          return;
        }

        const { data, error } = await supabase
          .from('leave_requests')
          .select('id, staff_id, leave_type, start_date, end_date, status, reason, approved_at')
          .in('staff_id', staffIds)
          .order('approved_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (active) {
          setLeaveRows((data || []) as LeaveLedgerRow[]);
        }
      } catch (error) {
        console.error('연차 원장 조회 실패:', error);
        if (active) setLeaveRows([]);
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
          const total = Number(staff.annual_leave_total || 0);
          const used = Number(staff.annual_leave_used ?? approvedDays);
          return {
            staff,
            total,
            approvedDays,
            used,
            remaining: Math.max(0, total - used),
            approvedCount: approvedRows.length,
          };
        })
        .sort((a, b) => a.staff.name.localeCompare(b.staff.name, 'ko')),
    [approvedAnnualLeaveRows, filteredStaffs]
  );

  return (
    <div className="space-y-4" data-testid="annual-leave-ledger-view">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)]">연차 원장</h3>
            <p className="mt-1 text-xs font-medium text-[var(--toss-gray-4)]">
              승인된 연차 사용일수와 직원별 연차 총량/잔여일수를 한눈에 확인합니다.
            </p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-600">
            직원 {summaryRows.length}명
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h4 className="text-sm font-bold text-[var(--foreground)]">직원별 연차 잔여 현황</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--hover-bg)]">
              <tr className="text-left text-[11px] font-bold text-[var(--toss-gray-4)]">
                <th className="px-4 py-3">직원</th>
                <th className="px-4 py-3">회사/부서</th>
                <th className="px-4 py-3 text-right">총 연차</th>
                <th className="px-4 py-3 text-right">사용</th>
                <th className="px-4 py-3 text-right">잔여</th>
                <th className="px-4 py-3 text-right">승인 건수</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.staff.id} className="border-t border-[var(--border)] align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--foreground)]">{row.staff.name}</p>
                  </td>
                  <td className="px-4 py-3 text-[var(--toss-gray-4)]">
                    {(row.staff.company || '회사 미지정')} / {(row.staff.department || '부서 미지정')}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{row.total.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right text-[var(--accent)] font-semibold">{row.used.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600">{row.remaining.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right text-[var(--toss-gray-4)]">{row.approvedCount}</td>
                </tr>
              ))}
              {!loading && summaryRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--toss-gray-4)]">
                    표시할 직원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import { calculateLeaveDays, isAnnualLeaveType, isApprovedLeaveStatus } from '@/lib/annual-leave-ledger';
import { isActiveStaff } from '@/lib/active-staff';
import { formatKoreanDateKey } from '@/lib/seoul-time';
// 잔여 집계는 PC 워크센터·모바일 연차관리자·/api/annual-leave/summary 와 **같은 함수**를 쓴다.
import {
  aggregateLedgerEntries,
  getLeaveCycle,
  resolveHireDateKey,
  type LedgerRowLike,
} from '@/lib/leave-cycle';
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
          { data: ledgerData, error: ledgerError },
          { data: hireData }
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
            .select('id, staff_id, entry_type, days, occurred_on, period_key, source_id, note')
            .in('staff_id', staffIds),
          // 주기 판정에 입사일이 필요하다. staffs prop(StaffLite)에는 입사일이
          // 실려 오지 않으므로 원본에서 직접 읽는다(PC 워크센터·연차소멸알림과 동일).
          db
            .from('staff_members')
            .select('id, hire_date, join_date, joined_at')
            .in('id', staffIds),
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

        // leave_ledger 우선 집계.
        //
        // 원장(leave_ledger)은 **생애 전체** 기록이고 잔여는 **현재 주기**(입사기념일
        // 단위) 값이어야 한다. 예전에는 `select('staff_id, entry_type, days')` 로
        // occurred_on·period_key 를 아예 받지 않아 주기 판정이 물리적으로 불가능했고,
        // 전 이력을 그대로 더했다 — 직전 주기의 auto_annual(+15)과 expire(-15)가 함께
        // 남아 재직자의 잔여가 최대 31일까지 부풀어 보였다. 주기 판정·집계는 다시
        // 짜지 않고 워크센터·모바일·서버 요약과 같은 함수를 그대로 쓴다.
        if (ledgerData && ledgerData.length > 0) {
          const todayKey = formatKoreanDateKey(new Date());
          const hireKeyByStaff = new Map<string, string>();
          for (const raw of (hireData as any[]) || []) {
            if (!raw || typeof raw !== 'object') continue;
            const sId = String(raw.id ?? '').trim();
            const hireKey = resolveHireDateKey(raw);
            if (sId && hireKey) hireKeyByStaff.set(sId, hireKey);
          }

          const ledgerRowsByStaff = new Map<string, LedgerRowLike[]>();
          for (const raw of ledgerData as any[]) {
            if (!raw || typeof raw !== 'object') continue;
            const sId = String(raw.staff_id || '').trim();
            if (!sId) continue;
            const entry: LedgerRowLike = {
              id: raw.id,
              entry_type: raw.entry_type,
              days: raw.days,
              occurred_on: typeof raw.occurred_on === 'string' ? raw.occurred_on : null,
              period_key: raw.period_key,
              source_id: typeof raw.source_id === 'string' ? raw.source_id : null,
              note: typeof raw.note === 'string' ? raw.note : null };
            const list = ledgerRowsByStaff.get(sId);
            if (list) list.push(entry);
            else ledgerRowsByStaff.set(sId, [entry]);
          }

          for (const [sId, rows] of ledgerRowsByStaff) {
            const hireKey = hireKeyByStaff.get(sId);
            const cycle = hireKey ? getLeaveCycle(hireKey, todayKey) : null;
            // 입사일이 없어 주기를 못 잡는 직원은 원장 합산을 건너뛴다.
            // 아래 summaryRows 의 staff_members 미러(annual_leave_total/used) 폴백으로
            // 내려간다 — 전 이력 합산으로 되돌아가면 이 결함이 그대로 살아난다.
            if (!cycle) continue;
            const agg = aggregateLedgerEntries(rows, cycle);
            nextBalances[sId] = {
              total: agg.total,
              used: agg.used,
              expired: agg.expired,
              compensated: agg.compensated,
              remaining: agg.remaining };
          }
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
          // 잔고이므로 음수를 그대로 둔다 — 초과 사용을 0 으로 가리지 않는다.
          const remaining = balance?.remaining !== undefined
            ? balance.remaining
            : total - used - expired - compensated;
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
        // 초과 사용(음수)은 초록으로 내면 "남았다" 로 읽힌다. 빨강으로 가른다.
        render: (row) => (
          <span className={`font-semibold ${row.remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
            {row.remaining.toFixed(1)}
          </span>
        ) },
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

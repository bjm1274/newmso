'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SYSTEM_MASTER_ACCOUNT_ID, isNamedSystemMasterAccount } from '@/lib/system-master';
import { calculateAnnualLeaveExpiryDate } from '@/lib/annual-leave-promotion';

type ManualGrantUpdate = {
  staffId: string;
  total: number;
  used: number;
  expired: number;
  compensated: number;
};

type LeaveBalanceRow = {
  staff_id: string;
  expired_days: number | null;
  compensated_days: number | null;
};

type CompanyPolicyRow = {
  name: string | null;
  leave_policy: string | null;
  fiscal_year_start_month: number | null;
};

type CompanyPolicy = {
  basis: 'fiscal' | 'hire';
  fiscalStartMonth: number;
};

type CycleInfo = {
  start: Date;
  end: Date;
  basis: '입사일' | '회계연도';
};

type EditState = {
  total: number;
  used: number;
  expired: number;
  compensated: number;
};

function fmtYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 회계연도 기준 현재 사이클: 가장 최근 fiscalStartMonth 1일 ~ 다음 fiscalStartMonth 전날
function fiscalYearCycle(refDate: Date, fiscalStartMonth: number): CycleInfo {
  const month = fiscalStartMonth - 1;
  let start = new Date(refDate.getFullYear(), month, 1);
  if (refDate.getTime() < start.getTime()) {
    start = new Date(refDate.getFullYear() - 1, month, 1);
  }
  const end = new Date(start.getFullYear() + 1, month, 0); // 다음 시작월의 0일 = 직전월 말일
  return { start, end, basis: '회계연도' };
}

// 입사일 기준 현재 사이클: 다음 만료일 - 1년 ~ 다음 만료일 전날
function hireDateCycle(hireDate: string, refDate: Date): CycleInfo | null {
  const hire = new Date(`${hireDate}T00:00:00`);
  if (Number.isNaN(hire.getTime())) return null;
  const nextExpiry = calculateAnnualLeaveExpiryDate(hire, refDate);
  const start = new Date(nextExpiry);
  start.setFullYear(start.getFullYear() - 1);
  const end = new Date(nextExpiry);
  end.setDate(end.getDate() - 1);
  return { start, end, basis: '입사일' };
}

function computeCycleInfo(staff: any, policy: CompanyPolicy | undefined, refDate: Date): CycleInfo | null {
  if (policy?.basis === 'fiscal') {
    return fiscalYearCycle(refDate, policy.fiscalStartMonth);
  }
  const hire = staff.hire_date || staff.join_date || staff.joined_at;
  if (!hire) return null;
  return hireDateCycle(String(hire), refDate);
}

async function saveManualGrant(updates: ManualGrantUpdate[]) {
  const response = await fetch('/api/admin/annual-leave/manual-grant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ updates }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || '연차 수동 부여 저장에 실패했습니다.');
  }

  return payload as { message?: string };
}

function clampNumber(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export default function AnnualLeaveManualGrant({
  user,
  staffs = [],
  onRefresh,
}: {
  user?: any;
  staffs?: any[];
  onRefresh?: () => void;
}) {
  const [companyFilter, setCompanyFilter] = useState<string>('전체');
  const [edits, setEdits] = useState<Record<string, Partial<EditState>>>({});
  const [balances, setBalances] = useState<Record<string, { expired: number; compensated: number }>>({});
  const [companyPolicies, setCompanyPolicies] = useState<Record<string, CompanyPolicy>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const today = useMemo(() => new Date(), []);

  const canManage = isNamedSystemMasterAccount(user);
  const list = Array.isArray(staffs) ? staffs : [];
  const companies = useMemo(
    () => Array.from(new Set(list.map((staff: any) => staff.company).filter(Boolean))).sort(),
    [list],
  );
  const filtered = useMemo(
    () => (companyFilter === '전체' ? list : list.filter((staff: any) => staff.company === companyFilter)),
    [companyFilter, list],
  );

  // 회사 정책 로드 — leave_policy / fiscal_year_start_month
  useEffect(() => {
    let active = true;
    const companyNames = Array.from(new Set(list.map((s: any) => s.company).filter(Boolean)));
    if (companyNames.length === 0) {
      setCompanyPolicies({});
      return;
    }

    void supabase
      .from('companies')
      .select('name, leave_policy, fiscal_year_start_month')
      .in('name', companyNames)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('[연차수동부여] companies 정책 조회 실패:', error);
          setCompanyPolicies({});
          return;
        }
        const next: Record<string, CompanyPolicy> = {};
        ((data || []) as CompanyPolicyRow[]).forEach((row) => {
          if (!row.name) return;
          next[row.name] = {
            basis: row.leave_policy === '회계연도' ? 'fiscal' : 'hire',
            fiscalStartMonth: row.fiscal_year_start_month ?? 1,
          };
        });
        setCompanyPolicies(next);
      });

    return () => {
      active = false;
    };
  }, [list]);

  // leave_balances 로드 — 현재 연도 기준 expired/compensated 조회
  useEffect(() => {
    let active = true;
    const staffIds = list.map((s: any) => String(s.id)).filter(Boolean);
    if (staffIds.length === 0) {
      setBalances({});
      return;
    }

    const year = new Date().getFullYear();
    void supabase
      .from('leave_balances')
      .select('staff_id, expired_days, compensated_days')
      .eq('year', year)
      .in('staff_id', staffIds)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('[연차수동부여] leave_balances 조회 실패:', error);
          setBalances({});
          return;
        }
        const next: Record<string, { expired: number; compensated: number }> = {};
        ((data || []) as LeaveBalanceRow[]).forEach((row) => {
          next[String(row.staff_id)] = {
            expired: Number(row.expired_days) || 0,
            compensated: Number(row.compensated_days) || 0,
          };
        });
        setBalances(next);
      });

    return () => {
      active = false;
    };
  }, [list]);

  const getTotal = (staff: any) =>
    edits[staff.id]?.total ?? Number(staff.annual_leave_total) ?? 0;
  const getUsed = (staff: any) =>
    edits[staff.id]?.used ?? Number(staff.annual_leave_used) ?? 0;
  const getExpired = (staff: any) =>
    edits[staff.id]?.expired ?? balances[staff.id]?.expired ?? 0;
  const getCompensated = (staff: any) =>
    edits[staff.id]?.compensated ?? balances[staff.id]?.compensated ?? 0;
  const getRemaining = (staff: any) =>
    Math.max(0, getTotal(staff) - getUsed(staff) - getExpired(staff) - getCompensated(staff));

  const setField = (id: string, key: keyof EditState, value: number) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: clampNumber(value) } }));

  const validateRow = (staff: any): string | null => {
    const total = getTotal(staff);
    const used = getUsed(staff);
    const expired = getExpired(staff);
    const compensated = getCompensated(staff);
    if (used + expired + compensated > total + 0.001) {
      return `${staff.name}: 사용(${used}) + 소멸(${expired}) + 수당지급(${compensated})이 총 연차(${total})를 초과합니다.`;
    }
    return null;
  };

  const handleSaveOne = async (staff: any) => {
    if (!canManage) return;

    const err = validateRow(staff);
    if (err) {
      setMessage(err);
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const payload = await saveManualGrant([
        {
          staffId: String(staff.id),
          total: getTotal(staff),
          used: getUsed(staff),
          expired: getExpired(staff),
          compensated: getCompensated(staff),
        },
      ]);

      // 로컬 balances 동기화 (재조회 없이 즉시 반영)
      setBalances((prev) => ({
        ...prev,
        [staff.id]: { expired: getExpired(staff), compensated: getCompensated(staff) },
      }));
      setMessage(payload.message || `${staff.name} 연차 저장 완료`);
      onRefresh?.();
    } catch (error: unknown) {
      setMessage(`저장 실패: ${(error as Error)?.message || String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    if (!canManage) return;

    for (const staff of filtered) {
      const err = validateRow(staff);
      if (err) {
        setMessage(`${err} 수정 후 다시 시도해주세요.`);
        return;
      }
    }

    setSaving(true);
    setMessage('');

    try {
      const payload = await saveManualGrant(
        filtered.map((staff: any) => ({
          staffId: String(staff.id),
          total: getTotal(staff),
          used: getUsed(staff),
          expired: getExpired(staff),
          compensated: getCompensated(staff),
        })),
      );

      setBalances((prev) => {
        const next = { ...prev };
        filtered.forEach((staff: any) => {
          next[staff.id] = { expired: getExpired(staff), compensated: getCompensated(staff) };
        });
        return next;
      });
      setMessage(payload.message || `총 ${filtered.length}명 연차 반영 완료`);
      onRefresh?.();
    } catch (error: unknown) {
      setMessage(`저장 실패: ${(error as Error)?.message || String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="max-w-5xl rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h3 className="mb-2 text-xl font-semibold text-[var(--foreground)]">연차 개수 수동 부여</h3>
        <p className="text-sm text-[var(--toss-gray-3)]">
          <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[11px]">{SYSTEM_MASTER_ACCOUNT_ID}</code>
          {' '}계정만 연차 수동 부여를 저장할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <h3 className="mb-2 text-base font-semibold text-[var(--foreground)]">연차 개수 수동 부여</h3>
      <p className="mb-3 text-[11px] font-bold text-[var(--toss-gray-3)]">
        신규입사자 포함 모든 직원의 연차 부여일·사용일·소멸·수당지급 일수를 직접 설정할 수 있습니다.
        부여 기간은 입사일 기준 1년 단위(예: 2023-05-01 입사 → 현재 사이클 2026-05-01 ~ 2027-04-30)로 표시되며,
        잔여 = 부여 − 사용 − 소멸 − 수당지급 으로 자동 계산됩니다.
      </p>

      <div className="mb-3 flex items-center gap-4">
        <label className="text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">회사</label>
        <select
          value={companyFilter}
          onChange={(event) => setCompanyFilter(event.target.value)}
          className="rounded-[var(--radius-lg)] border border-[var(--border)] px-4 py-2 text-sm font-bold"
        >
          <option value="전체">전체</option>
          {companies.map((company) => (
            <option key={company} value={company}>
              {company}
            </option>
          ))}
        </select>
      </div>

      {message && (
        <div
          className={`mb-3 rounded-[var(--radius-lg)] p-3 text-sm font-bold ${
            message.includes('실패') || message.includes('초과') ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
          }`}
        >
          {message}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">이름</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">회사/부서</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">입사일</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">부여 기간</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">부여</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">사용</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">소멸</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">수당지급</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)] text-right">잔여</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">동작</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((staff: any) => {
              const remaining = getRemaining(staff);
              const over = getUsed(staff) + getExpired(staff) + getCompensated(staff) > getTotal(staff) + 0.001;
              const policy = staff.company ? companyPolicies[staff.company] : undefined;
              const cycle = computeCycleInfo(staff, policy, today);
              return (
                <tr key={staff.id} className="border-b border-[var(--border)]">
                  <td className="py-3 font-bold text-[var(--foreground)]">{staff.name}</td>
                  <td className="py-3 text-xs text-[var(--toss-gray-3)]">
                    {staff.company} / {staff.department || '-'}
                  </td>
                  <td className="py-3 text-xs text-[var(--toss-gray-4)]">
                    {staff.hire_date || staff.join_date || staff.joined_at || '-'}
                  </td>
                  <td className="py-3 text-xs">
                    {cycle ? (
                      <div className="flex flex-col leading-tight">
                        <span className="font-bold text-[var(--foreground)]">
                          {fmtYmd(cycle.start)} ~ {fmtYmd(cycle.end)}
                        </span>
                        <span className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">{cycle.basis} 기준</span>
                      </div>
                    ) : (
                      <span className="text-[var(--toss-gray-4)]">-</span>
                    )}
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={getTotal(staff)}
                      onChange={(event) => setField(staff.id, 'total', Number(event.target.value))}
                      className="w-20 rounded-[var(--radius-md)] border border-[var(--border)] p-2 text-sm font-bold"
                      aria-label={`${staff.name} 부여 연차`}
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={getUsed(staff)}
                      onChange={(event) => setField(staff.id, 'used', Number(event.target.value))}
                      className="w-20 rounded-[var(--radius-md)] border border-[var(--border)] p-2 text-sm font-bold"
                      aria-label={`${staff.name} 사용 연차`}
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={getExpired(staff)}
                      onChange={(event) => setField(staff.id, 'expired', Number(event.target.value))}
                      className="w-20 rounded-[var(--radius-md)] border border-[var(--border)] p-2 text-sm font-bold"
                      aria-label={`${staff.name} 소멸 연차`}
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={getCompensated(staff)}
                      onChange={(event) => setField(staff.id, 'compensated', Number(event.target.value))}
                      className="w-20 rounded-[var(--radius-md)] border border-[var(--border)] p-2 text-sm font-bold"
                      aria-label={`${staff.name} 수당지급 연차`}
                    />
                  </td>
                  <td className={`py-3 text-right text-sm font-bold ${over ? 'text-red-600' : 'text-green-600'}`}>
                    {remaining.toFixed(1)}일
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => void handleSaveOne(staff)}
                      disabled={saving || over}
                      className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      저장
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="py-5 text-center font-bold text-[var(--toss-gray-3)]">표시할 직원이 없습니다.</p>
      )}

      {filtered.length > 0 && (
        <button
          type="button"
          onClick={() => void handleSaveAll()}
          disabled={saving}
          className="mt-4 w-full rounded-[var(--radius-md)] bg-teal-600 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? '저장 중...' : `위 ${filtered.length}명 일괄 저장`}
        </button>
      )}
    </div>
  );
}

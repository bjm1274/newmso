'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import { SYSTEM_MASTER_ACCOUNT_ID, isNamedSystemMasterAccount } from '@/lib/system-master';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { submitLeaveRequest } from '@/app/main/기능부품/인사관리워크센터/LeaveWorkcenter/data';
import ManualGrantGrid, {
  type CompanyPolicy,
  type EditState } from './연차수동부여Grid';

type CompanyPolicyRow = {
  name: string | null;
  leave_policy: string | null;
  fiscal_year_start_month: number | null;
};

/** 0.5 단위, 0.5~100 */
function normalizeGrantDays(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 2) / 2;
  if (rounded < 0.5 || rounded > 100) return null;
  return rounded;
}

function clampHalf(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 2) / 2;
}

export default function AnnualLeaveManualGrant({
  user,
  staffs = [],
  onRefresh }: {
  user?: any;
  staffs?: any[];
  onRefresh?: () => void;
}) {
  const [companyFilter, setCompanyFilter] = useState<string>('전체');
  /** staffId → 이번에 부여할 일수(0.5~100) */
  const [grantAmounts, setGrantAmounts] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, Partial<EditState>>>({});
  const [balances, setBalances] = useState<
    Record<string, { expired: number; compensated: number; total?: number; used?: number; remaining?: number }>
  >({});
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

  useEffect(() => {
    let active = true;
    const companyNames = Array.from(new Set(list.map((s: any) => s.company).filter(Boolean)));
    if (companyNames.length === 0) {
      setCompanyPolicies({});
      return;
    }

    void db
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
            fiscalStartMonth: row.fiscal_year_start_month ?? 1 };
        });
        setCompanyPolicies(next);
      });

    return () => {
      active = false;
    };
  }, [list]);

  useEffect(() => {
    let active = true;
    const staffIds = list.map((s: any) => String(s.id)).filter(Boolean);
    if (staffIds.length === 0) {
      setBalances({});
      return;
    }

    void db
      .from('leave_balances')
      .select('staff_id, total_days, used_days, remaining_days, expired_days, compensated_days')
      .eq('year', new Date().getFullYear())
      .in('staff_id', staffIds)
      .then(({ data }) => {
        if (!active) return;
        const next: Record<string, { expired: number; compensated: number; total?: number; used?: number; remaining?: number }> = {};
        for (const row of data || []) {
          const sid = String((row as any).staff_id || '');
          if (!sid) continue;
          next[sid] = {
            total: Number((row as any).total_days) || 0,
            used: Number((row as any).used_days) || 0,
            remaining: Number((row as any).remaining_days) || 0,
            expired: Number((row as any).expired_days) || 0,
            compensated: Number((row as any).compensated_days) || 0,
          };
        }
        setBalances(next);
      });

    return () => {
      active = false;
    };
  }, [list]);

  const getTotal = (staff: any) =>
    edits[staff.id]?.total ?? balances[staff.id]?.total ?? Number(staff.annual_leave_total) ?? 0;
  const getUsed = (staff: any) =>
    edits[staff.id]?.used ?? balances[staff.id]?.used ?? Number(staff.annual_leave_used) ?? 0;
  const getExpired = (staff: any) =>
    edits[staff.id]?.expired ?? balances[staff.id]?.expired ?? 0;
  const getCompensated = (staff: any) =>
    edits[staff.id]?.compensated ?? balances[staff.id]?.compensated ?? 0;
  const getRemaining = (staff: any) =>
    balances[staff.id]?.remaining !== undefined
      ? Number(balances[staff.id].remaining)
      : getTotal(staff) - getUsed(staff) - getExpired(staff) - getCompensated(staff);

  const setField = (id: string, key: keyof EditState, value: number) => {
    if (key === 'total') {
      // 부여 칸 = 이번에 추가 부여할 일수 (0.5~100)
      const normalized = normalizeGrantDays(value);
      setGrantAmounts((prev) => ({ ...prev, [id]: normalized ?? 0 }));
      return;
    }
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: clampHalf(value) } }));
  };

  const getGrantAmount = (staff: any) => {
    const raw = grantAmounts[String(staff.id)];
    if (raw != null && Number.isFinite(raw)) return raw;
    return 0;
  };

  /** 그리드 '부여' 칸에는 추가 부여 예정 일수를 표시 */
  const getDisplayTotal = (staff: any) => getGrantAmount(staff);

  const handleSaveOne = async (staff: any) => {
    if (!canManage) return;
    const days = normalizeGrantDays(getGrantAmount(staff));
    if (days == null) {
      setMessage(`${staff.name}: 부여 일수는 0.5일 단위로 0.5~100일만 가능합니다.`);
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const today = getKoreanTodayString();
      const reason =
        reasons[String(staff.id)]?.trim() ||
        `관리자 연차 수동 부여 +${days}일 (승인 후 자동 반영)`;
      await submitLeaveRequest({
        staffId: String(staff.id),
        leaveType: '연차(부여)',
        startDate: today,
        endDate: today,
        days,
        reason,
      });
      setMessage(
        `${staff.name}: +${days}일 연차 수동 부여 결재 상신 완료 → 관리자 승인 시 자동 반영됩니다.`,
      );
      setGrantAmounts((prev) => ({ ...prev, [String(staff.id)]: 0 }));
      onRefresh?.();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('erp-leave-updated'));
      }
    } catch (error: unknown) {
      setMessage(`상신 실패: ${(error as Error)?.message || String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    if (!canManage) return;
    const targets = filtered.filter((s: any) => {
      const d = normalizeGrantDays(getGrantAmount(s));
      return d != null && d >= 0.5;
    });
    if (targets.length === 0) {
      setMessage('부여할 직원이 없습니다. 부여 칸에 0.5~100일(0.5 단위)을 입력하세요.');
      return;
    }

    setSaving(true);
    setMessage('');
    let ok = 0;
    const fails: string[] = [];
    const today = getKoreanTodayString();
    for (const staff of targets) {
      const days = normalizeGrantDays(getGrantAmount(staff));
      if (days == null) continue;
      try {
        await submitLeaveRequest({
          staffId: String(staff.id),
          leaveType: '연차(부여)',
          startDate: today,
          endDate: today,
          days,
          reason:
            reasons[String(staff.id)]?.trim() ||
            `관리자 연차 수동 부여 +${days}일 (승인 후 자동 반영)`,
        });
        ok += 1;
        setGrantAmounts((prev) => ({ ...prev, [String(staff.id)]: 0 }));
      } catch (e) {
        fails.push(`${staff.name}: ${(e as Error)?.message || e}`);
      }
    }
    setMessage(
      fails.length
        ? `상신 완료 ${ok}명 / 실패 ${fails.length}명 — ${fails[0]}`
        : `총 ${ok}명 연차 수동 부여 결재 상신 완료 (관리자 승인 시 자동 반영)`,
    );
    onRefresh?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('erp-leave-updated'));
    }
    setSaving(false);
  };

  if (!canManage) {
    return (
      <div className="max-w-5xl rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h3 className="mb-2 text-xl font-semibold text-[var(--foreground)]">연차 수동 부여</h3>
        <p className="text-sm text-[var(--toss-gray-3)]">
          <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[11px]">{SYSTEM_MASTER_ACCOUNT_ID}</code>
          {' '}계정만 연차 수동 부여를 상신할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <h3 className="mb-2 text-base font-semibold text-[var(--foreground)]">연차 수동 부여 (결재 후 자동 반영)</h3>
      <p className="mb-3 text-[11px] font-bold text-[var(--toss-gray-3)] leading-relaxed">
        • 부여 칸에 <strong>추가 부여 일수</strong>를 입력합니다 (0.5일 단위, 0.5~100일).
        <br />
        • 저장 시 전자결재가 <strong>관리자</strong>에게 자동 상신되고, 관리자 승인 시 leave 원장에 자동 부여됩니다.
        <br />
        • 현재 잔여/사용은 참고용이며, 입사일 기준 법정 발생분과 별도로 수동 부여분이 합산됩니다.
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
            message.includes('실패') || message.includes('가능') ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
          }`}
        >
          {message}
        </div>
      )}

      <ManualGrantGrid
        rows={filtered}
        companyPolicies={companyPolicies}
        today={today}
        saving={saving}
        getTotal={getDisplayTotal}
        getUsed={getUsed}
        getExpired={getExpired}
        getCompensated={getCompensated}
        getRemaining={getRemaining}
        setField={setField}
        onSaveOne={handleSaveOne}
      />

      {filtered.length > 0 && (
        <button
          type="button"
          onClick={() => void handleSaveAll()}
          disabled={saving}
          className="mt-4 w-full rounded-[var(--radius-md)] bg-teal-600 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? '상신 중...' : `부여 입력된 직원 일괄 결재 상신`}
        </button>
      )}
    </div>
  );
}

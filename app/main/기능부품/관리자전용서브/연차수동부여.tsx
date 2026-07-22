'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import { SYSTEM_MASTER_ACCOUNT_ID, isNamedSystemMasterAccount } from '@/lib/system-master';
import ManualGrantGrid, {
  type CompanyPolicy,
  type EditState } from './연차수동부여Grid';

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

async function saveManualGrant(updates: ManualGrantUpdate[]) {
  const response = await fetch('/api/admin/annual-leave/manual-grant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }) });

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
  onRefresh }: {
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

  // leave_balances 로드 — 현재 연도 기준 expired/compensated 조회
  useEffect(() => {
    let active = true;
    const staffIds = list.map((s: any) => String(s.id)).filter(Boolean);
    if (staffIds.length === 0) {
      setBalances({});
      return;
    }

    const year = new Date().getFullYear();
    void db
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
            compensated: Number(row.compensated_days) || 0 };
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
    getTotal(staff) - getUsed(staff) - getExpired(staff) - getCompensated(staff);

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
          compensated: getCompensated(staff) },
      ]);

      // 로컬 balances 동기화 (재조회 없이 즉시 반영)
      setBalances((prev) => ({
        ...prev,
        [staff.id]: { expired: getExpired(staff), compensated: getCompensated(staff) } }));
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
          compensated: getCompensated(staff) })),
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

      <ManualGrantGrid
        rows={filtered}
        companyPolicies={companyPolicies}
        today={today}
        saving={saving}
        getTotal={getTotal}
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
          {saving ? '저장 중...' : `위 ${filtered.length}명 일괄 저장`}
        </button>
      )}
    </div>
  );
}

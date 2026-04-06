'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
import SalaryDetail from '../../인사관리서브/급여명세/급여상세';

interface StaffInfo {
  company?: string;
  name?: string;
  employee_no?: string;
  id?: string;
  join_date?: string;
  joined_at?: string;
  department?: string;
  position?: string;
  base_salary?: number;
  meal_allowance?: number;
  night_duty_allowance?: number;
  vehicle_allowance?: number;
  childcare_allowance?: number;
  research_allowance?: number;
  other_taxfree?: number;
}

interface SalaryRecord {
  company?: string;
  base_salary?: number;
  meal_allowance?: number;
  night_duty_allowance?: number;
  vehicle_allowance?: number;
  childcare_allowance?: number;
  research_allowance?: number;
  other_taxfree?: number;
  extra_allowance?: number;
  overtime_pay?: number;
  bonus?: number;
  year_month?: string;
  record_type?: string | null;
  status?: string | null;
  deduction_detail?: Record<string, number>;
  total_taxable?: number;
  total_taxfree?: number;
  total_deduction?: number;
  national_pension?: number;
  health_insurance?: number;
  long_term_care?: number;
  employment_insurance?: number;
  income_tax?: number;
  local_tax?: number;
  net_pay?: number;
  advance_pay?: number;
}

type SalaryHistoryItem = { year_month: string; net_pay: number };

function formatYearMonthLabel(yearMonth: string) {
  const [year, month] = String(yearMonth || '').split('-');
  if (!year || !month) return yearMonth;
  return `${year}년 ${Number(month)}월`;
}

function extractYearMonthFromText(value: unknown) {
  const text = String(value || '');
  const dashMatch = text.match(/(20\d{2})-(\d{1,2})/);
  if (dashMatch) {
    return `${dashMatch[1]}-${String(Number(dashMatch[2])).padStart(2, '0')}`;
  }
  const koreanMatch = text.match(/(20\d{2})년\s*(\d{1,2})월/);
  if (koreanMatch) {
    return `${koreanMatch[1]}-${String(Number(koreanMatch[2])).padStart(2, '0')}`;
  }
  return null;
}

function SalaryTrendChart({ history }: { history: SalaryHistoryItem[] }) {
  if (history.length < 2) return null;
  const maxPay = Math.max(...history.map((h) => h.net_pay));
  const minPay = Math.min(...history.map((h) => h.net_pay));
  const range = maxPay - minPay || maxPay;

  return (
    <div className="mx-4 mt-3 mb-0 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <p className="mb-2 text-[11px] font-bold tracking-wider text-[var(--toss-gray-3)]">최근 명세서 실지급 추이</p>
      <div className="flex h-14 items-end gap-1">
        {history.map((item) => {
          const heightPct = range > 0 ? ((item.net_pay - minPay) / range) * 70 + 30 : 60;
          const label = item.year_month.slice(5, 7) + '월';
          return (
            <div key={item.year_month} className="flex flex-1 flex-col items-center gap-0.5">
              <span className="text-[9px] font-semibold text-[var(--accent)]">
                {(item.net_pay / 10000).toFixed(0)}만
              </span>
              <div
                className="w-full rounded-t-sm bg-[var(--accent)]/70 transition-all"
                style={{ height: `${heightPct}%` }}
                title={`${item.year_month}: ${item.net_pay.toLocaleString()}원`}
              />
              <span className="text-[9px] text-[var(--toss-gray-3)]">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SalarySlipContainer({ user }: Record<string, unknown>) {
  const _user = normalizeStaffLike((user ?? {}) as Record<string, unknown>);
  const [resolvedUser, setResolvedUser] = useState<Record<string, unknown>>(_user);
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [issuedRecords, setIssuedRecords] = useState<SalaryRecord[]>([]);
  const [selectedYearMonth, setSelectedYearMonth] = useState('');
  const effectiveUserId = getStaffLikeId(resolvedUser);

  useEffect(() => {
    let cancelled = false;

    const syncUserIdentity = async () => {
      const directId = getStaffLikeId(_user);
      if (directId) {
        setResolvedUser(_user);
        return;
      }
      if (!_user?.name && !_user?.employee_no && !_user?.auth_user_id) {
        setResolvedUser(_user);
        return;
      }
      const recoveredUser = await resolveStaffLike(_user);
      if (!cancelled) {
        setResolvedUser(recoveredUser);
      }
    };

    void syncUserIdentity();
    return () => {
      cancelled = true;
    };
  }, [_user?.id, _user?.name, _user?.employee_no, _user?.auth_user_id]);

  const handlePasswordVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) {
      setVerifyError('직원 계정으로 로그인한 뒤 이용해 주세요.');
      return;
    }

    const pwd = passwordInput;
    if (!pwd) {
      setVerifyError('비밀번호를 입력해 주세요.');
      return;
    }

    setVerifying(true);
    setVerifyError('');
    try {
      const response = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: pwd,
          userId: effectiveUserId,
          name: (resolvedUser.name || _user.name) as string,
          employeeNo: (resolvedUser.employee_no || _user.employee_no) as string,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setVerifyError(payload?.error || '본인 확인 중 오류가 발생했습니다.');
        setPasswordInput('');
        setVerifying(false);
        return;
      }

      if (!payload?.verified) {
        setVerifyError('비밀번호가 일치하지 않습니다.');
        setPasswordInput('');
        setVerifying(false);
        return;
      }

      setUnlocked(true);
      setPasswordInput('');
    } catch {
      setVerifyError('본인 확인 중 오류가 발생했습니다.');
    }
    setVerifying(false);
  };

  useEffect(() => {
    if (!unlocked || !effectiveUserId) return;
    let cancelled = false;

    const fetchIssuedSalaryRecords = async () => {
      const [recordsResult, notificationsResult] = await Promise.all([
        supabase
          .from('payroll_records')
          .select('*')
          .eq('staff_id', effectiveUserId)
          .neq('record_type', 'interim')
          .order('year_month', { ascending: false }),
        supabase
          .from('notifications')
          .select('title, body')
          .eq('user_id', effectiveUserId)
          .eq('type', '급여명세')
          .order('created_at', { ascending: false }),
      ]);

      if (cancelled) return;

      if (recordsResult.error) {
        console.error('Error fetching issued salary records:', recordsResult.error);
        setIssuedRecords([]);
        setSelectedYearMonth('');
        return;
      }

      const allRecords = ((recordsResult.data || []) as SalaryRecord[]).filter((record) => {
        const recordType = String(record.record_type || 'regular');
        return recordType !== 'interim';
      });
      const issuedCandidates = allRecords.filter((record) => {
        const status = String(record.status || '').trim();
        return status === '확정' || status === '';
      });

      const sentMonths = new Set(
        ((notificationsResult.data || []) as { title?: string; body?: string }[])
          .map((row) => extractYearMonthFromText(`${row.title || ''} ${row.body || ''}`))
          .filter((value): value is string => Boolean(value)),
      );

      const visibleRecords =
        sentMonths.size > 0
          ? issuedCandidates.filter((record) => sentMonths.has(String(record.year_month || '')))
          : issuedCandidates;

      const sortedRecords = [...visibleRecords].sort((a, b) =>
        String(b.year_month || '').localeCompare(String(a.year_month || '')),
      );

      setIssuedRecords(sortedRecords);
      setSelectedYearMonth((previous) => {
        if (sortedRecords.some((record) => String(record.year_month || '') === previous)) {
          return previous;
        }
        return String(sortedRecords[0]?.year_month || '');
      });
    };

    void fetchIssuedSalaryRecords();
    return () => {
      cancelled = true;
    };
  }, [effectiveUserId, unlocked]);

  const salaryData = useMemo(
    () =>
      issuedRecords.find((record) => String(record.year_month || '') === selectedYearMonth) || null,
    [issuedRecords, selectedYearMonth],
  );
  const salaryHistory = useMemo(
    () =>
      [...issuedRecords]
        .slice(0, 6)
        .reverse()
        .map((record) => ({
          year_month: String(record.year_month || ''),
          net_pay: Number(record.net_pay || 0),
        }))
        .filter((record) => record.net_pay > 0),
    [issuedRecords],
  );
  const availableMonths = useMemo(
    () => issuedRecords.map((record) => String(record.year_month || '')).filter(Boolean),
    [issuedRecords],
  );

  const handlePrint = () => {
    window.print();
  };

  if (!unlocked) {
    return (
      <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] overflow-hidden flex flex-col items-center justify-center min-h-[320px] p-5 sm:p-5">
        <h3 className="text-xl font-bold text-[var(--foreground)] mb-2">급여 명세서 조회</h3>
        <p className="text-[13px] text-[var(--toss-gray-4)] mb-5">본인 확인을 위해 비밀번호를 입력해 주세요.</p>
        <form onSubmit={handlePasswordVerify} className="w-full max-w-sm space-y-5">
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => {
              setPasswordInput(e.target.value);
              setVerifyError('');
            }}
            placeholder="비밀번호"
            data-testid="salary-password-input"
            className="w-full px-4 py-3.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
            autoComplete="current-password"
            disabled={verifying}
          />
          {verifyError && <p className="text-[12px] text-[var(--toss-danger)] font-medium">{verifyError}</p>}
          <button
            type="submit"
            disabled={verifying}
            data-testid="salary-password-submit"
            className="w-full py-3.5 bg-[var(--accent)] text-white font-semibold rounded-[var(--radius-lg)] hover:opacity-95 disabled:opacity-50 transition-all"
          >
            {verifying ? '확인 중...' : '확인'}
          </button>
        </form>
      </div>
    );
  }

  if (!salaryData) {
    return (
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-5 sm:p-5 flex flex-col items-center justify-center min-h-[300px] text-center">
        <div className="w-16 h-16 bg-[var(--tab-bg)] rounded-full flex items-center justify-center text-2xl mb-4">📅</div>
        <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">발송된 급여명세서가 없습니다</h3>
        <p className="text-sm text-[var(--toss-gray-3)] leading-relaxed">
          확정 후 발송된 급여명세서가 있으면 이곳에서 월별로 선택해 확인할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: portrait; margin: 8mm; }
          body * {
            visibility: hidden;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
          #print-section {
            visibility: visible !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          #print-section * { visibility: visible !important; }
          #print-section > div {
            width: 100% !important;
            max-width: none !important;
          }
        }
      `}</style>

      <div data-testid="mypage-salary-tab" className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] overflow-hidden flex flex-col h-full">
        <div className="px-5 py-4 sm:px-4 sm:py-5 bg-[var(--muted)] border-b border-[var(--border)] flex flex-wrap justify-between items-end gap-4 shrink-0">
          <div className="space-y-2">
            <p className="text-[11px] font-bold tracking-wider text-[var(--toss-gray-3)]">월별 급여명세서</p>
            <div className="flex flex-wrap items-center gap-3">
              <select
                data-testid="mypage-salary-month-select"
                value={selectedYearMonth}
                onChange={(event) => setSelectedYearMonth(event.target.value)}
                className="min-w-[180px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                {availableMonths.map((yearMonth) => (
                  <option key={yearMonth} value={yearMonth}>
                    {formatYearMonthLabel(yearMonth)}
                  </option>
                ))}
              </select>
              <p className="text-sm font-medium text-[var(--toss-gray-3)]">
                확정 후 발송된 명세서만 표시됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-3 sm:px-5 sm:py-4 bg-[var(--foreground)] text-white text-sm font-semibold rounded-[var(--radius-lg)] hover:opacity-95 transition-all flex items-center gap-2 shadow-sm"
          >
            🖨️ A4 출력
          </button>
        </div>

        {salaryHistory.length >= 2 && <SalaryTrendChart history={salaryHistory} />}

        <div className="flex-1 overflow-auto bg-[var(--muted)] p-4 sm:p-5 lg:p-5 flex justify-center custom-scrollbar">
          <div id="print-section" className="w-full max-w-[880px] print:max-w-none print:w-full mx-auto shadow-sm print:shadow-none bg-[var(--card)] print:bg-transparent overflow-visible">
            <SalaryDetail
              staff={(resolvedUser || _user) as StaffInfo | undefined}
              record={salaryData as SalaryRecord | undefined}
            />
          </div>
        </div>
      </div>
    </>
  );
}

'use client';
﻿import { useState, useEffect } from 'react';
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

export default function SalarySlipContainer({ user }: Record<string, unknown>) {
  const _user = normalizeStaffLike((user ?? {}) as Record<string, unknown>);
  const [resolvedUser, setResolvedUser] = useState<Record<string, unknown>>(_user);
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [salaryData, setSalaryData] = useState<Record<string, unknown> | null>(null);
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

  const changeMonth = (offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  const selectedYearMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    if (!effectiveUserId) return;

    const fetchSalaryRecord = async () => {
      const { data, error } = await supabase
        .from('payroll_records')
        .select('*')
        .eq('staff_id', effectiveUserId)
        .eq('year_month', selectedYearMonth)
        .maybeSingle();

      if (error) {
        console.error('Error fetching salary record:', error);
        setSalaryData(null);
      } else {
        setSalaryData(data);
      }
    };

    fetchSalaryRecord();
  }, [effectiveUserId, selectedYearMonth]);

  const handlePrint = () => { window.print(); };

  /* 암호 미확인 시 비밀번호 입력 화면 */
  if (!unlocked) {
    return (
      <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] overflow-hidden flex flex-col items-center justify-center min-h-[320px] p-5 sm:p-5">
        <h3 className="text-xl font-bold text-[var(--foreground)] mb-2">급여 명세서 조회</h3>
        <p className="text-[13px] text-[var(--toss-gray-4)] mb-5">본인 확인을 위해 비밀번호를 입력해 주세요.</p>
        <form onSubmit={handlePasswordVerify} className="w-full max-w-sm space-y-5">
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => { setPasswordInput(e.target.value); setVerifyError(''); }}
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
        <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">급여 내역이 없습니다</h3>
        <p className="text-sm text-[var(--toss-gray-3)] leading-relaxed">
          {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월의 급여 정산이 아직 완료되지 않았습니다.<br />
          정산이 완료되면 이곳에서 명세서를 확인하실 수 있습니다.
        </p>
      </div>
    );
  }


  return (
    <>
      <style>{`
        @media print {
          @page { size: landscape; margin: 5mm; }
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

      <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] overflow-hidden flex flex-col h-full">
        <div className="px-5 py-4 sm:px-4 sm:py-5 bg-[var(--muted)] border-b border-[var(--border)] flex flex-wrap justify-between items-center gap-4 shrink-0">
          <div className="flex items-center gap-4 sm:gap-4">
            <div className="flex gap-2">
              <button type="button" onClick={() => changeMonth(-1)} className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--toss-gray-2)] flex items-center justify-center shadow-sm">◀</button>
              <button type="button" onClick={() => changeMonth(1)} className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--toss-gray-2)] flex items-center justify-center shadow-sm">▶</button>
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-[var(--foreground)]">{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월</h3>
          </div>
          <button type="button" onClick={handlePrint} className="px-4 py-3 sm:px-5 sm:py-4 bg-[var(--foreground)] text-white text-sm font-semibold rounded-[var(--radius-lg)] hover:opacity-95 transition-all flex items-center gap-2 shadow-sm">
            🖨️ A4 한 장에 맞춰 인쇄
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-[var(--muted)] p-4 sm:p-5 lg:p-5 flex justify-center custom-scrollbar">
          <div id="print-section" className="w-full max-w-7xl print:max-w-none print:w-full mx-auto shadow-sm print:shadow-none bg-[var(--card)] print:bg-transparent overflow-visible">
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

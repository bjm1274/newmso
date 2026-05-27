'use client';

/**
 * 모바일 인사관리 공용 데이터 훅.
 *
 * - useStaffList: staff_members 목록 (active만, 회사 필터)
 * - useMyLeaveBalance: 본인 연차 잔여 + 사용 내역
 * - useMyAttendanceMonth: 본인 이번 달 근태 (일자 → 상태)
 * - useMyAbnormalThisMonth: 본인 이번 달 근태 이상(지각/조퇴/미체크)
 * - useMyContractDocs: 본인 보관 문서 (document_repository)
 * - useFamilyEvents / useHealthCheckups / useLicenses / useMedicalDevices
 * - usePayrollRecords: 본인 발송된 급여명세서 + 알림 기반 필터
 *
 * JM2: 식별자 primitive로만 deps 잡고 AbortController로 race 보호.
 * JM3: try/catch + silent fallback. UI는 빈배열로 노출.
 * JM4: any 금지. Supabase row → Record<string, unknown>으로 받고 좁힘.
 * JM5: staff_id 필터를 client에도 명시 (RLS에 더해).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ErpUser, StaffMember } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import { resolveIssuedPayrollRecords } from '@/lib/payroll-records';

// ─────────────────────────────────────────────────────────────
// 직원 목록
// ─────────────────────────────────────────────────────────────

export type StaffListOptions = {
  company?: string;
  limit?: number;
};

export function useStaffList(options: StaffListOptions = {}) {
  const { company, limit = 200 } = options;
  const [staffs, setStaffs] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('staff_members')
          .select(
            'id, name, company, department, position, role, status, employee_no, hire_date, resign_date, phone, email, extension, photo_url',
          )
          .order('name')
          .limit(limit);
        if (company && company !== '전체') {
          query = query.eq('company', company);
        }
        const { data, error } = await query;
        if (error) throw error;
        if (cancelled) return;
        const list = ((data ?? []) as StaffMember[]).filter(isActiveStaff);
        setStaffs(list);
      } catch (err) {
        if (!cancelled) {
          console.error('[mobile-hr] staff list load failed', err);
          setStaffs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [company, limit]);

  return { staffs, loading };
}

// ─────────────────────────────────────────────────────────────
// 본인 연차 잔여
// ─────────────────────────────────────────────────────────────

export type LeaveHistoryRow = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: '대기' | '승인' | '반려';
  reason?: string | null;
  created_at?: string | null;
};

export type MyLeaveBalance = {
  total: number;
  used: number;
  remaining: number;
  history: LeaveHistoryRow[];
};

export function useMyLeaveBalance(staffId: string | null) {
  const [data, setData] = useState<MyLeaveBalance>({
    total: 0,
    used: 0,
    remaining: 0,
    history: [],
  });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!staffId) {
      setData({ total: 0, used: 0, remaining: 0, history: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [staffRes, leaveRes] = await Promise.all([
        supabase
          .from('staff_members')
          .select('annual_leave_total, annual_leave_used')
          .eq('id', staffId)
          .maybeSingle(),
        supabase
          .from('leave_requests')
          .select('id, leave_type, start_date, end_date, status, reason, created_at')
          .eq('staff_id', staffId)
          .order('start_date', { ascending: false })
          .limit(30),
      ]);
      const staffRow = (staffRes.data ?? {}) as Record<string, unknown>;
      const total = Number(staffRow.annual_leave_total ?? 0);
      const used = Number(staffRow.annual_leave_used ?? 0);
      const remaining = Math.max(0, total - used);
      const history = ((leaveRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id ?? ''),
        leave_type: String(row.leave_type ?? '연차'),
        start_date: String(row.start_date ?? ''),
        end_date: String(row.end_date ?? row.start_date ?? ''),
        status: ((): '대기' | '승인' | '반려' => {
          const v = String(row.status ?? '대기');
          return v === '승인' || v === '반려' ? v : '대기';
        })(),
        reason: typeof row.reason === 'string' ? row.reason : null,
        created_at: typeof row.created_at === 'string' ? row.created_at : null,
      }));
      setData({ total, used, remaining, history });
    } catch (err) {
      console.error('[mobile-hr] my leave load failed', err);
      setData({ total: 0, used: 0, remaining: 0, history: [] });
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, reload };
}

// ─────────────────────────────────────────────────────────────
// 본인 이번 달 근태
// ─────────────────────────────────────────────────────────────

export type AttendanceDailyRow = {
  date: string; // YYYY-MM-DD
  check_in: string | null;
  check_out: string | null;
  status: string | null;
};

export function useMyAttendanceMonth(staffId: string | null, monthKey: string) {
  // monthKey: 'YYYY-MM'
  const [rows, setRows] = useState<AttendanceDailyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!staffId) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [yearStr, monthStr] = monthKey.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        if (!year || !month) {
          setRows([]);
          return;
        }
        const first = new Date(year, month - 1, 1).toLocaleDateString('en-CA');
        const last = new Date(year, month, 0).toLocaleDateString('en-CA');
        const { data, error } = await supabase
          .from('attendance')
          .select('date, check_in, check_out, status')
          .eq('staff_id', staffId)
          .gte('date', first)
          .lte('date', last);
        if (error) throw error;
        if (cancelled) return;
        const list = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          date: String(r.date ?? ''),
          check_in: typeof r.check_in === 'string' ? r.check_in : null,
          check_out: typeof r.check_out === 'string' ? r.check_out : null,
          status: typeof r.status === 'string' ? r.status : null,
        }));
        setRows(list);
      } catch (err) {
        if (!cancelled) {
          console.error('[mobile-hr] attend month load failed', err);
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [staffId, monthKey]);

  return { rows, loading };
}

// ─────────────────────────────────────────────────────────────
// 본인 근태이상 (이번 달 지각·조퇴·미체크)
// ─────────────────────────────────────────────────────────────

export type AbnormalRow = {
  date: string;
  kind: 'late' | 'early_leave' | 'missing';
  reason: string | null;
  check_in: string | null;
  check_out: string | null;
};

export function deriveAbnormalRows(rows: AttendanceDailyRow[]): AbnormalRow[] {
  const out: AbnormalRow[] = [];
  for (const r of rows) {
    const status = String(r.status ?? '').trim();
    if (status === 'late') {
      out.push({
        date: r.date,
        kind: 'late',
        reason: null,
        check_in: r.check_in,
        check_out: r.check_out,
      });
    } else if (status === 'early_leave') {
      out.push({
        date: r.date,
        kind: 'early_leave',
        reason: null,
        check_in: r.check_in,
        check_out: r.check_out,
      });
    } else if (status === 'missing') {
      out.push({
        date: r.date,
        kind: 'missing',
        reason: null,
        check_in: r.check_in,
        check_out: r.check_out,
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ─────────────────────────────────────────────────────────────
// 본인 문서 (document_repository) — 모바일에선 본인 보관 문서만
// ─────────────────────────────────────────────────────────────

export type MyDocRow = {
  id: string;
  title: string;
  doc_type: string | null;
  file_url: string | null;
  file_size: number | null;
  created_at: string | null;
};

export function useMyContractDocs(staffId: string | null) {
  const [docs, setDocs] = useState<MyDocRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!staffId) {
        setDocs([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('document_repository')
          .select('id, title, doc_type, file_url, file_size, created_at')
          .eq('staff_id', staffId)
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        if (cancelled) return;
        setDocs(
          ((data ?? []) as Record<string, unknown>[]).map((r) => ({
            id: String(r.id ?? ''),
            title: String(r.title ?? '제목 없음'),
            doc_type: typeof r.doc_type === 'string' ? r.doc_type : null,
            file_url: typeof r.file_url === 'string' ? r.file_url : null,
            file_size:
              typeof r.file_size === 'number' && Number.isFinite(r.file_size)
                ? r.file_size
                : null,
            created_at: typeof r.created_at === 'string' ? r.created_at : null,
          })),
        );
      } catch (err) {
        if (!cancelled) {
          console.error('[mobile-hr] my docs load failed', err);
          setDocs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  return { docs, loading };
}

// ─────────────────────────────────────────────────────────────
// 복지 영역 (회사 단위 — RLS로 본인 회사만 보임)
// ─────────────────────────────────────────────────────────────

export type FamilyEventRow = {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  event_type: string | null;
  event_date: string | null;
  amount: number | null;
  relation: string | null;
  status: string | null;
};

export type HealthCheckupRow = {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  checkup_date: string | null;
  status: string | null;
  vendor: string | null;
};

export type LicenseRow = {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  license_name: string | null;
  expiry_date: string | null;
  status: string | null;
};

export type MedicalDeviceRow = {
  id: string;
  device_name: string | null;
  vendor: string | null;
  next_check_date: string | null;
  cycle: string | null;
  status: string | null;
};

type WelfareBundle = {
  family: FamilyEventRow[];
  checkup: HealthCheckupRow[];
  license: LicenseRow[];
  device: MedicalDeviceRow[];
};

export function useWelfareBundle(company: string | undefined) {
  const [data, setData] = useState<WelfareBundle>({
    family: [],
    checkup: [],
    license: [],
    device: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const useCompany = Boolean(company) && company !== '전체';

        let familyQ = supabase
          .from('family_events')
          .select(
            'id, staff_id, staff_name, event_type, event_date, amount, relation, status, company',
          )
          .order('event_date', { ascending: false })
          .limit(30);
        if (useCompany) familyQ = familyQ.eq('company', company!);

        let checkupQ = supabase
          .from('health_checkups')
          .select('id, staff_id, staff_name, checkup_date, status, vendor, company')
          .order('checkup_date', { ascending: false })
          .limit(30);
        if (useCompany) checkupQ = checkupQ.eq('company', company!);

        let licenseQ = supabase
          .from('licenses')
          .select('id, staff_id, staff_name, license_name, expiry_date, status, company')
          .order('expiry_date', { ascending: true })
          .limit(30);
        if (useCompany) licenseQ = licenseQ.eq('company', company!);

        let deviceQ = supabase
          .from('medical_devices')
          .select('id, device_name, vendor, next_check_date, cycle, status, company')
          .order('next_check_date', { ascending: true })
          .limit(30);
        if (useCompany) deviceQ = deviceQ.eq('company', company!);

        const [familyRes, checkupRes, licenseRes, deviceRes] = await Promise.all([
          familyQ,
          checkupQ,
          licenseQ,
          deviceQ,
        ]);
        if (cancelled) return;

        setData({
          family: ((familyRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
            id: String(r.id ?? ''),
            staff_id: typeof r.staff_id === 'string' ? r.staff_id : null,
            staff_name: typeof r.staff_name === 'string' ? r.staff_name : null,
            event_type: typeof r.event_type === 'string' ? r.event_type : null,
            event_date: typeof r.event_date === 'string' ? r.event_date : null,
            amount: typeof r.amount === 'number' ? r.amount : null,
            relation: typeof r.relation === 'string' ? r.relation : null,
            status: typeof r.status === 'string' ? r.status : null,
          })),
          checkup: ((checkupRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
            id: String(r.id ?? ''),
            staff_id: typeof r.staff_id === 'string' ? r.staff_id : null,
            staff_name: typeof r.staff_name === 'string' ? r.staff_name : null,
            checkup_date: typeof r.checkup_date === 'string' ? r.checkup_date : null,
            status: typeof r.status === 'string' ? r.status : null,
            vendor: typeof r.vendor === 'string' ? r.vendor : null,
          })),
          license: ((licenseRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
            id: String(r.id ?? ''),
            staff_id: typeof r.staff_id === 'string' ? r.staff_id : null,
            staff_name: typeof r.staff_name === 'string' ? r.staff_name : null,
            license_name: typeof r.license_name === 'string' ? r.license_name : null,
            expiry_date: typeof r.expiry_date === 'string' ? r.expiry_date : null,
            status: typeof r.status === 'string' ? r.status : null,
          })),
          device: ((deviceRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
            id: String(r.id ?? ''),
            device_name: typeof r.device_name === 'string' ? r.device_name : null,
            vendor: typeof r.vendor === 'string' ? r.vendor : null,
            next_check_date: typeof r.next_check_date === 'string' ? r.next_check_date : null,
            cycle: typeof r.cycle === 'string' ? r.cycle : null,
            status: typeof r.status === 'string' ? r.status : null,
          })),
        });
      } catch (err) {
        if (!cancelled) {
          console.error('[mobile-hr] welfare bundle load failed', err);
          setData({ family: [], checkup: [], license: [], device: [] });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [company]);

  return { data, loading };
}

// ─────────────────────────────────────────────────────────────
// 본인 급여명세서 (발송분만)
// ─────────────────────────────────────────────────────────────

export type PayrollSlipRow = {
  year_month: string;
  base_salary: number;
  meal_allowance: number;
  night_duty_allowance: number;
  vehicle_allowance: number;
  childcare_allowance: number;
  research_allowance: number;
  other_taxfree: number;
  extra_allowance: number;
  overtime_pay: number;
  bonus: number;
  total_taxable: number;
  total_taxfree: number;
  total_deduction: number;
  national_pension: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
  income_tax: number;
  local_tax: number;
  net_pay: number;
  status: string | null;
  record_type: string | null;
};

function numField(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function usePayrollSlips(staffId: string | null) {
  const [slips, setSlips] = useState<PayrollSlipRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!staffId) {
        setSlips([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [recordRes, notifRes] = await Promise.all([
          supabase
            .from('payroll_records')
            .select('*')
            .eq('staff_id', staffId)
            .order('year_month', { ascending: false }),
          supabase
            .from('notifications')
            .select('title, body')
            .eq('staff_id', staffId)
            .ilike('title', '%급여명세%'),
        ]);
        if (cancelled) return;
        const records = (recordRes.data ?? []) as Record<string, unknown>[];
        const issued = resolveIssuedPayrollRecords(records, (notifRes.data ?? []) as Record<string, unknown>[]);
        setSlips(
          issued.map((r) => ({
            year_month: String(r.year_month ?? ''),
            base_salary: numField(r, 'base_salary'),
            meal_allowance: numField(r, 'meal_allowance'),
            night_duty_allowance: numField(r, 'night_duty_allowance'),
            vehicle_allowance: numField(r, 'vehicle_allowance'),
            childcare_allowance: numField(r, 'childcare_allowance'),
            research_allowance: numField(r, 'research_allowance'),
            other_taxfree: numField(r, 'other_taxfree'),
            extra_allowance: numField(r, 'extra_allowance'),
            overtime_pay: numField(r, 'overtime_pay'),
            bonus: numField(r, 'bonus'),
            total_taxable: numField(r, 'total_taxable'),
            total_taxfree: numField(r, 'total_taxfree'),
            total_deduction: numField(r, 'total_deduction'),
            national_pension: numField(r, 'national_pension'),
            health_insurance: numField(r, 'health_insurance'),
            long_term_care: numField(r, 'long_term_care'),
            employment_insurance: numField(r, 'employment_insurance'),
            income_tax: numField(r, 'income_tax'),
            local_tax: numField(r, 'local_tax'),
            net_pay: numField(r, 'net_pay'),
            status: typeof r.status === 'string' ? r.status : null,
            record_type: typeof r.record_type === 'string' ? r.record_type : null,
          })),
        );
      } catch (err) {
        if (!cancelled) {
          console.error('[mobile-hr] payroll slips load failed', err);
          setSlips([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  return { slips, loading };
}

// ─────────────────────────────────────────────────────────────
// 공통 헬퍼 (tone 매핑·D-day 계산)
// ─────────────────────────────────────────────────────────────

export type ToneKind = '' | 'accent' | 'success' | 'warning' | 'danger';

export function daysUntil(dateStr: string | null | undefined, now = Date.now()): number | null {
  if (!dateStr) return null;
  const parsed = Date.parse(dateStr);
  if (!Number.isFinite(parsed)) return null;
  return Math.ceil((parsed - now) / (24 * 3600 * 1000));
}

export function expiryTone(daysLeft: number | null): ToneKind {
  if (daysLeft === null) return '';
  if (daysLeft < 0) return 'danger';
  if (daysLeft <= 30) return 'danger';
  if (daysLeft <= 90) return 'warning';
  return 'success';
}

export function pickAvatarTone(name: string): 'blue' | 'violet' | 'pink' | 'green' | 'orange' | 'cyan' {
  const tones: ('blue' | 'violet' | 'pink' | 'green' | 'orange' | 'cyan')[] = [
    'blue',
    'violet',
    'pink',
    'green',
    'orange',
    'cyan',
  ];
  if (!name) return 'blue';
  const fallback = tones[0] ?? 'blue';
  return tones[name.charCodeAt(0) % tones.length] ?? fallback;
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return String(dateStr).slice(0, 10);
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}

export function formatMoney(n: number): string {
  return Math.floor(n).toLocaleString('ko-KR');
}

export function useDerivedMonthKey(date: Date): string {
  return useMemo(() => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, [date]);
}

// ─────────────────────────────────────────────────────────────
// 근태이상 액션 — 사유 요청 / 정상 처리 (JM3, JM5)
// PC AbnormalWorkcenter.tsx + resolveStaffAbnormalRecords와 동일한 규칙으로
// 동작하되, 모바일 단일 row 단위 mutation으로 단순화한다.
// ─────────────────────────────────────────────────────────────

export type TeamAbnormalKind = 'late' | 'early_leave' | 'missing';

export type AbnormalActionType = 'clarify' | 'resolve';

export type AbnormalActionResult = {
  ok: boolean;
  reason?: 'no_permission' | 'duplicate' | 'not_found' | 'unknown';
  updatedDates?: string[];
};

const KIND_LABEL_KO: Record<TeamAbnormalKind, string> = {
  late: '지각',
  early_leave: '조퇴',
  missing: '미체크',
};

/**
 * 다종 abnormal 알림 본문 합성.
 *
 * 입력 예: { whenLabel: '최근 30일', counts: { late: 3, early_leave: 1, missing: 2 } }
 * 출력 예: "최근 30일 근태 사유 확인 요청 — 지각 3회, 조퇴 1회, 미체크 2건. 사유를 입력해 주세요."
 *
 * - 0회인 종류는 본문에 포함하지 않는다.
 * - 모두 0이면 빈 사유 요청 본문 — 호출 측에서 가드해야 함.
 * - JM3: 단순 합성 함수로 격리해 단위 테스트 가능하게.
 * - JM4: AbnormalKindCounts 타입 명시, any 없음.
 */
export type AbnormalKindCounts = Partial<Record<TeamAbnormalKind, number>>;

export function buildAbnormalRequestBody(input: {
  whenLabel?: string;
  counts: AbnormalKindCounts;
}): string {
  const { whenLabel, counts } = input;
  const order: TeamAbnormalKind[] = ['late', 'early_leave', 'missing'];
  const parts: string[] = [];
  for (const kind of order) {
    const n = counts[kind] ?? 0;
    if (n <= 0) continue;
    const unit = kind === 'missing' ? '건' : '회';
    parts.push(`${KIND_LABEL_KO[kind]} ${n}${unit}`);
  }
  const whenPart = whenLabel ? `${whenLabel} ` : '';
  if (parts.length === 0) {
    return `${whenPart}근태 사유를 입력해 주세요. (관리자 요청)`;
  }
  return `${whenPart}근태 사유 확인 요청 — ${parts.join(', ')}. 사유를 입력해 주세요.`;
}

/**
 * 인사관리 mutation 권한.
 * - permissions.mso === true
 * - permissions.menu_인사관리 === true
 * - role 이 '관리자' 또는 '매니저'
 * 셋 중 하나라도 만족하면 허용. RLS 가 1차 방어, 이건 UI 가드.
 */
export function canMutateTeamAbnormal(user: ErpUser | null | undefined): boolean {
  if (!user) return false;
  const perms = (user.permissions ?? {}) as Record<string, unknown>;
  if (perms.mso === true) return true;
  if (perms.menu_인사관리 === true) return true;
  const role = typeof user.role === 'string' ? user.role : '';
  if (role === '관리자' || role === '매니저') return true;
  return false;
}

/** 같은 staff 에게 같은 종류 알림을 24h 안에 두 번 보내지 않도록 client guard */
const clarifySentAt = new Map<string, number>();
const CLARIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function clarifyKey(staffId: string, kind: TeamAbnormalKind | 'multi' | string): string {
  return `${staffId}::${kind}`;
}

/**
 * 일자별 abnormal 사유 요청 본문 합성.
 *
 * 입력: { date: '2026-05-21', lateMin: 18, earlyMin: 32, missing: 1 }
 * 출력: "5월 21일 근태 사유 확인 요청 — 지각 18분, 조퇴 32분, 미체크 1건. 사유를 입력해 주세요."
 *
 * - 0인 항목은 본문에서 생략.
 * - 모두 0이면 일반 안내 문구로 대체.
 * - JM3: 순수 합성 함수.
 * - JM4: 명시적 number 입력, any 없음.
 */
export function buildAbnormalDailyRequestBody(input: {
  date: string;
  lateMin: number;
  earlyMin: number;
  missing: number;
}): string {
  const { date, lateMin, earlyMin, missing } = input;
  const dateLabel = formatKoreanDateLabel(date);
  const parts: string[] = [];
  if (lateMin > 0) parts.push(`지각 ${lateMin}분`);
  if (earlyMin > 0) parts.push(`조퇴 ${earlyMin}분`);
  if (missing > 0) parts.push(`미체크 ${missing}건`);
  if (parts.length === 0) {
    return `${dateLabel} 근태 사유를 입력해 주세요. (관리자 요청)`;
  }
  return `${dateLabel} 근태 사유 확인 요청 — ${parts.join(', ')}. 사유를 입력해 주세요.`;
}

function formatKoreanDateLabel(dateStr: string): string {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return String(dateStr);
  return `${parsed.getMonth() + 1}월 ${parsed.getDate()}일`;
}

/**
 * 사유 요청 알림 발송.
 *
 * notifications.insert — PC 지각조퇴분석.tsx 패턴과 동일한 컬럼 사용
 *   { user_id, title, body, type:'attendance', read_at:null, created_at }
 *
 * type 'attendance_clarification' 같은 신규 enum 은 사용하지 않는다.
 * 기존 type='attendance' 에 title/body 로 식별하는 게 호환성이 가장 안전하다.
 */
export async function requestAttendanceClarification(input: {
  user: ErpUser | null;
  targetStaffId: string;
  targetStaffName: string;
  kind: TeamAbnormalKind;
  /** 'YYYY-MM-DD' 또는 라벨('최근 30일' 등). 메시지에 그대로 들어감 */
  whenLabel?: string;
}): Promise<AbnormalActionResult> {
  const { user, targetStaffId, targetStaffName, kind, whenLabel } = input;
  if (!canMutateTeamAbnormal(user)) {
    return { ok: false, reason: 'no_permission' };
  }
  if (!targetStaffId) return { ok: false, reason: 'not_found' };

  const key = clarifyKey(targetStaffId, kind);
  const last = clarifySentAt.get(key) ?? 0;
  if (Date.now() - last < CLARIFY_COOLDOWN_MS) {
    return { ok: false, reason: 'duplicate' };
  }

  const kindKo = KIND_LABEL_KO[kind];
  const whenPart = whenLabel ? `${whenLabel} ` : '';
  const body = `${whenPart}${kindKo} 사유를 입력해 주세요. (관리자 요청)`;

  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: targetStaffId,
      title: '근태 사유 확인 요청',
      body,
      type: 'attendance',
      read_at: null,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    clarifySentAt.set(key, Date.now());
    return { ok: true };
  } catch (err) {
    console.error('[mobile-hr] requestAttendanceClarification failed', err);
    return { ok: false, reason: 'unknown' };
  }
}

/**
 * 다종 abnormal 사유 요청 알림 발송.
 *
 * - counts 에 0이 아닌 kind가 하나라도 있으면 그 kind를 모두 묶어 본문 1개로 발송.
 * - 모두 0이면 'not_found' 로 실패 처리 (호출 측 가드 보조).
 * - cooldown 키는 'multi' 단일 슬롯 — 같은 staff 에 24h 안에 다중 알림을 1회로 제한.
 */
export async function requestAttendanceClarificationMulti(input: {
  user: ErpUser | null;
  targetStaffId: string;
  targetStaffName: string;
  counts: AbnormalKindCounts;
  whenLabel?: string;
}): Promise<AbnormalActionResult> {
  const { user, targetStaffId, counts, whenLabel } = input;
  if (!canMutateTeamAbnormal(user)) {
    return { ok: false, reason: 'no_permission' };
  }
  if (!targetStaffId) return { ok: false, reason: 'not_found' };

  let totals = 0;
  for (const n of Object.values(counts) as Array<number | undefined>) {
    if (typeof n === 'number' && n > 0) totals += n;
  }
  if (totals <= 0) {
    return { ok: false, reason: 'not_found' };
  }

  const key = clarifyKey(targetStaffId, 'multi');
  const last = clarifySentAt.get(key) ?? 0;
  if (Date.now() - last < CLARIFY_COOLDOWN_MS) {
    return { ok: false, reason: 'duplicate' };
  }

  const body = buildAbnormalRequestBody({ whenLabel, counts });

  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: targetStaffId,
      title: '근태 사유 확인 요청',
      body,
      type: 'attendance',
      read_at: null,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    clarifySentAt.set(key, Date.now());
    return { ok: true };
  } catch (err) {
    console.error('[mobile-hr] requestAttendanceClarificationMulti failed', err);
    return { ok: false, reason: 'unknown' };
  }
}

/**
 * 팀 근태이상 row 정상 처리.
 *
 * PC AbnormalWorkcenter.tsx + resolveStaffAbnormalRecords 와 같은 정책:
 *   1) attendances(복수) status='present', late_minutes=0, early_leave_minutes=0
 *   2) attendance(단수) status='정상'  ← 마이페이지가 보는 테이블
 *   3) 'erp-attendance-updated' CustomEvent dispatch
 *
 * 모바일은 row 단위로 단순화 — 최근 30일 abnormal row 전체를 일괄 보정한다
 * (TeamTab 카드가 staff 단위 집계이므로 정책 일치).
 */
export async function resolveTeamAbnormalForStaff(input: {
  user: ErpUser | null;
  targetStaffId: string;
}): Promise<AbnormalActionResult> {
  const { user, targetStaffId } = input;
  if (!canMutateTeamAbnormal(user)) {
    return { ok: false, reason: 'no_permission' };
  }
  if (!targetStaffId) return { ok: false, reason: 'not_found' };

  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toLocaleDateString('en-CA');

    // 1) 어떤 날짜가 abnormal 인지 식별 — attendance(단수) 기준
    const { data: rawDates, error: fetchErr } = await supabase
      .from('attendance')
      .select('date, status')
      .eq('staff_id', targetStaffId)
      .gte('date', sinceStr)
      .in('status', ['late', 'early_leave', 'missing']);

    if (fetchErr) throw fetchErr;

    const dates = Array.from(
      new Set(
        ((rawDates ?? []) as Record<string, unknown>[])
          .map((r) => String(r.date ?? ''))
          .filter(Boolean),
      ),
    ).sort();

    if (dates.length === 0) {
      return { ok: true, updatedDates: [] };
    }

    // 2) attendance(단수) — 마이페이지가 즉시 보는 테이블
    const { error: updErr } = await supabase
      .from('attendance')
      .update({ status: '정상' })
      .eq('staff_id', targetStaffId)
      .in('date', dates);
    if (updErr) throw updErr;

    // 3) attendances(복수) — PC 워크센터가 보는 테이블. 컬럼 없을 수 있어 폴백.
    const { error: updAttendancesErr } = await supabase
      .from('attendances')
      .update({ status: 'present', late_minutes: 0, early_leave_minutes: 0 })
      .eq('staff_id', targetStaffId)
      .in('work_date', dates);
    if (updAttendancesErr) {
      const { error: fallbackErr } = await supabase
        .from('attendances')
        .update({ status: 'present' })
        .eq('staff_id', targetStaffId)
        .in('work_date', dates);
      if (fallbackErr) {
        console.warn('[mobile-hr] attendances 보정 실패 — attendance(단수)만 갱신됨', fallbackErr);
      }
    }

    // 4) 마이페이지 KPI 재집계용 broadcast
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('erp-attendance-updated', {
          detail: {
            staffId: targetStaffId,
            dates,
            source: 'mobile-abnormal',
          },
        }),
      );
    }

    return { ok: true, updatedDates: dates };
  } catch (err) {
    console.error('[mobile-hr] resolveTeamAbnormalForStaff failed', err);
    return { ok: false, reason: 'unknown' };
  }
}

// ─────────────────────────────────────────────────────────────
// 팀 근태이상 — 일자별 row 단위 hook & 액션 (JM2, JM3, JM5)
//
// useTeamAbnormalByDay: 최근 30일 attendances 를 fetch → 직원·일자 조합당 1 row.
//   - 분 단위로 late_minutes / early_leave_minutes 노출
//   - missing 은 check_in/check_out 한쪽만 있을 때 1로 계산
//   - PC AbnormalWorkcenter/data.ts 의 normalizeRecord 와 동일 규칙
//
// resolveTeamAbnormalForStaffOnDate: 단일 (staff, date) row 만 정상 처리.
// ─────────────────────────────────────────────────────────────

export type DailyAbnormalRow = {
  staffId: string;
  staffName: string;
  dept: string;
  date: string; // YYYY-MM-DD
  lateMinutes: number;
  earlyLeaveMinutes: number;
  missingCount: number; // 0 또는 1 (출/퇴 한쪽 누락)
  hasCheckIn: boolean;
  hasCheckOut: boolean;
};

function pickStringSafe(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function pickNumberSafe(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function useTeamAbnormalByDay(
  company: string | undefined,
  reloadKey: number,
): { rows: DailyAbnormalRow[]; loading: boolean } {
  const [rows, setRows] = useState<DailyAbnormalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const sinceStr = since.toLocaleDateString('en-CA');

        let staffQ = supabase
          .from('staff_members')
          .select('id, name, department')
          .order('name')
          .limit(500);
        if (company && company !== '전체') staffQ = staffQ.eq('company', company);

        const staffRes = await staffQ;
        if (cancelled) return;

        const staffMap = new Map<string, { name: string; dept: string }>();
        for (const row of (staffRes.data ?? []) as Record<string, unknown>[]) {
          const id = pickStringSafe(row.id);
          if (!id) continue;
          staffMap.set(id, {
            name: pickStringSafe(row.name) || '직원',
            dept: pickStringSafe(row.department) || '미지정',
          });
        }

        const staffIds = Array.from(staffMap.keys());
        if (staffIds.length === 0) {
          if (!cancelled) setRows([]);
          return;
        }

        // 분 단위는 attendances(복수)에 — PC AbnormalWorkcenter와 동일 컬럼
        const { data: attRows, error: attErr } = await supabase
          .from('attendances')
          .select(
            'staff_id, work_date, status, check_in_time, check_out_time, late_minutes, early_leave_minutes',
          )
          .in('staff_id', staffIds)
          .gte('work_date', sinceStr);
        if (attErr) throw attErr;
        if (cancelled) return;

        const list: DailyAbnormalRow[] = [];
        for (const raw of (attRows ?? []) as Record<string, unknown>[]) {
          const staffId = pickStringSafe(raw.staff_id);
          const workDate = pickStringSafe(raw.work_date);
          if (!staffId || !workDate) continue;
          const info = staffMap.get(staffId);
          if (!info) continue;

          const status = pickStringSafe(raw.status).toLowerCase();
          const checkIn = pickStringSafe(raw.check_in_time);
          const checkOut = pickStringSafe(raw.check_out_time);
          const hasCheckIn = checkIn.length > 0;
          const hasCheckOut = checkOut.length > 0;
          const lateMinRaw = pickNumberSafe(raw.late_minutes);
          const lateMinutes =
            lateMinRaw > 0
              ? lateMinRaw
              : status.includes('late') || status.includes('지각')
                ? 5
                : 0;
          const earlyLeaveMinutes = pickNumberSafe(raw.early_leave_minutes);
          const missingCount = hasCheckIn !== hasCheckOut ? 1 : 0;

          if (lateMinutes <= 0 && earlyLeaveMinutes <= 0 && missingCount <= 0) continue;

          list.push({
            staffId,
            staffName: info.name,
            dept: info.dept,
            date: workDate,
            lateMinutes,
            earlyLeaveMinutes,
            missingCount,
            hasCheckIn,
            hasCheckOut,
          });
        }

        list.sort((a, b) => {
          if (a.date !== b.date) return a.date < b.date ? 1 : -1;
          return a.staffName.localeCompare(b.staffName, 'ko');
        });
        setRows(list);
      } catch (err) {
        if (!cancelled) {
          console.error('[mobile-hr] team abnormal by day load failed', err);
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [company, reloadKey]);

  return { rows, loading };
}

/**
 * 일자별 사유 요청 — 단일 (staff, date) 대상.
 * cooldown 키는 staffId + ':' + date 조합.
 */
export async function requestAttendanceClarificationDaily(input: {
  user: ErpUser | null;
  targetStaffId: string;
  targetStaffName: string;
  date: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  missingCount: number;
}): Promise<AbnormalActionResult> {
  const { user, targetStaffId, date, lateMinutes, earlyLeaveMinutes, missingCount } = input;
  if (!canMutateTeamAbnormal(user)) {
    return { ok: false, reason: 'no_permission' };
  }
  if (!targetStaffId || !date) return { ok: false, reason: 'not_found' };
  if (lateMinutes <= 0 && earlyLeaveMinutes <= 0 && missingCount <= 0) {
    return { ok: false, reason: 'not_found' };
  }

  const key = clarifyKey(targetStaffId, `date:${date}`);
  const last = clarifySentAt.get(key) ?? 0;
  if (Date.now() - last < CLARIFY_COOLDOWN_MS) {
    return { ok: false, reason: 'duplicate' };
  }

  const body = buildAbnormalDailyRequestBody({
    date,
    lateMin: lateMinutes,
    earlyMin: earlyLeaveMinutes,
    missing: missingCount,
  });

  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: targetStaffId,
      title: '근태 사유 확인 요청',
      body,
      type: 'attendance',
      read_at: null,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    clarifySentAt.set(key, Date.now());
    return { ok: true };
  } catch (err) {
    console.error('[mobile-hr] requestAttendanceClarificationDaily failed', err);
    return { ok: false, reason: 'unknown' };
  }
}

/**
 * 단일 (staff, date) 정상 처리.
 *
 * - attendance(단수): date == card.date 인 row 만 status='정상'
 * - attendances(복수): work_date == card.date 인 row 만 status='present',
 *   late_minutes=0, early_leave_minutes=0 (컬럼 없으면 폴백)
 * - 'erp-attendance-updated' broadcast
 */
export async function resolveTeamAbnormalForStaffOnDate(input: {
  user: ErpUser | null;
  targetStaffId: string;
  date: string;
}): Promise<AbnormalActionResult> {
  const { user, targetStaffId, date } = input;
  if (!canMutateTeamAbnormal(user)) {
    return { ok: false, reason: 'no_permission' };
  }
  if (!targetStaffId || !date) return { ok: false, reason: 'not_found' };

  try {
    // attendance(단수)
    const { error: updErr } = await supabase
      .from('attendance')
      .update({ status: '정상' })
      .eq('staff_id', targetStaffId)
      .eq('date', date);
    if (updErr) {
      // 단수 테이블에 row 없을 수 있음 — warn만
      console.warn('[mobile-hr] attendance(단수) 단일일 보정 실패', updErr);
    }

    // attendances(복수)
    const { error: updAttErr } = await supabase
      .from('attendances')
      .update({ status: 'present', late_minutes: 0, early_leave_minutes: 0 })
      .eq('staff_id', targetStaffId)
      .eq('work_date', date);
    if (updAttErr) {
      const { error: fallbackErr } = await supabase
        .from('attendances')
        .update({ status: 'present' })
        .eq('staff_id', targetStaffId)
        .eq('work_date', date);
      if (fallbackErr) {
        console.warn('[mobile-hr] attendances 단일일 보정 실패', fallbackErr);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('erp-attendance-updated', {
          detail: {
            staffId: targetStaffId,
            dates: [date],
            source: 'mobile-abnormal-daily',
          },
        }),
      );
    }

    return { ok: true, updatedDates: [date] };
  } catch (err) {
    console.error('[mobile-hr] resolveTeamAbnormalForStaffOnDate failed', err);
    return { ok: false, reason: 'unknown' };
  }
}

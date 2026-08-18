'use client';

/**
 * LeaveWorkcenter — 데이터 fetch & 타입 (JM4, JM3)
 *
 * - Supabase에서 leave_requests / leave_balances를 묶어 KPI / 표 / 소멸 알림 데이터를
 *   계산하기 좋게 가공한다.
 * - AbortController로 다중 호출 race 보호 (JM2/JM3).
 */

import { db, d1 } from '@/lib/db-client';
import type { StaffMember } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import { normalizeLeaveType } from '@/lib/leave-type';
import { buildApprovalSubmitPayload } from '@/lib/approval-submit-payload';
import { computeAnnualLeaveSummary } from '@/lib/annual-leave-summary';
// PC 워크센터도 개인/모바일 화면과 **같은 주기 계산·같은 집계 함수**를 쓴다.
import {
  aggregateLedgerEntries,
  getLeaveCycle,
  resolveHireDateKey,
  type LedgerRowLike,
} from '@/lib/leave-cycle';

// ─── 타입 ─────────────────────────────────────────────────────────
export type LeaveStatus = '대기' | '승인' | '반려';

export interface LeaveRequest {
  id: string;
  staff_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason?: string;
  status: LeaveStatus;
  created_at?: string;
  days?: number;
}

export interface LeaveBalanceRow {
  staff_id: string;
  total_days: number;
  used_days: number;
  remaining_days: number;
  expiry_date: string | null;
  days_until_expiry: number;
  expired_days?: number;
  compensated_days?: number;
  updated_at?: string | null;
}

export interface LeaveStaffRow {
  staff: StaffMember;
  total: number;
  used: number;
  remaining: number;
  daysUntilExpiry: number;
  expiryDate: string | null;
  pending: number;
  updatedAt?: string | null;
}

export interface LeaveExpiryItem {
  staff: StaffMember;
  remaining: number;
  daysUntilExpiry: number;
  expiryDate: string | null;
}

export interface LeaveDataResult {
  rows: LeaveStaffRow[];
  /** 캘린더용 — 모든 leave_requests 노출 */
  requests: LeaveRequest[];
  expiryItems: LeaveExpiryItem[];
  totals: {
    remaining: number;
    total: number;
    used: number;
    pending: number;
    expiringStaff: number;
  };
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────

function pickNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function pickString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

function asLeaveStatus(value: unknown): LeaveStatus {
  if (value === '승인' || value === '반려' || value === '대기') return value;
  return '대기';
}

function daysBetween(future: Date, base: Date): number {
  const diff = future.getTime() - base.getTime();
  return Math.ceil(diff / (24 * 3600 * 1000));
}

// ─── 정규화 ───────────────────────────────────────────────────────
// JM4 강화: ISO 날짜·숫자 fallback. Invalid Date / NaN 발생 방지.
function safeDate(raw: string | null, fallback: Date): Date {
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function normalizeBalance(row: Record<string, unknown>, now: Date): LeaveBalanceRow {
  const staffId = String(row.staff_id ?? '');
  const total = pickNumber(row.total_days ?? row.annual_total ?? row.granted_days ?? 0);
  const used = pickNumber(row.used_days ?? row.annual_used ?? 0);
  const remaining = pickNumber(
    row.remaining_days ?? row.balance ?? (total - used),
    total - used,
  );
  const expiryRaw = pickString(row.expiry_date);
  const expiryFallback = new Date(now.getFullYear(), 11, 31);
  const expiry = safeDate(expiryRaw, expiryFallback);
  const daysUntilExpiry = daysBetween(expiry, now);
  const updatedAtRaw = pickString(row.updated_at);
  return {
    staff_id: staffId,
    total_days: total,
    used_days: used,
    remaining_days: remaining,
    expiry_date: formatKoreanDateKey(expiry),
    days_until_expiry: daysUntilExpiry,
    updated_at: updatedAtRaw };
}

function normalizeRequest(row: Record<string, unknown>): LeaveRequest {
  return {
    id: String(row.id ?? ''),
    staff_id: String(row.staff_id ?? ''),
    leave_type: String(row.leave_type ?? '연차'),
    start_date: String(row.start_date ?? ''),
    end_date: String(row.end_date ?? row.start_date ?? ''),
    reason: pickString(row.reason) ?? '',
    status: asLeaveStatus(row.status),
    created_at: pickString(row.created_at) ?? undefined,
    days: row.days != null ? pickNumber(row.days) : undefined };
}

// ─── fetch ────────────────────────────────────────────────────────
export interface FetchLeaveDataOptions {
  staffs: StaffMember[];
  selectedCo: string;
  signal?: AbortSignal;
}

export async function fetchLeaveData({
  staffs,
  selectedCo,
  signal }: FetchLeaveDataOptions): Promise<LeaveDataResult> {
  const targetStaff = staffs.filter((staff) => {
    if (!isActiveStaff(staff)) return false;
    if (selectedCo && selectedCo !== '전체' && staff.company !== selectedCo) return false;
    return true;
  });

  const staffIds = targetStaff.map((staff) => staff.id);
  if (staffIds.length === 0) {
    return {
      rows: [],
      expiryItems: [],
      requests: [],
      totals: { remaining: 0, total: 0, used: 0, pending: 0, expiringStaff: 0 } };
  }

  const now = new Date();
  const todayKey = formatKoreanDateKey(now);
  const [balanceRes, requestRes, ledgerRes, hireRes] = await Promise.all([
    db
      .from('leave_balances')
      .select('*')
      .in('staff_id', staffIds)
      .eq('year', now.getFullYear()),
    db
      .from('leave_requests')
      .select('id, staff_id, leave_type, start_date, end_date, reason, status, created_at')
      .in('staff_id', staffIds),
    db
      .from('leave_ledger')
      .select('id, staff_id, entry_type, days, occurred_on, period_key, source_id, note')
      .in('staff_id', staffIds),
    // 주기 계산에 입사일이 필요하다. staffs prop 에 입사일이 실려 오지 않는
    // 호출부가 있어 원본에서 직접 읽는다.
    db
      .from('staff_members')
      .select('id, hire_date, join_date, joined_at')
      .in('id', staffIds),
  ]);

  if (signal?.aborted) {
    throw new DOMException('aborted', 'AbortError');
  }

  const rawBalances = Array.isArray(balanceRes.data) ? balanceRes.data : [];
  const rawRequests = Array.isArray(requestRes.data) ? requestRes.data : [];
  const rawLedgers = Array.isArray(ledgerRes.data) ? ledgerRes.data : [];

  const balances = new Map<string, LeaveBalanceRow>();
  for (const raw of rawBalances) {
    if (raw && typeof raw === 'object') {
      const normalized = normalizeBalance(raw as Record<string, unknown>, now);
      if (normalized.staff_id) balances.set(normalized.staff_id, normalized);
    }
  }

  // 원장(leave_ledger)을 **입사일 주기** 기준으로 집계한다.
  //
  // 예전에는 이 화면만 자체 합산 로직을 갖고 있었고, 주기 필터도 없이 전 이력을
  // 더한 뒤 `leave_balances`(year = 역년) 값을 우선했다. 개인·모바일 화면은
  // /api/annual-leave/summary 의 **입사일 주기** 값을 쓰므로, 입사기념일이 연중인
  // 직원(대다수)은 인사담당자 화면과 본인 화면의 총/사용/잔여가 계속 어긋났다.
  // 이제 서버와 같은 aggregateLedgerEntries 를 그대로 쓴다.
  const rawHires = Array.isArray(hireRes.data) ? hireRes.data : [];
  const hireDateByStaff = new Map<string, string>();
  for (const raw of rawHires) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const sId = String(row.id ?? '').trim();
    const hireKey = resolveHireDateKey(row);
    if (sId && hireKey) hireDateByStaff.set(sId, hireKey);
  }

  const ledgerRowsByStaff = new Map<string, LedgerRowLike[]>();
  for (const l of rawLedgers) {
    if (!l || typeof l !== 'object') continue;
    const row = l as Record<string, unknown>;
    const sId = String(row.staff_id ?? '').trim();
    if (!sId) continue;
    const entry: LedgerRowLike = {
      id: row.id,
      entry_type: row.entry_type,
      days: row.days,
      occurred_on: typeof row.occurred_on === 'string' ? row.occurred_on : null,
      period_key: row.period_key,
      source_id: typeof row.source_id === 'string' ? row.source_id : null,
      note: typeof row.note === 'string' ? row.note : null,
    };
    const list = ledgerRowsByStaff.get(sId);
    if (list) list.push(entry);
    else ledgerRowsByStaff.set(sId, [entry]);
  }

  const requests: LeaveRequest[] = [];
  for (const raw of rawRequests) {
    if (raw && typeof raw === 'object') {
      requests.push(normalizeRequest(raw as Record<string, unknown>));
    }
  }
  const pendingByStaff = new Map<string, number>();
  for (const req of requests) {
    if (req.status === '대기') {
      pendingByStaff.set(req.staff_id, (pendingByStaff.get(req.staff_id) ?? 0) + 1);
    }
  }

  // 직원별 leave_requests 분류
  const requestsByStaff = new Map<string, Array<Record<string, unknown>>>();
  for (const raw of rawRequests) {
    if (raw && typeof raw === 'object') {
      const sId = String((raw as Record<string, unknown>).staff_id || '').trim();
      if (sId) {
        if (!requestsByStaff.has(sId)) requestsByStaff.set(sId, []);
        requestsByStaff.get(sId)!.push(raw as Record<string, unknown>);
      }
    }
  }

  const rows: LeaveStaffRow[] = targetStaff.map((staff) => {
    const sId = String(staff.id);
    const balance = balances.get(sId);
    const staffLeaveRows = requestsByStaff.get(sId) || [];
    const hireKey = hireDateByStaff.get(sId) ?? resolveHireDateKey(staff as Record<string, unknown>);
    const cycle = hireKey ? getLeaveCycle(hireKey, todayKey) : null;

    if (cycle) {
      const ledger = aggregateLedgerEntries(ledgerRowsByStaff.get(sId) ?? [], cycle);
      // 만료일은 주기 종료일(다음 입사기념일)이다. leave_balances.expiry_date 는
      // 갱신 시점에 따라 비어 있을 수 있어 주기 계산값을 우선한다.
      const expiryDate = cycle.end;
      const daysUntilExpiry = daysBetween(safeDate(expiryDate, now), now);
      return {
        staff,
        total: ledger.total,
        used: ledger.used,
        remaining: ledger.remaining,
        daysUntilExpiry,
        expiryDate,
        pending: pendingByStaff.get(sId) ?? 0,
        updatedAt: balance?.updated_at ?? null };
    }

    // 입사일이 없어 주기를 못 잡는 직원만 기존 역년 폴백을 쓴다.
    const summary = computeAnnualLeaveSummary({
      staffTotal: pickNumber(staff.annual_leave_total ?? staff.annual_days ?? 0),
      staffUsed: pickNumber(staff.annual_leave_used ?? staff.annual_used ?? 0),
      balanceTotal: balance?.total_days,
      balanceUsed: balance?.used_days,
      balanceRemaining: balance?.remaining_days,
      expired: balance?.expired_days,
      compensated: balance?.compensated_days,
      leaveRows: staffLeaveRows,
      year: now.getFullYear(),
    });
    return {
      staff,
      total: summary.total,
      used: summary.used,
      remaining: summary.remaining,
      daysUntilExpiry: balance?.days_until_expiry ?? 365,
      expiryDate: balance?.expiry_date ?? null,
      pending: pendingByStaff.get(sId) ?? 0,
      updatedAt: balance?.updated_at ?? null };
  });

  const expiryItems: LeaveExpiryItem[] = rows
    .filter((row) => row.remaining > 0 && row.daysUntilExpiry <= 30)
    .map((row) => ({
      staff: row.staff,
      remaining: row.remaining,
      daysUntilExpiry: row.daysUntilExpiry,
      expiryDate: row.expiryDate }))
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  const totals = rows.reduce(
    (acc, row) => {
      acc.remaining += row.remaining;
      acc.total += row.total;
      acc.used += row.used;
      acc.pending += row.pending;
      return acc;
    },
    { remaining: 0, total: 0, used: 0, pending: 0, expiringStaff: 0 },
  );
  totals.expiringStaff = expiryItems.length;

  return { rows, requests, expiryItems, totals };
}

// ─── 신청 submit ───────────────────────────────────────────────────
export interface LeaveSubmitInput {
  staffId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
}

export async function submitLeaveRequest(input: LeaveSubmitInput): Promise<void> {
  const leaveTypeKey = normalizeLeaveType(input.leaveType);
  // 수동 부여: 0.5 단위, 0.5~100
  let days = Number(input.days) || 0;
  if (leaveTypeKey === '연차(부여)') {
    if (!Number.isFinite(days) || days < 0.5 || days > 100) {
      throw new Error('연차 수동 부여는 0.5일 단위로 0.5~100일만 가능합니다.');
    }
    // 0.5 배수 검증 (부동소수 허용)
    if (Math.abs(days * 2 - Math.round(days * 2)) > 1e-9) {
      throw new Error('연차 수동 부여는 0.5일 단위만 가능합니다.');
    }
    days = Math.round(days * 2) / 2;
  }

  const payload = {
    staff_id: input.staffId,
    leave_type: leaveTypeKey,
    start_date: input.startDate,
    end_date: input.endDate || input.startDate,
    days,
    reason: input.reason || '',
    status: '대기' as LeaveStatus,
    created_at: new Date().toISOString() };
  const { error } = await db.from('leave_requests').insert(payload);
  if (error) throw new Error(error.message);

  // 전자결재(approvals)에도 함께 기안 상신 등록
  try {
    const { data: staffData } = await db
      .from('staff_members')
      .select('name, company, company_id, department, position')
      .eq('id', input.staffId)
      .maybeSingle();

    const staffName = staffData?.name || '직원';
    const { data: directoryRows } = await db
      .from('staff_members')
      .select('id, name, company, department, position, status, role, permissions, employee_no, hire_date, resign_date');

    // 연차 수동 부여 → 관리자 결재선 고정 / 일반 사용 → 기본 결재선
    let line: Array<{
      id: string;
      name?: string | null;
      position?: string | null;
      department?: string | null;
      company?: string | null;
    }> = [];
    let approverLineSource = 'leave_workcenter';
    if (leaveTypeKey === '연차(부여)') {
      const { selectLeaveAdminApproverLine } = await import('@/lib/leave-admin-approver');
      line = selectLeaveAdminApproverLine((directoryRows ?? []) as any[], {
        selfId: input.staffId,
        maxCount: 3,
      });
      approverLineSource = 'leave_admin_grant';
      if (line.length === 0) {
        throw new Error('관리자 결재자를 찾을 수 없습니다. 관리자 계정을 확인해주세요.');
      }
    } else {
      const { selectDefaultApproverLine } = await import('@/lib/approval-routing');
      line = selectDefaultApproverLine((directoryRows ?? []) as import('@/types').StaffMember[], {
        selfId: input.staffId,
        company: String(staffData?.company || '').trim() || undefined,
        includeSyInc: true,
        maxCount: 3,
        mode: 'head_or_above',
      });
    }
    const firstApprover = line[0];

    let titleType = '연차 사용 신청';
    if (leaveTypeKey === '연차(부여)') titleType = `연차 수동 부여 +${days}일`;
    else if (leaveTypeKey === '연차(과거사용)') titleType = '도입 전 사용 소급';

    const { row: approvalPayload } = buildApprovalSubmitPayload({
      staffId: input.staffId,
      senderName: staffName,
      senderCompany: String(staffData?.company || 'SY INC.'),
      senderDepartment: staffData?.department || null,
      companyId: staffData?.company_id || null,
      typeName: '연차/휴가',
      title: `[연차/휴가] ${staffName} - ${titleType}`,
      content:
        leaveTypeKey === '연차(부여)'
          ? (input.reason || `연차 수동 부여 ${days}일 (관리자 승인 후 자동 반영)`)
          : input.reason || '',
      formSlug: 'leave',
      formDisplayName: '연차/휴가',
      approverLine: line.map((s) => ({
        id: String(s.id),
        name: s.name || '',
        position: s.position || null,
        department: s.department || null,
        company: s.company || null,
      })),
      approverLineSource,
      ccDepartments: ['행정팀'],
      extraMeta: {
        startDate: input.startDate,
        endDate: input.endDate || input.startDate,
        leaveType: leaveTypeKey,
        reason: input.reason || '',
        days,
        vType: leaveTypeKey,
        manual_grant: leaveTypeKey === '연차(부여)',
      },
    });

    await db.from('approvals').insert(approvalPayload);

    // 수정 E: 결재자 즉시 알림 — approver_line 첫 번째 staffId에게 알림 발송
    const firstApproverId: string | null =
      String((approvalPayload.meta_data as { approver_line?: string[] } | undefined)?.approver_line?.[0] || firstApprover?.id || '') ||
      null;
    if (firstApproverId) {
      try {
        await d1.from('notifications').insert({
          user_id: firstApproverId,
          title: leaveTypeKey === '연차(부여)' ? '연차 수동 부여 승인 요청' : '연차 승인 요청',
          body:
            leaveTypeKey === '연차(부여)'
              ? `${staffName} 연차 수동 부여 +${days}일 승인 요청`
              : `${staffName}님이 연차를 신청했습니다`,
          type: 'approval',
          read_at: null,
          created_at: new Date().toISOString() });
      } catch (notifErr) {
        console.error('결재자 알림 발송 중 오류:', notifErr);
      }
    }
  } catch (err) {
    console.error('전자결재 상신 등록 중 오류 발생:', err);
    // 수동 부여는 결재 상신이 핵심 — 실패 시 호출부에 전달
    if (leaveTypeKey === '연차(부여)') {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}

// ─── 소멸 권고 알림 ────────────────────────────────────────────────
export async function sendExpiryAlert(staffId: string, remaining: number, expiryDate: string | null) {
  const expiryLabel = expiryDate
    ? new Date(expiryDate).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
    : '연말';
  const { error } = await d1.from('notifications').insert({
    user_id: staffId,
    title: '연차 소멸 예정 알림',
    body: `보유 연차 ${remaining}일이 ${expiryLabel}에 소멸 예정입니다. 사용 계획을 확인해 주세요.`,
    type: 'attendance',
    read_at: null,
    created_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

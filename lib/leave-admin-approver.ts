/**
 * 연차 수동 부여 등 관리자 결재선 후보 선택.
 * - system_master 권한 / employee_no=9999 / role·position 관리자 우선
 */

import type { StaffMember } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import { SYSTEM_MASTER_ACCOUNT_ID, hasSystemMasterPermission } from '@/lib/system-master';

export type LeaveAdminCandidate = {
  id: string;
  name?: string | null;
  company?: string | null;
  department?: string | null;
  position?: string | null;
  role?: string | null;
  employee_no?: string | null;
  permissions?: Record<string, unknown> | string | null;
  status?: string | null;
};

function parsePermissions(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function isLeaveAdminCandidate(staff: LeaveAdminCandidate | null | undefined): boolean {
  if (!staff?.id) return false;
  if (!isActiveStaff(staff as Parameters<typeof isActiveStaff>[0])) return false;

  const employeeNo = String(staff.employee_no ?? '').trim();
  if (employeeNo === SYSTEM_MASTER_ACCOUNT_ID) return true;

  const perms = parsePermissions(staff.permissions);
  if (hasSystemMasterPermission({ permissions: perms, is_system_master: perms?.is_system_master })) {
    return true;
  }
  // permissions.admin 만으로는 너무 넓음(일반 직원 다수 보유) — role/직책 기준
  const role = String(staff.role ?? '').trim().toLowerCase();
  if (role === 'admin' || role === 'system_master' || role === 'master') return true;

  const position = String(staff.position ?? '');
  if (
    position.includes('관리자') ||
    position.includes('병원장') ||
    position.includes('원장') ||
    position.includes('이사') ||
    position.includes('대표')
  ) {
    return true;
  }
  return false;
}

/**
 * 연차 수동 부여 결재선: 관리자 후보 (자기 자신 제외, 최대 maxCount).
 * 후보가 없으면 빈 배열.
 */
export function selectLeaveAdminApproverLine<T extends LeaveAdminCandidate>(
  staffs: T[],
  options: { selfId?: string | null; maxCount?: number } = {},
): T[] {
  const selfId = String(options.selfId ?? '').trim();
  const maxCount = options.maxCount ?? 3;

  const scored = staffs
    .filter((s) => isLeaveAdminCandidate(s) && String(s.id) !== selfId)
    .map((s) => {
      let score = 0;
      if (String(s.employee_no ?? '').trim() === SYSTEM_MASTER_ACCOUNT_ID) score += 100;
      const perms = parsePermissions(s.permissions);
      if (perms?.system_master === true || perms?.is_system_master === true) score += 90;
      const role = String(s.role ?? '').trim().toLowerCase();
      if (role === 'admin') score += 70;
      if (String(s.position ?? '').includes('병원장')) score += 50;
      if (String(s.position ?? '').includes('이사')) score += 45;
      if (String(s.position ?? '').includes('원장')) score += 40;
      if (String(s.position ?? '').includes('관리자')) score += 35;
      return { s, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.s.name ?? '').localeCompare(String(b.s.name ?? ''), 'ko');
    });

  return scored.slice(0, Math.max(1, maxCount)).map((x) => x.s);
}

/** 결재선 표시용 최소 매핑 */
export function toApproverLineDetails(staffs: LeaveAdminCandidate[]) {
  return staffs.map((s) => ({
    id: String(s.id),
    name: s.name || '',
    position: s.position || null,
    department: s.department || null,
    company: s.company || null,
  }));
}

export type { StaffMember };

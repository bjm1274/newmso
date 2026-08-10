/**
 * 퇴사 오프보딩 상태 전이 (서버 권위).
 *
 * 이 전이는 `status`·`resigned_at` 만 바꾸는 게 아니라 `role`·`permissions`·
 * `force_logout_at` 을 함께 쓴다. 셋 다 권한에 직결되는 컬럼이라 범용
 * `/api/d1/mutate` 의 staffPrivilegeGuard 가 관리자에게만 열어둔다 — 열어주면
 * 인사담당자가 자기 계정에 admin 을 심을 수 있으니 그 가드를 느슨하게 할 수는 없다.
 *
 * 그 결과 인사담당자에게는 오프보딩 탭 네 개 동작(시작·취소·확정·복구)이 전부
 * "오프보딩 시작 중 오류가 발생했습니다" 로 실패했다. 화면은 열리는데 아무것도
 * 안 되는 상태였다.
 *
 * 그래서 전이 자체를 서버로 옮긴다. 여기서는 무엇을 쓸지 서버가 정하므로
 * 인사담당자에게 허용해도 권한 상승이 되지 않는다 — 클라이언트가 보내는 것은
 * 대상자·날짜·사유뿐이고, role·permissions 값은 서버가 계산한다.
 */

export type OffboardingAction = 'start' | 'cancel' | 'finalize' | 'restore';

/** permissions 안에 오프보딩이 쓰는 부기 키. 전이할 때마다 서버가 직접 넣고 지운다. */
export const OFFBOARDING_PERMISSION_KEYS = [
  'offboarding_original_status',
  'offboarding_original_role',
  'offboarding_started_at',
  'offboarding_reason',
  'offboarding_finalized_at',
] as const;

export type StaffOffboardingRow = {
  id: string;
  status: string | null;
  role: string | null;
  resigned_at: string | null;
  permissions: Record<string, unknown> | string | null;
  company_id: string | null;
  company: string | null;
  employee_no: string | null;
  is_system_master: number | null;
  name: string | null;
};

export type OffboardingTransition = {
  status: string;
  role?: string;
  resigned_at: string | null;
  permissions: Record<string, unknown>;
  force_logout_at?: string;
};

export function parsePermissions(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      // 깨진 JSON 은 빈 객체로 본다 — 여기서 던지면 전이가 통째로 막힌다.
    }
  }
  return {};
}

function withoutOffboardingKeys(permissions: Record<string, unknown>): Record<string, unknown> {
  const next = { ...permissions };
  for (const key of OFFBOARDING_PERMISSION_KEYS) delete next[key];
  return next;
}

/**
 * 오프보딩 시작 전 원래 상태. 화면의 getOriginalStatus 와 같은 판정이지만,
 * 여기서는 클라이언트가 보낸 값이 아니라 DB 정본에서 읽는다.
 */
function originalStatus(row: StaffOffboardingRow, permissions: Record<string, unknown>): string {
  const saved = permissions.offboarding_original_status;
  if (typeof saved === 'string' && saved.trim()) return saved.trim();
  return row.status === '계약' ? '계약' : '재직';
}

function originalRole(row: StaffOffboardingRow, permissions: Record<string, unknown>): string {
  const saved = permissions.offboarding_original_role;
  if (typeof saved === 'string' && saved.trim()) return saved.trim();
  return row.role === 'inactive' ? 'staff' : row.role || 'staff';
}

/**
 * 전이 결과를 계산한다. DB 는 건드리지 않는다 (테스트 가능하게 분리).
 *
 * @param nowIso 시각을 인자로 받는다 — 같은 입력이면 같은 결과여야 검증할 수 있다.
 */
export function computeOffboardingTransition(
  action: OffboardingAction,
  row: StaffOffboardingRow,
  options: { exitDate?: string; reason?: string; nowIso: string },
): OffboardingTransition {
  const current = parsePermissions(row.permissions);

  if (action === 'start') {
    const exitDate = String(options.exitDate || '').trim();
    if (!exitDate) throw new Error('퇴사 예정일이 필요합니다.');
    return {
      status: '퇴사예정',
      resigned_at: exitDate,
      permissions: {
        ...current,
        offboarding_original_status: row.status || '재직',
        offboarding_original_role: row.role || 'staff',
        offboarding_started_at: options.nowIso,
        offboarding_reason: String(options.reason || '').trim() || '개인 사유' } };
  }

  if (action === 'cancel') {
    return {
      status: originalStatus(row, current),
      role: originalRole(row, current),
      resigned_at: null,
      permissions: withoutOffboardingKeys(current) };
  }

  if (action === 'finalize') {
    return {
      status: '퇴사',
      role: 'inactive',
      resigned_at: row.resigned_at || options.nowIso.slice(0, 10),
      permissions: {
        ...withoutOffboardingKeys(current),
        offboarding_finalized_at: options.nowIso },
      // 퇴사 확정 시점에 기존 세션을 끊는다.
      force_logout_at: options.nowIso };
  }

  // restore — 퇴사 처리를 되돌린다. 원래 역할 기록은 이미 지워졌으므로 기본값으로 되돌린다.
  return {
    status: '재직',
    role: 'staff',
    resigned_at: null,
    permissions: withoutOffboardingKeys(current) };
}

/** 시스템마스터 계정은 오프보딩 대상이 될 수 없다 (권한 컬럼을 서버가 쓰므로 더 엄격히 본다). */
export function isSystemMasterTarget(row: StaffOffboardingRow): boolean {
  if (String(row.employee_no ?? '').trim() === '9999') return true;
  if (row.is_system_master === 1) return true;
  const perms = parsePermissions(row.permissions);
  return perms.system_master === true;
}

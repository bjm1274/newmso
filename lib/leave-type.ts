/**
 * leave_requests.leave_type / approvals.meta.leaveType 정본.
 *
 * 저장: 짧은 정규 키 (연차, 반차, 병가, 경조 …)
 * UI: leaveTypeLabel() 로 표시
 * 레거시: normalizeLeaveType() 이 '연차 (1.0)' · '반차 (0.5)' · '경조사' 등을 흡수
 */

export const LEAVE_TYPE = {
  ANNUAL: '연차',
  HALF: '반차',
  HALF_AM: '오전반차',
  HALF_PM: '오후반차',
  SICK: '병가',
  FAMILY: '경조',
  SPECIAL: '특별휴가',
  OTHER: '기타',
  GRANT: '연차(부여)',
  RETRO_USE: '연차(과거사용)',
  HISTORY: '연차(이력)',
} as const;

export type LeaveTypeCanonical = (typeof LEAVE_TYPE)[keyof typeof LEAVE_TYPE];

/** 직원 자가 신청 옵션 */
export const LEAVE_TYPE_EMPLOYEE_OPTIONS = [
  LEAVE_TYPE.ANNUAL,
  LEAVE_TYPE.HALF,
  LEAVE_TYPE.HALF_AM,
  LEAVE_TYPE.HALF_PM,
  LEAVE_TYPE.SICK,
  LEAVE_TYPE.FAMILY,
] as const;

/** 관리자·편집 UI 옵션 */
export const LEAVE_TYPE_ADMIN_OPTIONS = [
  LEAVE_TYPE.ANNUAL,
  LEAVE_TYPE.HALF,
  LEAVE_TYPE.HALF_AM,
  LEAVE_TYPE.HALF_PM,
  LEAVE_TYPE.SICK,
  LEAVE_TYPE.FAMILY,
  LEAVE_TYPE.SPECIAL,
  LEAVE_TYPE.OTHER,
  LEAVE_TYPE.GRANT,
  LEAVE_TYPE.RETRO_USE,
  LEAVE_TYPE.HISTORY,
] as const;

/**
 * 임의 표기 → 저장용 정규 키.
 * 빈 값 → 연차. 알 수 없는 값은 trim 후 그대로 반환(데이터 유실 방지).
 */
export function normalizeLeaveType(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return LEAVE_TYPE.ANNUAL;

  const n = s.toLowerCase().replace(/\s+/g, '');

  if (n.includes('부여') || n === 'grant') return LEAVE_TYPE.GRANT;
  if (n.includes('과거사용') || n.includes('소급')) return LEAVE_TYPE.RETRO_USE;
  if (n.includes('이력')) return LEAVE_TYPE.HISTORY;

  // 오전/오후 반차 보존 (일반 반차보다 먼저)
  if (
    n.includes('오전반차') ||
    n.includes('오전반차') ||
    n === 'half_am' ||
    n === 'am_half' ||
    (n.includes('오전') && n.includes('반차'))
  ) {
    return LEAVE_TYPE.HALF_AM;
  }
  if (
    n.includes('오후반차') ||
    n.includes('오후반차') ||
    n === 'half_pm' ||
    n === 'pm_half' ||
    (n.includes('오후') && n.includes('반차'))
  ) {
    return LEAVE_TYPE.HALF_PM;
  }

  // 반차 계열 (연차보다 먼저)
  if (
    n.includes('반차') ||
    n.includes('0.5') ||
    n === 'half_leave' ||
    n === 'half-day' ||
    n === 'halfday' ||
    (n.includes('half') && !n.includes('annual'))
  ) {
    return LEAVE_TYPE.HALF;
  }

  if (n.includes('병가') || n === 'sick' || n === 'sick_leave') return LEAVE_TYPE.SICK;
  if (n.includes('경조')) return LEAVE_TYPE.FAMILY;
  if (n.includes('특별')) return LEAVE_TYPE.SPECIAL;
  if (n.includes('군소집')) return LEAVE_TYPE.OTHER;
  if (n === '기타' || n === 'other') return LEAVE_TYPE.OTHER;

  if (
    n === '연차' ||
    n.includes('연차') ||
    n === 'annual' ||
    n === 'annual_leave' ||
    n === 'annualleave' ||
    n.includes('1.0')
  ) {
    return LEAVE_TYPE.ANNUAL;
  }

  return s;
}

/** UI 표시용 라벨 */
export function leaveTypeLabel(raw: unknown): string {
  const c = normalizeLeaveType(raw);
  switch (c) {
    case LEAVE_TYPE.ANNUAL:
      return '연차 (1.0)';
    case LEAVE_TYPE.HALF:
      return '반차 (0.5)';
    case LEAVE_TYPE.HALF_AM:
      return '오전반차 (0.5)';
    case LEAVE_TYPE.HALF_PM:
      return '오후반차 (0.5)';
    case LEAVE_TYPE.GRANT:
      return '연차(부여)';
    case LEAVE_TYPE.RETRO_USE:
      return '연차(과거사용)';
    case LEAVE_TYPE.HISTORY:
      return '연차(이력)';
    default:
      return c;
  }
}

/**
 * DB 조회 시 레거시 표기까지 포함 (ensureApproved 등).
 * 정규 키 + 과거 폼 저장값.
 */
export function leaveTypeLookupAliases(raw: unknown): string[] {
  const canon = normalizeLeaveType(raw);
  const aliases = new Set<string>([canon, String(raw ?? '').trim()].filter(Boolean));
  switch (canon) {
    case LEAVE_TYPE.ANNUAL:
      aliases.add('연차 (1.0)');
      aliases.add('연차(1.0)');
      aliases.add('annual_leave');
      aliases.add('annual');
      break;
    case LEAVE_TYPE.HALF:
      aliases.add('반차 (0.5)');
      aliases.add('반차(0.5)');
      aliases.add('half_leave');
      break;
    case LEAVE_TYPE.HALF_AM:
      aliases.add('오전반차');
      aliases.add('오전반차 (0.5)');
      aliases.add('half_am');
      break;
    case LEAVE_TYPE.HALF_PM:
      aliases.add('오후반차');
      aliases.add('오후반차 (0.5)');
      aliases.add('half_pm');
      break;
    case LEAVE_TYPE.FAMILY:
      aliases.add('경조사');
      break;
    case LEAVE_TYPE.SICK:
      aliases.add('병가 (1.0)');
      aliases.add('sick_leave');
      break;
    default:
      break;
  }
  return Array.from(aliases);
}

/** 연차 잔여 차감 대상 (부여 제외) */
export function isAnnualLeaveType(value: unknown): boolean {
  const c = normalizeLeaveType(value);
  if (c === LEAVE_TYPE.GRANT) return false;
  return (
    c === LEAVE_TYPE.ANNUAL ||
    c === LEAVE_TYPE.RETRO_USE ||
    c === LEAVE_TYPE.HISTORY ||
    // 정규화 실패 레거시: 원문에 연차 포함
    (c !== LEAVE_TYPE.HALF &&
      c !== LEAVE_TYPE.SICK &&
      c !== LEAVE_TYPE.FAMILY &&
      c !== LEAVE_TYPE.SPECIAL &&
      c !== LEAVE_TYPE.OTHER &&
      String(value ?? '').includes('연차') &&
      !String(value ?? '').includes('부여'))
  );
}

export function isHalfLeaveType(value: unknown): boolean {
  const c = normalizeLeaveType(value);
  return (
    c === LEAVE_TYPE.HALF ||
    c === LEAVE_TYPE.HALF_AM ||
    c === LEAVE_TYPE.HALF_PM ||
    getLeaveUnit(value) === 0.5
  );
}

/** 1일 단위 소진일수 (반차 0.5 / 그 외 1.0) */
export function getLeaveUnit(value: unknown): 0.5 | 1.0 {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return 1.0;
  if (
    raw === 'half_leave' ||
    raw === 'half-day' ||
    raw === 'halfday' ||
    raw === 'half_am' ||
    raw === 'half_pm' ||
    raw.includes('0.5') ||
    raw.includes('반차') ||
    raw.startsWith('반차') ||
    raw.endsWith('반차')
  ) {
    return 0.5;
  }
  const n = normalizeLeaveType(value);
  if (n === LEAVE_TYPE.HALF || n === LEAVE_TYPE.HALF_AM || n === LEAVE_TYPE.HALF_PM) return 0.5;
  return 1.0;
}

export function countsTowardAnnualBalance(value: unknown): boolean {
  const c = normalizeLeaveType(value);
  return (
    c === LEAVE_TYPE.ANNUAL ||
    c === LEAVE_TYPE.HALF ||
    c === LEAVE_TYPE.HALF_AM ||
    c === LEAVE_TYPE.HALF_PM ||
    c === LEAVE_TYPE.RETRO_USE ||
    c === LEAVE_TYPE.HISTORY
  );
}

export function isGrantLeaveType(value: unknown): boolean {
  return normalizeLeaveType(value) === LEAVE_TYPE.GRANT;
}

/** 근태 상태 매핑용 */
export function leaveTypeToAttendanceStatus(
  value: unknown,
): 'annual_leave' | 'half_leave' | 'sick_leave' {
  const c = normalizeLeaveType(value);
  if (c === LEAVE_TYPE.SICK) return 'sick_leave';
  if (c === LEAVE_TYPE.HALF) return 'half_leave';
  return 'annual_leave';
}

import type { StaffMember } from '@/types';
import { isMissingColumnError } from '@/lib/supabase-compat';
import { INVENTORY_SUPPORT_COMPANY } from '@/app/main/inventory-utils';
import {
  type ApprovalCcUser,
  type ApprovalReferenceDefaultsMap,
  type ApproverTemplate,
  SYSTEM_FORM_TYPE_SLUGS,
} from './전자결재-types';

// ─────────────────────────────────────────────
// Staff 관련 유틸
// ─────────────────────────────────────────────

export function resolveApprovalStaffLine(line: unknown, staffs: StaffMember[] = []) {
  if (!Array.isArray(line)) return [] as StaffMember[];
  const staffMap = new Map(staffs.map((staff) => [String(staff.id), staff]));
  const resolved = line
    .map((entry: unknown) => {
      if (entry == null) return null;
      if (typeof entry === 'string' || typeof entry === 'number') {
        return staffMap.get(String(entry)) ?? null;
      }
      if (typeof entry === 'object' && entry !== null && 'id' in entry && (entry as Record<string, unknown>).id != null) {
        const record = entry as Record<string, unknown>;
        const id = String(record.id);
        const matchedStaff = staffMap.get(id);
        if (matchedStaff) return matchedStaff;
        return {
          ...(record as Partial<StaffMember>),
          id,
          name: String(record.name || ''),
          position: typeof record.position === 'string' ? record.position : null,
          company: typeof record.company === 'string' ? record.company : null,
          department: typeof record.department === 'string' ? record.department : null,
          team: typeof record.team === 'string' ? record.team : null,
        } as StaffMember;
      }
      return null;
    })
    .filter(Boolean) as StaffMember[];

  return Array.from(new Map(resolved.map((staff) => [String(staff.id), staff])).values());
}

export function normalizeApprovalCcUsers(line: unknown, staffs: StaffMember[] = []): ApprovalCcUser[] {
  if (!Array.isArray(line)) return [];
  const staffMap = new Map(staffs.map((staff) => [String(staff.id), staff]));
  const resolved = line
    .map((entry: unknown) => {
      if (entry == null) return null;
      if (typeof entry === 'string' || typeof entry === 'number') {
        const matchedStaff = staffMap.get(String(entry));
        if (!matchedStaff) return null;
        return {
          id: String(matchedStaff.id),
          name: matchedStaff.name || '이름 없음',
          position: matchedStaff.position ?? null,
        } satisfies ApprovalCcUser;
      }
      if (typeof entry === 'object' && entry !== null) {
        const record = entry as Record<string, unknown>;
        const rawId = record.id;
        if (rawId == null) return null;
        const id = String(rawId);
        const matchedStaff = staffMap.get(id);
        return {
          id,
          name: String(record.name || matchedStaff?.name || '이름 없음'),
          position:
            typeof record.position === 'string'
              ? record.position
              : matchedStaff?.position ?? null,
        } satisfies ApprovalCcUser;
      }
      return null;
    })
    .filter(Boolean) as ApprovalCcUser[];

  return Array.from(new Map(resolved.map((staff) => [staff.id, staff])).values());
}

export function mergeApprovalCcUsers(...groups: ApprovalCcUser[][]): ApprovalCcUser[] {
  return Array.from(
    new Map(
      groups
        .flat()
        .filter((staff) => staff?.id && staff?.name)
        .map((staff) => [String(staff.id), { ...staff, id: String(staff.id) }])
    ).values()
  );
}

export function mergeApprovalStaffDirectory(...groups: StaffMember[][]): StaffMember[] {
  return Array.from(
    new Map(
      groups
        .flat()
        .filter((staff) => staff?.id)
        .map((staff) => [String(staff.id), staff])
    ).values()
  );
}

export function normalizeApproverTemplates(value: unknown, staffs: StaffMember[] = []): ApproverTemplate[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const id = String(record.id || '').trim();
      const name = String(record.name || '').trim();
      if (!id || !name) return null;

      return {
        id,
        name,
        line: resolveApprovalStaffLine(record.line, staffs),
        ccLine: Array.isArray(record.ccLine) ? normalizeApprovalCcUsers(record.ccLine, staffs) : undefined,
      } satisfies ApproverTemplate;
    })
    .filter(Boolean) as ApproverTemplate[];

  return Array.from(new Map(normalized.map((template) => [template.id, template])).values());
}

export function normalizeApprovalReferenceDefaultsMap(
  value: unknown,
  staffs: StaffMember[] = []
): ApprovalReferenceDefaultsMap {
  if (!value || typeof value !== 'object') return {};

  return Object.entries(value as Record<string, unknown>).reduce<ApprovalReferenceDefaultsMap>((acc, [key, entries]) => {
    const normalized = normalizeApprovalCcUsers(entries, staffs);
    if (normalized.length > 0) {
      acc[String(key)] = normalized;
    }
    return acc;
  }, {});
}

// ─────────────────────────────────────────────
// 색상/HTML 유틸
// ─────────────────────────────────────────────

// 색상 유틸은 lib/color-utils로 통합(전자결재양식관리/design-utils와 중복 제거).
export { alphaColor } from '@/lib/color-utils';

export { escapeHtml } from '@/lib/escape-html';

// ─────────────────────────────────────────────
// 날짜 유틸
// ─────────────────────────────────────────────

export function toLocalDateKey(value: string | number | Date | null | undefined) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentMonthValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getCurrentDateValue() {
  return toLocalDateKey(new Date());
}

export function getDateRangeFromMonth(monthValue: string) {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) {
    return { from: '', to: '' };
  }

  const [yearText, monthText] = monthValue.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { from: '', to: '' };
  }

  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${yearText}-${monthText}-01`,
    to: `${yearText}-${monthText}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function getDateRangeFromWeek(dateValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return { from: '', to: '' };
  }

  const [yearText, monthText, dayText] = dateValue.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return { from: '', to: '' };
  }

  const anchorDate = new Date(year, month - 1, day);
  if (Number.isNaN(anchorDate.getTime())) {
    return { from: '', to: '' };
  }

  const weekStart = new Date(anchorDate);
  weekStart.setDate(anchorDate.getDate() - 3);
  const weekEnd = new Date(anchorDate);
  weekEnd.setDate(anchorDate.getDate() + 3);

  return {
    from: toLocalDateKey(weekStart),
    to: toLocalDateKey(weekEnd),
  };
}

export function matchesCreatedDateRange(
  createdAt: string | number | Date | null | undefined,
  from: string,
  to: string
) {
  if (!from && !to) return true;
  const createdDate = toLocalDateKey(createdAt);
  if (!createdDate) return false;
  if (from && createdDate < from) return false;
  if (to && createdDate > to) return false;
  return true;
}

// ─────────────────────────────────────────────
// 폼 타입 정규화 유틸
// ─────────────────────────────────────────────

export function normalizeComposeFormType(value?: string) {
  if (!value || value === '인사명령') return '연차/휴가';
  if (value === 'attendance_fix' || value === '출결정정' || value === '출결 정정') return '출결정정';
  if (value === 'resignation' || value === '사직서') return '사직서';
  if (value === 'severance_extension_agreement' || value === '금품청산 지급기일 연장 동의서') return '금품청산 지급기일 연장 동의서';
  if (value === 'retirement_pledge' || value === '퇴직 서약서') return '퇴직 서약서';
  if (value === '휴가신청' || value === 'leave') return '연차/휴가';
  if (value === 'report' || value === '보고서작성' || value === '보고서 작성') return '보고서작성';
  if (value === 'official_document_dispatch' || value === '공문발송' || value === '공문서대장') return '공문발송';
  // 기존 라벨 '양식신청'은 '증명서발급'으로 정규화 (DB 호환성을 위한 매핑)
  if (value === '양식신청' || value === 'generic') return '증명서발급';
  return value;
}

export function normalizeApprovalCompanyToken(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, '');
}

export function matchesInventorySupportCompanyName(value: unknown) {
  return normalizeApprovalCompanyToken(value) === normalizeApprovalCompanyToken(INVENTORY_SUPPORT_COMPANY);
}

// ─────────────────────────────────────────────
// 출결정정 유틸
// ─────────────────────────────────────────────

export function isAttendanceCorrectionApprovalSchemaError(error: unknown) {
  return ['attendance_date', 'requested_at', 'approval_status', 'approved_by', 'approved_at'].some((column) =>
    isMissingColumnError(error, column)
  );
}

export async function withAttendanceCorrectionApprovalFallback<T>(
  primary: () => PromiseLike<{ data: T | null; error: unknown }>,
  fallback: () => PromiseLike<{ data: T | null; error: unknown }>
) {
  const result = await primary();
  if (isAttendanceCorrectionApprovalSchemaError(result.error)) {
    return fallback();
  }
  return result;
}

export function isAttendanceCorrectionApprovalItem(
  item: Record<string, unknown>,
  metaData: Record<string, unknown> | null | undefined
) {
  const rawType = String(item?.type || '').trim();
  const rawSlug = String(metaData?.form_slug || '').trim();
  const rawName = String(metaData?.form_name || '').trim();

  return (
    rawType === '출결정정' ||
    rawType === 'attendance_fix' ||
    rawSlug === 'attendance_fix' ||
    rawName === '출결정정' ||
    rawName === '출결 정정'
  );
}

export function resolveAttendanceCorrectionStatusPair(correctionTypeValue: string) {
  const statusMap: Record<string, { att: string; atts: string }> = {
    정상반영: { att: '정상', atts: 'present' },
    지각처리: { att: '지각', atts: 'late' },
    결근처리: { att: '결근', atts: 'absent' },
  };

  return statusMap[correctionTypeValue] || statusMap['정상반영'];
}

// ─────────────────────────────────────────────
// 커스텀 폼 타입 유틸
// ─────────────────────────────────────────────

export function sanitizeCustomFormTypes(
  rows: Array<{ name?: string; slug?: string; is_active?: boolean }> = [],
  builtInFormTypes: string[] = []
) {
  const seen = new Set<string>();

  return rows
    .filter((row) => row?.is_active !== false)
    .map((row) => ({
      name: String(row?.name || '').trim(),
      slug: String(row?.slug || '').trim(),
    }))
    .filter((row) => row.name && row.slug)
    .filter((row) => row.name !== '인사명령')
    .filter((row) => !SYSTEM_FORM_TYPE_SLUGS.has(row.slug))
    .filter((row) => !builtInFormTypes.includes(row.name))
    .filter((row) => {
      if (seen.has(row.slug)) return false;
      seen.add(row.slug);
      return true;
    });
}

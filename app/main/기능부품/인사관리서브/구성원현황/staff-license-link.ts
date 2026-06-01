// 구성원현황 ↔ staff_licenses 연동 헬퍼
// 자격안전센터(면허자격증관리.tsx)와 동일하게 staff_licenses 테이블을 단일 기준값으로 사용한다.
// 조회·그룹핑·요약만 담당하며, 화면 컴포넌트(구성원현황.tsx)는 이 함수들을 호출만 한다.
import { supabase } from '@/lib/supabase';

// staff_licenses 테이블 row 타입 (자격안전센터의 LicenseRow와 동일 컬럼 집합)
export interface StaffLicenseRow {
  id: string;
  staff_id: string;
  license_type: string | null;
  license_name: string;
  license_number: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  renewed_date: string | null;
  issuing_body: string | null;
  memo: string | null;
}

type StaffLicensesGrouped = Record<string, StaffLicenseRow[]>;

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanNullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text || null;
}

// Supabase 응답(unknown[])을 StaffLicenseRow로 좁히기. 형식이 맞지 않는 row는 제외한다.
function normalizeLicenseRow(raw: unknown): StaffLicenseRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = cleanText(record.id);
  const staffId = cleanText(record.staff_id);
  const licenseName = cleanText(record.license_name);
  if (!id || !staffId) return null;
  return {
    id,
    staff_id: staffId,
    license_type: cleanNullableText(record.license_type),
    license_name: licenseName,
    license_number: cleanNullableText(record.license_number),
    issued_date: cleanNullableText(record.issued_date),
    expiry_date: cleanNullableText(record.expiry_date),
    renewed_date: cleanNullableText(record.renewed_date),
    issuing_body: cleanNullableText(record.issuing_body),
    memo: cleanNullableText(record.memo),
  };
}

/**
 * 주어진 직원 ID 목록의 staff_licenses rows를 조회해 staff_id별로 그룹핑한다.
 * 조회 실패 시 빈 객체로 폴백한다(직원 목록 표시 자체를 막지 않기 위함 — JM3).
 */
export async function fetchStaffLicensesGrouped(
  staffIds: (string | number)[],
): Promise<StaffLicensesGrouped> {
  const normalizedIds = Array.from(
    new Set(staffIds.map((value) => String(value).toLowerCase().trim()).filter(Boolean)),
  );
  if (normalizedIds.length === 0) return {};

  try {
    const { data, error } = await supabase
      .from('staff_licenses')
      .select(
        'id, staff_id, license_type, license_name, license_number, issued_date, expiry_date, renewed_date, issuing_body, memo',
      )
      .in('staff_id', normalizedIds);

    if (error) {
      console.error('staff_licenses 조회 실패:', error);
      return {};
    }

    const grouped: StaffLicensesGrouped = {};
    for (const raw of Array.isArray(data) ? data : []) {
      const row = normalizeLicenseRow(raw);
      if (!row) continue;
      const key = row.staff_id.toLowerCase().trim();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    }
    return grouped;
  } catch (error) {
    console.error('staff_licenses 조회 중 예외:', error);
    return {};
  }
}

/**
 * 면허 rows를 한 줄 요약 문자열로 변환한다.
 * - 0건: '-'
 * - 1건: license_name
 * - N건: `${첫 번째 license_name} 외 ${N-1}건`
 */
export function summarizeLicenses(rows: StaffLicenseRow[] | undefined): string {
  if (!rows || rows.length === 0) return '-';
  const first = cleanText(rows[0]?.license_name) || '(이름 없음)';
  if (rows.length === 1) return first;
  return `${first} 외 ${rows.length - 1}건`;
}

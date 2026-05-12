/**
 * 직원(staff_members) 공용 페처
 *
 * 여러 화면에서 staff_members 전체 조회가 반복되므로 fetcher 위에서 dedup·캐시.
 * 컬럼 셋은 화면별로 다르므로 가장 흔한 "기본 정보" 셋을 우선 헬퍼화.
 * 다른 컬럼이 필요한 경우 별도 헬퍼를 추가하거나 select 인자를 받는 형태로 확장.
 */

import { fetcher } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';

const STAFF_TTL = 300_000; // 5분 — 직원 정보 변경 빈도 낮음

export type StaffBasic = {
  id: string;
  name: string;
  position?: string | null;
  department?: string | null;
  company?: string | null;
};

/**
 * 직원 기본 정보(id·이름·직급·부서·회사) 전체 목록.
 */
export async function fetchStaffsBasic(): Promise<StaffBasic[]> {
  return fetcher(
    'staff:basic:all',
    async () => {
      const { data } = await supabase
        .from('staff_members')
        .select('id, name, position, department, company');
      return (data ?? []) as StaffBasic[];
    },
    { ttl: STAFF_TTL },
  );
}

/**
 * audit_logs에서 user_id → user_name 매핑을 조회.
 * 퇴직 등으로 staff_members에 없는 user_id의 historic 이름 복원용.
 */
export async function fetchHistoricalStaffNames(
  unresolvedIds: string[],
): Promise<Record<string, string>> {
  if (!unresolvedIds.length) return {};
  const sortedKey = [...unresolvedIds].sort().join(',');
  return fetcher(
    `staff:historical-names:${sortedKey}`,
    async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('user_id, user_name, created_at')
        .in('user_id', unresolvedIds)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const nextMap: Record<string, string> = {};
      for (const row of data ?? []) {
        const userId = typeof row.user_id === 'string' ? row.user_id.trim() : '';
        const userName = typeof row.user_name === 'string' ? row.user_name.trim() : '';
        if (!userId || !userName || nextMap[userId]) continue;
        nextMap[userId] = userName;
      }
      return nextMap;
    },
    { ttl: STAFF_TTL },
  );
}

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

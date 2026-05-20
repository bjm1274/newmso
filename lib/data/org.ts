/**
 * 조직(회사·팀) 데이터 페처
 *
 * - 회사 목록과 팀 목록은 변경 빈도가 낮고 여러 화면에서 반복 호출되므로
 *   fetcher 위에서 5분 TTL + dedup 적용이 효과적
 * - 팀 추가/삭제 같은 mutation 후에는 invalidateOrgTeams로 캐시 무효화 필수
 */

import { eq } from 'drizzle-orm';
import { fetcher, invalidateCache } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';
import {
  getD1Binding,
  getD1Drizzle,
  org_teams as orgTeamsTable,
} from '@/lib/db';

const ORG_TTL = 300_000; // 5분

/**
 * 사용 가능한 회사명 목록.
 * 1순위: companies 테이블의 is_active=true 행
 * 2순위(폴백): staff_members에 등록된 distinct company
 */
export async function fetchCompanyOptions(): Promise<string[]> {
  return fetcher(
    'org:companies:options',
    async () => {
      const { data: companyRows, error } = await supabase
        .from('companies')
        .select('name, is_active')
        .eq('is_active', true)
        .order('name');

      if (!error && companyRows && companyRows.length > 0) {
        return companyRows
          .map((row) => row.name as string | null)
          .filter((name): name is string => Boolean(name));
      }

      const { data: staffRows } = await supabase
        .from('staff_members')
        .select('company');
      const names = Array.from(
        new Set(
          (staffRows ?? [])
            .map((row) => row.company as string | null)
            .filter((name): name is string => Boolean(name)),
        ),
      );
      return names.sort();
    },
    { ttl: ORG_TTL },
  );
}

export type OrgTeam = {
  id: string;
  company_name: string;
  division: string;
  team_name: string;
  sort_order: number | null;
};

/**
 * 회사별 팀 목록. division, sort_order 순으로 정렬.
 */
export async function fetchOrgTeams(company: string): Promise<OrgTeam[]> {
  if (!company) return [];
  return fetcher(
    `org:teams:${company}`,
    async () => {
      const { data } = await supabase
        .from('org_teams')
        .select('*')
        .eq('company_name', company)
        .order('division')
        .order('sort_order');
      return (data ?? []) as OrgTeam[];
    },
    { ttl: ORG_TTL },
  );
}

/**
 * 팀 mutation(insert/update/delete) 후 호출.
 * company가 명시되면 해당 회사만, 없으면 모든 org:teams 캐시를 무효화.
 */
export function invalidateOrgTeams(company?: string): void {
  if (company) {
    invalidateCache(`org:teams:${company}`);
    return;
  }
  invalidateCache(/^org:teams:/);
}

export type OrgTeamCreateInput = {
  company_name: string;
  division: string;
  team_name: string;
  sort_order: number;
};

async function requireOrgD1() {
  const d1 = await getD1Binding();
  if (!d1) {
    throw new Error('[org] D1 binding not available');
  }
  return getD1Drizzle(d1);
}

/**
 * 팀 생성. 성공 시 해당 회사의 org:teams 캐시 자동 무효화.
 */
export async function createOrgTeam(input: OrgTeamCreateInput): Promise<{ error: Error | null }> {
  try {
    // 클라이언트(브라우저)는 D1 binding 접근 불가 → compat supabase 경유
    if (typeof window !== 'undefined') {
      const { supabase: sb } = await import('@/lib/supabase');
      const { error } = await sb.from('org_teams').insert({
        id: crypto.randomUUID(),
        company_name: input.company_name,
        division: input.division,
        team_name: input.team_name,
        sort_order: input.sort_order,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      invalidateOrgTeams(input.company_name);
      return { error: null };
    }
    // 서버: D1 binding 직접 사용
    const db = await requireOrgD1();
    await db.insert(orgTeamsTable).values({
      id: crypto.randomUUID(),
      company_name: input.company_name,
      division: input.division,
      team_name: input.team_name,
      sort_order: input.sort_order,
      created_at: new Date().toISOString(),
    });
    invalidateOrgTeams(input.company_name);
    return { error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { error };
  }
}

/**
 * 팀 삭제. company가 주어지면 캐시 무효화 범위를 좁힘.
 */
export async function deleteOrgTeam(id: string, company?: string): Promise<{ error: Error | null }> {
  try {
    // 클라이언트(브라우저)는 D1 binding 접근 불가 → compat supabase 경유
    if (typeof window !== 'undefined') {
      const { supabase: sb } = await import('@/lib/supabase');
      const { error } = await sb.from('org_teams').delete().eq('id', id);
      if (error) throw error;
      invalidateOrgTeams(company);
      return { error: null };
    }
    // 서버: D1 binding 직접 사용
    const db = await requireOrgD1();
    await db.delete(orgTeamsTable).where(eq(orgTeamsTable.id, id));
    invalidateOrgTeams(company);
    return { error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { error };
  }
}

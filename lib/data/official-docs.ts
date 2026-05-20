/**
 * 공문서 발송대장 데이터 페처
 *
 * 발송대장은 mutation 빈도가 있어 TTL은 짧게(1분).
 * 모든 mutation은 invalidateOfficialDocs로 자동 캐시 무효화.
 *
 * approvals는 워크플로우 변환 로직과 결합되어 있으므로 raw row 형태로만 반환,
 * 가공은 컴포넌트에 위임.
 */

import { eq } from 'drizzle-orm';
import { fetcher, invalidateCache } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';
import {
  getD1Binding,
  getD1Drizzle,
  official_doc_log as officialDocLogTable,
} from '@/lib/db';

const DOC_TTL = 60_000; // 1분

export type OfficialDocRow = {
  id: number;
  sent_date?: string | null;
  doc_number?: string | null;
  title?: string | null;
  recipient?: string | null;
  manager?: string | null;
  is_received?: boolean | null;
  note?: string | null;
  company?: string | null;
  [key: string]: unknown;
};

export type ApprovalSnapshotRow = {
  id: string;
  status?: string | null;
  title?: string | null;
  created_at?: string | null;
  sender_name?: string | null;
  current_approver_id?: string | null;
  doc_number?: string | null;
  meta_data?: unknown;
};

export async function fetchOfficialDocs(): Promise<OfficialDocRow[]> {
  return fetcher(
    'official-docs:list',
    async () => {
      const { data, error } = await supabase
        .from('official_doc_log')
        .select('*')
        .order('sent_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OfficialDocRow[];
    },
    { ttl: DOC_TTL },
  );
}

export async function fetchRecentApprovalsForOfficial(limit = 200): Promise<ApprovalSnapshotRow[]> {
  return fetcher(
    `official-docs:approvals:recent:${limit}`,
    async () => {
      const { data, error } = await supabase
        .from('approvals')
        .select('id, status, title, created_at, sender_name, current_approver_id, doc_number, meta_data')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as ApprovalSnapshotRow[];
    },
    { ttl: DOC_TTL },
  );
}

export function invalidateOfficialDocs(): void {
  invalidateCache(/^official-docs:/);
}

// official_doc_log D1 컬럼 매핑 — is_received boolean → 0|1, 정의된 컬럼만 통과
type OfficialDocLogUpdateSet = Partial<typeof officialDocLogTable.$inferInsert>;

function buildOfficialDocLogUpdateSet(
  payload: Partial<OfficialDocRow>,
): OfficialDocLogUpdateSet {
  const set: OfficialDocLogUpdateSet = {};
  if (payload.sent_date !== undefined) set.sent_date = payload.sent_date ?? '';
  if (payload.doc_number !== undefined) set.doc_number = payload.doc_number ?? '';
  if (payload.title !== undefined) set.title = payload.title ?? '';
  if (payload.recipient !== undefined) set.recipient = payload.recipient ?? '';
  if (payload.manager !== undefined) set.manager = payload.manager ?? '';
  if (payload.is_received !== undefined) {
    set.is_received = payload.is_received ? 1 : 0;
  }
  if (payload.note !== undefined) set.note = payload.note ?? '';
  if (payload.company !== undefined) set.company = payload.company ?? '';
  return set;
}

async function requireOfficialDocsD1() {
  const d1 = await getD1Binding();
  if (!d1) {
    throw new Error('[official-docs] D1 binding not available');
  }
  return getD1Drizzle(d1);
}

export async function updateOfficialDoc(
  id: number,
  payload: Partial<OfficialDocRow>,
): Promise<{ error: Error | null }> {
  try {
    const set = buildOfficialDocLogUpdateSet(payload);
    if (Object.keys(set).length === 0) {
      invalidateOfficialDocs();
      return { error: null };
    }
    // 클라이언트(브라우저)는 D1 binding 접근 불가 → compat supabase 경유
    if (typeof window !== 'undefined') {
      const { supabase: sb } = await import('@/lib/supabase');
      // is_received는 supabase에서 boolean, D1에서 0|1 — 클라이언트는 boolean 그대로 전달
      const clientPayload: Record<string, unknown> = { ...payload };
      const { error } = await sb.from('official_doc_log').update(clientPayload).eq('id', id);
      if (error) throw error;
      invalidateOfficialDocs();
      return { error: null };
    }
    // 서버: D1 binding 직접 사용
    const db = await requireOfficialDocsD1();
    await db.update(officialDocLogTable).set(set).where(eq(officialDocLogTable.id, id));
    invalidateOfficialDocs();
    return { error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { error };
  }
}

export async function deleteOfficialDoc(id: number): Promise<{ error: Error | null }> {
  try {
    // 클라이언트(브라우저)는 D1 binding 접근 불가 → compat supabase 경유
    if (typeof window !== 'undefined') {
      const { supabase: sb } = await import('@/lib/supabase');
      const { error } = await sb.from('official_doc_log').delete().eq('id', id);
      if (error) throw error;
      invalidateOfficialDocs();
      return { error: null };
    }
    // 서버: D1 binding 직접 사용
    const db = await requireOfficialDocsD1();
    await db.delete(officialDocLogTable).where(eq(officialDocLogTable.id, id));
    invalidateOfficialDocs();
    return { error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { error };
  }
}

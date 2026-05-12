/**
 * 공문서 발송대장 데이터 페처
 *
 * 발송대장은 mutation 빈도가 있어 TTL은 짧게(1분).
 * 모든 mutation은 invalidateOfficialDocs로 자동 캐시 무효화.
 *
 * approvals는 워크플로우 변환 로직과 결합되어 있으므로 raw row 형태로만 반환,
 * 가공은 컴포넌트에 위임.
 */

import { fetcher, invalidateCache } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';

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

export async function updateOfficialDoc(
  id: number,
  payload: Partial<OfficialDocRow>,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('official_doc_log').update(payload).eq('id', id);
  if (!error) invalidateOfficialDocs();
  return { error: error as Error | null };
}

export async function deleteOfficialDoc(id: number): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('official_doc_log').delete().eq('id', id);
  if (!error) invalidateOfficialDocs();
  return { error: error as Error | null };
}

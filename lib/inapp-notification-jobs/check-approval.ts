/**
 * Phase 8-A — 결재 차례 도래 알림 보강.
 * approvals where status='대기' AND current_approver_id IS NOT NULL
 *   → current_approver_id 에게 'approval' 타입 알림 생성.
 * dedupe key: `approval:{approval_id}:{approver_id}`
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type CheckJobResult,
  type NotificationInsertRow,
  emptyResult,
  errorMessage,
  loadExistingDedupeKeys,
  insertNotificationsChunked,
} from './types';

type ApprovalRow = {
  id: string;
  current_approver_id: string | null;
  title: string | null;
  sender_name: string | null;
  doc_type: string | null;
  type: string | null;
};

export async function checkApprovalQueue(supabase: SupabaseClient): Promise<CheckJobResult> {
  const { data, error } = await supabase
    .from('approvals')
    .select('id, current_approver_id, title, sender_name, doc_type, type')
    .eq('status', '대기')
    .not('current_approver_id', 'is', null)
    .limit(500);
  if (error) return { detected: 0, created: 0, errors: [error.message] };

  const rows = (data ?? []) as ApprovalRow[];
  if (rows.length === 0) return emptyResult();

  const userIds = Array.from(
    new Set(rows.map((r) => String(r.current_approver_id ?? '')).filter(Boolean)),
  );
  let sentKeys: Set<string>;
  try {
    sentKeys = await loadExistingDedupeKeys(supabase, 'approval', userIds);
  } catch (err) {
    return { detected: rows.length, created: 0, errors: [errorMessage(err)] };
  }

  const toInsert: NotificationInsertRow[] = [];
  for (const row of rows) {
    const approverId = String(row.current_approver_id ?? '');
    if (!approverId) continue;
    const dedupeKey = `approval:${row.id}:${approverId}`;
    if (sentKeys.has(`${approverId}|${dedupeKey}`)) continue;

    const docLabel = row.doc_type || row.type || '결재';
    const senderText = row.sender_name ? ` (${row.sender_name})` : '';
    toInsert.push({
      user_id: approverId,
      type: 'approval',
      title: `결재 차례입니다 — ${docLabel}`,
      body: `${row.title || '제목 없음'}${senderText} 결재가 대기 중입니다.`,
      metadata: {
        type: 'approval',
        approval_id: row.id,
        dedupe_key: dedupeKey,
      },
      read_at: null,
    });
  }

  if (toInsert.length === 0) {
    return { detected: rows.length, created: 0, errors: [] };
  }
  const { created, errors } = await insertNotificationsChunked(supabase, toInsert);
  return { detected: rows.length, created, errors };
}

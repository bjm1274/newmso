import type { SupabaseClient } from '@supabase/supabase-js';
import { getKoreanTodayString } from '@/lib/seoul-time';
import {
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  official_doc_log as officialDocLogTable,
  like,
  count,
  sql,
} from '@/lib/db';

export type OfficialDocRequest = {
  sent_date: string;
  doc_number: string;
  title: string;
  recipient: string;
  manager: string;
  is_received: boolean;
  note: string;
  company: string;
};

function getTodayDateKey() {
  return getKoreanTodayString();
}

export function extractOfficialDocRequest(metaData: unknown): OfficialDocRequest | null {
  if (!metaData || typeof metaData !== 'object') return null;
  const request =
    (metaData as Record<string, unknown>).official_doc_request &&
    typeof (metaData as Record<string, unknown>).official_doc_request === 'object'
      ? ((metaData as Record<string, unknown>).official_doc_request as Record<string, unknown>)
      : null;

  if (!request) return null;

  const title = String(request.title || '').trim();
  const recipient = String(request.recipient || '').trim();
  if (!title || !recipient) return null;

  return {
    sent_date: String(request.sent_date || '').slice(0, 10) || getTodayDateKey(),
    doc_number: String(request.doc_number || '').trim(),
    title,
    recipient,
    manager: String(request.manager || '').trim(),
    is_received: request.is_received === true,
    note: String(request.note || '').trim(),
    company: String(request.company || '').trim(),
  };
}

export function buildOfficialDocumentApprovalContent(request: OfficialDocRequest) {
  return [
    '[공문 발송 승인 요청]',
    '',
    `발송 예정일: ${request.sent_date || '-'}`,
    `문서번호: ${request.doc_number || '자동 채번'}`,
    `수신처: ${request.recipient || '-'}`,
    `담당자: ${request.manager || '-'}`,
    `법인: ${request.company || '-'}`,
    '',
    '제목',
    request.title || '-',
    '',
    '비고',
    request.note || '-',
  ].join('\n');
}

async function issueOfficialDocNumber(supabase: SupabaseClient, sentDate: string) {
  const baseDate = /^\d{4}-\d{2}-\d{2}$/.test(sentDate) ? new Date(sentDate) : new Date();
  const year = baseDate.getFullYear();
  const month = String(baseDate.getMonth() + 1).padStart(2, '0');
  const prefix = `공문-${year}${month}`;

  const backend = await resolveDataBackend();
  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[official-document-approval] D1 binding not available (issueOfficialDocNumber)');
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({ cnt: count() })
      .from(officialDocLogTable)
      .where(like(officialDocLogTable.doc_number, `${prefix}%`));
    const existingCount = Number(rows[0]?.cnt ?? 0);
    const sequence = String(existingCount + 1).padStart(3, '0');
    return `${prefix}-${sequence}`;
  }

  const { count: existingCount, error } = await supabase
    .from('official_doc_log')
    .select('*', { count: 'exact', head: true })
    .like('doc_number', `${prefix}%`);

  if (error) throw error;

  const sequence = String((existingCount ?? 0) + 1).padStart(3, '0');
  return `${prefix}-${sequence}`;
}

function buildOfficialDocNote(baseNote: string, approval: Record<string, unknown>) {
  const traceLine = `전자결재 승인 ${String(approval.doc_number || approval.id || '').trim() || '-'}`;
  if (!baseNote) return traceLine;
  if (baseNote.includes(traceLine)) return baseNote;
  return `${baseNote}\n${traceLine}`;
}

export async function syncOfficialDocumentLogFromApproval(
  supabase: SupabaseClient,
  approval: Record<string, unknown>,
) {
  const metaData =
    approval?.meta_data && typeof approval.meta_data === 'object'
      ? (approval.meta_data as Record<string, unknown>)
      : null;
  const request = extractOfficialDocRequest(metaData);

  if (!request) {
    return null;
  }

  const docNumber = request.doc_number || await issueOfficialDocNumber(supabase, request.sent_date);
  const payload = {
    sent_date: request.sent_date || getTodayDateKey(),
    doc_number: docNumber,
    title: request.title,
    recipient: request.recipient,
    manager: request.manager || String(approval.sender_name || '').trim(),
    is_received: false,
    note: buildOfficialDocNote(request.note, approval),
    company: request.company || String(approval.sender_company || '').trim(),
  };

  // D1 직접 INSERT — is_received boolean → 0|1, id는 INTEGER PK rowid 자동
  const d1 = await getD1Binding();
  if (!d1) {
    throw new Error('[official-document-approval] D1 binding not available');
  }
  const db = getD1Drizzle(d1);
  await db.insert(officialDocLogTable).values({
    sent_date: payload.sent_date,
    doc_number: payload.doc_number,
    title: payload.title,
    recipient: payload.recipient,
    manager: payload.manager,
    is_received: payload.is_received ? 1 : 0,
    note: payload.note,
    company: payload.company,
    created_at: new Date().toISOString(),
  });

  return payload;
}

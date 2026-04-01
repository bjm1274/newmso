import type { SupabaseClient } from '@supabase/supabase-js';

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
  return new Date().toISOString().slice(0, 10);
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

  const { count, error } = await supabase
    .from('official_doc_log')
    .select('*', { count: 'exact', head: true })
    .like('doc_number', `${prefix}%`);

  if (error) throw error;

  const sequence = String((count ?? 0) + 1).padStart(3, '0');
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

  const { error } = await supabase.from('official_doc_log').insert([payload]);
  if (error) throw error;

  return payload;
}

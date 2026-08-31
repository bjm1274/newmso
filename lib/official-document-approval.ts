import 'server-only';
export * from '@/lib/official-document-shared';
import { extractOfficialDocRequest, type OfficialDocRequest } from '@/lib/official-document-shared';
import { getKoreanTodayString } from '@/lib/seoul-time';

async function issueOfficialDocNumber(sentDate: string) {
  const baseDate = /^\d{4}-\d{2}-\d{2}$/.test(sentDate) ? new Date(sentDate) : new Date();
  const year = baseDate.getFullYear();
  const month = String(baseDate.getMonth() + 1).padStart(2, '0');
  const prefix = `공문-${year}${month}`;

  const { getD1Binding, getD1Drizzle, official_doc_log, like, count } = await import('@/lib/db');
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[official-document-approval] D1 binding not available (issueOfficialDocNumber)');
  const db = getD1Drizzle(d1);
  const rows = await db
    .select({ cnt: count() })
    .from(official_doc_log)
    .where(like(official_doc_log.doc_number, `${prefix}%`));
  const existingCount = Number(rows[0]?.cnt ?? 0);
  const sequence = String(existingCount + 1).padStart(3, '0');
  return `${prefix}-${sequence}`;
}

function buildOfficialDocNote(requestNote: string, approval: Record<string, unknown>) {
  const sender = String(approval.sender_name || '').trim();
  const title = String(approval.title || '').trim();
  const base = requestNote || `전자결재 연동 공문 (${title})`;
  return sender ? `${base} [기안: ${sender}]` : base;
}

export async function createOfficialDocFromApproval(approval: Record<string, unknown>) {
  const metaData =
    approval?.meta_data && typeof approval.meta_data === 'object'
      ? (approval.meta_data as Record<string, unknown>)
      : null;
  const request = extractOfficialDocRequest(metaData);

  if (!request) {
    return null;
  }

  const docNumber = request.doc_number || await issueOfficialDocNumber(request.sent_date);
  const payload = {
    sent_date: request.sent_date || getKoreanTodayString(),
    doc_number: docNumber,
    title: request.title,
    recipient: request.recipient,
    manager: request.manager || String(approval.sender_name || '').trim(),
    is_received: false,
    note: buildOfficialDocNote(request.note, approval),
    company: request.company || String(approval.sender_company || '').trim() };

  // D1 직접 INSERT — is_received boolean → 0|1, id는 INTEGER PK rowid 자동
  const { getD1Binding, getD1Drizzle, official_doc_log } = await import('@/lib/db');
  const d1 = await getD1Binding();
  if (!d1) {
    throw new Error('[official-document-approval] D1 binding not available');
  }
  const db = getD1Drizzle(d1);
  await db.insert(official_doc_log).values({
    sent_date: payload.sent_date,
    doc_number: payload.doc_number,
    title: payload.title,
    recipient: payload.recipient,
    manager: payload.manager,
    is_received: payload.is_received ? 1 : 0,
    note: payload.note,
    company: payload.company,
    created_at: new Date().toISOString() });

  return payload;
}

export { createOfficialDocFromApproval as syncOfficialDocumentLogFromApproval };

import { getKoreanTodayString } from '@/lib/seoul-time';

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

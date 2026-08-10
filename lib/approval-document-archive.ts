import {
  getReportApprovalSummary,
  normalizeApprovalAttachments } from './approval-report-utils';
import {
  getD1Binding,
  getD1Drizzle,
  document_repository as documentRepositoryTable,
  eq,
  desc } from '@/lib/db';
import { resolveApprovalDocCategory } from '@/lib/document-repository-categories';
import { formatKoreanDateTime } from '@/lib/date-formatter';

type ApprovalArchiveSource = Record<string, unknown>;

/** meta_data에서 안전하게 파싱 (JSON 문자열 가능성 대응) */
function safeParseMetaData(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // 파싱 실패 시 빈 객체 반환
    }
  }
  return {};
}

/** 알려진 내부 키 목록 — 본문 직렬화에서 제외 */
const EXCLUDED_META_KEYS = new Set([
  'form_slug', 'form_name', 'cc_departments', 'cc_users',
  'approver_line', 'approver_line_details', 'doc_number', 'revision',
  'source_approval_id', 'previous_doc_number', 'superseded_by',
  'approval_history', 'request_category', 'inventory_source_department',
  'unregistered_item_names', 'attachments',
  'report_type_label',
]);

/** 알려진 양식 필드 라벨 매핑 */
const FIELD_LABEL_MAP: Record<string, string> = {
  reason: '사유',
  vType: '휴가종류',
  leaveType: '휴가종류',
  startDate: '시작일',
  endDate: '종료일',
  planDates: '연차계획',
  delegateName: '업무대리자',
  delegateDepartment: '대리자 부서',
  delegatePosition: '대리자 직책',
  items: '물품목록',
  location: '장소',
  official_doc_request: '공문요청내용',
  correctionDate: '정정일자',
  correctionType: '정정유형',
  originalTime: '원래시간',
  correctedTime: '정정시간' };

/** 단일 값을 plain text로 직렬화 */
function serializeFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    // 물품목록 등 객체 배열 처리
    const lines = value
      .map((entry, idx) => {
        if (!entry || typeof entry !== 'object') return String(entry ?? '');
        const obj = entry as Record<string, unknown>;
        const parts: string[] = [];
        if (obj.name || obj.item_name) parts.push(String(obj.name || obj.item_name || ''));
        if (obj.qty !== undefined || obj.quantity !== undefined) {
          const qty = obj.qty ?? obj.quantity;
          const unit = obj.unit ? ` ${String(obj.unit)}` : '';
          parts.push(`${String(qty)}${unit}`);
        }
        if (obj.category) parts.push(String(obj.category));
        if (obj.purpose) parts.push(`용도: ${String(obj.purpose)}`);
        if (obj.dept) parts.push(`부서: ${String(obj.dept)}`);
        // 날짜/사유 형식 (연차계획서)
        if (obj.date && !obj.name) parts.push(String(obj.date));
        if (obj.reason && !obj.name) parts.push(`사유: ${String(obj.reason)}`);
        if (parts.length > 0) return `  ${idx + 1}. ${parts.join(' | ')}`;
        return `  ${idx + 1}. ${JSON.stringify(entry)}`;
      })
      .filter(Boolean);
    return lines.join('\n');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/** meta_data에서 양식 필드를 "라벨: 값" 줄바꿈 형태로 직렬화 */
function serializeFormFields(metaData: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(metaData)) {
    if (EXCLUDED_META_KEYS.has(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    const serialized = serializeFieldValue(value);
    if (!serialized) continue;
    const label = FIELD_LABEL_MAP[key] ?? key;
    lines.push(`${label}: ${serialized}`);
  }
  return lines.join('\n');
}

function formatApprovalArchiveDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  // KST 고정 — timeZone 없이 부르면 서버(Workers=UTC)에서 만든 문서보관함
  // 날짜가 9시간 이르게 박힌다.
  return formatKoreanDateTime(raw) || raw;
}

function resolveApprovalDocNumber(item: ApprovalArchiveSource) {
  const metaData = safeParseMetaData(item.meta_data);
  return String(item.doc_number || metaData.doc_number || '').trim();
}

function resolveApprovalCategory(item: ApprovalArchiveSource) {
  // 양식별 개별 분류 (물품신청·수리요청서·연차/휴가 …) + 시스템 문서(연차촉진 등)
  const meta = safeParseMetaData(item.meta_data);
  return resolveApprovalDocCategory({
    type: String(item.type || '').trim() || null,
    title: String(item.title || '').trim() || null,
    formSlug: String(meta.form_slug || '').trim() || null,
    formName: String(meta.form_name || '').trim() || null,
  });
}

function buildApprovalArchiveContent(item: ApprovalArchiveSource) {
  const metaData = safeParseMetaData(item.meta_data);
  const reportSummary = getReportApprovalSummary(metaData);
  const attachments = normalizeApprovalAttachments(metaData.attachments);
  const ccUsers = Array.isArray(metaData.cc_users)
    ? metaData.cc_users
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return '';
          return String((entry as Record<string, unknown>).name || '').trim();
        })
        .filter(Boolean)
    : [];

  const headerLines = [
    `문서번호: ${resolveApprovalDocNumber(item) || '-'}`,
    `문서종류: ${String(item.type || metaData.form_name || '-').trim() || '-'}`,
    `기안자: ${String(item.sender_name || '-').trim() || '-'}`,
    `기안일시: ${formatApprovalArchiveDate(item.created_at)}`,
  ];

  if (ccUsers.length > 0) {
    headerLines.push(`참조자: ${ccUsers.join(', ')}`);
  }

  if (reportSummary.reportTypeLabel) {
    headerLines.push(`보고서종류: ${reportSummary.reportTypeLabel}`);
  }
  if (reportSummary.reportMonthLabel) {
    headerLines.push(`대상월: ${reportSummary.reportMonthLabel}`);
  }
  if (reportSummary.reportPeriodLabel) {
    headerLines.push(`보고기간: ${reportSummary.reportPeriodLabel}`);
  }
  if (reportSummary.reportTargetDateLabel) {
    headerLines.push(`보고일자: ${reportSummary.reportTargetDateLabel}`);
  }
  if (reportSummary.incidentDateLabel) {
    headerLines.push(`사건발생일: ${reportSummary.incidentDateLabel}`);
  }
  if (reportSummary.incidentLocation) {
    headerLines.push(`발생장소: ${reportSummary.incidentLocation}`);
  }
  if (reportSummary.tripDateLabel) {
    headerLines.push(`출장기간: ${reportSummary.tripDateLabel}`);
  }
  if (reportSummary.tripDestination) {
    headerLines.push(`출장지: ${reportSummary.tripDestination}`);
  }
  if (reportSummary.tripPurpose) {
    headerLines.push(`출장목적: ${reportSummary.tripPurpose}`);
  }
  if (reportSummary.relatedDepartment) {
    headerLines.push(`관련부서: ${reportSummary.relatedDepartment}`);
  }
  if (attachments.length > 0) {
    headerLines.push(`첨부파일: ${attachments.map((attachment) => attachment.name).join(', ')}`);
  }

  const rawBody = String(item.content || '').trim();
  const serializedFields = serializeFormFields(metaData);
  const body =
    rawBody && serializedFields
      ? `${rawBody}\n\n[상세 신청 정보]\n${serializedFields}`
      : rawBody || serializedFields;
  return `${headerLines.join('\n')}\n\n${body}`.trim();
}

/** 결재 문서를 문서보관함에 담을 때 쓰는 결정적 키. */
function buildApprovalArchiveId(approvalId: unknown) {
  const normalized = String(approvalId || '').trim();
  return normalized ? `approval-${normalized}` : '';
}

export type ParsedArchivedContent = {
  docNumber?: string;
  docType?: string;
  sender?: string;
  draftedAt?: string;
  ccUsers?: string;
  extraMeta?: Record<string, string>;
  body: string;
};

const META_LABEL_PATTERNS: Array<{ key: keyof Omit<ParsedArchivedContent, 'body' | 'extraMeta'>; pattern: RegExp }> = [
  { key: 'docNumber', pattern: /^문서번호:\s*(.+)$/ },
  { key: 'docType',   pattern: /^문서종류:\s*(.+)$/ },
  { key: 'sender',    pattern: /^기안자:\s*(.+)$/ },
  { key: 'draftedAt', pattern: /^기안일시:\s*(.+)$/ },
  { key: 'ccUsers',   pattern: /^참조자:\s*(.+)$/ },
];

const EXTRA_META_LABELS = ['보고서종류', '대상월', '보고기간', '보고일자', '사건발생일', '발생장소', '출장기간', '출장지', '출장목적', '관련부서', '첨부파일'];

/**
 * buildApprovalArchiveContent 결과물을 파싱.
 * 첫 블록(헤더 라인들)에서 메타 필드를 추출하고 빈 줄 이후를 body로 반환.
 * 메타 라벨이 하나도 없으면 전체를 body로 반환 (구버전 데이터 대응).
 */
export function parseArchivedContent(raw: string): ParsedArchivedContent {
  const lines = raw.split(/\r?\n/);
  const result: ParsedArchivedContent = { body: '' };
  const extraMeta: Record<string, string> = {};

  let bodyStartIdx = 0;
  let foundMeta = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 빈 줄이면 헤더 블록 종료 — 이후가 body
    if (line.trim() === '') {
      if (foundMeta) {
        bodyStartIdx = i + 1;
        break;
      }
      continue;
    }

    let matched = false;
    for (const { key, pattern } of META_LABEL_PATTERNS) {
      const m = line.match(pattern);
      if (m) {
        result[key] = m[1].trim();
        foundMeta = true;
        matched = true;
        break;
      }
    }

    if (!matched && foundMeta) {
      // 알려진 추가 메타 라벨 처리
      const extraMatch = line.match(/^([^:]+):\s*(.+)$/);
      if (extraMatch && EXTRA_META_LABELS.includes(extraMatch[1].trim())) {
        extraMeta[extraMatch[1].trim()] = extraMatch[2].trim();
      } else {
        // 메타 라벨이 아닌 라인 — body 시작
        bodyStartIdx = i;
        break;
      }
    }
  }

  if (Object.keys(extraMeta).length > 0) {
    result.extraMeta = extraMeta;
  }

  result.body = lines.slice(bodyStartIdx).join('\n').trim();

  // 메타 필드를 하나도 못 찾으면 전체를 body로
  if (!foundMeta) {
    result.body = raw.trim();
  }

  return result;
}

export function extractApprovalDocNumberFromDocument(doc: Record<string, unknown>) {
  const content = String(doc.content || '');
  const match = content.match(/문서번호:\s*([^\n\r]+)/);
  return match?.[1]?.trim() || '';
}

export function mapApprovalToDocumentRepositoryEntry(item: ApprovalArchiveSource) {
  return {
    id: buildApprovalArchiveId(item.id) || `approval-${String(item.id || '')}`,
    title: String(item.title || '').trim() || '전자결재 문서',
    category: resolveApprovalCategory(item),
    content: buildApprovalArchiveContent(item),
    file_url: null,
    version: 1,
    company_name: String(item.sender_company || '').trim() || '전체',
    created_by: item.sender_id || null,
    created_at: item.created_at || null,
    updated_at: item.updated_at || item.created_at || null,
    source_type: 'approval',
    read_only: true,
    approval_id: item.id || null,
    approval_type: item.type || null };
}

export async function syncApprovalToDocumentRepository(
  item: ApprovalArchiveSource,
) {
  if (typeof window !== 'undefined') {
    return;
  }
  const title = String(item.title || '').trim();
  if (!title) return;

  const nextRow = {
    title,
    category: resolveApprovalCategory(item),
    content: buildApprovalArchiveContent(item),
    file_url: null as string | null,
    version: 1,
    company_name: String(item.sender_company || '').trim() || '전체',
    created_by: (item.sender_id as string | null) || null };

  const docNumber = resolveApprovalDocNumber(item);
  const companyName = nextRow.company_name;

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[approval-document-archive] D1 binding not available (syncApprovalToDocumentRepository)');
  const db = getD1Drizzle(d1);

  /**
   * 보관 대상 행은 결재 id 로 결정된다.
   *
   * 예전에는 document_repository 를 updated_at 내림차순 300건만 훑은 뒤,
   * 문서번호가 없으면 **제목 + 기안자 + 회사** 가 같다는 이유로 기존 행의 content 를
   * 통째로 덮어썼다. 그래서 같은 사람이 같은 제목으로 반복 기안하는 문서
   * (주간업무보고 등)는 서로를 덮어써 과거 결재 본문이 사라졌고, 반대로 보관함이
   * 300건을 넘어가면 같은 문서가 중복 저장됐다.
   * 이제 `approval-<id>` 를 기본키로 단건 조회해 upsert 한다. 문서번호 매칭은
   * 그 키가 없던 시절에 만들어진 옛 행을 흡수하기 위한 폴백으로만 남긴다.
   */
  const archiveId = buildApprovalArchiveId(item.id);
  const now = new Date().toISOString();

  if (archiveId) {
    const ownRows = await db
      .select()
      .from(documentRepositoryTable)
      .where(eq(documentRepositoryTable.id, archiveId))
      .limit(1);
    const ownDoc = ownRows[0] as Record<string, unknown> | undefined;
    if (ownDoc?.id) {
      await db
        .update(documentRepositoryTable)
        .set({
          ...nextRow,
          updated_at: now,
          version: Number(ownDoc.version) || 1,
          file_url: (ownDoc.file_url as string | null) || null })
        .where(eq(documentRepositoryTable.id, archiveId));
      return archiveId;
    }
  }

  let matchedDoc: Record<string, unknown> | undefined;
  if (docNumber) {
    const baseQuery = db
      .select()
      .from(documentRepositoryTable)
      .orderBy(desc(documentRepositoryTable.updated_at))
      .limit(300);

    const existingDocs = companyName && companyName !== '전체'
      ? await baseQuery.where(eq(documentRepositoryTable.company_name, companyName))
      : await baseQuery;

    matchedDoc = (existingDocs || []).find((doc) => {
      const archivedDocNumber = extractApprovalDocNumberFromDocument(doc as Record<string, unknown>);
      return Boolean(archivedDocNumber) && archivedDocNumber === docNumber;
    }) as Record<string, unknown> | undefined;
  }

  if (matchedDoc?.id) {
    const currentVersion = Number(matchedDoc.version) || 1;
    await db
      .update(documentRepositoryTable)
      .set({
        ...nextRow,
        updated_at: now,
        version: currentVersion,
        file_url: (matchedDoc.file_url as string | null) || null })
      .where(eq(documentRepositoryTable.id, String(matchedDoc.id)));
    return matchedDoc.id;
  }

  const newId = archiveId || crypto.randomUUID();
  await db.insert(documentRepositoryTable).values({
    id: newId,
    ...nextRow,
    created_at: now,
    updated_at: now });
  return newId;
}

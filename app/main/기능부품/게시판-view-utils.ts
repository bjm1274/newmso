import type { AttachmentItem, BoardPost, StaffMember } from '@/types';
import { BOARD_POST_OPTIONAL_COLUMNS } from './게시판공통';

export const SCHEDULE_META_PREFIX = '[[SCHEDULE_META]]';
export const SCHEDULE_META_SUFFIX = '[[/SCHEDULE_META]]';
export const ATTACHMENTS_META_PREFIX = '[[ATTACHMENTS_META]]';
export const ATTACHMENTS_META_SUFFIX = '[[/ATTACHMENTS_META]]';
export const BOARD_META_PREFIX = '[[BOARD_META]]';
export const BOARD_META_SUFFIX = '[[/BOARD_META]]';

export type ScheduleMetaPayload = {
  date?: string;
  time?: string;
  room?: string;
  patient?: string;
  fasting?: boolean;
  inpatient?: boolean;
  guardian?: boolean;
  caregiver?: boolean;
  transfusion?: boolean;
  contrast?: boolean;
};

export type BoardMetaPayload = {
  scheduled_publish_at?: string;
  status?: string;
};

export type BoardReadRow = {
  post_id: string;
  user_id: string;
  read_at?: string | null;
};

export type StaffSummary = Pick<StaffMember, 'id' | 'name' | 'company' | 'company_id' | 'department' | 'position' | 'status'>;
export type QueryResult<T> = {
  data: T | null;
  error: unknown;
};
export type BoardPostRow = BoardPost & {
  board_type?: string | null;
  views?: number | null;
  poll?: Record<string, unknown> | null;
  poll_votes?: Record<string, string[]> | null;
  is_anonymous?: boolean | null;
  is_pinned?: boolean | null;
};
export type BoardTemplateRow = {
  id: string;
  name: string;
  sort_order?: number | null;
  body_part?: string | null;
};
export type BoardLikeRow = {
  post_id?: string | null;
};
export type BoardChatRoomRow = {
  id: string;
};

export function getBoardPostAuthorSignal(post: Partial<BoardPost>) {
  const isAnonymous = Boolean(post.is_anonymous);
  const rawName = String(post.author_name ?? '').trim();
  const name = isAnonymous ? '익명' : rawName || '익명';
  const company = isAnonymous ? '' : String(post.company ?? '').trim();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2) || '?';

  return {
    name,
    initials,
    meta: company,
    isAnonymous };
}

export function getBoardPostPreview(post: Partial<BoardPost>, maxLength = 120) {
  const content = String(post.content ?? '').replace(/\s+/g, ' ').trim();
  const tags = Array.isArray(post.tags)
    ? post.tags.map((tag) => String(tag ?? '').trim()).filter(Boolean)
    : [];
  const attachmentsCount = Array.isArray(post.attachments) ? post.attachments.length : 0;
  const rawPreview = content || (tags.length > 0 ? tags.map((tag) => `#${tag}`).join(' ') : '') ||
    (attachmentsCount > 0 ? `첨부파일 ${attachmentsCount}개` : '');

  if (!rawPreview) return '';
  if (rawPreview.length <= maxLength) return rawPreview;
  return `${rawPreview.slice(0, maxLength).trimEnd()}...`;
}

export function buildSelectColumns(
  requiredColumns: readonly string[],
  optionalColumns: readonly string[] = [],
  omittedColumns?: ReadonlySet<string>,
) {
  return [...requiredColumns, ...optionalColumns.filter((column) => !omittedColumns?.has(column))].join(', ');
}

export function inferAttachmentType(nameOrUrl: string, explicitType?: string | null) {
  const normalizedExplicitType = String(explicitType || '').trim().toLowerCase();
  if (normalizedExplicitType === 'image' || normalizedExplicitType === 'video' || normalizedExplicitType === 'file') {
    return normalizedExplicitType;
  }

  const raw = String(nameOrUrl || '').trim().toLowerCase();
  const clean = raw.split('?')[0];
  const ext = clean.includes('.') ? clean.slice(clean.lastIndexOf('.') + 1) : '';

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'wmv', 'webm', 'mkv', 'm4v'].includes(ext)) return 'video';
  return 'file';
}

export function extractAttachmentMetaFromContent(value: unknown) {
  const raw = String(value ?? '');
  const start = raw.indexOf(ATTACHMENTS_META_PREFIX);
  const end = raw.indexOf(ATTACHMENTS_META_SUFFIX);
  if (start < 0 || end < 0 || end <= start) {
    return {
      displayContent: raw.trim(),
      attachments: [] as AttachmentItem[],
      hasEmbeddedAttachments: false };
  }

  const displayContent = `${raw.slice(0, start)}${raw.slice(end + ATTACHMENTS_META_SUFFIX.length)}`.trim();
  const attachmentsText = raw.slice(start + ATTACHMENTS_META_PREFIX.length, end).trim();

  try {
    const parsed = JSON.parse(attachmentsText);
    const attachments = Array.isArray(parsed)
      ? parsed
          .map((item) => ({
            name: String((item as AttachmentItem)?.name ?? '').trim(),
            url: String((item as AttachmentItem)?.url ?? '').trim(),
            type: inferAttachmentType(
              String((item as AttachmentItem)?.name ?? (item as AttachmentItem)?.url ?? ''),
              String((item as AttachmentItem)?.type ?? '')
            ) }))
          .filter((item) => item.name && item.url)
      : [];

    return {
      displayContent,
      attachments,
      hasEmbeddedAttachments: attachments.length > 0 };
  } catch {
    return {
      displayContent,
      attachments: [] as AttachmentItem[],
      hasEmbeddedAttachments: true };
  }
}

export function buildAttachmentMetaContent(visibleContent: string, attachments: AttachmentItem[]) {
  if (!attachments.length) return visibleContent.trim();
  const normalizedVisibleContent = visibleContent.trim();
  const attachmentPayload = attachments.map((item) => ({
    name: String(item.name || '').trim(),
    url: String(item.url || '').trim(),
    type: inferAttachmentType(String(item.name || item.url || ''), String(item.type || '')) }));

  return `${normalizedVisibleContent}${normalizedVisibleContent ? '\n' : ''}${ATTACHMENTS_META_PREFIX}${JSON.stringify(attachmentPayload)}${ATTACHMENTS_META_SUFFIX}`;
}

export function normalizeScheduledPublishAtValue(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const normalized = raw.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return raw;
}

export function formatScheduledPublishInputValue(value: unknown) {
  const normalized = normalizeScheduledPublishAtValue(value);
  if (!normalized) return '';

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function buildScheduleTimeValue(period: string, hour: string, minute: string) {
  if (!period || !hour) return '';

  const hNum = parseInt(hour, 10);
  if (Number.isNaN(hNum)) return '';

  let h24 = hNum;
  if (period === '오전') {
    if (h24 === 12) h24 = 0;
  } else if (period === '오후') {
    if (h24 !== 12) h24 += 12;
  } else {
    return '';
  }

  const hh = String(h24).padStart(2, '0');
  const mm = String(minute || '00').padStart(2, '0');
  return `${hh}:${mm}`;
}

export function normalizeScheduleDateValue(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const matched = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (matched) return matched[1];

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }

  return raw;
}

export function normalizeScheduleTimeValue(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const matched = raw.match(/^(\d{2}:\d{2})/);
  return matched ? matched[1] : raw;
}

export function isScheduleBoardType(boardType: unknown) {
  return boardType === '수술일정' || boardType === 'MRI일정';
}

export function extractScheduleMetaFromContent(value: unknown) {
  const raw = String(value ?? '');
  const start = raw.indexOf(SCHEDULE_META_PREFIX);
  const end = raw.indexOf(SCHEDULE_META_SUFFIX);
  if (start < 0 || end < 0 || end <= start) {
    return {
      displayContent: raw.trim(),
      meta: null as ScheduleMetaPayload | null,
      hasEmbeddedMeta: false };
  }

  const displayContent = `${raw.slice(0, start)}${raw.slice(end + SCHEDULE_META_SUFFIX.length)}`.trim();
  const metaText = raw.slice(start + SCHEDULE_META_PREFIX.length, end).trim();

  try {
    const parsed = JSON.parse(metaText) as ScheduleMetaPayload;
    return { displayContent, meta: parsed, hasEmbeddedMeta: true };
  } catch {
    return { displayContent, meta: null as ScheduleMetaPayload | null, hasEmbeddedMeta: true };
  }
}

// 일정 글의 content 직렬화 단일 소스(canonical).
// chartNo는 가시 콘텐츠로, 일정 메타(date/time/room/...)는 [[SCHEDULE_META]] 블록으로 저장한다.
// 읽기 경로(normalizeBoardPost → extractScheduleMetaFromContent)가 이 포맷을 기대한다.
export function buildScheduleMetaContent(chartNo: string, meta: ScheduleMetaPayload) {
  const visibleContent = chartNo.trim();
  return `${visibleContent}${visibleContent ? '\n' : ''}${SCHEDULE_META_PREFIX}${JSON.stringify(meta)}${SCHEDULE_META_SUFFIX}`;
}

export function extractBoardMetaFromContent(value: unknown) {
  const raw = String(value ?? '');
  const start = raw.indexOf(BOARD_META_PREFIX);
  const end = raw.indexOf(BOARD_META_SUFFIX);
  if (start < 0 || end < 0 || end <= start) {
    return {
      displayContent: raw.trim(),
      meta: null as BoardMetaPayload | null,
      hasEmbeddedMeta: false };
  }

  const displayContent = `${raw.slice(0, start)}${raw.slice(end + BOARD_META_SUFFIX.length)}`.trim();
  const metaText = raw.slice(start + BOARD_META_PREFIX.length, end).trim();

  try {
    const parsed = JSON.parse(metaText) as BoardMetaPayload;
    return { displayContent, meta: parsed, hasEmbeddedMeta: true };
  } catch {
    return { displayContent, meta: null as BoardMetaPayload | null, hasEmbeddedMeta: true };
  }
}

export function buildBoardMetaContent(visibleContent: string, meta: BoardMetaPayload | null) {
  const normalizedVisibleContent = visibleContent.trim();
  if (!meta || (!meta.scheduled_publish_at && !meta.status)) return normalizedVisibleContent;
  return `${normalizedVisibleContent}${normalizedVisibleContent ? '\n' : ''}${BOARD_META_PREFIX}${JSON.stringify(meta)}${BOARD_META_SUFFIX}`;
}

export function normalizeBoardPost<T extends Partial<BoardPost>>(post: T): T {
  if (!post) return post;
  const {
    displayContent: attachmentStrippedContent,
    attachments: embeddedAttachments } = extractAttachmentMetaFromContent(post.content ?? '');
  const {
    displayContent: scheduleStrippedContent,
    meta: scheduleMeta,
    hasEmbeddedMeta } = extractScheduleMetaFromContent(attachmentStrippedContent);
  const {
    displayContent,
    meta: boardMeta } = extractBoardMetaFromContent(scheduleStrippedContent);
  const normalizedScheduleDate = normalizeScheduleDateValue(post.schedule_date ?? scheduleMeta?.date ?? '');
  const normalizedScheduleTime = normalizeScheduleTimeValue(post.schedule_time ?? scheduleMeta?.time ?? '');
  const scheduleMetaLegacyMissing = isScheduleBoardType(post.board_type) && !normalizedScheduleDate && !hasEmbeddedMeta;
  const normalizedAttachments = (Array.isArray(post.attachments) && post.attachments.length > 0 ? post.attachments : embeddedAttachments).map((item) => ({
    ...item,
    type: inferAttachmentType(String(item?.name || item?.url || ''), String(item?.type || '')) }));

  return {
    ...post,
    content: displayContent,
    attachments: normalizedAttachments,
    status: String(post.status ?? boardMeta?.status ?? '').trim() || null,
    scheduled_publish_at: normalizeScheduledPublishAtValue(post.scheduled_publish_at ?? boardMeta?.scheduled_publish_at ?? ''),
    schedule_date: normalizedScheduleDate,
    schedule_time: normalizedScheduleTime,
    schedule_room: String(post.schedule_room ?? scheduleMeta?.room ?? '').trim(),
    patient_name: String(post.patient_name ?? scheduleMeta?.patient ?? '').trim(),
    surgery_fasting: typeof post.surgery_fasting === 'boolean' ? post.surgery_fasting : Boolean(scheduleMeta?.fasting),
    surgery_inpatient: typeof post.surgery_inpatient === 'boolean' ? post.surgery_inpatient : Boolean(scheduleMeta?.inpatient),
    surgery_guardian: typeof post.surgery_guardian === 'boolean' ? post.surgery_guardian : Boolean(scheduleMeta?.guardian),
    surgery_caregiver: typeof post.surgery_caregiver === 'boolean' ? post.surgery_caregiver : Boolean(scheduleMeta?.caregiver),
    surgery_transfusion: typeof post.surgery_transfusion === 'boolean' ? post.surgery_transfusion : Boolean(scheduleMeta?.transfusion),
    mri_contrast_required:
      typeof post.mri_contrast_required === 'boolean'
        ? post.mri_contrast_required
        : Boolean(scheduleMeta?.contrast),
    schedule_meta_embedded: hasEmbeddedMeta,
    schedule_meta_legacy_missing: scheduleMetaLegacyMissing };
}

export function isScheduledNoticePending(post: Partial<BoardPost>, nowMs: number) {
  if (post.board_type !== '공지사항') return false;
  const scheduledPublishAt = normalizeScheduledPublishAtValue(post.scheduled_publish_at);
  if (!scheduledPublishAt) return false;
  const scheduledMs = new Date(scheduledPublishAt).getTime();
  if (Number.isNaN(scheduledMs)) return false;
  return scheduledMs > nowMs;
}

export function getMissingBoardPostColumn(error: unknown) {
  if (!error) return null;
  const e = error as Record<string, unknown>;
  const message = `${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`.toLowerCase();
  return BOARD_POST_OPTIONAL_COLUMNS.find((column) => message.includes(column.toLowerCase())) || null;
}

export function isMissingBoardReadStorageError(error: unknown) {
  const e = error as Record<string, unknown> | null;
  const code = String(e?.code || '').trim();
  const message = `${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`.toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    code === '42P10' ||
    message.includes('board_post_reads') ||
    message.includes('relation') && message.includes('does not exist')
  );
}

export const BOARD_POST_STATUSES = ['게시중', '중요', '검토중', '완료', '보류'] as const;

export function normalizeBoardPostStatus(value: unknown) {
  // 동작 통일: 허용된 상태만 반환, 미정의는 '게시중'(게시판공통 기준).
  // 기존 view판은 임의 문자열을 그대로 통과시켜 PC/모바일 정규화가 달랐음.
  const normalized = String(value ?? '').trim();
  return (BOARD_POST_STATUSES.find((status) => status === normalized) || '게시중') as (typeof BOARD_POST_STATUSES)[number];
}

export function getBoardStatusTone(status: string | null | undefined) {
  // 동작 통일: /10 틴트 색상(게시판공통 기준, 다크모드 친화).
  switch (normalizeBoardPostStatus(status)) {
    case '중요':
      return 'bg-red-500/10 text-red-500';
    case '검토중':
      return 'bg-amber-500/10 text-amber-600';
    case '완료':
      return 'bg-emerald-500/10 text-emerald-600';
    case '보류':
      return 'bg-[var(--muted)] text-[var(--toss-gray-3)]';
    default:
      return 'bg-[var(--toss-blue-light)] text-[var(--accent)]';
  }
}

export async function runBoardPostMutation<T>(
  mutation: (payload: Record<string, unknown>) => PromiseLike<{ data: T | null; error: unknown }>,
  payload: Record<string, unknown>
) {
  let nextPayload = { ...payload };
  let result = await mutation(nextPayload);
  let guard = 0;

  while (result?.error && guard < BOARD_POST_OPTIONAL_COLUMNS.length) {
    const missingColumn = getMissingBoardPostColumn(result.error);
    if (!missingColumn || !(missingColumn in nextPayload)) break;

    const { [missingColumn]: _removed, ...rest } = nextPayload;
    nextPayload = rest;
    result = await mutation(nextPayload);
    guard += 1;
  }

  return { ...result, payload: nextPayload };
}

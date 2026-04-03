'use client';
import { toast } from '@/lib/toast';
import { useDeferredValue, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { canAccessBoard, isAdminUser, isPrivilegedUser } from '@/lib/access-control';
import { getStaffLikeId, resolveStaffLike } from '@/lib/staff-identity';
import { supabase } from '@/lib/supabase';
import { withMissingColumnFallback, withMissingColumnsFallback } from '@/lib/supabase-compat';
import { CHAT_FOCUS_KEY, CHAT_ROOM_KEY } from '@/app/main/navigation-state';
import SmartDatePicker from './공통/SmartDatePicker';
import GuideLibrary from './게시판서브/업무가이드';
import type { StaffMember, BoardPost, ScheduleItem, AttachmentItem } from '@/types';
const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';
// 공지사항·경조사 게시글 등록 시 공지 채팅방 자동 전송 대상 게시판
const BOARD_AUTO_CHAT_TYPES = new Set(['공지사항', '경조사']);

const BOARD_IDS = ['공지사항', '자유게시판', '익명소리함', '경조사', '수술일정', 'MRI일정', '직원제안함', '업무가이드'];
const BOARD_POST_OPTIONAL_COLUMNS = [
  // 초기 스키마에 없거나 나중에 추가된 컬럼 (없어도 쿼리 정상 동작)
  'board_id',         // 일부 환경에 없을 수 있음 (사용하지 않는 레거시 컬럼)
  'updated_at',       // 일부 환경에 없을 수 있음
  'company_id',
  'tags',
  'attachments',
  'likes_count',
  'is_pinned',
  'status',
  'scheduled_publish_at',
  'schedule_date',
  'schedule_time',
  'schedule_room',
  'patient_name',
  'surgery_fasting',
  'surgery_inpatient',
  'surgery_guardian',
  'surgery_caregiver',
  'surgery_transfusion',
  'mri_contrast_required',
];
const BOARD_POST_REQUIRED_SELECT_COLUMNS = [
  'id',
  'board_type',
  'title',
  'content',
  'author_id',
  'author_name',
  'company',
  'created_at',
  'views',
  'is_anonymous',
  'poll',
  'poll_votes',
] as const;
const BOARD_TEMPLATE_REQUIRED_SELECT_COLUMNS = ['id', 'name'] as const;
const BOARD_TEMPLATE_OPTIONAL_COLUMNS = ['sort_order', 'body_part'] as const;
const BOARD_COMMENT_SELECT = 'id, post_id, author_id, author_name, content, parent_comment_id, created_at';
const BOARD_CHAT_ROOM_SELECT = 'id';
const SCHEDULE_META_PREFIX = '[[SCHEDULE_META]]';
const SCHEDULE_META_SUFFIX = '[[/SCHEDULE_META]]';
const ATTACHMENTS_META_PREFIX = '[[ATTACHMENTS_META]]';
const ATTACHMENTS_META_SUFFIX = '[[/ATTACHMENTS_META]]';
const BOARD_META_PREFIX = '[[BOARD_META]]';
const BOARD_META_SUFFIX = '[[/BOARD_META]]';

type ScheduleMetaPayload = {
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

type BoardMetaPayload = {
  scheduled_publish_at?: string;
  status?: string;
};

type BoardReadRow = {
  post_id: string;
  user_id: string;
  read_at?: string | null;
};

type StaffSummary = Pick<StaffMember, 'id' | 'name' | 'company' | 'company_id' | 'department' | 'position' | 'status'>;
type QueryResult<T> = {
  data: T | null;
  error: unknown;
};
type BoardPostRow = BoardPost & {
  board_type?: string | null;
  views?: number | null;
  poll?: Record<string, unknown> | null;
  poll_votes?: Record<string, string[]> | null;
  is_anonymous?: boolean | null;
  is_pinned?: boolean | null;
};
type BoardTemplateRow = {
  id: string;
  name: string;
  sort_order?: number | null;
  body_part?: string | null;
};
type BoardLikeRow = {
  post_id?: string | null;
};
type BoardChatRoomRow = {
  id: string;
};

function buildSelectColumns(
  requiredColumns: readonly string[],
  optionalColumns: readonly string[] = [],
  omittedColumns?: ReadonlySet<string>,
) {
  return [...requiredColumns, ...optionalColumns.filter((column) => !omittedColumns?.has(column))].join(', ');
}

function inferAttachmentType(nameOrUrl: string, explicitType?: string | null) {
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

function extractAttachmentMetaFromContent(value: unknown) {
  const raw = String(value ?? '');
  const start = raw.indexOf(ATTACHMENTS_META_PREFIX);
  const end = raw.indexOf(ATTACHMENTS_META_SUFFIX);
  if (start < 0 || end < 0 || end <= start) {
    return {
      displayContent: raw.trim(),
      attachments: [] as AttachmentItem[],
      hasEmbeddedAttachments: false,
    };
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
            ),
          }))
          .filter((item) => item.name && item.url)
      : [];

    return {
      displayContent,
      attachments,
      hasEmbeddedAttachments: attachments.length > 0,
    };
  } catch {
    return {
      displayContent,
      attachments: [] as AttachmentItem[],
      hasEmbeddedAttachments: true,
    };
  }
}

function buildAttachmentMetaContent(visibleContent: string, attachments: AttachmentItem[]) {
  if (!attachments.length) return visibleContent.trim();
  const normalizedVisibleContent = visibleContent.trim();
  const attachmentPayload = attachments.map((item) => ({
    name: String(item.name || '').trim(),
    url: String(item.url || '').trim(),
    type: inferAttachmentType(String(item.name || item.url || ''), String(item.type || '')),
  }));

  return `${normalizedVisibleContent}${normalizedVisibleContent ? '\n' : ''}${ATTACHMENTS_META_PREFIX}${JSON.stringify(attachmentPayload)}${ATTACHMENTS_META_SUFFIX}`;
}

function normalizeScheduledPublishAtValue(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const normalized = raw.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return raw;
}

function formatScheduledPublishInputValue(value: unknown) {
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

function buildScheduleTimeValue(period: string, hour: string, minute: string) {
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

function normalizeScheduleDateValue(value: unknown) {
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

function normalizeScheduleTimeValue(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const matched = raw.match(/^(\d{2}:\d{2})/);
  return matched ? matched[1] : raw;
}

function isScheduleBoardType(boardType: unknown) {
  return boardType === '수술일정' || boardType === 'MRI일정';
}

function extractScheduleMetaFromContent(value: unknown) {
  const raw = String(value ?? '');
  const start = raw.indexOf(SCHEDULE_META_PREFIX);
  const end = raw.indexOf(SCHEDULE_META_SUFFIX);
  if (start < 0 || end < 0 || end <= start) {
    return {
      displayContent: raw.trim(),
      meta: null as ScheduleMetaPayload | null,
      hasEmbeddedMeta: false,
    };
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

function buildScheduleMetaContent(chartNo: string, meta: ScheduleMetaPayload) {
  const visibleContent = chartNo.trim();
  return `${visibleContent}${visibleContent ? '\n' : ''}${SCHEDULE_META_PREFIX}${JSON.stringify(meta)}${SCHEDULE_META_SUFFIX}`;
}

function extractBoardMetaFromContent(value: unknown) {
  const raw = String(value ?? '');
  const start = raw.indexOf(BOARD_META_PREFIX);
  const end = raw.indexOf(BOARD_META_SUFFIX);
  if (start < 0 || end < 0 || end <= start) {
    return {
      displayContent: raw.trim(),
      meta: null as BoardMetaPayload | null,
      hasEmbeddedMeta: false,
    };
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

function buildBoardMetaContent(visibleContent: string, meta: BoardMetaPayload | null) {
  const normalizedVisibleContent = visibleContent.trim();
  if (!meta || (!meta.scheduled_publish_at && !meta.status)) return normalizedVisibleContent;
  return `${normalizedVisibleContent}${normalizedVisibleContent ? '\n' : ''}${BOARD_META_PREFIX}${JSON.stringify(meta)}${BOARD_META_SUFFIX}`;
}

function normalizeBoardPost<T extends Partial<BoardPost>>(post: T): T {
  if (!post) return post;
  const {
    displayContent: attachmentStrippedContent,
    attachments: embeddedAttachments,
  } = extractAttachmentMetaFromContent(post.content ?? '');
  const {
    displayContent: scheduleStrippedContent,
    meta: scheduleMeta,
    hasEmbeddedMeta,
  } = extractScheduleMetaFromContent(attachmentStrippedContent);
  const {
    displayContent,
    meta: boardMeta,
  } = extractBoardMetaFromContent(scheduleStrippedContent);
  const normalizedScheduleDate = normalizeScheduleDateValue(post.schedule_date ?? scheduleMeta?.date ?? '');
  const normalizedScheduleTime = normalizeScheduleTimeValue(post.schedule_time ?? scheduleMeta?.time ?? '');
  const scheduleMetaLegacyMissing = isScheduleBoardType(post.board_type) && !normalizedScheduleDate && !hasEmbeddedMeta;
  const normalizedAttachments = (Array.isArray(post.attachments) && post.attachments.length > 0 ? post.attachments : embeddedAttachments).map((item) => ({
    ...item,
    type: inferAttachmentType(String(item?.name || item?.url || ''), String(item?.type || '')),
  }));

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
    schedule_meta_legacy_missing: scheduleMetaLegacyMissing,
  };
}

function isScheduledNoticePending(post: Partial<BoardPost>, nowMs: number) {
  if (post.board_type !== '공지사항') return false;
  const scheduledPublishAt = normalizeScheduledPublishAtValue(post.scheduled_publish_at);
  if (!scheduledPublishAt) return false;
  const scheduledMs = new Date(scheduledPublishAt).getTime();
  if (Number.isNaN(scheduledMs)) return false;
  return scheduledMs > nowMs;
}

function getMissingBoardPostColumn(error: unknown) {
  if (!error) return null;
  const e = error as Record<string, unknown>;
  const message = `${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`.toLowerCase();
  return BOARD_POST_OPTIONAL_COLUMNS.find((column) => message.includes(column.toLowerCase())) || null;
}

function isMissingBoardReadStorageError(error: unknown) {
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

function normalizeBoardPostStatus(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '게시중';
  return raw;
}

const BOARD_POST_STATUSES = ['게시중', '중요', '검토중', '완료', '보류'] as const;

function getBoardStatusTone(status: string | null | undefined) {
  switch (normalizeBoardPostStatus(status)) {
    case '중요':
      return 'bg-red-500/10 text-red-600';
    case '검토중':
      return 'bg-amber-50 text-amber-700';
    case '완료':
      return 'bg-emerald-50 text-emerald-700';
    case '보류':
      return 'bg-[var(--muted)] text-[var(--toss-gray-3)]';
    default:
      return 'bg-[var(--toss-blue-light)] text-[var(--accent)]';
  }
}

async function runBoardPostMutation<T>(
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

interface BoardViewProps {
  user: StaffMember | null;
  subView?: string | null;
  setSubView?: (v: string | null) => void;
  selectedCo?: string | null;
  selectedCompanyId?: string | null;
  initialBoard?: string | null;
  initialPostId?: string | null;
  onConsumePostId?: () => void;
  surgeries?: ScheduleItem[];
  mris?: ScheduleItem[];
  onRefresh?: () => void;
  setMainMenu?: (menu: string) => void;
}
type BoardCommentRow = {
  id: string;
  author_id?: string;
  author_name?: string;
  content?: string;
  parent_comment_id?: string | null;
  [key: string]: unknown;
};
export default function BoardView({ user, subView, setSubView, selectedCo, selectedCompanyId, initialBoard, initialPostId, onConsumePostId, surgeries, mris, onRefresh, setMainMenu }: BoardViewProps) {
  const defaultBoard =
    BOARD_IDS.find((boardId) => canAccessBoard(user, boardId, 'read')) || '공지사항';
  const [activeBoard, setActiveBoard] = useState(
    initialBoard && BOARD_IDS.includes(initialBoard) && canAccessBoard(user, initialBoard, 'read')
      ? initialBoard
      : subView && BOARD_IDS.includes(subView) && canAccessBoard(user, subView, 'read')
        ? subView
        : defaultBoard
  );
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [showNewPost, setShowNewPost] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [scheduledPublishAt, setScheduledPublishAt] = useState('');
  const [postStatus, setPostStatus] = useState<string>('게시중');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleRoom, setScheduleRoom] = useState('');
  const [schedulePatient, setSchedulePatient] = useState('');
  const [scheduleChartNo, setScheduleChartNo] = useState('');
  const [scheduleFasting, setScheduleFasting] = useState(false);
  const [scheduleInpatient, setScheduleInpatient] = useState(false);
  const [scheduleGuardian, setScheduleGuardian] = useState(false);
  const [scheduleCaregiver, setScheduleCaregiver] = useState(false);
  const [scheduleTransfusion, setScheduleTransfusion] = useState(false);
  const [scheduleContrastRequired, setScheduleContrastRequired] = useState(false);
  const [scheduleSide, setScheduleSide] = useState<'좌' | '우' | ''>('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const deferredSearchKeyword = useDeferredValue(searchKeyword);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [existingAttachmentItems, setExistingAttachmentItems] = useState<AttachmentItem[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [hasPoll, setHasPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollAnonymous, setPollAnonymous] = useState(false);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [schedulePeriod, setSchedulePeriod] = useState('');
  const [scheduleHour, setScheduleHour] = useState('');
  const [scheduleMinute, setScheduleMinute] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, BoardCommentRow[]>>({});
  const [newComment, setNewComment] = useState('');
  const [myLikedPostIds, setMyLikedPostIds] = useState<Set<string>>(new Set());
  const [postReadMap, setPostReadMap] = useState<Record<string, Set<string>>>({});
  const [boardAudience, setBoardAudience] = useState<StaffSummary[]>([]);
  const [readStatusPost, setReadStatusPost] = useState<BoardPost | null>(null);
  const [readStatusLoading, setReadStatusLoading] = useState(false);
  const [readStatusAudience, setReadStatusAudience] = useState<StaffSummary[]>([]);
  const [noticeVisibilityTick, setNoticeVisibilityTick] = useState(() => Date.now());
  const [effectiveBoardUserId, setEffectiveBoardUserId] = useState<string>(
    () => getStaffLikeId((user ?? null) as Record<string, unknown> | null) || String(user?.id ?? '').trim()
  );

  // 수술/검사명 프리셋 (Supabase surgery_templates / mri_templates)
  const [surgeryTemplates, setSurgeryTemplates] = useState<BoardTemplateRow[]>([]);
  const [mriTemplates, setMriTemplates] = useState<BoardTemplateRow[]>([]);

  // 수술/MRI 부위 필터 (사람 모형: 아래팔/위팔 기준만, 손·손가락·팔꿈치 제외)
  const BODY_PARTS = [
    { id: 'all', label: '전체', emoji: '👤' },
    { id: 'cervical', label: '경추/목', emoji: '🧠' },
    { id: 'chest', label: '흉부/가슴', emoji: '❤️' },
    { id: 'lumbar', label: '요추/허리', emoji: '🦴' },
    { id: 'shoulder', label: '어깨', emoji: '🏋️' },
    { id: 'upper_arm', label: '위팔', emoji: '💪' },
    { id: 'forearm', label: '아래팔', emoji: '🤚' },
    { id: 'hip', label: '고관절/골반', emoji: '🦵' },
    { id: 'knee', label: '무릎', emoji: '🦿' },
    { id: 'ankle', label: '발목/발', emoji: '🦶' },
    { id: 'other', label: '기타', emoji: '➕' },
  ];
  const VALID_BODY_IDS = new Set(BODY_PARTS.map((b) => b.id));
  const [selectedBodyPart, setSelectedBodyPart] = useState<string>('all');
  const [showBodyPicker, setShowBodyPicker] = useState(false);
  // 제거된 부위(손/손가락, 팔꿈치)가 선택돼 있으면 '전체'로 보정
  const resolvedBodyPart = VALID_BODY_IDS.has(selectedBodyPart) ? selectedBodyPart : 'all';

  // 수술일정·MRI일정 달력 뷰용 현재 월
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());
  // 상세보기용 선택된 게시물
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  // 조회수: 같은 글을 연 때 한 번만 증가 (effect 재실행 방지)
  const viewedPostIdRef = useRef<string | null>(null);
  // 댓글 대댓글용 부모 댓글 ID
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const readMarkingRef = useRef<Set<string>>(new Set());
  const boardFetchSeqRef = useRef(0);
  const previousBoardRef = useRef(activeBoard);

  // 알림 등에서 딥링크 ID로 진입 시 해당 게시물 모달 즉시 열기
  useEffect(() => {
    if (initialPostId) {
      setSelectedPostId(initialPostId);
      onConsumePostId?.();
    }
  }, [initialPostId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!user) {
        if (!cancelled) setEffectiveBoardUserId('');
        return;
      }

      const resolved = await resolveStaffLike((user ?? null) as Record<string, unknown> | null);
      if (cancelled) return;
      setEffectiveBoardUserId(getStaffLikeId(resolved) || String(resolved?.id ?? '').trim());
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.employee_no, user?.name]);

  // 근무형태별 오늘 근무 현황 및 교대근무 부분 삭제 처리됨

  const boards = [
    { id: '공지사항', label: '📢 공지사항', icon: '📢' },
    { id: '자유게시판', label: '💬 자유게시판', icon: '💬' },
    { id: '익명소리함', label: '💌 익명 소리함', icon: '💌' },
    { id: '경조사', label: '🎉 경조사', icon: '🎉' },
    { id: '수술일정', label: '🏥 수술일정표', icon: '🏥' },
    { id: 'MRI일정', label: '🔬 MRI일정표', icon: '🔬' },
    { id: '직원제안함', label: '💡 직원 제안함', icon: '💡' },
    { id: '업무가이드', label: '📚 업무가이드', icon: '📚' }
  ];
  const visibleBoards = useMemo(
    () => boards.filter((board) => canAccessBoard(user, board.id, 'read')),
    [user]
  );

  const boardMetaMap: Record<string, { title: string; description: string }> = {
    공지사항: { title: '공지사항', description: '' },
    자유게시판: { title: '자유게시판', description: '' },
    익명소리함: { title: '익명 소리함', description: '' },
    경조사: { title: '경조사', description: '' },
    수술일정: { title: '수술일정', description: '' },
    MRI일정: { title: 'MRI일정', description: '' },
    직원제안함: { title: '직원 제안함', description: '' },
    업무가이드: { title: '업무가이드', description: '부서별 메뉴에서 업무가이드 게시글과 첨부 자료를 함께 관리합니다.' },
  };
  const currentBoardMeta = boardMetaMap[activeBoard] || {
    title: activeBoard || '게시판',
    description: '',
  };
  const canCreatePost = canAccessBoard(user, activeBoard, 'write');
  const canScheduleNoticePost =
    activeBoard === '공지사항' && (isAdminUser(user) || isPrivilegedUser(user));

  useEffect(() => {
    if (activeBoard !== '공지사항') return;
    const timer = window.setInterval(() => setNoticeVisibilityTick(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [activeBoard]);

  const visiblePosts = useMemo(() => {
    return posts.filter((post) => {
      if (!isScheduledNoticePending(post, noticeVisibilityTick)) return true;
      return canScheduleNoticePost;
    });
  }, [posts, noticeVisibilityTick, canScheduleNoticePost]);

  const loadBoardAudience = useCallback(async () => {
    if (!effectiveBoardUserId) {
      setBoardAudience([]);
      return;
    }

    const loadStaff = async () => {
      return supabase
        .from('staff_members')
        .select('id, name, company, company_id, department, position, status')
        .neq('status', '퇴사')
        .neq('status', '퇴직')
        .order('company', { ascending: true })
        .order('name', { ascending: true });
    };

    const { data, error } = await loadStaff();
    if (error) {
      console.warn('board audience load failed', error);
      return;
    }
    setBoardAudience((data || []) as StaffSummary[]);
  }, [effectiveBoardUserId]);

  const loadBoardReadState = useCallback(async (postIds?: string[]) => {
    const targetIds = (postIds || visiblePosts.map((post) => String(post.id ?? '').trim()).filter(Boolean));
    if (targetIds.length === 0) {
      setPostReadMap({});
      return;
    }

    const { data, error } = await supabase
      .from('board_post_reads')
      .select('post_id, user_id, read_at')
      .in('post_id', targetIds);

    if (error) {
      if (!isMissingBoardReadStorageError(error)) {
        console.warn('board read state load failed', error);
      }
      return;
    }

    const nextMap: Record<string, Set<string>> = {};
    (data as BoardReadRow[] | null | undefined)?.forEach((row) => {
      const postId = String(row.post_id || '').trim();
      const userId = String(row.user_id || '').trim();
      if (!postId || !userId) return;
      if (!nextMap[postId]) nextMap[postId] = new Set<string>();
      nextMap[postId].add(userId);
    });
    setPostReadMap(nextMap);
  }, [visiblePosts]);

  const markBoardPostRead = useCallback(async (post: BoardPost | null) => {
    if (!post?.id || !effectiveBoardUserId) return;
    const postId = String(post.id).trim();
    if (!postId || readMarkingRef.current.has(postId)) return;

    readMarkingRef.current.add(postId);
    setPostReadMap((prev) => {
      const next = { ...prev };
      const current = new Set(next[postId] || []);
      current.add(effectiveBoardUserId);
      next[postId] = current;
      return next;
    });

    const { error } = await supabase.from('board_post_reads').upsert(
      [{ post_id: postId, user_id: effectiveBoardUserId, read_at: new Date().toISOString() }],
      { onConflict: 'post_id,user_id' }
    );

    if (error && !isMissingBoardReadStorageError(error)) {
      console.warn('board read mark failed', error);
    }

    readMarkingRef.current.delete(postId);
  }, [effectiveBoardUserId]);
  const openReadStatusModal = useCallback(async (post: BoardPost) => {
    setReadStatusPost(post);
    setReadStatusLoading(true);
    try {
      // 공지사항·경조사 등 전사 공지 게시판은 전 직원이 대상
      // 회사 필터 없이 모든 재직 중 직원 조회
      const { data: audienceData } = await supabase
        .from('staff_members')
        .select('id, name, company, company_id, department, position, status')
        .neq('status', '퇴사')
        .neq('status', '퇴직')
        .order('company', { ascending: true })
        .order('name', { ascending: true });
      setReadStatusAudience((audienceData || []) as StaffSummary[]);
      await loadBoardReadState([String(post.id)]);
    } finally {
      setReadStatusLoading(false);
    }
  }, [loadBoardReadState]);
  const scheduleCalendarData = useMemo(() => {
    const toKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    if (activeBoard !== '수술일정' && activeBoard !== 'MRI일정') {
      return {
        filteredPosts: [] as BoardPost[],
        eventsByDate: {} as Record<string, BoardPost[]>,
        days: [] as Date[],
        month: calendarMonth.getMonth(),
        toKey,
      };
    }

    const searchLower = deferredSearchKeyword.trim().toLowerCase();
    const filteredPosts = searchLower
      ? posts.filter((post: BoardPost) =>
          (post.patient_name || '').toLowerCase().includes(searchLower) ||
          (post.content || '').toLowerCase().includes(searchLower)
        )
      : posts;

    const eventsByDate: Record<string, BoardPost[]> = {};
    filteredPosts.forEach((post: BoardPost) => {
      const dateKey = normalizeScheduleDateValue(post.schedule_date);
      if (!dateKey) return;
      if (!eventsByDate[dateKey]) {
        eventsByDate[dateKey] = [];
      }
      eventsByDate[dateKey].push(post);
    });

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startDay = firstOfMonth.getDay();
    const startDate = new Date(year, month, 1 - startDay);
    const days = Array.from({ length: 42 }, (_, index) => (
      new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index)
    ));

    return {
      filteredPosts,
      eventsByDate,
      days,
      month,
      toKey,
    };
  }, [activeBoard, posts, deferredSearchKeyword, calendarMonth]);

  const legacySchedulePosts = useMemo(
    () =>
      activeBoard === '수술일정' || activeBoard === 'MRI일정'
        ? posts.filter((post) => Boolean((post as Record<string, unknown>).schedule_meta_legacy_missing))
        : [],
    [activeBoard, posts]
  );
  const normalizedDraftScheduleDate = useMemo(() => normalizeScheduleDateValue(scheduleDate), [scheduleDate]);
  const normalizedDraftScheduleTime = useMemo(
    () => normalizeScheduleTimeValue(buildScheduleTimeValue(schedulePeriod, scheduleHour, scheduleMinute) || scheduleTime),
    [scheduleHour, scheduleMinute, schedulePeriod, scheduleTime]
  );
  const isScheduleBoard = activeBoard === '수술일정' || activeBoard === 'MRI일정';
  const isScheduleDraftReady = !isScheduleBoard || Boolean(title.trim() && normalizedDraftScheduleDate && normalizedDraftScheduleTime);

  // 오전/오후 + 시/분 드롭다운 값을 HH:MM 문자열로 변환
  const updateScheduleTime = (period: string, hour: string, minute: string) => {
    setScheduleTime(buildScheduleTimeValue(period, hour, minute));
  };

  useEffect(() => {
    if ((activeBoard === '수술일정' || activeBoard === 'MRI일정') && schedulePeriod && scheduleHour && !scheduleMinute) {
      setScheduleMinute('00');
    }
  }, [activeBoard, scheduleHour, scheduleMinute, schedulePeriod]);

  const fetchPosts = async () => {
    const requestedBoard = activeBoard;
    const fetchSeq = ++boardFetchSeqRef.current;
    // 유저 정보가 아직 로드되지 않은 경우(인증 초기화 중) posts를 초기화하지 않음
    if (!user) return;
    if (!canAccessBoard(user, requestedBoard, 'read')) {
      setPosts([]);
      return;
    }
    if (requestedBoard === '업무가이드') {
      setPosts([]);
      return;
    }

    const { data } = await withMissingColumnsFallback<BoardPostRow[]>(
      async (omittedColumns): Promise<QueryResult<BoardPostRow[]>> => {
        const result = await supabase
          .from('board_posts')
          .select(buildSelectColumns(BOARD_POST_REQUIRED_SELECT_COLUMNS, BOARD_POST_OPTIONAL_COLUMNS, omittedColumns))
          .eq('board_type', requestedBoard)
          .order('created_at', { ascending: false });
        return result as unknown as QueryResult<BoardPostRow[]>;
      },
      [...BOARD_POST_OPTIONAL_COLUMNS]
    );
    if (fetchSeq !== boardFetchSeqRef.current) {
      return;
    }

    if (!data) {
      setPosts([]);
      return;
    }

    if (data) {
      if (requestedBoard === '익명소리함') {
        const isAdmin = user?.permissions?.mso || user?.role === 'admin' || user?.permissions?.hr;
        if (!isAdmin) {
          setPosts([]);
        } else {
          setPosts((data as BoardPostRow[]).map((post) => normalizeBoardPost(post)));
        }
      } else {
        setPosts((data as BoardPostRow[]).map((post) => normalizeBoardPost(post)));
      }
    }
  };

  // 메인 사이드바 플라이아웃에서 선택한 게시판 반영
  useEffect(() => {
    const requestedBoard = [initialBoard, subView].find(
      (boardId): boardId is string =>
        Boolean(boardId) && BOARD_IDS.includes(boardId as string) && canAccessBoard(user, boardId as string, 'read')
    );

    if (requestedBoard && requestedBoard !== activeBoard) {
      setActiveBoard(requestedBoard);
      return;
    }

    if (!canAccessBoard(user, activeBoard, 'read')) {
      const fallbackBoard = visibleBoards[0]?.id;
      if (fallbackBoard) {
        setActiveBoard(fallbackBoard);
      }
    }
  }, [activeBoard, initialBoard, subView, user, visibleBoards]);

  // 수술·MRI 템플릿 불러오기
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const [{ data: s }, { data: m }] = await Promise.all([
          withMissingColumnsFallback<BoardTemplateRow[]>(
            async (omittedColumns): Promise<QueryResult<BoardTemplateRow[]>> => {
              const selectedColumns = buildSelectColumns(
                BOARD_TEMPLATE_REQUIRED_SELECT_COLUMNS,
                BOARD_TEMPLATE_OPTIONAL_COLUMNS,
                omittedColumns,
              );
              let query = supabase.from('surgery_templates').select(selectedColumns);
              if (!omittedColumns.has('sort_order')) {
                query = query.order('sort_order', { ascending: true });
              }
              const result = await query.order('name', { ascending: true });
              return result as unknown as QueryResult<BoardTemplateRow[]>;
            },
            [...BOARD_TEMPLATE_OPTIONAL_COLUMNS],
          ),
          withMissingColumnsFallback<BoardTemplateRow[]>(
            async (omittedColumns): Promise<QueryResult<BoardTemplateRow[]>> => {
              const selectedColumns = buildSelectColumns(
                BOARD_TEMPLATE_REQUIRED_SELECT_COLUMNS,
                BOARD_TEMPLATE_OPTIONAL_COLUMNS,
                omittedColumns,
              );
              let query = supabase.from('mri_templates').select(selectedColumns);
              if (!omittedColumns.has('sort_order')) {
                query = query.order('sort_order', { ascending: true });
              }
              const result = await query.order('name', { ascending: true });
              return result as unknown as QueryResult<BoardTemplateRow[]>;
            },
            [...BOARD_TEMPLATE_OPTIONAL_COLUMNS],
          ),
        ]);
        setSurgeryTemplates(s || []);
        setMriTemplates(m || []);
      } catch {
        // 템플릿 테이블이 없거나 실패해도 치명적이지 않으므로 무시
      }
    };
    loadTemplates();
  }, []);

  const currentTemplates = useMemo(
    () =>
      activeBoard === '수술일정'
        ? surgeryTemplates
        : activeBoard === 'MRI일정'
          ? mriTemplates
          : [],
    [activeBoard, surgeryTemplates, mriTemplates]
  );

  // 부위 선택에 따른 템플릿 필터링 (제거된 부위 hand/elbow면 전체로 처리)
  const filteredTemplates = useMemo(() => {
    if (resolvedBodyPart === 'all' || !currentTemplates.length) return currentTemplates;

    const keywordMap: Record<string, string[]> = {
      cervical: ['경추', '목', '경추부'],
      chest: ['흉부', '가슴', '흉곽', '흉추'],
      lumbar: ['요추', '허리', '요추부', '요추부 MRI'],
      shoulder: ['어깨', '견', '견관절'],
      upper_arm: ['상완', '위팔'],
      forearm: ['전완', '아래팔'],
      hip: ['고관절', '둔부', '골반'],
      knee: ['무릎', '슬관절', '무릎관절'],
      ankle: ['발목', '족관절', '발'],
      other: [],
    };

    const keywords = keywordMap[resolvedBodyPart] || [];
    if (keywords.length === 0) return currentTemplates;

    return currentTemplates.filter((t) => {
      if (t.body_part) return t.body_part === resolvedBodyPart;
      const name = String(t.name || '');
      return keywords.some((k) => name.includes(k));
    });
  }, [currentTemplates, resolvedBodyPart]);

  useEffect(() => {
    const boardChanged = previousBoardRef.current !== activeBoard;
    previousBoardRef.current = activeBoard;
    if (boardChanged) {
      setPosts([]);
    }
    fetchPosts();
    void loadBoardAudience();
    // 내 좋아요 목록 로드
    if (effectiveBoardUserId) {
      supabase.from('board_post_likes').select('post_id').eq('user_id', effectiveBoardUserId).then(({ data }) => {
        setMyLikedPostIds(
          new Set(
            ((data || []) as BoardLikeRow[])
              .map((row) => String(row.post_id ?? '').trim())
              .filter(Boolean)
          )
        );
      });
    }
    // 다른 게시판에서 다시 수술/MRI 일정으로 돌아올 때는 현재 월 기준으로 달력 리셋
    if (activeBoard === '수술일정' || activeBoard === 'MRI일정') {
      setCalendarMonth(new Date());
    }
  }, [activeBoard, effectiveBoardUserId, loadBoardAudience]);

  useEffect(() => {
    void loadBoardReadState();
  }, [loadBoardReadState]);

  useEffect(() => {
    const channel = supabase
      .channel('board-post-reads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_post_reads' }, () => {
        void loadBoardReadState();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadBoardReadState]);

  // 수술/검사 템플릿 필터링 로직 (유지)

  useEffect(() => {
    const channel = supabase
      .channel('board-posts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_posts' }, () => {
        // 좋아요 처리 중이면 realtime fetch 건너뜀 (로컬 state 덮어쓰기 방지)
        if (likingRef.current) return;
        fetchPosts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeBoard, user?.id]);

  // 근무현황 Effect 제거됨

  const fetchComments = async (postId: string) => {
    const { data } = await supabase
      .from('board_post_comments')
      .select(BOARD_COMMENT_SELECT)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    setComments((prev) => ({ ...prev, [postId]: (data || []) as BoardCommentRow[] }));
  };

  // 상세 게시글이 변경될 때 자동으로 댓글 불러오기
  useEffect(() => {
    if (!selectedPostId) return;
    if (comments[selectedPostId]) return;
    fetchComments(selectedPostId);
  }, [selectedPostId, comments]);


  // 수술·MRI 일정 카드 → 관련 채팅방 열기
  const openChatForSchedule = async (post: BoardPost) => {
    if (!effectiveBoardUserId) {
      toast('직원 계정으로 로그인한 경우에만 채팅을 사용할 수 있습니다.');
      return;
    }
    const baseName = post.patient_name || post.title || '수술/검사 일정';
    const kindLabel = activeBoard === '수술일정' ? '수술' : '검사';
    const roomName = `[${kindLabel}] ${baseName}`;
    try {
      const { data: existing } = await supabase
        .from('chat_rooms')
        .select(BOARD_CHAT_ROOM_SELECT)
        .eq('name', roomName)
        .maybeSingle() as unknown as { data: BoardChatRoomRow | null };
      let roomId = existing?.id;
      if (!roomId) {
        const { data: created, error } = await supabase
          .from('chat_rooms')
          .insert([
            {
              name: roomName,
              type: 'group',
              members: [effectiveBoardUserId],
            },
          ])
          .select(BOARD_CHAT_ROOM_SELECT)
          .single() as unknown as { data: BoardChatRoomRow | null; error: unknown };
        if (error || !created) {
          toast('관련 채팅방 생성 중 오류가 발생했습니다.', 'error');
          return;
        }
        roomId = created.id;
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CHAT_ROOM_KEY, roomId);
        if (post.patient_name) {
          window.localStorage.setItem(CHAT_FOCUS_KEY, post.patient_name);
        }
      }
      setMainMenu?.('채팅');
    } catch (e) {
      console.error('openChatForSchedule error', e);
      toast('관련 채팅방을 여는 중 오류가 발생했습니다.', 'error');
    }
  };

  const likingRef = useRef(false);
  const [likingPostId, setLikingPostId] = useState<string | null>(null);
  const handleLike = async (post: BoardPost) => {
    if (!effectiveBoardUserId || likingRef.current) return;
    const postId = String(post.id ?? '').trim();
    if (!postId) return;
    likingRef.current = true;
    setLikingPostId(postId);

    const isLiked = myLikedPostIds.has(postId);

    // ── Optimistic UI 즉시 반영 ──
    const optimisticLikes = isLiked ? Math.max((post.likes_count ?? 1) - 1, 0) : (post.likes_count ?? 0) + 1;
    const updateLocalLikes = (count: number) => {
      setPosts((prev) => prev.map((p) => (String(p.id ?? '').trim() === postId ? { ...p, likes_count: count } : p)));
      setSelectedPostDetail((prev: BoardPost | null) => {
        if (!prev || String(prev.id ?? '').trim() !== postId) return prev;
        return { ...prev, likes_count: count };
      });
    };
    updateLocalLikes(optimisticLikes);
    if (isLiked) {
      setMyLikedPostIds((prev) => { const next = new Set(prev); next.delete(postId); return next; });
    } else {
      setMyLikedPostIds((prev) => new Set([...prev, postId]));
    }

    try {
      if (isLiked) {
        const { error: unlikeError } = await supabase.from('board_post_likes').delete().eq('post_id', post.id).eq('user_id', effectiveBoardUserId);
        if (unlikeError && !(unlikeError.code === '42P01' || unlikeError.message?.includes('does not exist'))) throw unlikeError;
      } else {
        const { error: likeError } = await supabase.from('board_post_likes').insert([{ post_id: post.id, user_id: effectiveBoardUserId }]);
        if (likeError && !(likeError.code === '42P01' || likeError.message?.includes('does not exist'))) throw likeError;
      }
      // ── 실제 COUNT 기반으로 likes_count 동기화 (race condition 방지) ──
      const { count, error: countError } = await supabase.from('board_post_likes').select('id', { count: 'exact', head: true }).eq('post_id', post.id);
      const realCount = countError ? optimisticLikes : (count ?? optimisticLikes);
      await supabase.from('board_posts').update({ likes_count: realCount }).eq('id', post.id);
      updateLocalLikes(realCount);
    } catch (error) {
      // ── 실패 시 롤백 ──
      console.error('좋아요 처리 실패:', error);
      toast('좋아요 처리 중 오류가 발생했습니다.', 'error');
      updateLocalLikes(post.likes_count ?? 0);
      if (isLiked) {
        setMyLikedPostIds((prev) => new Set([...prev, postId]));
      } else {
        setMyLikedPostIds((prev) => { const next = new Set(prev); next.delete(postId); return next; });
      }
    } finally {
      likingRef.current = false;
      setLikingPostId(null);
    }
  };

  const handleAddComment = async (postId: string, parentCommentId?: string | null) => {
    if (!newComment.trim()) return;
    if (!effectiveBoardUserId) {
      toast('로그인한 후 댓글을 등록할 수 있습니다.', 'success');
      return;
    }
    const { data, error } = await supabase
      .from('board_post_comments')
      .insert([{
        post_id: postId,
        author_id: effectiveBoardUserId,
        author_name: user?.name ?? '익명',
        content: newComment.trim(),
        parent_comment_id: parentCommentId ?? null,
      }])
      .select()
      .maybeSingle();
    if (error) {
      console.error('댓글 등록 실패:', error);
      toast(`댓글 등록에 실패했습니다.\n\n${error.message || ''}`, 'error');
      return;
    }
    if (data) {
      setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), data as BoardCommentRow] }));
      setNewComment('');
      setReplyParentId(null);
    } else {
      toast('댓글 등록 후 응답을 받지 못했습니다. 다시 시도해 주세요.', 'success');
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    if (!effectiveBoardUserId) return;
    const list = comments[postId] || [];
    const comment = list.find((c) => c.id === commentId);
    if (!comment) return;
    const isSysAdmin = isPrivilegedUser(user);
    if (String(comment.author_id) !== effectiveBoardUserId && !isSysAdmin) {
      toast('본인이 작성한 댓글만 삭제할 수 있습니다.', 'error');
      return;
    }
    if (!confirm('이 댓글을 삭제할까요?')) return;
    // 자식 댓글 먼저 DB에서 삭제
    await supabase.from('board_post_comments').delete().eq('parent_comment_id', commentId);
    const { error } = await supabase.from('board_post_comments').delete().eq('id', commentId);
    if (error) {
      console.error('댓글 삭제 실패:', error);
      toast(`댓글 삭제에 실패했습니다.\n\n${error.message || ''}`, 'error');
      return;
    }
    setComments((prev) => {
      const postComments = (prev[postId] || []).filter(
        (c) => c.id !== commentId && String(c.parent_comment_id) !== String(commentId)
      );
      return { ...prev, [postId]: postComments };
    });
  };

  const handleExpandPost = (postId: string) => {
    setExpandedPostId((prev) => (prev === postId ? null : postId));
    if (expandedPostId !== postId) fetchComments(postId);
  };

  const selectedPostFromList = useMemo(
    () => visiblePosts.find((p: BoardPost) => p.id === selectedPostId) || null,
    [visiblePosts, selectedPostId]
  );
  const [selectedPostDetail, setSelectedPostDetail] = useState<BoardPost | null>(null);
  const selectedPost = selectedPostDetail || selectedPostFromList;
  const selectedPostComments = useMemo(
    () => (selectedPost ? comments[selectedPost.id] || [] : []),
    [comments, selectedPost]
  );
  const selectedPostCommentTree = useMemo(() => {
    const roots = selectedPostComments.filter((comment) => !comment.parent_comment_id);
    const repliesByParent: Record<string, BoardCommentRow[]> = {};

    selectedPostComments.forEach((comment) => {
      if (!comment.parent_comment_id) return;
      const key = String(comment.parent_comment_id);
      if (!repliesByParent[key]) repliesByParent[key] = [];
      repliesByParent[key].push(comment);
    });

    return { roots, repliesByParent };
  }, [selectedPostComments]);
  const readStatusReaders = useMemo(() => {
    if (!readStatusPost) return [];
    const postId = String(readStatusPost.id ?? '').trim();
    const readSet = postReadMap[postId] || new Set<string>();
    const audience = readStatusAudience.length > 0 ? readStatusAudience : boardAudience;
    const authorId = String(readStatusPost.author_id ?? '').trim();
    return audience.filter((member) => {
      const memberId = String(member.id ?? '').trim();
      if (authorId && memberId === authorId) return true;
      return readSet.has(memberId);
    });
  }, [boardAudience, readStatusAudience, postReadMap, readStatusPost]);
  const readStatusPendingAudience = useMemo(() => {
    if (!readStatusPost) return [];
    const postId = String(readStatusPost.id ?? '').trim();
    const readSet = postReadMap[postId] || new Set<string>();
    const audience = readStatusAudience.length > 0 ? readStatusAudience : boardAudience;
    const authorId = String(readStatusPost.author_id ?? '').trim();
    return audience.filter((member) => {
      const memberId = String(member.id ?? '').trim();
      if (authorId && memberId === authorId) return false;
      return !readSet.has(memberId);
    });
  }, [boardAudience, readStatusAudience, postReadMap, readStatusPost]);

  useEffect(() => {
    if (!selectedPost) return;
    void markBoardPostRead(selectedPost);
  }, [selectedPost, markBoardPostRead]);

  useEffect(() => {
    if (!selectedPostId) {
      setSelectedPostDetail(null);
      return;
    }
    (async () => {
      const { data } = await withMissingColumnsFallback<BoardPostRow>(
        async (omittedColumns): Promise<QueryResult<BoardPostRow>> => {
          const result = await supabase
            .from('board_posts')
            .select(buildSelectColumns(BOARD_POST_REQUIRED_SELECT_COLUMNS, BOARD_POST_OPTIONAL_COLUMNS, omittedColumns))
            .eq('id', selectedPostId)
            .maybeSingle();
          return result as unknown as QueryResult<BoardPostRow>;
        },
        [...BOARD_POST_OPTIONAL_COLUMNS],
      );
      if (data) {
        const normalized = normalizeBoardPost(data);
        if (!isScheduledNoticePending(normalized, noticeVisibilityTick) || canScheduleNoticePost) {
          setSelectedPostDetail(normalized);
        } else {
          setSelectedPostDetail(null);
          setSelectedPostId(null);
        }
      }
      else setSelectedPostDetail(null);
    })();
  }, [selectedPostId, noticeVisibilityTick, canScheduleNoticePost]);

  // 상세 보기 열릴 때 조회수 1회만 증가 (selectedPostId 변경 시에만 실행, posts 제외해 중복 방지)
  useEffect(() => {
    if (!selectedPostId) {
      viewedPostIdRef.current = null;
      return;
    }
    if (viewedPostIdRef.current === selectedPostId) return;
    viewedPostIdRef.current = selectedPostId;

    (async () => {
      try {
        // 원자적 조회수 증가 (RPC fallback)
        const { error: rpcErr } = await supabase.rpc('increment_post_views', { p_post_id: selectedPostId });
        if (rpcErr) {
          const { data: row } = await supabase.from('board_posts').select('views').eq('id', selectedPostId).maybeSingle();
          const nextViews = ((row?.views ?? 0) as number) + 1;
          await supabase.from('board_posts').update({ views: nextViews }).eq('id', selectedPostId);
        }
        // UI 낙관적 업데이트
        const increment = (prev: BoardPost[]) =>
          prev.map((p: BoardPost) =>
            p.id === selectedPostId ? { ...p, views: ((p.views ?? 0) as number) + 1 } : p
          );
        setPosts(increment);
        setSelectedPostDetail((prev: BoardPost | null) =>
          prev && prev.id === selectedPostId ? { ...prev, views: ((prev.views ?? 0) as number) + 1 } : prev
        );
      } catch {
        // 조회수 업데이트 실패는 무시
      }
    })();
  }, [selectedPostId]);

  const isDepartmentHead = ['팀장', '과장', '실장', '부장', '이사', '원장', '병원장'].some(p => user?.position?.includes(p)) || user?.permissions?.mso || user?.role === 'admin';

  const canEditPost = (post: BoardPost) => {
    if (!user) return false;
    if (!canAccessBoard(user, (post?.board_type as string) || activeBoard, 'write')) return false;
    // 일반 직원도 자신이 올린 수술/MRI일정에 대해 '요청'을 할 수 있도록 조건 완화 (작성자 본인 포함)
    return (post.author_id && String(post.author_id) === effectiveBoardUserId) || isDepartmentHead;
  };

  const canDeletePost = (post: BoardPost) => {
    if (!user) return false;
    if (!canAccessBoard(user, (post?.board_type as string) || activeBoard, 'write')) return false;
    const isAuthor = Boolean(post.author_id && String(post.author_id) === effectiveBoardUserId);
    // 작성자 본인 또는 시스템관리자만 삭제 가능
    return isAuthor || isPrivilegedUser(user);
  };

  const sendScheduleApprovalRequest = async (post: BoardPost, actionType: '삭제' | '수정', updatedData?: Record<string, unknown>) => {
    if (!user) return;
    try {
      const rows: Record<string, unknown>[] = [{
        sender_id: effectiveBoardUserId,
        sender_name: user.name,
        sender_company: user.company,
        type: '기타',
        title: `[일정 ${actionType} 요청] ${post.board_type} - ${post.title}`,
        content: `요청자: ${user.name}\n요청 대상: ${post.title}\n작업 분류: ${actionType}\n\n* 이 결재 문서는 일반 직원이 임의로 일정을 ${actionType}하고자 시스템을 통해 보낸 자동 승인 요청입니다. 관리자께서는 확인 후 처리해 주시기 바랍니다.`,
        status: '대기',
        meta_data: {
          board_post_id: post.id,
          action_type: actionType,
          updated_data: updatedData || null,
          is_schedule_approval: true
        }
      }];
      if (user?.company_id) {
        rows[0].company_id = user.company_id;
      }
      const { error } = await withMissingColumnFallback(
        () => supabase.from('approvals').insert(rows),
        () => {
          const legacyRows = rows.map(({ company_id, ...rest }: Record<string, unknown>) => rest);
          return supabase.from('approvals').insert(legacyRows);
        }
      );
      if (error) throw error;
      toast(`해당 일정의 ${actionType} 처리를 위해 부서장/관리자에게 승인 요청 문서가 상신되었습니다.`, 'success');
    } catch (err) {
      console.error(err);
      toast('승인 요청 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleDeletePost = async (post: BoardPost) => {
    if (!canDeletePost(post)) {
      toast('이 게시물을 삭제할 권한이 없습니다.', 'error');
      return;
    }

    if (!confirm('이 게시물을 정말 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('board_posts').delete().eq('id', post.id);
    if (error) {
      toast('게시물 삭제 중 오류가 발생했습니다.', 'error');
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    setSelectedPostId((prev) => (prev === post.id ? null : prev));
    toast('게시물이 삭제되었습니다.', 'success');
  };

  const handleEditPostStart = (post: BoardPost) => {
    if (!canEditPost(post)) {
      toast('수정 권한이 없습니다.', 'error');
      return;
    }
    setEditingPostId(post.id);
    setTitle(post.title || '');
    const rawPoll =
      post.poll && typeof post.poll === 'object' && !Array.isArray(post.poll)
        ? (post.poll as Record<string, unknown>)
        : null;
    const restoredPollOptions = rawPoll && Array.isArray(rawPoll.options)
      ? rawPoll.options.map((option) => String(option ?? '').trim()).filter(Boolean)
      : [];

    setPostStatus(normalizeBoardPostStatus(post.status));
    setTagsInput((post.tags || []).join(', '));
    setScheduledPublishAt(formatScheduledPublishInputValue(post.scheduled_publish_at));
    setExistingAttachmentItems(Array.isArray(post.attachments) ? (post.attachments as AttachmentItem[]) : []);
    setAttachmentFiles([]);
    setIsAnonymous(Boolean(post.is_anonymous));
    setHasPoll(Boolean(rawPoll));
    setPollQuestion(rawPoll ? String(rawPoll.question ?? '') : '');
    setPollOptions(
      rawPoll
        ? [...restoredPollOptions, ...Array.from({ length: Math.max(0, 2 - restoredPollOptions.length) }, () => '')]
        : ['', '']
    );
    setPollAnonymous(Boolean(rawPoll?.anonymous));
    setPollMultiple(Boolean(rawPoll?.multiple));
    if (activeBoard === '수술일정' || activeBoard === 'MRI일정') {
      const parts = (post.title || '').split(' ');
      if (['좌측', '우측'].includes(parts[0])) {
        setScheduleSide(parts[0] === '좌측' ? '좌' : '우');
        setTitle(parts.slice(1).join(' ')); // '좌측 ' 제거
      } else {
        setScheduleSide('');
      }
      setScheduleDate(normalizeScheduleDateValue(post.schedule_date));
      setScheduleTime(normalizeScheduleTimeValue(post.schedule_time));
      // 시간 파싱 (오전/오후 분기)
      if (post.schedule_time) {
        const normalizedExistingTime = normalizeScheduleTimeValue(post.schedule_time);
        const [hh, mm] = normalizedExistingTime.split(':');
        const h = parseInt(hh, 10);
        if (!isNaN(h)) {
          if (h >= 12) {
            setSchedulePeriod('오후');
            setScheduleHour(h === 12 ? '12' : String(h - 12).padStart(2, '0'));
          } else {
            setSchedulePeriod('오전');
            setScheduleHour(h === 0 ? '12' : String(h).padStart(2, '0'));
          }
        }
        setScheduleMinute(mm || '00');
      }

      setScheduleRoom(post.schedule_room || '');
      setSchedulePatient(post.patient_name || '');
      setScheduleChartNo(post.content || ''); // 차트번호는 content 컬럼에 저장됨
      setScheduleFasting(!!post.surgery_fasting);
      setScheduleInpatient(!!post.surgery_inpatient);
      setScheduleGuardian(!!post.surgery_guardian);
      setScheduleCaregiver(!!post.surgery_caregiver);
      setScheduleTransfusion(!!post.surgery_transfusion);
      setScheduleContrastRequired(!!post.mri_contrast_required);
    } else {
      setContent(post.content || '');
    }
    setShowNewPost(true);
    setSelectedPostId(null);
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setScheduledPublishAt('');
    setPostStatus('게시중');
    setScheduleDate('');
    setScheduleTime('');
    setSchedulePeriod('');
    setScheduleHour('');
    setScheduleMinute('');
    setScheduleRoom('');
    setSchedulePatient('');
    setScheduleChartNo('');
    setScheduleFasting(false);
    setScheduleInpatient(false);
    setScheduleGuardian(false);
    setScheduleCaregiver(false);
    setScheduleTransfusion(false);
    setScheduleContrastRequired(false);
    setScheduleSide('');
    setAttachmentFiles([]);
    setExistingAttachmentItems([]);
    setTagsInput('');
    setIsAnonymous(false);
    setHasPoll(false);
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollAnonymous(false);
    setPollMultiple(false);
    setEditingPostId(null);
  };

  const uploadBoardAttachment = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('boardType', activeBoard);

    const response = await fetch('/api/board/upload', {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error || '첨부파일 업로드에 실패했습니다.');
    }

    return {
      url: `${payload.url}?t=${Date.now()}`,
      name: String(payload.fileName || file.name || '첨부파일'),
      type: String(
        payload.type ||
          (file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file')
      ),
    };
  }, [activeBoard]);

  const handleNewPost = async () => {
    if (!canCreatePost) {
      toast('이 게시판에 글을 작성할 권한이 없습니다.', 'error');
      return;
    }

    const isScheduleBoard = activeBoard === '수술일정' || activeBoard === 'MRI일정';
    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();
    const normalizedScheduleRoom = scheduleRoom.trim();
    const normalizedSchedulePatient = schedulePatient.trim();
    const normalizedScheduleChartNo = scheduleChartNo.trim();
    const normalizedScheduleDate = normalizeScheduleDateValue(scheduleDate);
    const normalizedScheduledPublishAt = canScheduleNoticePost
      ? normalizeScheduledPublishAtValue(scheduledPublishAt)
      : '';
    const resolvedScheduleTime = buildScheduleTimeValue(schedulePeriod, scheduleHour, scheduleMinute) || scheduleTime;
    const normalizedScheduleTime = normalizeScheduleTimeValue(resolvedScheduleTime);

    if (!normalizedTitle) return toast('제목을 입력해주세요.', 'warning');
    if (isScheduleBoard) {
      if (!scheduleDate || !resolvedScheduleTime) return toast('필수 정보를 입력해주세요.', 'warning');
    } else if (!normalizedContent && attachmentFiles.length === 0 && existingAttachmentItems.length === 0) {
      return toast('내용을 입력해주세요.', 'warning');
    }

    if (isScheduleBoard && (!normalizedScheduleDate || !normalizedScheduleTime)) {
      return toast('필수 정보를 입력해 주세요.', 'warning');
    }

    if (canScheduleNoticePost && scheduledPublishAt && !normalizedScheduledPublishAt) {
      return toast('예약 게시 시간을 다시 확인해 주세요.', 'warning');
    }

    setLoading(true);
    try {
      const tags = tagsInput ? tagsInput.split(',').map((t) => t.trim()).filter(Boolean) : [];
      const useAnonymous = activeBoard === '익명소리함' || isAnonymous;
      const postData: Partial<BoardPost> & Record<string, unknown> = {
        board_type: activeBoard,
        title: normalizedTitle,
        content: isScheduleBoard
          ? buildScheduleMetaContent(normalizedScheduleChartNo, {
              date: normalizedScheduleDate,
              time: normalizedScheduleTime,
              room: normalizedScheduleRoom,
              patient: normalizedSchedulePatient,
              fasting: scheduleFasting,
              inpatient: scheduleInpatient,
              guardian: scheduleGuardian,
              caregiver: scheduleCaregiver,
              transfusion: scheduleTransfusion,
              contrast: activeBoard === 'MRI일정' ? scheduleContrastRequired : false,
            }) || null
          : normalizedContent || null,
        status: normalizeBoardPostStatus(postStatus),
        company: user?.company || null,
        tags: tags,
        author_name: useAnonymous ? '익명' : (user?.name || '익명'),
        author_id: useAnonymous ? null : user?.id,
        is_anonymous: useAnonymous,
      };
      if (!editingPostId) {
        postData.likes_count = 0;
        postData.created_at = new Date().toISOString();
      }
      // 투표 데이터 포함
      if (hasPoll) {
        const validOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
        if (validOptions.length < 2) {
          toast('투표 항목을 2개 이상 입력해주세요.', 'warning');
          setLoading(false);
          return;
        }
        postData.poll = {
          question: pollQuestion.trim() || normalizedTitle,
          options: validOptions,
          anonymous: pollAnonymous,
          multiple: pollMultiple,
        };
      } else if (editingPostId) {
        postData.poll = null;
      }
      if (user?.company_id) {
        postData.company_id = user.company_id;
      }
      if (activeBoard === '공지사항') {
        postData.scheduled_publish_at = normalizedScheduledPublishAt || null;
      }

      // 수술/검사 일정의 경우 수술 관련 체크값을 함께 저장
      if (isScheduleBoard) {
        postData.schedule_date = normalizedScheduleDate || null;
        postData.schedule_time = normalizedScheduleTime || null;
        postData.schedule_room = normalizedScheduleRoom || null;
        postData.patient_name = normalizedSchedulePatient || null;
        postData.surgery_fasting = scheduleFasting;
        postData.surgery_inpatient = scheduleInpatient;
        postData.surgery_guardian = scheduleGuardian;
        postData.surgery_caregiver = scheduleCaregiver;
        postData.surgery_transfusion = scheduleTransfusion;
        postData.mri_contrast_required = activeBoard === 'MRI일정' ? scheduleContrastRequired : null;
        const sidePrefix = scheduleSide === '좌' ? '좌측 ' : scheduleSide === '우' ? '우측 ' : '';
        postData.title = sidePrefix + (postData.title || '');
        postData.content =
          buildBoardMetaContent(String(postData.content || ''), {
            status: normalizeBoardPostStatus(postStatus),
          }) || null;
      }

      // 공지/자유/경조사/소리함: 사진·동영상·파일 첨부 업로드
      const boardWithAttach = ['공지사항', '자유게시판', '경조사', '익명소리함'];
      if (boardWithAttach.includes(activeBoard) && attachmentFiles.length > 0) {
        const uploaded: { url: string; name: string; type: string }[] = [];
        let lastUploadError: string | null = null;
        for (let i = 0; i < attachmentFiles.length; i++) {
          const file = attachmentFiles[i];
          try {
            const uploadedItem = await uploadBoardAttachment(file);
            uploaded.push(uploadedItem);
          } catch (uploadError) {
            lastUploadError =
              uploadError instanceof Error ? uploadError.message : String(uploadError || '첨부 업로드 실패');
            console.error('[게시판 첨부 업로드 실패]', uploadError);
          }
        }
        if (uploaded.length === 0 && attachmentFiles.length > 0) {
          toast('첨부파일 업로드에 실패했습니다.\n\n' +
            (lastUploadError ? `원인: ${lastUploadError}\n\n` : '') +
            'Supabase 대시보드 → SQL Editor에서 storage_board_attachments.sql 내용을 실행했는지 확인해 주세요.', 'error');
          setLoading(false);
          return;
        }
        if (uploaded.length < attachmentFiles.length) {
          console.warn('일부 첨부만 업로드됨.', lastUploadError);
        }
        postData.attachments = uploaded;
      }

      if (!isScheduleBoard) {
        const uploadedAttachments = Array.isArray(postData.attachments) ? (postData.attachments as AttachmentItem[]) : [];
        const persistedAttachments = [...existingAttachmentItems, ...uploadedAttachments];
        const shouldPersistAttachments = boardWithAttach.includes(activeBoard);
        let normalizedBoardContent = normalizedContent || '';
        const normalizedPostMeta = {
          scheduled_publish_at: activeBoard === '공지사항' ? normalizedScheduledPublishAt || undefined : undefined,
          status: normalizeBoardPostStatus(postStatus),
        };
        if (shouldPersistAttachments) {
          postData.attachments = persistedAttachments;
          if (persistedAttachments.length > 0) {
            normalizedBoardContent = buildAttachmentMetaContent(normalizedBoardContent, persistedAttachments);
          }
        }
        postData.content = buildBoardMetaContent(normalizedBoardContent, normalizedPostMeta) || null;
      }

      // 수정 모드인 경우 업데이트
      if (editingPostId) {
        if (isScheduleBoard && !isDepartmentHead) {
          if (!confirm('부서장 이상 권한이 필요합니다. 관리자(간호과장 등)에게 일정 수정 승인 결재를 상신하시겠습니까?')) {
            setLoading(false);
            return;
          }
          await sendScheduleApprovalRequest({ id: editingPostId, title: postData.title ?? '', board_type: activeBoard } as unknown as BoardPost, '수정', postData);
          resetForm();
          setShowNewPost(false);
          setLoading(false);
          return;
        }

        const { error: updateError, payload: persistedPostData } = await runBoardPostMutation(
          (payload) => supabase.from('board_posts').update(payload).eq('id', editingPostId),
          postData
        );
        if (!updateError) {
          toast('게시물이 수정되었습니다.', 'success');
          const normalizedUpdatedPost = normalizeBoardPost({ ...persistedPostData });
          setPosts((prev) => prev.map(p => p.id === editingPostId ? { ...p, ...normalizedUpdatedPost } : p));
          setSelectedPostId(editingPostId);
          if (isScheduleBoard && normalizedScheduleDate) {
            setCalendarMonth(new Date(`${normalizedScheduleDate}T00:00:00`));
          }
          resetForm();
          setShowNewPost(false);
        } else {
          toast('게시물 수정 중 오류가 발생했습니다.', 'error');
        }
        setLoading(false);
        return;
      }

      const { data: insertedPost, error } = await runBoardPostMutation<BoardPost>(
        (payload) => supabase.from('board_posts').insert([payload]).select().single(),
        postData
      );
      if (!error && insertedPost) {
        if (attachmentFiles.length > 0 && (!insertedPost.attachments || (Array.isArray(insertedPost.attachments) && insertedPost.attachments.length === 0))) {
          console.warn('첨부파일이 저장되지 않았을 수 있습니다. Supabase에 board_posts_attachments.sql 적용 및 board-attachments 버킷 생성 여부를 확인하세요.');
        }
        const normalizedInsertedPost = normalizeBoardPost(insertedPost);
        toast('게시물이 등록되었습니다.', 'success');
        resetForm();
        setShowNewPost(false);
        setPosts((prev) => [normalizedInsertedPost, ...prev]);
        setSelectedPostId(normalizedInsertedPost.id);
        if (isScheduleBoard && normalizedScheduleDate) {
          setCalendarMonth(new Date(`${normalizedScheduleDate}T00:00:00`));
        }
        const shouldNotifyImmediately =
          activeBoard === '경조사' ||
          (activeBoard === '공지사항' &&
            (!normalizedScheduledPublishAt || new Date(normalizedScheduledPublishAt).getTime() <= Date.now()));
        if (shouldNotifyImmediately) {
          // 1) 전 직원 알림 발송
          try {
            const { data: staffList } = await supabase.from('staff_members').select('id');
            const staffIds = (staffList || []).map((s: { id: string }) => s.id).filter(Boolean);
            if (staffIds.length > 0) {
              const label = activeBoard === '공지사항' ? '📢 새 공지사항' : '🎉 새 경조사';
              const body = (normalizedInsertedPost.title || '(제목 없음)').slice(0, 80);
              const rows = staffIds.map((userId: string) => ({
                user_id: userId,
                type: 'board',
                title: label,
                body,
              }));
              await supabase.from('notifications').insert(rows);
            }
          } catch (e) {
            console.warn('게시판 전 직원 알림 발송 실패:', e);
          }

          // 2) 공지 채팅방 자동 메시지 전송 (공지사항·경조사)
          if (BOARD_AUTO_CHAT_TYPES.has(activeBoard)) {
            try {
              const boardIcon = activeBoard === '공지사항' ? '📢' : '🎉';
              const postTitle = (normalizedInsertedPost.title || '(제목 없음)').slice(0, 120);
              const rawContent = typeof normalizedInsertedPost.content === 'string'
                ? normalizedInsertedPost.content : '';
              // 첨부 메타 제거 후 미리보기
              const cleanContent = rawContent
                .replace(/\[\[ATTACHMENTS_META\]\][\s\S]*?\[\[\/ATTACHMENTS_META\]\]/g, '')
                .replace(/\[\[BOARD_META\]\][\s\S]*?\[\[\/BOARD_META\]\]/g, '')
                .replace(/\[\[SCHEDULE_META\]\][\s\S]*?\[\[\/SCHEDULE_META\]\]/g, '')
                .trim();
              const preview = cleanContent.slice(0, 100).replace(/\n+/g, ' ').trim();
              const chatContent = [
                `${boardIcon} [${activeBoard}] ${postTitle}`,
                preview || null,
              ].filter(Boolean).join('\n');
              const senderId = effectiveBoardUserId || String(user?.id || '').trim();
              if (senderId) {
                const { data: insertedMsg } = await supabase.from('messages').insert([{
                  room_id: NOTICE_ROOM_ID,
                  sender_id: senderId,
                  sender_name: useAnonymous ? '관리자' : (user?.name || '관리자'),
                  content: chatContent,
                }]).select('id').single();
                // 공지 채팅방 push 알림 트리거
                if (insertedMsg?.id) {
                  try {
                    await fetch('/api/notifications/chat-push', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ roomId: NOTICE_ROOM_ID, messageId: insertedMsg.id }),
                    });
                  } catch {
                    // push 실패는 무시 (메시지는 이미 전송됨)
                  }
                }
              }
            } catch (e) {
              console.warn('공지 채팅방 자동 메시지 전송 실패:', e);
            }
          }
        }
      } else {
        const hint = (activeBoard === '수술일정' || activeBoard === 'MRI일정') && (((error as Record<string, unknown>)?.message as string || "").includes('column') || ((error as Record<string, unknown>)?.code) === '42703')
          ? '\n\n수술일정/MRI일정용 컬럼이 없을 수 있습니다. Supabase에 board_posts_schedule_columns.sql 마이그레이션을 적용해 주세요.'
          : '';
        toast(`게시물 등록에 실패했습니다.\n\n${(error as Record<string, unknown>)?.message || ''}${hint}`, 'error');
      }
    } catch (error: unknown) {
      console.error('게시물 등록 실패:', error);
      const errObj = error as Record<string, unknown>;
      const msg = typeof errObj?.message === 'string' ? errObj.message : '';
      const hint = (activeBoard === '수술일정' || activeBoard === 'MRI일정') && (msg.includes('column') || ((error as Record<string, unknown>)?.code) === '42703')
        ? '\n\n수술일정/MRI일정용 컬럼이 없을 수 있습니다. Supabase에 board_posts_schedule_columns.sql 마이그레이션을 적용해 주세요.'
        : '';
      toast(`게시물 등록에 실패했습니다.\n\n${msg}${hint}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (visibleBoards.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--muted)] p-4 text-center">
        <div className="mb-4 text-6xl">🔒</div>
        <h2 className="text-xl font-bold text-[var(--foreground)]">게시판 접근 권한이 없습니다.</h2>
        <p className="mt-2 text-sm font-semibold text-[var(--toss-gray-3)]">
          메인 메뉴 권한과 게시판 읽기 권한을 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-x-hidden app-page"
      data-testid="board-view"
    >
      {/* 상세 메뉴(공지사항·자유게시판 등)는 메인 좌측 사이드바에서 게시판 호버/클릭 시 플라이아웃으로 선택 */}
      {activeBoard === '업무가이드' ? (
        <div className="flex-1 min-h-0">
          <GuideLibrary
            user={user}
            selectedCo={selectedCo}
            selectedCompanyId={selectedCompanyId}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar p-4 md:p-4 space-y-4 md:space-y-4 pb-24 md:pb-8">
          <header className="shrink-0">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg md:text-xl font-bold text-[var(--foreground)] tracking-tight">{currentBoardMeta.title}</h2>
                <p className="mt-1 text-[11px] md:text-xs text-[var(--toss-gray-3)] font-bold">{currentBoardMeta.description}</p>
              </div>
              {canCreatePost && (
                <div className="flex justify-start md:justify-end">
                  <button
                    data-testid="board-toggle-new-post"
                    onClick={() => setShowNewPost(!showNewPost)}
                    className="px-4 md:px-4 py-2.5 md:py-3 bg-[var(--accent)] text-white rounded-full text-[11px] md:text-xs font-bold shadow-sm hover:opacity-95 active:scale-[0.98] transition-all"
                  >
                    {showNewPost ? '✕ 취소' : '+ 새 게시물'}
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* 새 게시물 작성 폼 (업무가이드일 때는 표시 안함) */}
          {showNewPost && activeBoard !== '업무가이드' && (
            <div data-testid="board-new-post-form" className="bg-[var(--card)] p-4 md:p-4 border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-[var(--foreground)]">새 게시물 작성</h3>
                {(activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!VALID_BODY_IDS.has(selectedBodyPart)) setSelectedBodyPart('all');
                      setShowBodyPicker(true);
                    }}
                    className="px-4 py-2 rounded-full bg-[var(--card)] border border-[var(--border)] text-base font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)] shrink-0"
                  >
                    👤 사람 모형으로 선택
                  </button>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  {(activeBoard === '수술일정' || activeBoard === 'MRI일정') ? (
                    <div className="space-y-3">
                      <select
                        value=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          setTitle(v);
                        }}
                        className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-xs font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                      >
                        <option value="">
                          {activeBoard === '수술일정'
                            ? '자주 쓰는 수술명 선택 (부위 선택 또는 사람 모형에서 선택 가능)'
                            : '자주 쓰는 검사명 선택 (부위 선택 또는 사람 모형에서 선택 가능)'}
                        </option>
                        {filteredTemplates.map((t) => (
                          <option key={t.id} value={t.name}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2 items-stretch">
                        <input
                          data-testid="board-schedule-title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder={
                            activeBoard === '수술일정'
                              ? '수술명을 입력하거나 위에서 선택하세요.'
                              : '검사명을 입력하거나 위에서 선택하세요.'
                          }
                          className="flex-1 min-w-0 p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                        />
                        <div className="flex rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden bg-[var(--muted)] shrink-0 min-w-[120px]">
                          <button
                            type="button"
                            onClick={() => setScheduleSide(scheduleSide === '좌' ? '' : '좌')}
                            className={`flex-1 min-w-[56px] px-4 py-3 text-sm font-bold transition-colors ${scheduleSide === '좌' ? 'bg-[var(--accent)] text-white' : 'text-[var(--toss-gray-4)] hover:bg-[var(--border)]'}`}
                          >
                            좌
                          </button>
                          <button
                            type="button"
                            onClick={() => setScheduleSide(scheduleSide === '우' ? '' : '우')}
                            className={`flex-1 min-w-[56px] px-4 py-3 text-sm font-bold transition-colors ${scheduleSide === '우' ? 'bg-[var(--accent)] text-white' : 'text-[var(--toss-gray-4)] hover:bg-[var(--border)]'}`}
                          >
                            우
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">제목</label>
                      <input
                        data-testid="board-new-post-title"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="게시물 제목을 입력하세요."
                        className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                      />
                      <div className="mt-4">
                        <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">
                          게시 상태
                        </label>
                        <select
                          data-testid="board-post-status"
                          value={postStatus}
                          onChange={(e) => setPostStatus(normalizeBoardPostStatus(e.target.value))}
                          className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                        >
                          {BOARD_POST_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                {(activeBoard === '수술일정' || activeBoard === 'MRI일정') ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">날짜 (YYYY-MM-DD)</label>
                        <SmartDatePicker
                          data-testid="board-schedule-date"
                          value={scheduleDate}
                          onChange={setScheduleDate}
                          placeholder="0000-00-00"
                          inputClassName="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">시간</label>
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            data-testid="board-schedule-period"
                            value={schedulePeriod}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSchedulePeriod(v);
                              updateScheduleTime(v, scheduleHour, scheduleMinute);
                            }}
                            className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] border-[var(--border)] outline-none text-xs font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                          >
                            <option value="">오전/오후</option>
                            <option value="오전">오전</option>
                            <option value="오후">오후</option>
                          </select>
                          <select
                            data-testid="board-schedule-hour"
                            value={scheduleHour}
                            onChange={(e) => {
                              const v = e.target.value;
                              setScheduleHour(v);
                              updateScheduleTime(schedulePeriod, v, scheduleMinute);
                            }}
                            className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] border-[var(--border)] outline-none text-xs font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                          >
                            <option value="">시간</option>
                            {Array.from({ length: 12 }).map((_, idx) => {
                              const h = idx + 1;
                              const v = String(h).padStart(2, '0');
                              return (
                                <option key={v} value={v}>{v}시</option>
                              );
                            })}
                          </select>
                          <select
                            data-testid="board-schedule-minute"
                            value={scheduleMinute}
                            onChange={(e) => {
                              const v = e.target.value;
                              setScheduleMinute(v);
                              updateScheduleTime(schedulePeriod, scheduleHour, v);
                            }}
                            className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] border-[var(--border)] outline-none text-xs font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                          >
                            <option value="">분</option>
                            <option value="00">00분</option>
                            <option value="30">30분</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">수술실/검사실</label>
                        <input value={scheduleRoom} onChange={e => setScheduleRoom(e.target.value)} placeholder="예: 수술실 1" className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20" />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">환자명</label>
                        <input value={schedulePatient} onChange={e => setSchedulePatient(e.target.value)} placeholder="환자명 입력" className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20" />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">차트번호</label>
                        <input value={scheduleChartNo} onChange={e => setScheduleChartNo(e.target.value)} placeholder="예: 12345" className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20" />
                      </div>
                    </div>
                    {(activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
                      <div className="space-y-3">
                        <label className="text-[15px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-1.5 block">
                          {activeBoard === '수술일정' ? '수술 관련 체크' : '촬영 관련 체크'}
                        </label>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-base font-bold text-[var(--toss-gray-4)]">
                          <label className="inline-flex items-center gap-3 cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={scheduleFasting}
                              onChange={(e) => setScheduleFasting(e.target.checked)}
                              className="w-6 h-6 rounded border-[var(--border)]"
                            />
                            <span>금식 필요</span>
                          </label>
                          <span className="inline-flex items-center gap-x-6 shrink-0 flex-nowrap">
                            <label className="inline-flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={scheduleInpatient}
                                onChange={(e) => setScheduleInpatient(e.target.checked)}
                                className="w-6 h-6 rounded border-[var(--border)]"
                              />
                              <span>입원 예정</span>
                            </label>
                            <label className="inline-flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={scheduleGuardian}
                                onChange={(e) => setScheduleGuardian(e.target.checked)}
                                className="w-6 h-6 rounded border-[var(--border)]"
                              />
                              <span>보호자 동반</span>
                            </label>
                          </span>
                          <label className="inline-flex items-center gap-3 cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={scheduleCaregiver}
                              onChange={(e) => setScheduleCaregiver(e.target.checked)}
                              className="w-6 h-6 rounded border-[var(--border)]"
                            />
                            <span>간병인 배치</span>
                          </label>
                          <label className="inline-flex items-center gap-3 cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={scheduleTransfusion}
                              onChange={(e) => setScheduleTransfusion(e.target.checked)}
                              className="w-6 h-6 rounded border-[var(--border)]"
                            />
                            <span>수혈 필요</span>
                          </label>
                        </div>
                      </div>
                    )}
                    {activeBoard === 'MRI일정' && (
                      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                        <label className="inline-flex items-center gap-3 cursor-pointer text-sm font-bold text-[var(--foreground)]">
                          <input
                            type="checkbox"
                            checked={scheduleContrastRequired}
                            onChange={(e) => setScheduleContrastRequired(e.target.checked)}
                            className="h-5 w-5 rounded border-[var(--border)]"
                          />
                          <span>조영제 필요</span>
                        </label>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-semibold ${getBoardStatusTone(postStatus)}`}>
                        {normalizeBoardPostStatus(postStatus)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">태그 (쉼표로 구분)</label>
                      <input
                        value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                        placeholder="예: 공지, 회의, 환영"
                        className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20 mb-4"
                      />
                    </div>
                    {canScheduleNoticePost && (
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">
                          예약 게시 시간
                        </label>
                        <input
                          type="datetime-local"
                          value={scheduledPublishAt}
                          onChange={(e) => setScheduledPublishAt(e.target.value)}
                          className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                        />
                        <p className="mt-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                          비워두면 즉시 게시되고, 지정하면 해당 시각 전까지는 관리자 이상에게만 보입니다.
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">내용</label>
                      <textarea
                        data-testid="board-new-post-content"
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        placeholder="게시물 내용을 입력하세요."
                        className="w-full h-32 md:h-48 p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] border-none outline-none text-sm font-bold leading-relaxed focus:ring-2 focus:ring-[var(--accent)]/20 resize-none"
                      />
                    </div>
                    {/* 익명 작성 + 투표 옵션 */}
                    {activeBoard !== '익명소리함' && (
                      <div className="flex flex-wrap gap-4 items-center py-2">
                        <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-bold text-[var(--toss-gray-4)]">
                          <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} className="w-4 h-4 rounded border-[var(--border)] accent-[var(--accent)]" />
                          익명 작성
                        </label>
                        <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-bold text-[var(--toss-gray-4)]">
                          <input type="checkbox" checked={hasPoll} onChange={(e) => setHasPoll(e.target.checked)} className="w-4 h-4 rounded border-[var(--border)] accent-[var(--accent)]" />
                          투표 추가
                        </label>
                      </div>
                    )}

                    {/* 투표 설정 폼 */}
                    {hasPoll && (
                      <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--toss-blue-light)]/30 p-4 space-y-3">
                        <p className="text-xs font-bold text-[var(--accent)]">투표 설정</p>
                        <input
                          value={pollQuestion}
                          onChange={(e) => setPollQuestion(e.target.value)}
                          placeholder="투표 질문 (비워두면 게시글 제목 사용)"
                          className="w-full p-3 bg-[var(--card)] rounded-lg border border-[var(--border)] outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                        />
                        <div className="space-y-2">
                          {pollOptions.map((opt, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[var(--toss-gray-3)] w-5 text-center">{i + 1}</span>
                              <input
                                value={opt}
                                onChange={(e) => setPollOptions((prev) => prev.map((o, idx) => idx === i ? e.target.value : o))}
                                placeholder={`항목 ${i + 1}`}
                                className="flex-1 p-2.5 bg-[var(--card)] rounded-lg border border-[var(--border)] outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                              />
                              {pollOptions.length > 2 && (
                                <button type="button" onClick={() => setPollOptions((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-500 text-xs font-bold hover:text-red-700">삭제</button>
                              )}
                              {false && (
                                <span className="px-2 py-1 rounded-[var(--radius-md)] bg-violet-50 text-violet-700 text-[11px] font-semibold">
                                  조영제
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        {pollOptions.length < 10 && (
                          <button type="button" onClick={() => setPollOptions((prev) => [...prev, ''])} className="text-xs font-bold text-[var(--accent)] hover:underline">+ 항목 추가</button>
                        )}
                        <div className="flex flex-wrap gap-4">
                          <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-[var(--toss-gray-4)]">
                            <input type="checkbox" checked={pollAnonymous} onChange={(e) => setPollAnonymous(e.target.checked)} className="w-4 h-4 rounded accent-[var(--accent)]" />
                            익명 투표
                          </label>
                          <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-[var(--toss-gray-4)]">
                            <input type="checkbox" checked={pollMultiple} onChange={(e) => setPollMultiple(e.target.checked)} className="w-4 h-4 rounded accent-[var(--accent)]" />
                            복수 선택 허용
                          </label>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">사진·동영상·파일 첨부</label>
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.hwp,.zip"
                        onChange={(e) => {
                          const files = e.target.files ? Array.from(e.target.files) : [];
                          setAttachmentFiles((prev) => [...prev, ...files].slice(0, 10));
                          e.target.value = '';
                        }}
                        className="w-full text-sm font-bold text-[var(--toss-gray-4)] file:mr-3 file:py-2 file:px-4 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--toss-blue-light)] file:text-[var(--accent)] file:font-bold"
                      />
                      {(existingAttachmentItems.length > 0 || attachmentFiles.length > 0) && (
                        <div className="mt-3 space-y-3">
                          {existingAttachmentItems.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                                기존 첨부파일 {existingAttachmentItems.length}개
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {existingAttachmentItems.map((att, i) => (
                                  <div
                                    key={`${att.url}-${i}`}
                                    className="flex max-w-full items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                                  >
                                    <a
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="max-w-[240px] truncate text-xs font-bold text-[var(--accent)] hover:underline"
                                      title={att.name}
                                    >
                                      {att.type === 'image' ? '🖼️ ' : att.type === 'video' ? '🎬 ' : '📎 '}
                                      {att.name}
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExistingAttachmentItems((prev) => prev.filter((_, idx) => idx !== i))
                                      }
                                      className="shrink-0 rounded border border-red-500/20 px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-500/10"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-3">
                            {attachmentFiles.map((f, i) => {
                              const isImg = f.type.startsWith('image/');
                              const isVideo = f.type.startsWith('video/');
                              const url = typeof URL !== 'undefined' ? URL.createObjectURL(f) : '';
                              return (
                                <div key={i} className="relative group">
                                  {isImg && (
                                    <img src={url} alt={f.name} className="w-24 h-24 object-cover rounded-[var(--radius-lg)] border border-[var(--border)]" />
                                  )}
                                  {isVideo && (
                                    <video src={url} className="w-40 h-24 object-cover rounded-[var(--radius-lg)] border border-[var(--border)]" muted playsInline />
                                  )}
                                  {!isImg && !isVideo && (
                                    <div className="w-24 h-24 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] flex items-center justify-center text-[11px] font-bold text-[var(--toss-gray-4)] truncate px-1">
                                      📎 {f.name}
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setAttachmentFiles((prev) => prev.filter((_, idx) => idx !== i))}
                                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500/100 text-white text-xs font-semibold flex items-center justify-center shadow hover:bg-red-600"
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <ul className="space-y-1">
                            {attachmentFiles.map((f, i) => (
                              <li key={i} className="flex items-center gap-2 text-xs font-bold text-[var(--toss-gray-4)]">
                                <span className="truncate flex-1">{f.name}</span>
                                <button
                                  type="button"
                                  onClick={() => setAttachmentFiles((prev) => prev.filter((_, idx) => idx !== i))}
                                  className="shrink-0 px-2.5 py-1.5 rounded border border-red-500/20 text-red-600 hover:bg-red-500/10 text-[11px]"
                                >
                                  삭제
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {isScheduleBoard && !normalizedDraftScheduleDate && (
                <p className="text-[11px] font-semibold text-red-500">
                  날짜를 선택해야만 수술일정/MRI일정을 등록할 수 있습니다.
                </p>
              )}

              <button
                data-testid="board-new-post-submit"
                onClick={handleNewPost}
                disabled={loading || !isScheduleDraftReady}
                className="w-full py-4 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-bold text-sm shadow-sm hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {loading ? '등록 중...' : '게시물 등록'}
              </button>
            </div>
          )}

          {/* 수술/MRI용 사람 모형 선택 모달 - 사람 이미지 + 부위 하이라이트 */}
          {showBodyPicker && (activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-3 md:p-4"
              onClick={() => {
                setShowBodyPicker(false);
                if (!VALID_BODY_IDS.has(selectedBodyPart)) setSelectedBodyPart('all');
              }}
            >
              <div
                className="w-full max-w-[calc(100vw-24px)] md:max-w-7xl max-h-[94vh] bg-[var(--card)] rounded-[var(--radius-xl)] shadow-sm border border-[var(--border)] p-3 md:p-4 flex flex-col md:flex-row gap-3 md:gap-4"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 왼쪽: 생성된 전신 이미지 + 부위 클릭 (이미지와 동일 비율 박스 안에서 좌표 고정) */}
                <div className="flex-1 flex items-center justify-center min-h-[280px] md:min-h-[400px] max-h-[50vh] md:max-h-[640px] bg-[#020617] rounded-[var(--radius-xl)] border border-slate-800 overflow-hidden p-2">
                  <div className="relative w-full max-w-[280px] md:max-w-[400px] aspect-[2/3] max-h-[45vh] md:max-h-[600px] shrink-0 -translate-y-6">
                    <img
                      src="/human-body-mri.png"
                      alt="사람 전신 모형"
                      className="w-full h-full object-contain object-center pointer-events-none select-none"
                    />
                    {/* 부위 클릭 영역: 아래 좌표는 위 이미지(2:3 비율)에 맞춰 고정됨 */}
                    <div className="absolute inset-0">
                      {[
                        { id: 'cervical', top: '12.5%', left: '50%', areaClass: 'w-11 h-11 md:w-12 md:h-12' }, // 목/경추
                        { id: 'chest', top: '24.5%', left: '50%', areaClass: 'w-12 h-12 md:w-14 md:h-14' }, // 흉부
                        { id: 'lumbar', top: '39%', left: '50%', areaClass: 'w-12 h-12 md:w-14 md:h-14' }, // 요추/허리
                        { id: 'hip', top: '55%', left: '50%', areaClass: 'w-12 h-12 md:w-14 md:h-14' }, // 골반/고관절
                        { id: 'shoulder', top: '20.5%', left: '34%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 좌 어깨
                        { id: 'shoulder', top: '20.5%', left: '66%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 우 어깨
                        { id: 'upper_arm', top: '31.5%', left: '28%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 좌 위팔
                        { id: 'upper_arm', top: '31.5%', left: '72%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 우 위팔
                        { id: 'forearm', top: '49%', left: '23%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 좌 아래팔
                        { id: 'forearm', top: '49%', left: '77%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 우 아래팔
                        { id: 'knee', top: '78%', left: '50%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 무릎
                        { id: 'ankle', top: '92.5%', left: '50%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 발목/발
                      ].map((spot, idx) => {
                        const isActive = resolvedBodyPart === spot.id;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedBodyPart(spot.id)}
                            aria-label={`${spot.id} 선택`}
                            style={{ top: spot.top, left: spot.left }}
                            className={`
                        group absolute -translate-x-1/2 -translate-y-1/2
                        flex items-center justify-center
                        ${spot.areaClass} rounded-full border-none bg-transparent
                      `}
                          >
                            {/* 호버/선택 시에만 부위 전체가 은은하게 빛나는 하이라이트 (기본 상태에서는 사람 사진만 보임) */}
                            <span
                              className={`
                          absolute inset-0 rounded-full bg-sky-400/30 blur-lg opacity-0
                          transition-opacity duration-200
                          group-hover:opacity-100
                          ${isActive ? 'opacity-100' : ''}
                        `}
                            />
                            <span
                              className={`
                          relative w-2.5 h-2.5 md:w-3 md:h-3 rounded-full
                          border border-white/80 bg-sky-400/90
                          shadow-[0_0_0_3px_rgba(14,165,233,0.22)]
                          transition-transform duration-200
                          group-hover:scale-110
                          ${isActive ? 'scale-110' : ''}
                        `}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 오른쪽: 선택된 부위에 해당하는 수술/검사명 목록 */}
                <div className="flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
                        {activeBoard === '수술일정' ? '수술명 선택' : '검사명 선택'}
                      </p>
                      <p className="text-xs font-bold text-[var(--toss-gray-4)] mt-1">
                        {BODY_PARTS.find((b) => b.id === resolvedBodyPart)?.label || '전체'} 기준 추천 목록
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBodyPicker(false)}
                      className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
                    >
                      닫기
                    </button>
                  </div>
                  <div className="flex-1 mt-2 bg-[var(--page-bg)] border border-[var(--border)] rounded-[var(--radius-md)] p-2 overflow-y-auto custom-scrollbar">
                    {filteredTemplates.length === 0 ? (
                      <p className="text-[11px] text-[var(--toss-gray-3)] font-bold py-4 text-center">
                        선택한 부위에 해당하는 등록된 수술·검사명이 없습니다.<br />
                        관리자 메뉴의 “수술·검사명”에서 템플릿을 추가해주세요.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {filteredTemplates.map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setTitle(t.name || '');
                                setShowBodyPicker(false);
                              }}
                              className="w-full text-left px-3 py-2 rounded-[var(--radius-md)] text-[12px] font-bold text-[var(--foreground)] hover:bg-[var(--card)] hover:shadow-sm flex items-center gap-2"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                              <span className="flex-1 truncate">{t.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 수술일정·MRI일정용 달력 뷰 */}
          {(activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
            <div className="min-w-0 space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm md:p-4">
              <div className="flex min-w-0 flex-col items-start justify-between gap-4 md:flex-row md:items-center">
                <div className="flex min-w-0 items-center gap-4">
                  <div>
                    <h3 className="text-lg md:text-xl font-semibold text-[var(--foreground)] mt-1">
                      {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
                    </h3>
                  </div>
                </div>

                <div className="flex w-full min-w-0 flex-col gap-2 text-xs font-bold md:w-auto md:flex-row md:items-center">
                  <input
                    value={searchKeyword}
                    onChange={e => setSearchKeyword(e.target.value)}
                    placeholder="환자명 또는 차트번호 검색"
                    className="w-full min-w-0 px-3 py-1.5 font-semibold rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30 md:w-48"
                  />
                  <div className="grid w-full grid-cols-3 gap-2 md:flex md:w-auto">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                        )
                      }
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                    >
                      이전달
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarMonth(new Date())}
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                    >
                      오늘
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                        )
                      }
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                    >
                      다음달
                    </button>
                  </div>
                </div>
              </div>

              {legacySchedulePosts.length > 0 && (
                <div
                  data-testid="board-legacy-schedule-warning"
                  className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-3 text-[11px] text-amber-800"
                >
                  <p className="font-bold">일정 정보가 빠진 예전 게시물이 있어 달력에 표시되지 않습니다.</p>
                  <p className="mt-1 font-semibold text-amber-700">
                    아래 게시물은 날짜와 시간이 저장되지 않아 수정 후 다시 저장해야 합니다.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {legacySchedulePosts.slice(0, 8).map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        data-testid={`board-legacy-schedule-item-${post.id}`}
                        onClick={() => setSelectedPostId(post.id)}
                        className="rounded-[var(--radius-md)] border border-amber-200 bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                      >
                        {post.title || '제목 없음'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(() => {
                const { filteredPosts, eventsByDate, days, month, toKey } = scheduleCalendarData;

                if (filteredPosts.length === 0) {
                  return <div className="empty-state rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)]/30 py-8 text-xs font-bold">등록된 일정이 없습니다.</div>;
                }

                return (
                  <div className="border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                    <div className="grid grid-cols-7 bg-[var(--muted)] text-[11px] font-semibold text-[var(--toss-gray-3)]">
                      {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
                        <div key={d} className="px-2 py-2 text-center">
                          {d}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 bg-[var(--card)] text-[11px]">
                      {days.map((d, idx) => {
                        const key = toKey(d);
                        const inMonth = d.getMonth() === month;
                        const events = eventsByDate[key] || [];
                        return (
                          <div
                            key={key + idx}
                            data-testid={`board-calendar-day-${key}`}
                            className={`min-h-[80px] border border-[var(--border)] p-1.5 align-top ${inMonth ? 'bg-[var(--card)]' : 'bg-[var(--tab-bg)]'
                              }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className={`text-[11px] font-semibold ${!inMonth ? 'text-[var(--toss-gray-3)]' : d.getDay() === 0
                                  ? 'text-red-500'
                                  : d.getDay() === 6
                                    ? 'text-[var(--accent)]'
                                    : 'text-[var(--foreground)]'
                                  }`}
                              >
                                {d.getDate()}
                              </span>
                              {events.length > 0 && (
                                <button
                                  data-testid={`board-calendar-day-count-${key}`}
                                  type="button"
                                  onClick={() => events[0] && setSelectedPostId(events[0].id)}
                                  className="text-[11px] font-semibold text-[var(--accent)] px-2 py-1 rounded-[var(--radius-md)] hover:bg-[var(--toss-blue-light)]"
                                >
                                  {events.length}건
                                </button>
                              )}
                            </div>
                            <div className="space-y-1">
                              {events.slice(0, 4).map((ev: Record<string, unknown>) => (
                                <button
                                  key={ev.id as React.Key}
                                  type="button"
                                  onClick={() => setSelectedPostId(ev.id as string)}
                                  className="w-full text-left px-1.5 py-1 rounded-md bg-[var(--toss-blue-light)]/50 text-[10px] md:text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--toss-blue-light)] flex flex-row items-center gap-1 leading-[1.2] overflow-hidden"
                                >
                                  <span className="text-[var(--accent)] shrink-0">{(ev.schedule_time as string) || ''}</span>
                                  <span className="truncate opacity-80 flex-1 min-w-0">{ev.title as string}</span>
                                  <span className="font-semibold text-emerald-700 dark:text-emerald-400 shrink-0 max-w-[40%] truncate">
                                    {(ev.patient_name as string) || '미지정'} {ev.content ? `(${ev.content as string})` : null}
                                  </span>
                                </button>
                              ))}
                              {events.length > 4 && (
                                <p className="text-[10px] text-[var(--toss-gray-3)] font-bold text-center mt-0.5">
                                  + {events.length - 4}건 더보기
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 게시물 목록 (수술일정·MRI일정은 달력으로만 표시) */}
          {(activeBoard !== '수술일정' && activeBoard !== 'MRI일정') && (
            <div data-testid="board-post-list" className="space-y-2">
              {visiblePosts.length > 0 ? (
                visiblePosts.map((post, idx) => {
                  const rowNumber = visiblePosts.length - idx;
                  const isSchedule = activeBoard === '수술일정' || activeBoard === 'MRI일정';
                  const isPendingScheduledNotice = isScheduledNoticePending(post, noticeVisibilityTick);
                  const hasAttachments = (Array.isArray(post.attachments) ? post.attachments : []).length > 0;
                  return (
                    <div
                      key={post.id || idx}
                      data-testid={`board-post-${post.id}`}
                      className={`bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] px-3 md:px-4 py-2.5 md:py-3 hover:border-[var(--accent)]/40 hover:shadow-md transition-all cursor-pointer`}
                      onClick={() => setSelectedPostId(post.id)}
                    >
                      {(activeBoard === '수술일정' || activeBoard === 'MRI일정') ? (
                        <div className="space-y-2 md:space-y-1">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h3 className="font-bold text-[var(--foreground)] text-base md:text-lg line-clamp-1">{post.title}</h3>
                              <p className="text-[11px] text-[var(--accent)] font-bold mt-1 uppercase tracking-widest">
                                {post.patient_name || '환자명 미지정'} {post.content && <span className="text-[var(--toss-gray-4)] ml-1">| 차트번호: {post.content}</span>}
                              </p>
                            </div>
                            <span className={`px-2 py-1 rounded-[var(--radius-md)] text-[11px] font-semibold shrink-0 ${activeBoard === '수술일정' ? 'bg-red-500/20 text-red-600' : 'bg-purple-500/20 text-purple-600'
                              }`}>
                              {activeBoard === '수술일정' ? '🏥 수술' : '🔬 MRI'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-[var(--border)]">
                            <div>
                              <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">날짜</p>
                              <p className="text-[11px] font-semibold text-[var(--foreground)]">{post.schedule_date}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">시간</p>
                              <p className="text-[11px] font-semibold text-[var(--foreground)]">{post.schedule_time}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">위치</p>
                              <p className="text-[11px] font-semibold text-[var(--foreground)] line-clamp-1">{post.schedule_room}</p>
                            </div>
                          </div>
                          {(post.surgery_fasting || post.surgery_inpatient || post.surgery_guardian || post.surgery_caregiver || post.surgery_transfusion) && (
                            <div className="pt-2 flex flex-wrap gap-1 items-center">
                              {post.surgery_fasting && (
                                <span className="px-2 py-1 rounded-[var(--radius-md)] bg-red-500/10 text-red-600 text-[11px] font-semibold">
                                  금식
                                </span>
                              )}
                              {post.surgery_inpatient && (
                                <span className="px-2 py-1 rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] text-[var(--accent)] text-[11px] font-semibold">
                                  입원
                                </span>
                              )}
                              {post.surgery_guardian && (
                                <span className="px-2 py-1 rounded-[var(--radius-md)] bg-emerald-50 text-emerald-600 text-[11px] font-semibold">
                                  보호자 동반
                                </span>
                              )}
                              {post.surgery_caregiver && (
                                <span className="px-2 py-1 rounded-[var(--radius-md)] bg-purple-500/10 text-purple-600 text-[11px] font-semibold">
                                  간병인
                                </span>
                              )}
                              {post.surgery_transfusion && (
                                <span className="px-2 py-1 rounded-[var(--radius-md)] bg-red-500/10 text-red-700 text-[11px] font-semibold ml-auto">
                                  수혈
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 md:gap-3 text-[11px] md:text-xs">
                          <div className="w-8 text-center text-[11px] font-bold text-[var(--toss-gray-3)] shrink-0">
                            {rowNumber}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <p className="min-w-0 flex-1 font-bold text-[var(--foreground)] truncate group-hover:text-[var(--accent)]">
                                {post.title}
                              </p>
                              <div className="shrink-0 flex items-center gap-1 whitespace-nowrap">
                                <span
                                  data-testid={`board-post-status-pill-${post.id}`}
                                  className={`shrink-0 rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-semibold ${getBoardStatusTone(post.status)}`}
                                >
                                  {normalizeBoardPostStatus(post.status)}
                                </span>
                                {isPendingScheduledNotice && (
                                  <span className="shrink-0 rounded-[var(--radius-md)] bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                                    예약
                                  </span>
                                )}
                                {hasAttachments && (
                                  <span
                                    data-testid={`board-post-attachment-indicator-${post.id}`}
                                    className="shrink-0 leading-none text-[var(--toss-gray-3)]"
                                    title="첨부파일 있음"
                                    aria-label="첨부파일 있음"
                                  >
                                    📎
                                  </span>
                                )}
                                {false && (
                                  <span className="px-2 py-1 rounded-[var(--radius-md)] bg-violet-50 text-violet-700 text-[11px] font-semibold">
                                    조영제 필요
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="hidden md:flex w-32 text-[11px] font-bold text-[var(--toss-gray-3)] justify-center shrink-0">
                            {post.author_name || '익명'}
                          </div>
                          <div
                            data-testid={`board-post-date-${post.id}`}
                            className="w-[72px] md:w-24 text-[10px] md:text-[11px] font-bold text-[var(--toss-gray-3)] text-center shrink-0"
                          >
                            {isPendingScheduledNotice && post.scheduled_publish_at
                              ? new Date(post.scheduled_publish_at).toLocaleDateString()
                              : new Date(post.created_at ?? '').toLocaleDateString()}
                          </div>
                          <div className="w-12 md:w-14 text-[10px] md:text-[11px] font-bold text-[var(--toss-gray-3)] text-center shrink-0">
                            조회 {(post.views as number) ?? 0}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleLike(post); }}
                            className={`w-12 md:w-14 text-[10px] md:text-[11px] font-bold text-center shrink-0 transition ${myLikedPostIds.has(String(post.id ?? '').trim()) ? 'text-red-500' : 'text-[var(--toss-gray-3)] hover:text-red-400'}`}
                          >
                            {myLikedPostIds.has(String(post.id ?? '').trim()) ? '♥' : '♡'} {(post.likes_count as number) ?? 0}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                <div className="empty-state rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)]/30 py-20">
                  <p className="font-semibold text-sm italic">
                    {activeBoard === '익명소리함' && !(user?.permissions?.mso || user?.role === 'admin' || user?.permissions?.hr)
                      ? '🙌 작성된 소중한 의견은 인사팀 및 경영진에게만 안전하게 익명으로 전달됩니다.'
                      : '게시물이 없습니다.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* (근무현황 영역 제거됨) */}

          {/* 게시글 상세 보기 모달 */}
          {selectedPost && (
            <div data-testid="board-post-detail-overlay" className="fixed inset-0 z-[110] flex items-end md:items-center justify-center bg-black/40 p-0 md:p-5">
              <div data-testid="board-post-detail" className="w-full max-w-4xl max-h-[90dvh] overflow-y-auto bg-[var(--card)] border-0 md:border border-[var(--border)] rounded-t-[24px] md:rounded-[var(--radius-xl)] shadow-sm p-3 md:p-4 pb-8 space-y-4 md:space-y-5 text-[13px] md:text-[14px] safe-area-pb">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-[11px] md:text-[12px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">
                      {selectedPost.board_type as string}
                    </p>
                    <h3 className="text-lg md:text-xl font-semibold text-[var(--foreground)]">
                      {selectedPost.title}
                    </h3>
                    <p className="mt-2 text-[11px] md:text-[12px] text-[var(--toss-gray-3)] font-bold">
                      👤 {selectedPost.author_name || '익명'} ·{' '}
                      {new Date(selectedPost.created_at ?? '').toLocaleString('ko-KR')}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-semibold ${getBoardStatusTone(selectedPost.status)}`}>
                        {normalizeBoardPostStatus(selectedPost.status)}
                      </span>
                    </div>
                    {selectedPost.board_type === '공지사항' && selectedPost.scheduled_publish_at && (
                      <p className="mt-1 text-[11px] md:text-[12px] font-bold text-amber-700">
                        예약 게시: {new Date(selectedPost.scheduled_publish_at).toLocaleString('ko-KR')}
                        {isScheduledNoticePending(selectedPost, noticeVisibilityTick) ? ' · 게시 전' : ' · 게시됨'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleLike(selectedPost)}
                      disabled={!!likingPostId}
                      className={`px-3 py-1.5 rounded-[var(--radius-md)] border text-[11px] font-bold transition ${
                        myLikedPostIds.has(String(selectedPost.id ?? '').trim())
                          ? 'border-red-500/20 text-red-500 bg-red-500/10 hover:bg-red-500/20'
                          : 'border-[var(--border)] text-[var(--toss-gray-3)] hover:text-red-400 hover:border-red-500/20'
                      }`}
                    >
                      {myLikedPostIds.has(String(selectedPost.id ?? '').trim()) ? '♥' : '♡'} 좋아요 {(selectedPost.likes_count as number) ?? 0}
                    </button>
                    <button
                      type="button"
                      onClick={() => void openReadStatusModal(selectedPost)}
                      className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)]"
                    >
                      읽음 확인
                    </button>
                    {(canEditPost(selectedPost) || canDeletePost(selectedPost)) && (
                      <>
                        {canEditPost(selectedPost) && (
                          <button
                            type="button"
                            onClick={() => handleEditPostStart(selectedPost)}
                            className="px-3 py-1.5 rounded-[var(--radius-md)] border border-blue-100 text-[11px] font-bold text-blue-600 hover:bg-blue-500/10"
                          >
                            수정
                          </button>
                        )}
                        {canDeletePost(selectedPost) && (
                          <button
                            type="button"
                            onClick={() => handleDeletePost(selectedPost)}
                            className="px-3 py-1.5 rounded-[var(--radius-md)] border border-red-100 text-[11px] font-bold text-red-600 hover:bg-red-500/10"
                          >
                            삭제
                          </button>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      data-testid="board-post-detail-close"
                      onClick={() => setSelectedPostId(null)}
                      className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
                    >
                      닫기
                    </button>
                  </div>
                </div>

                {/* 투표 표시 */}
                {((selectedPost as Record<string, unknown>).poll ? (() => {
                  const poll = (selectedPost as Record<string, unknown>).poll as { question?: string; options?: string[]; anonymous?: boolean; multiple?: boolean };
                  const votes = ((selectedPost as Record<string, unknown>).poll_votes || {}) as Record<string, string[]>;
                  const myId = effectiveBoardUserId;
                  const hasVoted = Object.values(votes).some((arr) => Array.isArray(arr) && arr.includes(String(myId)));
                  const totalVotes = Object.values(votes).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);

                  const handlePostPollVote = async (optIdx: number) => {
                    if (!myId) return;
                    const key = String(optIdx);
                    const currentVotes = { ...votes };
                    // 이미 이 옵션에 투표했으면 취소
                    if (Array.isArray(currentVotes[key]) && currentVotes[key].includes(String(myId))) {
                      currentVotes[key] = currentVotes[key].filter((id: string) => id !== String(myId));
                    } else {
                      if (!poll.multiple) {
                        // 단일 선택: 기존 투표 제거
                        for (const k of Object.keys(currentVotes)) {
                          if (Array.isArray(currentVotes[k])) {
                            currentVotes[k] = currentVotes[k].filter((id: string) => id !== String(myId));
                          }
                        }
                      }
                      currentVotes[key] = [...(currentVotes[key] || []), String(myId)];
                    }
                    await supabase.from('board_posts').update({ poll_votes: currentVotes }).eq('id', selectedPost.id);
                    setPosts((prev) => prev.map((p) => p.id === selectedPost.id ? { ...p, poll_votes: currentVotes } : p));
                    setSelectedPostDetail((prev: BoardPost | null) => prev?.id === selectedPost.id ? { ...prev, poll_votes: currentVotes } : prev);
                  };

                  return (
                    <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--toss-blue-light)]/20 p-4 space-y-3">
                      <p className="text-sm font-bold text-[var(--foreground)]">{poll.question || selectedPost.title}</p>
                      {poll.anonymous && <p className="text-[10px] font-semibold text-[var(--toss-gray-3)]">익명 투표</p>}
                      <div className="space-y-2">
                        {(poll.options || []).map((opt, i) => {
                          const optVotes = Array.isArray(votes[String(i)]) ? votes[String(i)].length : 0;
                          const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                          const myVote = Array.isArray(votes[String(i)]) && votes[String(i)].includes(String(myId));
                          return (
                            <button key={i} type="button" onClick={() => handlePostPollVote(i)} className={`w-full text-left rounded-lg border p-3 transition relative overflow-hidden ${myVote ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/30'}`}>
                              <div className="absolute inset-y-0 left-0 bg-[var(--accent)]/10 transition-all" style={{ width: `${pct}%` }} />
                              <div className="relative flex justify-between items-center">
                                <span className="text-sm font-bold">{myVote ? '✓ ' : ''}{opt}</span>
                                <span className="text-xs font-bold text-[var(--toss-gray-3)]">{optVotes}표 ({pct}%)</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-[var(--toss-gray-3)] font-semibold">총 {totalVotes}표 · {poll.multiple ? '복수 선택' : '단일 선택'}</p>
                    </div>
                  );
                })() : null) as React.ReactNode}

                {(selectedPost.board_type === '수술일정' || selectedPost.board_type === 'MRI일정') && (
                  <div className="space-y-4 border-t border-[var(--border)] pt-4">
                    {Boolean((selectedPost as Record<string, unknown>).schedule_meta_legacy_missing) && (
                      <div
                        data-testid="board-schedule-legacy-warning"
                        className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-3 py-3 text-[11px] font-semibold text-red-700"
                      >
                        이 일정은 예전에 날짜/시간 없이 저장되어 달력에 표시되지 않습니다. 수정 버튼을 눌러 일정 정보를 다시 입력한 뒤 저장해 주세요.
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px] font-bold text-[var(--toss-gray-4)]">
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">수술/검사명</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{selectedPost.title}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">날짜·시간</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                          {selectedPost.schedule_date} {selectedPost.schedule_time}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">위치 / 환자명 (차트번호)</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                          {selectedPost.schedule_room || '위치 미지정'} / {selectedPost.patient_name || '환자 미지정'} {selectedPost.content ? `(${selectedPost.content})` : ''}
                        </p>
                      </div>
                    </div>

                    {(selectedPost.surgery_fasting ||
                      selectedPost.surgery_inpatient ||
                      selectedPost.surgery_guardian ||
                      selectedPost.surgery_caregiver ||
                      selectedPost.surgery_transfusion) && (
                        <div className="bg-[var(--page-bg)] border border-[var(--border)] rounded-[var(--radius-md)] p-3 space-y-1 text-[11px] font-bold text-[var(--toss-gray-4)]">
                          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">수술/검사 준비 상태</p>
                          <div className="flex flex-wrap gap-1 pt-1">
                            {selectedPost.surgery_fasting && (
                              <span className="px-2 py-1 rounded-[var(--radius-md)] bg-red-500/10 text-red-600 text-[11px] font-semibold">
                                금식
                              </span>
                            )}
                            {selectedPost.surgery_inpatient && (
                              <span className="px-2 py-1 rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] text-[var(--accent)] text-[11px] font-semibold">
                                입원
                              </span>
                            )}
                            {selectedPost.surgery_guardian && (
                              <span className="px-2 py-1 rounded-[var(--radius-md)] bg-emerald-50 text-emerald-600 text-[11px] font-semibold">
                                보호자 동반
                              </span>
                            )}
                            {selectedPost.surgery_caregiver && (
                              <span className="px-2 py-1 rounded-[var(--radius-md)] bg-purple-500/10 text-purple-600 text-[11px] font-semibold">
                                간병인
                              </span>
                            )}
                            {selectedPost.surgery_transfusion && (
                              <span className="px-2 py-1 rounded-[var(--radius-md)] bg-red-500/20 text-red-700 text-[11px] font-semibold">
                                수혈 필요
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                    {/* 같은 날짜의 전체 일정 목록 */}
                    {selectedPost.mri_contrast_required && (
                      <div className="rounded-[var(--radius-md)] border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-semibold text-violet-700">
                        조영제 필요
                      </div>
                    )}
                    <div className="bg-[var(--page-bg)] border border-[var(--border)] rounded-[var(--radius-md)] p-3 space-y-2">
                      <p className="text-[11px] font-semibold text-[var(--toss-gray-4)] flex items-center gap-2">
                        📅 {selectedPost.schedule_date || '날짜 미지정'} 의 전체 일정
                      </p>
                      <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1 text-[11px]">
                        {posts
                          .filter(
                            (p: BoardPost) =>
                              p.board_type === selectedPost.board_type &&
                              normalizeScheduleDateValue(p.schedule_date) === normalizeScheduleDateValue(selectedPost.schedule_date)
                          )
                          .map((p: BoardPost) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedPostId(p.id)}
                              className={`w-full flex items-center gap-2 px-2 py-1 rounded-[var(--radius-md)] text-left hover:bg-[var(--card)] ${p.id === selectedPost.id ? 'bg-[var(--card)] shadow-sm border border-[var(--border)]' : ''
                                }`}
                            >
                              <span className="text-[11px] font-bold text-[var(--toss-gray-3)] w-14 shrink-0">
                                {p.schedule_time || ''}
                              </span>
                              <span className="flex-1 truncate font-bold text-[var(--foreground)]">
                                {p.title}
                              </span>
                              <span className="text-[11px] font-bold text-[var(--accent)] shrink-0">
                                {p.patient_name || ''}
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>
                )}

                {selectedPost.content && (
                  <div className="pt-4 border-t border-[var(--border)]">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--toss-gray-4)]">
                      {selectedPost.content}
                    </p>
                  </div>
                )}

                {(Array.isArray(selectedPost.attachments) ? selectedPost.attachments : []).length > 0 && (
                  <div className="pt-4 border-t border-[var(--border)]">
                    <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-2">첨부파일 ({(Array.isArray(selectedPost.attachments) ? selectedPost.attachments : []).length}개)</p>
                    <div className="flex flex-wrap gap-4">
                      {(Array.isArray(selectedPost.attachments) ? selectedPost.attachments as AttachmentItem[] : []).map((att: AttachmentItem, i: number) =>
                        att.type === 'image' ? (
                          <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                            <img
                              src={att.url}
                              alt={att.name}
                              loading="eager"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              className="max-w-[280px] max-h-[280px] rounded-[var(--radius-lg)] border border-[var(--border)] object-cover shadow-sm bg-[var(--muted)]"
                              onError={(e) => {
                                const el = e.target as HTMLImageElement;
                                el.alt = '이미지를 불러올 수 없습니다.';
                                el.classList.add('bg-red-500/10', 'border-red-500/20');
                              }}
                            />
                          </a>
                        ) : att.type === 'video' ? (
                          <div key={i} className="rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden bg-black max-w-[320px]">
                            <video src={att.url} controls className="w-full max-h-[240px]" preload="metadata" />
                            <p className="text-[11px] font-bold text-[var(--toss-gray-4)] p-2 bg-[var(--page-bg)] truncate">{att.name}</p>
                          </div>
                        ) : (
                          <a key={i} href={`/api/download?url=${encodeURIComponent(att.url)}&name=${encodeURIComponent(att.name ?? '')}`} className="inline-flex items-center gap-2 px-3 py-2 rounded-[var(--radius-lg)] bg-[var(--muted)] border border-[var(--border)] text-sm font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)]">
                            📎 {att.name}
                          </a>
                        )
                      )}
                    </div>
                  </div>
                )}

                {(Array.isArray(selectedPost.tags) ? selectedPost.tags : []).length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2">
                    {(Array.isArray(selectedPost.tags) ? selectedPost.tags : []).map(
                      (tag: string, i: number) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-[var(--toss-blue-light)] text-[var(--accent)] rounded-[var(--radius-md)] text-[11px] font-bold"
                        >
                          #{tag}
                        </span>
                      ),
                    )}
                  </div>
                )}

                {/* 댓글 + 대댓글 */}
                <div className="pt-4 border-t border-[var(--border)] space-y-3">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-4)] flex items-center gap-2">
                    💬 댓글
                    <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">
                      {(comments[selectedPost.id] || []).length}개
                    </span>
                  </p>
                  {(() => {
                    const { roots, repliesByParent } = selectedPostCommentTree;
                    return (
                      <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                        {roots.map((c) => (
                          <div key={c.id} className="space-y-1">
                            <div className="text-xs text-[var(--toss-gray-4)] flex gap-2 items-center flex-wrap">
                              <span className="font-bold">{c.author_name}:</span>
                              <span className="flex-1 min-w-0">{c.content}</span>
                              <span className="flex gap-1 shrink-0">
                                {user?.id && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReplyParentId(c.id);
                                      setNewComment('');
                                    }}
                                    className="text-[11px] text-[var(--toss-gray-3)] hover:text-[var(--accent)]"
                                  >
                                    답글
                                  </button>
                                )}
                                {((effectiveBoardUserId && String(c.author_id) === effectiveBoardUserId) || isPrivilegedUser(user)) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComment(selectedPost.id, c.id)}
                                    className="text-[11px] text-[var(--toss-gray-3)] hover:text-[#F04452]"
                                  >
                                    삭제
                                  </button>
                                )}
                              </span>
                            </div>
                            {(repliesByParent[String(c.id)] || []).map((r) => (
                              <div key={r.id} className="ml-6 text-xs text-[var(--toss-gray-4)] flex gap-2 items-center flex-wrap">
                                <span className="font-bold">{r.author_name}:</span>
                                <span className="flex-1 min-w-0">{r.content}</span>
                                {((effectiveBoardUserId && String(r.author_id) === effectiveBoardUserId) || isPrivilegedUser(user)) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComment(selectedPost.id, r.id)}
                                    className="text-[11px] text-[var(--toss-gray-3)] hover:text-[#F04452] shrink-0"
                                  >
                                    삭제
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                        {roots.length === 0 && (
                          <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">첫 댓글을 남겨보세요.</p>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex gap-2">
                    <input
                      data-testid="board-comment-input"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder={user?.id ? '댓글을 입력하세요.' : '로그인한 후 댓글을 입력할 수 있습니다.'}
                      disabled={!user?.id}
                      className="flex-1 px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-xs disabled:bg-[var(--page-bg)] disabled:text-[var(--toss-gray-3)]"
                    />
                    <button
                      type="button"
                      data-testid="board-comment-submit"
                      onClick={() => handleAddComment(selectedPost.id, replyParentId)}
                      disabled={!user?.id}
                      className="px-3 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-xs font-bold hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      등록
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}
          {readStatusPost && (
            <div
              className="fixed inset-0 z-[120] flex items-end md:items-center justify-center bg-black/40 p-0 md:p-5"
              onClick={() => setReadStatusPost(null)}
            >
              <div
                className="w-full max-w-2xl max-h-[80dvh] overflow-y-auto bg-[var(--card)] border-0 md:border border-[var(--border)] rounded-t-[24px] md:rounded-[var(--radius-xl)] shadow-sm p-4 md:p-5 space-y-4 safe-area-pb"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">
                      읽음 현황
                    </p>
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">
                      {readStatusPost.title}
                    </h3>
                    <p className="mt-1 text-[12px] text-[var(--toss-gray-3)] font-medium">
                      읽음 {readStatusReaders.length}명 · 미확인 {readStatusPendingAudience.length}명
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReadStatusPost(null)}
                    className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
                  >
                    닫기
                  </button>
                </div>
                {readStatusLoading ? (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-6 text-center text-sm font-semibold text-[var(--toss-gray-3)]">
                    읽음 현황을 불러오는 중입니다.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--foreground)]">읽음</p>
                        <span className="text-xs font-semibold text-emerald-600">{readStatusReaders.length}명</span>
                      </div>
                      <div className="space-y-2">
                        {readStatusReaders.length > 0 ? (
                          readStatusReaders.map((member) => (
                            <div
                              key={`reader-${String(member.id ?? '')}`}
                              className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)]/40 px-3 py-2"
                            >
                              <p className="text-sm font-semibold text-[var(--foreground)]">{member.name || '이름 없음'}</p>
                              <p className="text-[11px] text-[var(--toss-gray-3)] font-medium">
                                {[member.department, member.position].filter(Boolean).join(' · ') || '부서/직급 미지정'}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-[12px] font-medium text-[var(--toss-gray-3)]">아직 읽은 직원이 없습니다.</p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--foreground)]">미확인</p>
                        <span className="text-xs font-semibold text-amber-600">{readStatusPendingAudience.length}명</span>
                      </div>
                      <div className="space-y-2">
                        {readStatusPendingAudience.length > 0 ? (
                          readStatusPendingAudience.map((member) => (
                            <div
                              key={`pending-${String(member.id ?? '')}`}
                              className="rounded-[var(--radius-md)] bg-amber-50 px-3 py-2"
                            >
                              <p className="text-sm font-semibold text-[var(--foreground)]">{member.name || '이름 없음'}</p>
                              <p className="text-[11px] text-[var(--toss-gray-3)] font-medium">
                                {[member.department, member.position].filter(Boolean).join(' · ') || '부서/직급 미지정'}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-[12px] font-medium text-[var(--toss-gray-3)]">모든 대상자가 읽었습니다.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

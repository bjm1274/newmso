export { NOTICE_ROOM_ID } from '@/lib/constants';
export const BOARD_AUTO_CHAT_TYPES = new Set(['공지사항', '경조사']);

/** 활성 게시판 id (폐지: 익명소리함, 직원제안함) */
export const BOARD_IDS = ['공지사항', '자유게시판', '경조사', '수술일정', 'MRI일정', '업무가이드'];

/** 목록·메뉴에서 제외하는 폐지 보드 */
export const REMOVED_BOARD_TYPES = ['익명소리함', '직원제안함'] as const;
export const BOARD_POST_OPTIONAL_COLUMNS = [
  'board_id',
  'updated_at',
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

export const BOARD_POST_REQUIRED_SELECT_COLUMNS = [
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

export const BOARD_TEMPLATE_REQUIRED_SELECT_COLUMNS = ['id', 'name'] as const;
export const BOARD_TEMPLATE_OPTIONAL_COLUMNS = ['sort_order', 'body_part'] as const;
export const BOARD_COMMENT_SELECT = 'id, post_id, author_id, author_name, content, parent_comment_id, created_at';
export const BOARD_CHAT_ROOM_SELECT = 'id';

// ─── 단일 출처: 이하 심볼은 게시판-view-utils.ts가 canonical 구현을 보유한다.
// 기존 import 경로(게시판공통)를 깨지 않기 위해 re-export 유지.
export type {
  ScheduleMetaPayload,
  BoardMetaPayload,
  BoardReadRow,
  StaffSummary,
  QueryResult,
  BoardPostRow,
  BoardTemplateRow,
  BoardLikeRow,
  BoardChatRoomRow } from './게시판-view-utils';

export {
  BOARD_POST_STATUSES,
  buildSelectColumns,
  inferAttachmentType,
  extractAttachmentMetaFromContent,
  buildAttachmentMetaContent,
  normalizeScheduledPublishAtValue,
  formatScheduledPublishInputValue,
  buildScheduleTimeValue,
  normalizeScheduleDateValue,
  normalizeScheduleTimeValue,
  isScheduleBoardType,
  extractScheduleMetaFromContent,
  buildScheduleMetaContent,
  extractBoardMetaFromContent,
  buildBoardMetaContent,
  normalizeBoardPost,
  isScheduledNoticePending,
  getMissingBoardPostColumn,
  isMissingBoardReadStorageError,
  normalizeBoardPostStatus,
  getBoardStatusTone,
  runBoardPostMutation } from './게시판-view-utils';

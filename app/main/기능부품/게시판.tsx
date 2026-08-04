'use client';
import { logger } from '@/lib/logger';

import { toast } from '@/lib/toast';
import { EmptyState, PermissionState } from '@/app/components/StatePanel';
import { useActionDialog } from '@/app/components/useActionDialog';
import { useDeferredValue, useState, useEffect, useMemo, useRef, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import { canAccessBoard, isAdminUser, isMsoUser, isPrivilegedUser } from '@/lib/access-control';
import { getStaffLikeId, resolveStaffLike } from '@/lib/staff-identity';
import { db } from '@/lib/db-client';
import { subscribeRealtimeBatched } from '@/lib/realtime-bus';
import { withMissingColumnFallback, withMissingColumnsFallback } from '@/lib/db-compat';
import {
  buildStorageDownloadUrl,
  shouldUseManagedBrowserDownload,
  triggerManagedBrowserDownload } from '@/lib/object-storage-url';
import { CHAT_FOCUS_KEY, CHAT_ROOM_KEY } from '@/app/main/navigation-state';
import dynamic from 'next/dynamic';
import PostTableView from './게시판서브/PostTableView';
import BoardMobilePostCard from './게시판서브/BoardMobilePostCard';
import { uploadBoardAttachmentFile } from './게시판업로드';
import type { StaffMember, BoardPost, ScheduleItem, AttachmentItem } from '@/types';
import { BOARD_MENU_ITEMS } from './게시판메뉴';
import {
  BOARD_IDS,
  BOARD_POST_OPTIONAL_COLUMNS,
  BOARD_POST_REQUIRED_SELECT_COLUMNS,
  BOARD_TEMPLATE_REQUIRED_SELECT_COLUMNS,
  BOARD_TEMPLATE_OPTIONAL_COLUMNS,
  BOARD_COMMENT_SELECT,
  BOARD_CHAT_ROOM_SELECT } from './게시판공통';
import {
  buildAttachmentMetaContent,
  buildBoardMetaContent,
  buildScheduleMetaContent,
  buildScheduleTimeValue,
  buildSelectColumns,
  formatScheduledPublishInputValue,
  getBoardPostAuthorSignal,
  isMissingBoardReadStorageError,
  isScheduleBoardType,
  isScheduledNoticePending,
  normalizeBoardPost,
  normalizeBoardPostStatus,
  normalizeScheduleDateValue,
  normalizeScheduleTimeValue,
  normalizeScheduledPublishAtValue,
  runBoardPostMutation,
  type BoardChatRoomRow,
  type BoardLikeRow,
  type BoardPostRow,
  type BoardReadRow,
  type BoardTemplateRow,
  type QueryResult,
  type StaffSummary } from './게시판-view-utils';
import { isAnonymousReadStatusPost, VALID_BODY_IDS } from './게시판/post-helpers';
import { useIsMobile } from '@/app/components/useIsMobile';
import type { BoardPoll } from './게시판서브/board-poll-prize';
import { toggleBoardPostLike } from './게시판서브/board-post-like';
import { insertBoardPost } from './게시판서브/create-board-post';

// 목록 첫 페인트에 불필요한 2차 패널 — 코드 스플릿 (ssr:false)
const BoardSecondaryLoading = () => (
  <div className="flex items-center justify-center py-10">
    <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
  </div>
);

const GuideLibrary = dynamic(() => import('./게시판서브/업무가이드'), {
  ssr: false,
  loading: BoardSecondaryLoading });
const BoardBodyPickerModal = dynamic(() => import('./게시판서브/BoardBodyPickerModal'), {
  ssr: false });
const BoardScheduleCalendar = dynamic(() => import('./게시판서브/BoardScheduleCalendar'), {
  ssr: false,
  loading: BoardSecondaryLoading });
const ReadStatusModal = dynamic(() => import('./게시판/ReadStatusModal'), {
  ssr: false });
// compose / detail — 목록 첫 페인트에서 제외 (열릴 때만 로드)
const BoardComposePanel = dynamic(() => import('./게시판서브/BoardComposePanel'), {
  ssr: false,
  loading: BoardSecondaryLoading });
const BoardDetailPanel = dynamic(() => import('./게시판서브/BoardDetailPanel'), {
  ssr: false,
  loading: BoardSecondaryLoading });

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
  setMainMenu?: (menu: string) => void;
}
/** 게시판 첫 진입 목록 건수. 본문/투표 본문은 목록 select에서 제외됨. 더 보기로 확장. */
const BOARD_POST_PAGE_SIZE = 30;

type BoardCommentRow = {
  id: string;
  author_id?: string;
  author_name?: string;
  content?: string;
  parent_comment_id?: string | null;
  [key: string]: unknown;
};

export default function BoardView({ user, subView, selectedCo, selectedCompanyId, initialBoard, initialPostId, onConsumePostId, setMainMenu }: BoardViewProps) {
  const isMobile = useIsMobile();
  const { dialog, openConfirm } = useActionDialog();
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
  // 경조사 전용 필드 상태
  const [familyEventType, setFamilyEventType] = useState('결혼');
  const [familyEventTarget, setFamilyEventTarget] = useState('');
  const [familyEventDate, setFamilyEventDate] = useState('');
  const [familyEventLocation, setFamilyEventLocation] = useState('');
  const [familyEventAccount, setFamilyEventAccount] = useState('');
  const [familyEventDetail, setFamilyEventDetail] = useState('');
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
  // 상품 추첨
  const [pollPrizeEnabled, setPollPrizeEnabled] = useState(false);
  const [pollPrizeWinnerCount, setPollPrizeWinnerCount] = useState(1);
  const [pollPrizeName, setPollPrizeName] = useState('');
  // 추첨 진행 중 로딩 상태 (postId 저장)
  const [drawingPostId, setDrawingPostId] = useState<string | null>(null);
  const [schedulePeriod, setSchedulePeriod] = useState('');
  const [scheduleHour, setScheduleHour] = useState('');
  const [scheduleMinute, setScheduleMinute] = useState('');
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<Record<string, BoardCommentRow[]>>({});
  const [newComment, setNewComment] = useState('');
  const [myLikedPostIds, setMyLikedPostIds] = useState<Set<string>>(new Set());
  const [postReadMap, setPostReadMap] = useState<Record<string, Set<string>>>({});
  const [postListLimit, setPostListLimit] = useState(BOARD_POST_PAGE_SIZE);
  const [hasMorePosts, setHasMorePosts] = useState(false);

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

  // 수술/MRI 부위 필터 — BODY_PARTS / VALID_BODY_IDS는 게시판/post-helpers.ts에서 import
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

  const handleAttachmentDownloadClick = useCallback(async (
    event: ReactMouseEvent<HTMLAnchorElement>,
    url: string,
    fileName: string,
  ) => {
    const href = buildStorageDownloadUrl(url, fileName);
    if (!href) {
      event.preventDefault();
      toast('다운로드 주소를 만들지 못했습니다.', 'error');
      return;
    }
    if (!shouldUseManagedBrowserDownload()) {
      return;
    }
    event?.preventDefault();
    try {
      await triggerManagedBrowserDownload(href, fileName);
    } catch (error) {
      logger.error('board attachment download failed', error);
      toast('모바일 다운로드에 실패했습니다. 다시 시도해 주세요.', 'error');
    }
  }, []);

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

  const visibleBoards = useMemo(
    () => BOARD_MENU_ITEMS.filter((board) => canAccessBoard(user, board.id, 'read')),
    [user]
  );

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

  const loadBoardReadState = useCallback(async (postIds?: string[], includeAllReaders = false) => {
    if (!includeAllReaders && !effectiveBoardUserId) {
      setPostReadMap({});
      return;
    }
    const targetIds = (postIds || visiblePosts.map((post) => String(post.id ?? '').trim()).filter(Boolean))
      .filter((postId) => {
        const post = visiblePosts.find((item) => String(item.id ?? '').trim() === postId) ||
          posts.find((item) => String(item.id ?? '').trim() === postId);
        return !post || !isAnonymousReadStatusPost(post);
      });
    if (targetIds.length === 0) {
      setPostReadMap({});
      return;
    }

    let query = db
      .from('board_post_reads')
      .select('post_id, user_id, read_at');
    if (!includeAllReaders) {
      query = query.eq('user_id', effectiveBoardUserId);
    }
    const { data, error } = await query.in('post_id', targetIds);

    if (error) {
      if (!isMissingBoardReadStorageError(error)) {
        logger.warn('board read state load failed', error);
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
    targetIds.forEach((postId) => {
      if (!nextMap[postId]) nextMap[postId] = new Set<string>();
    });
    setPostReadMap((prev) => (includeAllReaders ? { ...prev, ...nextMap } : nextMap));
  }, [effectiveBoardUserId, posts, visiblePosts]);

  const markBoardPostRead = useCallback(async (post: BoardPost | null) => {
    if (!post?.id || !effectiveBoardUserId) return;
    if (isAnonymousReadStatusPost(post)) return;
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

    const { error } = await db.from('board_post_reads').upsert(
      [{ post_id: postId, user_id: effectiveBoardUserId, read_at: new Date().toISOString() }],
      { onConflict: 'post_id,user_id' }
    );

    if (error && !isMissingBoardReadStorageError(error)) {
      logger.warn('board read mark failed', error);
    }

    readMarkingRef.current.delete(postId);
  }, [effectiveBoardUserId]);
  const openReadStatusModal = useCallback(async (post: BoardPost) => {
    if (isAnonymousReadStatusPost(post)) {
      toast('익명 게시글·익명 투표 게시글은 읽음 확인을 사용할 수 없습니다.', 'warning');
      return;
    }
    setReadStatusPost(post);
    setReadStatusAudience([]);
    setReadStatusLoading(true);
    try {
      // 공지사항·경조사 등 전사 공지 게시판은 전 직원이 대상
      // 회사 필터 없이 모든 재직 중 직원 조회
      const { data: audienceData } = await db
        .from('staff_members')
        .select('id, name, company, company_id, department, position, status')
        .neq('status', '퇴사')
        .neq('status', '퇴직')
        .order('company', { ascending: true })
        .order('name', { ascending: true });
      setReadStatusAudience((audienceData || []) as StaffSummary[]);
      await loadBoardReadState([String(post.id)], true);
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
        toKey };
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
      toKey };
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

  const fetchPosts = async (requestedLimit = postListLimit) => {
    const requestedBoard = activeBoard;
    const fetchSeq = ++boardFetchSeqRef.current;
    if (!user) return;
    if (!canAccessBoard(user, requestedBoard, 'read')) {
      setPosts([]);
      return;
    }
    if (requestedBoard === '업무가이드') {
      setPosts([]);
      return;
    }

    const isScheduleBoard = isScheduleBoardType(requestedBoard);
    const listRequiredColumns = isScheduleBoard
      ? BOARD_POST_REQUIRED_SELECT_COLUMNS
      : BOARD_POST_REQUIRED_SELECT_COLUMNS.filter(
          (column) => column !== 'content' && column !== 'poll' && column !== 'poll_votes',
        );
    const queryLimit = isScheduleBoard ? 500 : requestedLimit + 1;

    setLoading(true);
    const boardTypeVariants =
      requestedBoard === 'MRI일정'
        ? ['MRI일정', 'MRI일정표', 'mri']
        : requestedBoard === '수술일정'
        ? ['수술일정', '수술']
        : [requestedBoard];

    const { data } = await withMissingColumnsFallback<BoardPostRow[]>(
      async (omittedColumns): Promise<QueryResult<BoardPostRow[]>> => {
        const query = db
          .from('board_posts')
          .select(buildSelectColumns(listRequiredColumns, BOARD_POST_OPTIONAL_COLUMNS, omittedColumns))
          .in('board_type', boardTypeVariants);

        const result = await query
          .order('created_at', { ascending: false })
          .limit(queryLimit * 2);
        return result as unknown as QueryResult<BoardPostRow[]>;
      },
      [...BOARD_POST_OPTIONAL_COLUMNS]
    );

    if (fetchSeq !== boardFetchSeqRef.current) {
      setLoading(false);
      return;
    }

    if (!data || !Array.isArray(data)) {
      setPosts([]);
      setHasMorePosts(false);
      setLoading(false);
      return;
    }

    const fetchedPosts = (data as BoardPostRow[]).map((post) => normalizeBoardPost(post));
    setHasMorePosts(!isScheduleBoard && fetchedPosts.length > requestedLimit);
    setPosts(isScheduleBoard ? fetchedPosts : fetchedPosts.slice(0, requestedLimit));
    setLoading(false);
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
    if (!showBodyPicker || !isScheduleBoardType(activeBoard)) return;
    if (surgeryTemplates.length > 0 && mriTemplates.length > 0) return;
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
              let query = db.from('surgery_templates').select(selectedColumns);
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
              let query = db.from('mri_templates').select(selectedColumns);
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
  }, [activeBoard, showBodyPicker, surgeryTemplates.length, mriTemplates.length]);

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
      other: [] };

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
    const requestedLimit = boardChanged ? BOARD_POST_PAGE_SIZE : postListLimit;
    if (boardChanged) {
      setPosts([]);
      setPostListLimit(BOARD_POST_PAGE_SIZE);
      setHasMorePosts(false);
      setShowNewPost(false);
      resetForm();
    }
    void fetchPosts(requestedLimit);

    // 내 좋아요 목록 로드
    // 다른 게시판에서 다시 수술/MRI 일정으로 돌아올 때는 현재 월 기준으로 달력 리셋
    if (activeBoard === '수술일정' || activeBoard === 'MRI일정') {
      setCalendarMonth(new Date());
    }
  }, [activeBoard, selectedCo, selectedCompanyId, user]);

  useEffect(() => {
    void loadBoardReadState();
  }, [loadBoardReadState]);

  useEffect(() => {
    if (!effectiveBoardUserId) {
      setMyLikedPostIds(new Set());
      return;
    }
    const postIds = posts.map((post) => String(post.id ?? '').trim()).filter(Boolean);
    if (postIds.length === 0) {
      setMyLikedPostIds(new Set());
      return;
    }
    let cancelled = false;
    void db
      .from('board_post_likes')
      .select('post_id')
      .eq('user_id', effectiveBoardUserId)
      .in('post_id', postIds)
      .then(({ data }) => {
        if (cancelled) return;
        setMyLikedPostIds(
          new Set(
            ((data || []) as BoardLikeRow[])
              .map((row) => String(row.post_id ?? '').trim())
              .filter(Boolean),
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveBoardUserId, posts]);

  // board_posts·board_post_reads 두 테이블을 단일 채널(=단일 폴링 interval/단일
  // /api/realtime/tail 요청)로 통합 구독한다. 배치 콜백이 변경된 테이블 목록을
  // 전달하므로 테이블별로 기존과 동일한 핸들러(fetchPosts / loadBoardReadState)를
  // 디스패치해 동작을 보존한다.
  useEffect(() => {
    const unsubscribe = subscribeRealtimeBatched(
      'board-realtime',
      [
        { table: 'board_posts', event: '*' },
      ],
      (payloads) => {
        const changedTables = new Set(
          payloads.map((payload) => (payload as { table?: string } | null)?.table),
        );
        if (changedTables.has('board_posts')) {
          // 좋아요 처리 중이면 realtime fetch 건너뜀 (로컬 state 덮어쓰기 방지)
          if (!likingRef.current) void fetchPosts(postListLimit);
        }
      },
      { pollIntervalMs: 30000 },
    );
    return unsubscribe;
  }, [activeBoard, postListLimit, user?.id]);

  const fetchComments = async (postId: string) => {
    const { data } = await db
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
      const { data: existing } = await db
        .from('chat_rooms')
        .select(BOARD_CHAT_ROOM_SELECT)
        .eq('name', roomName)
        .maybeSingle() as unknown as { data: BoardChatRoomRow | null };
      let roomId = existing?.id;
      if (!roomId) {
        const { data: created, error } = await db
          .from('chat_rooms')
          .insert([
            {
              name: roomName,
              type: 'group',
              members: [effectiveBoardUserId] },
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
      logger.error('openChatForSchedule error', e);
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
      const result = await toggleBoardPostLike(
        effectiveBoardUserId,
        postId,
        isLiked,
        post.likes_count ?? 0,
      );
      if (result.ok) {
        updateLocalLikes(result.likesCount);
      } else {
        logger.error('좋아요 처리 실패:', result.error);
        toast('좋아요 처리 중 오류가 발생했습니다.', 'error');
        updateLocalLikes(post.likes_count ?? 0);
        if (isLiked) {
          setMyLikedPostIds((prev) => new Set([...prev, postId]));
        } else {
          setMyLikedPostIds((prev) => { const next = new Set(prev); next.delete(postId); return next; });
        }
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
    const { data, error } = await db
      .from('board_post_comments')
      .insert([{
        post_id: postId,
        author_id: effectiveBoardUserId,
        author_name: user?.name ?? '익명',
        content: newComment.trim(),
        parent_comment_id: parentCommentId ?? null }])
      .select()
      .maybeSingle();
    if (error) {
      logger.error('댓글 등록 실패:', error);
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
    const confirmed = await openConfirm({
      title: '댓글을 삭제할까요?',
      description: '선택한 댓글과 연결된 답글이 함께 삭제됩니다.',
      confirmText: '삭제',
      tone: 'danger' });
    if (!confirmed) return;
    // 자식 댓글 먼저 DB에서 삭제
    await db.from('board_post_comments').delete().eq('parent_comment_id', commentId);
    const { error } = await db.from('board_post_comments').delete().eq('id', commentId);
    if (error) {
      logger.error('댓글 삭제 실패:', error);
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

  const selectedPostFromList = useMemo(
    () => visiblePosts.find((p: BoardPost) => p.id === selectedPostId) || null,
    [visiblePosts, selectedPostId]
  );
  const [selectedPostDetail, setSelectedPostDetail] = useState<BoardPost | null>(null);
  const selectedPost = selectedPostDetail || selectedPostFromList;
  const selectedPostAuthorSignal = selectedPost ? getBoardPostAuthorSignal(selectedPost) : null;
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
    if (isAnonymousReadStatusPost(readStatusPost)) return [];
    const postId = String(readStatusPost.id ?? '').trim();
    const readSet = postReadMap[postId] || new Set<string>();
    const audience = readStatusAudience;
    const authorId = String(readStatusPost.author_id ?? '').trim();
    return audience.filter((member) => {
      const memberId = String(member.id ?? '').trim();
      if (authorId && memberId === authorId) return true;
      return readSet.has(memberId);
    });
  }, [readStatusAudience, postReadMap, readStatusPost]);
  const readStatusPendingAudience = useMemo(() => {
    if (!readStatusPost) return [];
    if (isAnonymousReadStatusPost(readStatusPost)) return [];
    const postId = String(readStatusPost.id ?? '').trim();
    const readSet = postReadMap[postId] || new Set<string>();
    const audience = readStatusAudience;
    const authorId = String(readStatusPost.author_id ?? '').trim();
    return audience.filter((member) => {
      const memberId = String(member.id ?? '').trim();
      if (authorId && memberId === authorId) return false;
      return !readSet.has(memberId);
    });
  }, [readStatusAudience, postReadMap, readStatusPost]);

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
          const result = await db
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
        // 원자적 조회수 증가 — D1 라우트 우선, 실패 시 Supabase fallback
        const d1Res = await fetch('/api/d1/rpc/increment-post-views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_post_id: selectedPostId }) }).catch(() => null);
        const d1Ok = d1Res?.ok && ((await d1Res.json().catch(() => ({ ok: false }))) as { ok: boolean }).ok;
        if (!d1Ok) {
          const { error: rpcErr } = await db.rpc('increment_post_views', { p_post_id: selectedPostId });
          if (rpcErr) {
            const { data: row } = await db
              .from('board_posts')
              .select('views')
              .eq('id', selectedPostId)
              .maybeSingle()
              .returns<any>();
            const nextViews = ((row?.views ?? 0) as number) + 1;
            await db.from('board_posts').update({ views: nextViews }).eq('id', selectedPostId);
          }
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
        () => db.from('approvals').insert(rows),
        () => {
          const legacyRows = rows.map(({ company_id, ...rest }: Record<string, unknown>) => rest);
          return db.from('approvals').insert(legacyRows);
        }
      );
      if (error) throw error;
      toast(`해당 일정의 ${actionType} 처리를 위해 부서장/관리자에게 승인 요청 문서가 상신되었습니다.`, 'success');
    } catch (err) {
      logger.error(err);
      toast('승인 요청 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleDeletePost = async (post: BoardPost) => {
    if (!canDeletePost(post)) {
      toast('이 게시물을 삭제할 권한이 없습니다.', 'error');
      return;
    }

    const confirmed = await openConfirm({
      title: '게시물을 삭제할까요?',
      description: [
        post.title ? `"${post.title}" 게시물을 삭제합니다.` : '선택한 게시물을 삭제합니다.',
        '댓글, 읽음 상태, 첨부 메타 정보가 함께 사라질 수 있습니다.',
      ].join('\n'),
      confirmText: '삭제',
      tone: 'danger' });
    if (!confirmed) return;
    const { error } = await db.from('board_posts').delete().eq('id', post.id);
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

    // 상품 추첨 설정 필드 로드
    const prize = rawPoll?.prize as { winnerCount?: number; name?: string } | undefined;
    setPollPrizeEnabled(Boolean(prize));
    setPollPrizeWinnerCount(prize?.winnerCount ?? 1);
    setPollPrizeName(prize?.name ?? '');

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
      if (activeBoard === '경조사') {
        const rawContent = post.content || '';
        const matchTarget = rawContent.match(/■ 대상자:\s*(.*)/);
        const matchType = rawContent.match(/■ 분류:\s*(.*)/);
        const matchDate = rawContent.match(/■ 일시:\s*(.*)/);
        const matchLocation = rawContent.match(/■ 장소:\s*(.*)/);
        const matchAccount = rawContent.match(/■ 마음 전하실 곳:\s*(.*)/);
        
        let cleanedDetail = '';
        const detailIndex = rawContent.indexOf('■ 마음 전하실 곳:');
        if (detailIndex !== -1) {
          const remaining = rawContent.substring(detailIndex);
          const lines = remaining.split('\n');
          cleanedDetail = lines.slice(2).join('\n').trim();
        }

        setFamilyEventTarget(matchTarget ? matchTarget[1].trim() : '');
        setFamilyEventType(matchType ? matchType[1].trim() : '결혼');
        setFamilyEventDate(matchDate ? matchDate[1].trim() : '');
        setFamilyEventLocation(matchLocation ? matchLocation[1].trim() : '');
        setFamilyEventAccount(matchAccount ? matchAccount[1].trim() : '');
        setFamilyEventDetail(cleanedDetail);
      }
    }
    setShowNewPost(true);
    setSelectedPostId(null);
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setFamilyEventType('결혼');
    setFamilyEventTarget('');
    setFamilyEventDate('');
    setFamilyEventLocation('');
    setFamilyEventAccount('');
    setFamilyEventDetail('');
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
    setPollPrizeEnabled(false);
    setPollPrizeWinnerCount(1);
    setPollPrizeName('');
    setEditingPostId(null);
  };

  const uploadBoardAttachment = useCallback(async (file: File) => {
    return await uploadBoardAttachmentFile(file, activeBoard);
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

    let finalTitle = normalizedTitle;
    let finalContent = normalizedContent;

    if (activeBoard === '경조사') {
      if (!familyEventTarget.trim()) {
        return toast('대상 직원 이름을 입력해주세요.', 'warning');
      }
      finalTitle = `[${familyEventType}] ${familyEventTarget.trim()} 소식을 전해드립니다.`;
      finalContent = `💌 경조사 소식을 전해드립니다.

■ 대상자: ${familyEventTarget.trim()}
■ 분류: ${familyEventType}
■ 일시: ${familyEventDate.trim() || '추후 안내'}
■ 장소: ${familyEventLocation.trim() || '추후 안내'}
■ 마음 전하실 곳: ${familyEventAccount.trim() || '정보 없음'}

${familyEventDetail.trim() || '많은 축하와 위로 부탁드립니다.'}`;
    }

    if (activeBoard !== '경조사') {
      if (!normalizedTitle) return toast('제목을 입력해주세요.', 'warning');
      if (isScheduleBoard) {
        if (!scheduleDate || !resolvedScheduleTime) return toast('필수 정보를 입력해주세요.', 'warning');
      } else if (!normalizedContent && attachmentFiles.length === 0 && existingAttachmentItems.length === 0) {
        return toast('내용을 입력해주세요.', 'warning');
      }
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
      const useAnonymous = Boolean(isAnonymous);
      const postData: Partial<BoardPost> & Record<string, unknown> = {
        board_type: activeBoard,
        title: activeBoard === '경조사' ? finalTitle : normalizedTitle,
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
              contrast: activeBoard === 'MRI일정' ? scheduleContrastRequired : false }) || null
          : (activeBoard === '경조사' ? finalContent : normalizedContent) || null,
        status: normalizeBoardPostStatus(postStatus),
        company: user?.company || null,
        tags: tags,
        author_name: useAnonymous ? '익명' : (user?.name || '익명'),
        author_id: useAnonymous ? null : user?.id,
        is_anonymous: useAnonymous };
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
        const pollData: BoardPoll = {
          question: pollQuestion.trim() || normalizedTitle,
          options: validOptions,
          anonymous: pollAnonymous,
          multiple: pollMultiple };
        if (pollPrizeEnabled && pollPrizeName.trim() && pollPrizeWinnerCount >= 1) {
          pollData.prize = { winnerCount: pollPrizeWinnerCount, name: pollPrizeName.trim() };
          if (editingPostId) {
            const originalPost = posts.find((p) => p.id === editingPostId);
            const originalPoll = originalPost?.poll as BoardPoll | undefined;
            if (originalPoll?.prizeWinners) {
              pollData.prizeWinners = originalPoll.prizeWinners;
            }
          }
        }
        postData.poll = pollData;
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
            status: normalizeBoardPostStatus(postStatus) }) || null;
      }

      // 공지/자유/경조사/소리함: 사진·동영상·파일 첨부 업로드
      const boardWithAttach = ['공지사항', '자유게시판', '경조사'];
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
            logger.error('[게시판 첨부 업로드 실패]', uploadError);
          }
        }
        if (uploaded.length === 0 && attachmentFiles.length > 0) {
          toast('첨부파일 업로드에 실패했습니다.\n\n' +
            (lastUploadError ? `원인: ${lastUploadError}\n\n` : '') +
            '데이터베이스 관리 콘솔의 SQL 편집기에서 storage_board_attachments.sql 내용을 실행했는지 확인해 주세요.', 'error');
          setLoading(false);
          return;
        }
        if (uploaded.length < attachmentFiles.length) {
          logger.warn('일부 첨부만 업로드됨.', lastUploadError);
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
          status: normalizeBoardPostStatus(postStatus) };
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
          const confirmed = await openConfirm({
            title: '일정 수정 승인 결재를 상신할까요?',
            description: [
              '부서장 이상 권한이 필요한 일정 수정입니다.',
              '관리자 또는 간호과장에게 승인 요청 문서를 상신하고, 승인 후 일정에 반영됩니다.',
            ].join('\n'),
            confirmText: '승인 요청',
            tone: 'accent' });
          if (!confirmed) {
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
          (payload) => db.from('board_posts').update(payload).eq('id', editingPostId),
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

      // create SSOT: insertBoardPost (runBoardPostMutation + notice-broadcast)
      const { data: insertedPost, error } = await insertBoardPost(postData as Record<string, unknown>, {
        useAnonymous: Boolean(useAnonymous),
      });
      if (!error && insertedPost) {
        if (attachmentFiles.length > 0 && (!insertedPost.attachments || (Array.isArray(insertedPost.attachments) && insertedPost.attachments.length === 0))) {
          logger.warn('첨부파일이 저장되지 않았을 수 있습니다. 데이터베이스에 board_posts_attachments.sql 적용 및 board-attachments 버킷 생성 여부를 확인하세요.');
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
      } else {
        const hint = (activeBoard === '수술일정' || activeBoard === 'MRI일정') && (((error as Record<string, unknown>)?.message as string || "").includes('column') || ((error as Record<string, unknown>)?.code) === '42703')
          ? '\n\n수술일정/MRI일정용 컬럼이 없을 수 있습니다. 데이터베이스에 board_posts_schedule_columns.sql 마이그레이션을 적용해 주세요.'
          : '';
        toast(`게시물 등록에 실패했습니다.\n\n${(error as Record<string, unknown>)?.message || ''}${hint}`, 'error');
      }
    } catch (error: unknown) {
      logger.error('게시물 등록 실패:', error);
      const errObj = error as Record<string, unknown>;
      const msg = typeof errObj?.message === 'string' ? errObj.message : '';
      const hint = (activeBoard === '수술일정' || activeBoard === 'MRI일정') && (msg.includes('column') || ((error as Record<string, unknown>)?.code) === '42703')
        ? '\n\n수술일정/MRI일정용 컬럼이 없을 수 있습니다. 데이터베이스에 board_posts_schedule_columns.sql 마이그레이션을 적용해 주세요.'
        : '';
      toast(`게시물 등록에 실패했습니다.\n\n${msg}${hint}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (visibleBoards.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center bg-[var(--muted)] p-4">
        <PermissionState
          title="게시판 접근 권한이 없습니다"
          description="메인 메뉴 권한과 게시판 읽기 권한을 확인해 주세요."
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-x-hidden app-page"
      data-testid="board-view"
    >
      {dialog}
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
          <h2 className="text-xl font-bold text-[var(--foreground)]">{activeBoard}</h2>
          {/* 새 게시물 작성 폼 (업무가이드일 때는 표시 안함) — dynamic split */}
          {showNewPost && activeBoard !== '업무가이드' && (
            <BoardComposePanel
              activeBoard={activeBoard}
              title={title}
              setTitle={setTitle}
              content={content}
              setContent={setContent}
              familyEventType={familyEventType}
              setFamilyEventType={setFamilyEventType}
              familyEventTarget={familyEventTarget}
              setFamilyEventTarget={setFamilyEventTarget}
              familyEventDate={familyEventDate}
              setFamilyEventDate={setFamilyEventDate}
              familyEventLocation={familyEventLocation}
              setFamilyEventLocation={setFamilyEventLocation}
              familyEventAccount={familyEventAccount}
              setFamilyEventAccount={setFamilyEventAccount}
              familyEventDetail={familyEventDetail}
              setFamilyEventDetail={setFamilyEventDetail}
              tagsInput={tagsInput}
              setTagsInput={setTagsInput}
              scheduledPublishAt={scheduledPublishAt}
              setScheduledPublishAt={setScheduledPublishAt}
              postStatus={postStatus}
              setPostStatus={setPostStatus}
              scheduleDate={scheduleDate}
              setScheduleDate={setScheduleDate}
              schedulePeriod={schedulePeriod}
              setSchedulePeriod={setSchedulePeriod}
              scheduleHour={scheduleHour}
              setScheduleHour={setScheduleHour}
              scheduleMinute={scheduleMinute}
              setScheduleMinute={setScheduleMinute}
              scheduleRoom={scheduleRoom}
              setScheduleRoom={setScheduleRoom}
              schedulePatient={schedulePatient}
              setSchedulePatient={setSchedulePatient}
              scheduleChartNo={scheduleChartNo}
              setScheduleChartNo={setScheduleChartNo}
              scheduleFasting={scheduleFasting}
              setScheduleFasting={setScheduleFasting}
              scheduleInpatient={scheduleInpatient}
              setScheduleInpatient={setScheduleInpatient}
              scheduleGuardian={scheduleGuardian}
              setScheduleGuardian={setScheduleGuardian}
              scheduleCaregiver={scheduleCaregiver}
              setScheduleCaregiver={setScheduleCaregiver}
              scheduleTransfusion={scheduleTransfusion}
              setScheduleTransfusion={setScheduleTransfusion}
              scheduleContrastRequired={scheduleContrastRequired}
              setScheduleContrastRequired={setScheduleContrastRequired}
              scheduleSide={scheduleSide}
              setScheduleSide={setScheduleSide}
              isAnonymous={isAnonymous}
              setIsAnonymous={setIsAnonymous}
              hasPoll={hasPoll}
              setHasPoll={setHasPoll}
              pollQuestion={pollQuestion}
              setPollQuestion={setPollQuestion}
              pollOptions={pollOptions}
              setPollOptions={setPollOptions}
              pollAnonymous={pollAnonymous}
              setPollAnonymous={setPollAnonymous}
              pollMultiple={pollMultiple}
              setPollMultiple={setPollMultiple}
              pollPrizeEnabled={pollPrizeEnabled}
              setPollPrizeEnabled={setPollPrizeEnabled}
              pollPrizeWinnerCount={pollPrizeWinnerCount}
              setPollPrizeWinnerCount={setPollPrizeWinnerCount}
              pollPrizeName={pollPrizeName}
              setPollPrizeName={setPollPrizeName}
              attachmentFiles={attachmentFiles}
              setAttachmentFiles={setAttachmentFiles}
              existingAttachmentItems={existingAttachmentItems}
              setExistingAttachmentItems={setExistingAttachmentItems}
              selectedBodyPart={selectedBodyPart}
              setSelectedBodyPart={setSelectedBodyPart}
              setShowBodyPicker={setShowBodyPicker}
              filteredTemplates={filteredTemplates}
              canScheduleNoticePost={canScheduleNoticePost}
              isScheduleBoard={isScheduleBoard}
              isScheduleDraftReady={isScheduleDraftReady}
              normalizedDraftScheduleDate={normalizedDraftScheduleDate}
              loading={loading}
              updateScheduleTime={updateScheduleTime}
              onCancel={() => {
                setShowNewPost(false);
                resetForm();
              }}
              onSubmit={() => {
                void handleNewPost();
              }}
              handleAttachmentDownloadClick={handleAttachmentDownloadClick}
            />
          )}

          {/* 수술/MRI용 사람 모형 선택 모달 - 사람 이미지 + 부위 하이라이트 */}
          {showBodyPicker && (activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
            <BoardBodyPickerModal
              activeBoard={activeBoard}
              resolvedBodyPart={resolvedBodyPart}
              filteredTemplates={filteredTemplates}
              onSelectBodyPart={(id) => setSelectedBodyPart(id)}
              onSelectTemplate={(name) => {
                setTitle(name);
                setShowBodyPicker(false);
              }}
              onBackdropClose={() => {
                setShowBodyPicker(false);
                if (!VALID_BODY_IDS.has(selectedBodyPart)) setSelectedBodyPart('all');
              }}
              onClose={() => setShowBodyPicker(false)}
            />
          )}

          {/* 수술일정·MRI일정용 달력 뷰 */}
          {(activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
            <BoardScheduleCalendar
              activeBoard={activeBoard}
              calendarMonth={calendarMonth}
              searchKeyword={searchKeyword}
              canCreatePost={canCreatePost}
              showNewPost={showNewPost}
              legacySchedulePosts={legacySchedulePosts}
              loading={loading}
              scheduleCalendarData={scheduleCalendarData}
              onSearchChange={setSearchKeyword}
              onChangeMonth={setCalendarMonth}
              onToggleNewPost={() => setShowNewPost((v) => !v)}
              onSelectPost={(postId) => setSelectedPostId(postId)}
            />
          )}

          {/* 게시물 목록 (수술일정·MRI일정은 달력으로만 표시) */}
          {(activeBoard !== '수술일정' && activeBoard !== 'MRI일정') && !isMobile && (
            <PostTableView
              boardLabel={activeBoard}
              posts={visiblePosts}
              loading={loading}
              noticeVisibilityTick={noticeVisibilityTick}
              myLikedPostIds={myLikedPostIds}
              postReadMap={postReadMap}
              effectiveBoardUserId={effectiveBoardUserId}
              canCreatePost={canCreatePost}
              showNewPost={showNewPost}
              onToggleNewPost={() => setShowNewPost((v) => !v)}
              onSelectPost={(postId) => setSelectedPostId(postId)}
              onToggleLike={(post) => { void handleLike(post); }}
              onEditPost={(postId) => {
                const post = posts.find((p) => String(p.id) === String(postId));
                if (post) handleEditPostStart(post);
              }}
              onDeletePost={(postId) => {
                const post = posts.find((p) => String(p.id) === String(postId));
                if (post) void handleDeletePost(post);
              }}
              canEditPost={canEditPost}
              canDeletePost={canDeletePost}
              emptyDescription="새 게시물이 등록되면 이 목록에 표시됩니다."
            />
          )}

          {/* 모바일: 기존 카드 리스트 유지 (모바일 영역 변경 금지) */}
          {(activeBoard !== '수술일정' && activeBoard !== 'MRI일정') && isMobile && canCreatePost && (
            <div className="shrink-0 flex justify-start">
              <button
                type="button"
                data-testid="board-toggle-new-post"
                onClick={() => setShowNewPost(!showNewPost)}
                className="px-4 py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-[11px] font-bold shadow-sm hover:opacity-95 active:scale-[0.98] transition-all"
              >
                {showNewPost ? '취소' : '+ 새 게시물'}
              </button>
            </div>
          )}
          {(activeBoard !== '수술일정' && activeBoard !== 'MRI일정') && isMobile && (
            <div data-testid="board-post-list" className="space-y-2" data-variant="mobile">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-4 w-1/3 bg-[var(--border)] rounded animate-pulse" />
                        <div className="h-3 w-16 bg-[var(--border)] rounded animate-pulse" />
                      </div>
                      <div className="h-3 w-1/2 bg-[var(--border)] rounded animate-pulse mt-2" />
                    </div>
                  ))}
                </div>
              ) : visiblePosts.length > 0 ? (
                visiblePosts.map((post, idx) => (
                  <BoardMobilePostCard
                    key={post.id || idx}
                    post={post}
                    idx={idx}
                    rowNumber={visiblePosts.length - idx}
                    activeBoard={activeBoard}
                    noticeVisibilityTick={noticeVisibilityTick}
                    myLikedPostIds={myLikedPostIds}
                    onSelectPost={(postId) => setSelectedPostId(postId)}
                    onToggleLike={(p) => { void handleLike(p); }}
                  />
                ))
              ) : (
                <EmptyState
                  title="게시물이 없습니다"
                  description="새 게시물이 등록되면 이 목록에 표시됩니다."
                />
              )}
            </div>
          )}

          {/* 게시글 상세 보기 모달 */}
          {hasMorePosts && !loading && !isScheduleBoardType(activeBoard) && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => {
                  const nextLimit = postListLimit + BOARD_POST_PAGE_SIZE;
                  setPostListLimit(nextLimit);
                  void fetchPosts(nextLimit);
                }}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[12px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
              >
                더 보기
              </button>
            </div>
          )}

          {selectedPost && (
            <BoardDetailPanel
              selectedPost={selectedPost}
              selectedPostAuthorSignal={selectedPostAuthorSignal}
              selectedPostCommentTree={selectedPostCommentTree}
              posts={posts}
              comments={comments}
              myLikedPostIds={myLikedPostIds}
              likingPostId={likingPostId}
              drawingPostId={drawingPostId}
              setDrawingPostId={setDrawingPostId}
              effectiveBoardUserId={effectiveBoardUserId}
              user={user}
              isMobile={isMobile}
              newComment={newComment}
              setNewComment={setNewComment}
              replyParentId={replyParentId}
              setReplyParentId={setReplyParentId}
              noticeVisibilityTick={noticeVisibilityTick}
              canEditPost={canEditPost}
              canDeletePost={canDeletePost}
              onLike={(post) => { void handleLike(post); }}
              onOpenReadStatus={(post) => { void openReadStatusModal(post); }}
              onEdit={handleEditPostStart}
              onDelete={(post) => { void handleDeletePost(post); }}
              onClose={() => setSelectedPostId(null)}
              onSelectPost={(postId) => setSelectedPostId(postId)}
              onAddComment={(postId, parentId) => { void handleAddComment(postId, parentId); }}
              onDeleteComment={(postId, commentId) => { void handleDeleteComment(postId, commentId); }}
              setPosts={setPosts}
              setSelectedPostDetail={setSelectedPostDetail}
              setComments={setComments}
              handleAttachmentDownloadClick={handleAttachmentDownloadClick}
            />
          )}
          {readStatusPost && !isAnonymousReadStatusPost(readStatusPost) && (
            <ReadStatusModal
              post={readStatusPost}
              readers={readStatusReaders}
              pending={readStatusPendingAudience}
              loading={readStatusLoading}
              onClose={() => setReadStatusPost(null)}
            />
          )}
        </div>
      )}

    </div>
  );
}

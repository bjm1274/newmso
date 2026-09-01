'use client';

/**
 * 게시판 글 작성 SSOT — PC `게시판.tsx` / 모바일 `createBoardPost` 공유.
 *
 * - insert + optional-column fallback (`runBoardPostMutation`)
 * - company / company_id 일관 설정 (익명이어도 회사 격리 유지)
 * - author_id: 비익명 시 staff_members.id 해석
 * - 공지·경조사 notice-broadcast 유지
 */

import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { getStaffLikeId, resolveStaffLike } from '@/lib/staff-identity';
import type { AttachmentItem, BoardPost } from '@/types';
import {
  BOARD_AUTO_CHAT_TYPES,
  buildAttachmentMetaContent,
  runBoardPostMutation,
} from '../게시판공통';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type PostImportance = 'normal' | 'urgent';

/** board_posts.poll JSONB — `board-poll-prize.ts` BoardPoll과 동일 형태 */
export type BoardPollInput = {
  question: string;
  options: string[];
  anonymous: boolean;
  multiple: boolean;
  prize?: { winnerCount: number; name: string };
};

/** 수술/MRI 일정 메타 */
export type ScheduleMetaInput = {
  scheduleDate?: string | null;
  scheduleTime?: string | null;
  scheduleRoom?: string | null;
  patientName?: string | null;
  /** 차트번호 — content 컬럼에 저장 */
  chartNo?: string | null;
  /** title 접두사 */
  side?: '좌' | '우' | '';
  fasting?: boolean;
  inpatient?: boolean;
  guardian?: boolean;
  caregiver?: boolean;
  transfusion?: boolean;
  contrastRequired?: boolean;
};

export type BoardCreateUser = {
  id?: string | null;
  name?: string | null;
  company?: string | null;
  company_id?: string | null;
  employee_no?: string | null;
  auth_user_id?: string | null;
} | null;

/**
 * 고수준 create 입력 (모바일 글작성 / catId 기반).
 * boardType 을 직접 넘기면 catId 매핑 없이 사용.
 */
export type CreateBoardPostInput = {
  /** 모바일 카테고리 id — boardType 미지정 시 매핑 */
  catId?: string;
  /** PC board_type 직접 지정 (catId 보다 우선) */
  boardType?: string;
  title: string;
  content: string;
  attachments?: AttachmentItem[];
  anonymous?: boolean;
  pinned?: boolean;
  importance?: PostImportance;
  scheduledPublishAt?: string | null;
  poll?: BoardPollInput | null;
  schedule?: ScheduleMetaInput | null;
  tags?: string[];
  status?: string | null;
  user: BoardCreateUser;
};

export type InsertBoardPostOptions = {
  useAnonymous?: boolean;
  /** true 이면 notice-broadcast 생략 */
  skipBroadcast?: boolean;
};

// 모바일 BOARD_CATS 와 동일 매핑 (순환 import 회피 — 로컬 상수)
const CAT_TO_BOARD_TYPE: Record<string, string> = {
  notice: '공지사항',
  free: '자유게시판',
  event: '경조사',
  op: '수술일정',
  mri: 'MRI일정',
  share: '업무가이드',
};

/** 작성 author_id 용 — raw user.id 대신 staff_members.id 해석 (가능하면) */
export async function resolveAuthorStaffId(
  user: BoardCreateUser,
): Promise<string | null> {
  if (!user) return null;
  const direct = getStaffLikeId(user as Record<string, unknown>);
  if (direct) return direct;
  try {
    const resolved = await resolveStaffLike(user as Record<string, unknown>);
    return getStaffLikeId(resolved) || (typeof user.id === 'string' ? user.id : null);
  } catch {
    return typeof user.id === 'string' ? user.id : null;
  }
}

/** 투표 입력 정규화 — 옵션 2개 미만이면 null */
export function normalizePoll(poll: BoardPollInput | null | undefined): BoardPollInput | null {
  if (!poll) return null;
  const options = (Array.isArray(poll.options) ? poll.options : [])
    .map((o) => String(o ?? '').trim())
    .filter(Boolean);
  if (options.length < 2) return null;
  const normalized: BoardPollInput = {
    question: String(poll.question ?? '').trim(),
    options,
    anonymous: Boolean(poll.anonymous),
    multiple: Boolean(poll.multiple),
  };
  if (poll.prize && poll.prize.name.trim() && poll.prize.winnerCount >= 1) {
    normalized.prize = { winnerCount: poll.prize.winnerCount, name: poll.prize.name.trim() };
  }
  return normalized;
}

function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() <= Date.now()) return null;
  return d.toISOString();
}

/** 공지/경조사 등록 직후 채팅·푸시 방송 */
export async function broadcastNoticeIfNeeded(
  postId: string,
  boardType: string,
  scheduledPublishAt?: string | null,
  useAnonymous = false,
): Promise<void> {
  if (!BOARD_AUTO_CHAT_TYPES.has(boardType)) return;
  if (boardType === '공지사항' && scheduledPublishAt) {
    const t = new Date(scheduledPublishAt).getTime();
    if (Number.isFinite(t) && t > Date.now()) return;
  }
  try {
    const res = await fetch('/api/board/notice-broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ postId, useAnonymous: Boolean(useAnonymous) }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const reason = String((errBody as { error?: string })?.error || `HTTP ${res.status}`);
      toast(`공지 자동 발송 실패: ${reason}`, 'error');
    }
  } catch {
    toast('공지 자동 발송 중 오류가 발생했습니다.', 'error');
  }
}

/**
 * 저수준 insert — 이미 조립된 payload 를 board_posts 에 저장.
 * PC handleNewPost create 경로 / 모바일 createBoardPost 공통.
 */
export async function insertBoardPost(
  postData: Record<string, unknown>,
  options: InsertBoardPostOptions = {},
): Promise<{ data: BoardPost | null; error: unknown }> {
  const { data, error } = await runBoardPostMutation<BoardPost>(
    (payload) => db.from('board_posts').insert([payload]).select().single(),
    postData,
  );

  if (!error && data && (data as BoardPost).id && !options.skipBroadcast) {
    const boardType = String(postData.board_type ?? (data as BoardPost).board_type ?? '');
    const scheduled =
      (postData.scheduled_publish_at as string | null | undefined) ??
      ((data as BoardPost).scheduled_publish_at as string | null | undefined) ??
      null;
    const useAnonymous = Boolean(
      options.useAnonymous ?? postData.is_anonymous ?? (data as BoardPost).is_anonymous,
    );
    await broadcastNoticeIfNeeded(String((data as BoardPost).id), boardType, scheduled, useAnonymous);
  }

  return { data: (data as BoardPost) ?? null, error };
}

/**
 * 고수준 create — catId/boardType + 폼 필드 → payload 조립 → insertBoardPost.
 * company / company_id 는 익명 여부와 무관하게 user 값을 유지 (PC 패리티·회사 격리).
 */
export async function createBoardPost(input: CreateBoardPostInput): Promise<BoardPost | null> {
  const {
    catId,
    boardType: boardTypeInput,
    title,
    content,
    attachments,
    anonymous = false,
    pinned = false,
    importance = 'normal',
    scheduledPublishAt = null,
    poll = null,
    schedule = null,
    tags,
    status: statusOverride,
    user,
  } = input;

  const boardType =
    (boardTypeInput && String(boardTypeInput).trim()) ||
    (catId ? CAT_TO_BOARD_TYPE[catId] : undefined) ||
    '자유게시판';
  const useAnonymous = Boolean(anonymous);
  const authorStaffId = useAnonymous ? null : await resolveAuthorStaffId(user);

  if (!useAnonymous && !authorStaffId) {
    toast('로그인한 후 글을 등록할 수 있습니다.', 'error');
    return null;
  }

  const normalizedAttachments: AttachmentItem[] = Array.isArray(attachments)
    ? attachments
        .map((a) => ({
          name: String(a?.name ?? '').trim(),
          url: String(a?.url ?? '').trim(),
          type: String(a?.type ?? '').trim() || undefined,
          size: typeof a?.size === 'number' ? a.size : undefined,
        }))
        .filter((a) => a.name && a.url)
    : [];

  const isSchedule = boardType === '수술일정' || boardType === 'MRI일정';
  const baseContent = isSchedule ? String(schedule?.chartNo ?? '').trim() : content.trim();
  const finalContent =
    !isSchedule && normalizedAttachments.length > 0
      ? buildAttachmentMetaContent(baseContent, normalizedAttachments)
      : baseContent;

  const sidePrefix =
    schedule?.side === '좌' ? '좌측 ' : schedule?.side === '우' ? '우측 ' : '';
  const finalTitle = isSchedule ? `${sidePrefix}${title.trim()}` : title.trim();

  const scheduledIso = toIsoOrNull(scheduledPublishAt);
  const statusValue =
    statusOverride !== undefined
      ? statusOverride
      : importance === 'urgent'
        ? '중요'
        : null;
  const normalizedPoll = normalizePoll(poll);

  const payload: Record<string, unknown> = {
    board_type: boardType,
    title: finalTitle,
    content: finalContent,
    author_id: useAnonymous ? null : authorStaffId,
    author_name: useAnonymous ? '익명' : (user?.name ?? '익명'),
    // 익명이어도 company/company_id 유지 — 회사 격리 (PC 패리티)
    company: user?.company ?? null,
    is_anonymous: useAnonymous,
    likes_count: 0,
    created_at: new Date().toISOString(),
  };
  if (user?.company_id) {
    payload.company_id = user.company_id;
  }
  if (normalizedAttachments.length > 0) payload.attachments = normalizedAttachments;
  if (pinned) payload.is_pinned = true;
  if (statusValue) payload.status = statusValue;
  if (scheduledIso) payload.scheduled_publish_at = scheduledIso;
  if (normalizedPoll) payload.poll = normalizedPoll;
  if (Array.isArray(tags) && tags.length > 0) payload.tags = tags;

  if (isSchedule && schedule) {
    payload.schedule_date = schedule.scheduleDate || null;
    payload.schedule_time = schedule.scheduleTime || null;
    payload.schedule_room = schedule.scheduleRoom || null;
    payload.patient_name = schedule.patientName || null;
    payload.surgery_fasting = Boolean(schedule.fasting);
    payload.surgery_inpatient = Boolean(schedule.inpatient);
    payload.surgery_guardian = Boolean(schedule.guardian);
    payload.surgery_caregiver = Boolean(schedule.caregiver);
    payload.surgery_transfusion = Boolean(schedule.transfusion);
    payload.mri_contrast_required =
      boardType === 'MRI일정' ? Boolean(schedule.contrastRequired) : null;
  }

  try {
    const { data, error } = await insertBoardPost(payload, { useAnonymous });
    if (error) throw error;
    return data;
  } catch (err) {
    toast(`등록 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    return null;
  }
}

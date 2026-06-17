'use client';

/**
 * 글작성변환 — 글작성.tsx의 prefill/직렬화 순수 변환 헬퍼.
 * 파일 분리(JM 500줄 이내). board_posts.poll JSONB ↔ PollDraft, 일정 메타 ↔ ScheduleDraft.
 * JM: 단일 책임(변환), JM4(any 금지)
 */

import type { BoardListPost, BoardPollInput } from './data-hooks';
import { EMPTY_POLL_DRAFT, type PollDraft } from './글작성옵션';
import { EMPTY_SCHEDULE_DRAFT, type ScheduleDraft } from './일정입력';

/** 투표 draft → BoardPollInput (옵션 2개 미만이면 null) */
export function pollDraftToInput(poll: PollDraft): BoardPollInput | null {
  if (!poll.enabled) return null;
  const options = poll.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 2) return null;
  const out: BoardPollInput = {
    question: poll.question.trim(),
    options,
    anonymous: poll.anonymous,
    multiple: poll.multiple,
  };
  if (poll.prizeEnabled && poll.prizeName.trim() && poll.prizeWinnerCount >= 1) {
    out.prize = { winnerCount: poll.prizeWinnerCount, name: poll.prizeName.trim() };
  }
  return out;
}

/** EDIT prefill — 기존 post.poll JSONB → PollDraft */
export function pollDraftFromPost(post: BoardListPost | null): PollDraft {
  const raw = (post as { poll?: unknown } | null)?.poll;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_POLL_DRAFT;
  const obj = raw as Record<string, unknown>;
  const options = Array.isArray(obj.options) ? obj.options.map((o) => String(o ?? '').trim()).filter(Boolean) : [];
  if (options.length < 2) return EMPTY_POLL_DRAFT;
  const prize = obj.prize as { winnerCount?: unknown; name?: unknown } | undefined;
  const padded = options.length >= 2 ? options : [...options, ''];
  return {
    enabled: true,
    question: String(obj.question ?? ''),
    options: padded,
    multiple: Boolean(obj.multiple),
    anonymous: Boolean(obj.anonymous),
    prizeEnabled: Boolean(prize && String(prize.name ?? '').trim()),
    prizeName: prize ? String(prize.name ?? '') : '',
    prizeWinnerCount: prize && Number(prize.winnerCount) >= 1 ? Number(prize.winnerCount) : 1,
  };
}

/** EDIT prefill — 일정 메타 → ScheduleDraft (좌/우는 title 접두사로 파싱) */
export function scheduleDraftFromPost(post: BoardListPost | null): { draft: ScheduleDraft; titleNoPrefix: string } {
  if (!post) return { draft: { ...EMPTY_SCHEDULE_DRAFT }, titleNoPrefix: '' };
  const rawTitle = String(post.title ?? '');
  let side: '좌' | '우' | '' = '';
  let titleNoPrefix = rawTitle;
  if (rawTitle.startsWith('좌측 ')) { side = '좌'; titleNoPrefix = rawTitle.slice(3); }
  else if (rawTitle.startsWith('우측 ')) { side = '우'; titleNoPrefix = rawTitle.slice(3); }
  return {
    titleNoPrefix,
    draft: {
      side,
      scheduleDate: String(post.schedule_date ?? ''),
      scheduleTime: String(post.schedule_time ?? '').slice(0, 5),
      scheduleRoom: String(post.schedule_room ?? ''),
      patientName: String(post.patient_name ?? ''),
      chartNo: String(post.content ?? ''), // 일정은 content에 차트번호 저장
      fasting: Boolean(post.surgery_fasting),
      inpatient: Boolean(post.surgery_inpatient),
      guardian: Boolean(post.surgery_guardian),
      caregiver: Boolean(post.surgery_caregiver),
      transfusion: Boolean(post.surgery_transfusion),
      contrastRequired: Boolean(post.mri_contrast_required),
      bodyPartId: 'all',
    },
  };
}

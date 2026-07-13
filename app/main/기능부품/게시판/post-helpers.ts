/**
 * 게시판 게시글 관련 순수 헬퍼 유틸리티
 * - 컴포넌트 외부에서 사용 가능한 순수 함수 / 상수 모음
 * - 클로저(state/ref/hook) 의존 없음
 */

import type { BoardPost } from '@/types';

// ─── 익명 읽음 상태 판별 ───────────────────────────────────────────────────────

/** 익명 작성 게시글은 읽음 상태를 추적하지 않음 (익명소리함 보드 폐지) */
export const isAnonymousReadStatusPost = (post: BoardPost | null | undefined): boolean =>
  Boolean(post?.is_anonymous);

// ─── 수술/MRI 신체 부위 목록 ─────────────────────────────────────────────────

export type BodyPartItem = {
  id: string;
  label: string;
  emoji: string;
};

/** 수술일정·MRI일정 부위 선택용 목록 (손·손가락·팔꿈치 제거 후 기준) */
export const BODY_PARTS: BodyPartItem[] = [
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

/** BODY_PARTS id 집합 (O(1) 조회용) */
export const VALID_BODY_IDS: Set<string> = new Set(BODY_PARTS.map((b) => b.id));

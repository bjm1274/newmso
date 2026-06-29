/**
 * 게시판 표 컴팩트 뷰 헬퍼/타입 (PostTableView.tsx 분리)
 * JM: 단일 책임 (즐겨찾기 영속화, post 메타 파싱, 포맷)
 * JM4: any 금지, 명시적 타입
 */

import type { BoardPost } from '@/types';
import { logger } from '@/lib/logger';

export type SortKey = 'recent' | 'views' | 'likes' | 'comments';
export type ReadFilter = 'all' | 'unread' | 'favorite';

export const READ_FILTER_LABELS: Record<ReadFilter, string> = {
  all: '전체',
  unread: '안 읽음',
  favorite: '즐겨찾기',
};

export const SORT_LABELS: Record<SortKey, string> = {
  recent: '최신순',
  views: '조회 많은 순',
  likes: '좋아요 많은 순',
  comments: '댓글 많은 순',
};

const FAVORITES_STORAGE_KEY = 'mso:board:favorites';

export function readFavoritesFromStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch (error) {
    // 격리: 로깅만, 사용자에게는 노출하지 않음
    logger.warn('[board] favorites parse failed', error);
    return new Set();
  }
}

export function writeFavoritesToStorage(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch (error) {
    logger.warn('[board] favorites save failed', error);
  }
}

export function getPostTags(post: BoardPost): string[] {
  const raw = post.tags;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean);
}

export function getAttachmentCount(post: BoardPost): number {
  return Array.isArray(post.attachments) ? post.attachments.length : 0;
}

export function getCommentCount(post: BoardPost): number {
  const record = post as Record<string, unknown>;
  const value = record.comments_count ?? record.comment_count;
  return typeof value === 'number' ? value : 0;
}

export function formatShortDate(value: string | null | undefined, fallbackScheduled?: string | null): string {
  const source = fallbackScheduled || value;
  if (!source) return '';
  const dt = new Date(source);
  if (Number.isNaN(dt.getTime())) return '';
  const yy = String(dt.getFullYear()).slice(2);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
}

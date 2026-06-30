'use client';

/**
 * 게시판 모바일 카드 리스트의 단일 게시물 카드.
 * 게시판.tsx 인라인 JSX를 동작 보존 그대로 추출한 프레젠테이션 컴포넌트.
 * (모바일 영역 동작 변경 금지 — 마크업/클래스/조건 그대로 유지)
 */

import type { BoardPost } from '@/types';
import {
  getBoardPostAuthorSignal,
  getBoardPostPreview,
  getBoardStatusTone,
  isScheduledNoticePending,
  normalizeBoardPostStatus } from '../게시판-view-utils';

interface BoardMobilePostCardProps {
  post: BoardPost;
  idx: number;
  rowNumber: number;
  activeBoard: string;
  noticeVisibilityTick: number;
  myLikedPostIds: Set<string>;
  onSelectPost: (postId: string) => void;
  onToggleLike: (post: BoardPost) => void;
}

export default function BoardMobilePostCard({
  post,
  idx,
  rowNumber,
  activeBoard,
  noticeVisibilityTick,
  myLikedPostIds,
  onSelectPost,
  onToggleLike }: BoardMobilePostCardProps) {
  const isSchedule = activeBoard === '수술일정' || activeBoard === 'MRI일정';
  const isPendingScheduledNotice = isScheduledNoticePending(post, noticeVisibilityTick);
  const hasAttachments = (Array.isArray(post.attachments) ? post.attachments : []).length > 0;
  const authorSignal = getBoardPostAuthorSignal(post);
  const normalizedPostStatus = normalizeBoardPostStatus(post.status);
  const isImportantPost = normalizedPostStatus === '중요';
  const postPreview = getBoardPostPreview(post);
  const postTitle = String(post.title || '').trim() || postPreview || '제목 없음';
  const shouldShowPreview = Boolean(postPreview && postPreview !== postTitle);
  const postDateLabel = isPendingScheduledNotice && post.scheduled_publish_at
    ? new Date(post.scheduled_publish_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
    : new Date(post.created_at ?? '').toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  return (
    <div
      key={post.id || idx}
      data-testid={`board-post-${post.id}`}
      className={`bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] px-3 md:px-4 py-2.5 md:py-3 hover:border-[var(--accent)]/40 hover:shadow-md transition-all cursor-pointer`}
      onClick={() => onSelectPost(post.id)}
    >
      {isSchedule ? (
        <div className="space-y-2 md:space-y-1">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="font-bold text-[var(--foreground)] text-base md:text-lg line-clamp-1">{postTitle}</h3>
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
        <div className="flex items-start gap-1.5 text-[11px] md:gap-2 md:text-xs">
          <div className="w-5 shrink-0 pt-1 text-center text-[11px] font-bold text-[var(--toss-gray-3)] md:w-6">
            {rowNumber}
          </div>
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
              authorSignal.isAnonymous
                ? 'bg-[var(--muted)] text-[var(--toss-gray-3)]'
                : 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
            }`}
            title={`작성자 ${authorSignal.name}`}
            aria-label={`작성자 ${authorSignal.name}`}
          >
            {authorSignal.initials}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex min-w-0 items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="min-w-0 flex-1 truncate text-[13px] font-bold leading-5 text-[var(--foreground)] group-hover:text-[var(--accent)] md:text-xs md:leading-normal">
                    {postTitle}
                  </p>
                  {isImportantPost && (
                    <span className="shrink-0 rounded-[var(--radius-md)] bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                      중요
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-[var(--toss-gray-3)] md:hidden">
                  <span
                    data-testid={`board-post-status-pill-${post.id}`}
                    className={`rounded-[var(--radius-md)] px-2 py-0.5 ${getBoardStatusTone(normalizedPostStatus)}`}
                  >
                    {normalizedPostStatus}
                  </span>
                  <span data-testid={`board-post-date-${post.id}`}>{postDateLabel}</span>
                  <span>조회 {(post.views as number) ?? 0}</span>
                  {hasAttachments && <span>첨부 있음</span>}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1 whitespace-nowrap">
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
              </div>
            </div>
            {shouldShowPreview && (
              <p
                data-testid={`board-post-preview-${post.id}`}
                className="line-clamp-2 text-[11px] leading-5 text-[var(--toss-gray-4)]"
              >
                {postPreview}
              </p>
            )}
          </div>
          <div
            className="hidden w-20 shrink-0 pt-1 text-center text-[11px] font-bold text-[var(--toss-gray-3)] md:block"
          >
            {postDateLabel}
          </div>
          <div className="hidden w-12 shrink-0 pt-1 text-center text-[11px] font-bold text-[var(--toss-gray-3)] md:block">
            조회 {(post.views as number) ?? 0}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleLike(post); }}
            className={`w-10 shrink-0 pt-1 text-center text-[10px] font-bold transition md:w-12 md:text-[11px] ${myLikedPostIds.has(String(post.id ?? '').trim()) ? 'text-red-500' : 'text-[var(--toss-gray-3)] hover:text-red-400'}`}
          >
            {myLikedPostIds.has(String(post.id ?? '').trim()) ? '♥' : '♡'} {(post.likes_count as number) ?? 0}
          </button>
        </div>
      )}
    </div>
  );
}

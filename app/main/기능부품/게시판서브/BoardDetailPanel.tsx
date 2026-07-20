'use client';

import type { Dispatch, MouseEvent as ReactMouseEvent, ReactNode, SetStateAction } from 'react';
import dynamic from 'next/dynamic';
import { toast } from '@/lib/toast';
import { db } from '@/lib/db-client';
import {
  buildStorageDownloadUrl,
  buildStorageInlineUrl,
} from '@/lib/object-storage-url';
import { isPrivilegedUser } from '@/lib/access-control';
import type { AttachmentItem, BoardPost, StaffMember } from '@/types';
import {
  getBoardPostAuthorSignal,
  isScheduledNoticePending,
  normalizeBoardPostStatus,
  normalizeScheduleDateValue,
} from '../게시판-view-utils';
import { isAnonymousReadStatusPost } from '../게시판/post-helpers';
import { BOARD_COMMENT_SELECT } from '../게시판공통';
import type { BoardPoll, BoardPollPrizeWinner } from './board-poll-prize';
import { togglePollVote } from './board-poll-vote';

const CommentComposerSticky = dynamic(() => import('@/app/components/CommentComposerSticky'), {
  ssr: false,
});

export type BoardCommentRow = {
  id: string;
  author_id?: string;
  author_name?: string;
  content?: string;
  parent_comment_id?: string | null;
  [key: string]: unknown;
};

export type BoardDetailPanelProps = {
  selectedPost: BoardPost;
  selectedPostAuthorSignal: ReturnType<typeof getBoardPostAuthorSignal> | null;
  selectedPostCommentTree: {
    roots: BoardCommentRow[];
    repliesByParent: Record<string, BoardCommentRow[]>;
  };
  posts: BoardPost[];
  comments: Record<string, BoardCommentRow[]>;
  myLikedPostIds: Set<string>;
  likingPostId: string | null;
  drawingPostId: string | null;
  setDrawingPostId: Dispatch<SetStateAction<string | null>>;
  effectiveBoardUserId: string;
  user: StaffMember | null;
  isMobile: boolean;
  newComment: string;
  setNewComment: Dispatch<SetStateAction<string>>;
  replyParentId: string | null;
  setReplyParentId: Dispatch<SetStateAction<string | null>>;
  noticeVisibilityTick: number;
  canEditPost: (post: BoardPost) => boolean;
  canDeletePost: (post: BoardPost) => boolean;
  onLike: (post: BoardPost) => void;
  onOpenReadStatus: (post: BoardPost) => void;
  onEdit: (post: BoardPost) => void;
  onDelete: (post: BoardPost) => void;
  onClose: () => void;
  onSelectPost: (postId: string) => void;
  onAddComment: (postId: string, parentCommentId?: string | null) => void;
  onDeleteComment: (postId: string, commentId: string) => void;
  setPosts: Dispatch<SetStateAction<BoardPost[]>>;
  setSelectedPostDetail: Dispatch<SetStateAction<BoardPost | null>>;
  setComments: Dispatch<SetStateAction<Record<string, BoardCommentRow[]>>>;
  handleAttachmentDownloadClick: (
    event: ReactMouseEvent<HTMLAnchorElement>,
    url: string,
    fileName: string,
  ) => void | Promise<void>;
};

export default function BoardDetailPanel({
  selectedPost,
  selectedPostAuthorSignal,
  selectedPostCommentTree,
  posts,
  comments,
  myLikedPostIds,
  likingPostId,
  drawingPostId,
  setDrawingPostId,
  effectiveBoardUserId,
  user,
  isMobile,
  newComment,
  setNewComment,
  replyParentId,
  setReplyParentId,
  noticeVisibilityTick,
  canEditPost,
  canDeletePost,
  onLike,
  onOpenReadStatus,
  onEdit,
  onDelete,
  onClose,
  onSelectPost,
  onAddComment,
  onDeleteComment,
  setPosts,
  setSelectedPostDetail,
  setComments,
  handleAttachmentDownloadClick,
}: BoardDetailPanelProps) {
  const handleLike = onLike;
  const openReadStatusModal = onOpenReadStatus;
  const handleEditPostStart = onEdit;
  const handleDeletePost = onDelete;
  const setSelectedPostId = (id: string | null) => {
    if (id == null) onClose();
    else onSelectPost(id);
  };
  const handleAddComment = onAddComment;
  const handleDeleteComment = onDeleteComment;

  return (
<div data-testid="board-post-detail-overlay" className="fixed inset-0 z-[var(--z-modal)] flex items-end md:items-center justify-center bg-black/40 p-0 md:p-5">
  <div data-testid="board-post-detail" className="w-full max-w-4xl max-h-[90dvh] overflow-y-auto bg-[var(--card)] border-0 md:border border-[var(--border)] rounded-t-[24px] md:rounded-[var(--radius-xl)] shadow-sm p-3 md:p-4 pb-8 space-y-4 md:space-y-5 text-[13px] md:text-[14px] safe-area-pb">
    <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] md:text-[12px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">
          {selectedPost.board_type as string}
        </p>
        <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-[var(--foreground)] md:text-xl break-words">
          <span className="break-words">{selectedPost.title}</span>
          {normalizeBoardPostStatus(selectedPost.status) === '중요' && (
            <span className="rounded-[var(--radius-md)] bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-600">
              중요
            </span>
          )}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-[var(--toss-gray-3)] md:text-[12px]">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${
              selectedPostAuthorSignal?.isAnonymous
                ? 'bg-[var(--muted)] text-[var(--toss-gray-3)]'
                : 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
            }`}
          >
            {selectedPostAuthorSignal?.initials || '?'}
          </span>
          <span>
            작성자 {selectedPostAuthorSignal?.name || selectedPost.author_name || '익명'}
            {selectedPostAuthorSignal?.meta ? ` · ${selectedPostAuthorSignal.meta}` : ''}
          </span>
          <span>{new Date(selectedPost.created_at ?? '').toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
        </div>
        {selectedPost.board_type === '공지사항' && selectedPost.scheduled_publish_at && (
          <p className="mt-1 text-[11px] md:text-[12px] font-bold text-amber-700">
            예약 게시: {new Date(selectedPost.scheduled_publish_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
            {isScheduledNoticePending(selectedPost, noticeVisibilityTick) ? ' · 게시 전' : ' · 게시됨'}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:shrink-0">
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
        {!isAnonymousReadStatusPost(selectedPost) && (
          <button
            type="button"
            onClick={() => void openReadStatusModal(selectedPost)}
            className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)]"
          >
            읽음 확인
          </button>
        )}
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
      const poll = (selectedPost as Record<string, unknown>).poll as BoardPoll;
      const votes = ((selectedPost as Record<string, unknown>).poll_votes || {}) as Record<string, string[]>;
      const myId = effectiveBoardUserId;
      const totalVotes = Object.values(votes).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
      const isAuthor = String((selectedPost as Record<string, unknown>).author_id ?? '') === myId && myId !== '';
      const hasPrize = Boolean(poll.prize);
      const prizeWinners: BoardPollPrizeWinner[] = Array.isArray(poll.prizeWinners) ? poll.prizeWinners : [];
      const alreadyDrawn = prizeWinners.length > 0;
      const isDrawing = drawingPostId === selectedPost.id;

      const handlePostPollVote = async (optIdx: number) => {
        if (!myId) return;
        const nextVotes = await togglePollVote(
          selectedPost.id,
          optIdx,
          String(myId),
          votes,
          Boolean(poll.multiple),
        );
        if (!nextVotes) return;
        setPosts((prev) => prev.map((p) => p.id === selectedPost.id ? { ...p, poll_votes: nextVotes } : p));
        setSelectedPostDetail((prev: BoardPost | null) => prev?.id === selectedPost.id ? { ...prev, poll_votes: nextVotes } : prev);
      };

      const handleDrawPrize = async () => {
        if (!isAuthor || !myId) return;
        setDrawingPostId(selectedPost.id);
        try {
          const { drawBoardPollPrize } = await import('./board-poll-prize');
          const result = await drawBoardPollPrize({
            postId: selectedPost.id,
            poll,
            pollVotes: votes,
            actorId: myId,
            actorName: user?.name ?? '관리자' });
          if (!result.ok) {
            toast(result.message, 'warning');
            return;
          }
          // 낙관적 갱신: poll.prizeWinners 반영
          const updatedPoll: BoardPoll = { ...poll, prizeWinners: result.winners };
          const updatedPollVotes = votes;
          setPosts((prev) => prev.map((p) =>
            p.id === selectedPost.id ? { ...p, poll: updatedPoll } : p,
          ));
          setSelectedPostDetail((prev: BoardPost | null) =>
            prev?.id === selectedPost.id ? { ...prev, poll: updatedPoll, poll_votes: updatedPollVotes } : prev,
          );
          // 댓글 목록 새로고침 (추첨 결과 댓글 표시)
          const { data: newComments } = await db
            .from('board_post_comments')
            .select(BOARD_COMMENT_SELECT)
            .eq('post_id', selectedPost.id)
            .order('created_at', { ascending: true });
          if (newComments) {
            setComments((prev) => ({ ...prev, [selectedPost.id]: newComments as BoardCommentRow[] }));
          }
          toast(`🎉 추첨 완료! 당첨자: ${result.winners.map((w: BoardPollPrizeWinner) => w.name).join(', ')}`);
        } finally {
          setDrawingPostId(null);
        }
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
                <button key={i} type="button" onClick={() => void handlePostPollVote(i)} className={`w-full text-left rounded-lg border p-3 transition relative overflow-hidden ${myVote ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/30'}`}>
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
          {/* 상품 추첨 영역 */}
          {hasPrize && (
            <div className="border-t border-[var(--accent)]/10 pt-3 space-y-2">
              {alreadyDrawn ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 space-y-0.5">
                  <p className="text-xs font-bold text-amber-700">🎁 상품: {poll.prize!.name}</p>
                  <p className="text-xs font-bold text-amber-800">🏆 당첨: {prizeWinners.map((w) => w.name).join(', ')}</p>
                </div>
              ) : (
                <>
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">🎁 상품: {poll.prize!.name} (당첨 {poll.prize!.winnerCount}명)</p>
                  {isAuthor && (
                    <button
                      type="button"
                      onClick={() => void handleDrawPrize()}
                      disabled={isDrawing}
                      aria-label="투표 참여자 중 상품 당첨자 추첨"
                      className="px-4 py-2 rounded-[var(--radius-md)] bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {isDrawing ? '추첨 중...' : '🎁 추첨하기'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      );
    })() : null) as ReactNode}

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
              <a key={i} href={buildStorageInlineUrl(att.url, att.name ?? '') || att.url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={buildStorageInlineUrl(att.url, att.name ?? '') || att.url}
                  alt={att.name}
                  loading="lazy"
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
                <video src={buildStorageInlineUrl(att.url, att.name ?? '') || att.url} controls className="w-full max-h-[240px]" preload="metadata" />
                <p className="text-[11px] font-bold text-[var(--toss-gray-4)] p-2 bg-[var(--page-bg)] truncate">{att.name}</p>
              </div>
            ) : (
              <a
                key={i}
                href={buildStorageDownloadUrl(att.url, att.name ?? '')}
                onClick={(event) => void handleAttachmentDownloadClick(event, att.url, att.name ?? '')}
                target="_blank"
                rel="noopener noreferrer"
                download={att.name ?? 'download'}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-[var(--radius-lg)] bg-[var(--muted)] border border-[var(--border)] text-sm font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)]"
              >
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
      {isMobile ? (
        <CommentComposerSticky
          value={newComment}
          onChange={setNewComment}
          onSubmit={() => handleAddComment(selectedPost.id, replyParentId)}
          placeholder={user?.id ? (replyParentId ? '답글을 입력하세요…' : '댓글을 입력하세요.') : '로그인한 후 댓글을 입력할 수 있습니다.'}
          disabled={!user?.id}
          ariaLabel={replyParentId ? '답글 작성' : '댓글 작성'}
          submitLabel="등록"
          withSpacer={true}
        />
      ) : (
        <div className="flex gap-2">
          <label htmlFor="board-comment-input" className="sr-only">
            {replyParentId ? '답글 작성' : '댓글 작성'}
          </label>
          <input
            id="board-comment-input"
            data-testid="board-comment-input"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && user?.id && newComment.trim()) {
                e.preventDefault();
                void handleAddComment(selectedPost.id, replyParentId);
              }
            }}
            placeholder={user?.id ? '댓글을 입력하세요.' : '로그인한 후 댓글을 입력할 수 있습니다.'}
            disabled={!user?.id}
            aria-label={replyParentId ? '답글 작성' : '댓글 작성'}
            maxLength={4000}
            className="flex-1 px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-xs disabled:bg-[var(--page-bg)] disabled:text-[var(--toss-gray-3)]"
          />
          <button
            type="button"
            data-testid="board-comment-submit"
            onClick={() => handleAddComment(selectedPost.id, replyParentId)}
            disabled={!user?.id || !newComment.trim()}
            aria-disabled={!user?.id || !newComment.trim()}
            className="px-3 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-xs font-bold hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            등록
          </button>
        </div>
      )}
    </div>

  </div>
</div>
  );
}

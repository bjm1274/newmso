'use client';

/**
 * SBoardDetail — 게시판 상세.
 *   - MobileHeader(back + 별표(서버)/공유/더보기)
 *   - 메타(칩) + 제목 + 작성자 + 본문(텍스트) + 첨부(이미지 인라인/파일 카드) + 댓글 목록
 *   - 좋아요 토글 (sticky 푸터 ♥ 버튼) + 카운트
 *   - 조회수 RPC + realtime 댓글 폴링
 *   - 바닥 sticky 댓글 입력
 * JM(~470줄), JM3(toast·낙관적 롤백), JM5(본문 텍스트만), JM6(button 시맨틱·aria-label·aria-pressed)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import {
  BOARD_CATS,
  type BoardComment,
  type BoardListPost,
  type SafeAttachment,
  boardTypeToCat,
  deleteBoardComment,
  deleteBoardPost,
  getSafeAttachments,
  pickAvatarTone,
} from './data-hooks';
import { toggleLike } from './좋아요훅';
import { useBoardDetailRealtime, useIncrementPostView } from './상세훅';
import BoardCommentTree from './댓글트리';
import { extractPoll, parsePollVotes } from './투표뷰';
import BoardDetailHeader from './상세헤더';
import ReadStatusSheet from './읽음시트';
import PostMenuSheet from './상세메뉴';
import CommentComposer from './댓글입력';
import {
  canDeleteMobilePost,
  canEditMobilePost,
  isAnonymousReadStatusPost,
  markBoardPostRead,
  useReadStatus,
} from './권한읽음';
import type { BoardPoll } from '@/app/main/기능부품/게시판서브/board-poll-prize';
import {
  buildStorageDownloadUrl,
  buildStorageInlineUrl,
} from '@/lib/object-storage-url';
import { extractAttachmentMetaFromContent } from '@/app/main/기능부품/게시판공통';
import { toast } from '@/lib/toast';

export type SBoardDetailProps = {
  post: BoardListPost | null;
  comments: BoardComment[];
  loading: boolean;
  onBack: () => void;
  onAddComment: (content: string, parentCommentId?: string | null) => Promise<boolean>;
  onRefetchComments: () => Promise<void>;
  onPatchPost: (patch: Partial<BoardListPost>) => void;
  currentUserId?: string | null;
  currentUserName?: string | null;
  /** 관리자/시스템 마스터 — 수정·삭제·읽음현황 게이트 */
  canAdmin?: boolean;
  /** 내 좋아요 상태 */
  isLiked: boolean;
  /** 좋아요 토글 후 부모 상태 동기화 */
  onLikedChange: (postId: string, liked: boolean, likesCount: number) => void;
  /** ⋯ 메뉴 → 수정 모드 진입 (글작성 EDIT) */
  onEdit?: (post: BoardListPost) => void;
  /** 게시글 삭제 완료 → 목록으로 복귀 + refetch */
  onDeleted?: (postId: string) => void;
};

// ─────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────

export default function SBoardDetail({
  post,
  comments,
  loading,
  onBack,
  onAddComment,
  onRefetchComments,
  onPatchPost,
  currentUserId,
  currentUserName,
  canAdmin = false,
  isLiked,
  onLikedChange,
  onEdit,
  onDeleted,
}: SBoardDetailProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  // P2: 답글 대상 (root 댓글 한 명) — null이면 일반 댓글
  const [replyTo, setReplyTo] = useState<BoardComment | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // ⋯ 더보기 메뉴 / 읽음 현황 시트
  const [menuOpen, setMenuOpen] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { readers, pending, loading: readLoading, load: loadReadStatus } = useReadStatus(post);

  const postIdForHook = post ? String(post.id) : null;
  // 조회수 RPC — postId 변경 시 한 번만 +1, ref guard
  useIncrementPostView(postIdForHook, () => {
    onPatchPost({ views: ((post?.views as number | undefined) ?? 0) + 1 });
  });
  // 댓글/좋아요 realtime
  useBoardDetailRealtime(postIdForHook, () => {
    void onRefetchComments();
  });

  // 상세 진입 시 읽음 마킹 (1회, 익명글 제외 — PC markBoardPostRead 미러)
  useEffect(() => {
    if (!post) return;
    void markBoardPostRead(post, currentUserId ?? null);
  }, [post?.id, currentUserId]);

  // sending lock 보호 (composition)
  useEffect(() => {
    if (!sending) return;
    const t = setTimeout(() => setSending(false), 8000);
    return () => clearTimeout(t);
  }, [sending]);

  const handleSubmit = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    const parentId = replyTo ? String(replyTo.id) : null;
    const ok = await onAddComment(content, parentId);
    if (ok) {
      setDraft('');
      setReplyTo(null);
    }
    setSending(false);
  }, [draft, sending, replyTo, onAddComment]);

  const handleReplyStart = useCallback((parent: BoardComment) => {
    setReplyTo(parent);
    // 다음 tick 에 포커스
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleReplyCancel = useCallback(() => {
    setReplyTo(null);
  }, []);

  // P2: Web Share API + clipboard fallback (JM3: AbortError silent)
  const handleShare = useCallback(async () => {
    if (!post) return;
    const postIdStr = String(post.id);
    const title = String(post.title ?? '게시글');
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    // PC deep link 패턴: ?open_post=<id>
    const shareUrl = origin ? `${origin}/main?open_post=${encodeURIComponent(postIdStr)}` : postIdStr;
    const text = `[게시판] ${title}`;
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav && typeof nav.share === 'function') {
        await nav.share({ title, text, url: shareUrl });
        return;
      }
      // fallback: clipboard
      if (nav && nav.clipboard?.writeText) {
        await nav.clipboard.writeText(shareUrl);
        toast('링크가 복사되었습니다.', 'success');
        return;
      }
      toast('공유를 지원하지 않는 환경입니다.', 'warning');
    } catch (err) {
      // 사용자 거부(AbortError)는 무시
      const name = (err as { name?: string })?.name;
      if (name === 'AbortError') return;
      // clipboard 실패는 토스트
      toast('공유 실패: 링크를 직접 복사해 주세요.', 'error');
    }
  }, [post]);

  const handleLikeClick = useCallback(async () => {
    if (!post || likeBusy) return;
    setLikeBusy(true);
    const postIdStr = String(post.id);
    const prevLiked = isLiked;
    const prevLikes = typeof post.likes_count === 'number' ? post.likes_count : 0;
    // 낙관적 UI 업데이트
    const optimisticLikes = prevLiked ? Math.max(prevLikes - 1, 0) : prevLikes + 1;
    onPatchPost({ likes_count: optimisticLikes });
    onLikedChange(postIdStr, !prevLiked, optimisticLikes);

    const result = await toggleLike(currentUserId ?? null, postIdStr, prevLiked, prevLikes);
    // 서버 카운트 동기화
    onPatchPost({ likes_count: result.likesCount });
    onLikedChange(postIdStr, result.liked, result.likesCount);
    setLikeBusy(false);
  }, [post, isLiked, likeBusy, currentUserId, onPatchPost, onLikedChange]);

  // ⋯ 메뉴 — 수정
  const handleEditClick = useCallback(() => {
    if (!post) return;
    setMenuOpen(false);
    onEdit?.(post);
  }, [post, onEdit]);

  // ⋯ 메뉴 — 삭제 (confirm → deleteBoardPost → 목록 복귀)
  const handleDeleteClick = useCallback(async () => {
    if (!post || deleting) return;
    setMenuOpen(false);
    const ok = typeof window === 'undefined'
      ? true
      : window.confirm('이 게시물을 삭제할까요?\n댓글·읽음 상태가 함께 사라질 수 있습니다.');
    if (!ok) return;
    setDeleting(true);
    const success = await deleteBoardPost(String(post.id));
    setDeleting(false);
    if (success) {
      toast('게시물이 삭제되었습니다.', 'success');
      onDeleted?.(String(post.id));
    }
  }, [post, deleting, onDeleted]);

  // 댓글 삭제
  const handleDeleteComment = useCallback(
    async (comment: BoardComment) => {
      const ok = typeof window === 'undefined' ? true : window.confirm('이 댓글을 삭제할까요?');
      if (!ok) return;
      const success = await deleteBoardComment(String(comment.id));
      if (success) {
        toast('댓글이 삭제되었습니다.', 'success');
        await onRefetchComments();
      }
    },
    [onRefetchComments],
  );

  // 읽음 현황 열기
  const handleOpenReadStatus = useCallback(() => {
    setMenuOpen(false);
    setReadOpen(true);
    void loadReadStatus();
  }, [loadReadStatus]);

  // 투표 — 부모 post 상태에 poll_votes / poll 동기화
  const handleVotesChange = useCallback(
    (votes: Record<string, string[]>) => {
      onPatchPost({ poll_votes: votes } as Partial<BoardListPost>);
    },
    [onPatchPost],
  );
  const handlePollChange = useCallback(
    (nextPoll: BoardPoll) => {
      onPatchPost({ poll: nextPoll } as Partial<BoardListPost>);
    },
    [onPatchPost],
  );

  if (!post && !loading) {
    return (
      <div className="m-screen">
        <MobileHeader title="게시글" back={onBack} />
        <div className="m-scroll">
          <div className="m-card" style={{ margin: 16, textAlign: 'center', padding: '32px 16px' }}>
            <MIcon name="info" size={24} color="var(--z-400)" />
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: 'var(--z-600)' }}>
              게시글을 찾을 수 없습니다
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="m-screen">
        <MobileHeader title="게시글" back={onBack} />
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--z-500)' }}>
          불러오는 중…
        </div>
      </div>
    );
  }

  const cat = boardTypeToCat(post.board_type as string | null);
  const catDef = BOARD_CATS.find((c) => c.id === cat);
  const isImportant = (post.status === '중요') ||
    (Array.isArray(post.tags) && post.tags.map((t) => String(t)).includes('중요'));
  // P2: 익명 게시글 표시 — author 이름·아바타 톤도 안전 처리 (JM5)
  const isAnonymousPost = Boolean((post as { is_anonymous?: boolean | null }).is_anonymous);
  const rawAuthor = String(post.author_name ?? '');
  const authorName = isAnonymousPost ? '익명' : (rawAuthor || '익명');
  const isOwnPost = !isAnonymousPost && Boolean(currentUserId) && String(post.author_id ?? '') === String(currentUserId ?? '');
  const authorTone = isAnonymousPost
    ? 'blue'
    : pickAvatarTone(String(post.author_id ?? authorName));
  const views = typeof post.views === 'number' ? post.views : 0;
  const commentCount = comments.length;
  const attachments = getSafeAttachments(post);
  const headerTitle = catDef?.label === '공지' ? '공지사항' : catDef?.label ?? '게시글';
  const likesCount = typeof post.likes_count === 'number' ? post.likes_count : 0;
  // 본문에서 [[ATTACHMENTS_META]] 메타 제거 후 markdown 렌더
  // (early return 이후라 useMemo 불가 — 단순 동기 호출. extract 자체가 가볍다.)
  const bodyForRender = extractAttachmentMetaFromContent(String(post.content ?? '')).displayContent;

  // 권한 / 투표 / 읽음
  const canEdit = canEditMobilePost(post, currentUserId, canAdmin);
  const canDelete = canDeleteMobilePost(post, currentUserId, canAdmin);
  const canSeeReadStatus = !isAnonymousReadStatusPost(post);
  const poll = extractPoll((post as { poll?: unknown }).poll);
  const pollVotes = parsePollVotes((post as { poll_votes?: unknown }).poll_votes);

  const openAttachment = (att: SafeAttachment) => {
    const inline = buildStorageInlineUrl(att.url, att.name);
    if (typeof window !== 'undefined') {
      window.open(inline, '_blank', 'noopener,noreferrer');
    }
  };
  const downloadAttachment = (att: SafeAttachment) => {
    const dl = buildStorageDownloadUrl(att.url, att.name);
    if (typeof window !== 'undefined') {
      window.location.href = dl;
    }
  };

  return (
    <div
      className="m-screen"
      style={{
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        className="macos-glass"
        style={{
          padding: '16px 20px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          position: 'sticky',
          top: 0,
          zIndex: 99,
          background: 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'rgba(0, 0, 0, 0.03)',
            border: '1px solid rgba(0, 0, 0, 0.05)',
            cursor: 'pointer',
          }}
        >
          <MIcon name="chevL" size={18} color="var(--z-600)" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 800,
              color: 'var(--foreground)',
              letterSpacing: '-0.015em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {headerTitle}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            aria-label="공유"
            onClick={() => void handleShare()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'rgba(0, 0, 0, 0.03)',
              border: '1px solid rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
            }}
          >
            <MIcon name="share" size={18} color="var(--z-600)" />
          </button>
          <button
            type="button"
            aria-label="더보기"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'rgba(0, 0, 0, 0.03)',
              border: '1px solid rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
            }}
          >
            <MIcon name="moreV" size={18} color="var(--z-600)" />
          </button>
        </div>
      </div>
      <div className="m-scroll" style={{ background: 'transparent' }}>
        <div style={{ padding: '16px 16px 0' }}>
          <BoardDetailHeader
            post={post}
            catLabel={catDef?.label ?? '기타'}
            catTone={catDef?.tone || ''}
            isImportant={isImportant}
            isAnonymousPost={isAnonymousPost}
            authorName={authorName}
            authorTone={authorTone}
            isOwnPost={isOwnPost}
            views={views}
            commentCount={commentCount}
            likesCount={likesCount}
            isLiked={isLiked}
            likeBusy={likeBusy}
            bodyForRender={bodyForRender}
            attachments={attachments}
            poll={poll}
            pollVotes={pollVotes}
            currentUserId={currentUserId ?? null}
            currentUserName={currentUserName ?? null}
            onLike={() => void handleLikeClick()}
            onOpenAttachment={openAttachment}
            onDownloadAttachment={downloadAttachment}
            onVotesChange={handleVotesChange}
            onPollChange={handlePollChange}
            onRefetchComments={onRefetchComments}
          />

          {/* 댓글 헤더 */}
          <div className="m-section-h" style={{ marginBottom: 10, display: 'flex', alignItems: 'center' }}>
            <div className="lbl">댓글 {commentCount}</div>
            {canSeeReadStatus && (
              <button
                type="button"
                onClick={handleOpenReadStatus}
                aria-label="읽음 현황 보기"
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  fontWeight: 800,
                  color: 'var(--m-accent)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 6px',
                }}
              >
                <MIcon name="eye" size={13} /> 읽음 현황
              </button>
            )}
          </div>

          <BoardCommentTree
            comments={comments}
            onReply={handleReplyStart}
            onDelete={(c) => void handleDeleteComment(c)}
            currentUserId={currentUserId}
            canAdmin={canAdmin}
          />

          <div style={{ height: 20 }} />
        </div>
      </div>

      {/* sticky 댓글 입력 */}
      <CommentComposer
        ref={inputRef}
        draft={draft}
        sending={sending}
        replyTo={replyTo}
        currentUserName={currentUserName}
        onDraftChange={setDraft}
        onSubmit={() => void handleSubmit()}
        onReplyCancel={handleReplyCancel}
      />

      {/* ⋯ 더보기 메뉴 (수정/삭제/읽음현황) */}
      <PostMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        canEdit={canEdit}
        canDelete={canDelete}
        canSeeReadStatus={canSeeReadStatus}
        deleting={deleting}
        onEdit={handleEditClick}
        onReadStatus={handleOpenReadStatus}
        onDelete={() => void handleDeleteClick()}
      />

      {/* 읽음 현황 시트 */}
      <ReadStatusSheet
        open={readOpen}
        onClose={() => setReadOpen(false)}
        readers={readers}
        pending={pending}
        loading={readLoading}
      />
    </div>
  );
}

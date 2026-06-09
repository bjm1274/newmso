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
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import {
  BOARD_CATS,
  type BoardComment,
  type BoardListPost,
  type SafeAttachment,
  boardTypeToCat,
  formatLongDate,
  formatShortDate,
  getSafeAttachments,
  pickAvatarTone,
} from './data-hooks';
import { toggleLike } from './좋아요훅';
import { useBoardDetailRealtime, useIncrementPostView } from './상세훅';
import BoardMarkdown from './마크다운';
import BoardCommentTree from './댓글트리';
import { AttachmentRow, ImageAttachment } from './첨부카드';
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
  /** 내 좋아요 상태 */
  isLiked: boolean;
  /** 좋아요 토글 후 부모 상태 동기화 */
  onLikedChange: (postId: string, liked: boolean, likesCount: number) => void;
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
  isLiked,
  onLikedChange,
}: SBoardDetailProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  // P2: 답글 대상 (root 댓글 한 명) — null이면 일반 댓글
  const [replyTo, setReplyTo] = useState<BoardComment | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const postIdForHook = post ? String(post.id) : null;
  // 조회수 RPC — postId 변경 시 한 번만 +1, ref guard
  useIncrementPostView(postIdForHook, () => {
    onPatchPost({ views: ((post?.views as number | undefined) ?? 0) + 1 });
  });
  // 댓글/좋아요 realtime
  useBoardDetailRealtime(postIdForHook, () => {
    void onRefetchComments();
  });

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
    <div className="m-screen">
      <MobileHeader
        title={headerTitle}
        back={onBack}
        actions={
          <>
            <button type="button" aria-label="공유" onClick={() => void handleShare()}>
              <MIcon name="share" size={20} />
            </button>
            <button type="button" aria-label="더보기">
              <MIcon name="moreV" size={20} />
            </button>
          </>
        }
      />
      <div className="m-scroll">
        <div style={{ padding: '16px 16px 0' }}>
          {/* 메타 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <MChip tone={catDef?.tone || ''}>{catDef?.label ?? '기타'}</MChip>
            {isImportant && <MChip tone="danger">중요</MChip>}
            <div style={{ flex: 1 }} />
            <span
              style={{
                fontSize: 11,
                color: 'var(--z-500)',
                fontWeight: 600,
                display: 'inline-flex',
                gap: 3,
                alignItems: 'center',
              }}
            >
              <MIcon name="user" size={11} />
              {views}
              <MIcon name="chat" size={11} />
              {commentCount}
            </span>
          </div>

          {/* 제목 */}
          <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.028em', lineHeight: 1.35 }}>
            {post.title}
          </h1>

          {/* 작성자 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 14,
              paddingBottom: 14,
              borderBottom: '1px solid var(--m-border)',
            }}
          >
            {isAnonymousPost ? (
              <div
                aria-hidden
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--z-200)',
                  color: 'var(--z-500)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                ?
              </div>
            ) : (
              <MAvatar tone={authorTone} size="sm">{authorName.charAt(0) || '?'}</MAvatar>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>
                {authorName}
                {isOwnPost && (
                  <span style={{ fontSize: 11, color: 'var(--m-accent)', fontWeight: 700 }}>
                    {' '}(본인)
                  </span>
                )}
                {!isAnonymousPost && post.company && (
                  <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                    {' '}· {String(post.company)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 1 }}>
                {formatLongDate(post.created_at as string | null) || formatShortDate(post.created_at as string | null)}
                {' · '}조회 {views}
              </div>
            </div>
          </div>

          {/* 본문 — 안전한 markdown 렌더 (JM5: dangerouslySetInnerHTML 금지) */}
          <div style={{ padding: '16px 0' }}>
            <BoardMarkdown source={bodyForRender} />
          </div>

          {/* 첨부 — 이미지 인라인 / 그 외 카드 */}
          {attachments.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {attachments.filter((a) => a.kind === 'image').map((att) => (
                <ImageAttachment
                  key={att.url}
                  attachment={att}
                  onOpen={() => openAttachment(att)}
                />
              ))}
              {attachments.some((a) => a.kind !== 'image') && (
                <div className="m-card flush">
                  {attachments.filter((a) => a.kind !== 'image').map((att) => (
                    <AttachmentRow
                      key={att.url}
                      attachment={att}
                      onOpen={() => openAttachment(att)}
                      onDownload={() => downloadAttachment(att)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 좋아요 행 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 0',
              borderTop: '1px solid var(--m-border)',
              borderBottom: '1px solid var(--m-border)',
              marginBottom: 16,
            }}
          >
            <button
              type="button"
              onClick={() => void handleLikeClick()}
              aria-label={isLiked ? '좋아요 취소' : '좋아요'}
              aria-pressed={isLiked}
              disabled={likeBusy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 999,
                background: isLiked ? 'var(--m-danger-soft)' : 'var(--m-bg)',
                color: isLiked ? 'var(--m-danger)' : 'var(--z-700)',
                fontSize: 13,
                fontWeight: 700,
                opacity: likeBusy ? 0.5 : 1,
              }}
            >
              <MIcon name="heart" size={16} />
              좋아요 {likesCount}
            </button>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
              조회 {views} · 댓글 {commentCount}
            </span>
          </div>

          {/* 댓글 헤더 */}
          <div className="m-section-h" style={{ marginBottom: 10 }}>
            <div className="lbl">댓글 {commentCount}</div>
          </div>

          <BoardCommentTree comments={comments} onReply={handleReplyStart} />

          <div style={{ height: 20 }} />
        </div>
      </div>

      {/* sticky 댓글 입력 */}
      <div className="m-sticky-foot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
        {replyTo && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              background: 'var(--m-accent-soft)',
              color: 'var(--m-accent)',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <span aria-hidden>↳</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {String(replyTo.author_name ?? '익명')}에게 답글
            </span>
            <button
              type="button"
              onClick={handleReplyCancel}
              aria-label="답글 취소"
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--m-bg)',
                color: 'var(--z-600)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <MIcon name="x" size={12} />
            </button>
          </div>
        )}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--m-bg)',
            borderRadius: 22,
            padding: '4px 6px 4px 12px',
          }}
        >
          <label htmlFor="board-comment-input" style={{ position: 'absolute', left: -9999 }}>
            댓글 입력
          </label>
          <input
            id="board-comment-input"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder={
              replyTo
                ? `${String(replyTo.author_name ?? '익명')}에게 답글…`
                : (currentUserName ? `${currentUserName}님, 댓글 입력` : '댓글 입력')
            }
            style={{ flex: 1, padding: '8px 0', fontSize: 14, fontFamily: 'inherit' }}
            disabled={sending}
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!draft.trim() || sending}
            aria-label={replyTo ? '답글 등록' : '댓글 등록'}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: draft.trim() ? 'var(--m-accent)' : 'var(--z-300)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              opacity: sending ? 0.5 : 1,
            }}
          >
            <MIcon name="send" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

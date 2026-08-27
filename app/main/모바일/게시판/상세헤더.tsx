'use client';

/**
 * 상세헤더 — 게시글 상세 상단 표시(메타·제목·작성자·본문·투표·첨부·좋아요).
 * 게시판상세.tsx에서 분리 (JM 500줄 이내 유지). 데이터/핸들러는 부모가 소유.
 * JM: 단일 책임(표시), JM5(본문 markdown 안전 렌더), JM6(button·aria)
 */

import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar, { type MAvatarTone } from '../공통/MAvatar';
import BoardMarkdown from './마크다운';
import BoardPollView from './투표뷰';
import { AttachmentRow, ImageAttachment } from './첨부카드';
import { type BoardListPost, type SafeAttachment, formatLongDate, formatShortDate } from './data-hooks';
import type { PollVotes } from './게시판변경';
import type { BoardPoll } from '@/app/main/기능부품/게시판서브/board-poll-prize';
import type { MChipProps } from '../공통/MChip';

export type BoardDetailHeaderProps = {
  post: BoardListPost;
  catLabel: string;
  catTone: MChipProps['tone'];
  isImportant: boolean;
  isAnonymousPost: boolean;
  authorName: string;
  authorTone: MAvatarTone;
  isOwnPost: boolean;
  views: number;
  commentCount: number;
  likesCount: number;
  isLiked: boolean;
  likeBusy: boolean;
  bodyForRender: string;
  attachments: SafeAttachment[];
  poll: BoardPoll | null;
  pollVotes: PollVotes;
  currentUserId: string | null;
  currentUserName: string | null;
  onLike: () => void;
  onOpenAttachment: (att: SafeAttachment) => void;
  onDownloadAttachment: (att: SafeAttachment) => void;
  onVotesChange: (votes: PollVotes) => void;
  onPollChange: (poll: BoardPoll) => void;
  onRefetchComments: () => Promise<void>;
};

export default function BoardDetailHeader({
  post,
  catLabel,
  catTone,
  isImportant,
  isAnonymousPost,
  authorName,
  authorTone,
  isOwnPost,
  views,
  commentCount,
  likesCount,
  isLiked,
  likeBusy,
  bodyForRender,
  attachments,
  poll,
  pollVotes,
  currentUserId,
  currentUserName,
  onLike,
  onOpenAttachment,
  onDownloadAttachment,
  onVotesChange,
  onPollChange,
  onRefetchComments }: BoardDetailHeaderProps) {
  return (
    <>
      {/* 메타 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <MChip tone={catTone}>{catLabel}</MChip>
        {isImportant && <MChip tone="danger">중요</MChip>}
        <div style={{ flex: 1 }} />
        <span
          style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, display: 'inline-flex', gap: 3, alignItems: 'center' }}
        >
          <MIcon name="user" size={11} />
          {views}
          <MIcon name="chat" size={11} />
          {commentCount}
        </span>
      </div>

      {/* 제목 */}
      <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.028em', lineHeight: 1.35 }}>{post.title}</h1>

      {/* 작성자 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 14,
          paddingBottom: 14,
          borderBottom: '1px solid var(--m-border)' }}
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
              flexShrink: 0 }}
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
              <span style={{ fontSize: 11, color: 'var(--m-accent)', fontWeight: 700 }}> (본인)</span>
            )}
            {!isAnonymousPost && post.company && (
              <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}> · {String(post.company)}</span>
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

      {/* 투표/설문 + 상품 추첨 */}
      {poll && (
        <BoardPollView
          postId={String(post.id)}
          poll={poll}
          pollVotes={pollVotes}
          postTitle={String(post.title ?? '')}
          currentUserId={currentUserId}
          isAuthor={isOwnPost}
          currentUserName={currentUserName}
          onVotesChange={onVotesChange}
          onPollChange={onPollChange}
          onRefetchComments={onRefetchComments}
        />
      )}

      {/* 첨부 — 이미지 인라인 / 그 외 카드 */}
      {attachments.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {attachments.filter((a) => a.kind === 'image').map((att) => (
            <ImageAttachment key={att.url} attachment={att} onOpen={() => onOpenAttachment(att)} />
          ))}
          {attachments.some((a) => a.kind !== 'image') && (
            <div className="m-card flush">
              {attachments.filter((a) => a.kind !== 'image').map((att) => (
                <AttachmentRow
                  key={att.url}
                  attachment={att}
                  onDownload={() => onDownloadAttachment(att)}
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
          marginBottom: 16 }}
      >
        <button
          type="button"
          onClick={onLike}
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
            opacity: likeBusy ? 0.5 : 1 }}
        >
          <MIcon name="heart" size={16} />
          좋아요 {likesCount}
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
          조회 {views} · 댓글 {commentCount}
        </span>
      </div>
    </>
  );
}

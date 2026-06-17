'use client';

/**
 * 게시판카드 — 목록의 게시글 카드(일반/일정 분기).
 * 게시판목록.tsx에서 분리 (JM 500줄 이내 유지). 표시 전용.
 * JM: 단일 책임(카드 표시), JM6(button·aria-label)
 */

import { memo } from 'react';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import { BOARD_CATS, type BoardListPost, boardTypeToCat, formatShortDate, pickAvatarTone } from './data-hooks';

function PostCard({ post, onOpen }: { post: BoardListPost; onOpen: () => void }) {
  const cat = boardTypeToCat(post.board_type as string | null);
  void BOARD_CATS.find((c) => c.id === cat); // cat 유효성 (표시는 아래 분기)
  const isPinned = Boolean(post.is_pinned);
  const authorName = String(post.author_name ?? '익명');
  const initial = authorName.charAt(0) || '?';
  const tone = pickAvatarTone(String(post.id ?? authorName));
  const views = typeof post.views === 'number' ? post.views : 0;
  const commentCount = post.comment_count ?? 0;

  const isSchedule = cat === 'op' || cat === 'mri';

  if (isSchedule) {
    const isOp = cat === 'op';
    return (
      <div
        className="m-card"
        data-variant="mobile"
        style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${post.title} 상세 보기`}
          style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 0, width: '100%' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--z-900)', lineHeight: 1.4 }}>
                {post.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--m-accent)', fontWeight: 800, marginTop: 4 }}>
                {post.patient_name || '환자명 미지정'}
                {post.content && (
                  <span style={{ color: 'var(--z-500)', marginLeft: 6 }}>
                    | 차트번호: {post.content}
                  </span>
                )}
              </div>
            </div>
            <MChip tone={isOp ? 'danger' : 'accent'}>
              {isOp ? '🏥 수술' : '🔬 MRI'}
            </MChip>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              paddingTop: 10,
              marginTop: 10,
              borderTop: '1px solid var(--m-border)',
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--z-400)', textTransform: 'uppercase' }}>날짜</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-800)', marginTop: 2 }}>{post.schedule_date || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--z-400)', textTransform: 'uppercase' }}>시간</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-800)', marginTop: 2 }}>{post.schedule_time || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--z-400)', textTransform: 'uppercase' }}>위치</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-800)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.schedule_room || '-'}</div>
            </div>
          </div>

          {(post.surgery_fasting || post.surgery_inpatient || post.surgery_guardian || post.surgery_caregiver || post.surgery_transfusion) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
              {post.surgery_fasting && <MChip tone="danger">금식</MChip>}
              {post.surgery_inpatient && <MChip tone="accent">입원</MChip>}
              {post.surgery_guardian && <MChip tone="success">보호자 동반</MChip>}
              {post.surgery_caregiver && <MChip tone="warning">간병인</MChip>}
              {post.surgery_transfusion && <MChip tone="danger">수혈</MChip>}
            </div>
          )}
        </button>

        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--z-400)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <MIcon name="user" size={11} /> {views}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="m-card"
      data-variant="mobile"
      style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${post.title} 상세 보기`}
        style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 0, width: '100%' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {isPinned && <MIcon name="pin" size={12} color="var(--m-accent)" />}
          <span
            data-testid={`board-post-status-pill-${post.id}`}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--accent-tint)',
              color: 'var(--m-accent)',
            }}
          >
            {post.status || '게시중'}
          </span>
          {(Array.isArray(post.attachments) ? post.attachments : []).length > 0 && (
            <span
              data-testid={`board-post-attachment-indicator-${post.id}`}
              style={{ fontSize: 12, color: 'var(--z-400)' }}
            >
              📎
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span
            data-testid={`board-post-date-${post.id}`}
            style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}
          >
            {formatShortDate(post.created_at as string | null)}
          </span>
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '-0.018em',
            lineHeight: 1.45,
            color: 'var(--z-900)',
          }}
        >
          {post.title}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
            fontSize: 11,
            color: 'var(--z-500)',
            fontWeight: 600,
          }}
        >
          <MAvatar tone={tone} size="sm">{initial}</MAvatar>
          <b style={{ color: 'var(--z-700)' }}>{authorName}</b>
          {post.company && (
            <>
              <span style={{ color: 'var(--z-400)' }}>·</span>
              <span>{String(post.company)}</span>
            </>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <MIcon name="user" size={11} />
            {views}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              color: commentCount > 0 ? 'var(--m-accent)' : 'var(--z-500)',
            }}
          >
            <MIcon name="chat" size={11} />
            {commentCount}
          </span>
        </div>
      </button>
    </div>
  );
}

const PostCardMemo = memo(PostCard);
export default PostCardMemo;

'use client';

/**
 * BoardCommentTree — parent_comment_id 트리(1단계).
 *   - root + replies 분리 후 root별로 묶어 들여쓰기 표시
 *   - 각 댓글에 "답글" 버튼 → onReply(comment) 호출 (sticky 입력창 표시 trigger)
 *   - 2단계 이상은 평면 (정책: 가독성 보호 — JM6)
 * JM(단일 책임), JM3(empty 안내), JM4(타입 명시), JM6(button + aria-label)
 */

import { useMemo } from 'react';
import MAvatar from '../공통/MAvatar';
import MIcon from '../공통/MIcon';
import { type BoardComment, formatShortDate, pickAvatarTone } from './data-hooks';

export type BoardCommentTreeProps = {
  comments: BoardComment[];
  onReply: (parent: BoardComment) => void;
};

type CommentNode = {
  comment: BoardComment;
  replies: BoardComment[];
};

function buildTree(comments: BoardComment[]): CommentNode[] {
  // 루트: parent_comment_id 없음
  // 답글: parent_comment_id가 루트 id이거나, 또는 (정책) 또 다른 답글 id 인 경우 → 그 답글의 루트로 흡수
  const byId = new Map<string, BoardComment>();
  comments.forEach((c) => byId.set(String(c.id), c));

  // 각 댓글의 "최종 루트 id" 산출 (최대 5단계까지 추적)
  const resolveRootId = (c: BoardComment): string | null => {
    let cur: BoardComment | undefined = c;
    let depth = 0;
    while (cur && cur.parent_comment_id && depth < 5) {
      const next = byId.get(String(cur.parent_comment_id));
      if (!next) break;
      cur = next;
      depth += 1;
    }
    return cur ? String(cur.id) : null;
  };

  const roots: BoardComment[] = comments.filter((c) => !c.parent_comment_id);
  const repliesByRoot = new Map<string, BoardComment[]>();
  comments.forEach((c) => {
    if (!c.parent_comment_id) return;
    const rootId = resolveRootId(c);
    if (!rootId) return;
    const list = repliesByRoot.get(rootId) ?? [];
    list.push(c);
    repliesByRoot.set(rootId, list);
  });

  return roots.map((r) => ({
    comment: r,
    replies: (repliesByRoot.get(String(r.id)) ?? []).sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return at - bt;
    }),
  }));
}

function CommentBody({
  comment,
  isReply,
  onReply,
}: {
  comment: BoardComment;
  isReply: boolean;
  onReply: (c: BoardComment) => void;
}) {
  const name = String(comment.author_name ?? '익명');
  const initial = name.charAt(0) || '?';
  const tone = pickAvatarTone(String(comment.author_id ?? name));
  const ts = formatShortDate(comment.created_at);
  const body = String(comment.content ?? '');
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        marginBottom: 12,
        paddingLeft: isReply ? 32 : 0,
        position: 'relative',
      }}
    >
      {isReply && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 12,
            top: 6,
            color: 'var(--z-400)',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          ↳
        </span>
      )}
      <MAvatar tone={tone} size="sm">{initial}</MAvatar>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <b style={{ fontSize: 12, fontWeight: 800 }}>{name}</b>
          <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>{ts}</span>
          {!isReply && (
            <button
              type="button"
              onClick={() => onReply(comment)}
              aria-label={`${name}에게 답글 작성`}
              style={{
                marginLeft: 'auto',
                fontSize: 11,
                color: 'var(--m-accent)',
                fontWeight: 700,
                padding: '2px 4px',
              }}
            >
              답글
            </button>
          )}
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--z-800)',
            marginTop: 3,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {body}
        </div>
      </div>
    </div>
  );
}

export default function BoardCommentTree({ comments, onReply }: BoardCommentTreeProps) {
  const tree = useMemo(() => buildTree(comments), [comments]);

  if (tree.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '20px 0',
          fontSize: 12,
          color: 'var(--z-500)',
          fontWeight: 600,
        }}
      >
        아직 댓글이 없습니다. 첫 댓글을 남겨보세요.
      </div>
    );
  }

  return (
    <>
      {tree.map((node) => (
        <div key={node.comment.id}>
          <CommentBody comment={node.comment} isReply={false} onReply={onReply} />
          {node.replies.map((r) => (
            <CommentBody key={r.id} comment={r} isReply onReply={onReply} />
          ))}
        </div>
      ))}
    </>
  );
}

export { buildTree as buildCommentTree };

'use client';

/**
 * 업무공유 상세 — 카드 본문 + 댓글 (board_post_comments).
 * 🔴 모바일에서 코멘트 작성·확인 표시 가능.
 * 핸드오프 m-screens-addon-details §AD7 (SShareDetail) 이식.
 * JM: ~250줄.
 * JM3: 댓글 작성 실패 시 입력 보존 + toast.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ErpUser } from '@/types';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { logger } from '@/lib/logger';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import { isImeComposing } from '../공통/useKeyboardLift';
import { pickText, pickTone } from './data-hooks';

type Comment = {
  id: string;
  author: string;
  author_id: string;
  body: string;
  created_at: string;
};

type Detail = {
  id: string;
  title: string;
  body: string;
  author: string;
  author_id: string;
  department: string;
  tag: string;
  urgent: boolean;
  created_at: string;
  attachments: { name: string; size: string; kind: string }[];
};

function MobileTaskShareDetail({
  user,
  postId,
  onBack }: {
  user: ErpUser;
  postId: string;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: post, error: postErr }, { data: comm }] = await Promise.all([
        db.from('board_posts').select('*').eq('id', postId).maybeSingle(),
        db
          .from('board_post_comments')
          .select('*')
          .eq('post_id', postId)
          .order('created_at', { ascending: true })
          .limit(100),
      ]);
      if (postErr) throw postErr;
      if (!post) {
        setDetail(null);
        return;
      }
      const row = post as Record<string, unknown>;
      const att = Array.isArray(row.attachments) ? (row.attachments as Record<string, unknown>[]) : [];
      setDetail({
        id: pickText(row, 'id'),
        title: pickText(row, 'title') || '(제목 없음)',
        body: pickText(row, 'content', 'body'),
        author: pickText(row, 'author_name') || '익명',
        author_id: pickText(row, 'author_id'),
        department: pickText(row, 'department', 'dept') || '전사',
        tag: pickText(row, 'tag', 'category') || '공유',
        urgent: Boolean(row.is_urgent),
        created_at: pickText(row, 'created_at'),
        attachments: att.map((a) => ({
          name: pickText(a, 'name', 'filename') || '첨부',
          size: pickText(a, 'size') || '',
          kind: pickText(a, 'kind', 'type') || 'file' })) });
      setComments(
        ((comm ?? []) as Record<string, unknown>[]).map((c) => ({
          id: pickText(c, 'id'),
          author: pickText(c, 'author_name') || '익명',
          author_id: pickText(c, 'author_id'),
          body: pickText(c, 'content', 'body'),
          created_at: pickText(c, 'created_at') })),
      );
    } catch (err) {
      logger.warn('[mobile-addon] share detail load', err);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitComment = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const { error } = await db.from('board_post_comments').insert([
        {
          post_id: postId,
          author_id: user.id,
          author_name: user.name,
          content: text },
      ]);
      if (error) throw error;
      setInput('');
      toast('댓글을 등록했습니다.', 'success');
      void load();
    } catch (err) {
      logger.warn('[mobile-addon] share comment send', err);
      toast('댓글 등록에 실패했습니다.', 'error');
    } finally {
      setSending(false);
    }
  };

  if (loading || !detail) {
    return (
      <div className="m-screen">
        <MobileHeader title="업무공유" back={onBack} />
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
          {loading ? '불러오는 중…' : '게시물을 찾을 수 없습니다.'}
        </div>
      </div>
    );
  }

  return (
    <div className="m-screen">
      <MobileHeader
        title="업무공유"
        sub={`${detail.tag} · ${detail.author}`}
        back={onBack}
      />

      <div className="m-scroll">
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <MChip tone={detail.tag.includes('인수') ? 'accent' : ''}>{detail.tag}</MChip>
            {detail.urgent && <MChip tone="danger">긴급</MChip>}
          </div>
          <h1 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.35 }}>
            {detail.title}
          </h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 14,
              paddingBottom: 14,
              borderBottom: '1px solid var(--m-border)' }}
          >
            <MAvatar tone={pickTone(detail.author_id || detail.id)} size="sm">
              {detail.author.charAt(0)}
            </MAvatar>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{detail.author}</div>
              <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 1 }}>
                {detail.department} · {detail.created_at.slice(0, 16).replace('T', ' ')}
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '16px 0',
              fontSize: 14,
              color: 'var(--z-800)',
              lineHeight: 1.75,
              fontWeight: 500,
              whiteSpace: 'pre-wrap' }}
          >
            {detail.body || '(본문 없음)'}
          </div>

          {detail.attachments.length > 0 && (
            <div className="m-card flush" style={{ marginBottom: 16 }}>
              {detail.attachments.map((a, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    borderBottom: i < detail.attachments.length - 1 ? '1px solid var(--m-border)' : 'none' }}
                >
                  <div className="ico-tile tone-accent">
                    <MIcon name="paperclip" size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis' }}
                    >
                      {a.name}
                    </div>
                    {a.size && (
                      <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 1 }}>{a.size}</div>
                    )}
                  </div>
                  <MIcon name="download" size={18} color="var(--z-500)" />
                </div>
              ))}
            </div>
          )}

          <div className="m-section-h" style={{ padding: '10px 0' }}>
            <div className="lbl">댓글 {comments.length}</div>
          </div>
          {comments.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <MAvatar tone={pickTone(c.author_id)} size="sm">
                {c.author.charAt(0)}
              </MAvatar>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <b style={{ fontSize: 12, fontWeight: 800 }}>{c.author}</b>
                  <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                    {c.created_at.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--z-800)',
                    marginTop: 3,
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap' }}
                >
                  {c.body}
                </div>
              </div>
            </div>
          ))}
          {comments.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
              아직 댓글이 없습니다.
            </div>
          )}
          <div style={{ height: 80 }} />
        </div>
      </div>

      <div className="m-sticky-foot">
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--m-bg)',
            borderRadius: 22,
            padding: '4px 6px 4px 12px' }}
        >
          <input
            placeholder="댓글 입력"
            aria-label="댓글 입력"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                if (isImeComposing(e)) return;
                e.preventDefault();
                void submitComment();
              }
            }}
            disabled={sending}
            style={{
              flex: 1,
              padding: '8px 0',
              fontSize: 14,
              fontFamily: 'inherit',
              background: 'transparent',
              border: 0,
              outline: 'none' }}
          />
          <button
            type="button"
            onClick={() => void submitComment()}
            aria-label="등록"
            disabled={sending || !input.trim()}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--m-accent)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              border: 0,
              opacity: input.trim() ? 1 : 0.4 }}
          >
            <MIcon name="send" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default MobileTaskShareDetail;

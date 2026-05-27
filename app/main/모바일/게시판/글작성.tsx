'use client';

/**
 * SFormPost — 새 글 작성.
 *   - FormHeader (취소·제목·게시 버튼)
 *   - 카테고리 segment / 제목 / 본문
 *   - 첨부 (R2 업로드 활성화) — 파일 picker → spinner → 카드 리스트(제거 X)
 *   - 옵션: 상단 고정 / 중요도
 * JM(~430줄), JM3(toast·낙관적 롤백), JM4(union 타입), JM5(file size/type 검증), JM6(label·button·aria-pressed)
 */

import { useRef, useState } from 'react';
import MIcon from '../공통/MIcon';
import MBtn from '../공통/MBtn';
import { BOARD_CATS, type BoardCatId, createBoardPost } from './data-hooks';
import { uploadBoardAttachments, type DraftAttachment, type UploadProgress } from './첨부업로드';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import { toast } from '@/lib/toast';
import { PostOptions } from './글작성옵션';

export type SFormPostProps = {
  user: {
    id?: string | null;
    name?: string | null;
    company?: string | null;
    company_id?: string | null;
  } | null;
  /** 관리자/시스템 마스터 여부 — 상단고정/예약 발행 옵션 노출 */
  canAdmin?: boolean;
  initialCat?: BoardCatId;
  onCancel: () => void;
  onCreated: (postId: string) => void;
};

const PICKABLE_CATS = BOARD_CATS.filter((c) => c.id !== 'all');
// 익명 작성을 허용하는 board (PC와 동일 — 자유게시판만)
const ANONYMOUS_ALLOWED_CATS = new Set<BoardCatId>(['free']);

type Form = {
  cat: BoardCatId;
  title: string;
  body: string;
  pin: boolean;
  importance: 'normal' | 'urgent';
  anonymous: boolean;
  scheduledPublishAt: string; // datetime-local 값 ('YYYY-MM-DDTHH:mm') — 빈 문자열은 즉시 발행
};

function fileLabel(att: DraftAttachment): string {
  if (!att.size || att.size <= 0) return '';
  if (att.size > 1024 * 1024) return `${(att.size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(att.size / 1024))}KB`;
}

export default function SFormPost({ user, canAdmin = false, initialCat, onCancel, onCreated }: SFormPostProps) {
  const defaultCat: BoardCatId = initialCat && initialCat !== 'all' ? initialCat : 'notice';
  const [form, setForm] = useState<Form>({
    cat: defaultCat,
    title: '',
    body: '',
    pin: false,
    importance: 'normal',
    anonymous: false,
    scheduledPublishAt: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const canSubmit = form.title.trim().length > 0 && !submitting && !uploading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!user?.id) {
      toast('로그인한 후 글을 등록할 수 있습니다.', 'error');
      return;
    }
    setSubmitting(true);

    const anonymousFinal = ANONYMOUS_ALLOWED_CATS.has(form.cat) && form.anonymous;
    const pinFinal = canAdmin && form.pin;
    const scheduledFinal = canAdmin ? form.scheduledPublishAt : '';
    const cat = BOARD_CATS.find((c) => c.id === form.cat);
    const boardType = cat?.boardType ?? '자유게시판';

    // 첨부 없는 텍스트 게시만 오프라인 큐 대상.
    // 첨부 있는 경우 네트워크(R2 업로드) 필수이므로 헬퍼 경로 유지.
    if (attachments.length === 0) {
      const importance = form.importance === 'urgent' ? '중요' : null;
      const payload: Record<string, unknown> = {
        board_type: boardType,
        title: form.title.trim(),
        content: form.body.trim(),
        author_id: anonymousFinal ? null : user.id,
        author_name: anonymousFinal ? '익명' : (user.name ?? '익명'),
        company: anonymousFinal ? null : (user.company ?? null),
        company_id: anonymousFinal ? null : (user.company_id ?? null),
        is_anonymous: anonymousFinal,
      };
      if (pinFinal) payload.is_pinned = true;
      if (importance) payload.status = importance;
      if (scheduledFinal) {
        const d = new Date(scheduledFinal);
        if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) {
          payload.scheduled_publish_at = d.toISOString();
        }
      }

      const { data, queued, error } = await enqueueSupabaseMutation<{ id: string }>({
        kind: 'insert',
        table: 'board_posts',
        payload,
      });
      setSubmitting(false);
      if (error) {
        toast(`등록 실패: ${error}`, 'error');
        return;
      }
      if (queued) {
        toast('오프라인 — 게시 대기 중', 'info');
        onCreated('queued');
        return;
      }
      if (data) {
        const row = Array.isArray(data) ? (data as { id: string }[])[0] : (data as { id: string });
        onCreated(String(row?.id ?? ''));
      }
      return;
    }

    // 첨부 있는 경우 — 기존 헬퍼 경로 (네트워크 필수)
    const inserted = await createBoardPost({
      catId: form.cat,
      title: form.title,
      content: form.body,
      attachments: attachments.map((a) => ({
        name: a.name,
        url: a.url,
        type: a.type,
        size: a.size,
      })),
      anonymous: anonymousFinal,
      pinned: pinFinal,
      importance: form.importance,
      scheduledPublishAt: scheduledFinal,
      user,
    });
    setSubmitting(false);
    if (inserted) {
      onCreated(String(inserted.id));
    }
  };

  const handlePickFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // 같은 파일 재선택 허용
    if (files.length === 0) return;
    const cat = BOARD_CATS.find((c) => c.id === form.cat);
    const boardType = cat?.boardType ?? '자유게시판';
    setUploading(true);
    setUploadProgress({ fileName: files[0].name, total: files.length, done: 0 });
    const uploaded = await uploadBoardAttachments(files, boardType, (p) => setUploadProgress(p));
    setAttachments((prev) => [...prev, ...uploaded]);
    setUploading(false);
    setUploadProgress(null);
  };

  const removeAttachment = (url: string) => {
    setAttachments((prev) => prev.filter((a) => a.url !== url));
  };

  return (
    <div className="m-screen">
      {/* FormHeader */}
      <div
        className="m-header"
        style={{ justifyContent: 'space-between' }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="취소"
          style={{ fontSize: 14, fontWeight: 700, color: 'var(--z-700)', padding: '6px 4px' }}
        >
          취소
        </button>
        <div className="title" style={{ flex: 'unset', textAlign: 'center' }}>
          새 글 작성
        </div>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          aria-label="게시"
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: canSubmit ? 'var(--m-accent)' : 'var(--z-400)',
            padding: '6px 4px',
            opacity: submitting ? 0.5 : 1,
          }}
        >
          {submitting ? '게시중…' : '게시'}
        </button>
      </div>

      <div className="m-scroll">
        {/* 카테고리 + 제목 + 본문 */}
        <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
          {/* 카테고리 */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--m-border)' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: 'var(--z-500)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              카테고리
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PICKABLE_CATS.map((c) => {
                const on = form.cat === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => set('cat', c.id)}
                    aria-pressed={on}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      background: on ? 'var(--m-accent)' : 'var(--m-bg)',
                      color: on ? '#fff' : 'var(--z-700)',
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 제목 */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--m-border)' }}>
            <label
              htmlFor="board-title-input"
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 800,
                color: 'var(--z-500)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              제목
            </label>
            <input
              id="board-title-input"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="제목을 입력하세요"
              autoFocus
              style={{
                width: '100%',
                padding: '6px 0',
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--z-900)',
              }}
            />
          </div>

          {/* 본문 */}
          <div style={{ padding: '14px 16px 0' }}>
            <label htmlFor="board-body-input" style={{ position: 'absolute', left: -9999 }}>
              본문
            </label>
            <textarea
              id="board-body-input"
              rows={10}
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
              placeholder="본문을 입력하세요"
              style={{
                width: '100%',
                padding: '4px 0 16px',
                fontSize: 14,
                fontFamily: 'inherit',
                resize: 'none',
                color: 'var(--z-900)',
                lineHeight: 1.7,
                minHeight: 200,
              }}
            />
          </div>
        </div>

        {/* 첨부 섹션 */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">첨부</div></div>
          <div className="m-card flush">
            <button
              type="button"
              onClick={handlePickFiles}
              disabled={uploading}
              aria-label="첨부 파일 추가"
              className="m-list-row"
              style={{ width: '100%', textAlign: 'left', opacity: uploading ? 0.6 : 1 }}
            >
              <div className="ico-tile tone-accent">
                <MIcon name="paperclip" size={18} />
              </div>
              <div>
                <div className="lbl">파일 추가</div>
                <div className="sub">
                  {uploading && uploadProgress
                    ? `업로드 중… ${uploadProgress.done}/${uploadProgress.total} (${uploadProgress.fileName})`
                    : '사진·동영상·문서 (이미지 25MB / 동영상 200MB / 일반 50MB)'}
                </div>
              </div>
              {uploading ? (
                <div
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    border: '2px solid var(--m-border)',
                    borderTopColor: 'var(--m-accent)',
                    borderRadius: '50%',
                    animation: 'm-spin 0.8s linear infinite',
                  }}
                />
              ) : (
                <MIcon name="plus" size={18} color="var(--z-400)" />
              )}
            </button>
            {attachments.map((att) => {
              const isImg = String(att.type ?? '').toLowerCase() === 'image';
              return (
                <div key={att.url} className="m-list-row">
                  <div
                    className={isImg ? 'ico-tile tone-accent' : 'ico-tile tone-success'}
                    aria-hidden
                  >
                    <MIcon name={isImg ? 'image' : 'fileText'} size={18} />
                  </div>
                  <div>
                    <div
                      className="lbl"
                      style={{
                        maxWidth: 200,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {att.name}
                    </div>
                    <div className="sub">{fileLabel(att) || (isImg ? '이미지' : '파일')}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.url)}
                    aria-label={`${att.name} 제거`}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background: 'var(--m-bg)',
                      color: 'var(--z-500)',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <MIcon name="x" size={14} />
                  </button>
                </div>
              );
            })}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => void handleFileChange(e)}
            style={{ display: 'none' }}
            aria-hidden
          />
        </div>

        {/* 옵션 섹션 */}
        <PostOptions
          cat={form.cat}
          canAdmin={canAdmin}
          pin={form.pin}
          importance={form.importance}
          anonymous={form.anonymous}
          scheduledPublishAt={form.scheduledPublishAt}
          onTogglePin={() => set('pin', !form.pin)}
          onImportance={(v) => set('importance', v)}
          onAnonymous={(v) => set('anonymous', v)}
          onScheduled={(v) => set('scheduledPublishAt', v)}
        />

        <div style={{ padding: '16px' }}>
          <MBtn variant="primary" block lg onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {submitting ? '게시 중…' : '게시'}
          </MBtn>
        </div>
        <div style={{ height: 24 }} />
      </div>

      <style jsx>{`
        @keyframes m-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// PostOptions는 글작성옵션.tsx로 분리됨 (JM 500줄 이내 유지)

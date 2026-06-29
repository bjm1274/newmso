'use client';

/**
 * SFormPost — 새 글 작성 / 수정(edit).
 *   - FormHeader (취소·제목·게시/수정 버튼)
 *   - 카테고리 segment / 제목 / 본문
 *   - 첨부 (R2 업로드 활성화)
 *   - 일정(op/mri): 일정입력.tsx (날짜·시간·환자·차트·체크 + 부위 선택)
 *   - 옵션: 고정/중요도/익명/예약 + 투표·설문(상품 추첨)
 *   - editPost 전달 시 EDIT 모드 — prefill 후 updateBoardPost 호출
 * 미러: board_posts(create/update), poll JSONB, schedule_* / patient_name / content(차트번호)
 * JM(~500줄), JM3(toast), JM4(union·any 금지), JM5(file 검증), JM6(label·button·aria)
 */

import { useMemo, useRef, useState } from 'react';
import MIcon from '../공통/MIcon';
import MBtn from '../공통/MBtn';
import {
  BOARD_CATS,
  type BoardCatId,
  type BoardListPost,
  boardTypeToCat,
  createBoardPost,
  getSafeAttachments,
  isVoiceBoardType,
  updateBoardPost,
} from './data-hooks';
import { uploadBoardAttachments, type DraftAttachment, type UploadProgress, validateFile } from './첨부업로드';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import { enqueueUpload } from '@/lib/offline-upload-queue';
import { extractAttachmentMetaFromContent } from '@/app/main/기능부품/게시판공통';
import { toast } from '@/lib/toast';
import { PostOptions, type PollDraft } from './글작성옵션';
import ScheduleForm, { toScheduleMetaInput, type ScheduleDraft } from './일정입력';
import { pollDraftFromPost, pollDraftToInput, scheduleDraftFromPost } from './글작성변환';

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
  /** 전달 시 EDIT 모드 (prefill + updateBoardPost) */
  editPost?: BoardListPost | null;
  onCancel: () => void;
  onCreated: (postId: string) => void;
};

const PICKABLE_CATS = BOARD_CATS.filter((c) => c.id !== 'all');
// 익명 작성을 허용하는 board (PC와 동일 — 자유게시판만; 익명소리함은 강제 익명)
const ANONYMOUS_ALLOWED_CATS = new Set<BoardCatId>(['free']);

type Form = {
  cat: BoardCatId;
  title: string;
  body: string;
  pin: boolean;
  importance: 'normal' | 'urgent';
  anonymous: boolean;
  scheduledPublishAt: string; // datetime-local 값 — 빈 문자열은 즉시 발행
};

function fileLabel(att: DraftAttachment): string {
  if (!att.size || att.size <= 0) return '';
  if (att.size > 1024 * 1024) return `${(att.size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(att.size / 1024))}KB`;
}

export default function SFormPost({ user, canAdmin = false, initialCat, editPost = null, onCancel, onCreated }: SFormPostProps) {
  const isEdit = Boolean(editPost);
  const editCat: BoardCatId | null = editPost ? boardTypeToCat(editPost.board_type as string | null) : null;
  const defaultCat: BoardCatId = editCat ?? (initialCat && initialCat !== 'all' ? initialCat : 'notice');

  const editSchedule = useMemo(() => scheduleDraftFromPost(editPost), [editPost]);

  const [form, setForm] = useState<Form>(() => ({
    cat: defaultCat,
    title: isEdit ? editSchedule.titleNoPrefix : '',
    body: isEdit
      ? extractAttachmentMetaFromContent(String(editPost?.content ?? '')).displayContent
      : '',
    pin: Boolean(editPost?.is_pinned),
    importance: editPost?.status === '중요' ? 'urgent' : 'normal',
    anonymous: Boolean((editPost as { is_anonymous?: boolean } | null)?.is_anonymous),
    scheduledPublishAt: '',
  }));
  const [poll, setPoll] = useState<PollDraft>(() => pollDraftFromPost(editPost));
  const [schedule, setSchedule] = useState<ScheduleDraft>(() => editSchedule.draft);
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<DraftAttachment[]>(() =>
    isEdit
      ? getSafeAttachments(editPost).map((a) => ({ name: a.name, url: a.url, type: a.kind === 'image' ? 'image' : 'file', size: a.size }))
      : [],
  );
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const isScheduleCat = form.cat === 'op' || form.cat === 'mri';
  const isVoiceCat = isVoiceBoardType(BOARD_CATS.find((c) => c.id === form.cat)?.boardType);
  // 일정 게시판은 환자명/날짜로도 게시 가능하므로 제목 없이도 통과 (PC와 동일 유연성)
  const canSubmit = (form.title.trim().length > 0 || (isScheduleCat && schedule.patientName.trim().length > 0)) && !submitting && !uploading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!user?.id) { toast('로그인한 후 글을 등록할 수 있습니다.', 'error'); return; }
    setSubmitting(true);

    const anonymousFinal = isVoiceCat || (ANONYMOUS_ALLOWED_CATS.has(form.cat) && form.anonymous);
    const pinFinal = canAdmin && form.pin;
    const scheduledFinal = canAdmin && !isEdit ? form.scheduledPublishAt : '';
    const pollInput = pollDraftToInput(poll);
    const attachmentItems = attachments
      .filter((a) => !a.url.startsWith('queued:'))
      .map((a) => ({ name: a.name, url: a.url, type: a.type, size: a.size }));

    // ── EDIT 모드 — updateBoardPost (제목/본문/첨부/투표) ─────────────
    if (isEdit && editPost) {
      const ok = await updateBoardPost({
        postId: String(editPost.id),
        title: isScheduleCat
          ? `${schedule.side === '좌' ? '좌측 ' : schedule.side === '우' ? '우측 ' : ''}${form.title.trim()}`
          : form.title,
        content: isScheduleCat ? schedule.chartNo : form.body,
        attachments: attachmentItems,
        // 투표 토글 OFF → null(제거), ON+유효 → 입력값
        poll: poll.enabled ? pollInput : null,
      });
      setSubmitting(false);
      if (ok) {
        toast('게시글이 수정되었습니다.', 'success');
        onCreated(String(editPost.id));
      }
      return;
    }

    // ── 일정/투표 포함 작성 — createBoardPost(전체 payload) ───────────
    if (isScheduleCat || pollInput) {
      const inserted = await createBoardPost({
        catId: form.cat,
        title: form.title,
        content: form.body,
        attachments: attachmentItems,
        anonymous: anonymousFinal,
        pinned: pinFinal,
        importance: form.importance,
        scheduledPublishAt: scheduledFinal,
        poll: pollInput,
        schedule: isScheduleCat ? toScheduleMetaInput(schedule) : null,
        user,
      });
      setSubmitting(false);
      if (inserted) onCreated(String(inserted.id));
      return;
    }

    const cat = BOARD_CATS.find((c) => c.id === form.cat);
    const boardType = cat?.boardType ?? '자유게시판';
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const hasPendingAtts = attachments.some((a) => a.url.startsWith('queued:'));

    // 온라인 + 첨부 모두 완료 — 기존 헬퍼 경로
    if (!isOffline && attachments.length > 0 && !hasPendingAtts) {
      const inserted = await createBoardPost({
        catId: form.cat, title: form.title, content: form.body,
        attachments: attachmentItems,
        anonymous: anonymousFinal, pinned: pinFinal, importance: form.importance,
        scheduledPublishAt: scheduledFinal, user,
      });
      setSubmitting(false);
      if (inserted) onCreated(String(inserted.id));
      return;
    }

    // 나머지 경로 — enqueueSupabaseMutation (텍스트 전용 or 오프라인 첨부 포함)
    const importance = form.importance === 'urgent' ? '중요' : null;
    const payload: Record<string, unknown> = {
      board_type: boardType,
      title: form.title.trim(), content: form.body.trim(),
      author_id: anonymousFinal ? null : user.id,
      author_name: anonymousFinal ? '익명' : (user.name ?? '익명'),
      company: anonymousFinal ? null : (user.company ?? null),
      company_id: anonymousFinal ? null : (user.company_id ?? null),
      is_anonymous: anonymousFinal,
      attachments: attachmentItems,
    };
    if (pinFinal) payload.is_pinned = true;
    if (importance) payload.status = importance;
    if (!hasPendingAtts && scheduledFinal) {
      const d = new Date(scheduledFinal);
      if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) {
        payload.scheduled_publish_at = d.toISOString();
      }
    }

    const { data, queued, error } = await enqueueSupabaseMutation<{ id: string }>({
      kind: 'insert', table: 'board_posts', payload,
    });
    setSubmitting(false);
    if (error) { toast(`등록 실패: ${error}`, 'error'); return; }
    if (queued) {
      const msg = hasPendingAtts
        ? '오프라인 — 게시 + 첨부 업로드 대기 중. 온라인 복귀 시 자동 처리됩니다.'
        : '오프라인 — 게시 대기 중';
      toast(msg, 'info');
      onCreated('queued');
      return;
    }
    if (data) {
      const row = Array.isArray(data) ? (data as { id: string }[])[0] : (data as { id: string });
      onCreated(String(row?.id ?? ''));
    }
  };

  const handlePickFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // 같은 파일 재선택 허용
    if (files.length === 0) return;
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const cat = BOARD_CATS.find((c) => c.id === form.cat);
    const boardType = cat?.boardType ?? '자유게시판';

    if (isOffline) {
      const pending: DraftAttachment[] = [];
      for (const file of files) {
        const validationError = validateFile(file);
        if (validationError) {
          toast(`${file.name}: ${validationError}`, 'error');
          continue;
        }
        const result = await enqueueUpload({
          file,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          planRequester: 'board',
          planParams: { boardType },
        });
        if (result.queued) {
          pending.push({ name: file.name, url: `queued:${file.name}`, type: 'file', size: file.size });
        } else if (result.error) {
          toast(`${file.name}: ${result.error}`, 'error');
        }
      }
      if (pending.length > 0) {
        setAttachments((prev) => [...prev, ...pending]);
        toast('오프라인 — 첨부 업로드 대기 중. 온라인 복귀 시 자동 처리됩니다.', 'info');
      }
      return;
    }

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
    <div
      className="m-screen"
      style={{
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* FormHeader */}
      <div
        className="macos-glass"
        style={{
          padding: '16px 20px 12px',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          background: 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="취소"
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: 'var(--z-700)',
            background: 'rgba(0, 0, 0, 0.03)',
            border: '1px solid rgba(0, 0, 0, 0.05)',
            padding: '5px 12px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          취소
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 14.5, fontWeight: 900, color: 'var(--foreground)', letterSpacing: '-0.015em' }}>
          {isEdit ? '게시글 수정' : '새 글 작성'}
        </div>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          aria-label={isEdit ? '수정' : '게시'}
          style={{
            fontSize: 13,
            fontWeight: 800,
            background: canSubmit ? '#007AFF' : 'rgba(0, 0, 0, 0.04)',
            color: canSubmit ? '#fff' : 'var(--z-400)',
            border: 'none',
            padding: '5px 12px',
            borderRadius: 8,
            cursor: 'pointer',
            opacity: submitting ? 0.5 : 1,
            boxShadow: canSubmit ? '0 2px 8px rgba(0, 122, 255, 0.2)' : 'none',
          }}
        >
          {submitting ? '저장중…' : isEdit ? '수정' : '게시'}
        </button>
      </div>

      <div className="m-scroll" style={{ background: 'transparent' }}>
        {/* 카테고리 + 제목 + 본문 */}
        <div
          className="macos-glass macos-squircle-sm"
          style={{
            margin: '16px',
            background: 'rgba(255, 255, 255, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.35)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)',
            overflow: 'hidden',
          }}
        >
          {/* 카테고리 — EDIT 모드는 게시판 이동 금지(고정 표시) */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0, 0, 0, 0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
              카테고리
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PICKABLE_CATS.map((c) => {
                const on = form.cat === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { if (!isEdit) set('cat', c.id); }}
                    aria-pressed={on}
                    disabled={isEdit && !on}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 800,
                      background: on ? '#007AFF' : 'rgba(0, 0, 0, 0.04)',
                      color: on ? '#fff' : 'var(--z-700)',
                      opacity: isEdit && !on ? 0.4 : 1,
                      border: 'none',
                      cursor: isEdit && !on ? 'not-allowed' : 'pointer',
                      boxShadow: on ? '0 2px 8px rgba(0, 122, 255, 0.2)' : 'none',
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 제목 */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0, 0, 0, 0.06)' }}>
            <label
              htmlFor="board-title-input"
              style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--z-500)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}
            >
              {isScheduleCat ? '수술/검사명' : '제목'}
            </label>
            <input
              id="board-title-input"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder={isScheduleCat ? '예: 슬관절 내시경 / 요추 MRI' : '제목을 입력하세요'}
              autoFocus
              style={{ width: '100%', padding: '6px 0', fontSize: 15.5, fontWeight: 800, color: 'var(--z-900)', background: 'transparent', border: 'none', outline: 'none' }}
            />
          </div>

          {/* 본문 — 일정 게시판은 차트번호를 일정입력에서 받으므로 숨김 */}
          {!isScheduleCat && (
            <div style={{ padding: '14px 16px 6px' }}>
              <label htmlFor="board-body-input" style={{ position: 'absolute', left: -9999 }}>본문</label>
              <textarea
                id="board-body-input"
                rows={10}
                value={form.body}
                onChange={(e) => set('body', e.target.value)}
                placeholder="본문을 입력하세요"
                style={{ width: '100%', padding: '4px 0 16px', fontSize: 14, fontFamily: 'inherit', resize: 'none', color: 'var(--z-900)', lineHeight: 1.7, minHeight: 200, background: 'transparent', border: 'none', outline: 'none' }}
              />
            </div>
          )}
        </div>

        {/* 일정 입력 — op/mri */}
        {isScheduleCat && (
          <ScheduleForm
            isMri={form.cat === 'mri'}
            draft={schedule}
            onChange={setSchedule}
            onPickBodyPart={(label) => set('title', form.title.trim() ? form.title : label)}
          />
        )}

        {/* 첨부 섹션 — 일정 게시판 제외 */}
        {!isScheduleCat && (
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
                <div className="ico-tile tone-accent"><MIcon name="paperclip" size={18} /></div>
                <div>
                  <div className="lbl">파일 추가</div>
                  <div className="sub">
                    {uploading && uploadProgress
                      ? `업로드 중… ${uploadProgress.done}/${uploadProgress.total} (${uploadProgress.fileName})`
                      : '사진·동영상·문서 (이미지 200MB / 동영상 200MB / 일반 200MB)'}
                  </div>
                </div>
                {uploading ? (
                  <div aria-hidden style={{ width: 18, height: 18, border: '2px solid var(--m-border)', borderTopColor: 'var(--m-accent)', borderRadius: '50%', animation: 'm-spin 0.8s linear infinite' }} />
                ) : (
                  <MIcon name="plus" size={18} color="var(--z-400)" />
                )}
              </button>
              {attachments.map((att) => {
                const isImg = String(att.type ?? '').toLowerCase() === 'image';
                return (
                  <div key={att.url} className="m-list-row">
                    <div className={isImg ? 'ico-tile tone-accent' : 'ico-tile tone-success'} aria-hidden>
                      <MIcon name={isImg ? 'image' : 'fileText'} size={18} />
                    </div>
                    <div>
                      <div className="lbl" style={{ maxWidth: 200, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {att.name}
                      </div>
                      <div className="sub">{fileLabel(att) || (isImg ? '이미지' : '파일')}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.url)}
                      aria-label={`${att.name} 제거`}
                      style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--m-bg)', color: 'var(--z-500)', display: 'grid', placeItems: 'center' }}
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
        )}

        {/* 옵션 섹션 (투표·설문 포함) */}
        <PostOptions
          cat={form.cat}
          canAdmin={canAdmin}
          pin={form.pin}
          importance={form.importance}
          anonymous={form.anonymous}
          scheduledPublishAt={form.scheduledPublishAt}
          poll={poll}
          onTogglePin={() => set('pin', !form.pin)}
          onImportance={(v) => set('importance', v)}
          onAnonymous={(v) => set('anonymous', v)}
          onScheduled={(v) => set('scheduledPublishAt', v)}
          onPoll={setPoll}
        />

        <div style={{ padding: '16px' }}>
          <MBtn variant="primary" block lg onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {submitting ? '저장 중…' : isEdit ? '수정 저장' : '게시'}
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

// PostOptions는 글작성옵션.tsx, 일정입력은 일정입력.tsx로 분리 (JM 500줄 이내 유지)

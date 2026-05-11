'use client';

/**
 * CreateSheet.tsx — 등록 폼 (모바일: 바텀시트 / PC: 모달)
 *
 * JM:  500줄 이내, 등록 UI 단일 책임
 * JM4: FormState 타입, any 없음
 * JM6: dialog aria-modal, form 라벨 연결, Escape 닫기
 */

import { useState, useEffect, useRef, type FormEvent } from 'react';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface FormState {
  company: string;
  team: string;
  category: string;
  title: string;
  content: string;
}

const INITIAL_FORM: FormState = {
  company:  'SY INC. (본사)',
  team:     '간호팀',
  category: '공지',
  title:    '',
  content:  '',
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface CreateSheetProps {
  open: boolean;
  onClose: () => void;
  isMobile: boolean;
}

// ── 폼 필드 ───────────────────────────────────────────────────────────────────

function FormFields({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (field: keyof FormState, value: string) => void;
}) {
  const inputCls =
    'w-full border border-[var(--border)] rounded-[var(--radius-md)] text-[13px] px-2.5 py-2 bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--toss-gray-3)]';

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cs-company" className="text-[12px] font-semibold text-[var(--toss-gray-5)]">회사</label>
        <select
          id="cs-company"
          value={form.company}
          onChange={(e) => onChange('company', e.target.value)}
          className={inputCls}
        >
          <option>SY INC. (본사)</option>
          <option>산하 병원 A</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="cs-team" className="text-[12px] font-semibold text-[var(--toss-gray-5)]">팀</label>
        <select
          id="cs-team"
          value={form.team}
          onChange={(e) => onChange('team', e.target.value)}
          className={inputCls}
        >
          <option>간호팀</option>
          <option>행정팀</option>
          <option>원무팀</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="cs-category" className="text-[12px] font-semibold text-[var(--toss-gray-5)]">분류</label>
        <select
          id="cs-category"
          value={form.category}
          onChange={(e) => onChange('category', e.target.value)}
          className={inputCls}
        >
          <option>공지</option>
          <option>매뉴얼</option>
          <option>양식</option>
          <option>교육</option>
          <option>안내</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="cs-title" className="text-[12px] font-semibold text-[var(--toss-gray-5)]">
          제목 <span className="text-[var(--danger)]" aria-label="필수">*</span>
        </label>
        <input
          id="cs-title"
          type="text"
          required
          placeholder="제목을 입력하세요"
          value={form.title}
          onChange={(e) => onChange('title', e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="cs-content" className="text-[12px] font-semibold text-[var(--toss-gray-5)]">내용</label>
        <textarea
          id="cs-content"
          placeholder="내용을 입력하세요"
          value={form.content}
          onChange={(e) => onChange('content', e.target.value)}
          rows={4}
          className={`${inputCls} resize-y min-h-[90px]`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="cs-file" className="text-[12px] font-semibold text-[var(--toss-gray-5)]">첨부 파일</label>
        <input id="cs-file" type="file" multiple className="text-[13px] text-[var(--foreground)]" />
      </div>
    </>
  );
}

// ── 공통 훅 ───────────────────────────────────────────────────────────────────

function useCreateForm(onClose: () => void) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    // 실제 등록 로직 자리 (더미)
    setForm(INITIAL_FORM);
    onClose();
  }

  return { form, handleChange, handleSubmit };
}

// ── PC 모달 ───────────────────────────────────────────────────────────────────

function PCModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { form, handleChange, handleSubmit } = useCreateForm(onClose);
  const firstInputRef = useRef<HTMLSelectElement>(null);

  // Escape 닫기 + 포커스 트랩 진입
  useEffect(() => {
    if (!open) return;
    firstInputRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="bg-[var(--card)] rounded-[var(--radius-xl)] shadow-[var(--shadow-md)] w-[520px] max-w-[90vw] max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <span id="modal-title" className="text-[15px] font-bold text-[var(--foreground)]">새 자료 등록</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)] transition-colors"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 바디 */}
        <form id="create-form-pc" onSubmit={handleSubmit} className="overflow-y-auto px-5 py-4 flex flex-col gap-3.5">
          {/* ref for focus */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cs-company" className="text-[12px] font-semibold text-[var(--toss-gray-5)]">회사</label>
            <select
              id="cs-company"
              ref={firstInputRef}
              value={form.company}
              onChange={(e) => handleChange('company', e.target.value)}
              className="w-full border border-[var(--border)] rounded-[var(--radius-md)] text-[13px] px-2.5 py-2 bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            >
              <option>SY INC. (본사)</option>
              <option>산하 병원 A</option>
            </select>
          </div>
          <FormFields form={form} onChange={handleChange} />
        </form>

        {/* 푸터 */}
        <div className="flex gap-2 justify-end px-5 py-3.5 border-t border-[var(--border)] shrink-0">
          <button type="button" onClick={onClose} className="h-8 px-4 text-[13px] font-medium border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--toss-gray-5)] hover:bg-[var(--muted)] transition-colors">
            취소
          </button>
          <button type="submit" form="create-form-pc" className="h-8 px-4 text-[13px] font-medium bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-hover)] transition-colors">
            등록
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 모바일 바텀시트 ───────────────────────────────────────────────────────────

function MobileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { form, handleChange, handleSubmit } = useCreateForm(onClose);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* 백드롭 */}
      <div
        className="fixed inset-0 z-[900] transition-opacity duration-200"
        style={{
          background: 'rgba(0,0,0,0.4)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 시트 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="fixed left-0 right-0 bottom-0 z-[1000] bg-[var(--card)] flex flex-col overflow-hidden"
        style={{
          borderRadius: '16px 16px 0 0',
          maxHeight: '88vh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 220ms ease',
        }}
      >
        {/* 핸들 */}
        <div className="w-10 h-1 bg-[var(--border)] rounded-full mx-auto mt-2.5 mb-1 shrink-0" aria-hidden="true" />

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 pb-3 pt-1 border-b border-[var(--border)] shrink-0">
          <span id="sheet-title" className="text-[15px] font-bold text-[var(--foreground)]">새 자료 등록</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)] transition-colors"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 바디 */}
        <form id="create-form-mobile" onSubmit={handleSubmit} className="overflow-y-auto px-4 py-4 flex flex-col gap-3.5">
          <FormFields form={form} onChange={handleChange} />
        </form>

        {/* 푸터 */}
        <div className="px-4 py-3 border-t border-[var(--border)] shrink-0" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
          <button
            type="submit"
            form="create-form-mobile"
            className="w-full h-12 text-[15px] font-bold bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-hover)] transition-colors"
          >
            등록하기
          </button>
        </div>
      </div>
    </>
  );
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

export function CreateSheet({ open, onClose, isMobile }: CreateSheetProps) {
  return isMobile
    ? <MobileSheet open={open} onClose={onClose} />
    : <PCModal open={open} onClose={onClose} />;
}

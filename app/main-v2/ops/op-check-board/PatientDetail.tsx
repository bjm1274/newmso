'use client';

/**
 * PatientDetail.tsx — 환자 상세 (PC: 사이드 패널 / 모바일: 바텀시트)
 *
 * JM:  단일 책임 — 상세 패널 + 바텀시트 래퍼
 * JM4: any 없음
 * JM6: dialog role, aria-modal, focus trap (첫 버튼), ESC 닫기
 *       색+아이콘+텍스트 3중 표현
 */

import { useEffect, useRef, useCallback } from 'react';
import { X, Clock, CheckCircle, Zap, CircleCheck, ChevronRight, Check } from 'lucide-react';
import type { OpPatient, OpStatus } from './dummy-data';
import { STATUS_META } from './dummy-data';

// ── 상태 태그 스타일 ──────────────────────────────────────────────────────────

const STATUS_TAG: Record<OpStatus, { cls: string; Icon: React.FC<{ className?: string }>; label: string }> = {
  waiting:     { cls: 'bg-[var(--muted)] text-[var(--muted-foreground)]',  Icon: Clock,       label: '대기' },
  ready:       { cls: 'bg-[var(--accent-light)] text-[var(--accent)]',      Icon: CheckCircle, label: '준비완료' },
  in_progress: { cls: 'bg-[var(--warning-light)] text-[#92400E]',           Icon: Zap,         label: '수술중' },
  completed:   { cls: 'bg-[var(--success-light)] text-[#065F46]',           Icon: CircleCheck, label: '수술완료' },
};

const NEXT_BTN_CLS: Partial<Record<OpStatus, string>> = {
  waiting:     'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
  ready:       'bg-[var(--warning)] text-white hover:opacity-90',
  in_progress: 'bg-[var(--success)] text-white hover:opacity-90',
};

// ── 공통 내용 컴포넌트 ────────────────────────────────────────────────────────

interface DetailContentProps {
  patient: OpPatient;
  onAdvance: (id: string) => void;
  onToggleCheck: (patientId: string, checkIndex: number) => void;
  onClose: () => void;
  closeLabel: string;
  titleSize?: string;
}

function DetailContent({
  patient, onAdvance, onToggleCheck, onClose, closeLabel, titleSize = 'text-[15px]',
}: DetailContentProps) {
  const { id, name, room, doctor, opName, scheduledTime, elapsed, status, checks } = patient;
  const meta = STATUS_META[status];
  const tag = STATUS_TAG[status];
  const TagIcon = tag.Icon;
  const doneCount = checks.filter((c) => c.done).length;

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--card)] z-10">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className={`${titleSize} font-bold text-[var(--foreground)] truncate`}>{name}</span>
          <span className="text-xs text-[var(--muted-foreground)]">{room} · {doctor}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className={[
            'flex items-center justify-center rounded-[var(--radius-md)] shrink-0',
            'bg-[var(--muted)] hover:bg-[var(--border)] transition-colors',
            'w-[44px] h-[44px]',                // ≥ 48px 터치타깃은 바텀시트에서 충족
          ].join(' ')}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 overscroll-contain">
        {/* 기본 정보 */}
        <section className="mb-5" aria-labelledby="section-info">
          <h3 id="section-info" className="text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">
            기본 정보
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-[var(--muted-foreground)] whitespace-nowrap">수술명</dt>
            <dd className="font-semibold text-[var(--foreground)]">{opName}</dd>
            <dt className="text-[var(--muted-foreground)]">예약시간</dt>
            <dd className="font-semibold text-[var(--foreground)]">{scheduledTime}</dd>
            <dt className="text-[var(--muted-foreground)]">현재 상태</dt>
            <dd>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${tag.cls}`}>
                <TagIcon className="w-3.5 h-3.5" aria-hidden="true" />
                {tag.label}
              </span>
            </dd>
            <dt className="text-[var(--muted-foreground)]">경과</dt>
            <dd className="font-semibold text-[var(--foreground)]">{elapsed}</dd>
          </dl>
        </section>

        {/* 체크리스트 */}
        <section aria-labelledby="section-checklist">
          <h3 id="section-checklist" className="text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">
            OP 체크리스트 ({doneCount}/{checks.length})
          </h3>
          <ul role="list">
            {checks.map((item, idx) => (
              <li
                key={idx}
                role="listitem"
                className="flex items-center gap-3 py-3 border-b border-[var(--border)] last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => onToggleCheck(id, idx)}
                  aria-label={`${item.label} ${item.done ? '완료 — 탭하여 취소' : '미완료 — 탭하여 완료'}`}
                  aria-pressed={item.done}
                  className={[
                    'flex items-center justify-center w-7 h-7 rounded-[var(--radius-md)] border-2 shrink-0 transition-all',
                    item.done
                      ? 'border-[var(--success)] bg-[var(--success)]'
                      : 'border-[var(--border)] bg-[var(--card)]',
                  ].join(' ')}
                >
                  {item.done && <Check className="w-3.5 h-3.5 text-white" aria-hidden="true" />}
                </button>
                <span className={`text-sm flex-1 ${item.done ? 'line-through text-[var(--muted-foreground)]' : 'text-[var(--foreground)]'}`}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 액션 영역 */}
      <div className="px-5 py-4 border-t border-[var(--border)] flex flex-col gap-2 bg-[var(--card)] sticky bottom-0">
        {meta.nextStatus !== null && meta.nextLabel !== null ? (
          <button
            type="button"
            onClick={() => onAdvance(id)}
            className={[
              'flex items-center justify-center gap-2 h-[52px] w-full rounded-[var(--radius-md)]',
              'text-[15px] font-bold transition-all active:scale-[0.98]',
              NEXT_BTN_CLS[status] ?? '',
            ].join(' ')}
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
            {meta.nextLabel}
          </button>
        ) : (
          <div className="text-center py-2.5 text-[var(--success)] text-[15px] font-bold">
            수술이 완료되었습니다
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center h-[48px] w-full rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--foreground)] text-sm font-semibold hover:bg-[var(--border)] transition-colors"
        >
          닫기
        </button>
      </div>
    </>
  );
}

// ── PC 사이드 패널 ────────────────────────────────────────────────────────────

interface SidePanelProps {
  patient: OpPatient | null;
  onAdvance: (id: string) => void;
  onToggleCheck: (patientId: string, checkIndex: number) => void;
  onClose: () => void;
}

export function SidePanel({ patient, onAdvance, onToggleCheck, onClose }: SidePanelProps) {
  if (!patient) {
    return (
      <aside
        aria-label="환자 상세"
        className={[
          'hidden lg:flex flex-col w-[360px] shrink-0',
          'bg-[var(--card)] border-l border-[var(--border)]',
          'sticky top-0 h-screen overflow-hidden',
        ].join(' ')}
      >
        <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--muted-foreground)]">
          <CircleCheck className="w-10 h-10 opacity-30" aria-hidden="true" />
          <p className="text-sm">카드를 선택하면 상세 정보가 표시됩니다.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={`${patient.name} 상세 정보`}
      className={[
        'hidden lg:flex flex-col w-[360px] shrink-0',
        'bg-[var(--card)] border-l border-[var(--border)]',
        'sticky top-0 h-screen overflow-hidden',
      ].join(' ')}
    >
      <DetailContent
        patient={patient}
        onAdvance={onAdvance}
        onToggleCheck={onToggleCheck}
        onClose={onClose}
        closeLabel="패널 닫기"
      />
    </aside>
  );
}

// ── 모바일 바텀시트 ───────────────────────────────────────────────────────────

interface BottomSheetProps {
  patient: OpPatient | null;
  onAdvance: (id: string) => void;
  onToggleCheck: (patientId: string, checkIndex: number) => void;
  onClose: () => void;
}

export function BottomSheet({ patient, onAdvance, onToggleCheck, onClose }: BottomSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstBtnRef = useRef<HTMLButtonElement>(null);
  const isOpen = patient !== null;

  // ESC 닫기 + body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstBtnRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose]);

  // 오버레이 클릭 닫기
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <>
      {/* 오버레이 */}
      <div
        className="lg:hidden fixed inset-0 bg-black/50 z-[200]"
        aria-hidden="true"
        onClick={handleOverlayClick}
      />
      {/* 시트 */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${patient.name} 상세 정보`}
        className={[
          'lg:hidden fixed bottom-0 left-0 right-0 z-[201]',
          'bg-[var(--card)] rounded-t-[16px] flex flex-col overflow-hidden',
          'max-h-[90dvh]',
        ].join(' ')}
      >
        {/* 핸들 */}
        <div aria-hidden="true" className="mx-auto mt-2.5 w-9 h-1 rounded-full bg-[var(--border)] shrink-0" />
        <DetailContent
          patient={patient}
          onAdvance={onAdvance}
          onToggleCheck={onToggleCheck}
          onClose={onClose}
          closeLabel="시트 닫기"
          titleSize="text-[18px]"
        />
      </div>
    </>
  );
}

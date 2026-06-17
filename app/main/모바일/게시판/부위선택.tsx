'use client';

/**
 * 부위선택 — 수술/MRI 부위 선택 시트(터치형).
 * PC `게시판/post-helpers.ts`의 BODY_PARTS/VALID_BODY_IDS를 그대로 사용(읽기 전용 import).
 * PC의 body-part는 제목 템플릿 필터 용도(=board_posts에 별도 컬럼 없음)이므로,
 * 모바일에서도 부위를 고르면 제목 접미사로 반영(예: 'MRI - 요추/허리')하여 스키마를 발명하지 않는다.
 * JM: 단일 책임(부위 선택), JM4(any 금지), JM6(button·aria-pressed)
 */

import MSheet from '../공통/MSheet';
import { BODY_PARTS, VALID_BODY_IDS } from '@/app/main/기능부품/게시판/post-helpers';

export { BODY_PARTS, VALID_BODY_IDS };

export type BodyPartSheetProps = {
  open: boolean;
  onClose: () => void;
  selectedId: string;
  /** 부위 라벨을 선택했을 때 호출 (id, label) */
  onSelect: (id: string, label: string) => void;
};

export default function BodyPartSheet({ open, onClose, selectedId, onSelect }: BodyPartSheetProps) {
  return (
    <MSheet open={open} onClose={onClose} title="검사·수술 부위 선택">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          padding: '0 16px 24px',
        }}
      >
        {BODY_PARTS.map((part) => {
          const on = selectedId === part.id;
          return (
            <button
              key={part.id}
              type="button"
              onClick={() => onSelect(part.id, part.label)}
              aria-pressed={on}
              aria-label={`${part.label} 부위 선택`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '14px 8px',
                borderRadius: 12,
                border: on ? '1.5px solid var(--m-accent)' : '1px solid var(--m-border)',
                background: on ? 'var(--m-accent-soft)' : 'var(--m-card)',
              }}
            >
              <span aria-hidden style={{ fontSize: 22 }}>{part.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: on ? 'var(--m-accent)' : 'var(--z-800)' }}>
                {part.label}
              </span>
            </button>
          );
        })}
      </div>
    </MSheet>
  );
}

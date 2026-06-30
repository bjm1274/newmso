'use client';

// OP체크 체크리스트 항목 입력 행 (환자 워크스페이스 / 템플릿 편집기)
// 순수 프레젠테이션 컴포넌트 — 상태/effect 없음. OP체크.tsx 에서 그대로 추출됨.

import type { InventoryItem } from '@/types';
import { ITEM_SUGGESTION_ID } from './constants';
import { createChecklistItem } from './checklist-helpers';
import type { ChecklistItemDraft } from './checklist-helpers';
import { normalizeLookupValue } from '../op-check-utils';

type ChecklistKind = 'prep' | 'consumable';

type PatientChecklistItemRowsProps = {
  items: ChecklistItemDraft[];
  kind: ChecklistKind;
  inventoryNameMap: Record<string, InventoryItem>;
  onChange: (next: ChecklistItemDraft[]) => void;
};

export function OpCheckPatientChecklistItemRows({
  items,
  kind,
  inventoryNameMap,
  onChange }: PatientChecklistItemRowsProps) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        const inventoryMatch = inventoryNameMap[normalizeLookupValue(item.name)];
        return (
          <div
            key={item.id}
            className={`rounded-[var(--radius-md)] border bg-[var(--card)] p-2.5 transition-colors ${
              item.checked ? 'border-emerald-200 bg-emerald-50/40' : 'border-[var(--border)]'
            }`}
          >
            {/* Row 1: checkbox + name + delete */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(item.checked)}
                onChange={(event) => {
                  const next = [...items];
                  next[index] = { ...item, checked: event.target.checked };
                  onChange(next);
                }}
                className="h-4 w-4 shrink-0 rounded border-[var(--border)] accent-[var(--accent)]"
              />
              <input
                value={item.name}
                list={ITEM_SUGGESTION_ID}
                onChange={(event) => {
                  const next = [...items];
                  next[index] = { ...item, name: event.target.value };
                  onChange(next);
                }}
                placeholder={kind === 'prep' ? '준비 물품명' : '사용 소모품명'}
                className={`min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-sm font-medium ${
                  item.checked ? 'text-[var(--toss-gray-3)] line-through' : 'text-[var(--foreground)]'
                }`}
              />
              <button
                type="button"
                onClick={() => {
                  const next = items.filter((row) => row.id !== item.id);
                  onChange(next.length ? next : [createChecklistItem(kind === 'prep' ? 'patient-prep' : 'patient-consumable')]);
                }}
                className="shrink-0 rounded-[var(--radius-md)] px-2 py-1.5 text-[11px] font-bold text-[var(--toss-gray-3)] hover:bg-rose-50 hover:text-rose-500"
              >
                ✕
              </button>
            </div>

            {/* Row 2: quantity + unit + note + tags */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {kind === 'consumable' ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...items];
                      const cur = Number(next[index].quantity || 0);
                      if (cur > 0) next[index] = { ...item, quantity: String(cur - 1) };
                      onChange(next);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-sm font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                  >
                    −
                  </button>
                  <input
                    value={item.quantity || ''}
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = { ...item, quantity: event.target.value };
                      onChange(next);
                    }}
                    placeholder="0"
                    className="w-10 rounded-[var(--radius-md)] border border-[var(--border)] px-1 py-1.5 text-center text-sm font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...items];
                      const cur = Number(next[index].quantity || 0);
                      next[index] = { ...item, quantity: String(cur + 1) };
                      onChange(next);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] border border-[var(--accent)]/30 bg-[var(--toss-blue-light)] text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/20"
                  >
                    +
                  </button>
                </div>
              ) : (
                <input
                  value={item.quantity || ''}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, quantity: event.target.value };
                    onChange(next);
                  }}
                  placeholder="수량"
                  className="w-16 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              )}
              <input
                value={item.unit || ''}
                onChange={(event) => {
                  const next = [...items];
                  next[index] = { ...item, unit: event.target.value };
                  onChange(next);
                }}
                placeholder="단위"
                className="w-16 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1.5 text-sm"
              />
              <input
                value={item.note || ''}
                onChange={(event) => {
                  const next = [...items];
                  next[index] = { ...item, note: event.target.value };
                  onChange(next);
                }}
                placeholder="메모"
                className="min-w-[80px] flex-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1.5 text-sm"
              />
              {item.source_label ? (
                <span className="rounded-full bg-[var(--toss-blue-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                  {item.source_label}
                </span>
              ) : null}
              {inventoryMatch ? (
                <span className="text-[10px] font-medium text-[var(--toss-gray-3)]">
                  재고 {String(inventoryMatch.quantity ?? 0)}{String(inventoryMatch.unit || item.unit || '').trim() ? ` ${String(inventoryMatch.unit || item.unit || '').trim()}` : ''}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type TemplateChecklistItemRowsProps = {
  items: ChecklistItemDraft[];
  kind: ChecklistKind;
  onChange: (next: ChecklistItemDraft[]) => void;
};

export function OpCheckTemplateChecklistItemRows({
  items,
  kind,
  onChange }: TemplateChecklistItemRowsProps) {
  return (
    <div className="space-y-1">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="flex items-center gap-1.5 py-0.5 w-full"
        >
          <input
            value={item.name}
            list={ITEM_SUGGESTION_ID}
            onChange={(event) => {
              const next = [...items];
              next[index] = { ...item, name: event.target.value };
              onChange(next);
            }}
            placeholder={kind === 'prep' ? '준비 물품명' : '소모품명'}
            className="flex-[2.5] min-w-[100px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-semibold outline-none"
          />
          <input
            value={item.quantity || ''}
            onChange={(event) => {
              const next = [...items];
              next[index] = { ...item, quantity: event.target.value };
              onChange(next);
            }}
            placeholder="수량"
            className="w-[56px] text-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-1 py-1.5 text-xs font-semibold outline-none"
          />
          <input
            value={item.unit || ''}
            onChange={(event) => {
              const next = [...items];
              next[index] = { ...item, unit: event.target.value };
              onChange(next);
            }}
            placeholder="단위"
            className="w-[56px] text-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-1 py-1.5 text-xs font-semibold outline-none"
          />
          <input
            value={item.note || ''}
            onChange={(event) => {
              const next = [...items];
              next[index] = { ...item, note: event.target.value };
              onChange(next);
            }}
            placeholder="기본 메모"
            className="flex-[2] min-w-[80px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-semibold outline-none"
          />
          <button
            type="button"
            onClick={() => {
              const next = items.filter((row) => row.id !== item.id);
              onChange(next.length ? next : [createChecklistItem(kind === 'prep' ? 'template-prep' : 'template-consumable')]);
            }}
            className="shrink-0 rounded-[var(--radius-md)] border border-red-200 bg-red-50/40 px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50 transition-colors"
          >
            삭제
          </button>
        </div>
      ))}
    </div>
  );
}

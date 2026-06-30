// OP체크 체크리스트 관련 헬퍼 함수

import { createLocalId, normalizeLookupValue } from '../op-check-utils';
import type { OpCheckItem } from '@/types';

export type ChecklistItemDraft = OpCheckItem & {
  id: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  note?: string | null;
  checked?: boolean | null;
  source_label?: string | null;
};

export type TemplateScope = 'surgery' | 'anesthesia';

export type TemplateEditorState = {
  id: string | null;
  template_scope: TemplateScope;
  template_name: string;
  surgery_template_id: string;
  surgery_name: string;
  anesthesia_type: string;
  prep_items: ChecklistItemDraft[];
  consumable_items: ChecklistItemDraft[];
  notes: string;
  is_active: boolean;
};

export function normalizeChecklistItems(items: unknown, prefix: string, sourceLabel?: string | null) {
  if (!Array.isArray(items)) return [] as ChecklistItemDraft[];

  const normalized: ChecklistItemDraft[] = [];

  items.forEach((item, index) => {
    const row = (item || {}) as Record<string, unknown>;
    const name = String(row.name || '').trim();
    if (!name) return;

    normalized.push({
      id: String(row.id || createLocalId(`${prefix}-${index + 1}`)),
      name,
      quantity: String(row.quantity || '').trim() || '',
      unit: String(row.unit || '').trim() || '',
      note: String(row.note || '').trim() || '',
      checked: Boolean(row.checked ?? false),
      source_label: String(row.source_label || sourceLabel || '').trim() || '' });
  });

  return normalized;
}

export function createChecklistItem(prefix: string): ChecklistItemDraft {
  return {
    id: createLocalId(prefix),
    name: '',
    quantity: '',
    unit: '',
    note: '',
    checked: false,
    source_label: '' };
}

export function dedupeChecklistItems(items: ChecklistItemDraft[]) {
  const merged = new Map<string, ChecklistItemDraft>();

  items.forEach((item) => {
    const key = normalizeLookupValue(item.name);
    if (!key) return;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...item, id: item.id || createLocalId('op-item') });
      return;
    }

    const sourceValues = [existing.source_label, item.source_label]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const noteValues = [existing.note, item.note]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    merged.set(key, {
      ...existing,
      checked: Boolean(existing.checked || item.checked),
      quantity: existing.quantity || item.quantity || '',
      unit: existing.unit || item.unit || '',
      note: Array.from(new Set(noteValues)).join(' / '),
      source_label: Array.from(new Set(sourceValues)).join(', ') });
  });

  return Array.from(merged.values());
}

export function formatChecklistItems(items: ChecklistItemDraft[]) {
  return items
    .map((item) => ({
      id: item.id,
      name: String(item.name || '').trim(),
      quantity: String(item.quantity || '').trim(),
      unit: String(item.unit || '').trim(),
      note: String(item.note || '').trim(),
      checked: Boolean(item.checked),
      source_label: String(item.source_label || '').trim() }))
    .filter((item) => item.name);
}

export function serializeChecklistItemsForDiff(items: ChecklistItemDraft[]) {
  return items
    .map((item) => ({
      name: String(item.name || '').trim(),
      quantity: String(item.quantity || '').trim(),
      unit: String(item.unit || '').trim(),
      note: String(item.note || '').trim(),
      checked: Boolean(item.checked),
      source_label: String(item.source_label || '').trim() }))
    .filter((item) => item.name || item.quantity || item.unit || item.note || item.checked || item.source_label)
    .sort((left, right) => {
      const nameDiff = normalizeLookupValue(left.name).localeCompare(normalizeLookupValue(right.name), 'ko');
      if (nameDiff !== 0) return nameDiff;
      const quantityDiff = left.quantity.localeCompare(right.quantity, 'ko');
      if (quantityDiff !== 0) return quantityDiff;
      const unitDiff = left.unit.localeCompare(right.unit, 'ko');
      if (unitDiff !== 0) return unitDiff;
      const noteDiff = left.note.localeCompare(right.note, 'ko');
      if (noteDiff !== 0) return noteDiff;
      return left.source_label.localeCompare(right.source_label, 'ko');
    });
}

export function summarizeChecklistItems(items: ChecklistItemDraft[]) {
  const validItems = items.filter((item) => String(item.name || '').trim());
  if (validItems.length === 0) return '등록된 항목 없음';
  const checkedCount = validItems.filter((item) => Boolean(item.checked)).length;
  return `${checkedCount}/${validItems.length} 완료`;
}

export function emptyTemplateEditor(): TemplateEditorState {
  return {
    id: null,
    template_scope: 'surgery',
    template_name: '',
    surgery_template_id: '',
    surgery_name: '',
    anesthesia_type: '',
    prep_items: [createChecklistItem('template-prep')],
    consumable_items: [createChecklistItem('template-consumable')],
    notes: '',
    is_active: true };
}

'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { withMissingColumnFallback, withMissingColumnsFallback } from '@/lib/supabase-compat';
import type { BoardPost, InventoryItem, OpCheckItem, OpCheckTemplate, OpPatientCheck } from '@/types';

const SCHEDULE_META_PREFIX = '[[SCHEDULE_META]]';
const SCHEDULE_META_SUFFIX = '[[/SCHEDULE_META]]';
const STATUS_OPTIONS = ['준비중', '준비완료', '수술중', '완료'] as const;
const ANESTHESIA_OPTIONS = ['전신마취', '척추마취', '국소마취', '수면마취', '부위마취', '기타'] as const;
const ITEM_SUGGESTION_ID = 'op-check-item-suggestions';
const MIGRATION_FILE = 'supabase_migrations/20260331_op_check_foundation.sql';

type TemplateScope = 'surgery' | 'anesthesia';

type LinkedSchedulePost = {
  id: string;
  patient_name: string;
  surgery_name: string;
  chart_no: string;
  schedule_date: string;
  schedule_time: string;
  schedule_room: string;
  company: string;
  company_id: string;
  surgery_fasting: boolean;
  surgery_inpatient: boolean;
  surgery_guardian: boolean;
  surgery_caregiver: boolean;
  surgery_transfusion: boolean;
};

type SurgeryTemplateRow = {
  id: string;
  name: string;
  sort_order?: number | null;
  is_active?: boolean | null;
};

type ChecklistItemDraft = OpCheckItem & {
  id: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  note?: string | null;
  checked?: boolean | null;
  source_label?: string | null;
};

type TemplateEditorState = {
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

type PatientCheckState = {
  id: string | null;
  schedule_post_id: string;
  patient_name: string;
  chart_no: string;
  surgery_name: string;
  surgery_template_id: string;
  anesthesia_type: string;
  schedule_date: string;
  schedule_time: string;
  schedule_room: string;
  prep_items: ChecklistItemDraft[];
  consumable_items: ChecklistItemDraft[];
  notes: string;
  status: string;
  applied_template_ids: string[];
};

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLookupValue(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

function normalizeDateValue(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const matched = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (matched) return matched[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function normalizeTimeValue(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const matched = raw.match(/^(\d{2}:\d{2})/);
  return matched ? matched[1] : raw;
}

function extractScheduleMetaFromContent(value: unknown) {
  const raw = String(value || '');
  const start = raw.indexOf(SCHEDULE_META_PREFIX);
  const end = raw.indexOf(SCHEDULE_META_SUFFIX);
  if (start < 0 || end < 0 || end <= start) {
    return {
      displayContent: raw.trim(),
      meta: null as Record<string, unknown> | null,
    };
  }

  const displayContent = `${raw.slice(0, start)}${raw.slice(end + SCHEDULE_META_SUFFIX.length)}`.trim();
  const metaText = raw.slice(start + SCHEDULE_META_PREFIX.length, end).trim();
  try {
    return {
      displayContent,
      meta: JSON.parse(metaText) as Record<string, unknown>,
    };
  } catch {
    return {
      displayContent,
      meta: null as Record<string, unknown> | null,
    };
  }
}

function mapSchedulePost(post: BoardPost): LinkedSchedulePost {
  const { displayContent, meta } = extractScheduleMetaFromContent(post.content);
  return {
    id: String(post.id || ''),
    patient_name: String(post.patient_name ?? meta?.patient ?? '').trim(),
    surgery_name: String(post.title || '').trim(),
    chart_no: String(displayContent || '').trim(),
    schedule_date: normalizeDateValue(post.schedule_date ?? meta?.date ?? ''),
    schedule_time: normalizeTimeValue(post.schedule_time ?? meta?.time ?? ''),
    schedule_room: String(post.schedule_room ?? meta?.room ?? '').trim(),
    company: String(post.company || '').trim(),
    company_id: String(post.company_id || '').trim(),
    surgery_fasting: Boolean(post.surgery_fasting ?? meta?.fasting ?? false),
    surgery_inpatient: Boolean(post.surgery_inpatient ?? meta?.inpatient ?? false),
    surgery_guardian: Boolean(post.surgery_guardian ?? meta?.guardian ?? false),
    surgery_caregiver: Boolean(post.surgery_caregiver ?? meta?.caregiver ?? false),
    surgery_transfusion: Boolean(post.surgery_transfusion ?? meta?.transfusion ?? false),
  };
}

function normalizeChecklistItems(items: unknown, prefix: string, sourceLabel?: string | null) {
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
      source_label: String(row.source_label || sourceLabel || '').trim() || '',
    });
  });

  return normalized;
}

function createChecklistItem(prefix: string): ChecklistItemDraft {
  return {
    id: createLocalId(prefix),
    name: '',
    quantity: '',
    unit: '',
    note: '',
    checked: false,
    source_label: '',
  };
}

function dedupeChecklistItems(items: ChecklistItemDraft[]) {
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
      source_label: Array.from(new Set(sourceValues)).join(', '),
    });
  });

  return Array.from(merged.values());
}

function formatChecklistItems(items: ChecklistItemDraft[]) {
  return items
    .map((item) => ({
      id: item.id,
      name: String(item.name || '').trim(),
      quantity: String(item.quantity || '').trim(),
      unit: String(item.unit || '').trim(),
      note: String(item.note || '').trim(),
      checked: Boolean(item.checked),
      source_label: String(item.source_label || '').trim(),
    }))
    .filter((item) => item.name);
}

function findMatchingSurgeryTemplate(surgeryTemplates: SurgeryTemplateRow[], surgeryName: string) {
  const normalizedTarget = normalizeLookupValue(surgeryName);
  if (!normalizedTarget) return null;
  return (
    surgeryTemplates.find((template) => normalizeLookupValue(template.name) === normalizedTarget) || null
  );
}

function buildTemplateLabel(template: OpCheckTemplate) {
  if (template.template_scope === 'anesthesia') {
    return template.anesthesia_type || template.template_name || '마취 템플릿';
  }
  return template.surgery_name || template.template_name || '수술 템플릿';
}

function formatDateLabel(dateText: string) {
  if (!dateText) return '날짜 미정';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }).format(new Date(`${dateText}T00:00:00`));
  } catch {
    return dateText;
  }
}

function emptyTemplateEditor(): TemplateEditorState {
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
    is_active: true,
  };
}

function normalizeInventoryRows(rows: unknown) {
  if (!Array.isArray(rows)) return [] as InventoryItem[];

  return rows
    .map((row) => {
      const item = (row || {}) as Record<string, unknown>;
      const id = String(item.id || '').trim();
      const name = String(item.name || '').trim();
      if (!id || !name) return null;

      return {
        ...item,
        id,
        name,
        unit: String(item.unit || '').trim() || null,
        quantity: typeof item.quantity === 'number' ? item.quantity : Number(item.quantity || 0),
        company: String(item.company || '').trim() || null,
        company_id: String(item.company_id || '').trim() || null,
        department: String(item.department || '').trim() || null,
      } as InventoryItem;
    })
    .filter((item): item is InventoryItem => Boolean(item));
}

function isOpCheckSchemaMissing(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as { code?: string }).code || '');
  const message = String((error as { message?: string }).message || '');
  return code === '42P01' || message.includes('op_check_templates') || message.includes('op_patient_checks');
}

export default function OperationCheckView({
  user,
}: {
  user?: Record<string, any>;
  staffs?: any[];
}) {
  const [activeTab, setActiveTab] = useState<'patients' | 'templates'>('patients');
  const [loading, setLoading] = useState(true);
  const [savingCheck, setSavingCheck] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [schemaError, setSchemaError] = useState('');

  const [schedulePosts, setSchedulePosts] = useState<LinkedSchedulePost[]>([]);
  const [surgeryTemplates, setSurgeryTemplates] = useState<SurgeryTemplateRow[]>([]);
  const [opTemplates, setOpTemplates] = useState<OpCheckTemplate[]>([]);
  const [patientChecks, setPatientChecks] = useState<OpPatientCheck[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [checkForm, setCheckForm] = useState<PatientCheckState | null>(null);
  const [templateEditor, setTemplateEditor] = useState<TemplateEditorState>(emptyTemplateEditor);

  const loadData = useCallback(async () => {
    setLoading(true);
    setSchemaError('');

    try {
      const surgeryTemplateQuery = supabase
        .from('surgery_templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      const companyId = String(user?.company_id || '').trim();
      const companyName = String(user?.company || '').trim();

      const [scheduleRes, templateRes, patientCheckRes, surgeryTemplateRes, inventoryRes] = await Promise.all([
        withMissingColumnFallback(
          async () => {
            let query = supabase
              .from('board_posts')
              .select('*')
              .eq('board_type', '수술일정')
              .order('schedule_date', { ascending: true })
              .order('schedule_time', { ascending: true })
              .order('created_at', { ascending: true });
            if (companyId) {
              query = query.eq('company_id', companyId);
            } else if (companyName) {
              query = query.eq('company', companyName);
            }
            return query;
          },
          async () => {
            let query = supabase
              .from('board_posts')
              .select('*')
              .eq('board_type', '수술일정')
              .order('schedule_date', { ascending: true })
              .order('schedule_time', { ascending: true })
              .order('created_at', { ascending: true });
            if (companyName) {
              query = query.eq('company', companyName);
            }
            return query;
          },
        ),
        withMissingColumnFallback(
          async () => {
            let query = supabase
              .from('op_check_templates')
              .select('*')
              .order('template_scope', { ascending: true })
              .order('template_name', { ascending: true });
            if (companyId) {
              query = query.eq('company_id', companyId);
            } else if (companyName) {
              query = query.eq('company_name', companyName);
            }
            return query;
          },
          async () => {
            let query = supabase
              .from('op_check_templates')
              .select('*')
              .order('template_scope', { ascending: true })
              .order('template_name', { ascending: true });
            if (companyName) {
              query = query.eq('company_name', companyName);
            }
            return query;
          },
        ),
        withMissingColumnFallback(
          async () => {
            let query = supabase
              .from('op_patient_checks')
              .select('*')
              .order('schedule_date', { ascending: true })
              .order('schedule_time', { ascending: true });
            if (companyId) {
              query = query.eq('company_id', companyId);
            } else if (companyName) {
              query = query.eq('company_name', companyName);
            }
            return query;
          },
          async () => {
            let query = supabase
              .from('op_patient_checks')
              .select('*')
              .order('schedule_date', { ascending: true })
              .order('schedule_time', { ascending: true });
            if (companyName) {
              query = query.eq('company_name', companyName);
            }
            return query;
          },
        ),
        surgeryTemplateQuery,
        withMissingColumnsFallback(
          async (omittedColumns) => {
            const selectedColumns = ['id', 'name', 'unit', 'quantity', 'company', 'company_id', 'department']
              .filter((columnName) => !omittedColumns.has(columnName))
              .join(', ');
            let query = supabase
              .from('inventory_items')
              .select(selectedColumns)
              .order('name', { ascending: true });

            if (!omittedColumns.has('company_id') && companyId) {
              query = query.eq('company_id', companyId);
            } else if (companyName) {
              query = query.eq('company', companyName);
            }

            return query;
          },
          ['company_id', 'department'],
        ),
      ]);

      const firstError =
        scheduleRes.error ||
        templateRes.error ||
        patientCheckRes.error ||
        surgeryTemplateRes.error ||
        inventoryRes.error;

      if (firstError) {
        if (isOpCheckSchemaMissing(firstError)) {
          setSchemaError(`OP체크 테이블이 아직 없습니다. ${MIGRATION_FILE} 를 먼저 적용해 주세요.`);
          return;
        }
        throw firstError;
      }

      const normalizedSchedules = ((scheduleRes.data || []) as BoardPost[])
        .map(mapSchedulePost)
        .filter((post) => post.id && post.patient_name && post.surgery_name);

      setSchedulePosts(normalizedSchedules);
      setOpTemplates((templateRes.data || []) as OpCheckTemplate[]);
      setPatientChecks((patientCheckRes.data || []) as OpPatientCheck[]);
      setSurgeryTemplates((surgeryTemplateRes.data || []) as SurgeryTemplateRow[]);
      setInventoryItems(normalizeInventoryRows(inventoryRes.data));
    } catch (error) {
      console.error('OP체크 데이터 로딩 실패', error);
      toast('OP체크 데이터를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [user?.company, user?.company_id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const patientChecksByScheduleId = useMemo(
    () =>
      patientChecks.reduce<Record<string, OpPatientCheck>>((acc, row) => {
        const key = String(row.schedule_post_id || '').trim();
        if (key) acc[key] = row;
        return acc;
      }, {}),
    [patientChecks]
  );

  const filteredSchedules = useMemo(() => {
    const search = normalizeLookupValue(deferredSearchTerm);
    return schedulePosts.filter((post) => {
      const sameDate = !selectedDate || post.schedule_date === selectedDate;
      if (!sameDate) return false;
      if (!search) return true;
      return [post.patient_name, post.surgery_name, post.chart_no, post.schedule_room].some((value) =>
        normalizeLookupValue(value).includes(search)
      );
    });
  }, [deferredSearchTerm, schedulePosts, selectedDate]);

  useEffect(() => {
    if (selectedScheduleId && schedulePosts.some((post) => post.id === selectedScheduleId)) return;
    setSelectedScheduleId(schedulePosts[0]?.id || null);
  }, [schedulePosts, selectedScheduleId]);

  const selectedSchedule = useMemo(
    () => schedulePosts.find((post) => post.id === selectedScheduleId) || null,
    [schedulePosts, selectedScheduleId]
  );

  const buildDefaultPatientCheck = useCallback(
    (schedule: LinkedSchedulePost, existingCheck?: OpPatientCheck | null): PatientCheckState => {
      const matchedSurgeryTemplate = findMatchingSurgeryTemplate(surgeryTemplates, schedule.surgery_name);
      const existingAnesthesiaType = String(existingCheck?.anesthesia_type || '').trim();

      const applicableTemplates = opTemplates.filter((template) => {
        if (template.is_active === false) return false;

        if (template.template_scope === 'anesthesia') {
          return (
            !!existingAnesthesiaType &&
            normalizeLookupValue(template.anesthesia_type) === normalizeLookupValue(existingAnesthesiaType)
          );
        }

        const matchesTemplateId =
          template.surgery_template_id &&
          matchedSurgeryTemplate?.id &&
          String(template.surgery_template_id) === String(matchedSurgeryTemplate.id);

        return (
          matchesTemplateId ||
          normalizeLookupValue(template.surgery_name) === normalizeLookupValue(schedule.surgery_name)
        );
      });

      const prepItems = dedupeChecklistItems(
        applicableTemplates.flatMap((template) =>
          normalizeChecklistItems(template.prep_items, 'prep', buildTemplateLabel(template))
        )
      );
      const consumableItems = dedupeChecklistItems(
        applicableTemplates.flatMap((template) =>
          normalizeChecklistItems(template.consumable_items, 'consumable', buildTemplateLabel(template))
        )
      );

      if (existingCheck) {
        return {
          id: String(existingCheck.id || ''),
          schedule_post_id: schedule.id,
          patient_name: schedule.patient_name,
          chart_no: String(existingCheck.chart_no || schedule.chart_no || '').trim(),
          surgery_name: schedule.surgery_name,
          surgery_template_id: String(existingCheck.surgery_template_id || matchedSurgeryTemplate?.id || '').trim(),
          anesthesia_type: existingAnesthesiaType,
          schedule_date: schedule.schedule_date,
          schedule_time: schedule.schedule_time,
          schedule_room: schedule.schedule_room,
          prep_items: normalizeChecklistItems(existingCheck.prep_items, 'patient-prep'),
          consumable_items: normalizeChecklistItems(existingCheck.consumable_items, 'patient-consumable'),
          notes: String(existingCheck.notes || '').trim(),
          status: String(existingCheck.status || '준비중').trim() || '준비중',
          applied_template_ids: Array.isArray(existingCheck.applied_template_ids)
            ? existingCheck.applied_template_ids.map((value) => String(value))
            : applicableTemplates.map((template) => String(template.id)),
        };
      }

      return {
        id: null,
        schedule_post_id: schedule.id,
        patient_name: schedule.patient_name,
        chart_no: schedule.chart_no,
        surgery_name: schedule.surgery_name,
        surgery_template_id: String(matchedSurgeryTemplate?.id || '').trim(),
        anesthesia_type: '',
        schedule_date: schedule.schedule_date,
        schedule_time: schedule.schedule_time,
        schedule_room: schedule.schedule_room,
        prep_items: prepItems.length ? prepItems : [createChecklistItem('patient-prep')],
        consumable_items: consumableItems.length ? consumableItems : [createChecklistItem('patient-consumable')],
        notes: '',
        status: '준비중',
        applied_template_ids: applicableTemplates.map((template) => String(template.id)),
      };
    },
    [opTemplates, surgeryTemplates]
  );

  useEffect(() => {
    if (!selectedSchedule) {
      setCheckForm(null);
      return;
    }
    setCheckForm(buildDefaultPatientCheck(selectedSchedule, patientChecksByScheduleId[selectedSchedule.id] || null));
  }, [buildDefaultPatientCheck, patientChecksByScheduleId, selectedSchedule]);

  const inventoryNameMap = useMemo(
    () =>
      inventoryItems.reduce<Record<string, InventoryItem>>((acc, item) => {
        const key = normalizeLookupValue(item.name);
        if (key && !acc[key]) acc[key] = item;
        return acc;
      }, {}),
    [inventoryItems]
  );

  const itemSuggestions = useMemo(() => {
    const names = new Set<string>();
    inventoryItems.forEach((item) => {
      const name = String(item.name || '').trim();
      if (name) names.add(name);
    });
    opTemplates.forEach((template) => {
      normalizeChecklistItems(template.prep_items, 'template').forEach((item) => names.add(item.name));
      normalizeChecklistItems(template.consumable_items, 'template').forEach((item) => names.add(item.name));
    });
    return Array.from(names).sort();
  }, [inventoryItems, opTemplates]);

  const mergeTemplateItemsIntoForm = useCallback(() => {
    if (!selectedSchedule || !checkForm) return;

    const matchedSurgeryTemplate = findMatchingSurgeryTemplate(surgeryTemplates, selectedSchedule.surgery_name);
    const applicableTemplates = opTemplates.filter((template) => {
      if (template.is_active === false) return false;
      if (template.template_scope === 'anesthesia') {
        return (
          !!checkForm.anesthesia_type &&
          normalizeLookupValue(template.anesthesia_type) === normalizeLookupValue(checkForm.anesthesia_type)
        );
      }

      const matchesTemplateId =
        template.surgery_template_id &&
        matchedSurgeryTemplate?.id &&
        String(template.surgery_template_id) === String(matchedSurgeryTemplate.id);

      return (
        matchesTemplateId ||
        normalizeLookupValue(template.surgery_name) === normalizeLookupValue(selectedSchedule.surgery_name)
      );
    });

    const templatePrepItems = dedupeChecklistItems(
      applicableTemplates.flatMap((template) =>
        normalizeChecklistItems(template.prep_items, 'merged-prep', buildTemplateLabel(template))
      )
    );
    const templateConsumableItems = dedupeChecklistItems(
      applicableTemplates.flatMap((template) =>
        normalizeChecklistItems(template.consumable_items, 'merged-consumable', buildTemplateLabel(template))
      )
    );

    setCheckForm((prev) => {
      if (!prev) return prev;

      const mergeItems = (existingItems: ChecklistItemDraft[], nextItems: ChecklistItemDraft[]) => {
        const existingMap = new Map(
          existingItems.map((item) => [normalizeLookupValue(item.name), item] as const)
        );
        const nextKeys = new Set(nextItems.map((item) => normalizeLookupValue(item.name)).filter(Boolean));

        const mergedItems = nextItems.map((item) => {
          const matched = existingMap.get(normalizeLookupValue(item.name));
          if (!matched) return item;
          return {
            ...item,
            checked: Boolean(matched.checked),
            quantity: matched.quantity || item.quantity || '',
            unit: matched.unit || item.unit || '',
            note: matched.note || item.note || '',
          };
        });

        const customItems = existingItems.filter((item) => {
          const key = normalizeLookupValue(item.name);
          return key && !nextKeys.has(key);
        });

        return dedupeChecklistItems([...mergedItems, ...customItems]);
      };

      return {
        ...prev,
        surgery_template_id: String(matchedSurgeryTemplate?.id || prev.surgery_template_id || '').trim(),
        prep_items: mergeItems(prev.prep_items, templatePrepItems.length ? templatePrepItems : [createChecklistItem('patient-prep')]),
        consumable_items: mergeItems(
          prev.consumable_items,
          templateConsumableItems.length ? templateConsumableItems : [createChecklistItem('patient-consumable')]
        ),
        applied_template_ids: applicableTemplates.map((template) => String(template.id)),
      };
    });

    toast('수술/마취 템플릿 기준으로 OP체크 항목을 반영했습니다.', 'success');
  }, [checkForm, opTemplates, selectedSchedule, surgeryTemplates]);

  const updateCheckFormList = useCallback(
    (
      key: 'prep_items' | 'consumable_items',
      updater: (items: ChecklistItemDraft[]) => ChecklistItemDraft[]
    ) => {
      setCheckForm((prev) => (prev ? { ...prev, [key]: updater(prev[key]) } : prev));
    },
    []
  );

  const savePatientCheck = useCallback(async () => {
    if (!checkForm || !selectedSchedule) return;

    setSavingCheck(true);
    try {
      const payload = {
        id: checkForm.id || undefined,
        schedule_post_id: checkForm.schedule_post_id,
        company_id: String(user?.company_id || selectedSchedule.company_id || '').trim() || null,
        company_name: String(user?.company || selectedSchedule.company || '전체').trim() || '전체',
        patient_name: checkForm.patient_name,
        chart_no: checkForm.chart_no || null,
        surgery_name: checkForm.surgery_name,
        surgery_template_id: checkForm.surgery_template_id || null,
        anesthesia_type: checkForm.anesthesia_type || null,
        schedule_date: checkForm.schedule_date || null,
        schedule_time: checkForm.schedule_time || null,
        schedule_room: checkForm.schedule_room || null,
        prep_items: formatChecklistItems(checkForm.prep_items),
        consumable_items: formatChecklistItems(checkForm.consumable_items),
        notes: checkForm.notes || null,
        status: checkForm.status || '준비중',
        applied_template_ids: checkForm.applied_template_ids,
        created_by: String(user?.id || '').trim() || null,
        created_by_name: String(user?.name || '').trim() || null,
        updated_by: String(user?.id || '').trim() || null,
        updated_by_name: String(user?.name || '').trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('op_patient_checks')
        .upsert(payload, { onConflict: 'schedule_post_id' })
        .select('*')
        .single();

      if (error) throw error;

      const nextRow = data as OpPatientCheck;
      setPatientChecks((prev) => {
        const filtered = prev.filter((row) => String(row.schedule_post_id || '') !== checkForm.schedule_post_id);
        return [nextRow, ...filtered];
      });
      setCheckForm(buildDefaultPatientCheck(selectedSchedule, nextRow));
      toast('환자별 OP체크를 저장했습니다.', 'success');
    } catch (error) {
      console.error('OP체크 저장 실패', error);
      toast('OP체크 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingCheck(false);
    }
  }, [buildDefaultPatientCheck, checkForm, selectedSchedule, user?.company, user?.company_id, user?.id, user?.name]);

  const updateTemplateEditorList = useCallback(
    (
      key: 'prep_items' | 'consumable_items',
      updater: (items: ChecklistItemDraft[]) => ChecklistItemDraft[]
    ) => {
      setTemplateEditor((prev) => ({ ...prev, [key]: updater(prev[key]) }));
    },
    []
  );

  const saveTemplate = useCallback(async () => {
    const effectiveName =
      templateEditor.template_name.trim() ||
      (templateEditor.template_scope === 'anesthesia'
        ? templateEditor.anesthesia_type.trim()
        : templateEditor.surgery_name.trim());

    if (!effectiveName) {
      toast('템플릿 이름을 입력해 주세요.', 'warning');
      return;
    }

    if (templateEditor.template_scope === 'surgery' && !templateEditor.surgery_name.trim()) {
      toast('수술명을 선택하거나 입력해 주세요.', 'warning');
      return;
    }

    if (templateEditor.template_scope === 'anesthesia' && !templateEditor.anesthesia_type.trim()) {
      toast('마취 유형을 입력해 주세요.', 'warning');
      return;
    }

    setSavingTemplate(true);
    try {
      const payload = {
        company_id: String(user?.company_id || '').trim() || null,
        company_name: String(user?.company || '전체').trim() || '전체',
        template_scope: templateEditor.template_scope,
        template_name: effectiveName,
        surgery_template_id:
          templateEditor.template_scope === 'surgery' && templateEditor.surgery_template_id
            ? templateEditor.surgery_template_id
            : null,
        surgery_name: templateEditor.template_scope === 'surgery' ? templateEditor.surgery_name.trim() : null,
        anesthesia_type:
          templateEditor.template_scope === 'anesthesia' ? templateEditor.anesthesia_type.trim() : null,
        prep_items: formatChecklistItems(templateEditor.prep_items),
        consumable_items: formatChecklistItems(templateEditor.consumable_items),
        notes: templateEditor.notes.trim() || null,
        is_active: templateEditor.is_active,
        created_by: String(user?.id || '').trim() || null,
        created_by_name: String(user?.name || '').trim() || null,
        updated_at: new Date().toISOString(),
      };

      const response = templateEditor.id
        ? await supabase
            .from('op_check_templates')
            .update(payload)
            .eq('id', templateEditor.id)
            .select('*')
            .single()
        : await supabase
            .from('op_check_templates')
            .insert({
              ...payload,
              created_at: new Date().toISOString(),
            })
            .select('*')
            .single();

      if (response.error) throw response.error;

      const savedRow = response.data as OpCheckTemplate;
      setOpTemplates((prev) => {
        const filtered = prev.filter((row) => String(row.id || '') !== String(savedRow.id || ''));
        return [...filtered, savedRow].sort((left, right) =>
          String(buildTemplateLabel(left)).localeCompare(String(buildTemplateLabel(right)), 'ko')
        );
      });
      setTemplateEditor(emptyTemplateEditor());
      toast('OP체크 템플릿을 저장했습니다.', 'success');
    } catch (error) {
      console.error('OP체크 템플릿 저장 실패', error);
      toast('템플릿 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingTemplate(false);
    }
  }, [templateEditor, user?.company, user?.company_id, user?.id, user?.name]);

  const loadTemplateIntoEditor = useCallback((template: OpCheckTemplate) => {
    setTemplateEditor({
      id: String(template.id || ''),
      template_scope: (template.template_scope === 'anesthesia' ? 'anesthesia' : 'surgery') as TemplateScope,
      template_name: String(template.template_name || '').trim(),
      surgery_template_id: String(template.surgery_template_id || '').trim(),
      surgery_name: String(template.surgery_name || '').trim(),
      anesthesia_type: String(template.anesthesia_type || '').trim(),
      prep_items: normalizeChecklistItems(template.prep_items, 'template-prep'),
      consumable_items: normalizeChecklistItems(template.consumable_items, 'template-consumable'),
      notes: String(template.notes || '').trim(),
      is_active: template.is_active !== false,
    });
    setActiveTab('templates');
  }, []);

  const removeTemplate = useCallback(async (templateId: string) => {
    if (typeof window !== 'undefined' && !window.confirm('이 템플릿을 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('op_check_templates').delete().eq('id', templateId);
      if (error) throw error;
      setOpTemplates((prev) => prev.filter((template) => String(template.id || '') !== templateId));
      if (templateEditor.id === templateId) {
        setTemplateEditor(emptyTemplateEditor());
      }
      toast('템플릿을 삭제했습니다.', 'success');
    } catch (error) {
      console.error('OP체크 템플릿 삭제 실패', error);
      toast('템플릿 삭제 중 오류가 발생했습니다.', 'error');
    }
  }, [templateEditor.id]);

  const templatesByScope = useMemo(
    () => ({
      surgery: opTemplates.filter((template) => template.template_scope !== 'anesthesia'),
      anesthesia: opTemplates.filter((template) => template.template_scope === 'anesthesia'),
    }),
    [opTemplates]
  );

  const renderItemRows = useCallback(
    (
      items: ChecklistItemDraft[],
      kind: 'prep' | 'consumable',
      onChange: (next: ChecklistItemDraft[]) => void
    ) => (
      <div className="space-y-2">
        {items.map((item, index) => {
          const inventoryMatch = inventoryNameMap[normalizeLookupValue(item.name)];
          return (
            <div
              key={item.id}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3"
            >
              <div className="grid gap-2 md:grid-cols-[auto,1.6fr,0.7fr,0.7fr,1fr,auto] md:items-center">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={Boolean(item.checked)}
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = { ...item, checked: event.target.checked };
                      onChange(next);
                    }}
                    className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
                  />
                  {kind === 'prep' ? '준비' : '사용'}
                </label>

                <input
                  value={item.name}
                  list={ITEM_SUGGESTION_ID}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, name: event.target.value };
                    onChange(next);
                  }}
                  placeholder={kind === 'prep' ? '준비 물품명' : '사용 소모품명'}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                />

                <input
                  value={item.quantity || ''}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, quantity: event.target.value };
                    onChange(next);
                  }}
                  placeholder="수량"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                />

                <input
                  value={item.unit || ''}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, unit: event.target.value };
                    onChange(next);
                  }}
                  placeholder="단위"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                />

                <input
                  value={item.note || ''}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, note: event.target.value };
                    onChange(next);
                  }}
                  placeholder="메모"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                />

                <button
                  type="button"
                  onClick={() => {
                    const next = items.filter((row) => row.id !== item.id);
                    onChange(next.length ? next : [createChecklistItem(kind === 'prep' ? 'patient-prep' : 'patient-consumable')]);
                  }}
                  className="rounded-full border border-[var(--border)] px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                >
                  삭제
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--toss-gray-3)]">
                {item.source_label ? (
                  <span className="rounded-full bg-[var(--toss-blue-light)] px-2 py-1 text-[var(--accent)]">
                    {item.source_label}
                  </span>
                ) : null}
                {inventoryMatch ? (
                  <span>
                    재고관리 연동 수량 {String(inventoryMatch.quantity ?? 0)}
                    {String(inventoryMatch.unit || item.unit || '').trim()
                      ? ` ${String(inventoryMatch.unit || item.unit || '').trim()}`
                      : ''}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    ),
    [inventoryNameMap]
  );

  const renderTemplateItemRows = useCallback(
    (
      items: ChecklistItemDraft[],
      kind: 'prep' | 'consumable',
      onChange: (next: ChecklistItemDraft[]) => void
    ) => (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="grid gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 md:grid-cols-[1.5fr,0.7fr,0.7fr,1fr,auto]"
          >
            <input
              value={item.name}
              list={ITEM_SUGGESTION_ID}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, name: event.target.value };
                onChange(next);
              }}
              placeholder={kind === 'prep' ? '기본 준비 물품명' : '기본 소모품명'}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
            />
            <input
              value={item.quantity || ''}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, quantity: event.target.value };
                onChange(next);
              }}
              placeholder="기본 수량"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
            />
            <input
              value={item.unit || ''}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, unit: event.target.value };
                onChange(next);
              }}
              placeholder="단위"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
            />
            <input
              value={item.note || ''}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, note: event.target.value };
                onChange(next);
              }}
              placeholder="기본 메모"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                const next = items.filter((row) => row.id !== item.id);
                onChange(next.length ? next : [createChecklistItem(kind === 'prep' ? 'template-prep' : 'template-consumable')]);
              }}
              className="rounded-full border border-[var(--border)] px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
            >
              삭제
            </button>
          </div>
        ))}
      </div>
    ),
    []
  );

  if (loading) {
    return (
      <div
        data-testid="op-check-view"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-sm"
      >
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
        <p className="mt-3 text-sm font-semibold text-[var(--foreground)]">OP체크 데이터를 불러오는 중입니다.</p>
      </div>
    );
  }

  if (schemaError) {
    return (
      <div
        data-testid="op-check-view"
        className="rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50 p-5 shadow-sm"
      >
        <h3 className="text-base font-bold text-amber-900">OP체크 초기 설정이 필요합니다.</h3>
        <p className="mt-2 text-sm font-medium text-amber-800">{schemaError}</p>
        <p className="mt-2 text-xs font-semibold text-amber-700">
          수술일정표 연동과 환자별 체크 저장을 위해 새 테이블이 먼저 생성되어야 합니다.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="op-check-view" className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--foreground)]">OP체크</h2>
            <p className="mt-1 text-sm font-medium text-[var(--toss-gray-3)]">
              수술일정표 환자와 연동해 수술 전 준비사항과 수술 중 의료소모품 사용 내역을 관리합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('patients')}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                activeTab === 'patients'
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)]'
              }`}
            >
              환자별 확인
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                activeTab === 'templates'
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)]'
              }`}
            >
              템플릿 설정
            </button>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
            >
              새로고침
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'patients' ? (
        <div className="grid gap-4 xl:grid-cols-[340px,1fr]">
          <aside className="space-y-3">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="grid gap-2">
                <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">수술일</label>
                <input
                  data-testid="op-check-date-filter"
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                />
                <label className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">환자/수술 검색</label>
                <input
                  data-testid="op-check-search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="환자명, 수술명, 차트번호"
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                />
              </div>
            </div>

            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-sm font-bold text-[var(--foreground)]">수술 환자 목록</p>
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  {filteredSchedules.length}명
                </span>
              </div>

              <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                {filteredSchedules.length === 0 ? (
                  <div className="empty-state rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)]/40 p-6 text-center">
                    <p className="text-sm font-semibold text-[var(--toss-gray-3)]">
                      선택한 날짜에 연결할 수술 환자가 없습니다.
                    </p>
                  </div>
                ) : (
                  filteredSchedules.map((post) => {
                    const savedRow = patientChecksByScheduleId[post.id];
                    const selected = post.id === selectedScheduleId;
                    return (
                      <button
                        key={post.id}
                        type="button"
                        data-testid={`op-check-schedule-card-${post.id}`}
                        onClick={() => setSelectedScheduleId(post.id)}
                        className={`w-full rounded-[var(--radius-lg)] border p-3 text-left transition-all ${
                          selected
                            ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/60 shadow-sm'
                            : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/35 hover:bg-[var(--muted)]/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[var(--foreground)]">
                              {post.patient_name}
                            </p>
                            <p className="mt-1 truncate text-[12px] font-semibold text-[var(--accent)]">
                              {post.surgery_name}
                            </p>
                          </div>
                          <span className="rounded-full bg-[var(--muted)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">
                            {post.schedule_time || '시간 미정'}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--toss-gray-3)]">
                          <span>{formatDateLabel(post.schedule_date)}</span>
                          <span>{post.schedule_room || '방 미정'}</span>
                          {post.chart_no ? <span>차트 {post.chart_no}</span> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {savedRow ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                              저장됨 · {String(savedRow.status || '준비중')}
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
                              신규 체크
                            </span>
                          )}
                          {post.surgery_fasting ? (
                            <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">
                              금식
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </aside>

          <section className="space-y-4">
            {!selectedSchedule || !checkForm ? (
              <div className="empty-state rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center shadow-sm">
                <p className="text-base font-bold text-[var(--foreground)]">환자를 선택해 주세요.</p>
                <p className="mt-2 text-sm font-medium text-[var(--toss-gray-3)]">
                  수술일정표와 연동된 환자를 선택하면 OP체크 항목이 자동으로 준비됩니다.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                  <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">환자 정보</p>
                      <h3 className="mt-1 text-xl font-bold text-[var(--foreground)]">{checkForm.patient_name}</h3>
                      <p className="mt-1 text-sm font-semibold text-[var(--accent)]">{checkForm.surgery_name}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-[var(--toss-gray-3)]">
                        <span className="rounded-full bg-[var(--muted)] px-2 py-1">
                          수술일 {formatDateLabel(checkForm.schedule_date)}
                        </span>
                        <span className="rounded-full bg-[var(--muted)] px-2 py-1">
                          시간 {checkForm.schedule_time || '미정'}
                        </span>
                        <span className="rounded-full bg-[var(--muted)] px-2 py-1">
                          수술실 {checkForm.schedule_room || '미정'}
                        </span>
                        {checkForm.chart_no ? (
                          <span className="rounded-full bg-[var(--muted)] px-2 py-1">차트 {checkForm.chart_no}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                          진행 상태
                          <select
                            data-testid="op-check-status-select"
                            value={checkForm.status}
                            onChange={(event) =>
                              setCheckForm((prev) =>
                                prev ? { ...prev, status: event.target.value } : prev
                              )
                            }
                            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                          >
                            {STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                          마취 유형
                          <input
                            data-testid="op-check-anesthesia-select"
                            list="op-check-anesthesia-options"
                            value={checkForm.anesthesia_type}
                            onChange={(event) =>
                              setCheckForm((prev) =>
                                prev ? { ...prev, anesthesia_type: event.target.value } : prev
                              )
                            }
                            placeholder="예: 전신마취"
                            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          data-testid="op-check-apply-template"
                          onClick={mergeTemplateItemsIntoForm}
                          className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)]"
                        >
                          기본 항목 다시 불러오기
                        </button>
                        <button
                          type="button"
                          data-testid="op-check-record-save"
                          onClick={() => void savePatientCheck()}
                          disabled={savingCheck}
                          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                        >
                          {savingCheck ? '저장 중...' : '환자별 OP체크 저장'}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2 text-[11px] font-medium text-[var(--toss-gray-3)]">
                        <span className="rounded-full bg-[var(--muted)] px-2 py-1">
                          적용 템플릿 {checkForm.applied_template_ids.length}개
                        </span>
                        {selectedSchedule.surgery_fasting ? (
                          <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">금식 환자</span>
                        ) : null}
                        {selectedSchedule.surgery_inpatient ? (
                          <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">입원 환자</span>
                        ) : null}
                        {selectedSchedule.surgery_guardian ? (
                          <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">보호자 동행</span>
                        ) : null}
                        {selectedSchedule.surgery_caregiver ? (
                          <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">간병인 동행</span>
                        ) : null}
                        {selectedSchedule.surgery_transfusion ? (
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">수혈 준비</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-bold text-[var(--foreground)]">수술 전 준비 체크</h4>
                      <p className="text-[12px] font-medium text-[var(--toss-gray-3)]">
                        수술명과 마취 유형 템플릿을 바탕으로 필요한 준비사항을 환자별로 확인합니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid="op-check-prep-add"
                      onClick={() =>
                        updateCheckFormList('prep_items', (items) => [...items, createChecklistItem('patient-prep')])
                      }
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                    >
                      준비항목 추가
                    </button>
                  </div>
                  {renderItemRows(checkForm.prep_items, 'prep', (next) =>
                    updateCheckFormList('prep_items', () => next)
                  )}
                </div>

                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-bold text-[var(--foreground)]">수술 중 의료소모품 사용 체크</h4>
                      <p className="text-[12px] font-medium text-[var(--toss-gray-3)]">
                        실제 사용한 소모품을 체크하고 수량과 메모를 남겨 관리합니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid="op-check-consumable-add"
                      onClick={() =>
                        updateCheckFormList('consumable_items', (items) => [
                          ...items,
                          createChecklistItem('patient-consumable'),
                        ])
                      }
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                    >
                      소모품 추가
                    </button>
                  </div>
                  {renderItemRows(checkForm.consumable_items, 'consumable', (next) =>
                    updateCheckFormList('consumable_items', () => next)
                  )}
                </div>

                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">환자별 메모</label>
                  <textarea
                    value={checkForm.notes}
                    onChange={(event) =>
                      setCheckForm((prev) => (prev ? { ...prev, notes: event.target.value } : prev))
                    }
                    placeholder="수술 전/중 특이사항, 추가 준비 요청, 소모품 사용 메모를 남겨주세요."
                    className="mt-2 min-h-[120px] w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-4 py-3 text-sm font-medium"
                  />
                </div>
              </>
            )}
          </section>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr,0.95fr]">
          <section className="space-y-4">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setTemplateEditor((prev) => ({ ...prev, template_scope: 'surgery', anesthesia_type: '' }))
                  }
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    templateEditor.template_scope === 'surgery'
                      ? 'bg-[var(--accent)] text-white'
                      : 'border border-[var(--border)] text-[var(--toss-gray-4)]'
                  }`}
                >
                  수술 템플릿
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTemplateEditor((prev) => ({
                      ...prev,
                      template_scope: 'anesthesia',
                      surgery_template_id: '',
                      surgery_name: '',
                    }))
                  }
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    templateEditor.template_scope === 'anesthesia'
                      ? 'bg-[var(--accent)] text-white'
                      : 'border border-[var(--border)] text-[var(--toss-gray-4)]'
                  }`}
                >
                  마취 템플릿
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateEditor(emptyTemplateEditor())}
                  className="ml-auto rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                >
                  새 템플릿
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  템플릿 이름
                  <input
                    value={templateEditor.template_name}
                    onChange={(event) =>
                      setTemplateEditor((prev) => ({ ...prev, template_name: event.target.value }))
                    }
                    placeholder="예: 무릎 관절경 기본 준비"
                    className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                  />
                </label>

                {templateEditor.template_scope === 'surgery' ? (
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    연동 수술명
                    <select
                      value={templateEditor.surgery_template_id}
                      onChange={(event) => {
                        const selectedTemplate =
                          surgeryTemplates.find((template) => String(template.id) === event.target.value) || null;
                        setTemplateEditor((prev) => ({
                          ...prev,
                          surgery_template_id: event.target.value,
                          surgery_name: selectedTemplate?.name || prev.surgery_name,
                          template_name: prev.template_name || selectedTemplate?.name || '',
                        }));
                      }}
                      className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                    >
                      <option value="">직접 입력</option>
                      {surgeryTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    마취 유형
                    <input
                      list="op-check-anesthesia-options"
                      value={templateEditor.anesthesia_type}
                      onChange={(event) =>
                        setTemplateEditor((prev) => ({
                          ...prev,
                          anesthesia_type: event.target.value,
                          template_name: prev.template_name || event.target.value,
                        }))
                      }
                      placeholder="예: 전신마취"
                      className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                    />
                  </label>
                )}
              </div>

              {templateEditor.template_scope === 'surgery' ? (
                <label className="mt-3 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  수술명 직접 입력
                  <input
                    value={templateEditor.surgery_name}
                    onChange={(event) =>
                      setTemplateEditor((prev) => ({ ...prev, surgery_name: event.target.value }))
                    }
                    placeholder="수술일정표 제목과 동일하게 입력"
                    className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                  />
                </label>
              ) : null}

              <div className="mt-4 rounded-[var(--radius-lg)] bg-[var(--muted)]/45 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[var(--foreground)]">기본 준비사항</h4>
                  <button
                    type="button"
                    onClick={() =>
                      updateTemplateEditorList('prep_items', (items) => [
                        ...items,
                        createChecklistItem('template-prep'),
                      ])
                    }
                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--card)]"
                  >
                    준비항목 추가
                  </button>
                </div>
                {renderTemplateItemRows(templateEditor.prep_items, 'prep', (next) =>
                  updateTemplateEditorList('prep_items', () => next)
                )}
              </div>

              <div className="mt-4 rounded-[var(--radius-lg)] bg-[var(--muted)]/45 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[var(--foreground)]">기본 의료소모품</h4>
                  <button
                    type="button"
                    onClick={() =>
                      updateTemplateEditorList('consumable_items', (items) => [
                        ...items,
                        createChecklistItem('template-consumable'),
                      ])
                    }
                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--card)]"
                  >
                    소모품 추가
                  </button>
                </div>
                {renderTemplateItemRows(templateEditor.consumable_items, 'consumable', (next) =>
                  updateTemplateEditorList('consumable_items', () => next)
                )}
              </div>

              <label className="mt-4 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
                템플릿 메모
                <textarea
                  value={templateEditor.notes}
                  onChange={(event) =>
                    setTemplateEditor((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  placeholder="수술팀 공통 지침, 마취 준비 참고사항 등을 메모해 주세요."
                  className="mt-1 min-h-[100px] w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3 text-sm font-medium"
                />
              </label>

              <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                <input
                  type="checkbox"
                  checked={templateEditor.is_active}
                  onChange={(event) =>
                    setTemplateEditor((prev) => ({ ...prev, is_active: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
                />
                활성 템플릿으로 사용
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="op-check-template-save"
                  onClick={() => void saveTemplate()}
                  disabled={savingTemplate}
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {savingTemplate ? '저장 중...' : '템플릿 저장'}
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateEditor(emptyTemplateEditor())}
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                >
                  입력 초기화
                </button>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-[var(--foreground)]">저장된 OP체크 템플릿</h3>
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  수술 {templatesByScope.surgery.length} / 마취 {templatesByScope.anesthesia.length}
                </span>
              </div>

              <div className="space-y-3">
                {(['surgery', 'anesthesia'] as const).map((scope) => (
                  <div key={scope}>
                    <p className="mb-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                      {scope === 'surgery' ? '수술 템플릿' : '마취 템플릿'}
                    </p>
                    <div className="space-y-2">
                      {templatesByScope[scope].length === 0 ? (
                        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)]/40 p-4 text-center text-sm font-medium text-[var(--toss-gray-3)]">
                          아직 등록된 템플릿이 없습니다.
                        </div>
                      ) : (
                        templatesByScope[scope].map((template) => (
                          <div
                            key={template.id}
                            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-[var(--foreground)]">
                                  {buildTemplateLabel(template)}
                                </p>
                                <p className="mt-1 text-[12px] font-medium text-[var(--toss-gray-3)]">
                                  준비 {normalizeChecklistItems(template.prep_items, 'list').length}개 · 소모품{' '}
                                  {normalizeChecklistItems(template.consumable_items, 'list').length}개
                                </p>
                              </div>
                              <span
                                className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                  template.is_active === false
                                    ? 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {template.is_active === false ? '비활성' : '활성'}
                              </span>
                            </div>
                            {template.notes ? (
                              <p className="mt-2 line-clamp-2 text-[12px] font-medium text-[var(--toss-gray-3)]">
                                {template.notes}
                              </p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => loadTemplateIntoEditor(template)}
                                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)]"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => void removeTemplate(String(template.id || ''))}
                                className="rounded-full border border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50"
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}

      <datalist id={ITEM_SUGGESTION_ID}>
        {itemSuggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <datalist id="op-check-anesthesia-options">
        {ANESTHESIA_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type TemplateDesign = {
  title?: string;
  subtitle?: string;
  companyLabel?: string;
  primaryColor?: string;
  borderColor?: string;
  footerText?: string;
  showSignArea?: boolean;
  showBackgroundLogo?: boolean;
  backgroundLogoUrl?: string;
  backgroundLogoOpacity?: number;
  showSeal?: boolean;
  sealLabel?: string;
  titleXPercent?: number;
  titleYPercent?: number;
  subtitleXPercent?: number;
  subtitleYPercent?: number;
  signXPercent?: number;
  signYPercent?: number;
};

type FormTypeRow = {
  id: string;
  name: string;
  slug?: string;
  base_slug?: string | null;
  sort_order?: number | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

type TemplateOption = {
  slug: string;
  name: string;
  summary: string;
};

const DEFAULT_LOGO_URL = '/logo.png';
const LOCAL_APPROVAL_FORM_TYPES_KEY = 'erp_approval_form_types_custom';
const LOCAL_FORM_TEMPLATE_DESIGNS_KEY = 'erp_form_template_designs';

const builtinTemplates: TemplateOption[] = [
  { slug: 'leave', name: '연차/휴가', summary: '휴가 일정과 인수인계 내용을 정리하는 기본양식' },
  { slug: 'annual_plan', name: '연차계획서', summary: '연간 휴가 계획을 미리 공유하는 기본양식' },
  { slug: 'overtime', name: '연장근무', summary: '근무 시간과 보상 기준을 기록하는 기본양식' },
  { slug: 'purchase', name: '물품신청', summary: '품목과 수량, 용도를 정리하는 기본양식' },
  { slug: 'repair_request', name: '수리요청서', summary: '시설과 장비 이슈를 접수하는 기본양식' },
  { slug: 'draft_business', name: '업무기안', summary: '업무 보고와 결재안을 작성하는 기본양식' },
  { slug: 'cooperation', name: '업무협조', summary: '부서 간 협조 요청을 전달하는 기본양식' },
  { slug: 'generic', name: '양식신청', summary: '각종 문서 발급을 요청하는 기본양식' },
  { slug: 'attendance_fix', name: '출결정정', summary: '출퇴근 기록 정정 사유를 남기는 기본양식' },
  { slug: 'payroll_slip', name: '급여명세서', summary: '급여 문서 디자인에 쓰는 기본양식' },
];

const DEFAULT_DESIGN: TemplateDesign = {
  title: '전자결재 양식',
  subtitle: '브랜드 기본값이 반영된 프리미엄 결재 문서입니다.',
  companyLabel: 'SY INC.',
  primaryColor: '#163b70',
  borderColor: '#d8e1ee',
  footerText: '기본 서식을 기반으로 한 공식 결재 문서입니다.',
  showSignArea: true,
  showBackgroundLogo: true,
  backgroundLogoUrl: DEFAULT_LOGO_URL,
  backgroundLogoOpacity: 0.06,
  showSeal: true,
  sealLabel: 'SY INC. 직인',
  titleXPercent: 9,
  titleYPercent: 18,
  subtitleXPercent: 9,
  subtitleYPercent: 31,
  signXPercent: 73,
  signYPercent: 77,
};

const BUILTIN_TEMPLATE_DEFAULTS: Record<string, TemplateDesign> = {
  leave: { title: '연차/휴가 신청서', primaryColor: '#0f766e', borderColor: '#d4e8e1', sealLabel: '휴가 확인' },
  annual_plan: { title: '연차 계획서', primaryColor: '#115e59', borderColor: '#d8ebe8', sealLabel: '계획 확인' },
  overtime: { title: '연장근무 신청서', primaryColor: '#9a3412', borderColor: '#f2d8c9', sealLabel: '연장 확인' },
  purchase: { title: '물품 신청서', primaryColor: '#b45309', borderColor: '#f4dec7', sealLabel: '구매 확인' },
  repair_request: { title: '수리 요청서', primaryColor: '#334155', borderColor: '#d8dee8', sealLabel: '수리 접수' },
  draft_business: { title: '업무 기안서', primaryColor: '#1d4ed8', borderColor: '#d7e3fb', sealLabel: '기안 확인' },
  cooperation: { title: '업무 협조 요청서', primaryColor: '#0f766e', borderColor: '#d0e7e2', sealLabel: '협조 확인' },
  generic: { title: '양식 신청서', primaryColor: '#0369a1', borderColor: '#d0e5f0', sealLabel: '양식 확인' },
  attendance_fix: { title: '출결 정정 신청서', primaryColor: '#be123c', borderColor: '#f1cfd7', sealLabel: '정정 확인' },
  payroll_slip: { title: '급여 명세서', primaryColor: '#163b70', borderColor: '#d8e1ee', sealLabel: '급여 직인' },
};

function isMissingTableError(error: any, tableName = 'system_settings') {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === 'PGRST205' || message.includes(tableName.toLowerCase());
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function slugFromName(name: string) {
  return name.replace(/\s+/g, '').replace(/[^\w가-힣a-zA-Z0-9-]/g, '') || 'custom';
}

function alphaColor(hexColor: string | undefined, alpha: number) {
  if (!hexColor) return `rgba(21, 94, 239, ${alpha})`;
  const cleaned = hexColor.replace('#', '');
  const expanded = cleaned.length === 3
    ? cleaned.split('').map((char) => `${char}${char}`).join('')
    : cleaned;

  if (expanded.length !== 6) return `rgba(21, 94, 239, ${alpha})`;

  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createDefaultDesignMap() {
  return builtinTemplates.reduce<Record<string, TemplateDesign>>((acc, template) => {
    const preset = BUILTIN_TEMPLATE_DEFAULTS[template.slug] || {};
    const companyLabel = preset.companyLabel || DEFAULT_DESIGN.companyLabel || 'SY INC.';

    acc[template.slug] = {
      ...DEFAULT_DESIGN,
      ...preset,
      title: preset.title || template.name,
      subtitle: preset.subtitle || template.summary,
      companyLabel,
      backgroundLogoUrl: DEFAULT_LOGO_URL,
      backgroundLogoOpacity: preset.backgroundLogoOpacity ?? DEFAULT_DESIGN.backgroundLogoOpacity,
      sealLabel: preset.sealLabel || `${companyLabel} 직인`,
    };

    return acc;
  }, {});
}

function mergeWithDefaultDesigns(stored: Record<string, any> | null | undefined) {
  const defaults = createDefaultDesignMap();
  const nextDesigns: Record<string, TemplateDesign> = { ...defaults };

  Object.entries(stored || {}).forEach(([slug, value]) => {
    const patch = typeof value === 'object' && value ? value : {};
    const merged = {
      ...(defaults[slug] || DEFAULT_DESIGN),
      ...patch,
    } as TemplateDesign;

    const companyLabel = merged.companyLabel || defaults[slug]?.companyLabel || DEFAULT_DESIGN.companyLabel || 'SY INC.';

    nextDesigns[slug] = {
      ...merged,
      companyLabel,
      backgroundLogoUrl: merged.backgroundLogoUrl || defaults[slug]?.backgroundLogoUrl || DEFAULT_LOGO_URL,
      backgroundLogoOpacity:
        merged.backgroundLogoOpacity
        ?? defaults[slug]?.backgroundLogoOpacity
        ?? DEFAULT_DESIGN.backgroundLogoOpacity,
      sealLabel: merged.sealLabel || defaults[slug]?.sealLabel || `${companyLabel} 직인`,
      showBackgroundLogo: merged.showBackgroundLogo ?? true,
      showSeal: merged.showSeal ?? true,
      showSignArea: merged.showSignArea ?? true,
    };
  });

  return nextDesigns;
}

function resolveCurrentDesign(
  selectedSlug: string | null,
  selectedName: string,
  designs: Record<string, TemplateDesign>
) {
  const defaults = createDefaultDesignMap();
  const preset = selectedSlug ? defaults[selectedSlug] : undefined;
  const saved = selectedSlug ? designs[selectedSlug] : undefined;
  const merged = {
    ...DEFAULT_DESIGN,
    ...(preset || {}),
    ...(saved || {}),
  };
  const companyLabel = merged.companyLabel || DEFAULT_DESIGN.companyLabel || 'SY INC.';

  return {
    ...merged,
    title: merged.title || selectedName || DEFAULT_DESIGN.title,
    subtitle: merged.subtitle || preset?.subtitle || DEFAULT_DESIGN.subtitle,
    companyLabel,
    backgroundLogoUrl: merged.backgroundLogoUrl || preset?.backgroundLogoUrl || DEFAULT_LOGO_URL,
    backgroundLogoOpacity:
      merged.backgroundLogoOpacity
      ?? preset?.backgroundLogoOpacity
      ?? DEFAULT_DESIGN.backgroundLogoOpacity,
    sealLabel: merged.sealLabel || preset?.sealLabel || `${companyLabel} 직인`,
    showBackgroundLogo: merged.showBackgroundLogo ?? true,
    showSeal: merged.showSeal ?? true,
    showSignArea: merged.showSignArea ?? true,
  } satisfies TemplateDesign;
}

async function persistDesigns(designs: Record<string, TemplateDesign>) {
  writeLocal(LOCAL_FORM_TEMPLATE_DESIGNS_KEY, designs);
  const result = await supabase
    .from('system_settings')
    .upsert(
      {
        key: 'form_template_designs',
        value: JSON.stringify(designs),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

  if (isMissingTableError(result.error, 'system_settings')) {
    return { data: designs, error: null } as unknown as typeof result;
  }

  return result;
}

export default function ApprovalFormTypesManager() {
  const [list, setList] = useState<FormTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [designLoading, setDesignLoading] = useState(true);
  const [savingDesign, setSavingDesign] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [addName, setAddName] = useState('');
  const [addSlug, setAddSlug] = useState('');
  const [addBaseSlug, setAddBaseSlug] = useState(builtinTemplates[0]?.slug || '');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(builtinTemplates[0]?.slug || null);
  const [selectedName, setSelectedName] = useState(builtinTemplates[0]?.name || '연차/휴가');
  const [designs, setDesigns] = useState<Record<string, TemplateDesign>>({});
  const [activeHandle, setActiveHandle] = useState<'title' | 'subtitle' | 'sign'>('title');
  const previewRef = useRef<HTMLDivElement | null>(null);
  const selectedBaseTemplate = useMemo(
    () => builtinTemplates.find((template) => template.slug === addBaseSlug) ?? builtinTemplates[0],
    [addBaseSlug]
  );

  const customTemplates = useMemo(
    () =>
      list
        .filter((row) => row.is_active !== false)
        .filter((row) => !builtinTemplates.some((template) => template.slug === row.slug))
        .map((row) => ({
          slug: row.slug || row.id,
          name: row.name,
          summary: row.base_slug
            ? `${builtinTemplates.find((template) => template.slug === row.base_slug)?.name || '기본양식'} 기반 추가 양식`
            : '기본양식을 복제해서 만든 추가 양식',
        })),
    [list]
  );

  const combinedTemplates = useMemo(
    () => [...builtinTemplates, ...customTemplates],
    [customTemplates]
  );

  const currentDesign = useMemo(
    () => resolveCurrentDesign(selectedSlug, selectedName, designs),
    [designs, selectedName, selectedSlug]
  );

  const syncListState = (next: FormTypeRow[]) => {
    writeLocal(LOCAL_APPROVAL_FORM_TYPES_KEY, next);
    setList(next);
  };

  useEffect(() => {
    const loadList = async () => {
      const localRows = readLocal<FormTypeRow[]>(LOCAL_APPROVAL_FORM_TYPES_KEY, []);

      try {
        const { data, error } = await supabase
          .from('approval_form_types')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });

        if (!error && Array.isArray(data)) {
          const map = new Map<string, FormTypeRow>();
          [...(data as FormTypeRow[]), ...localRows].forEach((row) => {
            const key = row.slug || row.id;
            if (!map.has(key)) {
              map.set(key, row);
            }
          });
          setList(Array.from(map.values()));
          return;
        }

        if (error && !isMissingTableError(error, 'approval_form_types')) {
          console.warn('approval_form_types load failed:', error);
        }
      } catch (error) {
        console.warn('approval_form_types load failed:', error);
      } finally {
        setLoading(false);
      }

      setList(localRows);
    };

    const loadSavedDesigns = async () => {
      try {
        const localDesigns = readLocal<Record<string, TemplateDesign>>(LOCAL_FORM_TEMPLATE_DESIGNS_KEY, {});
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'form_template_designs')
          .maybeSingle();

        let parsed = localDesigns;
        if (!error && data?.value) {
          parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          writeLocal(LOCAL_FORM_TEMPLATE_DESIGNS_KEY, parsed);
        } else if (error && !isMissingTableError(error, 'system_settings')) {
          throw error;
        }

        setDesigns(mergeWithDefaultDesigns(parsed));
      } catch (error) {
        console.error(error);
        setDesigns(createDefaultDesignMap());
      } finally {
        setDesignLoading(false);
      }
    };

    void loadList();
    void loadSavedDesigns();
  }, []);

  useEffect(() => {
    if (!selectedSlug) return;
    const selectedTemplate = combinedTemplates.find((template) => template.slug === selectedSlug);
    if (selectedTemplate) {
      if (selectedTemplate.name !== selectedName) {
        setSelectedName(selectedTemplate.name);
      }
      return;
    }

    if (builtinTemplates[0]) {
      setSelectedSlug(builtinTemplates[0].slug);
      setSelectedName(builtinTemplates[0].name);
    }
  }, [combinedTemplates, selectedName, selectedSlug]);

  const handleSelectTemplate = (slug: string, name: string) => {
    setSelectedSlug(slug);
    setSelectedName(name);
  };

  const updateCurrentDesign = (field: keyof TemplateDesign, value: string | boolean | number) => {
    if (!selectedSlug) return;

    setDesigns((prev) => {
      const current = resolveCurrentDesign(selectedSlug, selectedName, prev);
      const nextEntry: TemplateDesign = { ...current, [field]: value };

      if (field === 'companyLabel' && typeof value === 'string') {
        const nextCompany = value.trim() || 'SY INC.';
        if (!current.sealLabel || current.sealLabel === `${current.companyLabel || 'SY INC.'} 직인`) {
          nextEntry.sealLabel = `${nextCompany} 직인`;
        }
      }

      return { ...prev, [selectedSlug]: nextEntry };
    });
  };

  const handleAdd = async () => {
    const name = addName.trim();
    if (!name) return alert('양식 이름을 입력해 주세요.');

    const baseTemplate = builtinTemplates.find((template) => template.slug === addBaseSlug) ?? builtinTemplates[0];
    const slug = (addSlug.trim() || slugFromName(name)).slice(0, 50);

    if (builtinTemplates.some((template) => template.slug === slug || template.name === name)) {
      return alert('기본양식과 같은 이름이나 코드로는 추가할 수 없습니다.');
    }
    if (list.some((row) => row.slug === slug || row.name === name)) {
      return alert('같은 이름 또는 코드의 추가 양식이 이미 있습니다.');
    }

    const nextDesigns = {
      ...designs,
      [slug]: {
        ...resolveCurrentDesign(baseTemplate.slug, baseTemplate.name, designs),
        title: name,
      },
    };

    const { error: designError } = await persistDesigns(nextDesigns);
    if (designError) {
      return alert('기본양식 복제에 실패했습니다: ' + designError.message);
    }

    const nextRows = [
      ...list,
      {
        id: globalThis.crypto?.randomUUID?.() || `local-${Date.now()}`,
        name,
        slug,
        base_slug: baseTemplate.slug,
        sort_order: list.length,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    setDesigns(nextDesigns);
    syncListState(nextRows);
    setAddName('');
    setAddSlug('');
    setSelectedSlug(slug);
    setSelectedName(name);
  };

  const startEdit = (row: FormTypeRow) => {
    setEditingId(row.id);
    setEditName(row.name);
    setEditSlug(row.slug || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const name = editName.trim();
    if (!name) return alert('양식 이름을 입력해 주세요.');

    const slug = (editSlug.trim() || slugFromName(name)).slice(0, 50);
    const currentRow = list.find((row) => row.id === editingId);
    if (!currentRow) return;
    if (list.some((row) => row.id !== editingId && (row.slug === slug || row.name === name))) {
      return alert('같은 이름 또는 코드의 추가 양식이 이미 있습니다.');
    }

    const previousSlug = currentRow.slug || currentRow.id;
    if (previousSlug !== slug && designs[previousSlug]) {
      const nextDesigns = { ...designs, [slug]: { ...designs[previousSlug], title: name } };
      delete nextDesigns[previousSlug];
      const { error } = await persistDesigns(nextDesigns);
      if (error) {
        return alert('양식 디자인 이동에 실패했습니다: ' + error.message);
      }
      setDesigns(nextDesigns);
    }

    const nextRows = list.map((row) =>
      row.id === editingId ? { ...row, name, slug, updated_at: new Date().toISOString() } : row
    );
    syncListState(nextRows);
    setEditingId(null);

    if (selectedSlug === previousSlug || selectedSlug === slug) {
      setSelectedSlug(slug);
      setSelectedName(name);
    }
  };

  const toggleActive = (row: FormTypeRow) => {
    const nextRows = list.map((item) =>
      item.id === row.id ? { ...item, is_active: !row.is_active, updated_at: new Date().toISOString() } : item
    );
    syncListState(nextRows);
  };

  const handleDelete = async (row: FormTypeRow) => {
    if (!confirm('이 추가 양식을 삭제하시겠습니까?')) return;

    const key = row.slug || row.id;
    if (designs[key]) {
      const nextDesigns = { ...designs };
      delete nextDesigns[key];
      const { error } = await persistDesigns(nextDesigns);
      if (error) {
        return alert('양식 디자인 정리에 실패했습니다: ' + error.message);
      }
      setDesigns(nextDesigns);
    }

    syncListState(list.filter((item) => item.id !== row.id));

    if (selectedSlug === key) {
      setSelectedSlug(builtinTemplates[0]?.slug || null);
      setSelectedName(builtinTemplates[0]?.name || '');
    }
  };

  const handleSaveDesign = async () => {
    if (!selectedSlug) return;

    setSavingDesign(true);
    try {
      const { error } = await persistDesigns(designs);
      if (error) {
        alert('디자인 저장에 실패했습니다: ' + error.message);
        return;
      }

      alert('선택한 디자인이 저장되었습니다.');
    } finally {
      setSavingDesign(false);
    }
  };

  return (
    <div className="max-w-6xl space-y-8">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-[var(--foreground)]">기본양식 관리</h2>
        <p className="text-sm leading-6 text-[var(--toss-gray-3)]">
          예전처럼 양식빌더, 문서양식, 결재양식을 나누지 않고 기본양식을 기준으로 바로 보고 추가하도록 정리했습니다.
        </p>
      </div>

      <section className="rounded-[24px] border border-[var(--toss-border)] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">기본양식</h3>
            <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
              새 양식을 만들 때 기준이 되는 기본양식입니다.
            </p>
          </div>
          <div className="rounded-full bg-[var(--toss-gray-1)] px-4 py-2 text-xs font-semibold text-[var(--toss-gray-4)]">
            총 {builtinTemplates.length}개
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {builtinTemplates.map((template) => {
            const isBase = addBaseSlug === template.slug;
            const isSelected = selectedSlug === template.slug;

            return (
              <button
                key={template.slug}
                type="button"
                onClick={() => {
                  setAddBaseSlug(template.slug);
                  handleSelectTemplate(template.slug, template.name);
                }}
                className={`rounded-[20px] border p-4 text-left transition-all ${
                  isBase || isSelected
                    ? 'border-blue-200 bg-[var(--toss-blue-light)]/70 shadow-sm'
                    : 'border-[var(--toss-border)] hover:border-blue-100 hover:bg-[var(--toss-gray-1)]/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">{template.name}</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--toss-gray-3)]">{template.summary}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${isBase ? 'bg-[var(--toss-blue)] text-white' : 'bg-blue-50 text-blue-600'}`}>
                    {isBase ? '추가 기준' : '기본양식'}
                  </span>
                </div>
                {isSelected && (
                  <div className="mt-3 text-[11px] font-semibold text-[var(--toss-blue)]">현재 수정 중</div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[24px] border border-[var(--toss-border)] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">기본양식 기반 양식 추가</h3>
            <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
              선택한 기본양식을 복제해서 새 결재양식을 만들고, 아래에서 이어서 수정합니다.
            </p>
          </div>
          <div className="rounded-full bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700">
            현재 기준: {selectedBaseTemplate?.name || '기본양식'}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1">
            <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">기준 기본양식</span>
            <select
              value={addBaseSlug}
              onChange={(e) => setAddBaseSlug(e.target.value)}
              className="w-full rounded-[16px] border border-[var(--toss-border)] px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
            >
              {builtinTemplates.map((template) => (
                <option key={template.slug} value={template.slug}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[220px] flex-[1.2]">
            <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">추가할 양식 이름</span>
            <input
              type="text"
              value={addName}
              onChange={(e) => {
                setAddName(e.target.value);
                if (!addSlug) setAddSlug(slugFromName(e.target.value));
              }}
              placeholder="예: 외부출장 신청서"
              className="w-full rounded-[16px] border border-[var(--toss-border)] px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>

          <label className="min-w-[180px] flex-1">
            <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">양식 코드</span>
            <input
              type="text"
              value={addSlug}
              onChange={(e) => setAddSlug(e.target.value)}
              placeholder="자동 생성 또는 직접 입력"
              className="w-full rounded-[16px] border border-[var(--toss-border)] px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>

          <button
            type="button"
            onClick={handleAdd}
            className="rounded-[16px] bg-[var(--toss-blue)] px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            기본양식으로 추가
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-[var(--toss-border)] bg-white shadow-sm">
        <div className="border-b border-[var(--toss-border)] px-6 py-4">
          <h3 className="text-base font-semibold text-[var(--foreground)]">기본양식 기반 추가 양식</h3>
          <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
            추가 양식은 모두 기본양식 복제본입니다.
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--toss-gray-3)]">양식을 불러오는 중입니다...</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--toss-gray-3)]">
            아직 추가된 양식이 없습니다. 위에서 기본양식을 선택해 새 양식을 추가해 주세요.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--toss-border)]">
            {list.map((row) => {
              const baseName = builtinTemplates.find((template) => template.slug === row.base_slug)?.name;

              return (
                <li key={row.id} className="px-6 py-4 hover:bg-[var(--toss-gray-1)]/50">
                  {editingId === row.id ? (
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="min-w-[180px] flex-[1.2]">
                        <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">양식 이름</span>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-[14px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold"
                        />
                      </label>
                      <label className="min-w-[180px] flex-1">
                        <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">양식 코드</span>
                        <input
                          value={editSlug}
                          onChange={(e) => setEditSlug(e.target.value)}
                          className="w-full rounded-[14px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold"
                        />
                      </label>
                      <button type="button" onClick={saveEdit} className="rounded-[14px] bg-[var(--toss-blue)] px-4 py-2 text-xs font-bold text-white">
                        저장
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-[14px] bg-[var(--toss-gray-2)] px-4 py-2 text-xs font-bold text-[var(--foreground)]">
                        취소
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-[220px] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-[var(--foreground)]">{row.name}</span>
                          <span className="text-xs text-[var(--toss-gray-3)]">{row.slug}</span>
                          {!row.is_active && (
                            <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-600">비활성</span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--toss-gray-3)]">
                          <span className="rounded-full bg-[var(--toss-gray-1)] px-2.5 py-1 font-semibold">
                            {baseName ? `${baseName} 기반` : '기본양식 기반'}
                          </span>
                          <span>디자인은 아래에서 이어서 수정할 수 있습니다.</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => handleSelectTemplate(row.slug || row.id, row.name)} className="rounded-[14px] bg-[var(--toss-gray-1)] px-3 py-2 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--toss-gray-2)]">
                          수정 열기
                        </button>
                        <button type="button" onClick={() => toggleActive(row)} className="rounded-[14px] bg-[var(--toss-gray-1)] px-3 py-2 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--toss-gray-2)]">
                          {row.is_active === false ? '활성화' : '비활성'}
                        </button>
                        <button type="button" onClick={() => startEdit(row)} className="rounded-[14px] bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800">
                          이름/코드 수정
                        </button>
                        <button type="button" onClick={() => handleDelete(row)} className="rounded-[14px] bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                          삭제
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-[24px] border border-[var(--toss-border)] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">양식 디자인 수정</h3>
            <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
              기본양식이나 추가 양식을 선택한 뒤 제목과 색상, 문구를 바로 수정할 수 있습니다.
            </p>
          </div>
          {designLoading && <span className="text-xs font-semibold text-[var(--toss-gray-3)]">디자인 불러오는 중...</span>}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">수정할 양식 선택</p>
            <div className="max-h-[520px] overflow-y-auto rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)]/60 custom-scrollbar">
              <ul className="divide-y divide-[var(--toss-border)]">
                {combinedTemplates.map((template) => {
                  const isBuiltin = builtinTemplates.some((item) => item.slug === template.slug);
                  const active = selectedSlug === template.slug;

                  return (
                    <li key={template.slug}>
                      <button
                        type="button"
                        onClick={() => handleSelectTemplate(template.slug, template.name)}
                        className={`w-full px-4 py-3 text-left transition-all ${active ? 'bg-white shadow-sm ring-1 ring-blue-100' : 'hover:bg-white/80'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`truncate text-[13px] font-bold ${active ? 'text-[var(--toss-blue)]' : 'text-[var(--foreground)]'}`}>{template.name}</p>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--toss-gray-3)]">{template.summary}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${isBuiltin ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                            {isBuiltin ? '기본양식' : '추가 양식'}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">선택한 양식</p>
                <p className="text-sm font-semibold text-[var(--foreground)]">{selectedName}</p>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-1 py-1">
                {(['title', 'subtitle', 'sign'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveHandle(key)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${activeHandle === key ? 'bg-[var(--toss-blue)] text-white' : 'text-[var(--toss-gray-3)] hover:bg-white'}`}
                  >
                    {key === 'title' && '제목'}
                    {key === 'subtitle' && '부제'}
                    {key === 'sign' && '서명'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">제목</span>
                <input type="text" value={currentDesign.title || ''} onChange={(e) => updateCurrentDesign('title', e.target.value)} className="rounded-[16px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">부제</span>
                <input type="text" value={currentDesign.subtitle || ''} onChange={(e) => updateCurrentDesign('subtitle', e.target.value)} className="rounded-[16px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">회사명 라벨</span>
                <input type="text" value={currentDesign.companyLabel || ''} onChange={(e) => updateCurrentDesign('companyLabel', e.target.value)} className="rounded-[16px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">직인 문구</span>
                <input type="text" value={currentDesign.sealLabel || ''} onChange={(e) => updateCurrentDesign('sealLabel', e.target.value)} className="rounded-[16px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">대표 색상</span>
                <input type="text" value={currentDesign.primaryColor || ''} onChange={(e) => updateCurrentDesign('primaryColor', e.target.value)} className="rounded-[16px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">하단 문구</span>
                <input type="text" value={currentDesign.footerText || ''} onChange={(e) => updateCurrentDesign('footerText', e.target.value)} className="rounded-[16px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold" />
              </label>
            </div>

            <div className="rounded-[24px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-4">
              <p className="mb-3 text-[11px] text-[var(--toss-gray-3)]">미리보기를 클릭하면 선택한 요소 위치가 바뀝니다.</p>
              <div
                ref={previewRef}
                className="relative h-[320px] cursor-pointer overflow-hidden rounded-[24px] border bg-white"
                style={{ borderColor: currentDesign.borderColor || '#d7e3ff' }}
                onClick={(event) => {
                  if (!previewRef.current || !selectedSlug) return;
                  const rect = previewRef.current.getBoundingClientRect();
                  const x = Number((((event.clientX - rect.left) / rect.width) * 100).toFixed(1));
                  const y = Number((((event.clientY - rect.top) / rect.height) * 100).toFixed(1));
                  const safeX = Math.max(0, Math.min(100, x));
                  const safeY = Math.max(0, Math.min(100, y));

                  if (activeHandle === 'title') {
                    updateCurrentDesign('titleXPercent', safeX);
                    updateCurrentDesign('titleYPercent', safeY);
                  } else if (activeHandle === 'subtitle') {
                    updateCurrentDesign('subtitleXPercent', safeX);
                    updateCurrentDesign('subtitleYPercent', safeY);
                  } else {
                    updateCurrentDesign('signXPercent', safeX);
                    updateCurrentDesign('signYPercent', safeY);
                  }
                }}
              >
                <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, #ffffff 0%, ${alphaColor(currentDesign.primaryColor, 0.03)} 100%)` }} />
                <div className="absolute inset-x-0 top-0 h-24" style={{ background: `linear-gradient(135deg, ${alphaColor(currentDesign.primaryColor, 0.18)} 0%, rgba(255,255,255,0) 75%)` }} />
                <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl" style={{ backgroundColor: alphaColor(currentDesign.primaryColor, 0.12) }} />
                <div className="absolute -left-8 bottom-10 h-24 w-24 rounded-full blur-2xl" style={{ backgroundColor: alphaColor(currentDesign.primaryColor, 0.08) }} />
                {currentDesign.showBackgroundLogo !== false && currentDesign.backgroundLogoUrl && (
                  <img
                    src={currentDesign.backgroundLogoUrl}
                    alt=""
                    className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 object-contain mix-blend-multiply"
                    style={{ opacity: currentDesign.backgroundLogoOpacity ?? 0.06 }}
                  />
                )}
                <div className="absolute left-6 top-6 rounded-full border border-white/70 bg-white/90 px-3 py-1 text-[10px] font-black tracking-[0.18em] text-[var(--toss-gray-4)] shadow-sm">
                  기본 양식
                </div>
                <div className="absolute text-xl font-black" style={{ top: `${currentDesign.titleYPercent ?? 16}%`, left: `${currentDesign.titleXPercent ?? 10}%`, color: currentDesign.primaryColor || '#155eef' }}>
                  {currentDesign.title || '양식 제목'}
                </div>
                <div className="absolute max-w-[70%]" style={{ top: `${currentDesign.subtitleYPercent ?? 30}%`, left: `${currentDesign.subtitleXPercent ?? 10}%` }}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">{currentDesign.companyLabel || 'SY INC.'}</div>
                  <div className="mt-1 text-[13px] leading-6 text-[var(--toss-gray-4)]">{currentDesign.subtitle || '부제 또는 설명'}</div>
                </div>
                <div className="absolute inset-x-6 bottom-8 flex items-end justify-between gap-6 border-t pt-4 text-[11px] text-[var(--toss-gray-3)]" style={{ borderColor: alphaColor(currentDesign.borderColor, 0.9) }}>
                  <div className="max-w-[60%]">
                    <p className="font-semibold tracking-[0.18em]" style={{ color: currentDesign.primaryColor || '#155eef' }}>전자결재 문서</p>
                    <p className="mt-2">{currentDesign.footerText || '기본 하단 문구가 여기에 표시됩니다.'}</p>
                  </div>
                  {currentDesign.showSeal !== false && (
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-[3px] bg-white/95 text-center text-[10px] font-black shadow-sm" style={{ borderColor: alphaColor(currentDesign.primaryColor, 0.7), color: currentDesign.primaryColor || '#155eef' }}>
                      {currentDesign.sealLabel || `${currentDesign.companyLabel || 'SY INC.'} 직인`}
                    </div>
                  )}
                </div>
                {currentDesign.showSignArea !== false && (
                  <div className="absolute rounded-[18px] border border-dashed bg-white/90 px-4 py-3 text-[11px] text-[var(--toss-gray-4)] shadow-sm" style={{ top: `${currentDesign.signYPercent ?? 78}%`, left: `${currentDesign.signXPercent ?? 74}%` }}>
                    서명: ____________________
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={handleSaveDesign} disabled={savingDesign} className="rounded-[16px] bg-[var(--toss-blue)] px-5 py-2.5 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {savingDesign ? '디자인 저장 중...' : '선택한 디자인 저장'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

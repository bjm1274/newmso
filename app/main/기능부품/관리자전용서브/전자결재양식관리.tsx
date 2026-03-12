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
  // 미리보기에서 제목 위치(%) – 마우스로 클릭해서 조정
  titleXPercent?: number;
  titleYPercent?: number;
  // 부제 위치
  subtitleXPercent?: number;
  subtitleYPercent?: number;
  // 서명 영역 위치
  signXPercent?: number;
  signYPercent?: number;
};

type FormTypeRow = {
  id: string;
  name: string;
  slug?: string;
  sort_order?: number | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

const DEFAULT_LOGO_URL = '/sy-logo.png';

const DEFAULT_DESIGN: TemplateDesign = {
  title: '전자결재 양식',
  subtitle: '브랜드가 적용된 기본 결재 문서',
  companyLabel: 'SY INC.',
  primaryColor: '#155eef',
  borderColor: '#d7e3ff',
  footerText: '본 문서는 시스템 기본 브랜딩이 적용된 전자결재 양식입니다.',
  showSignArea: true,
  showBackgroundLogo: true,
  backgroundLogoUrl: DEFAULT_LOGO_URL,
  backgroundLogoOpacity: 0.08,
  showSeal: true,
  sealLabel: 'SY INC. 직인',
  titleXPercent: 9,
  titleYPercent: 14,
  subtitleXPercent: 9,
  subtitleYPercent: 27,
  signXPercent: 79,
  signYPercent: 78,
};

const builtinTemplates = [
  { slug: 'leave', name: '연차/휴가', summary: '휴가 일정과 인수인계를 함께 확인하는 기본 양식' },
  { slug: 'annual_plan', name: '연차계획서', summary: '월간 휴가 계획을 미리 공유하는 계획형 양식' },
  { slug: 'overtime', name: '연장근무', summary: '근무 시간과 보상 기준을 한 번에 담는 양식' },
  { slug: 'purchase', name: '물품신청', summary: '품목, 수량, 재고를 함께 보여주는 운영 양식' },
  { slug: 'repair_request', name: '수리요청서', summary: '시설·장비 이상을 빠르게 전달하는 요청 양식' },
  { slug: 'draft_business', name: '업무기안', summary: '핵심 결론과 실행안을 앞세운 보고형 양식' },
  { slug: 'cooperation', name: '업무협조', summary: '부서 간 협업 요청을 명확히 전달하는 양식' },
  { slug: 'generic', name: '양식신청', summary: '증명서 및 신규 문서 발급 요청용 기본 양식' },
  { slug: 'attendance_fix', name: '출결정정', summary: '출퇴근 기록 정정 사유를 정리하는 양식' },
  { slug: 'payroll_slip', name: '급여명세서', summary: '브랜드가 적용된 현대식 급여 문서 기본 서식' },
];

const BUILTIN_TEMPLATE_DEFAULTS: Record<string, TemplateDesign> = {
  leave: {
    title: '연차 · 휴가 신청서',
    subtitle: '일정, 인수인계, 승인 흐름을 한 번에 정리하는 기본 양식',
    primaryColor: '#0f766e',
    borderColor: '#cce7df',
    footerText: '휴가 일정과 인수인계 내용은 승인 즉시 관련 부서와 공유됩니다.',
    sealLabel: '휴가 승인',
  },
  annual_plan: {
    title: '연차 사용 계획서',
    subtitle: '월간 휴가 계획을 미리 공유하는 계획형 문서',
    primaryColor: '#0f766e',
    borderColor: '#d7eee8',
    footerText: '계획서는 연차 잔여일수와 함께 보관되며 팀 일정 조율에 사용됩니다.',
    sealLabel: '계획 확인',
  },
  overtime: {
    title: '연장근무 신청서',
    subtitle: '근무 시간, 사유, 보상 기준을 명확히 남기는 현대식 양식',
    primaryColor: '#7c3aed',
    borderColor: '#e3d4ff',
    footerText: '연장근무 내역은 근태 및 급여 정산 데이터와 함께 반영됩니다.',
    sealLabel: '연장 승인',
  },
  purchase: {
    title: '물품 신청서',
    subtitle: '품목, 수량, 현재 재고를 함께 확인하는 운영형 양식',
    primaryColor: '#ea580c',
    borderColor: '#ffd7bf',
    footerText: '신청 품목은 재고 현황과 연동되어 경영지원팀 확인 후 처리됩니다.',
    sealLabel: '구매 승인',
  },
  repair_request: {
    title: '시설 · 장비 수리 요청서',
    subtitle: '문제 위치와 긴급도를 빠르게 공유하는 실무형 양식',
    primaryColor: '#1f2937',
    borderColor: '#d6d9e0',
    footerText: '수리 요청은 접수 즉시 우선순위와 담당 부서가 지정됩니다.',
    sealLabel: '수리 접수',
  },
  draft_business: {
    title: '업무 기안서',
    subtitle: '핵심 결론과 실행안을 먼저 보여주는 보고형 양식',
    primaryColor: '#2563eb',
    borderColor: '#d4e2ff',
    footerText: '기안 내용은 결재선 승인 후 관련 부서 실행 문서로 이어집니다.',
    sealLabel: '기안 승인',
  },
  cooperation: {
    title: '업무 협조 요청서',
    subtitle: '부서 간 협업 요청을 명확한 일정과 함께 전달하는 양식',
    primaryColor: '#0891b2',
    borderColor: '#c8ecf6',
    footerText: '협조 요청은 요청 부서와 수신 부서 모두의 업무 히스토리에 기록됩니다.',
    sealLabel: '협조 승인',
  },
  generic: {
    title: '양식 신청서',
    subtitle: '증명서 발급 및 신규 문서 요청을 위한 기본 신청 양식',
    primaryColor: '#4f46e5',
    borderColor: '#d9d8ff',
    footerText: '양식 신청 승인 후 필요한 문서 발급 또는 템플릿 생성이 이어집니다.',
    sealLabel: '양식 승인',
  },
  attendance_fix: {
    title: '출결 정정 신청서',
    subtitle: '누락된 출퇴근 기록과 정정 사유를 명확히 남기는 양식',
    primaryColor: '#dc2626',
    borderColor: '#f7c9c9',
    footerText: '정정 승인 결과는 출결 기록과 근태 분석 데이터에 반영됩니다.',
    sealLabel: '정정 승인',
  },
  payroll_slip: {
    title: '급여명세서',
    subtitle: '월별 지급 · 공제 내역을 현대적인 레이아웃으로 보여주는 기본 서식',
    primaryColor: '#155eef',
    borderColor: '#d7e3ff',
    footerText: '급여 마감 기준으로 자동 생성되며 회사 로고와 직인이 함께 적용됩니다.',
    sealLabel: '급여 직인',
  },
};

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
      backgroundLogoUrl: preset.backgroundLogoUrl || DEFAULT_LOGO_URL,
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
      backgroundLogoOpacity: merged.backgroundLogoOpacity ?? defaults[slug]?.backgroundLogoOpacity ?? DEFAULT_DESIGN.backgroundLogoOpacity,
      sealLabel: merged.sealLabel || defaults[slug]?.sealLabel || `${companyLabel} 직인`,
      showBackgroundLogo: merged.showBackgroundLogo ?? true,
      showSeal: merged.showSeal ?? true,
      showSignArea: merged.showSignArea ?? true,
    };
  });

  return {
    designs: nextDesigns,
    changed: JSON.stringify(nextDesigns) !== JSON.stringify(stored || {}),
  };
}

/** 관리자: 전자결재 서식/양식 + 디자인 통합 관리 */
const LOCAL_APPROVAL_FORM_TYPES_KEY = 'erp_approval_form_types_custom';
const LOCAL_FORM_TEMPLATE_DESIGNS_KEY = 'erp_form_template_designs';

function isMissingTableError(error: any, tableName = 'system_settings') {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === 'PGRST205' || message.includes(tableName.toLowerCase());
}

function readLocalDesigns() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_FORM_TEMPLATE_DESIGNS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalDesigns(designs: Record<string, TemplateDesign>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_FORM_TEMPLATE_DESIGNS_KEY, JSON.stringify(designs));
  } catch {
    // ignore
  }
}

async function persistDesigns(designs: Record<string, TemplateDesign>) {
  writeLocalDesigns(designs);
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
    backgroundLogoOpacity: merged.backgroundLogoOpacity ?? preset?.backgroundLogoOpacity ?? DEFAULT_DESIGN.backgroundLogoOpacity,
    sealLabel: merged.sealLabel || preset?.sealLabel || `${companyLabel} 직인`,
    showBackgroundLogo: merged.showBackgroundLogo ?? true,
    showSeal: merged.showSeal ?? true,
    showSignArea: merged.showSignArea ?? true,
  } satisfies TemplateDesign;
}

export default function ApprovalFormTypesManager() {
  const [list, setList] = useState<FormTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [addName, setAddName] = useState('');
  const [addSlug, setAddSlug] = useState('');

  // 서식 디자인 관리용 상태
  const [designs, setDesigns] = useState<Record<string, TemplateDesign>>({});
  const [designLoading, setDesignLoading] = useState(true);
  const [savingDesign, setSavingDesign] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(builtinTemplates[0]?.slug || null);
  const [selectedName, setSelectedName] = useState<string>(builtinTemplates[0]?.name || '연차/휴가');
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [activeHandle, setActiveHandle] = useState<'title' | 'subtitle' | 'sign'>('title');

  const fetchList = async () => {
    setLoading(true);
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(LOCAL_APPROVAL_FORM_TYPES_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        setList(Array.isArray(parsed) ? parsed : []);
      } catch {
        setList([]);
      }
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('approval_form_types')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (!error) setList(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchList();
  }, []);

  // 디자인 전체 로딩
  useEffect(() => {
    const loadDesigns = async () => {
      try {
        const localDesigns = readLocalDesigns();
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'form_template_designs')
          .maybeSingle();

        let parsed = localDesigns || {};
        if (!error && data?.value) {
          parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          writeLocalDesigns(parsed);
        } else if (error && !isMissingTableError(error, 'system_settings')) {
          throw error;
        }

        const { designs: mergedDesigns, changed } = mergeWithDefaultDesigns(parsed);
        setDesigns(mergedDesigns);

        if (changed) {
          const { error: saveError } = await persistDesigns(mergedDesigns);
          if (saveError) {
            console.warn('양식 기본 브랜딩 저장 실패:', saveError);
          }
        }
      } catch (e) {
        console.error(e);
        setDesigns(createDefaultDesignMap());
      } finally {
        setDesignLoading(false);
      }
    };

    loadDesigns();
  }, []);

  const slugFromName = (name: string) =>
    name.replace(/\s+/g, '').replace(/[^\w가-힣a-zA-Z0-9]/g, '') || 'custom';

  const handleAdd = async () => {
    const name = addName.trim();
    if (!name) return alert('양식 이름을 입력하세요.');
    const slug = (addSlug.trim() || slugFromName(name)).slice(0, 50);
    if (builtinTemplates.some((template) => template.slug === slug || template.name === name)) {
      alert('기본 서식으로 이미 제공되는 문서입니다.');
      return;
    }
    if (list.some((row) => row.slug === slug || row.name === name)) {
      alert('같은 이름 또는 코드의 양식이 이미 등록되어 있습니다.');
      return;
    }
    if (typeof window !== 'undefined') {
      const next = [
        ...list,
        {
          id: globalThis.crypto?.randomUUID?.() || `local-${Date.now()}`,
          name,
          slug,
          sort_order: list.length,
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ];
      window.localStorage.setItem(LOCAL_APPROVAL_FORM_TYPES_KEY, JSON.stringify(next));
      setList(next);
      setAddName('');
      setAddSlug('');
      return;
    }
    const { error } = await supabase.from('approval_form_types').insert({
      name,
      slug,
      sort_order: list.length,
      is_active: true,
    });
    if (error) {
      alert('추가 실패: ' + error.message);
      return;
    }
    setAddName('');
    setAddSlug('');
    fetchList();
  };

  const startEdit = (row: any) => {
    setEditingId(row.id);
    setEditName(row.name);
    setEditSlug(row.slug || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return alert('이름을 입력하세요.');
    const slug = (editSlug.trim() || slugFromName(name)).slice(0, 50);
    if (typeof window !== 'undefined') {
      const next = list.map((row: any) =>
        row.id === editingId ? { ...row, name, slug, updated_at: new Date().toISOString() } : row
      );
      window.localStorage.setItem(LOCAL_APPROVAL_FORM_TYPES_KEY, JSON.stringify(next));
      setList(next);
      setEditingId(null);
      return;
    }
    const { error } = await supabase
      .from('approval_form_types')
      .update({ name, slug, updated_at: new Date().toISOString() })
      .eq('id', editingId);
    if (error) {
      alert('수정 실패: ' + error.message);
      return;
    }
    setEditingId(null);
    fetchList();
  };

  const toggleActive = async (row: any) => {
    if (typeof window !== 'undefined') {
      const next = list.map((item: any) =>
        item.id === row.id ? { ...item, is_active: !row.is_active, updated_at: new Date().toISOString() } : item
      );
      window.localStorage.setItem(LOCAL_APPROVAL_FORM_TYPES_KEY, JSON.stringify(next));
      setList(next);
      return;
    }
    const { error } = await supabase
      .from('approval_form_types')
      .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (!error) fetchList();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 양식을 삭제하시겠습니까?')) return;
    if (typeof window !== 'undefined') {
      const next = list.filter((row: any) => row.id !== id);
      window.localStorage.setItem(LOCAL_APPROVAL_FORM_TYPES_KEY, JSON.stringify(next));
      setList(next);
      return;
    }
    const { error } = await supabase.from('approval_form_types').delete().eq('id', id);
    if (!error) fetchList();
    else alert('삭제 실패: ' + error.message);
  };

  const combinedTemplates = useMemo(
    () => [
      ...builtinTemplates,
      ...list
        .filter((row) => row.is_active !== false)
        .filter((row) => !builtinTemplates.some((template) => template.slug === row.slug))
        .map((row) => ({
          slug: row.slug || String(row.id),
          name: row.name,
          summary: '사용자가 추가한 커스텀 양식',
        })),
    ],
    [list]
  );

  const currentDesign = useMemo(
    () => resolveCurrentDesign(selectedSlug, selectedName, designs),
    [designs, selectedName, selectedSlug]
  );

  const handleSelectTemplate = (slug: string, name: string) => {
    setSelectedSlug(slug);
    setSelectedName(name);
  };

  const updateCurrentDesign = (field: keyof TemplateDesign, value: string | boolean | number) => {
    if (!selectedSlug) return;
    setDesigns((prev) => {
      const current = resolveCurrentDesign(selectedSlug, selectedName, prev);
      const nextEntry: TemplateDesign = {
        ...current,
        [field]: value,
      };

      if (field === 'companyLabel' && typeof value === 'string') {
        const nextCompanyLabel = value.trim() || DEFAULT_DESIGN.companyLabel || 'SY INC.';
        const fallbackSeal = `${current.companyLabel || DEFAULT_DESIGN.companyLabel || 'SY INC.'} 직인`;
        if (!current.sealLabel || current.sealLabel === fallbackSeal) {
          nextEntry.sealLabel = `${nextCompanyLabel} 직인`;
        }
      }

      return {
        ...prev,
        [selectedSlug]: nextEntry,
      };
    });
  };

  const handleSaveDesign = async () => {
    if (!selectedSlug) {
      alert('먼저 디자인할 서식을 선택하세요.');
      return;
    }
    setSavingDesign(true);
    try {
      const { error } = await persistDesigns(designs);

      if (error) {
        console.error(error);
        alert('서식 디자인 저장에 실패했습니다. (system_settings 테이블을 확인해 주세요)');
        return;
      }
      alert('선택한 서식의 디자인이 저장되었습니다.');
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSavingDesign(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-[var(--foreground)]">서식양식 관리</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-[24px] border border-[var(--toss-border)] bg-white px-5 py-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--toss-gray-3)]">Default Pack</p>
          <p className="mt-3 text-2xl font-black text-[var(--foreground)]">{builtinTemplates.length}종 기본 양식</p>
          <p className="mt-2 text-[12px] leading-5 text-[var(--toss-gray-3)]">
            연차, 연장근무, 물품신청, 출결정정 등 자주 쓰는 양식을 기본값으로 미리 넣어뒀습니다.
          </p>
        </div>
        <div className="rounded-[24px] border border-[var(--toss-border)] bg-white px-5 py-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--toss-gray-3)]">Auto Branding</p>
          <p className="mt-3 text-lg font-black text-[var(--foreground)]">회사 로고 + 직인 자동 삽입</p>
          <p className="mt-2 text-[12px] leading-5 text-[var(--toss-gray-3)]">
            배경 워터마크 로고와 하단 직인을 기본값으로 적용해 양식빌더에서도 바로 같은 느낌으로 확인할 수 있습니다.
          </p>
        </div>
        <div
          className="rounded-[24px] px-5 py-5 shadow-sm text-white"
          style={{
            background: 'linear-gradient(135deg, #155eef 0%, #4f46e5 100%)',
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/75">Builder Sync</p>
          <p className="mt-3 text-lg font-black">양식빌더 기본값 연동</p>
          <p className="mt-2 text-[12px] leading-5 text-white/85">
            저장한 기본 디자인은 양식빌더와 관리자 미리보기에서 동일한 기본 서식으로 바로 확인됩니다.
          </p>
        </div>
      </div>

      {/* 추가 */}
      <div className="bg-white p-6 rounded-[12px] border border-[var(--toss-border)] shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">양식 추가</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-[11px] font-bold text-[var(--toss-gray-3)] mb-1">표시 이름</label>
            <input
              type="text"
              value={addName}
              onChange={e => {
                setAddName(e.target.value);
                if (!addSlug) setAddSlug(slugFromName(e.target.value));
              }}
              placeholder="예: 외부출장신청"
              className="w-48 md:w-56 p-3 rounded-[16px] border border-[var(--toss-border)] text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--toss-gray-3)] mb-1">양식 코드(slug)</label>
            <input
              type="text"
              value={addSlug}
              onChange={e => setAddSlug(e.target.value)}
              placeholder="자동 생성 또는 입력"
              className="w-40 md:w-48 p-3 rounded-[16px] border border-[var(--toss-border)] text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <button
            onClick={handleAdd}
            className="px-5 py-3 bg-[var(--toss-blue)] text-white rounded-[16px] text-sm font-semibold hover:bg-blue-700"
          >
            추가
          </button>
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-[12px] border border-[var(--toss-border)] shadow-sm overflow-hidden">
        <h3 className="text-sm font-semibold text-[var(--foreground)] p-4 border-b border-gray-50">등록된 추가 양식</h3>
        {loading ? (
          <div className="p-8 text-center text-[var(--toss-gray-3)]">로딩 중...</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-[var(--toss-gray-3)]">추가 양식이 없습니다. 위에서 새로 등록하세요.</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {list.map(row => (
              <li key={row.id} className="flex items-center justify-between gap-4 p-4 hover:bg-[var(--toss-gray-1)]/50">
                {editingId === row.id ? (
                  <>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 p-2 rounded-[12px] border text-sm font-bold"
                    />
                    <input
                      value={editSlug}
                      onChange={e => setEditSlug(e.target.value)}
                      className="w-32 p-2 rounded-[12px] border text-xs"
                      placeholder="slug"
                    />
                    <button onClick={saveEdit} className="px-3 py-1.5 bg-[var(--toss-blue)] text-white rounded-[12px] text-xs font-bold">저장</button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-[var(--toss-gray-2)] rounded-[12px] text-xs">취소</button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <span className="font-bold text-[var(--foreground)]">{row.name}</span>
                      <span className="ml-2 text-xs text-[var(--toss-gray-3)]">{row.slug}</span>
                      {!row.is_active && <span className="ml-2 text-xs text-red-500">(비활성)</span>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleActive(row)} className="px-3 py-1.5 bg-[var(--toss-gray-1)] rounded-[12px] text-xs font-bold hover:bg-[var(--toss-gray-2)]">
                        {row.is_active ? '비활성' : '활성'}
                      </button>
                      <button onClick={() => startEdit(row)} className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-[12px] text-xs font-bold">수정</button>
                      <button onClick={() => handleDelete(row.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-[12px] text-xs font-bold">삭제</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 서식 디자인 설정 */}
      <div className="bg-white rounded-[12px] border border-[var(--toss-border)] shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">서식 디자인 설정</h3>
          </div>
          {designLoading && (
            <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">디자인 불러오는 중...</span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
          {/* 서식 목록 (서식 선택) */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">디자인 대상 서식 선택</p>
            <div className="border border-[var(--toss-border)] rounded-[12px] bg-[var(--toss-gray-1)]/60 max-h-64 overflow-y-auto custom-scrollbar">
              {combinedTemplates.length === 0 ? (
                <div className="p-4 text-[11px] text-[var(--toss-gray-3)] text-center">
                  등록된 서식이 없습니다. 위에서 먼저 양식을 추가하세요.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--toss-border)]">
                  {combinedTemplates.map((tpl) => {
                    const isBuiltin = builtinTemplates.some(b => b.slug === tpl.slug);
                    const active = selectedSlug === tpl.slug;
                    return (
                      <li key={tpl.slug}>
                        <button
                          type="button"
                          onClick={() => handleSelectTemplate(tpl.slug, tpl.name)}
                          className={`w-full px-3 py-3 text-left transition-all ${
                            active
                              ? 'bg-white shadow-sm ring-1 ring-blue-100'
                              : 'text-[var(--toss-gray-4)] hover:bg-white/80'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={`truncate text-[12px] font-bold ${active ? 'text-[var(--toss-blue)]' : 'text-[var(--foreground)]'}`}>
                                {tpl.name}
                              </p>
                              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--toss-gray-3)]">
                                {tpl.summary}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                                isBuiltin
                                  ? 'bg-blue-50 text-blue-600'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {isBuiltin ? '기본' : '커스텀'}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* 디자인 폼 + 미리보기 */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">
                  선택된 서식
                </p>
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  {selectedName || '서식을 선택해 주세요'}
                </p>
              </div>
              <div className="flex items-center gap-1 bg-[var(--toss-gray-1)] border border-[var(--toss-border)] rounded-full px-1 py-1">
                {(['title', 'subtitle', 'sign'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setActiveHandle(k)}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                      activeHandle === k
                        ? 'bg-[var(--toss-blue)] text-white'
                        : 'text-[var(--toss-gray-3)] hover:bg-white'
                    }`}
                  >
                    {k === 'title' && '제목 위치'}
                    {k === 'subtitle' && '부제 위치'}
                    {k === 'sign' && '서명 위치'}
                  </button>
                ))}
              </div>
            </div>

            {/* 입력 폼 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px]">
              <div className="space-y-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">제목</span>
                  <input
                    type="text"
                    value={currentDesign.title || ''}
                    onChange={(e) => updateCurrentDesign('title', e.target.value)}
                    className="px-3 py-2 rounded-[16px] border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">부제 (설명)</span>
                  <input
                    type="text"
                    value={currentDesign.subtitle || ''}
                    onChange={(e) => updateCurrentDesign('subtitle', e.target.value)}
                    className="px-3 py-2 rounded-[16px] border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">회사명 라벨</span>
                  <input
                    type="text"
                    value={currentDesign.companyLabel || ''}
                    onChange={(e) => updateCurrentDesign('companyLabel', e.target.value)}
                    className="px-3 py-2 rounded-[16px] border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">직인 문구</span>
                  <input
                    type="text"
                    value={currentDesign.sealLabel || ''}
                    onChange={(e) => updateCurrentDesign('sealLabel', e.target.value)}
                    className="px-3 py-2 rounded-[16px] border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                    placeholder="예: SY INC. 직인"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">배경 로고 경로</span>
                  <input
                    type="text"
                    value={currentDesign.backgroundLogoUrl || DEFAULT_LOGO_URL}
                    onChange={(e) => updateCurrentDesign('backgroundLogoUrl', e.target.value)}
                    className="px-3 py-2 rounded-[16px] border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                    placeholder="/sy-logo.png"
                  />
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex gap-3">
                  <label className="flex-1 flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                      대표 색상 (Primary)
                    </span>
                    <input
                      type="text"
                      value={currentDesign.primaryColor || ''}
                      onChange={(e) => updateCurrentDesign('primaryColor', e.target.value)}
                      className="px-3 py-2 rounded-[16px] border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                      placeholder="#2563eb"
                    />
                  </label>
                  <label className="w-20 flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">색상</span>
                    <span
                      className="w-full h-9 rounded-[16px] border border-[var(--toss-border)]"
                      style={{ backgroundColor: currentDesign.primaryColor || '#2563eb' }}
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">테두리 색상</span>
                  <input
                    type="text"
                    value={currentDesign.borderColor || ''}
                    onChange={(e) => updateCurrentDesign('borderColor', e.target.value)}
                    className="px-3 py-2 rounded-[16px] border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                    placeholder="#e5e7eb"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">하단 문구</span>
                  <input
                    type="text"
                    value={currentDesign.footerText || ''}
                    onChange={(e) => updateCurrentDesign('footerText', e.target.value)}
                    className="px-3 py-2 rounded-[16px] border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                    placeholder="예: 위 내용과 금액을 확인하였습니다."
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">배경 로고 투명도</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="0.25"
                      step="0.01"
                      value={currentDesign.backgroundLogoOpacity ?? 0.08}
                      onChange={(e) => updateCurrentDesign('backgroundLogoOpacity', Number(e.target.value))}
                      className="flex-1 accent-[var(--toss-blue)]"
                    />
                    <span className="w-12 text-right text-[11px] font-bold text-[var(--toss-gray-4)]">
                      {Math.round((currentDesign.backgroundLogoOpacity ?? 0.08) * 100)}%
                    </span>
                  </div>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)]/70 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={currentDesign.showBackgroundLogo !== false}
                      onChange={(e) => updateCurrentDesign('showBackgroundLogo', e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--toss-border)]"
                    />
                    <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">배경 로고</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)]/70 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={currentDesign.showSeal !== false}
                      onChange={(e) => updateCurrentDesign('showSeal', e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--toss-border)]"
                    />
                    <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">하단 직인</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)]/70 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={currentDesign.showSignArea !== false}
                      onChange={(e) => updateCurrentDesign('showSignArea', e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--toss-border)]"
                    />
                    <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">서명란</span>
                  </label>
                </div>
              </div>
            </div>

            {/* 미리보기 – 클릭으로 제목/부제/서명 위치 조정 */}
            <div className="mt-1 rounded-[28px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] text-[var(--toss-gray-3)]">
                  미리보기 안을 클릭하면{' '}
                  <span className="font-bold">
                    {activeHandle === 'title'
                      ? '제목'
                      : activeHandle === 'subtitle'
                      ? '부제'
                      : '서명'}
                  </span>
                  {' '}위치가 이동합니다.
                </p>
              </div>
              <div
                ref={previewRef}
                className="relative overflow-hidden rounded-[28px] cursor-pointer"
                style={{
                  border: `1px solid ${currentDesign.borderColor || '#e5e7eb'}`,
                  padding: 24,
                  height: 340,
                  background: `radial-gradient(circle at top right, ${alphaColor(currentDesign.primaryColor, 0.18)} 0%, rgba(255,255,255,0) 42%), linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)`,
                  boxShadow: `0 28px 48px ${alphaColor(currentDesign.primaryColor, 0.12)}`,
                }}
                onClick={(e) => {
                  if (!previewRef.current || !selectedSlug) return;
                  const rect = previewRef.current.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * 100;
                  const y = ((e.clientY - rect.top) / rect.height) * 100;
                  // 0~100 범위로 클램프
                  const clampedX = Math.max(0, Math.min(100, x));
                  const clampedY = Math.max(0, Math.min(100, y));
                  const vx = Number(clampedX.toFixed(1));
                  const vy = Number(clampedY.toFixed(1));
                  if (activeHandle === 'title') {
                    updateCurrentDesign('titleXPercent', vx);
                    updateCurrentDesign('titleYPercent', vy);
                  } else if (activeHandle === 'subtitle') {
                    updateCurrentDesign('subtitleXPercent', vx);
                    updateCurrentDesign('subtitleYPercent', vy);
                  } else if (activeHandle === 'sign') {
                    updateCurrentDesign('signXPercent', vx);
                    updateCurrentDesign('signYPercent', vy);
                  }
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-24"
                  style={{
                    background: `linear-gradient(135deg, ${alphaColor(currentDesign.primaryColor, 0.2)} 0%, rgba(255,255,255,0) 75%)`,
                  }}
                />

                {currentDesign.showBackgroundLogo !== false && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <img
                      src={currentDesign.backgroundLogoUrl || DEFAULT_LOGO_URL}
                      alt="회사 로고 워터마크"
                      className="max-h-44 w-auto object-contain grayscale"
                      style={{
                        opacity: currentDesign.backgroundLogoOpacity ?? 0.08,
                        filter: 'grayscale(1) contrast(0.85)',
                      }}
                    />
                  </div>
                )}

                <div className="absolute left-6 top-6 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--toss-gray-4)] shadow-sm">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: currentDesign.primaryColor || '#155eef' }}
                  />
                  Auto Brand
                </div>

                <div
                  className="absolute select-none text-xl font-black tracking-[-0.03em]"
                  style={{
                    color: currentDesign.primaryColor || '#2563eb',
                    top: `${currentDesign.titleYPercent ?? 12}%`,
                    left: `${currentDesign.titleXPercent ?? 8}%`,
                    maxWidth: '72%',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {currentDesign.title || '서식 제목'}
                </div>

                <div
                  className="absolute select-none"
                  style={{
                    top: `${currentDesign.subtitleYPercent ?? 32}%`,
                    left: `${currentDesign.subtitleXPercent ?? 8}%`,
                    maxWidth: '70%',
                  }}
                >
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">
                    {currentDesign.companyLabel || 'SY INC.'}
                  </div>
                  <div className="text-[13px] font-medium leading-6 text-[var(--toss-gray-4)]">
                    {currentDesign.subtitle || '설명 또는 부제목'}
                  </div>
                </div>

                <div className="absolute left-6 right-6 bottom-24 grid grid-cols-3 gap-3 text-[11px]">
                  {[
                    { label: '브랜딩', value: '회사 로고 자동 적용' },
                    { label: '직인', value: currentDesign.showSeal !== false ? '하단 자동 배치' : '사용 안 함' },
                    { label: '문서 상태', value: '기본값 양식' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[20px] border bg-white/85 px-4 py-3 backdrop-blur-sm"
                      style={{ borderColor: alphaColor(currentDesign.primaryColor, 0.16) }}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">
                        {item.label}
                      </p>
                      <p className="mt-2 text-[12px] font-bold text-[var(--foreground)]">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="absolute inset-x-6 bottom-8 flex items-end justify-between gap-6 border-t pt-4 text-[11px] text-[var(--toss-gray-3)]" style={{ borderColor: alphaColor(currentDesign.borderColor, 0.9) }}>
                  <div className="max-w-[60%] space-y-1">
                    <p className="font-semibold uppercase tracking-[0.18em]" style={{ color: currentDesign.primaryColor || '#2563eb' }}>
                      SMART APPROVAL DOCUMENT
                    </p>
                    <p>{currentDesign.footerText || '기본 하단 문구가 여기에 표시됩니다.'}</p>
                  </div>
                  {currentDesign.footerText && (
                    <div className="sr-only">{currentDesign.footerText}</div>
                  )}
                  {currentDesign.showSignArea !== false && (
                    <div
                      className="absolute select-none text-[11px] text-[var(--toss-gray-4)]"
                      style={{
                        top: `${currentDesign.signYPercent ?? 78}%`,
                        left: `${currentDesign.signXPercent ?? 75}%`,
                      }}
                    >
                      <div className="min-w-[170px] rounded-[18px] border border-dashed border-[var(--toss-border)] bg-white/90 px-4 py-3 shadow-sm">
                        <p className="font-semibold uppercase tracking-[0.18em] text-[10px] text-[var(--toss-gray-3)]">
                          Approval Signature
                        </p>
                        <p className="mt-2">서명: ____________________</p>
                      </div>
                    </div>
                  )}

                  {currentDesign.showSeal !== false && (
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-[3px] bg-white/90 text-center shadow-lg"
                      style={{
                        borderColor: alphaColor(currentDesign.primaryColor, 0.7),
                        color: currentDesign.primaryColor || '#2563eb',
                      }}
                    >
                      <div className="absolute inset-2 rounded-full border border-dashed" style={{ borderColor: alphaColor(currentDesign.primaryColor, 0.42) }} />
                      <div className="px-3 text-[10px] font-black leading-4">
                        {currentDesign.sealLabel || `${currentDesign.companyLabel || 'SY INC.'} 직인`}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveDesign}
                disabled={savingDesign}
                className="px-5 py-2.5 rounded-[16px] bg-[var(--toss-blue)] text-white text-[12px] font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {savingDesign ? '디자인 저장 중...' : '선택 서식 디자인 저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

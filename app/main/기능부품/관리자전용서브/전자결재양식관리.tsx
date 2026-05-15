'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

import type { FormTypeRow, TemplateDesign, TemplateDesignStore } from './전자결재양식관리/types';
import {
  builtinTemplates,
  mergeWithDefaultDesigns,
  resolveCurrentDesign,
} from './전자결재양식관리/design-utils';
import DocumentPreviewCanvas from './전자결재양식관리/DocumentPreviewCanvas';
import {
  buildPreviewIdentityRows,
  buildPreviewStatement,
  buildPreviewDetailRows,
  buildPreviewDateLabel,
  buildPreviewDocumentNumber,
  buildTemplatePreviewSpec,
  readRuntimeCompanyLabel,
} from './전자결재양식관리/preview-builder';
import {
  createEmptyDesignStore,
  getDesignsForCompany,
  isMissingTableError,
  normalizeCompanyKey,
  normalizeTemplateDesignStore,
  persistDesignsForCompany,
  readLocalDesignsStore,
  readLocalRowsForCompany,
  slugFromName,
  writeLocalDesignsStore,
  writeLocalRowsForCompany,
} from './전자결재양식관리/store-utils';

export default function ApprovalFormTypesManager({ user }: { user?: any }) {
  const { dialog, openConfirm } = useActionDialog();
  const [list, setList] = useState<FormTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [designLoading, setDesignLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [addName, setAddName] = useState('');
  const [addSlug, setAddSlug] = useState('');
  const [addBaseSlug, setAddBaseSlug] = useState(builtinTemplates[0]?.slug || '');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(builtinTemplates[0]?.slug || null);
  const [selectedName, setSelectedName] = useState(builtinTemplates[0]?.name || '연차/휴가');
  const [designs, setDesigns] = useState<Record<string, TemplateDesign>>({});
  const [designStore, setDesignStore] = useState<TemplateDesignStore>(() => createEmptyDesignStore());
  const [companies, setCompanies] = useState<string[]>([]);
  const designEditorRef = useRef<HTMLElement | null>(null);
  const runtimeCompanyLabel = useMemo(() => readRuntimeCompanyLabel(user), [user]);
  const [selectedCompany, setSelectedCompany] = useState(() => runtimeCompanyLabel);
  const currentCompanyLabel = useMemo(
    () => normalizeCompanyKey(selectedCompany || runtimeCompanyLabel),
    [runtimeCompanyLabel, selectedCompany],
  );
  const selectedBaseTemplate = useMemo(
    () => builtinTemplates.find((template) => template.slug === addBaseSlug) ?? builtinTemplates[0],
    [addBaseSlug],
  );

  useEffect(() => {
    setSelectedCompany((current) => current || runtimeCompanyLabel);
  }, [runtimeCompanyLabel]);

  useEffect(() => {
    const loadCompanies = async () => {
      const fallback = normalizeCompanyKey(runtimeCompanyLabel);
      const names = new Set<string>([fallback]);

      try {
        const { data, error } = await supabase
          .from('companies')
          .select('name')
          .order('name', { ascending: true });

        if (!error && Array.isArray(data)) {
          data.forEach((row: any) => {
            const name = normalizeCompanyKey(row?.name);
            if (name) names.add(name);
          });
        }
      } catch {
        // local fallback is enough when the companies table is not available.
      }

      const next = Array.from(names).filter(Boolean);
      setCompanies(next);
      setSelectedCompany((current) => (current && next.includes(current) ? current : next[0] || fallback));
    };

    void loadCompanies();
  }, [runtimeCompanyLabel]);

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
    [list],
  );

  const combinedTemplates = useMemo(
    () => [...builtinTemplates, ...customTemplates],
    [customTemplates],
  );

  const selectedTemplate = useMemo(
    () => combinedTemplates.find((template) => template.slug === selectedSlug) ?? null,
    [combinedTemplates, selectedSlug],
  );

  const previewTemplateSlug = useMemo(() => {
    if (!selectedSlug) return 'generic';
    if (builtinTemplates.some((template) => template.slug === selectedSlug)) {
      return selectedSlug;
    }

    const customTemplate = list.find((row) => (row.slug || row.id) === selectedSlug);
    return customTemplate?.base_slug || 'generic';
  }, [list, selectedSlug]);

  const previewSpec = useMemo(
    () =>
      buildTemplatePreviewSpec(
        previewTemplateSlug,
        selectedName,
        (builtinTemplates.find((template) => template.slug === previewTemplateSlug) ?? selectedTemplate)
          ?.summary || '',
      ),
    [previewTemplateSlug, selectedName, selectedTemplate],
  );

  const previewDesign = useMemo(() => {
    const previewTemplateName =
      selectedTemplate?.name ||
      builtinTemplates.find((template) => template.slug === previewTemplateSlug)?.name ||
      selectedName;

    return resolveCurrentDesign(
      selectedSlug || previewTemplateSlug,
      previewTemplateName,
      designs,
      currentCompanyLabel,
    );
  }, [currentCompanyLabel, designs, previewTemplateSlug, selectedName, selectedSlug, selectedTemplate?.name]);

  const previewSourceName = useMemo(
    () => builtinTemplates.find((template) => template.slug === previewTemplateSlug)?.name || selectedName,
    [previewTemplateSlug, selectedName],
  );

  const previewIdentityRows = useMemo(
    () => buildPreviewIdentityRows(previewTemplateSlug),
    [previewTemplateSlug],
  );

  const previewStatement = useMemo(
    () => buildPreviewStatement(previewTemplateSlug, previewDesign.title || previewSourceName),
    [previewDesign.title, previewSourceName, previewTemplateSlug],
  );

  const previewDetailRows = useMemo(
    () => buildPreviewDetailRows(previewTemplateSlug),
    [previewTemplateSlug],
  );

  const previewDateLabel = useMemo(
    () => buildPreviewDateLabel(previewTemplateSlug),
    [previewTemplateSlug],
  );

  const previewDocumentNumber = useMemo(
    () => buildPreviewDocumentNumber(previewTemplateSlug),
    [previewTemplateSlug],
  );

  const selectedDesignKey = selectedSlug || previewTemplateSlug || 'generic';

  const updatePreviewDesign = (patch: Partial<TemplateDesign>) => {
    setDesigns((prev) => {
      const base = resolveCurrentDesign(selectedDesignKey, selectedName, prev, currentCompanyLabel);
      return {
        ...prev,
        [selectedDesignKey]: {
          ...base,
          ...patch,
        },
      };
    });
  };

  const savePreviewDesign = async () => {
    const { data, error } = await persistDesignsForCompany(currentCompanyLabel, designs, designStore);
    if (error) {
      return toast('양식 디자인 저장에 실패했습니다: ' + error.message, 'error');
    }

    setDesignStore(data);
    toast('회사별 양식 디자인을 저장했습니다.');
  };

  const syncListState = (next: FormTypeRow[]) => {
    const scopedRows = next.map((row) => ({ ...row, company_name: currentCompanyLabel }));
    writeLocalRowsForCompany(currentCompanyLabel, scopedRows);
    setList(scopedRows);
  };

  useEffect(() => {
    const loadList = async () => {
      setLoading(true);
      const localRows = readLocalRowsForCompany(currentCompanyLabel);

      try {
        const { data, error } = await supabase
          .from('approval_form_types')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });

        if (!error && Array.isArray(data)) {
          const map = new Map<string, FormTypeRow>();
          const dbRows = (data as FormTypeRow[])
            .filter((row) => !row.company_name || normalizeCompanyKey(row.company_name) === currentCompanyLabel)
            .map((row) => ({ ...row, company_name: normalizeCompanyKey(row.company_name || currentCompanyLabel) }));

          [...localRows, ...dbRows].forEach((row) => {
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
      setDesignLoading(true);
      try {
        const localDesigns = readLocalDesignsStore();
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'form_template_designs')
          .maybeSingle();

        let parsed: unknown = localDesigns;
        if (!error && data?.value) {
          parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          writeLocalDesignsStore(parsed);
        } else if (error && !isMissingTableError(error, 'system_settings')) {
          throw error;
        }

        const store = normalizeTemplateDesignStore(parsed);
        setDesignStore(store);
        setDesigns(mergeWithDefaultDesigns(getDesignsForCompany(store, currentCompanyLabel), currentCompanyLabel));
      } catch (error) {
        console.error(error);
        const fallbackStore = normalizeTemplateDesignStore(readLocalDesignsStore());
        setDesignStore(fallbackStore);
        setDesigns(
          mergeWithDefaultDesigns(getDesignsForCompany(fallbackStore, currentCompanyLabel), currentCompanyLabel),
        );
      } finally {
        setDesignLoading(false);
      }
    };

    void loadList();
    void loadSavedDesigns();
  }, [currentCompanyLabel]);

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
    requestAnimationFrame(() => {
      designEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleAdd = async () => {
    const name = addName.trim();
    if (!name) return toast('양식 이름을 입력해 주세요.', 'warning');

    const baseTemplate = builtinTemplates.find((template) => template.slug === addBaseSlug) ?? builtinTemplates[0];
    const slug = (addSlug.trim() || slugFromName(name)).slice(0, 50);

    if (builtinTemplates.some((template) => template.slug === slug || template.name === name)) {
      return toast('기본양식과 같은 이름이나 코드로는 추가할 수 없습니다.');
    }
    if (list.some((row) => row.slug === slug || row.name === name)) {
      return toast('같은 이름 또는 코드의 추가 양식이 이미 있습니다.', 'warning');
    }

    const nextDesigns = {
      ...designs,
      [slug]: {
        ...resolveCurrentDesign(baseTemplate.slug, baseTemplate.name, designs, currentCompanyLabel),
        title: name,
      },
    };

    const { data: nextDesignStore, error: designError } = await persistDesignsForCompany(
      currentCompanyLabel,
      nextDesigns,
      designStore,
    );
    if (designError) {
      return toast('기본양식 복제에 실패했습니다: ' + designError.message, 'error');
    }

    let newRow: FormTypeRow = {
      id: globalThis.crypto?.randomUUID?.() || `local-${Date.now()}`,
      name,
      slug,
      base_slug: baseTemplate.slug,
      company_name: currentCompanyLabel,
      sort_order: list.length,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from('approval_form_types')
        .insert(newRow)
        .select('*')
        .maybeSingle();

      if (!error && data) {
        newRow = data as FormTypeRow;
      } else if (error && !isMissingTableError(error, 'approval_form_types')) {
        console.warn('approval_form_types insert failed:', error);
      }
    } catch (error) {
      console.warn('approval_form_types insert failed:', error);
    }

    const nextRows = [...list, newRow];

    setDesigns(nextDesigns);
    setDesignStore(nextDesignStore);
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
    if (!name) return toast('양식 이름을 입력해 주세요.', 'warning');

    const slug = (editSlug.trim() || slugFromName(name)).slice(0, 50);
    const currentRow = list.find((row) => row.id === editingId);
    if (!currentRow) return;
    if (list.some((row) => row.id !== editingId && (row.slug === slug || row.name === name))) {
      return toast('같은 이름 또는 코드의 추가 양식이 이미 있습니다.', 'warning');
    }

    const previousSlug = currentRow.slug || currentRow.id;
    if (previousSlug !== slug && designs[previousSlug]) {
      const nextDesigns = { ...designs, [slug]: { ...designs[previousSlug], title: name } };
      delete nextDesigns[previousSlug];
      const { data, error } = await persistDesignsForCompany(currentCompanyLabel, nextDesigns, designStore);
      if (error) {
        return toast('양식 디자인 이동에 실패했습니다: ' + error.message, 'error');
      }
      setDesigns(nextDesigns);
      setDesignStore(data);
    }

    const nextRows = list.map((row) =>
      row.id === editingId ? { ...row, name, slug, updated_at: new Date().toISOString() } : row,
    );
    try {
      const { error } = await supabase
        .from('approval_form_types')
        .update({ name, slug, company_name: currentCompanyLabel, updated_at: new Date().toISOString() })
        .eq('id', editingId);

      if (error && !isMissingTableError(error, 'approval_form_types')) {
        console.warn('approval_form_types update failed:', error);
      }
    } catch (error) {
      console.warn('approval_form_types update failed:', error);
    }
    syncListState(nextRows);
    setEditingId(null);

    if (selectedSlug === previousSlug || selectedSlug === slug) {
      setSelectedSlug(slug);
      setSelectedName(name);
    }
  };

  const toggleActive = async (row: FormTypeRow) => {
    const nextRows = list.map((item) =>
      item.id === row.id ? { ...item, is_active: !row.is_active, updated_at: new Date().toISOString() } : item,
    );
    try {
      const { error } = await supabase
        .from('approval_form_types')
        .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
        .eq('id', row.id);

      if (error && !isMissingTableError(error, 'approval_form_types')) {
        console.warn('approval_form_types active toggle failed:', error);
      }
    } catch (error) {
      console.warn('approval_form_types active toggle failed:', error);
    }
    syncListState(nextRows);
  };

  const handleDelete = async (row: FormTypeRow) => {
    const confirmed = await openConfirm({
      title: '추가 결재 양식 삭제',
      description: `${row.name || '선택한 추가 양식'}을 삭제합니다.\n연결된 디자인 설정도 함께 정리됩니다.`,
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;

    const key = row.slug || row.id;
    if (designs[key]) {
      const nextDesigns = { ...designs };
      delete nextDesigns[key];
      const { data, error } = await persistDesignsForCompany(currentCompanyLabel, nextDesigns, designStore);
      if (error) {
        return toast('양식 디자인 정리에 실패했습니다: ' + error.message, 'error');
      }
      setDesigns(nextDesigns);
      setDesignStore(data);
    }

    try {
      const { error } = await supabase.from('approval_form_types').delete().eq('id', row.id);

      if (error && !isMissingTableError(error, 'approval_form_types')) {
        console.warn('approval_form_types delete failed:', error);
      }
    } catch (error) {
      console.warn('approval_form_types delete failed:', error);
    }

    syncListState(list.filter((item) => item.id !== row.id));

    if (selectedSlug === key) {
      setSelectedSlug(builtinTemplates[0]?.slug || null);
      setSelectedName(builtinTemplates[0]?.name || '');
    }
  };

  return (
    <div className="max-w-6xl space-y-5">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-[var(--foreground)]">기본양식 관리</h2>
        <label className="flex items-center gap-2 text-xs font-bold text-[var(--toss-gray-4)]">
          회사
          <select
            value={currentCompanyLabel}
            onChange={(event) => setSelectedCompany(event.target.value)}
            className="min-w-[180px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-blue-200"
          >
            {companies.length === 0 && <option value={currentCompanyLabel}>{currentCompanyLabel}</option>}
            {companies.map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section ref={designEditorRef} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">기본양식</h3>
            <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
              새 양식을 만들 때 기준이 되는 기본양식입니다.
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-4 py-2 text-xs font-semibold text-[var(--toss-gray-4)]">
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
                className={`rounded-[var(--radius-xl)] border p-4 text-left transition-all ${
                  isBase || isSelected
                    ? 'border-blue-500/20 bg-[var(--toss-blue-light)]/70 shadow-sm'
                    : 'border-[var(--border)] hover:border-blue-100 hover:bg-[var(--muted)]/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">{template.name}</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--toss-gray-3)]">{template.summary}</p>
                  </div>
                  <span
                    className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-semibold ${isBase ? 'bg-[var(--accent)] text-white' : 'bg-blue-500/10 text-blue-600'}`}
                  >
                    {isBase ? '추가 기준' : '기본양식'}
                  </span>
                </div>
                {isSelected && (
                  <div className="mt-3 text-[11px] font-semibold text-[var(--accent)]">현재 수정 중</div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">기본양식 기반 양식 추가</h3>
            <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
              선택한 기본양식을 복제해서 새 결재양식을 만들고, 아래에서 이어서 수정합니다.
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-700">
            현재 기준: {selectedBaseTemplate?.name || '기본양식'}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1">
            <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">기준 기본양식</span>
            <select
              value={addBaseSlug}
              onChange={(e) => setAddBaseSlug(e.target.value)}
              className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
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
              className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>

          <label className="min-w-[180px] flex-1">
            <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">양식 코드</span>
            <input
              type="text"
              value={addSlug}
              onChange={(e) => setAddSlug(e.target.value)}
              placeholder="자동 생성 또는 직접 입력"
              className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>

          <button
            type="button"
            onClick={handleAdd}
            className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            기본양식으로 추가
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="border-b border-[var(--border)] px-4 py-4">
          <h3 className="text-base font-semibold text-[var(--foreground)]">기본양식 기반 추가 양식</h3>
          <p className="mt-1 text-sm text-[var(--toss-gray-3)]">추가 양식은 모두 기본양식 복제본입니다.</p>
        </div>

        {loading ? (
          <div className="p-5 text-center text-sm text-[var(--toss-gray-3)]">양식을 불러오는 중입니다...</div>
        ) : list.length === 0 ? (
          <div className="p-5 text-center text-sm text-[var(--toss-gray-3)]">
            아직 추가된 양식이 없습니다. 위에서 기본양식을 선택해 새 양식을 추가해 주세요.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {list.map((row) => {
              const baseName = builtinTemplates.find((template) => template.slug === row.base_slug)?.name;

              return (
                <li key={row.id} className="px-4 py-4 hover:bg-[var(--muted)]/50">
                  {editingId === row.id ? (
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="min-w-[180px] flex-[1.2]">
                        <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">양식 이름</span>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2 text-sm font-semibold"
                        />
                      </label>
                      <label className="min-w-[180px] flex-1">
                        <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">양식 코드</span>
                        <input
                          value={editSlug}
                          onChange={(e) => setEditSlug(e.target.value)}
                          className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2 text-sm font-semibold"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white"
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-[var(--radius-lg)] bg-[var(--toss-gray-2)] px-4 py-2 text-xs font-bold text-[var(--foreground)]"
                      >
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
                            <span className="rounded-[var(--radius-md)] bg-danger/10 px-2 py-1 text-[10px] font-semibold text-danger">
                              비활성
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--toss-gray-3)]">
                          <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2.5 py-1 font-semibold">
                            {baseName ? `${baseName} 기반` : '기본양식 기반'}
                          </span>
                          <span>디자인은 아래에서 이어서 수정할 수 있습니다.</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleSelectTemplate(row.slug || row.id, row.name)}
                          className="rounded-[var(--radius-lg)] bg-[var(--muted)] px-3 py-2 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--toss-gray-2)]"
                        >
                          수정 열기
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(row)}
                          className="rounded-[var(--radius-lg)] bg-[var(--muted)] px-3 py-2 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--toss-gray-2)]"
                        >
                          {row.is_active === false ? '활성화' : '비활성'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="rounded-[var(--radius-lg)] bg-warning/15 px-3 py-2 text-xs font-bold text-warning"
                        >
                          이름/코드 수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="rounded-[var(--radius-lg)] bg-danger/10 px-3 py-2 text-xs font-bold text-danger"
                        >
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

      <section ref={designEditorRef} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">기본양식 미리보기</h3>
            <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
              문서 양식을 누르면 해당 양식의 기본 문서 이미지만 바로 확인합니다.
            </p>
          </div>
          {designLoading && (
            <span className="text-xs font-semibold text-[var(--toss-gray-3)]">기본값 불러오는 중...</span>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--toss-gray-3)]">기본 문서 미리보기</p>
              <p className="mt-1 text-lg font-bold text-[var(--foreground)]">{selectedName}</p>
              <p className="mt-1 text-sm text-[var(--toss-gray-3)]">{previewSpec.summary}</p>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--toss-gray-4)]">
              기본값 기준 {previewSourceName}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <label htmlFor="approval-design-title" className="block text-[11px] font-bold text-[var(--toss-gray-3)]">문서 제목</label>
              <input
                id="approval-design-title"
                value={previewDesign.title || ''}
                onChange={(event) => updatePreviewDesign({ title: event.target.value })}
                className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2 text-sm font-semibold"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="approval-design-company" className="block text-[11px] font-bold text-[var(--toss-gray-3)]">회사명</label>
              <input
                id="approval-design-company"
                value={previewDesign.companyLabel || ''}
                onChange={(event) => updatePreviewDesign({ companyLabel: event.target.value })}
                className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2 text-sm font-semibold"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="approval-design-logo-url" className="block text-[11px] font-bold text-[var(--toss-gray-3)]">로고 URL</label>
              <input
                id="approval-design-logo-url"
                value={previewDesign.backgroundLogoUrl || ''}
                onChange={(event) => updatePreviewDesign({ backgroundLogoUrl: event.target.value })}
                className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2 text-sm font-semibold"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="approval-design-seal-url" className="block text-[11px] font-bold text-[var(--toss-gray-3)]">직인 이미지 URL</label>
              <input
                id="approval-design-seal-url"
                value={previewDesign.sealImageUrl || ''}
                onChange={(event) => updatePreviewDesign({ sealImageUrl: event.target.value })}
                className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2 text-sm font-semibold"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="approval-design-primary-color" className="block text-[11px] font-bold text-[var(--toss-gray-3)]">주 색상</label>
              <input
                id="approval-design-primary-color"
                type="color"
                value={previewDesign.primaryColor || '#155eef'}
                onChange={(event) => updatePreviewDesign({ primaryColor: event.target.value })}
                className="h-10 w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-1"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="approval-design-border-color" className="block text-[11px] font-bold text-[var(--toss-gray-3)]">테두리 색상</label>
              <input
                id="approval-design-border-color"
                type="color"
                value={previewDesign.borderColor || '#d7e3ff'}
                onChange={(event) => updatePreviewDesign({ borderColor: event.target.value })}
                className="h-10 w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-1"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="approval-design-seal-label" className="block text-[11px] font-bold text-[var(--toss-gray-3)]">직인 문구</label>
              <input
                id="approval-design-seal-label"
                value={previewDesign.sealLabel || ''}
                onChange={(event) => updatePreviewDesign({ sealLabel: event.target.value })}
                className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2 text-sm font-semibold"
              />
            </div>
            <button
              type="button"
              onClick={savePreviewDesign}
              className="self-end rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white hover:bg-blue-700"
            >
              회사별 디자인 저장
            </button>
          </div>

          <DocumentPreviewCanvas
            design={previewDesign}
            sourceName={previewSourceName}
            identityRows={previewIdentityRows}
            statement={previewStatement}
            detailRows={previewDetailRows}
            dateLabel={previewDateLabel}
            documentNumber={previewDocumentNumber}
          />
        </div>
      </section>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { canAccessBoard, isAdminUser, isPrivilegedUser } from '@/lib/access-control';
import { supabase } from '@/lib/supabase';
import { isMissingColumnError, withMissingColumnsFallback } from '@/lib/supabase-compat';
import { toast } from '@/lib/toast';
import type { AttachmentItem, BoardPost, StaffMember } from '@/types';

const GUIDE_BOARD_TYPE = '업무가이드';
const ATTACHMENTS_META_PREFIX = '[[ATTACHMENTS_META]]';
const ATTACHMENTS_META_SUFFIX = '[[/ATTACHMENTS_META]]';
const GUIDE_META_PREFIX = '[[GUIDE_META]]';
const GUIDE_META_SUFFIX = '[[/GUIDE_META]]';

const GUIDE_POST_REQUIRED_SELECT_COLUMNS = [
  'id',
  'board_type',
  'title',
  'content',
  'author_id',
  'author_name',
  'company',
  'created_at',
] as const;

const GUIDE_POST_OPTIONAL_COLUMNS = ['updated_at', 'company_id', 'attachments'] as const;

const GUIDE_DEPARTMENT_PRESETS = ['수술실', '외래', '병동', '원무', '검사실', '행정', '재고', '회복실'] as const;

type QueryResult<T> = {
  data: T | null;
  error: unknown;
};

type GuideKind = 'education' | 'handover';
type GuideAudience = 'new_hire' | 'current_staff' | 'all_staff';

type GuideMetaPayload = {
  kind?: GuideKind;
  audience?: GuideAudience;
  department?: string;
  keywords?: string[];
};

type GuideRow = BoardPost & {
  board_type?: string | null;
  attachments?: AttachmentItem[] | null;
  updated_at?: string | null;
  company_id?: string | null;
};

type GuideResource = GuideRow & {
  description: string;
  attachments: AttachmentItem[];
  kind: GuideKind;
  audience: GuideAudience;
  department: string;
  keywords: string[];
};

type Props = {
  user?: StaffMember | null;
  selectedCo?: string | null;
  selectedCompanyId?: string | null;
};

function buildSelectColumns(
  requiredColumns: readonly string[],
  optionalColumns: readonly string[] = [],
  omittedColumns?: ReadonlySet<string>,
) {
  return [...requiredColumns, ...optionalColumns.filter((column) => !omittedColumns?.has(column))].join(', ');
}

function inferAttachmentType(nameOrUrl: string, explicitType?: string | null) {
  const normalizedExplicitType = String(explicitType || '').trim().toLowerCase();
  if (normalizedExplicitType === 'image' || normalizedExplicitType === 'video' || normalizedExplicitType === 'file') {
    return normalizedExplicitType;
  }

  const raw = String(nameOrUrl || '').trim().toLowerCase();
  const clean = raw.split('?')[0];
  const ext = clean.includes('.') ? clean.slice(clean.lastIndexOf('.') + 1) : '';

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'wmv', 'webm', 'mkv', 'm4v'].includes(ext)) return 'video';
  return 'file';
}

function extractAttachmentMetaFromContent(value: unknown) {
  const raw = String(value ?? '');
  const start = raw.indexOf(ATTACHMENTS_META_PREFIX);
  const end = raw.indexOf(ATTACHMENTS_META_SUFFIX);
  if (start < 0 || end < 0 || end <= start) {
    return {
      displayContent: raw.trim(),
      attachments: [] as AttachmentItem[],
    };
  }

  const displayContent = `${raw.slice(0, start)}${raw.slice(end + ATTACHMENTS_META_SUFFIX.length)}`.trim();
  const attachmentsText = raw.slice(start + ATTACHMENTS_META_PREFIX.length, end).trim();

  try {
    const parsed = JSON.parse(attachmentsText);
    const attachments = Array.isArray(parsed)
      ? parsed
          .map((item) => ({
            name: String((item as AttachmentItem)?.name ?? '').trim(),
            url: String((item as AttachmentItem)?.url ?? '').trim(),
            type: inferAttachmentType(
              String((item as AttachmentItem)?.name ?? (item as AttachmentItem)?.url ?? ''),
              String((item as AttachmentItem)?.type ?? ''),
            ),
          }))
          .filter((item) => item.name && item.url)
      : [];

    return {
      displayContent,
      attachments,
    };
  } catch {
    return {
      displayContent,
      attachments: [] as AttachmentItem[],
    };
  }
}

function buildAttachmentMetaContent(visibleContent: string, attachments: AttachmentItem[]) {
  if (!attachments.length) return visibleContent.trim();

  const normalizedVisibleContent = visibleContent.trim();
  const payload = attachments.map((item) => ({
    name: String(item.name || '').trim(),
    url: String(item.url || '').trim(),
    type: inferAttachmentType(String(item.name || item.url || ''), String(item.type || '')),
  }));

  return `${normalizedVisibleContent}${normalizedVisibleContent ? '\n' : ''}${ATTACHMENTS_META_PREFIX}${JSON.stringify(payload)}${ATTACHMENTS_META_SUFFIX}`;
}

function extractGuideMetaFromContent(value: unknown) {
  const raw = String(value ?? '');
  const start = raw.indexOf(GUIDE_META_PREFIX);
  const end = raw.indexOf(GUIDE_META_SUFFIX);
  if (start < 0 || end < 0 || end <= start) {
    return {
      displayContent: raw.trim(),
      meta: null as GuideMetaPayload | null,
    };
  }

  const displayContent = `${raw.slice(0, start)}${raw.slice(end + GUIDE_META_SUFFIX.length)}`.trim();
  const metaText = raw.slice(start + GUIDE_META_PREFIX.length, end).trim();

  try {
    return {
      displayContent,
      meta: JSON.parse(metaText) as GuideMetaPayload,
    };
  } catch {
    return {
      displayContent,
      meta: null as GuideMetaPayload | null,
    };
  }
}

function buildGuideContent(description: string, attachments: AttachmentItem[], meta: GuideMetaPayload | null) {
  const attachmentContent = buildAttachmentMetaContent(description, attachments);
  if (!meta) return attachmentContent;

  const normalizedMeta: GuideMetaPayload = {
    kind: meta.kind || 'education',
    audience: meta.audience || 'all_staff',
    department: String(meta.department || '').trim() || undefined,
    keywords: Array.isArray(meta.keywords)
      ? meta.keywords.map((keyword) => String(keyword || '').trim()).filter(Boolean)
      : undefined,
  };

  if (!normalizedMeta.department && (!normalizedMeta.keywords || normalizedMeta.keywords.length === 0)) {
    if (normalizedMeta.kind === 'education' && normalizedMeta.audience === 'all_staff') {
      return attachmentContent;
    }
  }

  return `${attachmentContent}${attachmentContent ? '\n' : ''}${GUIDE_META_PREFIX}${JSON.stringify(normalizedMeta)}${GUIDE_META_SUFFIX}`;
}

function normalizeGuideKind(value: unknown): GuideKind {
  return value === 'handover' ? 'handover' : 'education';
}

function normalizeGuideAudience(value: unknown): GuideAudience {
  if (value === 'new_hire' || value === 'current_staff' || value === 'all_staff') return value;
  return 'all_staff';
}

function parseKeywords(value: string) {
  return Array.from(new Set(value.split(',').map((keyword) => keyword.trim()).filter(Boolean)));
}

function normalizeGuideResource(post: GuideRow): GuideResource {
  const { displayContent: strippedAttachmentContent, attachments: embeddedAttachments } =
    extractAttachmentMetaFromContent(post.content ?? '');
  const { displayContent: description, meta } = extractGuideMetaFromContent(strippedAttachmentContent);
  const attachments = (Array.isArray(post.attachments) && post.attachments.length > 0 ? post.attachments : embeddedAttachments)
    .map((item) => ({
      name: String(item?.name || '').trim(),
      url: String(item?.url || '').trim(),
      type: inferAttachmentType(String(item?.name || item?.url || ''), String(item?.type || '')),
    }))
    .filter((item) => item.name && item.url);

  return {
    ...post,
    description,
    attachments,
    kind: normalizeGuideKind(meta?.kind),
    audience: normalizeGuideAudience(meta?.audience),
    department: String(meta?.department || '').trim(),
    keywords: Array.isArray(meta?.keywords)
      ? meta.keywords.map((keyword) => String(keyword || '').trim()).filter(Boolean)
      : [],
  };
}

function formatDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getGuideKindLabel(kind: GuideKind) {
  return kind === 'handover' ? '인수인계자료' : '교육자료';
}

function getGuideAudienceLabel(audience: GuideAudience) {
  switch (audience) {
    case 'new_hire':
      return '신규직원';
    case 'current_staff':
      return '기존직원';
    default:
      return '전체직원';
  }
}

async function runGuideMutation<T>(
  mutation: (payload: Record<string, unknown>) => PromiseLike<{ data: T | null; error: unknown }>,
  payload: Record<string, unknown>,
) {
  let nextPayload = { ...payload };
  let result = await mutation(nextPayload);
  let guard = 0;

  while (result?.error && guard < GUIDE_POST_OPTIONAL_COLUMNS.length) {
    const missingColumn = GUIDE_POST_OPTIONAL_COLUMNS.find(
      (column) => column in nextPayload && isMissingColumnError(result.error, column),
    );
    if (!missingColumn) break;

    const { [missingColumn]: _removed, ...rest } = nextPayload;
    nextPayload = rest;
    result = await mutation(nextPayload);
    guard += 1;
  }

  return { ...result, payload: nextPayload };
}

export default function GuideLibrary({ user, selectedCo, selectedCompanyId }: Props) {
  const [resources, setResources] = useState<GuideResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | GuideKind>('all');
  const [audienceFilter, setAudienceFilter] = useState<'all' | GuideAudience>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [kind, setKind] = useState<GuideKind>('education');
  const [audience, setAudience] = useState<GuideAudience>('new_hire');
  const [description, setDescription] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [existingAttachments, setExistingAttachments] = useState<AttachmentItem[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const canWrite = canAccessBoard(user, GUIDE_BOARD_TYPE, 'write');
  const isPrivileged = isPrivilegedUser(user);
  const isCrossCompanyViewer = Boolean(user?.permissions?.mso || user?.role === 'admin' || isPrivileged);
  const currentUserId = String(user?.id || '').trim();
  const currentCompanyId = String(user?.company_id || '').trim();
  const activeOrganizationLabel = isCrossCompanyViewer
    ? selectedCo && selectedCo !== '전체'
      ? selectedCo
      : '전체 병원/기관'
    : String(user?.company || '').trim();
  const canManageResource = useCallback(
    (resource?: Pick<GuideResource, 'author_id'> | null) => {
      if (!resource) return false;
      if (isPrivileged || isAdminUser(user)) return true;
      return canWrite && String(resource.author_id || '').trim() === currentUserId;
    },
    [canWrite, currentUserId, isPrivileged, user],
  );

  const resetComposer = useCallback(() => {
    setEditingResourceId(null);
    setTitle('');
    setDepartment('');
    setKind('education');
    setAudience('new_hire');
    setDescription('');
    setKeywordsInput('');
    setExistingAttachments([]);
    setPendingFiles([]);
  }, []);

  const loadResources = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await withMissingColumnsFallback<GuideRow[]>(
        async (omittedColumns): Promise<QueryResult<GuideRow[]>> => {
          const result = await supabase
            .from('board_posts')
            .select(buildSelectColumns(GUIDE_POST_REQUIRED_SELECT_COLUMNS, GUIDE_POST_OPTIONAL_COLUMNS, omittedColumns))
            .eq('board_type', GUIDE_BOARD_TYPE)
            .order('created_at', { ascending: false });
          return result as unknown as QueryResult<GuideRow[]>;
        },
        [...GUIDE_POST_OPTIONAL_COLUMNS],
      );

      setResources(((data || []) as GuideRow[]).map((resource) => normalizeGuideResource(resource)));
    } catch (error) {
      console.error('guide library load failed', error);
      toast('업무가이드를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  useEffect(() => {
    const channel = supabase
      .channel('guide-library-board-posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_posts' }, () => {
        void loadResources();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadResources]);

  const companyScopedResources = useMemo(() => {
    if (isCrossCompanyViewer) {
      if (!selectedCompanyId) return resources;
      return resources.filter((resource) => !resource.company_id || resource.company_id === selectedCompanyId);
    }
    if (!currentCompanyId) return resources;
    return resources.filter((resource) => !resource.company_id || resource.company_id === currentCompanyId);
  }, [currentCompanyId, isCrossCompanyViewer, resources, selectedCompanyId]);

  const departmentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [...GUIDE_DEPARTMENT_PRESETS, ...companyScopedResources.map((resource) => String(resource.department || '').trim())].filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right, 'ko')),
    [companyScopedResources],
  );

  const baseFilteredResources = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return companyScopedResources.filter((resource) => {
      if (kindFilter !== 'all' && resource.kind !== kindFilter) return false;
      if (audienceFilter !== 'all' && resource.audience !== audienceFilter) return false;
      if (!keyword) return true;

      return [
        resource.title,
        resource.description,
        resource.department,
        resource.author_name,
        resource.company,
        ...resource.keywords,
        ...resource.attachments.map((attachment) => attachment.name),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [audienceFilter, companyScopedResources, kindFilter, search]);

  const departmentCounts = useMemo(() => {
    return baseFilteredResources.reduce<Record<string, number>>((counts, resource) => {
      const nextDepartment = String(resource.department || '').trim();
      if (!nextDepartment) return counts;
      counts[nextDepartment] = (counts[nextDepartment] || 0) + 1;
      return counts;
    }, {});
  }, [baseFilteredResources]);

  const filteredResources = useMemo(() => {
    if (departmentFilter === 'all') return baseFilteredResources;
    return baseFilteredResources.filter((resource) => resource.department === departmentFilter);
  }, [baseFilteredResources, departmentFilter]);

  const selectedDepartmentLabel = departmentFilter === 'all' ? '전체 부서' : departmentFilter;

  useEffect(() => {
    if (!selectedResourceId || !filteredResources.some((resource) => resource.id === selectedResourceId)) {
      setSelectedResourceId(filteredResources[0]?.id || null);
    }
  }, [filteredResources, selectedResourceId]);

  const selectedResource = useMemo(
    () => filteredResources.find((resource) => resource.id === selectedResourceId) || null,
    [filteredResources, selectedResourceId],
  );

  const startCreate = useCallback((nextDepartment?: string) => {
    resetComposer();
    if (nextDepartment && nextDepartment !== 'all') {
      setDepartment(nextDepartment);
    }
    setShowComposer(true);
  }, [resetComposer]);

  const startEdit = useCallback((resource: GuideResource) => {
    setEditingResourceId(resource.id);
    setTitle(resource.title || '');
    setDepartment(resource.department || '');
    setKind(resource.kind);
    setAudience(resource.audience);
    setDescription(resource.description || '');
    setKeywordsInput(resource.keywords.join(', '));
    setExistingAttachments(resource.attachments || []);
    setPendingFiles([]);
    setShowComposer(true);
  }, []);

  const uploadGuideAttachment = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('boardType', GUIDE_BOARD_TYPE);
    formData.append('file', file);

    const response = await fetch('/api/board/upload', {
      method: 'POST',
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload?.error || '파일 업로드에 실패했습니다.'));
    }

    return {
      name: String(payload?.fileName || file.name || '').trim(),
      url: String(payload?.url || '').trim(),
      type: inferAttachmentType(String(payload?.fileName || file.name || ''), String(payload?.type || '')),
    } satisfies AttachmentItem;
  }, []);

  const saveResource = useCallback(async () => {
    if (!canWrite) {
      toast('업무가이드 작성 권한이 없습니다.', 'warning');
      return;
    }

    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();
    if (!normalizedTitle) {
      toast('제목을 입력해 주세요.', 'warning');
      return;
    }
    if (!normalizedDescription && existingAttachments.length === 0 && pendingFiles.length === 0) {
      toast('설명 또는 첨부파일을 하나 이상 등록해 주세요.', 'warning');
      return;
    }

    try {
      setSaving(true);

      const uploadedAttachments: AttachmentItem[] = [];
      for (const file of pendingFiles) {
        uploadedAttachments.push(await uploadGuideAttachment(file));
      }

      const attachments = [...existingAttachments, ...uploadedAttachments];
      const meta: GuideMetaPayload = {
        kind,
        audience,
        department: department.trim() || undefined,
        keywords: parseKeywords(keywordsInput),
      };
      const payload: Record<string, unknown> = {
        board_type: GUIDE_BOARD_TYPE,
        title: normalizedTitle,
        content: buildGuideContent(normalizedDescription, attachments, meta) || null,
        author_id: currentUserId || null,
        author_name: user?.name || '익명',
        company: user?.company || null,
        company_id: user?.company_id || null,
        updated_at: new Date().toISOString(),
        attachments,
      };

      if (editingResourceId) {
        const original = resources.find((resource) => resource.id === editingResourceId) || null;
        if (!canManageResource(original)) {
          toast('본인이 작성한 자료만 수정할 수 있습니다.', 'warning');
          return;
        }
        const { data, error, payload: persistedPayload } = await runGuideMutation<GuideRow>(
          (nextPayload) =>
            supabase.from('board_posts').update(nextPayload).eq('id', editingResourceId).select().single(),
          payload,
        );
        if (error) throw error;

        const normalized = normalizeGuideResource({
          ...(original || {}),
          ...(persistedPayload as GuideRow),
          ...(data || {}),
          id: editingResourceId,
        } as GuideRow);
        setResources((prev) => prev.map((resource) => (resource.id === editingResourceId ? normalized : resource)));
        setSelectedResourceId(editingResourceId);
        toast('업무가이드를 수정했습니다.', 'success');
      } else {
        payload.created_at = new Date().toISOString();
        const { data, error, payload: persistedPayload } = await runGuideMutation<GuideRow>(
          (nextPayload) => supabase.from('board_posts').insert([nextPayload]).select().single(),
          payload,
        );
        if (error) throw error;

        const normalized = normalizeGuideResource({
          ...(persistedPayload as GuideRow),
          ...(data || {}),
        } as GuideRow);
        setResources((prev) => [normalized, ...prev]);
        setSelectedResourceId(normalized.id);
        toast('업무가이드를 등록했습니다.', 'success');
      }

      resetComposer();
      setShowComposer(false);
    } catch (error) {
      console.error('guide library save failed', error);
      toast(error instanceof Error ? error.message : '업무가이드 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    audience,
    canManageResource,
    canWrite,
    currentUserId,
    department,
    description,
    editingResourceId,
    existingAttachments,
    kind,
    keywordsInput,
    pendingFiles,
    resetComposer,
    resources,
    title,
    uploadGuideAttachment,
    user?.company,
    user?.company_id,
    user?.name,
  ]);

  const deleteResource = useCallback(async (resource: GuideResource) => {
    if (!canManageResource(resource)) {
      toast('본인이 작성한 자료만 삭제할 수 있습니다.', 'warning');
      return;
    }

    if (!window.confirm(`"${resource.title}" 자료를 삭제할까요?`)) return;

    try {
      const { error } = await supabase.from('board_posts').delete().eq('id', resource.id);
      if (error) throw error;
      setResources((prev) => prev.filter((item) => item.id !== resource.id));
      if (selectedResourceId === resource.id) {
        setSelectedResourceId(null);
      }
      if (editingResourceId === resource.id) {
        resetComposer();
        setShowComposer(false);
      }
      toast('업무가이드를 삭제했습니다.', 'success');
    } catch (error) {
      console.error('guide library delete failed', error);
      toast('업무가이드 삭제 중 오류가 발생했습니다.', 'error');
    }
  }, [canManageResource, editingResourceId, resetComposer, selectedResourceId]);

  const canEditSelected = canManageResource(selectedResource);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto custom-scrollbar p-4 md:p-5" data-testid="guide-library-view">
      <header className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
              업무가이드
            </div>
            <h2 className="text-xl font-bold text-[var(--foreground)]">업무가이드</h2>
            <p className="text-sm font-semibold leading-6 text-[var(--toss-gray-3)]">
              부서 메뉴별로 업무가이드 게시글과 자료를 정리하고, 필요한 파일을 함께 등록해 바로 공유하세요.
              신규 직원 교육자료와 인수인계 문서를 부서 중심으로 관리할 수 있습니다.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 rounded-[var(--radius-lg)] bg-[var(--muted)] p-4 text-xs font-semibold text-[var(--toss-gray-3)] xl:min-w-[240px]">
            <span>표시 기관: {activeOrganizationLabel || '기본 기관'}</span>
            <span>선택 부서: {selectedDepartmentLabel}</span>
            <span>자료 수: {filteredResources.length}건</span>
            <span>첨부 포함: {filteredResources.filter((resource) => resource.attachments.length > 0).length}건</span>
            {!canWrite ? (
              <span className="mt-2 rounded-full bg-white px-3 py-1 text-[11px] text-[var(--foreground)]">
                읽기 전용
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {showComposer && (
        <section data-testid="guide-form" className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--foreground)]">{editingResourceId ? '업무가이드 게시글 수정' : '업무가이드 게시글 등록'}</h3>
                <p className="mt-1 text-xs font-semibold text-[var(--toss-gray-3)]">
                  게시글 내용과 함께 문서, 이미지, 참고 파일을 같이 등록할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetComposer();
                  setShowComposer(false);
                }}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--foreground)]"
              >
                닫기
              </button>
            </div>

            {!editingResourceId && departmentFilter !== 'all' && (
              <div className="rounded-[var(--radius-lg)] bg-[var(--toss-blue-light)] px-4 py-3 text-xs font-semibold text-[var(--accent)]">
                현재 {departmentFilter} 메뉴에서 게시글을 작성 중입니다. 적용 부서는 아래에서 바로 확인하거나 변경할 수 있습니다.
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold text-[var(--foreground)]">제목</span>
                <input
                  data-testid="guide-title-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="예: 인공관절 수술 준비 가이드"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--accent)]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold text-[var(--foreground)]">적용 부서/파트</span>
                <input
                  data-testid="guide-department-input"
                  list="guide-department-options"
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  placeholder="예: 수술실"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--accent)]"
                />
                <datalist id="guide-department-options">
                  {departmentOptions.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold text-[var(--foreground)]">자료 구분</span>
                <select
                  data-testid="guide-kind-select"
                  value={kind}
                  onChange={(event) => setKind(normalizeGuideKind(event.target.value))}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--accent)]"
                >
                  <option value="education">교육자료</option>
                  <option value="handover">인수인계자료</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold text-[var(--foreground)]">대상 직원</span>
                <select
                  data-testid="guide-audience-select"
                  value={audience}
                  onChange={(event) => setAudience(normalizeGuideAudience(event.target.value))}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--accent)]"
                >
                  <option value="new_hire">신규직원</option>
                  <option value="current_staff">기존직원</option>
                  <option value="all_staff">전체직원</option>
                </select>
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-xs font-bold text-[var(--foreground)]">검색 키워드</span>
              <input
                data-testid="guide-keywords-input"
                value={keywordsInput}
                onChange={(event) => setKeywordsInput(event.target.value)}
                placeholder="예: 인공관절, 멸균, 마취 준비"
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-bold text-[var(--foreground)]">설명 / 프로세스</span>
              <textarea
                data-testid="guide-description-input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={10}
                placeholder={'1. 준비 전 확인\n- 환자, 일정, 재고 확인\n\n2. 준비물 세팅\n- 필수 기구와 소모품 준비\n\n3. 진행 순서\n- 실제 업무 순서를 단계별로 작성\n\n4. 주의사항\n- 신규 직원이 헷갈리기 쉬운 포인트 정리'}
                className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold leading-6 outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-bold text-[var(--foreground)]">첨부파일</span>
              <input
                data-testid="guide-file-input"
                type="file"
                multiple
                onChange={(event) => {
                  const files = event.target.files ? Array.from(event.target.files) : [];
                  setPendingFiles((prev) => [...prev, ...files].slice(0, 10));
                  event.currentTarget.value = '';
                }}
                className="block w-full rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold"
              />
            </label>

            {(existingAttachments.length > 0 || pendingFiles.length > 0) && (
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-[var(--radius-lg)] bg-[var(--muted)] p-4">
                  <p className="text-xs font-bold text-[var(--foreground)]">저장된 첨부</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {existingAttachments.map((attachment, index) => (
                      <button
                        key={`${attachment.url}-${index}`}
                        type="button"
                        onClick={() => setExistingAttachments((prev) => prev.filter((_, currentIndex) => currentIndex !== index))}
                        className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--foreground)]"
                      >
                        {attachment.name} ×
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[var(--radius-lg)] bg-[var(--muted)] p-4">
                  <p className="text-xs font-bold text-[var(--foreground)]">새로 올릴 파일</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pendingFiles.map((file, index) => (
                      <button
                        key={`${file.name}-${file.size}-${index}`}
                        type="button"
                        onClick={() => setPendingFiles((prev) => prev.filter((_, currentIndex) => currentIndex !== index))}
                        className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--foreground)]"
                      >
                        {file.name} ×
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  resetComposer();
                  setShowComposer(false);
                }}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--foreground)]"
              >
                취소
              </button>
              <button
                type="button"
                data-testid="guide-save"
                disabled={saving}
                onClick={() => void saveResource()}
                className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? '저장 중...' : editingResourceId ? '수정 저장' : '게시글 등록'}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm" data-testid="guide-department-menu">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">부서별 메뉴</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[var(--toss-gray-3)]">
                    부서를 선택하면 해당 부서의 업무가이드 게시글과 첨부 자료만 볼 수 있습니다.
                  </p>
                </div>
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => startCreate(departmentFilter !== 'all' ? departmentFilter : undefined)}
                    data-testid="guide-open-compose"
                    className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95"
                  >
                    {departmentFilter === 'all' ? '+ 게시글 작성' : `+ ${departmentFilter} 게시글 작성`}
                  </button>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <button
                  type="button"
                  onClick={() => setDepartmentFilter('all')}
                  className={`flex items-center justify-between rounded-[var(--radius-lg)] border px-3 py-3 text-left text-sm font-bold transition ${
                    departmentFilter === 'all'
                      ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--accent)]/40'
                  }`}
                >
                  <span>전체 부서</span>
                  <span className="text-xs">{baseFilteredResources.length}건</span>
                </button>
                {departmentOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setDepartmentFilter(item)}
                    className={`flex items-center justify-between rounded-[var(--radius-lg)] border px-3 py-3 text-left text-sm font-bold transition ${
                      departmentFilter === item
                        ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)]'
                        : 'border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--accent)]/40'
                    }`}
                  >
                    <span>{item}</span>
                    <span className="text-xs">{departmentCounts[item] || 0}건</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="space-y-3">
              <input
                data-testid="guide-search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="제목, 부서, 키워드, 첨부파일명 검색"
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--accent)]"
              />

              <div className="flex flex-wrap gap-2">
                {(['all', 'education', 'handover'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setKindFilter(value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      kindFilter === value ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--foreground)]'
                    }`}
                  >
                    {value === 'all' ? '전체 자료' : value === 'education' ? '교육자료' : '인수인계자료'}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {(['all', 'new_hire', 'current_staff', 'all_staff'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAudienceFilter(value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      audienceFilter === value ? 'bg-[var(--foreground)] text-white' : 'bg-[var(--muted)] text-[var(--foreground)]'
                    }`}
                  >
                    {value === 'all' ? '전체 대상' : getGuideAudienceLabel(value)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">
                    {departmentFilter === 'all' ? '전체 부서 게시글 / 자료' : `${departmentFilter} 게시글 / 자료`}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[var(--toss-gray-3)]">
                    {departmentFilter === 'all'
                      ? '부서 메뉴를 선택하면 원하는 부서의 게시글과 첨부 자료만 빠르게 볼 수 있습니다.'
                      : `${departmentFilter} 메뉴에 등록된 업무가이드와 자료입니다.`}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-bold text-[var(--foreground)]">
                  {filteredResources.length}건
                </span>
              </div>
            </div>

            {loading ? (
              <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm font-semibold text-[var(--toss-gray-3)]">
                업무가이드를 불러오는 중입니다.
              </div>
            ) : filteredResources.length === 0 ? (
              <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-8 text-center">
                <p className="text-base font-bold text-[var(--foreground)]">등록된 게시글이 없습니다.</p>
                <p className="mt-2 text-sm font-semibold text-[var(--toss-gray-3)]">
                  {departmentFilter === 'all'
                    ? '먼저 부서를 선택한 뒤 SOP, 준비물, 인수인계 포인트를 게시글과 첨부 자료로 정리해 두세요.'
                    : `${departmentFilter} 메뉴에 첫 업무가이드 게시글과 자료를 등록해 보세요.`}
                </p>
              </div>
            ) : (
              filteredResources.map((resource) => (
                <button
                  key={resource.id}
                  type="button"
                  data-testid={`guide-card-${resource.id}`}
                  onClick={() => setSelectedResourceId(resource.id)}
                  className={`w-full rounded-[var(--radius-xl)] border p-4 text-left shadow-sm transition ${
                    selectedResourceId === resource.id
                      ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]'
                      : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--accent)]">
                      {getGuideKindLabel(resource.kind)}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--foreground)]">
                      {getGuideAudienceLabel(resource.audience)}
                    </span>
                    {resource.department && (
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--foreground)]">
                        {resource.department}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-base font-bold text-[var(--foreground)]">{resource.title}</p>
                  <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-[var(--toss-gray-3)]">
                    {resource.description || '설명 없음'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    <span>{resource.author_name || '작성자 미상'}</span>
                    <span>{formatDate(resource.updated_at || resource.created_at)}</span>
                    <span>첨부 {resource.attachments.length}개</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="min-w-0">
          {selectedResource ? (
            <article data-testid="guide-detail" className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-[var(--toss-blue-light)] px-3 py-1 text-xs font-bold text-[var(--accent)]">
                        {getGuideKindLabel(selectedResource.kind)}
                      </span>
                      <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-bold text-[var(--foreground)]">
                        {getGuideAudienceLabel(selectedResource.audience)}
                      </span>
                      {selectedResource.department && (
                        <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-bold text-[var(--foreground)]">
                          {selectedResource.department}
                        </span>
                      )}
                    </div>
                    <h3 className="text-2xl font-bold text-[var(--foreground)]">{selectedResource.title}</h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-[var(--toss-gray-3)]">
                      <span>{selectedResource.author_name || '작성자 미상'}</span>
                      <span>{selectedResource.company || activeOrganizationLabel || '기본 기관'}</span>
                      <span>{formatDate(selectedResource.updated_at || selectedResource.created_at)}</span>
                    </div>
                  </div>

                  {canEditSelected && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        data-testid="guide-edit"
                        onClick={() => startEdit(selectedResource)}
                        className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--foreground)]"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        data-testid="guide-delete"
                        onClick={() => void deleteResource(selectedResource)}
                        className="rounded-full bg-rose-500 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>

                {selectedResource.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedResource.keywords.map((keyword) => (
                      <span key={keyword} className="rounded-full bg-[var(--muted)] px-3 py-1 text-[11px] font-bold text-[var(--foreground)]">
                        #{keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-6 py-5">
                <section className="space-y-3">
                  <h4 className="text-sm font-bold text-[var(--foreground)]">프로세스 설명</h4>
                  <div className="rounded-[var(--radius-lg)] bg-[var(--muted)] p-4 text-sm font-semibold leading-7 text-[var(--foreground)] whitespace-pre-wrap">
                    {selectedResource.description || '설명 없음'}
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-bold text-[var(--foreground)]">첨부 자료</h4>
                    <span className="text-xs font-semibold text-[var(--toss-gray-3)]">{selectedResource.attachments.length}개</span>
                  </div>
                  {selectedResource.attachments.length === 0 ? (
                    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                      첨부파일이 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        {selectedResource.attachments.map((attachment, index) => (
                          <a
                            key={`${attachment.url}-${index}`}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4 transition hover:border-[var(--accent)]"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-[var(--foreground)]">{attachment.name}</p>
                                <p className="mt-1 text-xs font-semibold text-[var(--toss-gray-3)]">
                                  {attachment.type === 'image' ? '이미지' : attachment.type === 'video' ? '동영상' : '파일'}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full bg-[var(--toss-blue-light)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent)]">
                                열기
                              </span>
                            </div>
                          </a>
                        ))}
                      </div>

                      {selectedResource.attachments.some((attachment) => attachment.type === 'image') && (
                        <div className="grid gap-3 md:grid-cols-2">
                          {selectedResource.attachments
                            .filter((attachment) => attachment.type === 'image')
                            .map((attachment, index) => (
                              <a
                                key={`${attachment.url}-preview-${index}`}
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white"
                              >
                                <img src={attachment.url} alt={attachment.name} className="h-48 w-full object-cover" />
                              </a>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </article>
          ) : (
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-10 text-center shadow-sm">
              <p className="text-lg font-bold text-[var(--foreground)]">보고 싶은 자료를 선택해 주세요.</p>
              <p className="mt-2 text-sm font-semibold text-[var(--toss-gray-3)]">
                부서별 업무가이드, SOP, 인수인계 문서를 오른쪽에서 자세히 확인할 수 있습니다.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

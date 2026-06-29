'use client';

import { useCallback, useEffect, useMemo, useState, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { EmptyState, LoadingPanel } from '@/app/components/StatePanel';
import { useActionDialog } from '@/app/components/useActionDialog';
import { canAccessBoard, isAdminUser, isPrivilegedUser } from '@/lib/access-control';
import {
  buildStorageDownloadUrl,
  shouldUseManagedBrowserDownload,
  triggerManagedBrowserDownload,
} from '@/lib/object-storage-url';
import { supabase } from '@/lib/d1-supabase-compat';
import { subscribeRealtime } from '@/lib/realtime-bus';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { toast } from '@/lib/toast';
import { logger } from '@/lib/logger';
import type { AttachmentItem } from '@/types';
import { uploadBoardAttachmentFile } from '../게시판업로드';
import { useAppData } from '@/app/main/contexts/AppDataContext';
import GuideDetailPanel from './GuideDetailPanel';
import type {
  GuideAudience,
  GuideKind,
  GuideLibraryProps as Props,
  GuideMetaPayload,
  GuideResource,
  GuideRow,
  GuideTask,
  GuideTaskMetaPayload,
  GuideTaskPriority,
  OrgStaffRow,
  OrgTeamRow,
  TeamScope,
} from './guide-types';
import {
  GUIDE_BOARD_TYPE,
  GUIDE_DISPLAY_NAME,
  GUIDE_POST_OPTIONAL_COLUMNS,
  GUIDE_POST_REQUIRED_SELECT_COLUMNS,
  GUIDE_TASK_BOARD_TYPE,
  buildCompanyScopes,
  buildGuideContent,
  buildGuideTaskContent,
  buildSelectColumns,
  buildTeamKey,
  formatDate,
  formatDateOnly,
  getGuideAudienceLabel,
  getGuideKindLabel,
  getTaskPriorityMeta,
  inferAttachmentType,
  matchesTeamScope,
  normalizeGuideAudience,
  normalizeGuideResource,
  normalizeGuideTask,
  normalizeGuideTaskPriority,
  normalizeText,
  parseKeywords,
  runGuideMutation,
  sortGuideTasks,
} from './guide-utils';
import { 
  Plus, 
  Search, 
  FileText, 
  X, 
  Edit, 
  ChevronRight, 
  Check, 
  AlertTriangle, 
  Upload, 
  MoreHorizontal,
  FolderOpen
} from 'lucide-react';

type QueryResult<T> = {
  data: T | null;
  error: unknown;
};

function isGuideAudience(value: string): value is GuideAudience {
  return value === 'new_hire' || value === 'current_staff' || value === 'all_staff';
}

function isGuideKind(value: string): value is GuideKind {
  return value === 'education' || value === 'handover';
}

function rel(dateStr: string | null | undefined) {
  const raw = normalizeText(dateStr);
  if (!raw) return '';
  const d = new Date(raw);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  
  const todayStr = now.toDateString();
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === todayStr) return '오늘';
  if (d.toDateString() === yest.toDateString()) return '어제';
  if (diffDay < 7) return `${diffDay}일 전`;

  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

export default function GuideLibrary({ user, selectedCo, selectedCompanyId }: Props) {
  const { dialog, openConfirm } = useActionDialog();
  const { data: appData } = useAppData();
  const [resources, setResources] = useState<GuideResource[]>([]);
  const [teamTasks, setTeamTasks] = useState<GuideTask[]>([]);
  const [orgTeams, setOrgTeams] = useState<OrgTeamRow[]>([]);
  
  const staffDirectory = useMemo<OrgStaffRow[]>(
    () =>
      appData.staffs.map((s) => ({
        id: s.id ?? null,
        company: s.company ?? null,
        company_id: s.company_id ?? null,
        department: s.department ?? null,
        status: s.status ?? null,
      })),
    [appData.staffs],
  );
  
  const [loading, setLoading] = useState(true);
  const [savingResource, setSavingResource] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [savingTask, setSavingTask] = useState(false);

  // B안 신규 상태 제어
  const [activeTab, setActiveTab] = useState<'res' | 'task'>('res');
  const [showComposer, setShowComposer] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  
  // 검증 및 칩 입력을 위한 컴포저 용 로컬 상태
  const [touched, setTouched] = useState(false);
  const [keywordsList, setKeywordsList] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [companyFilter, setCompanyFilter] = useState('');
  const [selectedTeamKey, setSelectedTeamKey] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | GuideKind>('all');
  const [audienceFilter, setAudienceFilter] = useState<'all' | GuideAudience>('all');
  const [taskFilter, setTaskFilter] = useState<'all' | 'open' | 'done'>('all');

  const [title, setTitle] = useState('');
  const [teamName, setTeamName] = useState('');
  const [divisionName, setDivisionName] = useState('');
  const [kind, setKind] = useState<GuideKind>('education');
  const [audience, setAudience] = useState<GuideAudience>('new_hire');
  const [description, setDescription] = useState('');
  const [existingAttachments, setExistingAttachments] = useState<AttachmentItem[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskNote, setTaskNote] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState<GuideTaskPriority>('medium');
  
  const [toastMessage, setToastMessage] = useState('');

  const canWrite = canAccessBoard(user, GUIDE_BOARD_TYPE, 'write');
  const isPrivileged = isPrivilegedUser(user);
  const isCrossCompanyViewer = true; // 모든회사 전 직원이 조회 가능하도록 설정
  const currentUserId = normalizeText(user?.id);
  const currentCompanyId = normalizeText(user?.company_id);
  const currentCompanyName = normalizeText(user?.company);

  const canManagePost = useCallback(
    (item?: Pick<GuideRow, 'author_id'> | null) => {
      if (!item) return false;
      if (isPrivileged || isAdminUser(user)) return true;
      return normalizeText(item.author_id) === currentUserId;
    },
    [currentUserId, isPrivileged, user],
  );

  const resetComposer = useCallback((nextTeam?: TeamScope | null) => {
    setEditingResourceId(null);
    setTitle('');
    setTeamName(nextTeam?.teamName || '');
    setDivisionName(nextTeam?.divisionName || '');
    setKind('education');
    setAudience('new_hire');
    setDescription('');
    setKeywordsList([]);
    setKeywordInput('');
    setExistingAttachments([]);
    setPendingFiles([]);
    setTouched(false);
  }, []);

  const resetTaskComposer = useCallback(() => {
    setEditingTaskId(null);
    setTaskTitle('');
    setTaskNote('');
    setTaskDueDate('');
    setTaskPriority('medium');
  }, []);

  const loadGuideWorkspace = useCallback(async () => {
    try {
      setLoading(true);

      const [resourceResult, taskResult, orgTeamResult] = await Promise.all([
        withMissingColumnsFallback<GuideRow[]>(
          async (omittedColumns): Promise<QueryResult<GuideRow[]>> => {
            const result = await supabase
              .from('board_posts')
              .select(buildSelectColumns(GUIDE_POST_REQUIRED_SELECT_COLUMNS, GUIDE_POST_OPTIONAL_COLUMNS, omittedColumns))
              .eq('board_type', GUIDE_BOARD_TYPE)
              .order('created_at', { ascending: false });
            return result as unknown as QueryResult<GuideRow[]>;
          },
          [...GUIDE_POST_OPTIONAL_COLUMNS],
        ),
        withMissingColumnsFallback<GuideRow[]>(
          async (omittedColumns): Promise<QueryResult<GuideRow[]>> => {
            const result = await supabase
              .from('board_posts')
              .select(buildSelectColumns(GUIDE_POST_REQUIRED_SELECT_COLUMNS, GUIDE_POST_OPTIONAL_COLUMNS, omittedColumns))
              .eq('board_type', GUIDE_TASK_BOARD_TYPE)
              .order('created_at', { ascending: false });
            return result as unknown as QueryResult<GuideRow[]>;
          },
          [...GUIDE_POST_OPTIONAL_COLUMNS],
        ),
        supabase.from('org_teams').select('id, company_name, division, team_name, sort_order').order('company_name').order('division').order('sort_order'),
      ]);

      setResources(((resourceResult.data || []) as GuideRow[]).map((item) => normalizeGuideResource(item)));
      setTeamTasks(sortGuideTasks(((taskResult.data || []) as GuideRow[]).map((item) => normalizeGuideTask(item))));
      setOrgTeams(((orgTeamResult.data || []) as OrgTeamRow[]) ?? []);
    } catch (error) {
      logger.error('guide workspace load failed', error);
      toast(`${GUIDE_DISPLAY_NAME} 화면을 불러오지 못했습니다.`, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGuideWorkspace();
  }, [loadGuideWorkspace]);

  useEffect(() => {
    const unsubscribe = subscribeRealtime(
      'guide-workspace',
      [
        { table: 'board_posts', event: '*' },
        { table: 'org_teams', event: '*' },
      ],
      () => { void loadGuideWorkspace(); },
      { batchWindowMs: 1000 },
    );
    return unsubscribe;
  }, [loadGuideWorkspace]);

  const staffSeed = useMemo<OrgStaffRow[]>(() => {
    const seeds = [...staffDirectory];
    if (currentUserId || currentCompanyName) {
      seeds.push({
        id: currentUserId || 'current-user',
        company: currentCompanyName || '기본 기관',
        company_id: currentCompanyId || null,
        department: normalizeText(user?.department) || '미지정',
        status: normalizeText(user?.status) || '재직',
      });
    }
    return seeds;
  }, [currentCompanyId, currentCompanyName, currentUserId, staffDirectory, user?.department, user?.status]);

  const viewerScopedResources = useMemo(() => {
    if (isCrossCompanyViewer) {
      return resources;
    }

    if (currentCompanyId) {
      return resources.filter((item) => !normalizeText(item.company_id) || normalizeText(item.company_id) === currentCompanyId);
    }
    if (currentCompanyName) {
      return resources.filter((item) => !normalizeText(item.company) || normalizeText(item.company) === currentCompanyName);
    }
    return resources;
  }, [currentCompanyId, currentCompanyName, isCrossCompanyViewer, resources]);

  const viewerScopedTasks = useMemo(() => {
    if (isCrossCompanyViewer) {
      return teamTasks;
    }

    if (currentCompanyId) {
      return teamTasks.filter((item) => !normalizeText(item.company_id) || normalizeText(item.company_id) === currentCompanyId);
    }
    if (currentCompanyName) {
      return teamTasks.filter((item) => !normalizeText(item.company) || normalizeText(item.company) === currentCompanyName);
    }
    return teamTasks;
  }, [currentCompanyId, currentCompanyName, isCrossCompanyViewer, teamTasks]);

  const companyScopes = useMemo(
    () => buildCompanyScopes(orgTeams, staffSeed, viewerScopedResources, viewerScopedTasks),
    [orgTeams, staffSeed, viewerScopedResources, viewerScopedTasks],
  );

  const companyOptions = useMemo(() => companyScopes.map((company) => company.companyName), [companyScopes]);

  useEffect(() => {
    const preferredCompany =
      isCrossCompanyViewer && selectedCo && selectedCo !== '전체'
        ? selectedCo
        : currentCompanyName || companyOptions[0] || '';

    setCompanyFilter((prev) => {
      if (prev && companyOptions.includes(prev)) return prev;
      return preferredCompany && companyOptions.includes(preferredCompany) ? preferredCompany : companyOptions[0] || '';
    });
  }, [companyOptions, currentCompanyName, isCrossCompanyViewer, selectedCo]);

  const selectedCompany = useMemo(
    () => companyScopes.find((item) => item.companyName === companyFilter) || null,
    [companyFilter, companyScopes],
  );

  const companyTeams = useMemo(
    () => selectedCompany?.divisions.flatMap((division) => division.teams) || [],
    [selectedCompany],
  );

  useEffect(() => {
    setSelectedTeamKey((prev) => {
      if (prev && companyTeams.some((team) => team.key === prev)) return prev;
      return companyTeams[0]?.key || '';
    });
  }, [companyTeams]);

  const activeTeam = useMemo(
    () => companyTeams.find((team) => team.key === selectedTeamKey) || null,
    [companyTeams, selectedTeamKey],
  );

  useEffect(() => {
    if (!showComposer || editingResourceId || !activeTeam) return;
    setTeamName(activeTeam.teamName);
    setDivisionName(activeTeam.divisionName);
  }, [activeTeam, editingResourceId, showComposer]);

  const resourceCountsByTeamKey = useMemo(() => {
    const counts: Record<string, number> = {};
    companyTeams.forEach((team) => {
      counts[team.key] = viewerScopedResources.filter((item) => matchesTeamScope(item, team)).length;
    });
    return counts;
  }, [companyTeams, viewerScopedResources]);

  const taskCountsByTeamKey = useMemo(() => {
    const counts: Record<string, number> = {};
    companyTeams.forEach((team) => {
      counts[team.key] = viewerScopedTasks.filter((item) => matchesTeamScope(item, team) && !item.isDone).length;
    });
    return counts;
  }, [companyTeams, viewerScopedTasks]);

  const handoverCountsByTeamKey = useMemo(() => {
    const counts: Record<string, number> = {};
    companyTeams.forEach((team) => {
      counts[team.key] = viewerScopedResources.filter((item) => matchesTeamScope(item, team) && item.kind === 'handover').length;
    });
    return counts;
  }, [companyTeams, viewerScopedResources]);

  const teamResources = useMemo(() => {
    if (!activeTeam) return [];
    return viewerScopedResources.filter((item) => matchesTeamScope(item, activeTeam));
  }, [activeTeam, viewerScopedResources]);

  const filteredResources = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return teamResources.filter((resource) => {
      if (kindFilter !== 'all' && resource.kind !== kindFilter) return false;
      if (audienceFilter !== 'all' && resource.audience !== audienceFilter) return false;
      if (!keyword) return true;

      return [
        resource.title,
        resource.description,
        resource.teamName,
        resource.divisionName,
        resource.author_name,
        ...resource.keywords,
        ...resource.attachments.map((attachment) => attachment.name),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [audienceFilter, kindFilter, search, teamResources]);

  const selectedResource = useMemo(
    () => resources.find((resource) => resource.id === selectedResourceId) || null,
    [resources, selectedResourceId],
  );

  const activeTeamTasks = useMemo(() => {
    if (!activeTeam) return [];
    return sortGuideTasks(
      viewerScopedTasks.filter((task) => matchesTeamScope(task, activeTeam)).filter((task) => {
        if (taskFilter === 'done') return task.isDone;
        if (taskFilter === 'open') return !task.isDone;
        return true;
      }),
    );
  }, [activeTeam, taskFilter, viewerScopedTasks]);

  const activeCompanyLabel = selectedCompany?.companyName || companyFilter || selectedCo || currentCompanyName || '기본 기관';
  const activeTeamResourceCount = activeTeam ? resourceCountsByTeamKey[activeTeam.key] || 0 : 0;
  const activeTeamTaskCount = activeTeam ? taskCountsByTeamKey[activeTeam.key] || 0 : 0;
  const activeTeamHandoverCount = activeTeam ? handoverCountsByTeamKey[activeTeam.key] || 0 : 0;

  const uploadGuideAttachment = useCallback(async (file: File, onProgress?: (p: number) => void) => {
    const uploaded = await uploadBoardAttachmentFile(file, GUIDE_BOARD_TYPE, { onProgress });
    return {
      name: normalizeText(uploaded.name),
      url: normalizeText(uploaded.url),
      type: inferAttachmentType(normalizeText(uploaded.name), normalizeText(uploaded.type)),
    } satisfies AttachmentItem;
  }, []);

  const startCreate = useCallback((nextTeam?: TeamScope | null) => {
    resetComposer(nextTeam || activeTeam);
    setShowComposer(true);
  }, [activeTeam, resetComposer]);

  const startEdit = useCallback((resource: GuideResource) => {
    setEditingResourceId(resource.id);
    setTitle(resource.title || '');
    setTeamName(resource.teamName || '');
    setDivisionName(resource.divisionName || '');
    setKind(resource.kind);
    setAudience(resource.audience);
    setDescription(resource.description || '');
    setKeywordsList(resource.keywords);
    setExistingAttachments(resource.attachments || []);
    setPendingFiles([]);
    setTouched(false);
    setShowComposer(true);

    if (resource.companyName) {
      setCompanyFilter(resource.companyName);
      setSelectedTeamKey(buildTeamKey(resource.companyName, resource.teamName || '미지정'));
    }
  }, []);

  const addKeyword = (value: string) => {
    const trimmed = value.trim().replace(/,/g, '');
    if (trimmed && !keywordsList.includes(trimmed)) {
      setKeywordsList([...keywordsList, trimmed]);
    }
    setKeywordInput('');
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addKeyword(keywordInput);
    } else if (e.key === 'Backspace' && !keywordInput && keywordsList.length > 0) {
      setKeywordsList(keywordsList.slice(0, -1));
    }
  };

  const saveResource = useCallback(async () => {
    setTouched(true);
    const targetTeam = companyTeams.find((team) => team.teamName === teamName) || activeTeam;
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();

    if (!canWrite) {
      toast(`${GUIDE_DISPLAY_NAME} 작성 권한이 없습니다.`, 'warning');
      return;
    }
    if (!targetTeam) {
      toast('자료를 등록할 팀을 먼저 선택해 주세요.', 'warning');
      return;
    }
    if (!normalizedTitle) {
      return; // 폼 필드 자체 에러 렌더링
    }
    if (!normalizedDescription && existingAttachments.length === 0 && pendingFiles.length === 0) {
      return; // 폼 필드 자체 에러 렌더링
    }

    try {
      setSavingResource(true);
      setUploadProgress(0);

      const uploadedAttachments: AttachmentItem[] = [];
      const totalSize = pendingFiles.reduce((acc, f) => acc + f.size, 0);
      let loadedSoFar = 0;

      for (const file of pendingFiles) {
        uploadedAttachments.push(
          await uploadGuideAttachment(file, (progress) => {
            if (totalSize > 0) {
              const currentFileLoaded = (progress / 100) * file.size;
              setUploadProgress(Math.round(((loadedSoFar + currentFileLoaded) / totalSize) * 100));
            }
          })
        );
        loadedSoFar += file.size;
      }

      const attachments = [...existingAttachments, ...uploadedAttachments];
      const meta: GuideMetaPayload = {
        kind,
        audience,
        teamName: targetTeam.teamName,
        divisionName: divisionName.trim() || targetTeam.divisionName,
        companyName: targetTeam.companyName,
        keywords: keywordsList,
      };

      const payload: Record<string, unknown> = {
        board_type: GUIDE_BOARD_TYPE,
        title: normalizedTitle,
        content: buildGuideContent(normalizedDescription, attachments, meta) || null,
        author_id: currentUserId || null,
        author_name: user?.name || '익명',
        company: targetTeam.companyName,
        company_id: targetTeam.companyId || selectedCompanyId || user?.company_id || null,
        updated_at: new Date().toISOString(),
        attachments,
      };

      if (editingResourceId) {
        const original = resources.find((resource) => resource.id === editingResourceId) || null;
        if (!canManagePost(original)) {
          toast('본인이 작성한 자료만 수정할 수 있습니다.', 'warning');
          return;
        }

        const { data, error, payload: persistedPayload } = await runGuideMutation<GuideRow>(
          (nextPayload) => supabase.from('board_posts').update(nextPayload).eq('id', editingResourceId).select().single(),
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
        
        setToastMessage('업무자료를 수정했습니다.');
        setTimeout(() => setToastMessage(''), 2600);
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
        normalized.isNew = true;
        setResources((prev) => [normalized, ...prev]);
        setSelectedResourceId(normalized.id);
        setSelectedTeamKey(buildTeamKey(targetTeam.companyName, targetTeam.teamName));
        
        setToastMessage('업무자료를 등록했습니다.');
        setTimeout(() => setToastMessage(''), 2600);
      }

      resetComposer(targetTeam);
      setShowComposer(false);
    } catch (error) {
      logger.error('guide resource save failed', error);
      toast(error instanceof Error ? error.message : '업무자료 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingResource(false);
    }
  }, [
    activeTeam,
    audience,
    canManagePost,
    canWrite,
    companyTeams,
    currentUserId,
    description,
    divisionName,
    editingResourceId,
    existingAttachments,
    kind,
    keywordsList,
    pendingFiles,
    resetComposer,
    resources,
    selectedCompanyId,
    teamName,
    title,
    uploadGuideAttachment,
    user?.company_id,
    user?.name,
  ]);

  const deleteResource = useCallback(async (resource: GuideResource) => {
    if (!canManagePost(resource)) {
      toast('본인이 작성한 자료만 삭제할 수 있습니다.', 'warning');
      return false;
    }
    const confirmed = await openConfirm({
      title: '업무자료 삭제',
      description: `"${resource.title}" 자료를 삭제합니다.\n첨부와 연결된 안내 흐름에서 더 이상 보이지 않습니다.`,
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return false;

    try {
      const { error } = await supabase.from('board_posts').delete().eq('id', resource.id);
      if (error) throw error;
      setResources((prev) => prev.filter((item) => item.id !== resource.id));
      if (selectedResourceId === resource.id) {
        setSelectedResourceId(null);
      }
      if (editingResourceId === resource.id) {
        resetComposer(activeTeam);
        setShowComposer(false);
      }
      toast('업무자료를 삭제했습니다.', 'success');
      return true;
    } catch (error) {
      logger.error('guide resource delete failed', error);
      toast('업무자료 삭제 중 오류가 발생했습니다.', 'error');
      return false;
    }
  }, [activeTeam, canManagePost, editingResourceId, resetComposer, selectedResourceId]);

  const startTaskEdit = useCallback((task: GuideTask) => {
    setEditingTaskId(task.id);
    setTaskTitle(task.title || '');
    setTaskNote(task.note || '');
    setTaskDueDate(task.dueDate || '');
    setTaskPriority(task.priority);
  }, []);

  const saveTask = useCallback(async () => {
    if (!canWrite) {
      toast('팀 할일 작성 권한이 없습니다.', 'warning');
      return;
    }
    if (!activeTeam) {
      toast('팀을 먼저 선택해 주세요.', 'warning');
      return;
    }

    const normalizedTitle = taskTitle.trim();
    if (!normalizedTitle) {
      toast('할일 제목을 입력해 주세요.', 'warning');
      return;
    }

    const payload: Record<string, unknown> = {
      board_type: GUIDE_TASK_BOARD_TYPE,
      title: normalizedTitle,
      content: buildGuideTaskContent(taskNote, {
        companyName: activeTeam.companyName,
        divisionName: activeTeam.divisionName,
        teamName: activeTeam.teamName,
        dueDate: taskDueDate.trim() || undefined,
        priority: taskPriority,
        isDone: false,
        completedAt: undefined,
        completedById: undefined,
        completedByName: undefined,
      }),
      author_id: currentUserId || null,
      author_name: user?.name || '익명',
      company: activeTeam.companyName,
      company_id: activeTeam.companyId || selectedCompanyId || user?.company_id || null,
      updated_at: new Date().toISOString(),
      attachments: [],
    };

    try {
      setSavingTask(true);

      if (editingTaskId) {
        const original = teamTasks.find((task) => task.id === editingTaskId) || null;
        if (!canManagePost(original)) {
          toast('본인이 작성한 팀 할일만 수정할 수 있습니다.', 'warning');
          return;
        }

        payload.content = buildGuideTaskContent(taskNote, {
          companyName: activeTeam.companyName,
          divisionName: activeTeam.divisionName,
          teamName: activeTeam.teamName,
          dueDate: taskDueDate.trim() || undefined,
          priority: taskPriority,
          isDone: Boolean(original?.isDone),
          completedAt: original?.completedAt || undefined,
          completedById: original?.completedById || undefined,
          completedByName: original?.completedByName || undefined,
        });

        const { data, error, payload: persistedPayload } = await runGuideMutation<GuideRow>(
          (nextPayload) => supabase.from('board_posts').update(nextPayload).eq('id', editingTaskId).select().single(),
          payload,
        );
        if (error) throw error;

        const normalized = normalizeGuideTask({
          ...(original || {}),
          ...(persistedPayload as GuideRow),
          ...(data || {}),
          id: editingTaskId,
        } as GuideRow);
        setTeamTasks((prev) => sortGuideTasks(prev.map((task) => (task.id === editingTaskId ? normalized : task))));
        toast('팀 할일을 수정했습니다.', 'success');
      } else {
        payload.created_at = new Date().toISOString();
        const { data, error, payload: persistedPayload } = await runGuideMutation<GuideRow>(
          (nextPayload) => supabase.from('board_posts').insert([nextPayload]).select().single(),
          payload,
        );
        if (error) throw error;

        const normalized = normalizeGuideTask({
          ...(persistedPayload as GuideRow),
          ...(data || {}),
        } as GuideRow);
        setTeamTasks((prev) => sortGuideTasks([normalized, ...prev]));
        toast('팀 할일을 등록했습니다.', 'success');
      }

      resetTaskComposer();
    } catch (error) {
      logger.error('guide task save failed', error);
      toast(error instanceof Error ? error.message : '팀 할일 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingTask(false);
    }
  }, [
    activeTeam,
    canManagePost,
    canWrite,
    currentUserId,
    editingTaskId,
    resetTaskComposer,
    selectedCompanyId,
    taskDueDate,
    taskNote,
    taskPriority,
    taskTitle,
    teamTasks,
    user?.company_id,
    user?.name,
  ]);

  const toggleTask = useCallback(async (task: GuideTask) => {
    if (!canWrite) {
      toast('팀 할일 상태를 변경할 권한이 없습니다.', 'warning');
      return;
    }

    const nextTask = {
      ...task,
      isDone: !task.isDone,
      completedAt: task.isDone ? '' : new Date().toISOString(),
      completedById: task.isDone ? '' : currentUserId || '',
      completedByName: task.isDone ? '' : (user?.name || ''),
      updated_at: new Date().toISOString(),
      content: buildGuideTaskContent(task.note, {
        companyName: task.companyName || task.company || activeCompanyLabel,
        divisionName: task.divisionName,
        teamName: task.teamName,
        dueDate: task.dueDate || undefined,
        priority: task.priority,
        isDone: !task.isDone,
        completedAt: task.isDone ? undefined : new Date().toISOString(),
        completedById: task.isDone ? undefined : currentUserId || undefined,
        completedByName: task.isDone ? undefined : user?.name || undefined,
      }),
    };

    setTeamTasks((prev) => sortGuideTasks(prev.map((item) => (item.id === task.id ? nextTask : item))));

    try {
      const { error } = await supabase.from('board_posts').update({
        content: nextTask.content,
        updated_at: nextTask.updated_at,
      }).eq('id', task.id);
      if (error) throw error;
    } catch (error) {
      logger.error('guide task toggle failed', error);
      void loadGuideWorkspace();
    }
  }, [activeCompanyLabel, canWrite, currentUserId, loadGuideWorkspace, user?.name]);

  const deleteTask = useCallback(async (task: GuideTask) => {
    if (!canManagePost(task)) {
      toast('본인이 작성한 팀 할일만 삭제할 수 있습니다.', 'warning');
      return;
    }
    const confirmed = await openConfirm({
      title: '팀 할일 삭제',
      description: `"${task.title}" 팀 할일을 삭제합니다.\n담당자와 마감일 기준 목록에서도 함께 사라집니다.`,
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      const { error } = await supabase.from('board_posts').delete().eq('id', task.id);
      if (error) throw error;
      setTeamTasks((prev) => prev.filter((item) => item.id !== task.id));
      if (editingTaskId === task.id) {
        resetTaskComposer();
      }
      toast('팀 할일을 삭제했습니다.', 'success');
    } catch (error) {
      logger.error('guide task delete failed', error);
      toast('팀 할일 삭제 중 오류가 발생했습니다.', 'error');
    }
  }, [canManagePost, editingTaskId, resetTaskComposer]);

  const canEditSelected = canManagePost(selectedResource);

  // 모달 에러 계산
  const titleErr = touched && !title.trim();
  const contentErr = touched && !description.trim() && existingAttachments.length === 0 && pendingFiles.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 md:p-4 bg-[var(--background)]" data-testid="guide-library-view">
      {dialog}

      {/* 헤더 + 통계 */}
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm shrink-0">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[11px] font-bold text-[var(--toss-gray-3)] tracking-wider">
              게시판 › <h2 className="text-[var(--accent)] font-extrabold text-[11px] m-0 inline" style={{ fontSize: '11px' }}>업무공유</h2>
            </div>
            <h1 className="text-xl font-extrabold text-[var(--foreground)] tracking-tight mt-1">
              {activeCompanyLabel} · {activeTeam?.teamName || '팀 미지정'}
            </h1>
            <p className="text-xs text-[var(--toss-gray-3)] mt-1.5">
              팀 단위로 자료·인수인계·할일을 한 곳에서 관리합니다. 신규 입사자 온보딩과 업무 전달 기록이 모입니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--accent-soft)] text-[var(--accent)]">
              <b>{activeTeamResourceCount}</b> 자료
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600">
              <b>{activeTeamHandoverCount}</b> 인수인계
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--muted)] text-[var(--toss-gray-3)]">
              <b>{activeTeamTaskCount}</b> 할일
            </span>
            {canWrite && (
              <button
                data-testid="guide-open-compose"
                onClick={() => startCreate(activeTeam)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 transition-all shadow-[var(--shadow-xs)]"
              >
                <Plus size={14} /> 새 자료 등록
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 메인 2컬럼 레이아웃 */}
      <div className="flex flex-1 gap-4 min-h-0 min-w-0">
        
        {/* 좌측 팀 레일 (Left Rail, 244px 고정) */}
        <aside className="w-[244px] shrink-0 bg-white border border-[var(--border)] rounded-2xl p-4 flex flex-col gap-4 self-stretch">
          <div>
            <div className="text-[11px] font-extrabold tracking-wider text-[var(--toss-gray-3)] uppercase mb-2">회사</div>
            <select
              data-testid="guide-company-select"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full h-9 border border-[var(--border)] rounded-xl bg-white px-3 text-[13px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            >
              {companyOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-[11px] font-extrabold tracking-wider text-[var(--toss-gray-3)] uppercase mb-2">팀 선택</div>
            <select
              data-testid="guide-team-filter-select"
              value={selectedTeamKey}
              onChange={(e) => { setSelectedTeamKey(e.target.value); setSelectedResourceId(null); }}
              className="w-full h-9 border border-[var(--border)] rounded-xl bg-white px-3 text-[13px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">팀을 선택하세요</option>
              {companyTeams.map((t) => (
                <option key={t.key} value={t.key}>{t.teamName}</option>
              ))}
            </select>
          </div>

          <div className="flex-grow overflow-y-auto space-y-4 pr-1 scrollbar-thin">
            {selectedCompany?.divisions.map((div) => (
              <div key={div.name} className="flex flex-col gap-1">
                <div className="text-[10px] font-black text-[var(--toss-gray-3)] px-2 mb-1 uppercase tracking-wider">{div.name}</div>
                {div.teams.map((t) => {
                  const isOn = t.key === selectedTeamKey;
                  const resCount = resourceCountsByTeamKey[t.key] || 0;
                  const taskCount = taskCountsByTeamKey[t.key] || 0;
                  return (
                    <button
                      key={t.key}
                      onClick={() => { setSelectedTeamKey(t.key); setSelectedResourceId(null); }}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all ${
                        isOn ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-transparent text-[var(--foreground)] hover:bg-[var(--muted)]/50'
                      }`}
                    >
                      <span className={`text-[13.5px] font-bold truncate ${isOn ? 'text-[var(--accent)]' : 'text-[var(--toss-gray-4)]'}`}>
                        {t.teamName}
                      </span>
                      <div className="flex gap-1 shrink-0">
                        <span className={`min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isOn ? 'bg-white text-[var(--accent)]' : 'bg-[var(--muted)] text-[var(--toss-gray-3)]'
                        }`}>
                          {resCount}
                        </span>
                        {taskCount > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold bg-amber-500/10 text-amber-600">
                            {taskCount}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <button className="flex items-center justify-center gap-1.5 h-9 w-full rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]/30">
            <Plus size={14} /> 새 팀 추가
          </button>
        </aside>

        {/* 우측 메인 영역 (flex-1) */}
        <section className="flex-1 min-w-0 flex flex-col h-full bg-white border border-[var(--border)] rounded-2xl p-5 self-stretch overflow-hidden">
          
          {/* 세그먼트 및 필터 헤더 */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4 shrink-0">
            <div className="inline-flex p-1 bg-[var(--muted)]/60 rounded-xl gap-1">
              <button
                data-testid="guide-tab-res"
                onClick={() => { setActiveTab('res'); setSelectedResourceId(null); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === 'res' ? 'bg-white text-[var(--foreground)] shadow-sm' : 'text-[var(--toss-gray-3)]'
                }`}
              >
                업무자료·인수인계 <span className="text-[10px] opacity-60 ml-0.5">{activeTeamResourceCount}</span>
              </button>
              <button
                data-testid="guide-tab-task"
                onClick={() => { setActiveTab('task'); setSelectedResourceId(null); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === 'task' ? 'bg-white text-[var(--foreground)] shadow-sm' : 'text-[var(--toss-gray-3)]'
                }`}
              >
                팀 할일 <span className="text-[10px] opacity-60 ml-0.5">{activeTeamTaskCount}</span>
              </button>
            </div>

            {activeTab === 'res' && (
              <div className="flex items-center gap-2">
                <div className="relative inline-flex items-center">
                  <Search size={14} className="absolute left-3 text-[var(--toss-gray-3)]" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="제목, 팀, 키워드 검색"
                    className="h-9 min-w-[200px] rounded-xl border border-[var(--border)] bg-white px-3 pl-8 text-xs font-bold outline-none focus:border-[var(--accent)] transition-all"
                  />
                </div>
                
                <select
                  value={audienceFilter}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAudienceFilter(value === 'all' || isGuideAudience(value) ? value : 'all');
                  }}
                  className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-xs font-bold text-[var(--foreground)] outline-none cursor-pointer"
                >
                  <option value="all">대상 — 전체</option>
                  <option value="new_hire">신규직원</option>
                  <option value="current_staff">기존직원</option>
                  <option value="all_staff">전체직원</option>
                </select>
              </div>
            )}
          </div>

          {/* 탭별 뷰 포트 */}
          <div className="flex-1 overflow-y-auto min-h-0 pr-1 mt-4">
            
            {activeTab === 'res' ? (
              <>
                {/* 자료 종류별 가로 칩 필터 */}
                <div className="flex items-center gap-1.5 mb-4 overflow-x-auto scrollbar-none whitespace-nowrap shrink-0">
                  {([
                    { id: 'all', label: '전체', count: activeTeamResourceCount },
                    { id: 'education', label: '업무자료', count: activeTeamResourceCount - activeTeamHandoverCount },
                    { id: 'handover', label: '인수인계', count: activeTeamHandoverCount }
                  ] as const).map((chip) => (
                    <button
                      key={chip.id}
                      onClick={() => setKindFilter(chip.id)}
                      className={`h-7 px-3 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                        kindFilter === chip.id 
                          ? 'bg-[var(--foreground)] text-white' 
                          : 'bg-[var(--muted)]/50 text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                      }`}
                    >
                      {chip.label} <span className="opacity-60 ml-0.5">{chip.count}</span>
                    </button>
                  ))}
                </div>

                {/* 2열 자료 카드 그리드 */}
                {loading ? (
                  <LoadingPanel title="자료 목록을 불러오는 중입니다" />
                ) : filteredResources.length === 0 ? (
                  <EmptyState
                    title="등록된 자료가 없습니다"
                    description={activeTeam ? `${activeTeam.teamName} 팀의 첫 자료를 등록해 보세요.` : '팀을 선택해 주세요.'}
                    compact
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
                    {filteredResources.map((resource) => (
                      <button
                        key={resource.id}
                        data-testid={`guide-card-board-post-${String(resource.id).replace('board-post-', '')}`}
                        onClick={() => setSelectedResourceId(resource.id)}
                        className={`group relative text-left border rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                          resource.kind === 'handover' ? 'hover:border-amber-400' : 'hover:border-[var(--accent)]'
                        } ${
                          selectedResourceId === resource.id
                            ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]'
                            : 'border-[var(--border)] bg-white'
                        }`}
                      >
                        {/* 유형별 3px 좌측 바 */}
                        <span className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl ${
                          resource.kind === 'handover' ? 'bg-amber-500' : 'bg-[var(--accent)]'
                        }`} />

                        {/* 상단 메타라인 */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            resource.kind === 'handover' 
                              ? 'bg-amber-500/10 text-amber-600' 
                              : 'bg-[var(--accent-soft)]/60 text-[var(--accent)]'
                          }`}>
                            {getGuideKindLabel(resource.kind)}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--muted)] text-[var(--toss-gray-4)]">
                            {getGuideAudienceLabel(resource.audience)}
                          </span>
                          {Boolean(resource.isNew) && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500 text-white leading-none">
                              NEW
                            </span>
                          )}
                          {resource.attachments.length > 0 && (
                            <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-bold text-[var(--toss-gray-3)]">
                              <FileText size={11} /> {resource.attachments.length}
                            </span>
                          )}
                        </div>

                        {/* 제목 및 설명 */}
                        <h4 className="mt-3 text-[14px] font-black text-[var(--foreground)] line-clamp-1 leading-snug group-hover:text-[var(--accent)] transition-colors">
                          {resource.title}
                        </h4>
                        <p className="mt-1 text-xs text-[var(--toss-gray-4)] line-clamp-2 leading-relaxed min-h-[36px]">
                          {resource.description || '설명 없음'}
                        </p>

                        {/* 키워드 태그 리스트 */}
                        {resource.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2.5">
                            {resource.keywords.slice(0, 3).map((keyword) => (
                              <span key={keyword} className="text-[10px] font-bold text-[var(--accent)] bg-[var(--accent-soft)]/20 px-1.5 py-0.5 rounded">
                                #{keyword}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* 푸터라인 */}
                        <div className="mt-3 pt-3 border-t border-[var(--border)]/70 flex items-center gap-2 text-[11px] text-[var(--toss-gray-3)] font-bold">
                          <span className="w-[18px] h-[18px] rounded-full bg-[var(--border)] text-[var(--toss-gray-4)] flex items-center justify-center text-[9px] font-black uppercase shrink-0">
                            {resource.author_name ? resource.author_name.slice(0, 1) : '익'}
                          </span>
                          <span className="text-[var(--foreground)]">{resource.author_name || '익명'}</span>
                          <span className="ml-auto text-[10px] font-medium font-mono">
                            {rel(resource.updated_at || resource.created_at)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* 팀 할일 탭 뷰 */
              <div data-testid="guide-team-task-board" className="space-y-4 pb-4">
                
                {/* 빠른 등록 바 */}
                {canWrite && activeTeam && (
                  <div className="grid gap-2 border border-[var(--border)] bg-[var(--muted)]/20 rounded-2xl p-4 shadow-inner">
                    <div className="grid gap-2 md:grid-cols-[1fr_160px_140px]">
                      <input
                        data-testid="guide-task-title-input"
                        value={taskTitle}
                        onChange={(event) => setTaskTitle(event.target.value)}
                        placeholder={`${activeTeam.teamName} 팀의 새로운 할일 등록...`}
                        className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-xs font-bold outline-none focus:border-[var(--accent)] transition-all"
                      />
                      <input
                        data-testid="guide-task-due-date-input"
                        type="date"
                        value={taskDueDate}
                        onChange={(event) => setTaskDueDate(event.target.value)}
                        className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-xs font-bold outline-none focus:border-[var(--accent)] transition-all font-mono"
                      />
                      <select
                        data-testid="guide-task-priority-select"
                        value={taskPriority}
                        onChange={(event) => setTaskPriority(normalizeGuideTaskPriority(event.target.value))}
                        className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-xs font-bold outline-none focus:border-[var(--accent)] transition-all"
                      >
                        <option value="urgent">🚨 긴급</option>
                        <option value="high">⚠️ 높음</option>
                        <option value="medium">📝 보통</option>
                        <option value="low">☕ 낮음</option>
                      </select>
                    </div>
                    <textarea
                      data-testid="guide-task-note-input"
                      value={taskNote}
                      onChange={(event) => setTaskNote(event.target.value)}
                      rows={2}
                      placeholder="상세 준비사항 및 메모를 입력하세요 (선택)"
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-bold leading-relaxed outline-none focus:border-[var(--accent)] transition-all"
                    />
                    <div className="flex justify-end gap-2">
                      {editingTaskId && (
                        <button
                          type="button"
                          onClick={resetTaskComposer}
                          className="px-3 h-8 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-xs font-bold text-[var(--toss-gray-4)]"
                        >
                          취소
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid="guide-task-save"
                        disabled={savingTask}
                        onClick={() => void saveTask()}
                        className="px-4 h-8 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:bg-[var(--accent)]/95 shadow-sm"
                      >
                        {savingTask ? '저장 중...' : editingTaskId ? '할일 수정' : '할일 등록'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 할일 상태 가로 칩 필터 */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {([
                    { id: 'open', label: '진행중' },
                    { id: 'all', label: '전체' },
                    { id: 'done', label: '완료' }
                  ] as const).map((chip) => (
                    <button
                      key={chip.id}
                      onClick={() => setTaskFilter(chip.id)}
                      className={`h-7 px-3 rounded-full text-xs font-bold transition-all ${
                        taskFilter === chip.id 
                          ? 'bg-[var(--foreground)] text-white' 
                          : 'bg-[var(--muted)]/50 text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* 할일 목록 카드 덱 */}
                {loading ? (
                  <LoadingPanel title="팀 할일을 불러오는 중입니다" />
                ) : activeTeamTasks.length === 0 ? (
                  <EmptyState
                    title="공유된 팀 할일이 없습니다"
                    description={activeTeam ? `${activeTeam.teamName} 팀의 할일을 등록해 보세요.` : '팀을 선택해 주세요.'}
                    compact
                  />
                ) : (
                  <div className="space-y-2">
                    {activeTeamTasks.map((task) => {
                      const priorityMeta = getTaskPriorityMeta(task.priority);
                      const isSoon = !task.isDone && task.dueDate && task.dueDate <= getKoreanTodayString();
                      return (
                        <div
                          key={task.id}
                          data-testid={`guide-task-card-board-post-${String(task.id).replace('board-post-', '')}`}
                          className={`rounded-xl border p-3.5 transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                            task.isDone ? 'border-[var(--success)]/20 bg-emerald-50/5' : 'border-[var(--border)] bg-white hover:border-[var(--border-strong)]'
                          }`}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                task.priority === 'urgent' ? 'bg-red-500/10 text-red-600' :
                                task.priority === 'high' ? 'bg-amber-500/10 text-amber-600' :
                                task.priority === 'low' ? 'bg-[var(--muted)] text-[var(--toss-gray-3)]' :
                                'bg-[var(--accent-soft)]/60 text-[var(--accent)]'
                              }`}>
                                {priorityMeta.label}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                task.isDone ? 'bg-emerald-500/10 text-emerald-600' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                              }`}>
                                {task.isDone ? '완료' : '진행중'}
                              </span>
                              {task.dueDate && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isSoon ? 'bg-red-500/15 text-red-600' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                                }`}>
                                  마감 {formatDateOnly(task.dueDate)}
                                </span>
                              )}
                            </div>
                            
                            <h4 className={`text-[13.5px] font-bold ${task.isDone ? 'text-[var(--toss-gray-3)] line-through' : 'text-[var(--foreground)]'}`}>
                              {task.title}
                            </h4>
                            {task.note && (
                              <p className="text-xs text-[var(--toss-gray-4)] whitespace-pre-wrap leading-relaxed">
                                {task.note}
                              </p>
                            )}
                            
                            <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-[var(--toss-gray-3)]">
                              <span>작성자: {task.author_name || '익명'}</span>
                              <span>·</span>
                              <span>{formatDate(task.updated_at || task.created_at)}</span>
                              {task.isDone && (
                                <>
                                  <span>·</span>
                                  <span className="text-emerald-600 font-extrabold">
                                    완료자: {task.completedByName || '확인 불가'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 gap-1.5 self-end sm:self-start">
                            {canWrite && (
                              <button
                                data-testid={`guide-task-toggle-board-post-${String(task.id).replace('board-post-', '')}`}
                                onClick={() => void toggleTask(task)}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black text-white ${
                                  task.isDone ? 'bg-zinc-700 hover:bg-zinc-800' : 'bg-emerald-500 hover:bg-emerald-600'
                                }`}
                              >
                                {task.isDone ? '되돌리기' : '완료'}
                              </button>
                            )}
                            {canManagePost(task) && (
                              <>
                                <button
                                  onClick={() => startTaskEdit(task)}
                                  className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--muted)]/50"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => void deleteTask(task)}
                                  className="px-2.5 py-1.5 rounded-lg border border-red-200 text-[11px] font-bold text-red-600 hover:bg-red-50"
                                >
                                  삭제
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 중앙 상세 모달 */}
      {selectedResourceId && selectedResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 스크림 (배경 어둡게 처리 & 터치 방지) */}
          <div 
            onClick={() => setSelectedResourceId(null)}
            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[2px] transition-all"
          />
          {/* 모달 박스 */}
          <div className="relative w-full max-w-2xl max-h-[85vh] bg-[var(--card)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-y-auto flex flex-col z-10 custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
            {/* 상단 X 닫기 단추 */}
            <button
              data-testid="guide-detail-close"
              onClick={() => setSelectedResourceId(null)}
              className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full border border-[var(--border)] bg-white flex items-center justify-center text-[var(--toss-gray-4)] hover:bg-[var(--muted)]/50 transition-all shadow-sm"
              title="닫기"
            >
              <X size={16} />
            </button>
            <div className="flex-1">
              <GuideDetailPanel
                selectedResource={selectedResource}
                activeCompanyLabel={activeCompanyLabel}
                canEditSelected={canEditSelected}
                onEdit={(res) => {
                  setSelectedResourceId(null);
                  startEdit(res);
                }}
                onDelete={async (res) => {
                  const success = await deleteResource(res);
                  if (success) {
                    setSelectedResourceId(null);
                  }
                }}
                onAttachmentPreview={(attachments, clicked) => window.open(clicked.url, '_blank')}
              />
            </div>
          </div>
        </div>
      )}

      {/* 중앙 등록/수정 컴포저 모달 */}
      {showComposer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 스크림 */}
          <div 
            onClick={() => { resetComposer(activeTeam); setShowComposer(false); }}
            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[2px] transition-all"
          />
          {/* 컴포저 폼 컨테이너 */}
          <div data-testid="guide-form" className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
            
            {/* 헤더 */}
            <div className="flex items-center justify-between border-b border-[var(--border)] p-5 shrink-0 bg-gradient-to-br from-[var(--accent-light)]/20 via-transparent to-transparent">
              <div>
                <h3 className="text-base font-extrabold text-[var(--foreground)]">
                  {editingResourceId ? '업무공유 자료 수정' : '새 자료 등록'}
                </h3>
                <p className="text-[11px] text-[var(--toss-gray-3)] font-semibold mt-1">
                  팀 단위로 매뉴얼 교육자료 또는 인수인계 일지를 공유합니다.
                </p>
              </div>
              <button
                onClick={() => { resetComposer(activeTeam); setShowComposer(false); }}
                className="w-8 h-8 rounded-full border border-[var(--border)] bg-white flex items-center justify-center text-[var(--toss-gray-4)] hover:bg-[var(--muted)]/50 transition-all shadow-sm"
              >
                <X size={16} />
              </button>
            </div>

            {/* 본문 스크롤 영역 */}
            <div className="flex-grow overflow-y-auto p-6 space-y-4 scrollbar-thin">
              
              {/* 회사 / 팀 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">회사</span>
                  <input
                    value={activeCompanyLabel}
                    readOnly
                    className="h-9 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 text-[13px] font-bold text-[var(--toss-gray-3)] outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">팀 <span className="text-red-500">*</span></span>
                  <select
                    data-testid="guide-team-select"
                    value={teamName}
                    onChange={(event) => {
                      const nextTeam = companyTeams.find((team) => team.teamName === event.target.value) || null;
                      setTeamName(event.target.value);
                      setDivisionName(nextTeam?.divisionName || '');
                    }}
                    className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-[13px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">팀 선택</option>
                    {companyTeams.map((team) => (
                      <option key={team.key} value={team.teamName}>
                        {team.divisionName} / {team.teamName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 제목 / 소속 부문 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">제목 <span className="text-red-500">*</span></span>
                  <input
                    data-testid="guide-title-input"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="예: 수술실 장비 신규 세팅 가이드"
                    className={`h-9 rounded-xl border px-3 text-[13px] font-bold outline-none transition-all ${
                      titleErr ? 'border-red-500 bg-red-50/20 focus:border-red-500' : 'border-[var(--border)] focus:border-[var(--accent)] bg-white'
                    }`}
                  />
                  {titleErr && <span className="text-[11px] font-bold text-red-500">제목을 입력해 주세요.</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">소속 부문</span>
                  <input
                    value={divisionName}
                    onChange={(event) => setDivisionName(event.target.value)}
                    placeholder="예: 간호부"
                    className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-[13px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              {/* 공유 유형 라디오 카드 덱 (수려한 디자인) */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">공유 유형</span>
                <select
                  data-testid="guide-kind-select"
                  value={kind}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isGuideKind(value)) setKind(value);
                  }}
                  className="sr-only"
                >
                  <option value="education">education</option>
                  <option value="handover">handover</option>
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setKind('education')}
                    className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition-all ${
                      kind === 'education'
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]/30'
                        : 'border-[var(--border)] bg-white hover:border-[var(--toss-gray-3)]'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${
                      kind === 'education' ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--toss-gray-3)] bg-white'
                    }`}>
                      {kind === 'education' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <div>
                      <span className="block text-[13px] font-extrabold text-[var(--foreground)]">업무자료</span>
                      <span className="block text-[10px] text-[var(--toss-gray-3)] mt-0.5 leading-normal">매뉴얼·가이드·참조표 등 상시 교육자료</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setKind('handover')}
                    className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition-all ${
                      kind === 'handover'
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-[var(--border)] bg-white hover:border-[var(--toss-gray-3)]'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${
                      kind === 'handover' ? 'border-amber-600 bg-amber-600' : 'border-[var(--toss-gray-3)] bg-white'
                    }`}>
                      {kind === 'handover' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <div>
                      <span className="block text-[13px] font-extrabold text-[var(--foreground)]">업무 인수인계</span>
                      <span className="block text-[10px] text-[var(--toss-gray-3)] mt-0.5 leading-normal">당직 인계·주간 전파 등 시간 기록용 문서</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* 대상 직원 / 검색 키워드 칩 입력 상자 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">대상 직원</span>
                  <select
                    data-testid="guide-audience-select"
                    value={audience}
                    onChange={(event) => setAudience(normalizeGuideAudience(event.target.value))}
                    className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-[13px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  >
                    <option value="new_hire">신규직원</option>
                    <option value="current_staff">기존직원</option>
                    <option value="all_staff">전체직원</option>
                  </select>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">검색 키워드</span>
                  <div className="flex flex-wrap items-center gap-1.5 border border-[var(--border)] bg-white px-3 py-1.5 rounded-xl min-h-[36px] transition-all focus-within:border-[var(--accent)]">
                    {keywordsList.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 rounded-full shrink-0">
                        #{tag}
                        <button
                          type="button"
                          onClick={() => setKeywordsList(keywordsList.filter((k) => k !== tag))}
                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-[var(--accent)]/15"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    <input
                      data-testid="guide-keywords-input"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={handleKeywordKeyDown}
                      onBlur={() => keywordInput.trim() && addKeyword(keywordInput)}
                      placeholder={keywordsList.length > 0 ? "" : "쉼표나 엔터로 키워드 입력"}
                      className="flex-grow min-w-[100px] border-none outline-none text-xs font-bold bg-transparent text-[var(--foreground)] placeholder-[var(--toss-gray-3)]"
                    />
                  </div>
                </div>
              </div>

              {/* 설명 / 프로세스 */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">설명 / 프로세스 <span className="text-red-500">*</span></span>
                <textarea
                  data-testid="guide-description-input"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={6}
                  placeholder={`1. 준비 전 확인\n- 장비 작동 여부 점검\n\n2. 장비 세팅 순서\n- 실제 세팅 순서를 순차적으로 기재`}
                  className={`w-full rounded-xl border px-3 py-2 text-xs font-bold leading-relaxed outline-none transition-all resize-none min-h-[120px] ${
                    contentErr ? 'border-red-500 bg-red-50/20 focus:border-red-500' : 'border-[var(--border)] focus:border-[var(--accent)] bg-white'
                  }`}
                />
                {contentErr && <span className="text-[11px] font-bold text-red-500">설명 또는 첨부파일을 하나 이상 등록해 주세요.</span>}
              </div>

              {/* 첨부파일 점선 드롭존 */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">첨부파일</span>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-1.5 p-5 border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/20 rounded-xl bg-[var(--muted)]/20 cursor-pointer transition-all text-center"
                >
                  <Upload size={20} className="text-[var(--toss-gray-4)]" />
                  <span className="text-[12px] font-bold text-[var(--toss-gray-4)]">클릭하여 파일 선택 또는 드래그 앤 드롭</span>
                  <span className="text-[10px] text-[var(--toss-gray-3)]">PDF · 이미지 · 문서 (개당 200MB 이하, 최대 10개)</span>
                </div>
                <input
                  data-testid="guide-file-input"
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(event) => {
                    const files = event.target.files ? Array.from(event.target.files) : [];
                    setPendingFiles((prev) => [...prev, ...files].slice(0, 10));
                    event.currentTarget.value = '';
                  }}
                  className="hidden"
                />

                {/* 대기 파일 리스트 카드 */}
                {(existingAttachments.length > 0 || pendingFiles.length > 0) && (
                  <div className="grid gap-3 grid-cols-1 md:grid-cols-2 mt-2">
                    {existingAttachments.length > 0 && (
                      <div className="rounded-xl bg-[var(--muted)]/40 border border-[var(--border)] p-3 space-y-1.5">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-4)]">기존 등록 파일</p>
                        <div className="flex flex-wrap gap-1.5">
                          {existingAttachments.map((file, idx) => (
                            <span key={`${file.url}-${idx}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-[var(--border)] text-[11px] font-bold text-[var(--foreground)] rounded-lg">
                              {file.name}
                              <button
                                type="button"
                                onClick={() => setExistingAttachments(existingAttachments.filter((_, i) => i !== idx))}
                                className="w-3.5 h-3.5 rounded-full hover:bg-[var(--muted)] text-[var(--toss-gray-4)] flex items-center justify-center"
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {pendingFiles.length > 0 && (
                      <div className="rounded-xl bg-[var(--muted)]/40 border border-[var(--border)] p-3 space-y-1.5">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-4)]">새로 업로드 대기 파일</p>
                        <div className="flex flex-wrap gap-1.5">
                          {pendingFiles.map((file, idx) => (
                            <span key={`${file.name}-${idx}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-200 text-[11px] font-bold text-emerald-600 rounded-lg">
                              {file.name}
                              <button
                                type="button"
                                onClick={() => setPendingFiles(pendingFiles.filter((_, i) => i !== idx))}
                                className="w-3.5 h-3.5 rounded-full hover:bg-[var(--muted)] text-emerald-600 flex items-center justify-center"
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 푸터 버튼 */}
            <div className="flex items-center gap-2 p-5 bg-[var(--muted)]/40 border-t border-[var(--border)] shrink-0">
              <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">
                제목과 (설명 또는 파일)은 필수 항목입니다.
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { resetComposer(activeTeam); setShowComposer(false); }}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--foreground)] hover:bg-[var(--muted)]/50 transition-all bg-white"
                >
                  취소
                </button>
                <button
                  type="button"
                  data-testid="guide-save"
                  disabled={savingResource}
                  onClick={() => void saveResource()}
                  className="px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:bg-[var(--accent)]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingResource ? (uploadProgress > 0 ? `저장 중 (${uploadProgress}%)...` : '저장 중 (0%)...') : editingResourceId ? '수정 저장' : '자료 등록'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 성공 토스트 오버레이 */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2.5 bg-zinc-950 text-white rounded-xl shadow-2xl text-[13px] font-bold animate-in slide-in-from-bottom-2 duration-200">
          <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0">
            <Check size={11} strokeWidth={3} />
          </span>
          {toastMessage}
        </div>
      )}

    </div>
  );
}

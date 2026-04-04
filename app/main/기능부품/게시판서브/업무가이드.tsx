'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { canAccessBoard, isAdminUser, isPrivilegedUser } from '@/lib/access-control';
import {
  buildStorageDownloadUrl,
  shouldUseManagedBrowserDownload,
  triggerManagedBrowserDownload,
} from '@/lib/object-storage-url';
import { supabase } from '@/lib/supabase';
import { isMissingColumnError, withMissingColumnsFallback } from '@/lib/supabase-compat';
import { toast } from '@/lib/toast';
import type { AttachmentItem, BoardPost, StaffMember } from '@/types';

const GUIDE_BOARD_TYPE = '업무가이드';
const GUIDE_DISPLAY_NAME = '업무공유';
const GUIDE_TASK_BOARD_TYPE = '업무가이드_팀할일';

const ATTACHMENTS_META_PREFIX = '[[ATTACHMENTS_META]]';
const ATTACHMENTS_META_SUFFIX = '[[/ATTACHMENTS_META]]';
const GUIDE_META_PREFIX = '[[GUIDE_META]]';
const GUIDE_META_SUFFIX = '[[/GUIDE_META]]';
const GUIDE_TASK_META_PREFIX = '[[GUIDE_TASK_META]]';
const GUIDE_TASK_META_SUFFIX = '[[/GUIDE_TASK_META]]';

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

type QueryResult<T> = {
  data: T | null;
  error: unknown;
};

type GuideKind = 'education' | 'handover';
type GuideAudience = 'new_hire' | 'current_staff' | 'all_staff';
type GuideTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

type GuideMetaPayload = {
  kind?: GuideKind;
  audience?: GuideAudience;
  department?: string;
  teamName?: string;
  divisionName?: string;
  companyName?: string;
  keywords?: string[];
};

type GuideTaskMetaPayload = {
  teamName?: string;
  divisionName?: string;
  companyName?: string;
  dueDate?: string;
  priority?: GuideTaskPriority;
  isDone?: boolean;
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
  teamName: string;
  divisionName: string;
  companyName: string;
  keywords: string[];
};

type GuideTask = GuideRow & {
  note: string;
  teamName: string;
  divisionName: string;
  companyName: string;
  dueDate: string;
  priority: GuideTaskPriority;
  isDone: boolean;
};

type OrgTeamRow = {
  id?: string | null;
  company_name?: string | null;
  division?: string | null;
  team_name?: string | null;
  sort_order?: number | null;
};

type OrgStaffRow = {
  id?: string | null;
  company?: string | null;
  company_id?: string | null;
  department?: string | null;
  status?: string | null;
};

type TeamScope = {
  key: string;
  companyName: string;
  companyId: string;
  divisionName: string;
  teamName: string;
  memberCount: number;
};

type CompanyScope = {
  companyName: string;
  companyId: string;
  divisions: Array<{
    name: string;
    teams: TeamScope[];
  }>;
};

type Props = {
  user?: StaffMember | null;
  selectedCo?: string | null;
  selectedCompanyId?: string | null;
};

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function buildTeamKey(companyName: string, teamName: string) {
  return `${normalizeText(companyName)}::${normalizeText(teamName)}`;
}

function buildSelectColumns(
  requiredColumns: readonly string[],
  optionalColumns: readonly string[] = [],
  omittedColumns?: ReadonlySet<string>,
) {
  return [...requiredColumns, ...optionalColumns.filter((column) => !omittedColumns?.has(column))].join(', ');
}

function inferAttachmentType(nameOrUrl: string, explicitType?: string | null) {
  const normalizedExplicitType = normalizeText(explicitType).toLowerCase();
  if (normalizedExplicitType === 'image' || normalizedExplicitType === 'video' || normalizedExplicitType === 'file') {
    return normalizedExplicitType;
  }

  const raw = normalizeText(nameOrUrl).toLowerCase();
  const clean = raw.split('?')[0];
  const ext = clean.includes('.') ? clean.slice(clean.lastIndexOf('.') + 1) : '';

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'wmv', 'webm', 'mkv', 'm4v'].includes(ext)) return 'video';
  return 'file';
}

function extractMetaMarker<T>(value: unknown, prefix: string, suffix: string) {
  const raw = String(value ?? '');
  const start = raw.indexOf(prefix);
  const end = raw.indexOf(suffix);
  if (start < 0 || end < 0 || end <= start) {
    return {
      displayContent: raw.trim(),
      meta: null as T | null,
    };
  }

  const displayContent = `${raw.slice(0, start)}${raw.slice(end + suffix.length)}`.trim();
  const metaText = raw.slice(start + prefix.length, end).trim();

  try {
    return {
      displayContent,
      meta: JSON.parse(metaText) as T,
    };
  } catch {
    return {
      displayContent,
      meta: null as T | null,
    };
  }
}

function extractAttachmentMetaFromContent(value: unknown) {
  const { displayContent, meta } = extractMetaMarker<AttachmentItem[]>(value, ATTACHMENTS_META_PREFIX, ATTACHMENTS_META_SUFFIX);
  const attachments = Array.isArray(meta)
    ? meta
        .map((item) => ({
          name: normalizeText(item?.name),
          url: normalizeText(item?.url),
          type: inferAttachmentType(normalizeText(item?.name || item?.url), normalizeText(item?.type)),
        }))
        .filter((item) => item.name && item.url)
    : [];

  return { displayContent, attachments };
}

function buildAttachmentMetaContent(visibleContent: string, attachments: AttachmentItem[]) {
  if (!attachments.length) return visibleContent.trim();

  const normalizedVisibleContent = visibleContent.trim();
  const payload = attachments
    .map((item) => ({
      name: normalizeText(item.name),
      url: normalizeText(item.url),
      type: inferAttachmentType(normalizeText(item.name || item.url), normalizeText(item.type)),
    }))
    .filter((item) => item.name && item.url);

  if (!payload.length) return normalizedVisibleContent;
  return `${normalizedVisibleContent}${normalizedVisibleContent ? '\n' : ''}${ATTACHMENTS_META_PREFIX}${JSON.stringify(payload)}${ATTACHMENTS_META_SUFFIX}`;
}

function extractGuideMetaFromContent(value: unknown) {
  return extractMetaMarker<GuideMetaPayload>(value, GUIDE_META_PREFIX, GUIDE_META_SUFFIX);
}

function buildGuideContent(description: string, attachments: AttachmentItem[], meta: GuideMetaPayload | null) {
  const attachmentContent = buildAttachmentMetaContent(description, attachments);
  if (!meta) return attachmentContent;

  const normalizedMeta: GuideMetaPayload = {
    kind: meta.kind || 'education',
    audience: meta.audience || 'all_staff',
    department: normalizeText(meta.department) || undefined,
    teamName: normalizeText(meta.teamName || meta.department) || undefined,
    divisionName: normalizeText(meta.divisionName) || undefined,
    companyName: normalizeText(meta.companyName) || undefined,
    keywords: Array.isArray(meta.keywords)
      ? meta.keywords.map((keyword) => normalizeText(keyword)).filter(Boolean)
      : undefined,
  };

  const hasExtraMeta =
    normalizedMeta.teamName ||
    normalizedMeta.divisionName ||
    normalizedMeta.companyName ||
    (normalizedMeta.keywords && normalizedMeta.keywords.length > 0) ||
    normalizedMeta.kind !== 'education' ||
    normalizedMeta.audience !== 'all_staff';

  if (!hasExtraMeta) return attachmentContent;
  return `${attachmentContent}${attachmentContent ? '\n' : ''}${GUIDE_META_PREFIX}${JSON.stringify(normalizedMeta)}${GUIDE_META_SUFFIX}`;
}

function extractGuideTaskMetaFromContent(value: unknown) {
  return extractMetaMarker<GuideTaskMetaPayload>(value, GUIDE_TASK_META_PREFIX, GUIDE_TASK_META_SUFFIX);
}

function buildGuideTaskContent(note: string, meta: GuideTaskMetaPayload) {
  const normalizedNote = note.trim();
  const normalizedMeta: GuideTaskMetaPayload = {
    teamName: normalizeText(meta.teamName) || undefined,
    divisionName: normalizeText(meta.divisionName) || undefined,
    companyName: normalizeText(meta.companyName) || undefined,
    dueDate: normalizeText(meta.dueDate) || undefined,
    priority: meta.priority || 'medium',
    isDone: Boolean(meta.isDone),
  };

  return `${normalizedNote}${normalizedNote ? '\n' : ''}${GUIDE_TASK_META_PREFIX}${JSON.stringify(normalizedMeta)}${GUIDE_TASK_META_SUFFIX}`;
}

function normalizeGuideKind(value: unknown): GuideKind {
  return value === 'handover' ? 'handover' : 'education';
}

function normalizeGuideAudience(value: unknown): GuideAudience {
  if (value === 'new_hire' || value === 'current_staff' || value === 'all_staff') return value;
  return 'all_staff';
}

function normalizeGuideTaskPriority(value: unknown): GuideTaskPriority {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'urgent') return value;
  return 'medium';
}

function parseKeywords(value: string) {
  return Array.from(new Set(value.split(',').map((keyword) => keyword.trim()).filter(Boolean)));
}

function normalizeGuideResource(post: GuideRow): GuideResource {
  const { displayContent: attachmentContent, attachments: embeddedAttachments } = extractAttachmentMetaFromContent(post.content ?? '');
  const { displayContent: description, meta } = extractGuideMetaFromContent(attachmentContent);
  const attachments = (Array.isArray(post.attachments) && post.attachments.length > 0 ? post.attachments : embeddedAttachments)
    .map((item) => ({
      name: normalizeText(item?.name),
      url: normalizeText(item?.url),
      type: inferAttachmentType(normalizeText(item?.name || item?.url), normalizeText(item?.type)),
    }))
    .filter((item) => item.name && item.url);

  return {
    ...post,
    description,
    attachments,
    kind: normalizeGuideKind(meta?.kind),
    audience: normalizeGuideAudience(meta?.audience),
    teamName: normalizeText(meta?.teamName || meta?.department),
    divisionName: normalizeText(meta?.divisionName),
    companyName: normalizeText(meta?.companyName || post.company),
    keywords: Array.isArray(meta?.keywords) ? meta.keywords.map((keyword) => normalizeText(keyword)).filter(Boolean) : [],
  };
}

function normalizeGuideTask(post: GuideRow): GuideTask {
  const { displayContent: note, meta } = extractGuideTaskMetaFromContent(post.content ?? '');
  return {
    ...post,
    note,
    teamName: normalizeText(meta?.teamName),
    divisionName: normalizeText(meta?.divisionName),
    companyName: normalizeText(meta?.companyName || post.company),
    dueDate: normalizeText(meta?.dueDate),
    priority: normalizeGuideTaskPriority(meta?.priority),
    isDone: Boolean(meta?.isDone),
  };
}

function formatDate(value: unknown) {
  const raw = normalizeText(value);
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

function formatDateOnly(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const parsed = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function getGuideKindLabel(kind: GuideKind) {
  return kind === 'handover' ? '업무 인수인계' : '업무자료';
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

function getTaskPriorityMeta(priority: GuideTaskPriority) {
  switch (priority) {
    case 'urgent':
      return { label: '긴급', className: 'bg-rose-500/15 text-rose-600' };
    case 'high':
      return { label: '높음', className: 'bg-orange-500/15 text-orange-600' };
    case 'low':
      return { label: '낮음', className: 'bg-slate-200 text-slate-600' };
    default:
      return { label: '보통', className: 'bg-sky-500/15 text-sky-600' };
  }
}

function sortGuideTasks(tasks: GuideTask[]) {
  return [...tasks].sort((left, right) => {
    const doneDiff = Number(Boolean(left.isDone)) - Number(Boolean(right.isDone));
    if (doneDiff !== 0) return doneDiff;

    const leftDue = normalizeText(left.dueDate);
    const rightDue = normalizeText(right.dueDate);
    if (leftDue !== rightDue) {
      if (!leftDue) return 1;
      if (!rightDue) return -1;
      return leftDue.localeCompare(rightDue);
    }

    const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 } as const;
    const priorityDiff = priorityWeight[right.priority] - priorityWeight[left.priority];
    if (priorityDiff !== 0) return priorityDiff;

    return String(right.created_at || '').localeCompare(String(left.created_at || ''));
  });
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

function isVisibleStaff(status: unknown) {
  return normalizeText(status) !== '퇴사';
}

function buildCompanyScopes(
  orgTeams: OrgTeamRow[],
  staffs: OrgStaffRow[],
  resources: GuideResource[],
  tasks: GuideTask[],
) {
  const teamMap = new Map<string, {
    companyName: string;
    companyId: string;
    divisionName: string;
    teamName: string;
    sortOrder: number;
    memberCount: number;
  }>();

  const companyIdByName = new Map<string, string>();
  const memberCountByKey = new Map<string, number>();

  staffs.filter((staff) => isVisibleStaff(staff.status)).forEach((staff) => {
    const companyName = normalizeText(staff.company);
    const companyId = normalizeText(staff.company_id);
    const teamName = normalizeText(staff.department) || '미지정';
    if (!companyName) return;
    if (companyId && !companyIdByName.has(companyName)) {
      companyIdByName.set(companyName, companyId);
    }
    const key = buildTeamKey(companyName, teamName);
    memberCountByKey.set(key, (memberCountByKey.get(key) || 0) + 1);
  });

  let seedIndex = 0;
  const ensureTeam = (companyName: string, companyId: string, divisionName: string, teamName: string, sortOrder?: number | null) => {
    const normalizedCompanyName = normalizeText(companyName);
    const normalizedTeamName = normalizeText(teamName) || '미지정';
    if (!normalizedCompanyName || !normalizedTeamName) return;
    const key = buildTeamKey(normalizedCompanyName, normalizedTeamName);
    const nextCompanyId = normalizeText(companyId) || companyIdByName.get(normalizedCompanyName) || '';
    if (!teamMap.has(key)) {
      teamMap.set(key, {
        companyName: normalizedCompanyName,
        companyId: nextCompanyId,
        divisionName: normalizeText(divisionName) || '기타',
        teamName: normalizedTeamName,
        sortOrder: typeof sortOrder === 'number' ? sortOrder : seedIndex,
        memberCount: memberCountByKey.get(key) || 0,
      });
      seedIndex += 1;
      return;
    }

    const current = teamMap.get(key)!;
    teamMap.set(key, {
      ...current,
      companyId: current.companyId || nextCompanyId,
      divisionName: current.divisionName === '기타' ? normalizeText(divisionName) || current.divisionName : current.divisionName,
      sortOrder: typeof sortOrder === 'number' ? Math.min(current.sortOrder, sortOrder) : current.sortOrder,
      memberCount: memberCountByKey.get(key) || current.memberCount,
    });
  };

  orgTeams.forEach((row, index) => {
    ensureTeam(row.company_name || '', '', row.division || '기타', row.team_name || '미지정', row.sort_order ?? index);
  });
  staffs.forEach((staff) => {
    ensureTeam(staff.company || '', staff.company_id || '', '기타', staff.department || '미지정');
  });
  resources.forEach((resource) => {
    ensureTeam(resource.companyName || resource.company || '', normalizeText(resource.company_id), resource.divisionName || '기타', resource.teamName || '미지정');
  });
  tasks.forEach((task) => {
    ensureTeam(task.companyName || task.company || '', normalizeText(task.company_id), task.divisionName || '기타', task.teamName || '미지정');
  });

  const companyMap = new Map<string, CompanyScope>();
  Array.from(teamMap.values())
    .sort((left, right) => {
      if (left.companyName !== right.companyName) return left.companyName.localeCompare(right.companyName, 'ko');
      if (left.divisionName !== right.divisionName) return left.divisionName.localeCompare(right.divisionName, 'ko');
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.teamName.localeCompare(right.teamName, 'ko');
    })
    .forEach((team) => {
      if (!companyMap.has(team.companyName)) {
        companyMap.set(team.companyName, {
          companyName: team.companyName,
          companyId: team.companyId,
          divisions: [],
        });
      }

      const company = companyMap.get(team.companyName)!;
      let division = company.divisions.find((item) => item.name === team.divisionName);
      if (!division) {
        division = { name: team.divisionName, teams: [] };
        company.divisions.push(division);
      }

      division.teams.push({
        key: buildTeamKey(team.companyName, team.teamName),
        companyName: team.companyName,
        companyId: team.companyId,
        divisionName: team.divisionName,
        teamName: team.teamName,
        memberCount: team.memberCount,
      });
    });

  return Array.from(companyMap.values());
}

function matchesCompanyScope(item: Pick<GuideRow, 'company' | 'company_id'>, companyName: string, companyId: string) {
  const normalizedCompanyId = normalizeText(item.company_id);
  if (companyId && normalizedCompanyId) {
    return normalizedCompanyId === companyId;
  }
  const normalizedCompany = normalizeText(item.company);
  if (!normalizedCompany) return true;
  return normalizedCompany === companyName;
}

function matchesTeamScope(item: { companyName: string; company?: string | null; company_id?: string | null; teamName: string }, team: TeamScope) {
  const normalizedItemTeam = normalizeText(item.teamName) || '미지정';
  if (normalizedItemTeam !== team.teamName) return false;
  return matchesCompanyScope(item, team.companyName, team.companyId);
}

export default function GuideLibrary({ user, selectedCo, selectedCompanyId }: Props) {
  const [resources, setResources] = useState<GuideResource[]>([]);
  const [teamTasks, setTeamTasks] = useState<GuideTask[]>([]);
  const [orgTeams, setOrgTeams] = useState<OrgTeamRow[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<OrgStaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingResource, setSavingResource] = useState(false);
  const [savingTask, setSavingTask] = useState(false);

  const [showComposer, setShowComposer] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  const [companyFilter, setCompanyFilter] = useState('');
  const [selectedTeamKey, setSelectedTeamKey] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | GuideKind>('all');
  const [audienceFilter, setAudienceFilter] = useState<'all' | GuideAudience>('all');
  const [taskFilter, setTaskFilter] = useState<'all' | 'open' | 'done'>('open');

  const [title, setTitle] = useState('');
  const [teamName, setTeamName] = useState('');
  const [divisionName, setDivisionName] = useState('');
  const [kind, setKind] = useState<GuideKind>('education');
  const [audience, setAudience] = useState<GuideAudience>('new_hire');
  const [description, setDescription] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [existingAttachments, setExistingAttachments] = useState<AttachmentItem[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskNote, setTaskNote] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState<GuideTaskPriority>('medium');

  const canWrite = canAccessBoard(user, GUIDE_BOARD_TYPE, 'write');
  const isPrivileged = isPrivilegedUser(user);
  const isCrossCompanyViewer = Boolean(user?.permissions?.mso || user?.role === 'admin' || isPrivileged);
  const currentUserId = normalizeText(user?.id);
  const currentCompanyId = normalizeText(user?.company_id);
  const currentCompanyName = normalizeText(user?.company);

  const handleAttachmentDownloadClick = useCallback(async (
    event: ReactMouseEvent<HTMLAnchorElement>,
    url: string,
    fileName: string,
  ) => {
    const href = buildStorageDownloadUrl(url, fileName);
    if (!href) {
      event.preventDefault();
      toast('다운로드 주소를 만들지 못했습니다.', 'error');
      return;
    }
    if (!shouldUseManagedBrowserDownload()) {
      return;
    }
    event.preventDefault();
    try {
      await triggerManagedBrowserDownload(href, fileName);
    } catch (error) {
      console.error('guide attachment download failed', error);
      toast('모바일 다운로드에 실패했습니다. 다시 시도해 주세요.', 'error');
    }
  }, []);

  const canManagePost = useCallback(
    (item?: Pick<GuideRow, 'author_id'> | null) => {
      if (!item) return false;
      if (isPrivileged || isAdminUser(user)) return true;
      return canWrite && normalizeText(item.author_id) === currentUserId;
    },
    [canWrite, currentUserId, isPrivileged, user],
  );

  const resetComposer = useCallback((nextTeam?: TeamScope | null) => {
    setEditingResourceId(null);
    setTitle('');
    setTeamName(nextTeam?.teamName || '');
    setDivisionName(nextTeam?.divisionName || '');
    setKind('education');
    setAudience('new_hire');
    setDescription('');
    setKeywordsInput('');
    setExistingAttachments([]);
    setPendingFiles([]);
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

      const [resourceResult, taskResult, orgTeamResult, staffResult] = await Promise.all([
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
        supabase.from('staff_members').select('id, company, company_id, department, status').order('company').order('department'),
      ]);

      setResources(((resourceResult.data || []) as GuideRow[]).map((item) => normalizeGuideResource(item)));
      setTeamTasks(sortGuideTasks(((taskResult.data || []) as GuideRow[]).map((item) => normalizeGuideTask(item))));
      setOrgTeams(((orgTeamResult.data || []) as OrgTeamRow[]) ?? []);
      setStaffDirectory(((staffResult.data || []) as OrgStaffRow[]) ?? []);
    } catch (error) {
      console.error('guide workspace load failed', error);
      toast(`${GUIDE_DISPLAY_NAME} 화면을 불러오지 못했습니다.`, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGuideWorkspace();
  }, [loadGuideWorkspace]);

  useEffect(() => {
    const channel = supabase
      .channel('guide-workspace-board-posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_posts' }, () => {
        void loadGuideWorkspace();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_teams' }, () => {
        void loadGuideWorkspace();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_members' }, () => {
        void loadGuideWorkspace();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      if (selectedCompanyId) {
        return resources.filter((item) => !normalizeText(item.company_id) || normalizeText(item.company_id) === selectedCompanyId);
      }
      if (selectedCo && selectedCo !== '전체') {
        return resources.filter((item) => !normalizeText(item.company) || normalizeText(item.company) === selectedCo);
      }
      return resources;
    }

    if (currentCompanyId) {
      return resources.filter((item) => !normalizeText(item.company_id) || normalizeText(item.company_id) === currentCompanyId);
    }
    if (currentCompanyName) {
      return resources.filter((item) => !normalizeText(item.company) || normalizeText(item.company) === currentCompanyName);
    }
    return resources;
  }, [currentCompanyId, currentCompanyName, isCrossCompanyViewer, resources, selectedCo, selectedCompanyId]);

  const viewerScopedTasks = useMemo(() => {
    if (isCrossCompanyViewer) {
      if (selectedCompanyId) {
        return teamTasks.filter((item) => !normalizeText(item.company_id) || normalizeText(item.company_id) === selectedCompanyId);
      }
      if (selectedCo && selectedCo !== '전체') {
        return teamTasks.filter((item) => !normalizeText(item.company) || normalizeText(item.company) === selectedCo);
      }
      return teamTasks;
    }

    if (currentCompanyId) {
      return teamTasks.filter((item) => !normalizeText(item.company_id) || normalizeText(item.company_id) === currentCompanyId);
    }
    if (currentCompanyName) {
      return teamTasks.filter((item) => !normalizeText(item.company) || normalizeText(item.company) === currentCompanyName);
    }
    return teamTasks;
  }, [currentCompanyId, currentCompanyName, isCrossCompanyViewer, selectedCo, selectedCompanyId, teamTasks]);

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
      counts[team.key] = viewerScopedTasks.filter((item) => matchesTeamScope(item, team)).length;
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

  useEffect(() => {
    if (!selectedResourceId || !filteredResources.some((resource) => resource.id === selectedResourceId)) {
      setSelectedResourceId(filteredResources[0]?.id || null);
    }
  }, [filteredResources, selectedResourceId]);

  const selectedResource = useMemo(
    () => filteredResources.find((resource) => resource.id === selectedResourceId) || null,
    [filteredResources, selectedResourceId],
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
      name: normalizeText(payload?.fileName || file.name),
      url: normalizeText(payload?.url),
      type: inferAttachmentType(normalizeText(payload?.fileName || file.name), normalizeText(payload?.type)),
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
    setKeywordsInput(resource.keywords.join(', '));
    setExistingAttachments(resource.attachments || []);
    setPendingFiles([]);
    setShowComposer(true);

    if (resource.companyName) {
      setCompanyFilter(resource.companyName);
      setSelectedTeamKey(buildTeamKey(resource.companyName, resource.teamName || '미지정'));
    }
  }, []);

  const saveResource = useCallback(async () => {
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
      toast('제목을 입력해 주세요.', 'warning');
      return;
    }
    if (!normalizedDescription && existingAttachments.length === 0 && pendingFiles.length === 0) {
      toast('설명 또는 첨부파일을 하나 이상 등록해 주세요.', 'warning');
      return;
    }

    try {
      setSavingResource(true);

      const uploadedAttachments: AttachmentItem[] = [];
      for (const file of pendingFiles) {
        uploadedAttachments.push(await uploadGuideAttachment(file));
      }

      const attachments = [...existingAttachments, ...uploadedAttachments];
      const meta: GuideMetaPayload = {
        kind,
        audience,
        teamName: targetTeam.teamName,
        divisionName: divisionName.trim() || targetTeam.divisionName,
        companyName: targetTeam.companyName,
        keywords: parseKeywords(keywordsInput),
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
        toast('업무자료를 수정했습니다.', 'success');
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
        setSelectedTeamKey(buildTeamKey(targetTeam.companyName, targetTeam.teamName));
        toast('업무자료를 등록했습니다.', 'success');
      }

      resetComposer(targetTeam);
      setShowComposer(false);
    } catch (error) {
      console.error('guide resource save failed', error);
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
    keywordsInput,
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
        resetComposer(activeTeam);
        setShowComposer(false);
      }
      toast('업무자료를 삭제했습니다.', 'success');
    } catch (error) {
      console.error('guide resource delete failed', error);
      toast('업무자료 삭제 중 오류가 발생했습니다.', 'error');
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
      console.error('guide task save failed', error);
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
      updated_at: new Date().toISOString(),
      content: buildGuideTaskContent(task.note, {
        companyName: task.companyName || task.company || activeCompanyLabel,
        divisionName: task.divisionName,
        teamName: task.teamName,
        dueDate: task.dueDate || undefined,
        priority: task.priority,
        isDone: !task.isDone,
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
      console.error('guide task toggle failed', error);
      void loadGuideWorkspace();
    }
  }, [activeCompanyLabel, canWrite, loadGuideWorkspace]);

  const deleteTask = useCallback(async (task: GuideTask) => {
    if (!canManagePost(task)) {
      toast('본인이 작성한 팀 할일만 삭제할 수 있습니다.', 'warning');
      return;
    }
    if (!window.confirm(`"${task.title}" 팀 할일을 삭제할까요?`)) return;

    try {
      const { error } = await supabase.from('board_posts').delete().eq('id', task.id);
      if (error) throw error;
      setTeamTasks((prev) => prev.filter((item) => item.id !== task.id));
      if (editingTaskId === task.id) {
        resetTaskComposer();
      }
      toast('팀 할일을 삭제했습니다.', 'success');
    } catch (error) {
      console.error('guide task delete failed', error);
      toast('팀 할일 삭제 중 오류가 발생했습니다.', 'error');
    }
  }, [canManagePost, editingTaskId, resetTaskComposer]);

  const canEditSelected = canManagePost(selectedResource);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto custom-scrollbar p-4 md:p-5" data-testid="guide-library-view">
      <header className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h2 className="text-xl font-bold text-[var(--foreground)]">{GUIDE_DISPLAY_NAME}</h2>
      </header>

      {showComposer && (
        <section data-testid="guide-form" className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--foreground)]">{editingResourceId ? `${GUIDE_DISPLAY_NAME} 게시글 수정` : `${GUIDE_DISPLAY_NAME} 게시글 등록`}</h3>
                <p className="mt-1 text-xs font-semibold text-[var(--toss-gray-3)]">
                  선택한 회사와 팀 기준으로 업무자료, 첨부 문서, 업무 인수인계를 함께 등록할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetComposer(activeTeam);
                  setShowComposer(false);
                }}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--foreground)]"
              >
                닫기
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold text-[var(--foreground)]">회사</span>
                <input value={activeCompanyLabel} readOnly className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]" />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold text-[var(--foreground)]">팀</span>
                <select
                  data-testid="guide-team-select"
                  value={teamName}
                  onChange={(event) => {
                    const nextTeam = companyTeams.find((team) => team.teamName === event.target.value) || null;
                    setTeamName(event.target.value);
                    setDivisionName(nextTeam?.divisionName || '');
                  }}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--accent)]"
                >
                  <option value="">팀 선택</option>
                  {companyTeams.map((team) => (
                    <option key={team.key} value={team.teamName}>
                      {team.divisionName} / {team.teamName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold text-[var(--foreground)]">제목</span>
                <input
                  data-testid="guide-title-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="예: 수술팀 신규 직원 준비 가이드"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--accent)]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold text-[var(--foreground)]">소속 부문</span>
                <input
                  value={divisionName}
                  onChange={(event) => setDivisionName(event.target.value)}
                  placeholder="예: 간호부"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold text-[var(--foreground)]">공유 유형</span>
                <select
                  data-testid="guide-kind-select"
                  value={kind}
                  onChange={(event) => setKind(normalizeGuideKind(event.target.value))}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--accent)]"
                >
                  <option value="education">업무자료</option>
                  <option value="handover">업무 인수인계</option>
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
                placeholder="예: 신규교육, 체크리스트, 인계포인트"
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
                  resetComposer(activeTeam);
                  setShowComposer(false);
                }}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--foreground)]"
              >
                취소
              </button>
              <button
                type="button"
                data-testid="guide-save"
                disabled={savingResource}
                onClick={() => void saveResource()}
                className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingResource ? '저장 중...' : editingResourceId ? '수정 저장' : '게시글 등록'}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm" data-testid="guide-team-menu">
            <div className="space-y-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">회사 / 팀 선택</p>
                  </div>
                  {canWrite ? (
                    <button
                      type="button"
                      data-testid="guide-open-compose"
                      onClick={() => startCreate(activeTeam)}
                      className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:opacity-95"
                    >
                      {activeTeam ? `+ ${activeTeam.teamName}` : '+ 게시글'}
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-3">
                  <label className="space-y-1.5">
                    <span className="text-[11px] font-bold text-[var(--foreground)]">회사 선택</span>
                    <select
                      data-testid="guide-company-select"
                      value={companyFilter}
                      onChange={(event) => setCompanyFilter(event.target.value)}
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-[var(--accent)]"
                    >
                      {companyOptions.map((companyName) => (
                        <option key={companyName} value={companyName}>
                          {companyName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[11px] font-bold text-[var(--foreground)]">팀 선택</span>
                    <select
                      data-testid="guide-team-filter-select"
                      value={selectedTeamKey}
                      onChange={(event) => setSelectedTeamKey(event.target.value)}
                      disabled={!companyTeams.length}
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[var(--muted)]"
                    >
                      <option value="">{companyTeams.length ? '팀 선택' : '등록된 팀 없음'}</option>
                      {selectedCompany?.divisions.map((division) => (
                        <optgroup key={division.name} label={division.name}>
                          {division.teams.map((team) => (
                            <option key={team.key} value={team.key}>
                              {division.name} / {team.teamName}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                </div>

                {!activeTeam ? (
                  <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-4 text-center text-sm font-semibold text-[var(--toss-gray-3)]">
                    조직도에 등록된 팀이 없습니다.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="space-y-3">
              <input
                data-testid="guide-search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="제목, 팀, 키워드, 첨부파일명 검색"
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
                    {value === 'all' ? '전체 자료' : value === 'education' ? '업무자료' : '업무 인수인계'}
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
                    {activeTeam ? `${activeTeam.teamName} 업무자료 · 인수인계 공유` : '업무자료 · 인수인계 공유'}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[var(--toss-gray-3)]">
                    선택한 팀의 게시글, 첨부 문서, 업무 인수인계를 한 번에 확인할 수 있습니다.
                  </p>
                </div>
                <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-bold text-[var(--foreground)]">
                  {filteredResources.length}건
                </span>
              </div>
            </div>

            {loading ? (
              <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm font-semibold text-[var(--toss-gray-3)]">
                {GUIDE_DISPLAY_NAME} 화면을 불러오는 중입니다.
              </div>
            ) : filteredResources.length === 0 ? (
              <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-8 text-center">
                <p className="text-base font-bold text-[var(--foreground)]">등록된 업무공유 자료가 없습니다.</p>
                <p className="mt-2 text-sm font-semibold text-[var(--toss-gray-3)]">
                  {activeTeam ? `${activeTeam.teamName} 팀의 첫 업무자료 또는 인수인계 게시글과 파일을 등록해 보세요.` : '왼쪽에서 팀을 선택해 주세요.'}
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
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--foreground)]">
                      {resource.teamName || '미지정'}
                    </span>
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
        <div className="min-w-0 space-y-4">
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
                      <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-bold text-[var(--foreground)]">
                        {selectedResource.teamName || '미지정'}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-[var(--foreground)]">{selectedResource.title}</h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-[var(--toss-gray-3)]">
                      <span>{selectedResource.author_name || '작성자 미상'}</span>
                      <span>{selectedResource.companyName || activeCompanyLabel || '기본 기관'}</span>
                      <span>{selectedResource.divisionName || '기타'}</span>
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
                            href={buildStorageDownloadUrl(attachment.url, attachment.name)}
                            onClick={(event) => void handleAttachmentDownloadClick(event, attachment.url, attachment.name)}
                            download={attachment.name}
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
              <p className="text-lg font-bold text-[var(--foreground)]">보고 싶은 공유자료를 선택해 주세요.</p>
            </div>
          )}

          <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm" data-testid="guide-team-task-board">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-[var(--foreground)]">
                    {activeTeam ? `${activeTeam.teamName} 팀별 할일 공유` : '팀별 할일 공유'}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-[var(--toss-gray-3)]">
                    선택한 팀에서 같이 처리해야 할 작업과 인수인계 후속 할일을 함께 관리할 수 있습니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['open', 'all', 'done'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTaskFilter(value)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                        taskFilter === value ? 'bg-[var(--foreground)] text-white' : 'bg-[var(--muted)] text-[var(--foreground)]'
                      }`}
                    >
                      {value === 'open' ? '진행중' : value === 'done' ? '완료' : '전체'}
                    </button>
                  ))}
                </div>
              </div>

              {canWrite && activeTeam && (
                <div className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/40 p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_160px]">
                    <input
                      data-testid="guide-task-title-input"
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder={`${activeTeam.teamName} 팀 할일 제목`}
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--accent)]"
                    />
                    <input
                      data-testid="guide-task-due-date-input"
                      type="date"
                      value={taskDueDate}
                      onChange={(event) => setTaskDueDate(event.target.value)}
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--accent)]"
                    />
                    <select
                      data-testid="guide-task-priority-select"
                      value={taskPriority}
                      onChange={(event) => setTaskPriority(normalizeGuideTaskPriority(event.target.value))}
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--accent)]"
                    >
                      <option value="urgent">긴급</option>
                      <option value="high">높음</option>
                      <option value="medium">보통</option>
                      <option value="low">낮음</option>
                    </select>
                  </div>
                  <textarea
                    data-testid="guide-task-note-input"
                    value={taskNote}
                    onChange={(event) => setTaskNote(event.target.value)}
                    rows={3}
                    placeholder="팀이 같이 봐야 할 메모, 준비사항, 전달사항을 적어 주세요."
                    className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold leading-6 outline-none focus:border-[var(--accent)]"
                  />
                  <div className="flex justify-end gap-2">
                    {editingTaskId ? (
                      <button
                        type="button"
                        onClick={resetTaskComposer}
                        className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--foreground)]"
                      >
                        취소
                      </button>
                    ) : null}
                    <button
                      type="button"
                      data-testid="guide-task-save"
                      disabled={savingTask}
                      onClick={() => void saveTask()}
                      className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingTask ? '저장 중...' : editingTaskId ? '할일 수정' : '할일 등록'}
                    </button>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-6 text-center text-sm font-semibold text-[var(--toss-gray-3)]">
                  팀 할일을 불러오는 중입니다.
                </div>
              ) : activeTeamTasks.length === 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] p-6 text-center">
                  <p className="text-base font-bold text-[var(--foreground)]">공유된 팀 할일이 없습니다.</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--toss-gray-3)]">
                    {activeTeam ? `${activeTeam.teamName} 팀의 오늘 할일과 공통 체크사항을 등록해 보세요.` : '왼쪽에서 팀을 선택해 주세요.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeTeamTasks.map((task) => {
                    const priorityMeta = getTaskPriorityMeta(task.priority);
                    return (
                      <div
                        key={task.id}
                        data-testid={`guide-task-card-${task.id}`}
                        className={`rounded-[var(--radius-lg)] border p-4 transition ${
                          task.isDone ? 'border-emerald-200 bg-emerald-50/60' : 'border-[var(--border)] bg-white'
                        }`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${priorityMeta.className}`}>{priorityMeta.label}</span>
                              <span className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11px] font-bold text-[var(--foreground)]">
                                {task.isDone ? '완료' : '진행중'}
                              </span>
                              {task.dueDate ? (
                                <span className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11px] font-bold text-[var(--foreground)]">
                                  마감 {formatDateOnly(task.dueDate)}
                                </span>
                              ) : null}
                            </div>
                            <p className={`text-base font-bold ${task.isDone ? 'text-emerald-700 line-through' : 'text-[var(--foreground)]'}`}>{task.title}</p>
                            <p className="text-sm font-semibold leading-6 text-[var(--toss-gray-3)] whitespace-pre-wrap">
                              {task.note || '메모 없음'}
                            </p>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                              <span>{task.author_name || '작성자 미상'}</span>
                              <span>{formatDate(task.updated_at || task.created_at)}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {canWrite ? (
                              <button
                                type="button"
                                data-testid={`guide-task-toggle-${task.id}`}
                                onClick={() => void toggleTask(task)}
                                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                                  task.isDone ? 'bg-[var(--foreground)] text-white' : 'bg-emerald-500 text-white'
                                }`}
                              >
                                {task.isDone ? '진행으로 되돌리기' : '완료 처리'}
                              </button>
                            ) : null}
                            {canManagePost(task) ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startTaskEdit(task)}
                                  className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--foreground)]"
                                >
                                  수정
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteTask(task)}
                                  className="rounded-full bg-rose-500 px-3 py-1.5 text-xs font-bold text-white"
                                >
                                  삭제
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

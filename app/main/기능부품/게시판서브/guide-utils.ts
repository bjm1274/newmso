import type { AttachmentItem } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import { isMissingColumnError } from '@/lib/supabase-compat';
import type {
  CompanyScope,
  GuideAudience,
  GuideKind,
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

export const GUIDE_BOARD_TYPE = '업무가이드';
export const GUIDE_DISPLAY_NAME = '업무공유';
export const GUIDE_TASK_BOARD_TYPE = '업무가이드_팀할일';

export const ATTACHMENTS_META_PREFIX = '[[ATTACHMENTS_META]]';
export const ATTACHMENTS_META_SUFFIX = '[[/ATTACHMENTS_META]]';
export const GUIDE_META_PREFIX = '[[GUIDE_META]]';
export const GUIDE_META_SUFFIX = '[[/GUIDE_META]]';
export const GUIDE_TASK_META_PREFIX = '[[GUIDE_TASK_META]]';
export const GUIDE_TASK_META_SUFFIX = '[[/GUIDE_TASK_META]]';

export const GUIDE_POST_REQUIRED_SELECT_COLUMNS = [
  'id',
  'board_type',
  'title',
  'content',
  'author_id',
  'author_name',
  'company',
  'created_at',
] as const;

export const GUIDE_POST_OPTIONAL_COLUMNS = ['updated_at', 'company_id', 'attachments'] as const;

// ─── 기본 유틸 ────────────────────────────────────────────────────────────────

export function normalizeText(value: unknown) {
  return String(value || '').trim();
}

export function buildTeamKey(companyName: string, teamName: string) {
  return `${normalizeText(companyName)}::${normalizeText(teamName)}`;
}

export function buildSelectColumns(
  requiredColumns: readonly string[],
  optionalColumns: readonly string[] = [],
  omittedColumns?: ReadonlySet<string>,
) {
  return [...requiredColumns, ...optionalColumns.filter((column) => !omittedColumns?.has(column))].join(', ');
}

export function inferAttachmentType(nameOrUrl: string, explicitType?: string | null) {
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

// ─── 메타 파서 / 빌더 ─────────────────────────────────────────────────────────

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

export function extractAttachmentMetaFromContent(value: unknown) {
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

export function buildAttachmentMetaContent(visibleContent: string, attachments: AttachmentItem[]) {
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

export function extractGuideMetaFromContent(value: unknown) {
  return extractMetaMarker<GuideMetaPayload>(value, GUIDE_META_PREFIX, GUIDE_META_SUFFIX);
}

export function buildGuideContent(description: string, attachments: AttachmentItem[], meta: GuideMetaPayload | null) {
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

export function extractGuideTaskMetaFromContent(value: unknown) {
  return extractMetaMarker<GuideTaskMetaPayload>(value, GUIDE_TASK_META_PREFIX, GUIDE_TASK_META_SUFFIX);
}

export function buildGuideTaskContent(note: string, meta: GuideTaskMetaPayload) {
  const normalizedNote = note.trim();
  const normalizedMeta: GuideTaskMetaPayload = {
    teamName: normalizeText(meta.teamName) || undefined,
    divisionName: normalizeText(meta.divisionName) || undefined,
    companyName: normalizeText(meta.companyName) || undefined,
    dueDate: normalizeText(meta.dueDate) || undefined,
    priority: meta.priority || 'medium',
    isDone: Boolean(meta.isDone),
    completedAt: normalizeText(meta.completedAt) || undefined,
    completedById: normalizeText(meta.completedById) || undefined,
    completedByName: normalizeText(meta.completedByName) || undefined,
  };

  return `${normalizedNote}${normalizedNote ? '\n' : ''}${GUIDE_TASK_META_PREFIX}${JSON.stringify(normalizedMeta)}${GUIDE_TASK_META_SUFFIX}`;
}

// ─── 노멀라이저 ───────────────────────────────────────────────────────────────

export function normalizeGuideKind(value: unknown): GuideKind {
  return value === 'handover' ? 'handover' : 'education';
}

export function normalizeGuideAudience(value: unknown): GuideAudience {
  if (value === 'new_hire' || value === 'current_staff' || value === 'all_staff') return value;
  return 'all_staff';
}

export function normalizeGuideTaskPriority(value: unknown): GuideTaskPriority {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'urgent') return value;
  return 'medium';
}

export function parseKeywords(value: string) {
  return Array.from(new Set(value.split(',').map((keyword) => keyword.trim()).filter(Boolean)));
}

export function normalizeGuideResource(post: GuideRow): GuideResource {
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

export function normalizeGuideTask(post: GuideRow): GuideTask {
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
    completedAt: normalizeText(meta?.completedAt),
    completedById: normalizeText(meta?.completedById),
    completedByName: normalizeText(meta?.completedByName),
  };
}

// ─── 포맷터 ───────────────────────────────────────────────────────────────────

export function formatDate(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnly(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const parsed = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function getGuideKindLabel(kind: GuideKind) {
  return kind === 'handover' ? '업무 인수인계' : '업무자료';
}

export function getGuideAudienceLabel(audience: GuideAudience) {
  switch (audience) {
    case 'new_hire':
      return '신규직원';
    case 'current_staff':
      return '기존직원';
    default:
      return '전체직원';
  }
}

export function getTaskPriorityMeta(priority: GuideTaskPriority) {
  switch (priority) {
    case 'urgent':
      return { label: '긴급', className: 'badge-red' };
    case 'high':
      return { label: '높음', className: 'badge-yellow' };
    case 'low':
      return { label: '낮음', className: 'badge-gray' };
    default:
      return { label: '보통', className: 'badge-blue' };
  }
}

// ─── 정렬 / 필터 ──────────────────────────────────────────────────────────────

export function sortGuideTasks(tasks: GuideTask[]) {
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

export function matchesCompanyScope(item: Pick<GuideRow, 'company' | 'company_id'>, companyName: string, companyId: string) {
  const normalizedCompanyId = normalizeText(item.company_id);
  if (companyId && normalizedCompanyId) {
    return normalizedCompanyId === companyId;
  }
  const normalizedCompany = normalizeText(item.company);
  if (!normalizedCompany) return true;
  return normalizedCompany === companyName;
}

export function matchesTeamScope(item: { companyName: string; company?: string | null; company_id?: string | null; teamName: string }, team: TeamScope) {
  const normalizedItemTeam = normalizeText(item.teamName) || '미지정';
  if (normalizedItemTeam !== team.teamName) return false;
  return matchesCompanyScope(item, team.companyName, team.companyId);
}

// ─── Supabase 뮤테이션 ────────────────────────────────────────────────────────

export async function runGuideMutation<T>(
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

// ─── 조직 범위 빌더 ───────────────────────────────────────────────────────────

const isVisibleStaff = (status: unknown) => isActiveStaff({ status: status as string | null | undefined });

export function buildCompanyScopes(
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

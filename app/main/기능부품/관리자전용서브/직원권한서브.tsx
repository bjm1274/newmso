'use client';

import { useMemo, type ReactNode } from 'react';
import type { FeaturePermissionItem } from '@/lib/feature-permissions';
import { FEATURE_PERMISSION_GROUPS } from '@/lib/feature-permissions';

// --- TYPES ---
export type ApprovalReferenceSettingUser = {
  id: string;
  name: string;
  position?: string | null;
  department?: string | null;
  company?: string | null;
};

export type PermissionReviewItem = {
  key: string;
  label: string;
  before: string;
  after: string;
  tone?: FeaturePermissionItem['tone'];
};

export type PermissionReview = {
  title: string;
  summary: string;
  targetName: string;
  added: PermissionReviewItem[];
  removed: PermissionReviewItem[];
  changed: PermissionReviewItem[];
  affectedGroups: string[];
  riskCount: number;
};

// --- STYLE UTILS ---
export function getToneClasses(tone: FeaturePermissionItem['tone'], active: boolean) {
  if (!active) {
    return 'bg-[var(--card)] border-[var(--border)] hover:border-[var(--border)]';
  }
  if (tone === 'critical') {
    return 'bg-danger/10 border-danger/20';
  }
  if (tone === 'warning') {
    return 'bg-warning/10 border-warning/20';
  }
  return 'bg-[var(--accent)]/10 border-[var(--accent)]/20';
}

export function getToggleClasses(tone: FeaturePermissionItem['tone'], active: boolean) {
  if (!active) {
    return 'bg-[var(--tab-bg)] hover:bg-[var(--muted)]';
  }
  if (tone === 'critical') {
    return 'bg-danger ring-danger/20';
  }
  if (tone === 'warning') {
    return 'bg-warning ring-warning/20';
  }
  return 'bg-[var(--accent)] ring-[var(--accent)]/20';
}

export function compareKoreanLabels(a: string, b: string) {
  return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
}

export function getStaffCompanyLabel(staff: any) {
  return String(staff?.company || '미지정 회사').trim() || '미지정 회사';
}

export function getStaffTeamLabel(staff: any) {
  return String(staff?.department || '미지정 부서').trim() || '미지정 부서';
}

export function sortStaffRows(a: any, b: any) {
  const companyDiff = compareKoreanLabels(getStaffCompanyLabel(a), getStaffCompanyLabel(b));
  if (companyDiff !== 0) return companyDiff;

  const departmentDiff = compareKoreanLabels(getStaffTeamLabel(a), getStaffTeamLabel(b));
  if (departmentDiff !== 0) return departmentDiff;

  const employeeNoDiff = compareKoreanLabels(String(a?.employee_no || ''), String(b?.employee_no || ''));
  if (employeeNoDiff !== 0) return employeeNoDiff;

  return compareKoreanLabels(String(a?.name || ''), String(b?.name || ''));
}

// --- PERMISSION REVIEW LOGIC ---
export function formatPermissionValue(value: unknown) {
  if (value === true) return '허용';
  if (value === false || value == null || value === '') return '해제';
  if (Array.isArray(value)) return `${value.length}개 설정`;
  if (typeof value === 'object') return '세부 설정';
  return String(value);
}

export function buildPermissionReview({
  title,
  summary,
  targetName,
  beforePermissions,
  afterPermissions,
}: {
  title: string;
  summary: string;
  targetName: string;
  beforePermissions: Record<string, unknown>;
  afterPermissions: Record<string, unknown>;
}): PermissionReview {
  const labelMap = new Map<string, FeaturePermissionItem>();
  const groupMap = new Map<string, string>();
  FEATURE_PERMISSION_GROUPS.forEach((group) => {
    group.items.forEach((item) => {
      labelMap.set(item.key, item);
      groupMap.set(item.key, group.label);
    });
  });

  const allKeys = Array.from(new Set([...Object.keys(beforePermissions || {}), ...Object.keys(afterPermissions || {})]));
  const added: PermissionReviewItem[] = [];
  const removed: PermissionReviewItem[] = [];
  const changed: PermissionReviewItem[] = [];
  const affectedGroups = new Set<string>();
  let riskCount = 0;

  allKeys.forEach((key) => {
    const before = beforePermissions?.[key];
    const after = afterPermissions?.[key];
    if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) return;

    const item = labelMap.get(key);
    const reviewItem: PermissionReviewItem = {
      key,
      label: item?.label || key,
      before: formatPermissionValue(before),
      after: formatPermissionValue(after),
      tone: item?.tone,
    };
    const groupLabel = groupMap.get(key);
    if (groupLabel) affectedGroups.add(groupLabel);
    if (item?.tone === 'critical') riskCount += 1;

    if (before !== true && after === true) {
      added.push(reviewItem);
    } else if (before === true && after !== true) {
      removed.push(reviewItem);
    } else {
      changed.push(reviewItem);
    }
  });

  return {
    title,
    summary,
    targetName,
    added,
    removed,
    changed,
    affectedGroups: Array.from(affectedGroups),
    riskCount,
  };
}

export function normalizeApprovalReferenceUser(entry: any, staffs: any[] = []): ApprovalReferenceSettingUser | null {
  if (entry == null) return null;

  if (typeof entry === 'string' || typeof entry === 'number') {
    const matched = staffs.find((staff) => String(staff?.id) === String(entry));
    if (!matched) return null;
    return {
      id: String(matched.id),
      name: String(matched.name || '이름 없음'),
      position: matched.position ?? null,
      department: matched.department ?? null,
      company: matched.company ?? null,
    };
  }

  if (typeof entry === 'object') {
    const rawId = entry.id;
    if (rawId == null) return null;
    const matched = staffs.find((staff) => String(staff?.id) === String(rawId));
    return {
      id: String(rawId),
      name: String(entry.name || matched?.name || '이름 없음'),
      position: typeof entry.position === 'string' ? entry.position : matched?.position ?? null,
      department: typeof entry.department === 'string' ? entry.department : matched?.department ?? null,
      company: typeof entry.company === 'string' ? entry.company : matched?.company ?? null,
    };
  }

  return null;
}

export function normalizeApprovalReferenceDefaults(value: unknown, staffs: any[] = []) {
  if (!value || typeof value !== 'object') return {} as Record<string, ApprovalReferenceSettingUser[]>;

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, ApprovalReferenceSettingUser[]>>((acc, [key, entries]) => {
    if (!Array.isArray(entries)) return acc;
    const normalized = Array.from(
      new Map(
        entries
          .map((entry) => normalizeApprovalReferenceUser(entry, staffs))
          .filter(Boolean)
          .map((entry) => [String(entry!.id), entry!])
      ).values()
    );
    if (normalized.length > 0) {
      acc[String(key)] = normalized;
    }
    return acc;
  }, {});
}

// --- RENDER COMPONENT (PermissionReviewPanel) ---
function PermissionDiffList({
  title,
  items,
  tone,
}: {
  title: string;
  items: PermissionReviewItem[];
  tone: 'added' | 'removed' | 'changed';
}) {
  const toneClass =
    tone === 'added'
      ? 'text-success'
      : tone === 'removed'
        ? 'text-danger'
        : 'text-warning';

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2.5">
      <p className={`text-[11px] font-black ${toneClass}`}>{title} {items.length.toLocaleString('ko-KR')}</p>
      {items.length > 0 ? (
        <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto pr-1">
          {items.slice(0, 12).map((item) => (
            <div key={`${item.key}-${item.before}-${item.after}`} className="rounded-[var(--radius-md)] bg-[var(--muted)]/70 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[10px] font-bold text-[var(--foreground)]">{item.label}</p>
                {item.tone === 'critical' ? (
                  <span className="shrink-0 rounded-full bg-danger/15 px-1.5 py-0.5 text-[9px] font-bold text-danger">
                    고위험
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[9px] font-semibold text-[var(--toss-gray-3)]">
                {item.before} → {item.after}
              </p>
            </div>
          ))}
          {items.length > 12 ? (
            <p className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
              외 {items.length - 12}건 더 있음
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-[10px] font-semibold text-[var(--toss-gray-3)]">해당 변경 없음</p>
      )}
    </div>
  );
}

export function PermissionReviewPanel({ review, mode }: { review: PermissionReview; mode: 'preview' | 'saved' }) {
  const totalChanges = review.added.length + review.removed.length + review.changed.length;
  const hasChanges = totalChanges > 0;

  return (
    <section
      className={`rounded-[var(--radius-md)] border p-3 shadow-sm ${
        mode === 'preview'
          ? 'border-[var(--accent)]/20 bg-[var(--accent)]/6'
          : 'border-warning/20 bg-warning/10'
      }`}
      data-testid={`staff-permission-diff-${mode}`}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[13px] font-black text-[var(--foreground)]">{review.title}</p>
          <p className="mt-1 text-[11px] font-semibold leading-relaxed text-[var(--toss-gray-4)]">
            {review.summary}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] ring-1 ring-[var(--border)]">
            대상 {review.targetName}
          </span>
          <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] ring-1 ring-[var(--border)]">
            변경 {totalChanges.toLocaleString('ko-KR')}건
          </span>
          <span className={`rounded-[var(--radius-md)] px-2 py-1 text-[10px] font-bold ${review.riskCount > 0 ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success'}`}>
            고위험 {review.riskCount.toLocaleString('ko-KR')}건
          </span>
        </div>
      </div>

      {review.affectedGroups.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {review.affectedGroups.map((group) => (
            <span key={group} className="rounded-full bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--foreground)] ring-1 ring-[var(--border)]">
              {group}
            </span>
          ))}
        </div>
      ) : null}

      {hasChanges ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          <PermissionDiffList title="추가 허용" items={review.added} tone="added" />
          <PermissionDiffList title="해제" items={review.removed} tone="removed" />
          <PermissionDiffList title="설정 변경" items={review.changed} tone="changed" />
        </div>
      ) : (
        <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-3 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">
          권한 값 차이가 없습니다.
        </div>
      )}
    </section>
  );
}

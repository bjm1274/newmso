import { FEATURE_PERMISSION_GROUPS } from '@/lib/feature-permissions';
import type { ApprovalReferenceSettingUser, PermissionReview, PermissionReviewItem } from './types';

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
  afterPermissions }: {
  title: string;
  summary: string;
  targetName: string;
  beforePermissions: Record<string, unknown>;
  afterPermissions: Record<string, unknown>;
}): PermissionReview {
  const labelMap = new Map<string, import('@/lib/feature-permissions').FeaturePermissionItem>();
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
      tone: item?.tone };
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
    riskCount };
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
      company: matched.company ?? null };
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
      company: typeof entry.company === 'string' ? entry.company : matched?.company ?? null };
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

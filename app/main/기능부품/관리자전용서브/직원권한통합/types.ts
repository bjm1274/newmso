import type { FeaturePermissionItem } from '@/lib/feature-permissions';

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

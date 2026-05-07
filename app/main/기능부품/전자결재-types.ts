import type { StaffMember } from '@/types';
import {
APPROVAL_VIEWS
} from './전자결재서브/approval-constants';
export {
ALL_DOCUMENT_FILTER,APPROVAL_DRAFT_STORAGE_KEY,APPROVAL_INBOX_HIDDEN_STATUSES,APPROVAL_OPTIONAL_INSERT_COLUMNS,APPROVAL_REFERENCE_ALL_KEY,APPROVAL_REFERENCE_DEFAULTS_KEY,APPROVAL_VIEWS,
APPROVER_POSITIONS,
BUILTIN_FORM_TYPE_DEFINITIONS,
BUILTIN_FORM_TYPE_NAMES,DEFAULT_APPROVAL_TEMPLATE_DESIGN,LOCAL_APPROVAL_FORM_TYPES_KEY,
LOCAL_FORM_TEMPLATE_DESIGNS_KEY,SYSTEM_FORM_TYPE_SLUGS
} from './전자결재서브/approval-constants';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

export type ApprovalView = (typeof APPROVAL_VIEWS)[number];

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export type ApprovalCcUser = {
  id: string;
  name: string;
  position?: string | null;
};

export type ApprovalReferenceDefaultsMap = Record<string, ApprovalCcUser[]>;

export type ApproverTemplate = {
  id: string;
  name: string;
  line: StaffMember[];
  ccLine?: ApprovalCcUser[];
};

export type SupplyInventoryReviewRow = {
  key: string;
  name: string;
  requestedQty: number;
  unit: string;
  isRegistered: boolean;
  supportStock: number;
  supportShortageQty: number;
  surgeryStock: number;
  surgeryShortageQty: number;
  matchedDepartments: string[];
};

export type SupplyInventoryReviewState = {
  items: Array<{ name: string; qty: number; unit: string; category: string; dept: string; purpose: string }>;
  rows: SupplyInventoryReviewRow[];
  unregisteredItemNames?: string[];
  notice?: string | null;
};

export interface ApprovalViewProps {
  user: StaffMember | null;
  staffs: StaffMember[];
  selectedCo: string;
  setSelectedCo: (co: string) => void;
  selectedCompanyId?: string | null;
  onRefresh?: () => void;
  initialView?: string | null;
  onViewChange?: (view: string) => void;
  initialComposeRequest?: Record<string, unknown> | null;
  onConsumeComposeRequest?: () => void;
}

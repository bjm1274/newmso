import type { StaffMember, InventoryItem, Supplier } from '@/types';

// ─────────────────────────────────────────────
// 재고관리 뷰 & 필터
// ─────────────────────────────────────────────

export const INVENTORY_VIEWS = [
  'UDI', '발주', '스캔', '등록', '현황', '이력', '자산', '비품대여설정',
  'AS반품', '거래처', '재고실사', '이관', '카테고리', '소모품통계', '납품확인서', '수요예측', '내부서재고',
] as const;

export const LEGACY_VIEWS = ['명세서', '유통기한'] as const;
export const VALID_VIEWS = [...INVENTORY_VIEWS, ...LEGACY_VIEWS] as const;

export type InventoryView = (typeof INVENTORY_VIEWS)[number];
export type InventoryStatusFilter = '전체' | '재고부족' | '유통기한임박' | '정상';
export type SupplierWorkspaceTab = 'suppliers' | 'documents';
export type RegistrationMode = 'form' | 'excel' | 'auto_extract';

// ─────────────────────────────────────────────
// 공급 워크플로우
// ─────────────────────────────────────────────

export type WorkflowItemStatus = 'issue_ready' | 'order_required' | 'issued' | 'ordered';

export type WorkflowSummary = {
  issue_ready_count?: number;
  order_required_count?: number;
  issued_count?: number;
  ordered_count?: number;
};

export type LiveInventoryWorkflow = {
  items?: Record<string, unknown>[];
  summary?: WorkflowSummary;
};

export type ApprovalRecord = {
  id?: string | null;
  title?: string;
  type?: string;
  status?: string;
  sender_id?: string | null;
  sender_name?: string | null;
  sender_company?: string | null;
  company_id?: string | null;
  doc_number?: string | null;
  meta_data?: {
    items?: Record<string, unknown>[];
    inventory_workflow?: Record<string, unknown>;
    doc_number?: string | null;
    [key: string]: unknown;
  };
  live_inventory_workflow?: LiveInventoryWorkflow;
  created_at?: string | null;
  [key: string]: unknown;
};

export type LinkedSupplyOrderTarget = {
  approvalId: string;
  requestIndex: number;
};

// ─────────────────────────────────────────────
// 입출고 모달
// ─────────────────────────────────────────────

export type StockModalState = {
  item: InventoryItem;
  type: 'in' | 'out';
  targetCompany: string;
  targetDept: string;
} | null;

// ─────────────────────────────────────────────
// 메인 컴포넌트 Props
// ─────────────────────────────────────────────

export type IntegratedInventoryProps = {
  user?: StaffMember;
  staffs?: StaffMember[];
  depts?: Array<string | { name?: string }>;
  selectedCo?: string;
  selectedCompanyId?: string | null;
  onRefresh?: () => void;
  initialView?: string | null;
  onViewChange?: (view: string) => void;
  initialWorkflowApprovalId?: string | null;
  onConsumeInitialWorkflowApprovalId?: () => void;
};

// ─────────────────────────────────────────────
// 뷰 메타데이터
// ─────────────────────────────────────────────

export const INVENTORY_VIEW_META: Record<string, { title: string; description: string }> = {
  현황: { title: '재고 현황', description: '' },
  이력: { title: '입출고 이력', description: '' },
  등록: { title: '품목 등록', description: '' },
  발주: { title: '발주 관리', description: '' },
  스캔: { title: '스캔 처리', description: '' },
  수요예측: { title: '수요 예측', description: '' },
  납품확인서: { title: '납품 확인서', description: '' },
  UDI: { title: 'UDI 관리', description: '' },
  자산: { title: '자산 QR', description: '' },
  비품대여설정: { title: '비품대여 설정', description: '' },
  거래처: { title: '거래처 · 명세서', description: '' },
  카테고리: { title: '카테고리 관리', description: '' },
  AS반품: { title: 'AS / 반품', description: '' },
  소모품통계: { title: '소모품 통계', description: '' },
  재고실사: { title: '재고 실사', description: '' },
  이관: { title: '재고 이관', description: '' },
  내부서재고: { title: '내 부서 재고', description: '' },
};

// EXPIRY_SOON_MS는 inventory-utils.ts에서 가져오세요
export { EXPIRY_SOON_MS } from '@/app/main/inventory-utils';

// Re-export for convenience
export type { StaffMember, InventoryItem, Supplier };

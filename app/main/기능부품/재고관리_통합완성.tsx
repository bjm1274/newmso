'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { StaffMember, InventoryItem, Supplier } from '@/types';
import { canAccessInventorySection } from '@/lib/access-control';
import { supabase } from '@/lib/supabase';
import { withMissingColumnFallback } from '@/lib/supabase-compat';
import UDIManagement from './재고관리서브/UDI관리';
import PurchaseOrderManagement from './재고관리서브/발주관리';
import ScanModule from './재고관리서브/스캔모듈완성';
import ProductRegistration from './재고관리서브/물품등록';
import ExcelBulkUpload from './관리자전용서브/엑셀일괄등록';
import InvoiceAutoExtraction from './관리자전용서브/명세서자동추출';
import { useInventoryAlertSystem, InventoryAlertBadge } from './재고관리서브/재고알림시스템';
import QRAssetManager from './재고관리서브/자산QR관리';
import ASReturnManagement from './재고관리서브/AS반품관리';
import InventoryCount from './재고관리서브/재고실사';
import ExpirationAlert from './재고관리서브/유효기간알림';
import InventoryTransfer from './재고관리서브/재고이관';
import CategoryManager from './재고관리서브/카테고리관리';
import ConsumableStats from './재고관리서브/소모품통계';
import DeliveryConfirmation from './재고관리서브/납품확인서';
import InventoryDemandForecast from './재고관리서브/재고수요예측';
import SupplierDocumentWorkspace from './재고관리서브/SupplierDocumentWorkspace';
import {
  buildSupplyRequestWorkflowItems,
  fetchSupportInventoryRows,
  findSupplySourceInventoryItem,
  getItemMinQuantity,
  getItemQuantity,
  INVENTORY_SUPPORT_COMPANY,
  INVENTORY_SUPPORT_DEPARTMENT,
  processInventoryIssue,
  requestInventoryReorder,
  summarizeSupplyRequestWorkflow,
  type SupplyRequestWorkflowItem,
} from '@/app/main/inventory-utils';

const INV_VIEW_KEY = 'erp_inventory_view';

const INVENTORY_VIEWS = ['UDI', '발주', '스캔', '등록', '현황', '이력', '자산', 'AS반품', '거래처', '재고실사', '이관', '카테고리', '소모품통계', '납품확인서', '수요예측'] as const;
const LEGACY_VIEWS = ['명세서', '유통기한'] as const;
const VALID_VIEWS = [...INVENTORY_VIEWS, ...LEGACY_VIEWS];
const EXPIRY_SOON_MS = 30 * 24 * 60 * 60 * 1000;
type InventoryStatusFilter = '전체' | '재고부족' | '유통기한임박' | '정상';
type SupplierWorkspaceTab = 'suppliers' | 'documents';
type LinkedSupplyOrderTarget = {
  approvalId: string;
  requestIndex: number;
};
type WorkflowItem = Record<string, unknown>;
type WorkflowSummary = {
  issue_ready_count?: number;
  order_required_count?: number;
  issued_count?: number;
  ordered_count?: number;
};
type LiveInventoryWorkflow = {
  items?: WorkflowItem[];
  summary?: WorkflowSummary;
};
type ApprovalRecord = {
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

function resolveInventoryView(view?: string | null): {
  view: string;
  statusFilter?: InventoryStatusFilter;
  supplierTab?: SupplierWorkspaceTab;
  showExpiryCenter?: boolean;
} {
  if (view === '명세서') {
    return { view: '거래처', supplierTab: 'documents' };
  }

  if (view === '거래처') {
    return { view: '거래처', supplierTab: 'suppliers' };
  }

  if (view === '유통기한') {
    return { view: '현황', statusFilter: '유통기한임박', showExpiryCenter: true };
  }

  if (view && (INVENTORY_VIEWS as readonly string[]).includes(view)) {
    return { view };
  }

  return { view: '현황' };
}

const INVENTORY_VIEW_META: Record<string, { title: string; description: string }> = {
  현황: { title: '재고 현황', description: '' },
  이력: { title: '입출고 이력', description: '' },
  등록: { title: '품목 등록', description: '' },
  발주: { title: '발주 관리', description: '' },
  스캔: { title: '스캔 처리', description: '' },
  수요예측: { title: '수요 예측', description: '' },
  납품확인서: { title: '납품 확인서', description: '' },
  UDI: { title: 'UDI 관리', description: '' },
  자산: { title: '자산 QR', description: '' },
  거래처: { title: '거래처 · 명세서', description: '' },
  카테고리: { title: '카테고리 관리', description: '' },
  AS반품: { title: 'AS / 반품', description: '' },
  소모품통계: { title: '소모품 통계', description: '' },
  재고실사: { title: '재고 실사', description: '' },
  이관: { title: '재고 이관', description: '' },
};

function isExpirySoon(item: InventoryItem, threshold: number) {
  return Boolean(item?.expiry_date) && new Date(item.expiry_date as string).getTime() < threshold;
}

function formatCurrency(value: number) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`;
}

export default function IntegratedInventoryManagement({
  user,
  depts = [],
  selectedCo,
  selectedCompanyId,
  onRefresh,
  initialView,
  onViewChange,
  initialWorkflowApprovalId,
  onConsumeInitialWorkflowApprovalId,
}: {
  user?: StaffMember;
  depts?: Array<string | { name?: string }>;
  selectedCo?: string;
  selectedCompanyId?: string | null;
  onRefresh?: () => void;
  initialView?: string | null;
  onViewChange?: (view: string) => void;
  initialWorkflowApprovalId?: string | null;
  onConsumeInitialWorkflowApprovalId?: () => void;
}) {
  const initialResolvedView = resolveInventoryView(initialView);
  const defaultInventoryView =
    INVENTORY_VIEWS.find((view) => canAccessInventorySection(user, view)) || '현황';
  const [activeView, setActiveView] = useState(
    canAccessInventorySection(user, initialResolvedView.view) ? initialResolvedView.view : defaultInventoryView
  );
  const [viewCompany, setViewCompany] = useState<string>('전체'); // 현황 탭용 회사 선택
  const [selectedDept, setSelectedDept] = useState('전체');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const inventoryLoadedRef = useRef(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>(initialResolvedView.statusFilter ?? '전체');
  const [stockModal, setStockModal] = useState<{ item: InventoryItem; type: 'in' | 'out'; targetCompany: string; targetDept: string } | null>(null);
  const [stockAmount, setStockAmount] = useState(1);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [registrationMode, setRegistrationMode] = useState<'form' | 'excel' | 'auto_extract'>('form');
  const [supplierWorkspaceTab, setSupplierWorkspaceTab] = useState<SupplierWorkspaceTab>(initialResolvedView.supplierTab ?? 'suppliers');
  const [showExpiryCenter, setShowExpiryCenter] = useState(Boolean(initialResolvedView.showExpiryCenter));
  const [pendingSupplyApprovals, setPendingSupplyApprovals] = useState<ApprovalRecord[]>([]);
  const [completedSupplyApprovals, setCompletedSupplyApprovals] = useState<ApprovalRecord[]>([]);
  const [workflowActionKey, setWorkflowActionKey] = useState<string | null>(null);
  const [highlightedSupplyApprovalId, setHighlightedSupplyApprovalId] = useState<string | null>(null);
  const [highlightedSupplyOrderTarget, setHighlightedSupplyOrderTarget] = useState<LinkedSupplyOrderTarget | null>(null);

  const { lowStockItems, expiryImminentItems } = useInventoryAlertSystem(inventory, user);
  const isMsoUser = user?.company === 'SY INC.' || user?.permissions?.mso === true;
  const isInventoryOpsUser =
    (String(user?.company || '').trim() === INVENTORY_SUPPORT_COMPANY &&
      String(user?.department || '').trim() === INVENTORY_SUPPORT_DEPARTMENT) ||
    user?.permissions?.mso === true;
  const availableInventoryViews = useMemo(
    () => INVENTORY_VIEWS.filter((view) => canAccessInventorySection(user, view)),
    [user]
  );
  const fallbackInventoryView = availableInventoryViews[0] || null;

  const fetchLogs = useCallback(async () => {
    try {
      const { data, error } = await withMissingColumnFallback(
        async () => {
          let query = supabase.from('inventory_logs').select('*').order('created_at', { ascending: false }).limit(100);
          if (isMsoUser) {
            if (selectedCo && selectedCo !== '전체') {
              query = query.eq('company', selectedCo);
            } else if (selectedCompanyId) {
              query = query.eq('company_id', selectedCompanyId);
            }
          } else if (user?.company) {
            query = query.eq('company', user.company);
          } else if (user?.company_id) {
            query = query.eq('company_id', user.company_id);
          }
          return query;
        },
        async () => {
          let legacyQuery = supabase.from('inventory_logs').select('*').order('created_at', { ascending: false }).limit(100);
          if (isMsoUser) {
            if (selectedCo && selectedCo !== '전체') legacyQuery = legacyQuery.eq('company', selectedCo);
          } else if (user?.company) {
            legacyQuery = legacyQuery.eq('company', user.company);
          }
          return legacyQuery;
        },
      );
      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('재고 로그 조회 실패:', error);
      setLogs([]);
    }
  }, [isMsoUser, selectedCo, selectedCompanyId, user?.company, user?.company_id]);

  // 현황 탭: 회사별 부서 선택용 목록
  const companiesInInventory = useMemo(() =>
    Array.from(new Set(inventory.map((i) => (i.company || '').trim()).filter(Boolean))).sort(),
    [inventory]
  );
  const getDepartmentsForCompany = useCallback((companyName: string) => {
    if (!companyName || companyName === '전체') return [];
    const inventoryDepartments = inventory
      .filter((i) => (i.company || '').trim() === companyName)
      .map((i) => ((i.department as string | undefined) || '').trim())
      .filter(Boolean);
    const configuredDepartments = Array.isArray(depts)
      ? depts
          .map((dept) => (typeof dept === 'string' ? dept : (dept as { name?: string })?.name || ''))
          .map((name: string) => name.trim())
          .filter(Boolean)
      : [];
    return Array.from(new Set([...inventoryDepartments, ...configuredDepartments])).sort();
  }, [inventory, depts]);
  const departmentsByViewCompany = useMemo(() => {
    if (!viewCompany || viewCompany === '전체') return [];
    return getDepartmentsForCompany(viewCompany);
  }, [viewCompany, getDepartmentsForCompany]);
  const departmentsByStockCompany = useMemo(() => {
    if (!stockModal?.targetCompany || stockModal.targetCompany === '전체') return [];
    return getDepartmentsForCompany(stockModal.targetCompany);
  }, [stockModal?.targetCompany, getDepartmentsForCompany]);

  const expiryThreshold = useMemo(() => Date.now() + EXPIRY_SOON_MS, []);
  const baseFilteredInventory = useMemo(() => {
    let list = inventory;
    if (activeView === '현황' && viewCompany && viewCompany !== '전체') {
      list = list.filter((i) => (i.company || '').trim() === viewCompany);
    }
    if (searchKeyword.trim()) {
      const k = searchKeyword.toLowerCase();
      list = list.filter((i) =>
        ((i as Record<string, unknown>).item_name as string || i.name || '').toLowerCase().includes(k) ||
        (i.name || '').toLowerCase().includes(k) ||
        (i.category || '').toLowerCase().includes(k) ||
        ((i as Record<string, unknown>).lot_number as string || '').toLowerCase().includes(k) ||
        (i.company || '').toLowerCase().includes(k)
      );
    }
    if (selectedDept && selectedDept !== '전체') {
      list = list.filter((i) => ((i as Record<string, unknown>).department as string || '').trim() === selectedDept);
    }
    return list;
  }, [inventory, searchKeyword, selectedDept, activeView, viewCompany]);

  const filteredInventory = useMemo(() => {
    if (statusFilter === '전체') return baseFilteredInventory;

    return baseFilteredInventory.filter((item) => {
      const quantity = getItemQuantity(item);
      const minQuantity = getItemMinQuantity(item);
      const expiryImminent = isExpirySoon(item, expiryThreshold);

      if (statusFilter === '재고부족') return quantity <= minQuantity;
      if (statusFilter === '유통기한임박') return expiryImminent;
      if (statusFilter === '정상') return quantity > minQuantity && !expiryImminent;
      return true;
    });
  }, [baseFilteredInventory, expiryThreshold, statusFilter]);

  const lowStockFilteredItems = useMemo(
    () => baseFilteredInventory.filter((item) => getItemQuantity(item) <= getItemMinQuantity(item)),
    [baseFilteredInventory],
  );

  const expiryFilteredItems = useMemo(
    () => baseFilteredInventory.filter((item) => isExpirySoon(item, expiryThreshold)),
    [baseFilteredInventory, expiryThreshold],
  );

  const urgentActionItems = useMemo(() => {
    return baseFilteredInventory
      .filter((item) => getItemQuantity(item) <= getItemMinQuantity(item) || isExpirySoon(item, expiryThreshold))
      .sort((a, b) => {
        const aLow = getItemQuantity(a) <= getItemMinQuantity(a);
        const bLow = getItemQuantity(b) <= getItemMinQuantity(b);
        if (aLow !== bLow) return aLow ? -1 : 1;
        return getItemQuantity(a) - getItemQuantity(b);
      })
      .slice(0, 6);
  }, [baseFilteredInventory, expiryThreshold]);

  const totalQuantity = useMemo(
    () => filteredInventory.reduce((sum: number, item) => sum + getItemQuantity(item), 0),
    [filteredInventory],
  );

  const totalInventoryValue = useMemo(
    () => filteredInventory.reduce((sum: number, item) => sum + (Number((item as Record<string, unknown>).unit_price || 0) * getItemQuantity(item)), 0),
    [filteredInventory],
  );

  const outOfStockItems = useMemo(
    () => baseFilteredInventory.filter((item) => getItemQuantity(item) === 0),
    [baseFilteredInventory],
  );

  const inventoryNameById = useMemo(
    () => new Map(inventory.map((item) => [String(item.id), (item as Record<string, unknown>).item_name as string || item.name || '품목'])),
    [inventory],
  );

  const todayLogCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return logs.filter((log) => String(log.created_at || '').slice(0, 10) === today).length;
  }, [logs]);

  const recentLogPreview = useMemo(
    () =>
      logs.slice(0, 5).map((log) => ({
        ...log,
        itemLabel:
          inventoryNameById.get(String(log.item_id || log.inventory_id || '')) ||
          log.item_name ||
          log.inventory_name ||
          '품목',
      })),
    [inventoryNameById, logs],
  );

  const currentViewMeta = INVENTORY_VIEW_META[activeView] || {
    title: activeView,
    description: '',
  };

  const fetchInventory = useCallback(async (companyFilter?: string) => {
    // 이미 데이터가 있을 때는 전체 로딩 스피너를 표시하지 않음 (탭 전환 시 깜빡임 방지)
    if (!inventoryLoadedRef.current) {
      setLoading(true);
    }
    try {
      const effectiveCo = companyFilter !== undefined ? companyFilter : selectedCo;
      const scopedCompanyName = !isMsoUser
        ? user?.company || null
        : effectiveCo && effectiveCo !== '전체'
          ? effectiveCo
          : null;
      const scopedCompanyId = !isMsoUser
        ? user?.company_id ?? null
        : scopedCompanyName && selectedCompanyId
          ? selectedCompanyId
          : null;

      const { data, error } = await withMissingColumnFallback(
        async () => {
          let query = supabase.from('inventory').select('*').order('item_name', { ascending: true });
          if (scopedCompanyName) {
            query = query.eq('company', scopedCompanyName);
          } else if (scopedCompanyId) {
            query = query.eq('company_id', scopedCompanyId);
          }
          return query;
        },
        async () => {
          let legacyQuery = supabase.from('inventory').select('*').order('item_name', { ascending: true });
          if (scopedCompanyName) legacyQuery = legacyQuery.eq('company', scopedCompanyName);
          return legacyQuery;
        }
      );
      if (error) throw error;
      if (data) {
        setInventory(data);
        inventoryLoadedRef.current = true;
      }
    } catch (err) {
      console.error('재고 데이터 로드 실패:', err);
      setInventory([]);
    } finally {
      setLoading(false);
    }
  }, [isMsoUser, selectedCo, selectedCompanyId, user?.company, user?.company_id]);

  const fetchSuppliers = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('suppliers').select('*');
      if (error) throw error;
      if (data) setSuppliers(data);
    } catch (err) {
      console.error("거래처 데이터 로드 실패:", err);
    }
  }, []);

  const fetchPendingSupplyApprovals = useCallback(async () => {
    if (!isInventoryOpsUser) {
      setPendingSupplyApprovals([]);
      setCompletedSupplyApprovals([]);
      return;
    }

    try {
      const [{ data: approvalsData, error: approvalsError }, { data: supportInventoryRows, error: inventoryError }] =
        await Promise.all([
          supabase
            .from('approvals')
            .select('*')
            .eq('type', '물품신청')
            .eq('status', '승인')
            .order('created_at', { ascending: false }),
          fetchSupportInventoryRows(),
        ]);

      if (approvalsError) throw approvalsError;
      if (inventoryError) throw inventoryError;

      const nextPendingApprovals: ApprovalRecord[] = [];
      const nextCompletedApprovals: ApprovalRecord[] = [];

      (approvalsData || []).forEach((approval) => {
        const workflowItems = buildSupplyRequestWorkflowItems(
          approval?.meta_data?.items,
          supportInventoryRows || [],
          approval?.meta_data?.inventory_workflow?.items,
        );
        if (workflowItems.length === 0) {
          return;
        }

        const summary = summarizeSupplyRequestWorkflow(workflowItems);
        const nextApproval = {
          ...approval,
          live_inventory_workflow: {
            items: workflowItems,
            summary,
          },
        };

        const allHandled = workflowItems.every(
          (workflowItem) => workflowItem.status === 'issued' || workflowItem.status === 'ordered',
        );

        if (allHandled) {
          nextCompletedApprovals.push(nextApproval);
          return;
        }

        nextPendingApprovals.push(nextApproval);
      });

      nextCompletedApprovals.sort((left, right) => {
        const leftApproval = left as Record<string, unknown>;
        const rightApproval = right as Record<string, unknown>;
        const leftLatestProcessedAt = Math.max(
          ...(((leftApproval?.live_inventory_workflow as Record<string, unknown>)?.items as Record<string, unknown>[] || []).map((item) =>
            item?.processed_at ? new Date(item.processed_at as string).getTime() : 0,
          )),
        );
        const rightLatestProcessedAt = Math.max(
          ...(((rightApproval?.live_inventory_workflow as Record<string, unknown>)?.items as Record<string, unknown>[] || []).map((item) =>
            item?.processed_at ? new Date(item.processed_at as string).getTime() : 0,
          )),
        );
        return rightLatestProcessedAt - leftLatestProcessedAt;
      });

      setPendingSupplyApprovals(nextPendingApprovals);
      setCompletedSupplyApprovals(nextCompletedApprovals);
    } catch (error) {
      console.error('승인된 물품신청 처리 목록 로드 실패:', error);
      setPendingSupplyApprovals([]);
      setCompletedSupplyApprovals([]);
    }
  }, [isInventoryOpsUser]);

  const applyResolvedView = useCallback((view?: string | null) => {
    const resolved = resolveInventoryView(view);
    setActiveView(resolved.view);
    setStatusFilter(resolved.statusFilter ?? '전체');
    setSupplierWorkspaceTab(resolved.supplierTab ?? 'suppliers');
    setShowExpiryCenter(Boolean(resolved.showExpiryCenter));
  }, []);

  // 로컬스토리지 복구 또는 initialView 반영
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const requestedView =
      initialView && (VALID_VIEWS as readonly string[]).includes(initialView)
        ? initialView
        : window.localStorage.getItem(INV_VIEW_KEY);

    if (!requestedView || !(VALID_VIEWS as readonly string[]).includes(requestedView)) return;
    if (!canAccessInventorySection(user, requestedView) && !fallbackInventoryView) return;

    const nextView = canAccessInventorySection(user, requestedView) ? requestedView : fallbackInventoryView;
    if (!nextView) return;

    const resolved = resolveInventoryView(nextView);
    applyResolvedView(nextView);
    try {
      window.localStorage.setItem(INV_VIEW_KEY, resolved.view);
    } catch { /* ignore */ }
  }, [applyResolvedView, fallbackInventoryView, initialView, user]);

  useEffect(() => {
    if (!fallbackInventoryView) return;
    if (canAccessInventorySection(user, activeView)) return;
    applyResolvedView(fallbackInventoryView);
  }, [activeView, applyResolvedView, fallbackInventoryView, user]);

  useEffect(() => {
    if (activeView === '이력' || activeView === '현황') {
      void fetchLogs();
    }
  }, [activeView, fetchLogs]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(INV_VIEW_KEY, activeView);
      } catch {
        // ignore localStorage failures
      }
    }
    onViewChange?.(activeView);
  }, [activeView, onViewChange]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  useEffect(() => {
    if (activeView === '현황') {
      fetchInventory('전체');
    } else {
      fetchInventory(selectedCo);
    }
  }, [activeView, selectedCo, fetchInventory]);

  useEffect(() => {
    if (activeView !== '현황') return;
    void fetchPendingSupplyApprovals();
  }, [activeView, fetchPendingSupplyApprovals, inventory]);

  useEffect(() => {
    if (!initialWorkflowApprovalId) return;
    if (activeView !== '현황') {
      applyResolvedView('현황');
    }
    // 운영팀이 아닌 사용자는 공급 워크플로우를 처리할 수 없으므로
    // 즉시 소비하여 '현황' 뷰에 무한으로 갇히지 않도록 한다
    if (!isInventoryOpsUser) {
      onConsumeInitialWorkflowApprovalId?.();
    }
  }, [activeView, applyResolvedView, initialWorkflowApprovalId, isInventoryOpsUser, onConsumeInitialWorkflowApprovalId]);

  useEffect(() => {
    if (!initialWorkflowApprovalId || activeView !== '현황') return;

    const matchedApproval = [...pendingSupplyApprovals, ...completedSupplyApprovals].find(
      (approval) => String((approval as Record<string, unknown>)?.id) === String(initialWorkflowApprovalId),
    );

    if (!matchedApproval) return;

    setHighlightedSupplyApprovalId(String(initialWorkflowApprovalId));
    const selector = `[data-supply-approval-id="${String(initialWorkflowApprovalId)}"]`;
    const scrollTimer = window.setTimeout(() => {
      const target = document.querySelector(selector);
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 120);
    const clearTimer = window.setTimeout(() => {
      setHighlightedSupplyApprovalId((current) =>
        current === String(initialWorkflowApprovalId) ? null : current,
      );
    }, 2600);

    onConsumeInitialWorkflowApprovalId?.();

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [
    activeView,
    completedSupplyApprovals,
    initialWorkflowApprovalId,
    onConsumeInitialWorkflowApprovalId,
    pendingSupplyApprovals,
  ]);

  useEffect(() => {
    if (!isInventoryOpsUser || activeView !== '현황') return;

    const channel = supabase
      .channel(`inventory-supply-approvals-${user?.id || 'guest'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, () => {
        void fetchPendingSupplyApprovals();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeView, fetchPendingSupplyApprovals, isInventoryOpsUser, user?.id]);

  useEffect(() => {
    setSelectedDept('전체');
  }, [viewCompany]);

  const refreshCurrentInventory = useCallback(() => {
    if (activeView === '현황') {
      return fetchInventory('전체');
    }
    return fetchInventory(selectedCo);
  }, [activeView, fetchInventory, selectedCo]);

  const openInventoryView = useCallback(
    (view: string, nextRegistrationMode?: 'form' | 'excel' | 'auto_extract') => {
      if (!(VALID_VIEWS as readonly string[]).includes(view)) return;
      if (!canAccessInventorySection(user, view)) return;
      const resolved = resolveInventoryView(view);
      applyResolvedView(view);
      if (resolved.view === '등록' && nextRegistrationMode) {
        setRegistrationMode(nextRegistrationMode);
      } else if (resolved.view !== '등록') {
        setRegistrationMode('form');
      }
    },
    [applyResolvedView, user],
  );

  const openLinkedSupplyOrder = useCallback(
    (approvalId: string, requestIndex: number) => {
      setHighlightedSupplyOrderTarget({
        approvalId: String(approvalId),
        requestIndex: Number(requestIndex),
      });
      openInventoryView('발주');
    },
    [openInventoryView],
  );

  const handleStockUpdate = async (item: InventoryItem, type: 'in' | 'out', amount: number, targetCompany: string, targetDept: string) => {
    if (amount <= 0) return alert("수량은 0보다 커야 합니다.");
    const currentQty = item.quantity ?? (item as Record<string, unknown>).stock as number ?? 0;
    const newStock = type === 'in' ? currentQty + amount : currentQty - amount;
    if (type === 'out' && newStock < 0) return alert("재고가 부족하여 출고할 수 없습니다.");
    try {
      // 해당 물품의 귀속 회사/부서를 완전히 변경하는 것이 아니라면 inventory 테이블의 소속 구조는 유지하고 로그에만 사유를 기록
      const { error } = await supabase.from('inventory').update({ quantity: newStock, stock: newStock }).eq('id', item.id);
      if (!error) {
        const logRows: Record<string, unknown>[] = [{
          item_id: item.id,
          inventory_id: item.id,
          type: type === 'in' ? '입고' : '출고',
          change_type: type === 'in' ? '입고' : '출고',
          quantity: amount,
          prev_quantity: currentQty,
          next_quantity: newStock,
          actor_name: targetDept && targetDept !== '전체' ? `${user?.name} (${targetDept})` : user?.name,
          company: targetCompany || item.company
        }];
        if (item.company_id || user?.company_id || selectedCompanyId) {
          logRows[0].company_id = item.company_id ?? (user?.company === 'SY INC.' ? selectedCompanyId : user?.company_id);
        }
        await withMissingColumnFallback(
          () => supabase.from('inventory_logs').insert(logRows),
          () => {
            const legacyRows = logRows.map(({ company_id: _cid, ...rest }) => rest);
            return supabase.from('inventory_logs').insert(legacyRows);
          }
        );
        alert(`${type === 'in' ? '입고' : '출고'} 처리가 완료되었습니다.`);
        refreshCurrentInventory();
        void fetchLogs();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('입출고 처리 실패:', err);
    }
  };

  const updateSupplyApprovalWorkflow = useCallback(async (approval: ApprovalRecord, nextItems: SupplyRequestWorkflowItem[]) => {
    const summary = summarizeSupplyRequestWorkflow(nextItems);
    const workflowStatus = nextItems.every(
      (item) => item.status === 'issued' || item.status === 'ordered',
    )
      ? 'completed'
      : 'processing';

    const nextWorkflow = {
      ...(approval?.meta_data?.inventory_workflow || {}),
      status: workflowStatus,
      source_company: INVENTORY_SUPPORT_COMPANY,
      source_department: INVENTORY_SUPPORT_DEPARTMENT,
      updated_at: new Date().toISOString(),
      items: nextItems,
      summary,
    };
    const nextMetaData = {
      ...(approval?.meta_data || {}),
      inventory_workflow: nextWorkflow,
    };

    const { error } = await supabase
      .from('approvals')
      .update({ meta_data: nextMetaData })
      .eq('id', approval.id);

    if (error) {
      throw error;
    }

    return nextWorkflow;
  }, []);

  const handleSupplyIssue = useCallback(async (approval: ApprovalRecord, workflowItem: WorkflowItem) => {
    const actionKey = `${approval.id}:${workflowItem.request_index}:issue`;
    setWorkflowActionKey(actionKey);

    try {
      const { data: supportInventoryRows, error: inventoryError } = await fetchSupportInventoryRows();

      if (inventoryError) throw inventoryError;

      const liveItems = buildSupplyRequestWorkflowItems(
        approval?.meta_data?.items,
        supportInventoryRows || [],
        (approval?.meta_data?.inventory_workflow as Record<string, unknown> | undefined)?.items as Record<string, unknown>[] | undefined,
      );
      const currentItem = liveItems.find(
        (item) => Number(item.request_index) === Number(workflowItem.request_index),
      );

      if (!currentItem) {
        throw new Error('처리할 물품신청 항목을 찾지 못했습니다.');
      }
      if (currentItem.status === 'issued') {
        return;
      }
      if (currentItem.recommended_action !== 'issue') {
        throw new Error('현재 재고가 부족하여 바로 불출할 수 없습니다.');
      }

      const sourceItem =
        (supportInventoryRows || []).find(
          (row) => String(row.id) === String(currentItem.source_inventory_id),
        ) || findSupplySourceInventoryItem(supportInventoryRows || [], currentItem.name);

      if (!sourceItem) {
        throw new Error('경영지원팀 원본 재고를 찾지 못했습니다.');
      }

      await processInventoryIssue({
        sourceItem,
        inventoryRows: supportInventoryRows || [],
        quantity: currentItem.qty,
        toCompany: approval?.sender_company || INVENTORY_SUPPORT_COMPANY,
        toDept: currentItem.dept || '',
        reason: `전자결재 승인 물품신청 (${approval.title})`,
        user,
        destinationCompanyId: approval?.company_id ?? null,
      });

      const nextItems: SupplyRequestWorkflowItem[] = liveItems.map((item) =>
        Number(item.request_index) === Number(currentItem.request_index)
          ? {
              ...item,
              status: 'issued' as const,
              processed_at: new Date().toISOString(),
              processed_by_id: user?.id || null,
              processed_by_name: user?.name || null,
              note: '경영지원팀 재고에서 불출 처리 완료',
            }
          : item,
      );

      await updateSupplyApprovalWorkflow(approval, nextItems);

      if (approval?.sender_id) {
        await supabase.from('notifications').insert([
          {
            user_id: approval.sender_id,
            type: 'inventory',
            title: `[불출 완료] ${currentItem.name}`,
            body: `${currentItem.name} ${currentItem.qty}개가 ${currentItem.dept || '수령부서'}로 불출 처리되었습니다.`,
            metadata: {
              approval_id: approval.id,
              request_index: currentItem.request_index,
            },
          },
        ]);
      }

      await Promise.all([
        Promise.resolve(refreshCurrentInventory()),
        fetchLogs(),
        fetchPendingSupplyApprovals(),
      ]);
      onRefresh?.();
      alert('불출 처리가 완료되었습니다.');
    } catch (error: unknown) {
      console.error('물품신청 불출 처리 실패:', error);
      alert((error as Error)?.message || '불출 처리 중 오류가 발생했습니다.');
    } finally {
      setWorkflowActionKey(null);
    }
  }, [fetchLogs, fetchPendingSupplyApprovals, onRefresh, refreshCurrentInventory, updateSupplyApprovalWorkflow, user]);

  const handleSupplyOrder = useCallback(async (approval: ApprovalRecord, workflowItem: WorkflowItem) => {
    const actionKey = `${approval.id}:${workflowItem.request_index}:order`;
    setWorkflowActionKey(actionKey);

    try {
      const { data: supportInventoryRows, error: inventoryError } = await fetchSupportInventoryRows();

      if (inventoryError) throw inventoryError;

      const liveItems = buildSupplyRequestWorkflowItems(
        approval?.meta_data?.items,
        supportInventoryRows || [],
        (approval?.meta_data?.inventory_workflow as Record<string, unknown> | undefined)?.items as Record<string, unknown>[] | undefined,
      );
      const currentItem = liveItems.find(
        (item) => Number(item.request_index) === Number(workflowItem.request_index),
      );

      if (!currentItem) {
        throw new Error('처리할 물품신청 항목을 찾지 못했습니다.');
      }
      if (currentItem.status === 'ordered') {
        return;
      }

      const sourceItem =
        (supportInventoryRows || []).find(
          (row) => String(row.id) === String(currentItem.source_inventory_id),
        ) || findSupplySourceInventoryItem(supportInventoryRows || [], currentItem.name);

      let orderRequested = false;
      let note = '기준 재고가 없어 수동 발주가 필요합니다.';

      if (sourceItem) {
        const reorderQuantity = Math.max(currentItem.shortage_qty || currentItem.qty, 1);
        const { error } = await requestInventoryReorder({
          item: sourceItem,
          user,
          quantity: reorderQuantity,
          reason: `[승인 연동 발주] ${approval.title}\n${currentItem.name} ${reorderQuantity}개 보충 필요 / 수령부서: ${currentItem.dept || '-'}`,
          metaData: {
            source_supply_approval_id: approval.id,
            source_supply_request_index: currentItem.request_index,
            source_supply_title: approval.title,
            source_requester_name: approval?.sender_name || null,
            source_requester_company: approval?.sender_company || null,
            source_requester_department: currentItem.dept || null,
            source_requested_quantity: currentItem.qty,
            source_shortage_quantity: reorderQuantity,
          },
        });
        if (error) throw error;

        orderRequested = true;
        note = `자동 발주 기안을 생성했습니다. 보충 수량 ${reorderQuantity}개`;
      }

      const nextItems: SupplyRequestWorkflowItem[] = liveItems.map((item) =>
        Number(item.request_index) === Number(currentItem.request_index)
          ? {
              ...item,
              status: 'ordered' as const,
              processed_at: new Date().toISOString(),
              processed_by_id: user?.id || null,
              processed_by_name: user?.name || null,
              order_approval_requested: orderRequested,
              note,
            }
          : item,
      );

      await updateSupplyApprovalWorkflow(approval, nextItems);

      if (approval?.sender_id) {
        await supabase.from('notifications').insert([
          {
            user_id: approval.sender_id,
            type: 'inventory',
            title: `[발주 진행] ${currentItem.name}`,
            body: `${currentItem.name} ${currentItem.qty}개는 재고가 부족해 발주 절차로 전환되었습니다.`,
            metadata: {
              approval_id: approval.id,
              request_index: currentItem.request_index,
            },
          },
        ]);
      }

      await fetchPendingSupplyApprovals();
      alert(orderRequested ? '발주 요청을 등록했습니다.' : '자동 발주 기준 재고가 없어 발주 필요 상태로만 표시했습니다.');
    } catch (error: unknown) {
      console.error('물품신청 발주 처리 실패:', error);
      alert((error as Error)?.message || '발주 처리 중 오류가 발생했습니다.');
    } finally {
      setWorkflowActionKey(null);
    }
  }, [fetchPendingSupplyApprovals, updateSupplyApprovalWorkflow, user]);

  const pendingSupplyApprovalSummary = useMemo(() => (
    pendingSupplyApprovals.reduce(
      (summary, approval) => {
        const workflowSummary = approval?.live_inventory_workflow?.summary;
        summary.approval_count += 1;
        summary.issue_ready_count += Number(workflowSummary?.issue_ready_count || 0);
        summary.order_required_count += Number(workflowSummary?.order_required_count || 0);
        return summary;
      },
      {
        approval_count: 0,
        issue_ready_count: 0,
        order_required_count: 0,
      } as { approval_count: number; issue_ready_count: number; order_required_count: number },
    )
  ), [pendingSupplyApprovals]);

  const completedSupplyApprovalSummary = useMemo(() => (
    completedSupplyApprovals.reduce(
      (summary, approval) => {
        const workflowSummary = approval?.live_inventory_workflow?.summary;
        summary.approval_count += 1;
        summary.issued_count += Number(workflowSummary?.issued_count || 0);
        summary.ordered_count += Number(workflowSummary?.ordered_count || 0);
        return summary;
      },
      {
        approval_count: 0,
        issued_count: 0,
        ordered_count: 0,
      } as { approval_count: number; issued_count: number; ordered_count: number },
    )
  ), [completedSupplyApprovals]);

  if (!fallbackInventoryView) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center bg-[var(--muted)] p-4 text-center"
        data-testid="inventory-view"
      >
        <div className="mb-4 text-6xl">🔒</div>
        <h2 className="text-xl font-bold text-[var(--foreground)]">재고관리 접근 권한이 없습니다.</h2>
        <p className="mt-2 text-sm font-semibold text-[var(--toss-gray-3)]">
          메인 메뉴 권한과 재고관리 세부 권한을 확인해 주세요.
        </p>
      </div>
    );
  }

  const handleAutoApprovalRequest = async (item: InventoryItem) => {
    const quantity = getItemQuantity(item);
    const minQuantity = getItemMinQuantity(item);
    const itemName = item.item_name || item.name || '품목';
    const requestQuantity = Math.max(minQuantity * 2 - quantity, 1);
    if (!confirm(`[안전재고 부족] ${itemName} 품목의 비품구매 신청서를 자동으로 작성하여 MSO 결재 상신을 진행하시겠습니까?`)) return;
    try {
      const { error } = await requestInventoryReorder({
        item,
        user,
        selectedCompanyId,
        quantity: requestQuantity,
        reason: `현재고(${quantity})가 안전재고(${minQuantity}) 이하로 떨어져 자동 기안되었습니다.\n보충 필요량: ${requestQuantity}개`,
      });
      if (error) throw error;
      alert('비품구매 신청서가 MSO 관리자에게 성공적으로 상신되었습니다.');
    } catch (err) {
      console.error('결재 상신 실패:', err);
      alert('자동 기안 중 오류가 발생했습니다.');
    }
  };

  const executeStockUpdate = () => {
    if (!stockModal) return;
    handleStockUpdate(stockModal.item, stockModal.type, stockAmount, stockModal.targetCompany, stockModal.targetDept);
    setStockModal(null);
    setStockAmount(1);
  };

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-x-hidden app-page"
      data-testid="inventory-view"
    >
      <InventoryAlertBadge lowCount={lowStockItems.length} expiryCount={expiryImminentItems.length} />
      {/* 상세 메뉴(UDI·명세서 등)는 메인 좌측 사이드바에서 재고관리 호버/클릭 시 플라이아웃으로 선택 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <main className="flex-1 p-4 md:p-5 bg-[var(--page-bg)] overflow-y-auto custom-scrollbar">
          <section className="mb-4 md:mb-5">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-5 py-4 shadow-sm">
              <div className="flex flex-col gap-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">재고관리</p>
                <h2 className="text-2xl font-black tracking-tight text-[var(--foreground)]">{currentViewMeta.title}</h2>
              </div>
            </div>
          </section>

          {activeView === '현황' && (
            loading ? (
              <div className="h-full flex items-center justify-center font-bold text-[var(--toss-gray-3)]">데이터 동기화 중...</div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="flex-1 flex flex-wrap items-center gap-2">
                      <select
                        value={viewCompany}
                        onChange={(e) => setViewCompany(e.target.value)}
                        className="px-3 py-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-bold min-w-[140px]"
                        title="회사 선택"
                      >
                        <option value="전체">전체 회사</option>
                        {companiesInInventory.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <select
                        value={selectedDept}
                        onChange={(e) => setSelectedDept(e.target.value)}
                        className="px-3 py-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-bold min-w-[120px]"
                        title="부서 선택 (선택한 회사 기준)"
                      >
                        <option value="전체">전체 부서</option>
                        {departmentsByViewCompany.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="품목명 · 분류 · LOT · 회사 검색"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        className="flex-1 min-w-[160px] max-w-md px-4 py-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['전체', '재고부족', '유통기한임박', '정상'] as const).map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setStatusFilter(filter)}
                          className={`rounded-[var(--radius-md)] px-3 py-2 text-[11px] font-bold transition-all ${
                            statusFilter === filter
                              ? 'bg-[var(--foreground)] text-white shadow-sm'
                              : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--toss-blue-light)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          {filter === '유통기한임박' ? '유통기한 임박' : filter}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setViewCompany('전체');
                          setSelectedDept('전체');
                          setSearchKeyword('');
                          setStatusFilter('전체');
                          setShowExpiryCenter(false);
                        }}
                        className="px-4 py-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[11px] font-bold text-[var(--foreground)] transition-all hover:bg-[var(--muted)]"
                      >
                        초기화
                      </button>
                      <button
                        onClick={() => void refreshCurrentInventory()}
                        className="px-4 py-3 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] text-xs font-semibold hover:bg-[var(--border)] transition-all shrink-0"
                      >
                        새로고침
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">현재 필터</span>
                    <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
                      회사 {viewCompany === '전체' ? '전체' : viewCompany}
                    </span>
                    <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)]">
                      부서 {selectedDept === '전체' ? '전체' : selectedDept}
                    </span>
                    <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)]">
                      상태 {statusFilter === '유통기한임박' ? '유통기한 임박' : statusFilter}
                    </span>
                    {searchKeyword.trim() && (
                      <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-bold text-[var(--foreground)]">
                        검색어 {searchKeyword.trim()}
                      </span>
                    )}
                  </div>
                </div>
                {isInventoryOpsUser && pendingSupplyApprovals.length > 0 && (
                  <section
                    className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
                    data-testid="inventory-supply-approval-panel"
                  >
                    <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">Approved Supply Requests</p>
                        <h3 className="mt-1 text-lg font-black text-[var(--foreground)]">승인된 물품신청 처리</h3>
                        <p className="mt-1 text-xs text-[var(--toss-gray-3)]">경영지원팀 재고 기준으로 불출 가능 여부를 확인하고, 부족하면 발주로 넘겨주세요.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
                          문서 {pendingSupplyApprovalSummary.approval_count}건
                        </span>
                        <span className="rounded-[var(--radius-md)] bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-600">
                          불출 가능 {pendingSupplyApprovalSummary.issue_ready_count}건
                        </span>
                        <span className="rounded-[var(--radius-md)] bg-orange-50 px-3 py-1 text-[11px] font-bold text-orange-600">
                          발주 필요 {pendingSupplyApprovalSummary.order_required_count}건
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {pendingSupplyApprovals.map((approval) => {
                        const workflowItems = approval?.live_inventory_workflow?.items || [];
                        const workflowSummary = approval?.live_inventory_workflow?.summary || {
                          issue_ready_count: 0,
                          order_required_count: 0,
                        };

                        return (
                          <article
                            key={approval.id}
                            className={`rounded-[var(--radius-xl)] border bg-[var(--page-bg)] p-4 transition-all ${
                              highlightedSupplyApprovalId === String(approval.id)
                                ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20 shadow-sm'
                                : 'border-[var(--border)]'
                            }`}
                            data-testid={`inventory-supply-approval-${approval.id}`}
                            data-supply-approval-id={String(approval.id)}
                            data-highlighted={highlightedSupplyApprovalId === String(approval.id) ? 'true' : 'false'}
                          >
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div>
                                <h4 className="text-sm font-bold text-[var(--foreground)]">{approval.title}</h4>
                                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                                  신청자 {approval.sender_name || '-'} / 회사 {approval.sender_company || '-'} / 문서번호 {approval.doc_number || approval.meta_data?.doc_number || '-'}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-[var(--radius-md)] bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600">
                                  불출 가능 {workflowSummary.issue_ready_count}건
                                </span>
                                <span className="rounded-[var(--radius-md)] bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-600">
                                  발주 필요 {workflowSummary.order_required_count}건
                                </span>
                              </div>
                            </div>

                            <div className="mt-3 space-y-2">
                              {(workflowItems as Record<string, unknown>[]).map((workflowItem) => {
                                const actionKeyPrefix = `${approval.id}:${workflowItem.request_index}`;
                                const isBusy =
                                  workflowActionKey === `${actionKeyPrefix}:issue` ||
                                  workflowActionKey === `${actionKeyPrefix}:order`;
                                const isIssued = workflowItem.status === 'issued';
                                const isOrdered = workflowItem.status === 'ordered';
                                const canIssue = workflowItem.recommended_action === 'issue' && !isIssued && !isOrdered;
                                const canOrder = workflowItem.recommended_action === 'order' && !isOrdered && !isIssued;

                                return (
                                  <div
                                    key={`${approval.id}-${workflowItem.request_index}`}
                                    className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 lg:grid-cols-[minmax(0,1.7fr)_88px_88px_120px_auto]"
                                    data-testid={`inventory-supply-approval-item-${approval.id}-${workflowItem.request_index}`}
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold text-[var(--foreground)]">{String(workflowItem.name ?? '')}</p>
                                      <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                                        용도 {String(workflowItem.purpose ?? '') || '-'} / 수령부서 {String(workflowItem.dept ?? '') || '-'}
                                      </p>
                                      {!!workflowItem.note && (
                                        <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">{String(workflowItem.note)}</p>
                                      )}
                                    </div>
                                    <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-center">
                                      <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">요청</p>
                                      <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{String(workflowItem.qty ?? '')}</p>
                                    </div>
                                    <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-center">
                                      <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">재고</p>
                                      <p className={`mt-1 text-sm font-bold ${Number(workflowItem.shortage_qty) > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                                        {String(workflowItem.available_qty ?? '')}
                                      </p>
                                    </div>
                                    <div className="flex items-center">
                                      <span className={`rounded-[var(--radius-md)] px-3 py-1 text-[10px] font-bold ${
                                        isIssued
                                          ? 'bg-emerald-50 text-emerald-600'
                                          : isOrdered
                                            ? 'bg-orange-50 text-orange-600'
                                            : workflowItem.recommended_action === 'issue'
                                              ? 'bg-blue-50 text-[var(--accent)]'
                                              : 'bg-red-50 text-red-600'
                                      }`}>
                                        {isIssued
                                          ? '불출 완료'
                                          : isOrdered
                                            ? '발주 처리'
                                            : workflowItem.recommended_action === 'issue'
                                              ? '불출 확인'
                                              : '재고 부족'}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      {canIssue && (
                                        <button
                                          type="button"
                                          onClick={() => void handleSupplyIssue(approval, workflowItem)}
                                          disabled={isBusy}
                                          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                          data-testid={`inventory-supply-issue-${approval.id}-${workflowItem.request_index}`}
                                        >
                                          {isBusy ? '처리 중...' : '불출 처리'}
                                        </button>
                                      )}
                                      {canOrder && (
                                        <button
                                          type="button"
                                          onClick={() => void handleSupplyOrder(approval, workflowItem)}
                                          disabled={isBusy}
                                          className="rounded-[var(--radius-md)] bg-orange-600 px-3 py-2 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                          data-testid={`inventory-supply-order-${approval.id}-${workflowItem.request_index}`}
                                        >
                                          {isBusy ? '처리 중...' : '발주 처리'}
                                        </button>
                                      )}
                                      {(isIssued || isOrdered) && (
                                        <span className="text-[10px] font-bold text-[var(--toss-gray-3)]">
                                          {String(workflowItem.processed_by_name ?? '') || '처리 완료'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
                {isInventoryOpsUser && completedSupplyApprovals.length > 0 && (
                  <section
                    className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
                    data-testid="inventory-supply-history-panel"
                  >
                    <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">Processed Supply History</p>
                        <h3 className="mt-1 text-lg font-black text-[var(--foreground)]">처리 완료 히스토리</h3>
                        <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
                          최근 처리된 물품신청 결과를 확인하고, 발주 건은 바로 발주관리 탭으로 이어서 확인할 수 있습니다.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
                          문서 {completedSupplyApprovalSummary.approval_count}건
                        </span>
                        <span className="rounded-[var(--radius-md)] bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-600">
                          불출 완료 {completedSupplyApprovalSummary.issued_count}건
                        </span>
                        <span className="rounded-[var(--radius-md)] bg-orange-50 px-3 py-1 text-[11px] font-bold text-orange-600">
                          발주 전환 {completedSupplyApprovalSummary.ordered_count}건
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {completedSupplyApprovals.slice(0, 8).map((approval) => {
                        const workflowItems = approval?.live_inventory_workflow?.items || [];
                        const latestProcessedAt =
                          workflowItems.reduce((latest: string | null, item) => {
                            const processedAt = item?.processed_at as string | null | undefined;
                            if (!processedAt) return latest;
                            if (!latest) return processedAt;
                            return new Date(processedAt).getTime() > new Date(latest).getTime()
                              ? processedAt
                              : latest;
                          }, null) || approval.created_at;

                        return (
                          <article
                            key={`history-${approval.id}`}
                            className={`rounded-[var(--radius-xl)] border bg-[var(--page-bg)] p-4 transition-all ${
                              highlightedSupplyApprovalId === String(approval.id)
                                ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20 shadow-sm'
                                : 'border-[var(--border)]'
                            }`}
                            data-testid={`inventory-supply-history-${approval.id}`}
                            data-supply-approval-id={String(approval.id)}
                            data-highlighted={highlightedSupplyApprovalId === String(approval.id) ? 'true' : 'false'}
                          >
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div>
                                <h4 className="text-sm font-bold text-[var(--foreground)]">{approval.title}</h4>
                                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                                  신청자 {approval.sender_name || '-'} / 회사 {approval.sender_company || '-'}
                                </p>
                              </div>
                              <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                                최근 처리 {latestProcessedAt ? new Date(latestProcessedAt).toLocaleString('ko-KR') : '-'}
                              </p>
                            </div>

                            <div className="mt-3 space-y-2">
                              {workflowItems.map((workflowItem) => {
                                const isOrdered = workflowItem.status === 'ordered';
                                const isIssued = workflowItem.status === 'issued';

                                return (
                                  <div
                                    key={`history-item-${approval.id}-${String(workflowItem.request_index ?? '')}`}
                                    className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 lg:grid-cols-[minmax(0,1.6fr)_88px_130px_auto]"
                                    data-testid={`inventory-supply-history-item-${approval.id}-${String(workflowItem.request_index ?? '')}`}
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold text-[var(--foreground)]">{String(workflowItem.name ?? '')}</p>
                                      <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                                        용도 {String(workflowItem.purpose ?? '') || '-'} / 수령부서 {String(workflowItem.dept ?? '') || '-'}
                                      </p>
                                      {!!workflowItem.note && (
                                        <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">{String(workflowItem.note)}</p>
                                      )}
                                    </div>
                                    <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-center">
                                      <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">처리수량</p>
                                      <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{String(workflowItem.qty ?? '')}</p>
                                    </div>
                                    <div className="flex items-center">
                                      <span className={`rounded-[var(--radius-md)] px-3 py-1 text-[10px] font-bold ${
                                        isIssued ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'
                                      }`}>
                                        {isIssued ? '불출 완료' : '발주 처리'}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      <span className="text-[10px] font-bold text-[var(--toss-gray-3)]">
                                        {String(workflowItem.processed_by_name ?? '') || '처리 완료'}
                                      </span>
                                      {isOrdered && (
                                        <button
                                          type="button"
                                          onClick={() => openLinkedSupplyOrder(approval.id ?? '', workflowItem.request_index as number)}
                                          className="rounded-[var(--radius-md)] bg-[var(--foreground)] px-3 py-2 text-[11px] font-bold text-white"
                                          data-testid={`inventory-supply-history-open-order-${approval.id}-${String(workflowItem.request_index ?? '')}`}
                                        >
                                          발주 보기
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <div className="bg-[var(--card)] p-4 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">조회 품목</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{filteredInventory.length}</p>
                  </div>
                  <div className="bg-[var(--card)] p-4 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">안전재고 미달</p>
                    <p className="mt-1 text-xl font-semibold text-red-600">{lowStockFilteredItems.length}</p>
                  </div>
                  <div className="bg-[var(--card)] p-4 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">유효기간 임박</p>
                    <p className="mt-1 text-xl font-semibold text-orange-600">{expiryFilteredItems.length}</p>
                  </div>
                  <div className="bg-[var(--card)] p-4 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">총 재고 수량</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">{totalQuantity.toLocaleString('ko-KR')}</p>
                  </div>
                  <div className="bg-[var(--card)] p-4 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">재고 평가 금액</p>
                    <p className="mt-1.5 break-keep text-[13px] font-semibold text-[var(--foreground)]">{formatCurrency(totalInventoryValue)}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => openInventoryView('발주')}
                    className="rounded-[var(--radius-lg)] border border-red-100 bg-red-50 px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                  >
                    <p className="text-[11px] font-bold text-red-500">우선 처리</p>
                    <p className="mt-1.5 text-sm font-bold text-red-700">발주 관리로 이동</p>
                    <p className="mt-1 text-[11px] text-red-500">지금 보충이 필요한 품목 {lowStockFilteredItems.length}건</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => openInventoryView('유통기한')}
                    className="rounded-[var(--radius-lg)] border border-orange-100 bg-orange-50 px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                  >
                    <p className="text-[11px] font-bold text-orange-500">품질 점검</p>
                    <p className="mt-1.5 text-sm font-bold text-orange-700">유효기간 센터 열기</p>
                    <p className="mt-1 text-[11px] text-orange-500">빠른 확인이 필요한 품목 {expiryFilteredItems.length}건</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchKeyword('')}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                  >
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">현황 확인</p>
                    <p className="mt-1.5 text-sm font-bold text-[var(--foreground)]">품절 품목 빠르게 파악</p>
                    <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">현재 범위에서 재고 0개 품목 {outOfStockItems.length}건</p>
                  </button>
                </div>

                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-base font-bold text-[var(--foreground)]">우선 확인 품목</h3>
                        <p className="mt-1 text-xs text-[var(--toss-gray-3)]">재고부족과 유통기한 임박 품목을 먼저 확인하세요.</p>
                      </div>
                      <span className="rounded-[var(--radius-md)] bg-red-50 px-3 py-1 text-[11px] font-bold text-red-600">
                        {urgentActionItems.length}건
                      </span>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {urgentActionItems.length === 0 && (
                        <div className="col-span-full rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-4 text-center text-sm text-[var(--toss-gray-3)]">
                          긴급 조치가 필요한 품목이 없습니다.
                        </div>
                      )}

                      {urgentActionItems.map((item) => {
                        const quantity = getItemQuantity(item);
                        const minQuantity = getItemMinQuantity(item);
                        const expiryImminent = isExpirySoon(item, expiryThreshold);
                        const itemExtra = item as Record<string, unknown>;
                        const itemName = String(itemExtra.item_name || item.name || '');
                        const itemDept = String(itemExtra.department || '');

                        return (
                          <article key={item.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-3.5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-[var(--foreground)]">{itemName}</p>
                                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{item.company || '-'} · {itemDept || '부서 미지정'}</p>
                              </div>
                              <span className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-bold ${
                                quantity <= minQuantity ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                              }`}>
                                {quantity <= minQuantity ? '재고부족' : '기한임박'}
                              </span>
                            </div>
                            <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] font-semibold text-[var(--toss-gray-4)]">
                              <span>현재고 {quantity}</span>
                              <span>안전 {minQuantity}</span>
                              {expiryImminent && <span>기한 {item.expiry_date}</span>}
                            </div>
                            <div className="mt-2.5 flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setStockModal({ item, type: 'in', targetCompany: item.company || '전체', targetDept: itemDept || '전체' });
                                  setStockAmount(Math.max(1, minQuantity - quantity + 1));
                                }}
                                className="flex-1 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white"
                              >
                                입고
                              </button>
                              {quantity <= minQuantity && (
                                <button
                                  type="button"
                                  onClick={() => handleAutoApprovalRequest(item)}
                                  className="flex-1 rounded-[var(--radius-md)] bg-orange-600 px-3 py-1.5 text-[11px] font-bold text-white"
                                >
                                  발주
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                      <thead>
                        <tr className="bg-[var(--muted)]/50 border-b border-[var(--border)]">
                          <th className="px-5 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">회사/분류</th>
                          <th className="px-5 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">품목명/LOT</th>
                          <th className="px-5 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-center">현재고</th>
                          <th className="px-5 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-center">단가</th>
                          <th className="px-5 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-center">유효기간</th>
                          <th className="px-5 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">상태</th>
                          <th className="px-5 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-right">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {filteredInventory.map(item => {
                          const quantity = getItemQuantity(item);
                          const minQuantity = getItemMinQuantity(item);
                          const isExpiryImminent = isExpirySoon(item, expiryThreshold);
                          const itemEx = item as Record<string, unknown>;
                          const displayName = String(itemEx.item_name || item.name || '');
                          const itemDepartment = String(itemEx.department || '');
                          const lotNumber = itemEx.lot_number ? String(itemEx.lot_number) : null;
                          const isUdi = Boolean(itemEx.is_udi);
                          return (
                            <tr key={item.id} className="hover:bg-[var(--toss-blue-light)]/50 transition-all group">
                              <td className="px-5 py-3.5">
                                <p className="text-[11px] font-semibold text-[var(--accent)]">{item.company || '-'}</p>
                                <p className="text-[8px] font-bold text-[var(--toss-gray-3)]">{item.category || '미분류'}</p>
                              </td>
                              <td className="px-5 py-3.5">
                                <p className="text-xs font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">{displayName}</p>
                                <div className="flex gap-1 mt-0.5">
                                  {lotNumber && <span className="text-[7px] font-semibold bg-[var(--muted)] text-[var(--toss-gray-4)] px-1 py-0.5 rounded">LOT: {lotNumber}</span>}
                                  {isUdi && <span className="text-[7px] font-semibold bg-purple-50 text-purple-500 px-1 py-0.5 rounded uppercase">UDI</span>}
                                </div>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <span className={`text-xs font-semibold ${quantity <= minQuantity ? 'text-red-600' : 'text-[var(--foreground)]'}`}>{quantity}</span>
                                <p className="text-[8px] font-bold text-[var(--toss-gray-3)]">안전: {minQuantity}</p>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <p className="text-xs font-semibold text-[var(--toss-gray-4)]">{formatCurrency(Number(item.unit_price || 0))}</p>
                                <p className="text-[8px] font-bold text-[var(--toss-gray-3)]">총액: {formatCurrency((Number(item.unit_price || 0) * quantity))}</p>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <p className={`text-[11px] font-semibold ${isExpiryImminent ? 'text-orange-600' : 'text-[var(--toss-gray-3)]'}`}>
                                  {item.expiry_date || '-'}
                                </p>
                                {isExpiryImminent && <p className="text-[7px] font-semibold text-orange-400 animate-pulse">임박</p>}
                              </td>
                              <td className="px-5 py-3.5">
                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-semibold ${quantity <= minQuantity ? 'bg-red-50 text-red-600' : isExpiryImminent ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'}`}>
                                  {quantity <= minQuantity ? '재고부족' : isExpiryImminent ? '기한임박' : '정상'}
                                </span>
                              </td>
                              <td data-testid={`inventory-actions-${item.id}`} className="px-5 py-3.5 text-right space-x-1">
                                <button data-testid={`inventory-stock-in-${item.id}`} onClick={() => { setStockModal({ item, type: 'in', targetCompany: item.company || '전체', targetDept: itemDepartment || '전체' }); setStockAmount(1); }} className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--accent)] text-[11px] font-semibold rounded-md hover:bg-[var(--toss-blue-light)]">입고</button>
                                <button data-testid={`inventory-stock-out-${item.id}`} onClick={() => { setStockModal({ item, type: 'out', targetCompany: item.company || '전체', targetDept: itemDepartment || '전체' }); setStockAmount(1); }} className="px-2 py-1 bg-[var(--muted)] text-[var(--toss-gray-4)] text-[11px] font-semibold rounded-md hover:bg-[var(--muted)]/80">출고</button>
                                {quantity <= minQuantity && (
                                  <button data-testid={`inventory-reorder-${item.id}`} onClick={() => handleAutoApprovalRequest(item)} className="px-2 py-1 bg-orange-600 text-white text-[11px] font-semibold rounded-md shadow-sm">발주</button>
                                )}
                                <button
                                  data-testid={`inventory-delete-${item.id}`}
                                  onClick={async () => {
                                    if (confirm(`[${displayName}] 품목을 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
                                      try {
                                        await supabase.from('inventory').delete().eq('id', item.id);
                                        alert('삭제되었습니다.');
                                        refreshCurrentInventory();
                                      } catch (err) {
                                        alert('삭제 오류가 발생했습니다.');
                                      }
                                    }
                                  }}
                                  className="px-2 py-1 bg-red-50 text-red-600 text-[11px] font-semibold rounded-md hover:bg-red-100"
                                >
                                  삭제
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {showExpiryCenter && (
                  <section className="rounded-[var(--radius-xl)] border border-orange-100 bg-[var(--card)] p-5 shadow-sm">
                    <div className="mb-4 flex flex-col gap-3 border-b border-orange-100 pb-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-base font-bold text-[var(--foreground)]">유효기간 관리 센터</h3>
                        <p className="mt-1 text-xs text-[var(--toss-gray-3)]">임박 품목 확인과 알림 발송, 보고서 다운로드를 한 화면에서 처리합니다.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowExpiryCenter(false)}
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[11px] font-bold text-[var(--foreground)] transition-all hover:bg-[var(--muted)]"
                      >
                        센터 닫기
                      </button>
                    </div>
                    <ExpirationAlert />
                  </section>
                )}
              </div>
            )
          )}
          {activeView === '이력' && (
            <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
              <div className="flex flex-col gap-3 border-b border-[var(--border)] px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">최근 입출고 이력</h3>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchLogs()}
                  className="rounded-[var(--radius-md)] bg-[var(--muted)] px-4 py-3 text-[11px] font-bold text-[var(--toss-gray-4)] transition-all hover:bg-[var(--border)]"
                >
                  새로고침
                </button>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                {logs.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm font-semibold text-[var(--toss-gray-3)]">이력이 없습니다.</div>
                ) : (
                  <table className="min-w-[860px] w-full text-left text-xs">
                    <thead className="bg-[var(--muted)]/50 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">
                      <tr>
                        <th className="px-4 py-3">일시</th>
                        <th className="px-4 py-3">유형</th>
                        <th className="px-4 py-3">수량</th>
                        <th className="px-4 py-3">변동</th>
                        <th className="px-4 py-3">처리자</th>
                        <th className="px-4 py-3">회사</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => {
                        const logId = String(log.id ?? '');
                        const logCreatedAt = log.created_at ? new Date(String(log.created_at)).toLocaleString('ko-KR') : '-';
                        const logChangeType = String(log.change_type || log.type || '');
                        const logQuantity = log.quantity ?? '-';
                        const logPrevQty = log.prev_quantity;
                        const logNextQty = log.next_quantity;
                        return (
                        <tr key={logId} className="border-t border-[var(--border)]">
                          <td className="px-4 py-3 font-mono text-[11px] text-[var(--toss-gray-4)]">{logCreatedAt}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-bold ${
                              logChangeType === '입고'
                                ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                                : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                            }`}>
                              {logChangeType || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-[var(--foreground)]">{String(logQuantity)}</td>
                          <td className="px-4 py-3 text-[var(--toss-gray-3)]">
                            {logPrevQty !== undefined && logPrevQty !== null ? `${String(logPrevQty)} → ${String(logNextQty ?? '')}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-[var(--foreground)]">{String(log.actor_name || '') || '-'}</td>
                          <td className="px-4 py-3 text-[var(--toss-gray-4)]">{String(log.company || '') || '-'}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}
          {activeView === 'UDI' && <UDIManagement user={user} inventory={inventory} fetchInventory={fetchInventory} />}
          {activeView === '발주' && (
            <PurchaseOrderManagement
              user={user}
              inventory={inventory}
              suppliers={suppliers}
              fetchInventory={fetchInventory}
              highlightedSource={highlightedSupplyOrderTarget}
              onConsumeHighlightedSource={() => setHighlightedSupplyOrderTarget(null)}
            />
          )}
          {activeView === '스캔' && (
            <ScanModule
              user={user}
              inventory={inventory}
              fetchInventory={fetchInventory}
            />
          )}
          {activeView === '등록' && (
            <div className="space-y-4">
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setRegistrationMode('form')}
                  className={`flex-1 px-4 py-3 rounded-[var(--radius-md)] text-[11px] font-semibold transition-all ${registrationMode === 'form'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                    }`}
                >
                  ✏️ 일반 등록
                </button>
                <button
                  type="button"
                  onClick={() => setRegistrationMode('excel')}
                  className={`flex-1 px-4 py-3 rounded-[var(--radius-md)] text-[11px] font-semibold transition-all ${registrationMode === 'excel'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                    }`}
                >
                  📊 엑셀 일괄 등록
                </button>
                <button
                  type="button"
                  onClick={() => setRegistrationMode('auto_extract')}
                  className={`flex-1 px-4 py-3 rounded-[var(--radius-md)] text-[11px] font-semibold transition-all ${registrationMode === 'auto_extract'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                    }`}
                >
                  📄 입고 자동추출 (AI)
                </button>
              </div>
              {registrationMode === 'form' ? (
                <ProductRegistration
                  user={user}
                  suppliers={suppliers}
                  fetchInventory={fetchInventory}
                  fetchSuppliers={fetchSuppliers}
                />
              ) : registrationMode === 'excel' ? (
                <ExcelBulkUpload onRefresh={fetchInventory} />
              ) : (
                <InvoiceAutoExtraction onRefresh={fetchInventory} user={user} />
              )}
            </div>
          )}
          {activeView === '자산' && <QRAssetManager user={user} inventory={inventory} fetchInventory={() => fetchInventory(selectedCo)} />}
          {activeView === 'AS반품' && <ASReturnManagement user={user} />}
          {activeView === '거래처' && (
            <SupplierDocumentWorkspace
              user={user}
              inventory={inventory}
              suppliers={suppliers}
              fetchSuppliers={fetchSuppliers}
              initialTab={supplierWorkspaceTab}
            />
          )}
          {activeView === '재고실사' && <InventoryCount user={user} inventory={inventory} fetchInventory={() => fetchInventory(selectedCo)} />}
          {activeView === '이관' && <InventoryTransfer user={user} inventory={inventory} fetchInventory={() => fetchInventory(selectedCo)} />}
          {activeView === '카테고리' && <CategoryManager user={user} />}
          {activeView === '소모품통계' && <ConsumableStats user={user} selectedCo={selectedCo ?? ''} />}
          {activeView === '납품확인서' && <DeliveryConfirmation user={user} selectedCo={selectedCo ?? ''} />}
          {activeView === '수요예측' && <InventoryDemandForecast user={user} inventory={inventory} selectedCo={selectedCo ?? ''} />}
        </main>
      </div>

      {/* 입출고 수량 입력 모달 */}
      {stockModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={() => setStockModal(null)}>
          <div data-testid="inventory-stock-modal" className="bg-[var(--card)] rounded-[var(--radius-lg)] shadow-sm p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">{stockModal.type === 'in' ? '입고' : '출고'} 상세 입력</h3>
            <p className="text-xs font-bold text-[var(--toss-gray-3)] mb-2">{String((stockModal.item as Record<string, unknown>).item_name || stockModal.item.name || '')}</p>
            <p className="text-[11px] text-[var(--toss-gray-3)] mb-4">현재고: {stockModal.item.quantity ?? Number((stockModal.item as Record<string, unknown>).stock ?? 0)}</p>

            <div className="space-y-4 mb-4">
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">수량 (개/단위)</label>
                <input data-testid="inventory-stock-amount-input" type="number" min={1} max={stockModal.type === 'out' ? (stockModal.item.quantity ?? Number((stockModal.item as Record<string, unknown>).stock ?? 0)) : 99999} value={stockAmount} onChange={e => setStockAmount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-3 rounded-[var(--radius-md)] border border-[var(--border)] text-sm font-semibold" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">대상 회사</label>
                  <select data-testid="inventory-stock-company-select" value={stockModal.targetCompany} onChange={e => setStockModal({ ...stockModal, targetCompany: e.target.value })} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-xs font-bold">
                    <option value="전체">미지정</option>
                    {companiesInInventory.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">대상 부서</label>
                  <select data-testid="inventory-stock-dept-select" value={stockModal.targetDept} onChange={e => setStockModal({ ...stockModal, targetDept: e.target.value })} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-xs font-bold">
                    <option value="전체">미지정</option>
                    {departmentsByStockCompany.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[9px] text-[var(--toss-gray-3)] leading-relaxed">* 대상 회사/부서를 지정하면 입출고 이력(처리자 목록)에 귀속 대상이 함께 기록됩니다.</p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStockModal(null)} className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
              <button onClick={executeStockUpdate} className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-semibold text-sm">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

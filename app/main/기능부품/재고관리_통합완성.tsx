'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { withMissingColumnFallback } from '@/lib/supabase-compat';
import UDIManagement from './재고관리서브/UDI관리';
import InvoiceManagement from './재고관리서브/명세서관리';
import PurchaseOrderManagement from './재고관리서브/발주관리';
import ScanModule from './재고관리서브/스캔모듈완성';
import ProductRegistration from './재고관리서브/물품등록';
import ExcelBulkUpload from './관리자전용서브/엑셀일괄등록';
import InvoiceAutoExtraction from './관리자전용서브/명세서자동추출';
import { useInventoryAlertSystem, InventoryAlertBadge } from './재고관리서브/재고알림시스템';
import QRAssetManager from './재고관리서브/자산QR관리';
import ASReturnManagement from './재고관리서브/AS반품관리';
import SupplierManagement from './재고관리서브/거래처관리';
import InventoryCount from './재고관리서브/재고실사';
import ExpirationAlert from './재고관리서브/유효기간알림';
import InventoryTransfer from './재고관리서브/재고이관';
import CategoryManager from './재고관리서브/카테고리관리';
import ConsumableStats from './재고관리서브/소모품통계';
import DeliveryConfirmation from './재고관리서브/납품확인서';
import InventoryDemandForecast from './재고관리서브/재고수요예측';

const INV_VIEW_KEY = 'erp_inventory_view';

const VALID_VIEWS = ['UDI', '명세서', '발주', '스캔', '등록', '현황', '이력', '자산', 'AS반품', '거래처', '재고실사', '유통기한', '이관', '카테고리', '소모품통계', '납품확인서', '수요예측'];
const EXPIRY_SOON_MS = 30 * 24 * 60 * 60 * 1000;

const INVENTORY_WORK_SECTIONS = [
  { id: '조회', label: '조회', description: '재고 상태와 변동을 확인합니다.', views: ['현황', '이력', '유통기한', '수요예측'] },
  { id: '입출고', label: '입출고', description: '현장에서 바로 처리하는 작업들입니다.', views: ['등록', '스캔', '재고실사', '이관'] },
  { id: '발주문서', label: '발주 · 문서', description: '발주와 문서 처리 흐름을 모았습니다.', views: ['발주', '명세서', '납품확인서', 'UDI'] },
  { id: '설정', label: '설정', description: '기준정보와 부가 관리를 정리합니다.', views: ['거래처', '카테고리', '자산', 'AS반품', '소모품통계'] },
] as const;

type InventorySectionId = typeof INVENTORY_WORK_SECTIONS[number]['id'];

const INVENTORY_VIEW_META: Record<string, { title: string; description: string }> = {
  현황: { title: '재고 현황', description: '회사별 재고를 한 화면에서 보고 바로 입고·출고·발주까지 처리합니다.' },
  이력: { title: '입출고 이력', description: '최근 입고·출고 변동과 처리자를 시간순으로 확인합니다.' },
  등록: { title: '품목 등록', description: '신규 품목 등록, 엑셀 일괄 등록, AI 명세서 추출을 한곳에서 처리합니다.' },
  발주: { title: '발주 관리', description: '재고 부족 품목을 발주로 연결하고 발주 상태를 관리합니다.' },
  스캔: { title: '스캔 처리', description: '바코드와 스캔 기반으로 입출고 작업을 빠르게 처리합니다.' },
  유통기한: { title: '유통기한 알림', description: '유효기간 임박 품목을 모아 선제적으로 대응합니다.' },
  수요예측: { title: '수요 예측', description: '소모 흐름을 기반으로 향후 재고 수요를 예측합니다.' },
  명세서: { title: '명세서 관리', description: '입고 관련 명세서를 관리하고 재고와 연결합니다.' },
  납품확인서: { title: '납품 확인서', description: '납품 확인서 발행과 이력을 관리합니다.' },
  UDI: { title: 'UDI 관리', description: 'UDI 대상 품목을 추적하고 식별 정보를 관리합니다.' },
  자산: { title: '자산 QR', description: '비품과 자산의 QR 태그를 관리합니다.' },
  거래처: { title: '거래처 관리', description: '공급사와 거래처 기본 정보를 정리합니다.' },
  카테고리: { title: '카테고리 관리', description: '재고 분류 체계를 정리해 검색과 집계를 쉽게 만듭니다.' },
  AS반품: { title: 'AS / 반품', description: 'AS와 반품 접수 내역을 관리합니다.' },
  소모품통계: { title: '소모품 통계', description: '소모품 사용량과 흐름을 통계로 확인합니다.' },
  재고실사: { title: '재고 실사', description: '실물 재고와 시스템 재고를 비교 점검합니다.' },
  이관: { title: '재고 이관', description: '회사·부서 간 재고 이동을 기록하고 관리합니다.' },
};

const INVENTORY_VIEW_ICONS: Record<string, string> = {
  현황: '📊',
  이력: '🕘',
  유통기한: '⏰',
  수요예측: '🔮',
  등록: '📝',
  스캔: '📷',
  발주: '📦',
  재고실사: '🔎',
  이관: '🔄',
  명세서: '🧾',
  납품확인서: '📋',
  UDI: '🏷️',
  자산: '🔖',
  거래처: '🏭',
  카테고리: '🗂️',
  AS반품: '↩️',
  소모품통계: '📉',
};

function getItemQuantity(item: any) {
  return Number(item?.quantity ?? item?.stock ?? 0);
}

function getItemMinQuantity(item: any) {
  return Number(item?.min_quantity ?? item?.min_stock ?? 0);
}

function isExpirySoon(item: any, threshold: number) {
  return Boolean(item?.expiry_date) && new Date(item.expiry_date).getTime() < threshold;
}

function formatCurrency(value: number) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`;
}

function getInventorySectionId(view: string): InventorySectionId {
  return INVENTORY_WORK_SECTIONS.find((section) => (section.views as readonly string[]).includes(view))?.id || '조회';
}

export default function IntegratedInventoryManagement({
  user,
  depts = [],
  selectedCo,
  selectedCompanyId,
  onRefresh,
  initialView,
  onViewChange,
}: any) {
  const [activeView, setActiveView] = useState(initialView && (VALID_VIEWS as readonly string[]).includes(initialView) ? initialView : '현황');
  const [activeSectionId, setActiveSectionId] = useState<InventorySectionId>(
    getInventorySectionId(initialView && (VALID_VIEWS as readonly string[]).includes(initialView) ? initialView : '현황'),
  );
  const [viewCompany, setViewCompany] = useState<string>('전체'); // 현황 탭용 회사 선택
  const [selectedDept, setSelectedDept] = useState('전체');
  const [inventory, setInventory] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'전체' | '재고부족' | '유통기한임박' | '정상'>('전체');
  const [stockModal, setStockModal] = useState<{ item: any; type: 'in' | 'out'; targetCompany: string; targetDept: string } | null>(null);
  const [stockAmount, setStockAmount] = useState(1);
  const [logs, setLogs] = useState<any[]>([]);
  const [registrationMode, setRegistrationMode] = useState<'form' | 'excel' | 'auto_extract'>('form');

  const { lowStockItems, expiryImminentItems } = useInventoryAlertSystem(inventory, user);

  const fetchLogs = useCallback(async () => {
    try {
      const { data } = await supabase.from('inventory_logs').select('*').order('created_at', { ascending: false }).limit(100);
      setLogs(data || []);
    } catch (_) { }
  }, []);

  // 현황 탭: 회사별 부서 선택용 목록
  const companiesInInventory = useMemo(() =>
    Array.from(new Set(inventory.map((i: any) => (i.company || '').trim()).filter(Boolean))).sort(),
    [inventory]
  );
  const getDepartmentsForCompany = useCallback((companyName: string) => {
    if (!companyName || companyName === '전체') return [];
    const inventoryDepartments = inventory
      .filter((i: any) => (i.company || '').trim() === companyName)
      .map((i: any) => (i.department || '').trim())
      .filter(Boolean);
    const configuredDepartments = Array.isArray(depts)
      ? depts
          .map((dept: any) => (typeof dept === 'string' ? dept : dept?.name || ''))
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
      list = list.filter((i: any) => (i.company || '').trim() === viewCompany);
    }
    if (searchKeyword.trim()) {
      const k = searchKeyword.toLowerCase();
      list = list.filter((i: any) =>
        (i.item_name || '').toLowerCase().includes(k) ||
        (i.name || '').toLowerCase().includes(k) ||
        (i.category || '').toLowerCase().includes(k) ||
        (i.lot_number || '').toLowerCase().includes(k) ||
        (i.company || '').toLowerCase().includes(k)
      );
    }
    if (selectedDept && selectedDept !== '전체') {
      list = list.filter((i: any) => (i.department || '').trim() === selectedDept);
    }
    return list;
  }, [inventory, searchKeyword, selectedDept, activeView, viewCompany]);

  const filteredInventory = useMemo(() => {
    if (statusFilter === '전체') return baseFilteredInventory;

    return baseFilteredInventory.filter((item: any) => {
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
    () => baseFilteredInventory.filter((item: any) => getItemQuantity(item) <= getItemMinQuantity(item)),
    [baseFilteredInventory],
  );

  const expiryFilteredItems = useMemo(
    () => baseFilteredInventory.filter((item: any) => isExpirySoon(item, expiryThreshold)),
    [baseFilteredInventory, expiryThreshold],
  );

  const urgentActionItems = useMemo(() => {
    return baseFilteredInventory
      .filter((item: any) => getItemQuantity(item) <= getItemMinQuantity(item) || isExpirySoon(item, expiryThreshold))
      .sort((a: any, b: any) => {
        const aLow = getItemQuantity(a) <= getItemMinQuantity(a);
        const bLow = getItemQuantity(b) <= getItemMinQuantity(b);
        if (aLow !== bLow) return aLow ? -1 : 1;
        return getItemQuantity(a) - getItemQuantity(b);
      })
      .slice(0, 6);
  }, [baseFilteredInventory, expiryThreshold]);

  const totalQuantity = useMemo(
    () => filteredInventory.reduce((sum: number, item: any) => sum + getItemQuantity(item), 0),
    [filteredInventory],
  );

  const totalInventoryValue = useMemo(
    () => filteredInventory.reduce((sum: number, item: any) => sum + (Number(item.unit_price || 0) * getItemQuantity(item)), 0),
    [filteredInventory],
  );

  const outOfStockItems = useMemo(
    () => baseFilteredInventory.filter((item: any) => getItemQuantity(item) === 0),
    [baseFilteredInventory],
  );

  const inventoryNameById = useMemo(
    () => new Map(inventory.map((item: any) => [String(item.id), item.item_name || item.name || '품목'])),
    [inventory],
  );

  const todayLogCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return logs.filter((log: any) => String(log.created_at || '').slice(0, 10) === today).length;
  }, [logs]);

  const recentLogPreview = useMemo(
    () =>
      logs.slice(0, 5).map((log: any) => ({
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
    description: '재고관리 화면을 확인합니다.',
  };

  const currentScopeLabel = useMemo(() => {
    if (activeView !== '현황') {
      return selectedCo && selectedCo !== '전체' ? selectedCo : '전체 사업체';
    }

    const companyLabel = viewCompany === '전체' ? '전체 회사' : viewCompany;
    return selectedDept !== '전체' ? `${companyLabel} · ${selectedDept}` : companyLabel;
  }, [activeView, selectedDept, selectedCo, viewCompany]);

  const getViewBadgeCount = useCallback((view: string) => {
    if (view === '현황') return filteredInventory.length;
    if (view === '이력') return logs.length;
    if (view === '유통기한') return expiryFilteredItems.length;
    if (view === '발주') return lowStockFilteredItems.length;
    if (view === '거래처') return suppliers.length;
    return null;
  }, [expiryFilteredItems.length, filteredInventory.length, logs.length, lowStockFilteredItems.length, suppliers.length]);

  const activeSection =
    INVENTORY_WORK_SECTIONS.find((section) => section.id === activeSectionId) || INVENTORY_WORK_SECTIONS[0];

  const fetchInventory = useCallback(async (companyFilter?: string) => {
    setLoading(true);
    try {
      let query = supabase.from('inventory').select('*').order('item_name', { ascending: true });
      const isMso = user?.company === 'SY INC.' || user?.permissions?.mso === true;
      const effectiveCo = companyFilter !== undefined ? companyFilter : selectedCo;
      const scopedCompanyId =
        effectiveCo && effectiveCo !== '전체'
          ? (isMso ? selectedCompanyId : user?.company_id)
          : null;
      if (scopedCompanyId) query = query.eq('company_id', scopedCompanyId);
      if (effectiveCo && effectiveCo !== '전체') query = query.eq('company', effectiveCo);
      const { data, error } = await withMissingColumnFallback(
        async () => query,
        async () => {
          let legacyQuery = supabase.from('inventory').select('*').order('item_name', { ascending: true });
          if (effectiveCo && effectiveCo !== '전체') legacyQuery = legacyQuery.eq('company', effectiveCo);
          return legacyQuery;
        }
      );
      if (error) throw error;
      if (data) setInventory(data);
    } catch (err) {
      console.error("재고 데이터 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCo, selectedCompanyId, user?.company, user?.company_id, user?.permissions?.mso]);

  const fetchSuppliers = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('suppliers').select('*');
      if (error) throw error;
      if (data) setSuppliers(data);
    } catch (err) {
      console.error("거래처 데이터 로드 실패:", err);
    }
  }, []);

  // 로컬스토리지 복구 또는 initialView 반영
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (initialView && (VALID_VIEWS as readonly string[]).includes(initialView)) {
      setActiveView(initialView);
      try { window.localStorage.setItem(INV_VIEW_KEY, initialView); } catch { /* ignore */ }
      return;
    }
    try {
      const saved = window.localStorage.getItem(INV_VIEW_KEY);
      if (saved && (VALID_VIEWS as readonly string[]).includes(saved)) setActiveView(saved);
    } catch { /* ignore */ }
  }, [initialView]);

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
    setActiveSectionId(getInventorySectionId(activeView));
  }, [activeView]);

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
      setActiveView(view);
      setActiveSectionId(getInventorySectionId(view));
      if (view === '등록' && nextRegistrationMode) {
        setRegistrationMode(nextRegistrationMode);
      }
    },
    [],
  );

  const handleSectionChange = useCallback((sectionId: InventorySectionId) => {
    setActiveSectionId(sectionId);
    const nextSection = INVENTORY_WORK_SECTIONS.find((section) => section.id === sectionId);
    if (nextSection && !(nextSection.views as readonly string[]).includes(activeView)) {
      setActiveView(nextSection.views[0]);
    }
  }, [activeView]);

  const handleStockUpdate = async (item: any, type: 'in' | 'out', amount: number, targetCompany: string, targetDept: string) => {
    if (amount <= 0) return alert("수량은 0보다 커야 합니다.");
    const currentQty = item.quantity ?? item.stock ?? 0;
    const newStock = type === 'in' ? currentQty + amount : currentQty - amount;
    if (type === 'out' && newStock < 0) return alert("재고가 부족하여 출고할 수 없습니다.");
    try {
      // 해당 물품의 귀속 회사/부서를 완전히 변경하는 것이 아니라면 inventory 테이블의 소속 구조는 유지하고 로그에만 사유를 기록
      const { error } = await supabase.from('inventory').update({ quantity: newStock, stock: newStock }).eq('id', item.id);
      if (!error) {
        const logRows: any[] = [{
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
            const legacyRows = logRows.map(({ company_id, ...rest }: any) => rest);
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

  const handleAutoApprovalRequest = async (item: any) => {
    const quantity = getItemQuantity(item);
    const minQuantity = getItemMinQuantity(item);
    const itemName = item.item_name || item.name || '품목';
    if (!confirm(`[안전재고 부족] ${itemName} 품목의 비품구매 신청서를 자동으로 작성하여 MSO 결재 상신을 진행하시겠습니까?`)) return;
    try {
      const rows: any[] = [{
        sender_id: user.id,
        sender_name: user.name,
        sender_company: user.company,
        type: '비품구매',
        title: `[자동기안] ${itemName} 재고 보충 요청 (${item.company})`,
        content: `현재고(${quantity})가 안전재고(${minQuantity}) 이하로 떨어져 자동 기안되었습니다. \n보충 필요량: ${Math.max(minQuantity * 2 - quantity, 1)}개`,
        status: '대기',
        meta_data: { item_name: itemName, quantity: Math.max(minQuantity * 2 - quantity, 1), current_stock: quantity, is_auto_generated: true }
      }];
      if (item.company_id || user?.company_id || selectedCompanyId) {
        rows[0].company_id = item.company_id ?? (user?.company === 'SY INC.' ? selectedCompanyId : user?.company_id);
      }
      const { error } = await withMissingColumnFallback(
        () => supabase.from('approvals').insert(rows),
        () => {
          const legacyRows = rows.map(({ company_id, ...rest }: any) => rest);
          return supabase.from('approvals').insert(legacyRows);
        }
      );
      if (!error) alert("비품구매 신청서가 MSO 관리자에게 성공적으로 상신되었습니다.");
    } catch (err) {
      console.error('결재 상신 실패:', err);
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
      className="flex flex-col h-full min-h-0 app-page overflow-hidden relative"
      data-testid="inventory-view"
    >
      <InventoryAlertBadge lowCount={lowStockItems.length} expiryCount={expiryImminentItems.length} />
      {/* 상세 메뉴(UDI·명세서 등)는 메인 좌측 사이드바에서 재고관리 호버/클릭 시 플라이아웃으로 선택 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 p-4 md:p-10 bg-[var(--page-bg)] overflow-y-auto custom-scrollbar">
          <section className="mb-6 space-y-4 md:mb-8">
            <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm md:p-8">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--toss-gray-3)]">Inventory Workspace</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--foreground)] md:text-3xl">{currentViewMeta.title}</h2>
                  <p className="mt-2 text-sm text-[var(--toss-gray-3)]">{currentViewMeta.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--toss-blue)]">
                      현재 범위: {currentScopeLabel}
                    </span>
                    <span className="rounded-full bg-[var(--toss-gray-1)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)]">
                      알림: 부족 {lowStockItems.length}건 · 임박 {expiryImminentItems.length}건
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
                  <button
                    type="button"
                    onClick={() => openInventoryView('현황')}
                    className={`rounded-[14px] px-4 py-3 text-[11px] font-bold transition-all ${
                      activeView === '현황'
                        ? 'bg-[var(--foreground)] text-white shadow-sm'
                        : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] hover:bg-[var(--toss-blue-light)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    재고 현황
                  </button>
                  <button
                    type="button"
                    onClick={() => openInventoryView('등록', 'form')}
                    className="rounded-[14px] bg-[var(--toss-blue)] px-4 py-3 text-[11px] font-bold text-white shadow-sm transition-all hover:opacity-95"
                  >
                    품목 등록
                  </button>
                  <button
                    type="button"
                    onClick={() => openInventoryView('발주')}
                    className="rounded-[14px] bg-orange-500 px-4 py-3 text-[11px] font-bold text-white shadow-sm transition-all hover:opacity-95"
                  >
                    발주 관리
                  </button>
                  <button
                    type="button"
                    onClick={() => openInventoryView('이력')}
                    className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-[11px] font-bold text-[var(--foreground)] transition-all hover:bg-[var(--toss-gray-1)]"
                  >
                    입출고 이력
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <button
                  type="button"
                  onClick={() => {
                    openInventoryView('현황');
                    setStatusFilter('재고부족');
                  }}
                  className="rounded-[18px] border border-red-100 bg-red-50 px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <p className="text-[11px] font-bold text-red-500">오늘 할 일</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-red-700">부족 재고 확인</p>
                      <p className="mt-1 text-[11px] font-semibold text-red-500">안전재고 미달 품목만 바로 봅니다.</p>
                    </div>
                    <span className="text-2xl font-black text-red-600">{lowStockFilteredItems.length}</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    openInventoryView('현황');
                    setStatusFilter('유통기한임박');
                  }}
                  className="rounded-[18px] border border-orange-100 bg-orange-50 px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <p className="text-[11px] font-bold text-orange-500">선제 점검</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-orange-700">기한 임박 점검</p>
                      <p className="mt-1 text-[11px] font-semibold text-orange-500">유효기간 임박 품목을 한 번에 확인합니다.</p>
                    </div>
                    <span className="text-2xl font-black text-orange-600">{expiryFilteredItems.length}</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => openInventoryView('이력')}
                  className="rounded-[18px] border border-[var(--toss-border)] bg-[var(--page-bg)] px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">작업 추적</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-[var(--foreground)]">오늘 변동 이력</p>
                      <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">오늘 처리된 입출고 흐름을 바로 확인합니다.</p>
                    </div>
                    <span className="text-2xl font-black text-[var(--foreground)]">{todayLogCount}</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => openInventoryView('등록', 'form')}
                  className="rounded-[18px] border border-[var(--toss-blue)]/20 bg-[var(--toss-blue-light)] px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <p className="text-[11px] font-bold text-[var(--toss-blue)]">업무 시작</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-[var(--foreground)]">신규 품목 등록</p>
                      <p className="mt-1 text-[11px] font-semibold text-[var(--toss-blue)]">새 물품을 바로 등록하거나 엑셀 등록으로 이동합니다.</p>
                    </div>
                    <span className="text-2xl font-black text-[var(--toss-blue)]">+</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-4 shadow-sm">
              <div className="space-y-4">
                {INVENTORY_WORK_SECTIONS.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">{group.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.views.map((view) => (
                        <button
                          key={view}
                          type="button"
                          onClick={() => openInventoryView(view)}
                          className={`rounded-full px-4 py-2 text-[11px] font-bold transition-all ${
                            activeView === view
                              ? 'bg-[var(--toss-blue)] text-white shadow-sm'
                              : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] hover:bg-[var(--toss-blue-light)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          <span className="mr-1.5">{INVENTORY_VIEW_ICONS[view] || '•'}</span>
                          {view}
                          {getViewBadgeCount(view) !== null && (
                            <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                              activeView === view
                                ? 'bg-white/20 text-white'
                                : 'bg-white text-[var(--foreground)]'
                            }`}>
                              {getViewBadgeCount(view)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {activeView === '현황' && (
            loading ? (
              <div className="h-full flex items-center justify-center font-bold text-[var(--toss-gray-3)]">데이터 동기화 중...</div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="flex-1 flex flex-wrap items-center gap-2">
                      <select
                        value={viewCompany}
                        onChange={(e) => setViewCompany(e.target.value)}
                        className="px-3 py-3 rounded-[12px] border border-[var(--toss-border)] bg-white text-sm font-bold min-w-[140px]"
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
                        className="px-3 py-3 rounded-[12px] border border-[var(--toss-border)] bg-white text-sm font-bold min-w-[120px]"
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
                        className="flex-1 min-w-[160px] max-w-md px-4 py-3 rounded-[12px] border border-[var(--toss-border)] bg-white text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/20 focus:border-[var(--toss-blue)] outline-none"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['전체', '재고부족', '유통기한임박', '정상'] as const).map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setStatusFilter(filter)}
                          className={`rounded-full px-3 py-2 text-[11px] font-bold transition-all ${
                            statusFilter === filter
                              ? 'bg-[var(--foreground)] text-white shadow-sm'
                              : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] hover:bg-[var(--toss-blue-light)] hover:text-[var(--foreground)]'
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
                        }}
                        className="px-4 py-3 rounded-[12px] border border-[var(--toss-border)] bg-white text-[11px] font-bold text-[var(--foreground)] transition-all hover:bg-[var(--toss-gray-1)]"
                      >
                        초기화
                      </button>
                      <button
                        onClick={() => void refreshCurrentInventory()}
                        className="px-4 py-3 rounded-[12px] bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] text-xs font-semibold hover:bg-[var(--toss-border)] transition-all shrink-0"
                      >
                        새로고침
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--toss-border)] pt-4">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">현재 필터</span>
                    <span className="rounded-full bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--toss-blue)]">
                      회사 {viewCompany === '전체' ? '전체' : viewCompany}
                    </span>
                    <span className="rounded-full bg-[var(--toss-gray-1)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)]">
                      부서 {selectedDept === '전체' ? '전체' : selectedDept}
                    </span>
                    <span className="rounded-full bg-[var(--toss-gray-1)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)]">
                      상태 {statusFilter === '유통기한임박' ? '유통기한 임박' : statusFilter}
                    </span>
                    {searchKeyword.trim() && (
                      <span className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1 text-[11px] font-bold text-[var(--foreground)]">
                        검색어 {searchKeyword.trim()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="bg-[var(--toss-card)] p-6 rounded-[16px] border border-[var(--toss-border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">조회 품목</p>
                    <p className="text-2xl font-semibold text-[var(--toss-blue)] mt-1">{filteredInventory.length}</p>
                  </div>
                  <div className="bg-[var(--toss-card)] p-6 rounded-[16px] border border-[var(--toss-border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">안전재고 미달</p>
                    <p className="text-2xl font-semibold text-red-600 mt-1">{lowStockFilteredItems.length}</p>
                  </div>
                  <div className="bg-[var(--toss-card)] p-6 rounded-[16px] border border-[var(--toss-border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">유효기간 임박</p>
                    <p className="text-2xl font-semibold text-orange-600 mt-1">{expiryFilteredItems.length}</p>
                  </div>
                  <div className="bg-[var(--toss-card)] p-6 rounded-[16px] border border-[var(--toss-border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">총 재고 수량</p>
                    <p className="text-2xl font-semibold text-[var(--foreground)] mt-1">{totalQuantity.toLocaleString('ko-KR')}</p>
                  </div>
                  <div className="bg-[var(--toss-card)] p-6 rounded-[16px] border border-[var(--toss-border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">재고 평가 금액</p>
                    <p className="text-sm font-semibold text-[var(--foreground)] mt-2 break-keep">{formatCurrency(totalInventoryValue)}</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('재고부족')}
                    className="rounded-[18px] border border-red-100 bg-red-50 px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                  >
                    <p className="text-[11px] font-bold text-red-500">우선 처리</p>
                    <p className="mt-2 text-base font-bold text-red-700">부족 재고만 보기</p>
                    <p className="mt-1 text-[11px] text-red-500">지금 보충이 필요한 품목 {lowStockFilteredItems.length}건</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('유통기한임박')}
                    className="rounded-[18px] border border-orange-100 bg-orange-50 px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                  >
                    <p className="text-[11px] font-bold text-orange-500">품질 점검</p>
                    <p className="mt-2 text-base font-bold text-orange-700">유통기한 임박만 보기</p>
                    <p className="mt-1 text-[11px] text-orange-500">빠른 확인이 필요한 품목 {expiryFilteredItems.length}건</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchKeyword('')}
                    className="rounded-[18px] border border-[var(--toss-border)] bg-[var(--page-bg)] px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                  >
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">현황 확인</p>
                    <p className="mt-2 text-base font-bold text-[var(--foreground)]">품절 품목 빠르게 파악</p>
                    <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">현재 범위에서 재고 0개 품목 {outOfStockItems.length}건</p>
                  </button>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-base font-bold text-[var(--foreground)]">우선 확인 품목</h3>
                        <p className="mt-1 text-xs text-[var(--toss-gray-3)]">재고부족과 유통기한 임박 품목을 먼저 확인하세요.</p>
                      </div>
                      <span className="rounded-full bg-red-50 px-3 py-1 text-[11px] font-bold text-red-600">
                        {urgentActionItems.length}건
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {urgentActionItems.length === 0 && (
                        <div className="col-span-full rounded-[16px] border border-dashed border-[var(--toss-border)] px-4 py-8 text-center text-sm text-[var(--toss-gray-3)]">
                          긴급 조치가 필요한 품목이 없습니다.
                        </div>
                      )}

                      {urgentActionItems.map((item) => {
                        const quantity = getItemQuantity(item);
                        const minQuantity = getItemMinQuantity(item);
                        const expiryImminent = isExpirySoon(item, expiryThreshold);

                        return (
                          <article key={item.id} className="rounded-[16px] border border-[var(--toss-border)] bg-[var(--page-bg)] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-[var(--foreground)]">{item.item_name || item.name}</p>
                                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{item.company || '-'} · {item.department || '부서 미지정'}</p>
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                quantity <= minQuantity ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                              }`}>
                                {quantity <= minQuantity ? '재고부족' : '기한임박'}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-[var(--toss-gray-4)]">
                              <span>현재고 {quantity}</span>
                              <span>안전 {minQuantity}</span>
                              {expiryImminent && <span>기한 {item.expiry_date}</span>}
                            </div>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setStockModal({ item, type: 'in', targetCompany: item.company || '전체', targetDept: item.department || '전체' });
                                  setStockAmount(Math.max(1, minQuantity - quantity + 1));
                                }}
                                className="flex-1 rounded-[12px] bg-[var(--toss-blue)] px-3 py-2 text-[11px] font-bold text-white"
                              >
                                입고
                              </button>
                              {quantity <= minQuantity && (
                                <button
                                  type="button"
                                  onClick={() => handleAutoApprovalRequest(item)}
                                  className="flex-1 rounded-[12px] bg-orange-600 px-3 py-2 text-[11px] font-bold text-white"
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

                  <aside className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
                    <h3 className="text-base font-bold text-[var(--foreground)]">빠른 작업</h3>
                    <p className="mt-1 text-xs text-[var(--toss-gray-3)]">자주 쓰는 기능으로 바로 이동합니다.</p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => openInventoryView('등록', 'form')} className="rounded-[14px] bg-[var(--toss-gray-1)] px-3 py-3 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--toss-blue-light)]">일반 등록</button>
                      <button type="button" onClick={() => openInventoryView('등록', 'excel')} className="rounded-[14px] bg-[var(--toss-gray-1)] px-3 py-3 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--toss-blue-light)]">엑셀 등록</button>
                      <button type="button" onClick={() => openInventoryView('스캔')} className="rounded-[14px] bg-[var(--toss-gray-1)] px-3 py-3 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--toss-blue-light)]">스캔 처리</button>
                      <button type="button" onClick={() => openInventoryView('발주')} className="rounded-[14px] bg-[var(--toss-gray-1)] px-3 py-3 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--toss-blue-light)]">발주 관리</button>
                      <button type="button" onClick={() => openInventoryView('재고실사')} className="rounded-[14px] bg-[var(--toss-gray-1)] px-3 py-3 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--toss-blue-light)]">재고 실사</button>
                      <button type="button" onClick={() => openInventoryView('이력')} className="rounded-[14px] bg-[var(--toss-gray-1)] px-3 py-3 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--toss-blue-light)]">입출고 이력</button>
                    </div>
                  </aside>
                </div>

                <div className="bg-[var(--toss-card)] rounded-[16px] md:rounded-[2.5rem] border border-[var(--toss-border)] shadow-xl overflow-hidden">
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                      <thead>
                        <tr className="bg-[var(--toss-gray-1)]/50 border-b border-[var(--toss-border)]">
                          <th className="px-6 py-4 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">회사/분류</th>
                          <th className="px-6 py-4 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">품목명/LOT</th>
                          <th className="px-6 py-4 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-center">현재고</th>
                          <th className="px-6 py-4 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-center">단가</th>
                          <th className="px-6 py-4 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-center">유효기간</th>
                          <th className="px-6 py-4 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">상태</th>
                          <th className="px-6 py-4 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-right">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--toss-border)]">
                        {filteredInventory.map(item => {
                          const quantity = getItemQuantity(item);
                          const minQuantity = getItemMinQuantity(item);
                          const isExpiryImminent = isExpirySoon(item, expiryThreshold);
                          return (
                            <tr key={item.id} className="hover:bg-[var(--toss-blue-light)]/50 transition-all group">
                              <td className="px-6 py-4">
                                <p className="text-[11px] font-semibold text-[var(--toss-blue)]">{item.company || '-'}</p>
                                <p className="text-[8px] font-bold text-[var(--toss-gray-3)]">{item.category || '미분류'}</p>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-xs font-semibold text-[var(--foreground)] group-hover:text-[var(--toss-blue)] transition-colors">{item.item_name || item.name}</p>
                                <div className="flex gap-1 mt-0.5">
                                  {item.lot_number && <span className="text-[7px] font-semibold bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] px-1 py-0.5 rounded">LOT: {item.lot_number}</span>}
                                  {item.is_udi && <span className="text-[7px] font-semibold bg-purple-50 text-purple-500 px-1 py-0.5 rounded uppercase">UDI</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`text-xs font-semibold ${quantity <= minQuantity ? 'text-red-600' : 'text-[var(--foreground)]'}`}>{quantity}</span>
                                <p className="text-[8px] font-bold text-[var(--toss-gray-3)]">안전: {minQuantity}</p>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <p className="text-xs font-semibold text-[var(--toss-gray-4)]">{formatCurrency(Number(item.unit_price || 0))}</p>
                                <p className="text-[8px] font-bold text-[var(--toss-gray-3)]">총액: {formatCurrency((Number(item.unit_price || 0) * quantity))}</p>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <p className={`text-[11px] font-semibold ${isExpiryImminent ? 'text-orange-600' : 'text-[var(--toss-gray-3)]'}`}>
                                  {item.expiry_date || '-'}
                                </p>
                                {isExpiryImminent && <p className="text-[7px] font-semibold text-orange-400 animate-pulse">임박</p>}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-semibold ${quantity <= minQuantity ? 'bg-red-50 text-red-600' : isExpiryImminent ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'}`}>
                                  {quantity <= minQuantity ? '재고부족' : isExpiryImminent ? '기한임박' : '정상'}
                                </span>
                              </td>
                              <td data-testid={`inventory-actions-${item.id}`} className="px-6 py-4 text-right space-x-1">
                                <button data-testid={`inventory-stock-in-${item.id}`} onClick={() => { setStockModal({ item, type: 'in', targetCompany: item.company || '전체', targetDept: item.department || '전체' }); setStockAmount(1); }} className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--toss-blue)] text-[11px] font-semibold rounded-md hover:bg-[var(--toss-blue-light)]">입고</button>
                                <button data-testid={`inventory-stock-out-${item.id}`} onClick={() => { setStockModal({ item, type: 'out', targetCompany: item.company || '전체', targetDept: item.department || '전체' }); setStockAmount(1); }} className="px-2 py-1 bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] text-[11px] font-semibold rounded-md hover:bg-[var(--toss-gray-1)]/80">출고</button>
                                {quantity <= minQuantity && (
                                  <button data-testid={`inventory-reorder-${item.id}`} onClick={() => handleAutoApprovalRequest(item)} className="px-2 py-1 bg-orange-600 text-white text-[11px] font-semibold rounded-md shadow-sm">발주</button>
                                )}
                                <button
                                  data-testid={`inventory-delete-${item.id}`}
                                  onClick={async () => {
                                    if (confirm(`[${item.item_name}] 품목을 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
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
              </div>
            )
          )}
          {activeView === '이력' && (
            <section className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] shadow-sm">
              <div className="flex flex-col gap-3 border-b border-[var(--toss-border)] px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">최근 입출고 이력</h3>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">최근 100건의 재고 변동 내역을 시간순으로 보여줍니다.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchLogs()}
                  className="rounded-[12px] bg-[var(--toss-gray-1)] px-4 py-3 text-[11px] font-bold text-[var(--toss-gray-4)] transition-all hover:bg-[var(--toss-border)]"
                >
                  새로고침
                </button>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                {logs.length === 0 ? (
                  <div className="px-6 py-16 text-center text-sm font-semibold text-[var(--toss-gray-3)]">이력이 없습니다.</div>
                ) : (
                  <table className="min-w-[860px] w-full text-left text-xs">
                    <thead className="bg-[var(--toss-gray-1)]/50 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">
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
                      {logs.map((log: any) => (
                        <tr key={log.id} className="border-t border-[var(--toss-border)]">
                          <td className="px-4 py-3 font-mono text-[11px] text-[var(--toss-gray-4)]">{new Date(log.created_at).toLocaleString('ko-KR')}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                              (log.change_type || log.type) === '입고'
                                ? 'bg-[var(--toss-blue-light)] text-[var(--toss-blue)]'
                                : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'
                            }`}>
                              {log.change_type || log.type || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-[var(--foreground)]">{log.quantity ?? '-'}</td>
                          <td className="px-4 py-3 text-[var(--toss-gray-3)]">
                            {(log.prev_quantity ?? '') !== '' ? `${log.prev_quantity} → ${log.next_quantity}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-[var(--foreground)]">{log.actor_name || '-'}</td>
                          <td className="px-4 py-3 text-[var(--toss-gray-4)]">{log.company || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}
          {activeView === 'UDI' && <UDIManagement user={user} inventory={inventory} fetchInventory={fetchInventory} />}
          {activeView === '명세서' && <InvoiceManagement user={user} inventory={inventory} suppliers={suppliers} fetchSuppliers={fetchSuppliers} />}
          {activeView === '발주' && <PurchaseOrderManagement user={user} inventory={inventory} suppliers={suppliers} fetchInventory={fetchInventory} />}
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
                  className={`flex-1 px-4 py-3 rounded-[12px] text-[11px] font-semibold transition-all ${registrationMode === 'form'
                    ? 'bg-[var(--toss-blue)] text-white shadow-sm'
                    : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'
                    }`}
                >
                  ✏️ 일반 등록
                </button>
                <button
                  type="button"
                  onClick={() => setRegistrationMode('excel')}
                  className={`flex-1 px-4 py-3 rounded-[12px] text-[11px] font-semibold transition-all ${registrationMode === 'excel'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'
                    }`}
                >
                  📊 엑셀 일괄 등록
                </button>
                <button
                  type="button"
                  onClick={() => setRegistrationMode('auto_extract')}
                  className={`flex-1 px-4 py-3 rounded-[12px] text-[11px] font-semibold transition-all ${registrationMode === 'auto_extract'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'
                    }`}
                >
                  📄 명세서 자동추출 (AI)
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
          {activeView === '거래처' && <SupplierManagement user={user} />}
          {activeView === '재고실사' && <InventoryCount user={user} inventory={inventory} fetchInventory={() => fetchInventory(selectedCo)} />}
          {activeView === '유통기한' && <ExpirationAlert />}
          {activeView === '이관' && <InventoryTransfer user={user} inventory={inventory} fetchInventory={() => fetchInventory(selectedCo)} />}
          {activeView === '카테고리' && <CategoryManager user={user} />}
          {activeView === '소모품통계' && <ConsumableStats user={user} selectedCo={selectedCo} />}
          {activeView === '납품확인서' && <DeliveryConfirmation user={user} selectedCo={selectedCo} />}
          {activeView === '수요예측' && <InventoryDemandForecast user={user} inventory={inventory} selectedCo={selectedCo} />}
        </main>
      </div>

      {/* 입출고 수량 입력 모달 */}
      {stockModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={() => setStockModal(null)}>
          <div data-testid="inventory-stock-modal" className="bg-[var(--toss-card)] rounded-[16px] shadow-2xl p-8 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">{stockModal.type === 'in' ? '입고' : '출고'} 상세 입력</h3>
            <p className="text-xs font-bold text-[var(--toss-gray-3)] mb-2">{stockModal.item.item_name || stockModal.item.name}</p>
            <p className="text-[11px] text-[var(--toss-gray-3)] mb-4">현재고: {stockModal.item.quantity ?? stockModal.item.stock ?? 0}</p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">수량 (개/단위)</label>
                <input data-testid="inventory-stock-amount-input" type="number" min={1} max={stockModal.type === 'out' ? (stockModal.item.quantity ?? stockModal.item.stock ?? 0) : 99999} value={stockAmount} onChange={e => setStockAmount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-3 rounded-[12px] border border-[var(--toss-border)] text-sm font-semibold" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">대상 회사</label>
                  <select data-testid="inventory-stock-company-select" value={stockModal.targetCompany} onChange={e => setStockModal({ ...stockModal, targetCompany: e.target.value })} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[12px] text-xs font-bold">
                    <option value="전체">미지정</option>
                    {companiesInInventory.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">대상 부서</label>
                  <select data-testid="inventory-stock-dept-select" value={stockModal.targetDept} onChange={e => setStockModal({ ...stockModal, targetDept: e.target.value })} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[12px] text-xs font-bold">
                    <option value="전체">미지정</option>
                    {departmentsByStockCompany.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[9px] text-[var(--toss-gray-3)] leading-relaxed">* 대상 회사/부서를 지정하면 입출고 이력(처리자 목록)에 귀속 대상이 함께 기록됩니다.</p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStockModal(null)} className="flex-1 py-3 rounded-[12px] bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
              <button onClick={executeStockUpdate} className="flex-1 py-3 rounded-[12px] bg-[var(--toss-blue)] text-white font-semibold text-sm">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { canAccessInventorySection } from '@/lib/access-control';
import { supabase } from '@/lib/supabase';
import { useInventoryAlertSystem, InventoryAlertBadge } from './재고관리서브/재고알림시스템';
import { useInventoryData } from '@/app/main/hooks/useInventoryData';
import { useInventoryFilters } from '@/app/main/hooks/useInventoryFilters';
import { useSupplyWorkflow } from '@/app/main/hooks/useSupplyWorkflow';
import { useStockModal } from '@/app/main/hooks/useStockModal';
import { INV_VIEW_KEY } from '@/app/main/navigation-state';
import { INVENTORY_SUPPORT_COMPANY, INVENTORY_SUPPORT_DEPARTMENT } from '@/app/main/inventory-utils';
import {
  INVENTORY_VIEWS, LEGACY_VIEWS, VALID_VIEWS, INVENTORY_VIEW_META,
  type IntegratedInventoryProps, type InventoryStatusFilter, type SupplierWorkspaceTab, type RegistrationMode,
} from './재고관리서브/types';

// ── 서브 컴포넌트 임포트 ──
import UDIManagement from './재고관리서브/UDI관리';
import PurchaseOrderManagement from './재고관리서브/발주관리';
import ScanModule from './재고관리서브/스캔모듈완성';
import ProductRegistration from './재고관리서브/물품등록';
import ExcelBulkUpload from './관리자전용서브/엑셀일괄등록';
import InvoiceAutoExtraction from './관리자전용서브/명세서자동추출';
import QRAssetManager from './재고관리서브/자산QR관리';
import ASReturnManagement from './재고관리서브/AS반품관리';
import InventoryCount from './재고관리서브/재고실사';
import InventoryTransfer from './재고관리서브/재고이관';
import CategoryManager from './재고관리서브/카테고리관리';
import ConsumableStats from './재고관리서브/소모품통계';
import DepartmentConsumption from './재고관리서브/부서소모기록';
import DeliveryConfirmation from './재고관리서브/납품확인서';
import InventoryDemandForecast from './재고관리서브/재고수요예측';
import SupplierDocumentWorkspace from './재고관리서브/SupplierDocumentWorkspace';
import AssetLoanSettingsAdminView from './관리자전용서브/비품대여물품설정';
import InventoryStatusView from './재고관리서브/재고현황뷰';

// ── 뷰 해석 (레거시 뷰 → 현재 뷰 매핑) ──
function resolveInventoryView(view?: string | null): {
  view: string;
  statusFilter?: InventoryStatusFilter;
  supplierTab?: SupplierWorkspaceTab;
  showExpiryCenter?: boolean;
} {
  if (view === '명세서') return { view: '거래처', supplierTab: 'documents' };
  if (view === '거래처') return { view: '거래처', supplierTab: 'suppliers' };
  if (view === '유통기한') return { view: '현황', statusFilter: '유통기한임박', showExpiryCenter: true };
  if (view && (INVENTORY_VIEWS as readonly string[]).includes(view)) return { view };
  return { view: '현황' };
}

export default function IntegratedInventoryManagement({
  user, staffs = [], depts = [], selectedCo, selectedCompanyId,
  onRefresh, initialView, onViewChange,
  initialWorkflowApprovalId, onConsumeInitialWorkflowApprovalId,
}: IntegratedInventoryProps) {
  // ── 권한 & 사용자 판별 ──
  const isMsoUser = user?.company === 'SY INC.' || user?.permissions?.mso === true;
  const isInventoryOpsUser =
    (String(user?.company || '').trim() === INVENTORY_SUPPORT_COMPANY &&
      String(user?.department || '').trim() === INVENTORY_SUPPORT_DEPARTMENT) ||
    user?.permissions?.mso === true;

  // ── 뷰 전환 ──
  const initialResolved = resolveInventoryView(initialView);
  const defaultView = INVENTORY_VIEWS.find((v) => canAccessInventorySection(user, v)) || '현황';
  const [activeView, setActiveView] = useState(
    canAccessInventorySection(user, initialResolved.view) ? initialResolved.view : defaultView,
  );
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('form');
  const [supplierWorkspaceTab, setSupplierWorkspaceTab] = useState<SupplierWorkspaceTab>(initialResolved.supplierTab ?? 'suppliers');
  const [showExpiryCenter, setShowExpiryCenter] = useState(Boolean(initialResolved.showExpiryCenter));

  const availableViews = useMemo(
    () => INVENTORY_VIEWS.filter((v) => canAccessInventorySection(user, v)), [user],
  );
  const fallbackView = availableViews[0] || null;

  // ── 데이터 훅 ──
  const data = useInventoryData({ isMsoUser, selectedCo, selectedCompanyId, userCompany: user?.company, userCompanyId: user?.company_id });
  const { lowStockItems, expiryImminentItems } = useInventoryAlertSystem(data.inventory, user);

  // ── 필터 훅 (applyResolvedView보다 먼저 호출해야 setStatusFilter를 사용 가능) ──
  const filters = useInventoryFilters({ inventory: data.inventory, logs: data.logs, depts, activeView });
  const { setStatusFilter } = filters;

  const applyResolvedView = useCallback((view?: string | null) => {
    const r = resolveInventoryView(view);
    setActiveView(r.view);
    setStatusFilter(r.statusFilter ?? '전체');
    setSupplierWorkspaceTab(r.supplierTab ?? 'suppliers');
    setShowExpiryCenter(Boolean(r.showExpiryCenter));
  }, [setStatusFilter]);

  // ── 입출고 모달 훅 ──
  const refreshCurrentInventory = useCallback(() => {
    return activeView === '현황' ? data.fetchInventory('전체') : data.fetchInventory(selectedCo);
  }, [activeView, data.fetchInventory, selectedCo]);

  const stockModal = useStockModal({
    user, selectedCompanyId, refreshCurrentInventory, fetchLogs: data.fetchLogs, onRefresh,
  });

  // ── 공급 워크플로우 훅 ──
  const workflow = useSupplyWorkflow({
    user, isInventoryOpsUser, activeView, refreshCurrentInventory, fetchLogs: data.fetchLogs, onRefresh,
  });

  // ── 뷰 이동 ──
  const openInventoryView = useCallback((view: string, nextMode?: RegistrationMode) => {
    if (!(VALID_VIEWS as readonly string[]).includes(view)) return;
    if (!canAccessInventorySection(user, view)) return;
    const r = resolveInventoryView(view);
    applyResolvedView(view);
    if (r.view === '등록' && nextMode) setRegistrationMode(nextMode);
    else if (r.view !== '등록') setRegistrationMode('form');
  }, [applyResolvedView, user]);

  const openLinkedSupplyOrder = useCallback((approvalId: string, requestIndex: number) => {
    workflow.setHighlightedSupplyOrderTarget({ approvalId: String(approvalId), requestIndex: Number(requestIndex) });
    openInventoryView('발주');
  }, [openInventoryView, workflow.setHighlightedSupplyOrderTarget]);

  // ── Effects: localStorage 복구, 접근 제어, 데이터 로딩 ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const req = initialView && (VALID_VIEWS as readonly string[]).includes(initialView) ? initialView : window.localStorage.getItem(INV_VIEW_KEY);
    if (!req || !(VALID_VIEWS as readonly string[]).includes(req)) return;
    if (!canAccessInventorySection(user, req) && !fallbackView) return;
    const next = canAccessInventorySection(user, req) ? req : fallbackView;
    if (!next) return;
    applyResolvedView(next);
    try { window.localStorage.setItem(INV_VIEW_KEY, resolveInventoryView(next).view); } catch { /* */ }
  }, [applyResolvedView, fallbackView, initialView, user]);

  useEffect(() => {
    if (fallbackView && !canAccessInventorySection(user, activeView)) applyResolvedView(fallbackView);
  }, [activeView, applyResolvedView, fallbackView, user]);

  useEffect(() => {
    if (activeView === '이력' || activeView === '현황') void data.fetchLogs();
  }, [activeView, data.fetchLogs]);

  useEffect(() => {
    if (typeof window !== 'undefined') { try { window.localStorage.setItem(INV_VIEW_KEY, activeView); } catch { /* */ } }
    onViewChange?.(activeView);
  }, [activeView, onViewChange]);

  useEffect(() => { data.fetchSuppliers(); }, [data.fetchSuppliers]);

  useEffect(() => {
    activeView === '현황' ? data.fetchInventory('전체') : data.fetchInventory(selectedCo);
  }, [activeView, selectedCo, data.fetchInventory]);

  useEffect(() => {
    if (activeView === '현황' && !data.loading) void workflow.fetchPendingSupplyApprovals();
  }, [activeView, data.loading, workflow.fetchPendingSupplyApprovals]);

  // ── 워크플로우 딥링크 ──
  useEffect(() => {
    if (!initialWorkflowApprovalId) return;
    if (activeView !== '현황') applyResolvedView('현황');
    if (!isInventoryOpsUser) onConsumeInitialWorkflowApprovalId?.();
  }, [activeView, applyResolvedView, initialWorkflowApprovalId, isInventoryOpsUser, onConsumeInitialWorkflowApprovalId]);

  useEffect(() => {
    if (!initialWorkflowApprovalId || activeView !== '현황') return;
    const match = [...workflow.pendingSupplyApprovals, ...workflow.completedSupplyApprovals].find(
      (a) => String(a?.id) === String(initialWorkflowApprovalId),
    );
    if (!match) return;
    workflow.setHighlightedSupplyApprovalId(String(initialWorkflowApprovalId));
    const sel = `[data-supply-approval-id="${String(initialWorkflowApprovalId)}"]`;
    const scrollT = window.setTimeout(() => { const el = document.querySelector(sel); if (el instanceof HTMLElement) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 120);
    const clearT = window.setTimeout(() => { workflow.setHighlightedSupplyApprovalId((c) => c === String(initialWorkflowApprovalId) ? null : c); }, 2600);
    onConsumeInitialWorkflowApprovalId?.();
    return () => { clearTimeout(scrollT); clearTimeout(clearT); };
  }, [activeView, workflow.completedSupplyApprovals, initialWorkflowApprovalId, onConsumeInitialWorkflowApprovalId, workflow.pendingSupplyApprovals]);

  // ── 접근 불가 ──
  if (!fallbackView) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--muted)] p-4 text-center" data-testid="inventory-view">
        <div className="mb-4 text-6xl">🔒</div>
        <h2 className="text-xl font-bold text-[var(--foreground)]">재고관리 접근 권한이 없습니다.</h2>
        <p className="mt-2 text-sm font-semibold text-[var(--toss-gray-3)]">메인 메뉴 권한과 재고관리 세부 권한을 확인해 주세요.</p>
      </div>
    );
  }

  const currentViewMeta = INVENTORY_VIEW_META[activeView] || { title: activeView, description: '' };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-x-hidden app-page" data-testid="inventory-view">
      <InventoryAlertBadge lowCount={lowStockItems.length} expiryCount={expiryImminentItems.length} />
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

          {/* ── 뷰 라우팅 ── */}
          {activeView === '현황' && (
            <InventoryStatusView
              filteredInventory={filters.filteredInventory} lowStockCount={filters.lowStockFilteredItems.length}
              expiryCount={filters.expiryFilteredItems.length} outOfStockCount={filters.outOfStockItems.length}
              urgentItems={filters.urgentActionItems} totalQuantity={filters.totalQuantity} totalValue={filters.totalInventoryValue}
              viewCompany={filters.viewCompany} setViewCompany={filters.setViewCompany}
              selectedDept={filters.selectedDept} setSelectedDept={filters.setSelectedDept}
              searchKeyword={filters.searchKeyword} setSearchKeyword={filters.setSearchKeyword}
              statusFilter={filters.statusFilter} setStatusFilter={filters.setStatusFilter}
              companiesInInventory={filters.companiesInInventory} departmentsByViewCompany={filters.departmentsByViewCompany}
              loading={data.loading} onRefresh={refreshCurrentInventory}
              onStockIn={stockModal.openStockIn} onStockOut={stockModal.openStockOut}
              onReorder={stockModal.handleAutoApprovalRequest} onDelete={stockModal.handleDeleteItem}
              isOpsUser={isInventoryOpsUser}
              pendingApprovals={workflow.pendingSupplyApprovals} completedApprovals={workflow.completedSupplyApprovals}
              workflowActionKey={workflow.workflowActionKey} highlightedApprovalId={workflow.highlightedSupplyApprovalId}
              onSupplyIssue={(a, i) => void workflow.handleSupplyIssue(a, i)}
              onSupplyIssueCancel={(a, i) => void workflow.handleSupplyIssueCancel(a, i)}
              onSupplyOrder={(a, i) => void workflow.handleSupplyOrder(a, i)}
              onSupplyOrderCancel={(a, i) => void workflow.handleSupplyOrderCancel(a, i)}
              onOpenLinkedOrder={openLinkedSupplyOrder}
              showExpiryCenter={showExpiryCenter} setShowExpiryCenter={setShowExpiryCenter}
              expiryThreshold={filters.expiryThreshold} openView={openInventoryView}
              batchMode={stockModal.batchMode} setBatchMode={stockModal.setBatchMode}
              batchSelectedIds={stockModal.batchSelectedIds}
              toggleBatchItem={stockModal.toggleBatchItem} toggleBatchAll={stockModal.toggleBatchAll}
              onBatchStockIn={() => stockModal.setBatchModal({ type: 'in' })}
              onBatchStockOut={() => stockModal.setBatchModal({ type: 'out' })}
            />
          )}
          {activeView === '이력' && (
            <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
              <div className="flex flex-col gap-3 border-b border-[var(--border)] px-5 py-4 md:flex-row md:items-center md:justify-between">
                <h3 className="text-base font-bold text-[var(--foreground)]">최근 입출고 이력</h3>
                <button type="button" onClick={() => void data.fetchLogs()} className="rounded-[var(--radius-md)] bg-[var(--muted)] px-4 py-3 text-[11px] font-bold text-[var(--toss-gray-4)] transition-all hover:bg-[var(--border)]">새로고침</button>
              </div>
              <div className="overflow-x-auto">
                {data.logs.length === 0 ? (
                  <div className="empty-state rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-4 py-10 text-sm font-semibold">이력이 없습니다.</div>
                ) : (
                  <table className="min-w-[860px] w-full text-left text-xs">
                    <thead className="bg-[var(--muted)]/50 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">
                      <tr><th className="px-4 py-3">일시</th><th className="px-4 py-3">유형</th><th className="px-4 py-3">수량</th><th className="px-4 py-3">변동</th><th className="px-4 py-3">처리자</th><th className="px-4 py-3">회사/시리얼</th></tr>
                    </thead>
                    <tbody>
                      {data.logs.map((log) => {
                        const id = String(log.id ?? '');
                        const at = log.created_at ? new Date(String(log.created_at)).toLocaleString('ko-KR') : '-';
                        const ct = String(log.change_type || log.type || '');
                        const sn = String(log.serial_number || '').trim();
                        return (
                          <tr key={id} className="border-t border-[var(--border)]">
                            <td className="px-4 py-3 font-mono text-[11px] text-[var(--toss-gray-4)]">{at}</td>
                            <td className="px-4 py-3"><span className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-bold ${ct === '입고' ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>{ct || '-'}</span></td>
                            <td className="px-4 py-3 font-bold text-[var(--foreground)]">{String(log.quantity ?? '-')}</td>
                            <td className="px-4 py-3 text-[var(--toss-gray-3)]">{log.prev_quantity !== undefined && log.prev_quantity !== null ? `${String(log.prev_quantity)} → ${String(log.next_quantity ?? '')}` : '-'}</td>
                            <td className="px-4 py-3 text-[var(--foreground)]">{String(log.actor_name || '') || '-'}</td>
                            <td className="px-4 py-3 text-[var(--toss-gray-4)]"><p>{String(log.company || '') || '-'}</p>{sn && <p className="mt-1 text-[10px] font-semibold text-emerald-600">S/N: {sn}</p>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}
          {activeView === 'UDI' && <UDIManagement user={user} inventory={data.inventory} fetchInventory={data.fetchInventory} />}
          {activeView === '발주' && <PurchaseOrderManagement user={user} inventory={data.inventory} suppliers={data.suppliers} fetchInventory={data.fetchInventory} highlightedSource={workflow.highlightedSupplyOrderTarget} onConsumeHighlightedSource={() => workflow.setHighlightedSupplyOrderTarget(null)} />}
          {activeView === '스캔' && <ScanModule user={user} inventory={data.inventory} fetchInventory={data.fetchInventory} />}
          {activeView === '등록' && (
            <div className="space-y-4">
              <div className="flex gap-2 mb-2">
                {([['form', '✏️ 일반 등록', 'bg-[var(--accent)] text-white shadow-sm'], ['excel', '📊 엑셀 일괄 등록', 'bg-emerald-600 text-white shadow-md'], ['auto_extract', '📄 입고 자동추출 (AI)', 'bg-purple-600 text-white shadow-md']] as const).map(([mode, label, activeClass]) => (
                  <button key={mode} type="button" onClick={() => setRegistrationMode(mode)} className={`flex-1 px-4 py-3 rounded-[var(--radius-md)] text-[11px] font-semibold transition-all ${registrationMode === mode ? activeClass : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>{label}</button>
                ))}
              </div>
              {registrationMode === 'form' ? <ProductRegistration user={user} inventory={data.inventory} suppliers={data.suppliers} fetchInventory={data.fetchInventory} fetchSuppliers={data.fetchSuppliers} />
                : registrationMode === 'excel' ? <ExcelBulkUpload onRefresh={data.fetchInventory} />
                : <InvoiceAutoExtraction onRefresh={data.fetchInventory} user={user} />}
            </div>
          )}
          {activeView === '자산' && <QRAssetManager user={user} inventory={data.inventory} fetchInventory={() => data.fetchInventory(selectedCo)} />}
          {activeView === '비품대여설정' && <AssetLoanSettingsAdminView staffs={staffs} user={user} />}
          {activeView === 'AS반품' && <ASReturnManagement user={user} />}
          {activeView === '거래처' && <SupplierDocumentWorkspace user={user} inventory={data.inventory} suppliers={data.suppliers} fetchSuppliers={data.fetchSuppliers} initialTab={supplierWorkspaceTab} />}
          {activeView === '재고실사' && <InventoryCount user={user} inventory={data.inventory} fetchInventory={() => data.fetchInventory(selectedCo)} />}
          {activeView === '이관' && <InventoryTransfer user={user} inventory={data.inventory} fetchInventory={() => data.fetchInventory(selectedCo)} />}
          {activeView === '카테고리' && <CategoryManager user={user} />}
          {activeView === '소모품통계' && <ConsumableStats user={user} selectedCo={selectedCo ?? ''} />}
          {activeView === '납품확인서' && <DeliveryConfirmation user={user} selectedCo={selectedCo ?? ''} />}
          {activeView === '수요예측' && <InventoryDemandForecast user={user} inventory={data.inventory} selectedCo={selectedCo ?? ''} />}
          {activeView === '내부서재고' && <DepartmentConsumption user={user} inventory={data.inventory} fetchInventory={() => data.fetchInventory(selectedCo)} />}
        </main>
      </div>

      {/* ── 입출고 모달 ── */}
      {stockModal.stockModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={() => stockModal.setStockModal(null)}>
          <div data-testid="inventory-stock-modal" className="bg-[var(--card)] rounded-[var(--radius-lg)] shadow-sm p-5 max-w-sm w-full overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">{stockModal.stockModal.type === 'in' ? '입고' : '출고'} 상세 입력</h3>
            <p className="text-xs font-bold text-[var(--toss-gray-3)] mb-2">{String((stockModal.stockModal.item as Record<string, unknown>).item_name || stockModal.stockModal.item.name || '')}</p>
            <p className="text-[11px] text-[var(--toss-gray-3)] mb-4">현재고: {stockModal.stockModal.item.quantity ?? Number((stockModal.stockModal.item as Record<string, unknown>).stock ?? 0)}</p>
            <div className="space-y-4 mb-4">
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">수량 (개/단위)</label>
                <input data-testid="inventory-stock-amount-input" type="number" min={1} max={stockModal.stockModal.type === 'out' ? (stockModal.stockModal.item.quantity ?? Number((stockModal.stockModal.item as Record<string, unknown>).stock ?? 0)) : 99999} value={stockModal.stockAmount} onChange={(e) => stockModal.setStockAmount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-3 rounded-[var(--radius-md)] border border-[var(--border)] text-sm font-semibold" />
              </div>
              {stockModal.stockModal.type === 'in' && (
                <div>
                  <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">시리얼 번호 (선택)</label>
                  <input value={stockModal.stockSerialInput} onChange={(e) => stockModal.setStockSerialInput(e.target.value)} className="w-full px-4 py-3 rounded-[var(--radius-md)] border border-[var(--border)] text-sm font-semibold" placeholder="SERIAL-0000" />
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">대상 회사</label>
                  <select data-testid="inventory-stock-company-select" value={stockModal.stockModal.targetCompany} onChange={(e) => stockModal.setStockModal({ ...stockModal.stockModal!, targetCompany: e.target.value })} className="w-full px-3 py-3 border border-[var(--border)] rounded-[var(--radius-md)] text-xs font-bold">
                    <option value="전체">미지정</option>
                    {filters.companiesInInventory.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">대상 부서</label>
                  <select data-testid="inventory-stock-dept-select" value={stockModal.stockModal.targetDept} onChange={(e) => stockModal.setStockModal({ ...stockModal.stockModal!, targetDept: e.target.value })} className="w-full px-3 py-3 border border-[var(--border)] rounded-[var(--radius-md)] text-xs font-bold">
                    <option value="전체">미지정</option>
                    {(filters.getDepartmentsForCompany(stockModal.stockModal.targetCompany)).map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[9px] text-[var(--toss-gray-3)] leading-relaxed">* 대상 회사/부서를 지정하면 입출고 이력(처리자 목록)에 귀속 대상이 함께 기록됩니다.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => stockModal.setStockModal(null)} disabled={stockModal.isUpdating} className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm disabled:opacity-50">취소</button>
              <button onClick={stockModal.executeStockUpdate} disabled={stockModal.isUpdating} className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-semibold text-sm disabled:opacity-50">{stockModal.isUpdating ? '처리 중...' : '확인'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 일괄 입출고 수량 입력 모달 ── */}
      {stockModal.batchModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={() => stockModal.setBatchModal(null)}>
          <div className="bg-[var(--card)] rounded-[var(--radius-lg)] shadow-sm p-5 max-w-sm w-full overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
              일괄 {stockModal.batchModal.type === 'in' ? '입고' : '출고'}
            </h3>
            <p className="text-xs text-[var(--toss-gray-3)] mb-4">
              선택된 {stockModal.batchSelectedIds.length}개 품목에 동일 수량을 적용합니다.
            </p>
            <div className="mb-4">
              <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">수량 (개/단위)</label>
              <input
                type="number"
                min={1}
                value={stockModal.batchAmount}
                onChange={(e) => stockModal.setBatchAmount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-4 py-3 rounded-[var(--radius-md)] border border-[var(--border)] text-sm font-semibold"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => stockModal.setBatchModal(null)} disabled={stockModal.isUpdating} className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm disabled:opacity-50">취소</button>
              <button
                disabled={stockModal.isUpdating}
                onClick={() => {
                  const selectedItems = data.inventory.filter((i) => stockModal.batchSelectedIds.includes(i.id));
                  stockModal.handleBatchStockUpdate(selectedItems, stockModal.batchModal!.type, stockModal.batchAmount);
                }}
                className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-semibold text-sm disabled:opacity-50"
              >
                {stockModal.isUpdating ? '처리 중...' : `${stockModal.batchSelectedIds.length}건 ${stockModal.batchModal.type === 'in' ? '입고' : '출고'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

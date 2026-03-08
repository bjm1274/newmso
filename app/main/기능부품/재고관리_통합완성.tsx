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

export default function IntegratedInventoryManagement({ user, selectedCo, selectedCompanyId, onRefresh, initialView }: any) {
  const [activeView, setActiveView] = useState(initialView && VALID_VIEWS.includes(initialView) ? initialView : '현황');
  const [viewCompany, setViewCompany] = useState<string>('전체'); // 현황 탭용 회사 선택
  const [selectedDept, setSelectedDept] = useState('전체');
  const [inventory, setInventory] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [stockModal, setStockModal] = useState<{ item: any; type: 'in' | 'out'; targetCompany: string; targetDept: string } | null>(null);
  const [stockAmount, setStockAmount] = useState(1);
  const [showLogs, setShowLogs] = useState(false);
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
  const departmentsByViewCompany = useMemo(() => {
    if (!viewCompany || viewCompany === '전체') return [];
    return Array.from(new Set(
      inventory
        .filter((i: any) => (i.company || '').trim() === viewCompany)
        .map((i: any) => (i.department || '').trim())
        .filter(Boolean)
    )).sort();
  }, [inventory, viewCompany]);

  const filteredInventory = useMemo(() => {
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

  const fetchInventory = useCallback(async (companyFilter?: string) => {
    setLoading(true);
    try {
      let query = supabase.from('inventory').select('*').order('item_name', { ascending: true });
      const effectiveCo = companyFilter !== undefined ? companyFilter : selectedCo;
      if (effectiveCo && effectiveCo !== '전체') query = query.eq('company', effectiveCo);
      const { data, error } = await query;
      if (error) throw error;
      if (data) setInventory(data);
    } catch (err) {
      console.error("재고 데이터 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCo]);

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
    if (initialView && VALID_VIEWS.includes(initialView)) {
      setActiveView(initialView);
      try { window.localStorage.setItem(INV_VIEW_KEY, initialView); } catch { /* ignore */ }
      return;
    }
    try {
      const saved = window.localStorage.getItem(INV_VIEW_KEY);
      if (saved && VALID_VIEWS.includes(saved)) setActiveView(saved);
    } catch { /* ignore */ }
  }, [initialView]);

  // 플라이아웃에서 '이력' 선택 시 로그 모달 열기
  useEffect(() => {
    if (activeView === '이력') {
      fetchLogs();
      setShowLogs(true);
    }
  }, [activeView, fetchLogs]);

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

  const handleStockUpdate = async (item: any, type: 'in' | 'out', amount: number, targetCompany: string, targetDept: string) => {
    if (amount <= 0) return alert("수량은 0보다 커야 합니다.");
    const currentQty = item.quantity ?? item.stock ?? 0;
    const newStock = type === 'in' ? currentQty + amount : currentQty - amount;
    if (type === 'out' && newStock < 0) return alert("재고가 부족하여 출고할 수 없습니다.");
    try {
      // 해당 물품의 귀속 회사/부서를 완전히 변경하는 것이 아니라면 inventory 테이블의 소속 구조는 유지하고 로그에만 사유를 기록
      const { error } = await supabase.from('inventory').update({ quantity: newStock, stock: newStock }).eq('id', item.id);
      if (!error) {
        await supabase.from('inventory_logs').insert([{
          item_id: item.id,
          inventory_id: item.id,
          type: type === 'in' ? '입고' : '출고',
          change_type: type === 'in' ? '입고' : '출고',
          quantity: amount,
          prev_quantity: currentQty,
          next_quantity: newStock,
          actor_name: targetDept && targetDept !== '전체' ? `${user?.name} (${targetDept})` : user?.name,
          company: targetCompany || item.company
        }]);
        alert(`${type === 'in' ? '입고' : '출고'} 처리가 완료되었습니다.`);
        fetchInventory();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('입출고 처리 실패:', err);
    }
  };

  const handleAutoApprovalRequest = async (item: any) => {
    if (!confirm(`[안전재고 부족] ${item.item_name} 품목의 비품구매 신청서를 자동으로 작성하여 MSO 결재 상신을 진행하시겠습니까?`)) return;
    try {
      const { error } = await supabase.from('approvals').insert([{
        sender_id: user.id,
        sender_name: user.name,
        sender_company: user.company,
        type: '비품구매',
        title: `[자동기안] ${item.item_name} 재고 보충 요청 (${item.company})`,
        content: `현재고(${item.quantity})가 안전재고(${item.min_quantity}) 이하로 떨어져 자동 기안되었습니다. \n보충 필요량: ${item.min_quantity * 2 - item.quantity}개`,
        status: '대기',
        meta_data: { item_name: item.item_name, quantity: item.min_quantity * 2 - item.quantity, current_stock: item.quantity, is_auto_generated: true }
      }]);
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
          {activeView === '현황' && (
            loading ? (
              <div className="h-full flex items-center justify-center font-bold text-[var(--toss-gray-3)]">데이터 동기화 중...</div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
                  <div className="flex-1 flex flex-wrap items-center gap-2">
                    <select
                      value={viewCompany}
                      onChange={(e) => setViewCompany(e.target.value)}
                      className="px-3 py-3 rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-card)] text-sm font-bold min-w-[140px]"
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
                      className="px-3 py-3 rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-card)] text-sm font-bold min-w-[120px]"
                      title="부서 선택 (선택한 회사 기준)"
                    >
                      <option value="전체">전체 부서</option>
                      {departmentsByViewCompany.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="품목명·분류·LOT·회사 검색..."
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      className="flex-1 min-w-[160px] max-w-md px-4 py-3 rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-card)] text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/20 focus:border-[var(--toss-blue)] outline-none"
                    />
                  </div>
                  <button onClick={() => activeView === '현황' ? fetchInventory('전체') : fetchInventory(selectedCo)} className="px-4 py-3 rounded-[12px] bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] text-xs font-semibold hover:bg-[var(--toss-border)] transition-all shrink-0">🔄 새로고침</button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-[var(--toss-card)] p-6 rounded-[16px] border border-[var(--toss-border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">조회 품목</p>
                    <p className="text-2xl font-semibold text-[var(--toss-blue)] mt-1">{filteredInventory.length}</p>
                  </div>
                  <div className="bg-[var(--toss-card)] p-6 rounded-[16px] border border-[var(--toss-border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">안전재고 미달</p>
                    <p className="text-2xl font-semibold text-red-600 mt-1">{filteredInventory.filter(i => (i.quantity ?? i.stock ?? 0) <= (i.min_quantity ?? i.min_stock ?? 0)).length}</p>
                  </div>
                  <div className="bg-[var(--toss-card)] p-6 rounded-[16px] border border-[var(--toss-border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">유효기간 임박</p>
                    <p className="text-2xl font-semibold text-orange-600 mt-1">
                      {filteredInventory.filter(i => i.expiry_date && new Date(i.expiry_date).getTime() < new Date().getTime() + 30 * 24 * 60 * 60 * 1000).length}
                    </p>
                  </div>
                  <div className="bg-[var(--toss-card)] p-6 rounded-[16px] border border-[var(--toss-border)] shadow-sm text-center">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">조회 회사 / 부서</p>
                    <p className="text-xs font-semibold text-[var(--foreground)] mt-1 truncate">{viewCompany === '전체' ? '전체' : viewCompany}{selectedDept !== '전체' ? ` · ${selectedDept}` : ''}</p>
                  </div>
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
                          const isExpiryImminent = item.expiry_date && new Date(item.expiry_date).getTime() < new Date().getTime() + 30 * 24 * 60 * 60 * 1000;
                          return (
                            <tr key={item.id} className="hover:bg-[var(--toss-blue-light)]/50 transition-all group">
                              <td className="px-6 py-4">
                                <p className="text-[11px] font-semibold text-[var(--toss-blue)]">{item.company}</p>
                                <p className="text-[8px] font-bold text-[var(--toss-gray-3)]">{item.category}</p>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-xs font-semibold text-[var(--foreground)] group-hover:text-[var(--toss-blue)] transition-colors">{item.item_name}</p>
                                <div className="flex gap-1 mt-0.5">
                                  {item.lot_number && <span className="text-[7px] font-semibold bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] px-1 py-0.5 rounded">LOT: {item.lot_number}</span>}
                                  {item.is_udi && <span className="text-[7px] font-semibold bg-purple-50 text-purple-500 px-1 py-0.5 rounded uppercase">UDI</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`text-xs font-semibold ${item.quantity <= item.min_quantity ? 'text-red-600' : 'text-[var(--foreground)]'}`}>{item.quantity}</span>
                                <p className="text-[8px] font-bold text-[var(--toss-gray-3)]">안전: {item.min_quantity}</p>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <p className="text-xs font-semibold text-[var(--toss-gray-4)]">{item.unit_price?.toLocaleString()}원</p>
                                <p className="text-[8px] font-bold text-[var(--toss-gray-3)]">총액: {(item.unit_price * item.quantity)?.toLocaleString()}원</p>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <p className={`text-[11px] font-semibold ${isExpiryImminent ? 'text-orange-600' : 'text-[var(--toss-gray-3)]'}`}>
                                  {item.expiry_date || '-'}
                                </p>
                                {isExpiryImminent && <p className="text-[7px] font-semibold text-orange-400 animate-pulse">임박</p>}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-semibold ${item.quantity <= item.min_quantity ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                  {item.quantity <= item.min_quantity ? '재고부족' : '정상'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right space-x-1">
                                <button onClick={() => { setStockModal({ item, type: 'in', targetCompany: item.company || '전체', targetDept: item.department || '전체' }); setStockAmount(1); }} className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--toss-blue)] text-[11px] font-semibold rounded-md hover:bg-[var(--toss-blue-light)]">입고</button>
                                <button onClick={() => { setStockModal({ item, type: 'out', targetCompany: item.company || '전체', targetDept: item.department || '전체' }); setStockAmount(1); }} className="px-2 py-1 bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] text-[11px] font-semibold rounded-md hover:bg-[var(--toss-gray-1)]/80">출고</button>
                                {item.quantity <= item.min_quantity && (
                                  <button onClick={() => handleAutoApprovalRequest(item)} className="px-2 py-1 bg-orange-600 text-white text-[11px] font-semibold rounded-md shadow-sm">발주</button>
                                )}
                                <button
                                  onClick={async () => {
                                    if (confirm(`[${item.item_name}] 품목을 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
                                      try {
                                        await supabase.from('inventory').delete().eq('id', item.id);
                                        alert('삭제되었습니다.');
                                        fetchInventory();
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
          <div className="bg-[var(--toss-card)] rounded-[16px] shadow-2xl p-8 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">{stockModal.type === 'in' ? '입고' : '출고'} 상세 입력</h3>
            <p className="text-xs font-bold text-[var(--toss-gray-3)] mb-2">{stockModal.item.item_name || stockModal.item.name}</p>
            <p className="text-[11px] text-[var(--toss-gray-3)] mb-4">현재고: {stockModal.item.quantity ?? stockModal.item.stock ?? 0}</p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">수량 (개/단위)</label>
                <input type="number" min={1} max={stockModal.type === 'out' ? (stockModal.item.quantity ?? stockModal.item.stock ?? 0) : 99999} value={stockAmount} onChange={e => setStockAmount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-3 rounded-[12px] border border-[var(--toss-border)] text-sm font-semibold" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">대상 회사</label>
                  <select value={stockModal.targetCompany} onChange={e => setStockModal({ ...stockModal, targetCompany: e.target.value })} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[12px] text-xs font-bold">
                    <option value="전체">미지정</option>
                    {companiesInInventory.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">대상 부서</label>
                  <select value={stockModal.targetDept} onChange={e => setStockModal({ ...stockModal, targetDept: e.target.value })} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[12px] text-xs font-bold">
                    <option value="전체">미지정</option>
                    {departmentsByViewCompany.map(d => <option key={d} value={d}>{d}</option>)}
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

      {/* 재고 이력 모달 */}
      {showLogs && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={() => setShowLogs(false)}>
          <div className="bg-[var(--toss-card)] rounded-[16px] shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[var(--toss-border)] flex justify-between items-center">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">📋 재고 입출고 이력</h3>
              <button onClick={() => setShowLogs(false)} className="p-2 hover:bg-[var(--toss-gray-1)] rounded-full">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {logs.length === 0 ? (
                <p className="text-center text-[var(--toss-gray-3)] font-bold py-12">이력이 없습니다.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--toss-border)] text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">
                      <th className="py-3 px-2">일시</th>
                      <th className="py-3 px-2">유형</th>
                      <th className="py-3 px-2">수량</th>
                      <th className="py-3 px-2">변동</th>
                      <th className="py-3 px-2">처리자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l: any) => (
                      <tr key={l.id} className="border-b border-[var(--toss-border)]">
                        <td className="py-2 px-2 font-mono text-[11px]">{new Date(l.created_at).toLocaleString()}</td>
                        <td className="py-2 px-2"><span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${(l.change_type || l.type) === '입고' ? 'bg-[var(--toss-blue-light)] text-[var(--toss-blue)]' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}>{l.change_type || l.type || '-'}</span></td>
                        <td className="py-2 px-2 font-bold">{l.quantity ?? '-'}</td>
                        <td className="py-2 px-2 text-[var(--toss-gray-3)]">{(l.prev_quantity ?? '') !== '' ? `${l.prev_quantity}→${l.next_quantity}` : '-'}</td>
                        <td className="py-2 px-2">{l.actor_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

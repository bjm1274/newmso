'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import UDIManagement from './재고관리서브/UDI관리';
import InvoiceManagement from './재고관리서브/명세서관리';
import PurchaseOrderManagement from './재고관리서브/발주관리';
import ScanModule from './재고관리서브/스캔모듈완성';
import PhotoModule from './재고관리서브/촬영모듈';
import ProductRegistration from './재고관리서브/물품등록';

export default function IntegratedInventoryManagement({ user, selectedCo }: any) {
  const [activeView, setActiveView] = useState('현황');
  const [selectedDept, setSelectedDept] = useState('전체');
  const [inventory, setInventory] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('inventory').select('*').order('item_name', { ascending: true });
      if (selectedCo && selectedCo !== '전체') query = query.eq('company', selectedCo);
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

  useEffect(() => {
    fetchInventory();
    fetchSuppliers();
  }, [fetchInventory, fetchSuppliers, selectedCo]);

  const handleStockUpdate = async (item: any, type: 'in' | 'out', amount: number) => {
    if (amount <= 0) return alert("수량은 0보다 커야 합니다.");
    const newStock = type === 'in' ? item.quantity + amount : item.quantity - amount;
    if (type === 'out' && newStock < 0) return alert("재고가 부족하여 출고할 수 없습니다.");
    try {
      const { error } = await supabase.from('inventory').update({ quantity: newStock }).eq('id', item.id);
      if (!error) {
        await supabase.from('inventory_logs').insert([{
          inventory_id: item.id,
          change_type: type === 'in' ? '입고' : '출고',
          quantity: amount,
          prev_quantity: item.quantity,
          next_quantity: newStock,
          actor_name: user.name,
          company: item.company
        }]);
        alert(`${type === 'in' ? '입고' : '출고'} 처리가 완료되었습니다.`);
        fetchInventory();
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

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden animate-soft-fade">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/50 p-6 md:p-10 shrink-0 z-20 shadow-sm relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-primary/10 text-primary text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Inventory Engine</span>
              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">v2.5 Premium</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter">재고 통합 제어 시스템</h1>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-2xl w-full md:w-auto overflow-x-auto no-scrollbar">
            <button onClick={() => setActiveView('현황')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[11px] font-black transition-all ${activeView === '현황' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>📊 현황</button>
            <button onClick={() => setActiveView('등록')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[11px] font-black transition-all ${activeView === '등록' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>➕ 등록</button>
            <button onClick={() => setActiveView('UDI')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[11px] font-black transition-all ${activeView === 'UDI' ? 'bg-white text-secondary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>📡 UDI</button>
            <button onClick={() => setActiveView('명세서')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[11px] font-black transition-all ${activeView === '명세서' ? 'bg-white text-success shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>📄 명세서</button>
            <button onClick={() => setActiveView('발주')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[11px] font-black transition-all ${activeView === '발주' ? 'bg-white text-warning shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>📦 발주</button>
            <button onClick={() => setActiveView('스캔')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[11px] font-black transition-all ${activeView === '스캔' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>🔍 스캔</button>
            <button onClick={() => setActiveView('촬영')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[11px] font-black transition-all ${activeView === '촬영' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>📸 촬영</button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <main className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar bg-background">
          {activeView === '현황' && (
            loading ? (
              <div className="h-full flex flex-col items-center justify-center space-y-4">
                <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                <p className="font-black text-slate-300 tracking-widest uppercase text-[10px]">Synchronizing Logic Engine...</p>
              </div>
            ) : (
              <div className="space-y-10 max-w-[1600px] mx-auto">
                {/* Summary Cards with Premium Look */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="premium-card p-8 group overflow-hidden relative">
                    <div className="absolute -right-4 -top-4 w-20 h-20 bg-primary/5 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Inventory Items</p>
                    <div className="flex items-end gap-2">
                      <p className="text-4xl font-black text-slate-900">{inventory.length}</p>
                      <p className="text-xs font-bold text-slate-400 mb-1">Items</p>
                    </div>
                  </div>
                  <div className="premium-card p-8 group border-danger/10 overflow-hidden relative">
                    <div className="absolute -right-4 -top-4 w-20 h-20 bg-danger/5 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
                    <p className="text-[10px] font-black text-danger/60 uppercase tracking-widest mb-2">Low Stock Alert</p>
                    <div className="flex items-end gap-2">
                      <p className="text-4xl font-black text-danger">{inventory.filter(i => i.quantity <= i.min_quantity).length}</p>
                      <p className="text-xs font-bold text-danger/40 mb-1">Critical</p>
                    </div>
                  </div>
                  <div className="premium-card p-8 group border-warning/10 overflow-hidden relative">
                    <div className="absolute -right-4 -top-4 w-20 h-20 bg-warning/5 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
                    <p className="text-[10px] font-black text-warning/60 uppercase tracking-widest mb-2">Expiring Soon (30d)</p>
                    <div className="flex items-end gap-2">
                      <p className="text-4xl font-black text-warning">
                        {inventory.filter(i => i.expiry_date && new Date(i.expiry_date).getTime() < new Date().getTime() + 30 * 24 * 60 * 60 * 1000).length}
                      </p>
                      <p className="text-xs font-bold text-warning/40 mb-1">Batch</p>
                    </div>
                  </div>
                  <div className="premium-card p-8 group overflow-hidden relative">
                    <div className="absolute -right-4 -top-4 w-20 h-20 bg-slate-50 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Selected Scope</p>
                    <div className="flex items-end gap-2">
                      <p className="text-xl font-black text-slate-800 truncate max-w-full">{selectedCo || 'Total Enterprise'}</p>
                    </div>
                  </div>
                </div>

                {/* Data Table with Premium Styling */}
                <div className="premium-card overflow-hidden border-none shadow-2xl shadow-slate-200/50 bg-white">
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1100px]">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization & Category</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Information</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Current Stock</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Financials</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Expiry Status</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {inventory.map(item => {
                          const isExpiryImminent = item.expiry_date && new Date(item.expiry_date).getTime() < new Date().getTime() + 30 * 24 * 60 * 60 * 1000;
                          const isLowStock = item.quantity <= item.min_quantity;
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/80 transition-all group animate-in fade-in duration-300">
                              <td className="px-8 py-6">
                                <p className="text-[10px] font-black text-primary mb-0.5">{item.company}</p>
                                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">{item.category}</span>
                              </td>
                              <td className="px-8 py-6">
                                <p className="text-sm font-black text-slate-800 group-hover:text-primary transition-colors">{item.item_name}</p>
                                <div className="flex gap-1.5 mt-1.5">
                                  {item.lot_number && <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md"># {item.lot_number}</span>}
                                  {item.is_udi && <span className="text-[8px] font-black bg-secondary-soft text-secondary px-2 py-0.5 rounded-md border border-secondary/10 uppercase tracking-widest">UDI certified</span>}
                                </div>
                              </td>
                              <td className="px-8 py-6 text-center">
                                <div className="flex flex-col items-center">
                                  <span className={`text-lg font-black ${isLowStock ? 'text-danger' : 'text-slate-800'}`}>{item.quantity?.toLocaleString()}</span>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[8px] font-bold text-slate-400 uppercase">Min:</span>
                                    <span className="text-[8px] font-black text-slate-600">{item.min_quantity}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-8 py-6 text-center">
                                <p className="text-[11px] font-black text-slate-700">{item.unit_price?.toLocaleString()} ₩</p>
                                <p className="text-[9px] font-bold text-slate-400 mt-0.5 italic">Total: {(item.unit_price * item.quantity)?.toLocaleString()} ₩</p>
                              </td>
                              <td className="px-8 py-6 text-center">
                                <div className="flex flex-col items-center">
                                  <p className={`text-[10px] font-black ${isExpiryImminent ? 'text-warning' : 'text-slate-500'}`}>
                                    {item.expiry_date || 'N/A'}
                                  </p>
                                  {isExpiryImminent && (
                                    <span className="mt-1 text-[7px] font-black bg-warning-soft text-warning px-1.5 py-0.5 rounded uppercase animate-pulse border border-warning/10">Expiry imminent</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-2">
                                  <div className={`w-1.5 h-1.5 rounded-full ${isLowStock ? 'bg-danger shadow-sm shadow-danger/40' : 'bg-success shadow-sm shadow-success/40'}`}></div>
                                  <span className={`text-[10px] font-black uppercase tracking-tight ${isLowStock ? 'text-danger' : 'text-success'}`}>
                                    {isLowStock ? 'Low Stock' : 'Optimized'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-8 py-6 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => handleStockUpdate(item, 'in', 1)} className="p-2.5 bg-slate-100 hover:bg-primary hover:text-white text-slate-600 rounded-xl transition-all duration-300" title="Receive Stock">
                                    <span className="text-xs font-black">IN</span>
                                  </button>
                                  <button onClick={() => handleStockUpdate(item, 'out', 1)} className="p-2.5 bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-600 rounded-xl transition-all duration-300" title="Release Stock">
                                    <span className="text-xs font-black">OUT</span>
                                  </button>
                                  {isLowStock && (
                                    <button onClick={() => handleAutoApprovalRequest(item)} className="p-2.5 bg-danger/10 text-danger hover:bg-danger hover:text-white rounded-xl transition-all duration-300 shadow-sm border border-danger/20" title="Auto Reorder">
                                      <span className="text-xs font-black">REORDER</span>
                                    </button>
                                  )}
                                </div>
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
          {activeView === '스캔' && <ScanModule user={user} inventory={inventory} fetchInventory={fetchInventory} />}
          {activeView === '촬영' && <PhotoModule user={user} inventory={inventory} fetchInventory={fetchInventory} />}
          {activeView === '등록' && <ProductRegistration user={user} suppliers={suppliers} fetchInventory={fetchInventory} fetchSuppliers={fetchSuppliers} />}
        </main>
      </div>
    </div>
  );
}

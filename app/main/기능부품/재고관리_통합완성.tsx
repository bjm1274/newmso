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
    <div className="flex flex-col h-full bg-[#F8FAFC] overflow-hidden">
      <header className="bg-white border-b border-gray-100 p-4 md:p-8 shrink-0 z-20 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight italic">SY INC. 재고 통합 제어</h1>
            <p className="text-[10px] md:text-xs text-blue-600 font-bold mt-1 uppercase tracking-widest">MSO Integrated Inventory Engine</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-1">
            <button onClick={() => setActiveView('UDI')} className={`px-4 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${activeView === 'UDI' ? 'bg-[#A11DFF] text-white shadow-lg' : 'bg-gray-100 text-gray-600'}`}>📡 UDI</button>
            <button onClick={() => setActiveView('명세서')} className={`px-4 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${activeView === '명세서' ? 'bg-[#00B44E] text-white shadow-lg' : 'bg-gray-100 text-gray-600'}`}>📄 명세서</button>
            <button onClick={() => setActiveView('발주')} className={`px-4 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${activeView === '발주' ? 'bg-[#FF6B00] text-white shadow-lg' : 'bg-gray-100 text-gray-600'}`}>📝 발주</button>
            <button onClick={() => setActiveView('스캔')} className={`px-4 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${activeView === '스캔' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-600'}`}>🔍 스캔</button>
            <button onClick={() => setActiveView('촬영')} className={`px-4 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${activeView === '촬영' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-600'}`}>📸 촬영</button>
            <button onClick={() => setActiveView('등록')} className={`px-4 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${activeView === '등록' ? 'bg-blue-500 text-white shadow-lg' : 'bg-gray-100 text-gray-600'}`}>+ 등록</button>
            <button onClick={() => setActiveView('현황')} className={`px-4 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${activeView === '현황' ? 'bg-gray-800 text-white shadow-lg' : 'bg-gray-100 text-gray-600'}`}>📊 현황</button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <main className="flex-1 p-4 md:p-10 bg-[#F8FAFC] overflow-y-auto custom-scrollbar">
          {activeView === '현황' && (
            loading ? (
              <div className="h-full flex items-center justify-center font-black text-gray-300">데이터 동기화 중...</div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
                    <p className="text-[9px] font-bold text-gray-400 uppercase">전체 품목</p>
                    <p className="text-2xl font-black text-blue-600 mt-1">{inventory.length}</p>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
                    <p className="text-[9px] font-bold text-gray-400 uppercase">안전재고 미달</p>
                    <p className="text-2xl font-black text-red-600 mt-1">{inventory.filter(i => i.quantity <= i.min_quantity).length}</p>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
                    <p className="text-[9px] font-bold text-gray-400 uppercase">유효기간 임박</p>
                    <p className="text-2xl font-black text-orange-600 mt-1">
                      {inventory.filter(i => i.expiry_date && new Date(i.expiry_date).getTime() < new Date().getTime() + 30 * 24 * 60 * 60 * 1000).length}
                    </p>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
                    <p className="text-[9px] font-bold text-gray-400 uppercase">선택 회사</p>
                    <p className="text-xs font-black text-gray-800 mt-1 truncate">{selectedCo}</p>
                  </div>
                </div>

                <div className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden">
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                      <thead>
                        <tr className="bg-gray-50/50 border-b border-gray-100">
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase">회사/분류</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase">품목명/LOT</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase text-center">현재고</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase text-center">단가</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase text-center">유효기간</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase">상태</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase text-right">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {inventory.map(item => {
                          const isExpiryImminent = item.expiry_date && new Date(item.expiry_date).getTime() < new Date().getTime() + 30 * 24 * 60 * 60 * 1000;
                          return (
                            <tr key={item.id} className="hover:bg-blue-50/30 transition-all group">
                              <td className="px-6 py-4">
                                <p className="text-[9px] font-black text-blue-600">{item.company}</p>
                                <p className="text-[8px] font-bold text-gray-400">{item.category}</p>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-xs font-black text-gray-800 group-hover:text-blue-600 transition-colors">{item.item_name}</p>
                                <div className="flex gap-1 mt-0.5">
                                  {item.lot_number && <span className="text-[7px] font-black bg-gray-100 text-gray-500 px-1 py-0.5 rounded">LOT: {item.lot_number}</span>}
                                  {item.is_udi && <span className="text-[7px] font-black bg-purple-50 text-purple-500 px-1 py-0.5 rounded uppercase">UDI</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`text-xs font-black ${item.quantity <= item.min_quantity ? 'text-red-600' : 'text-gray-800'}`}>{item.quantity}</span>
                                <p className="text-[8px] font-bold text-gray-300">안전: {item.min_quantity}</p>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <p className="text-xs font-black text-gray-700">{item.unit_price?.toLocaleString()}원</p>
                                <p className="text-[8px] font-bold text-gray-300">총액: {(item.unit_price * item.quantity)?.toLocaleString()}원</p>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <p className={`text-[10px] font-black ${isExpiryImminent ? 'text-orange-600' : 'text-gray-500'}`}>
                                  {item.expiry_date || '-'}
                                </p>
                                {isExpiryImminent && <p className="text-[7px] font-black text-orange-400 animate-pulse">임박</p>}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black ${item.quantity <= item.min_quantity ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                  {item.quantity <= item.min_quantity ? '재고부족' : '정상'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right space-x-1">
                                <button onClick={() => handleStockUpdate(item, 'in', 1)} className="px-2 py-1 bg-blue-50 text-blue-600 text-[9px] font-black rounded-md">입고</button>
                                <button onClick={() => handleStockUpdate(item, 'out', 1)} className="px-2 py-1 bg-gray-50 text-gray-600 text-[9px] font-black rounded-md">출고</button>
                                {item.quantity <= item.min_quantity && (
                                  <button onClick={() => handleAutoApprovalRequest(item)} className="px-2 py-1 bg-orange-600 text-white text-[9px] font-black rounded-md shadow-sm">발주</button>
                                )}
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

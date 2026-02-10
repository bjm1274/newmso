'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function PurchaseOrderManagement({ user, inventory, suppliers, fetchInventory }: any) {
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);

  useEffect(() => {
    fetchPurchaseOrders();
    checkLowStockItems();
  }, [inventory]);

  const fetchPurchaseOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setPurchaseOrders(data);
    } catch (err) {
      console.error('발주서 조회 실패:', err);
    }
  };

  const checkLowStockItems = () => {
    const items = inventory.filter((item: any) => item.quantity <= item.min_quantity);
    setLowStockItems(items);
  };

  const handleAutoGeneratePurchaseOrder = async () => {
    if (lowStockItems.length === 0) return alert('발주 대상 품목이 없습니다.');
    if (!confirm(`${lowStockItems.length}개 품목에 대한 발주서를 자동으로 생성하시겠습니까?`)) return;

    setLoading(true);
    try {
      const itemsBySupplier = lowStockItems.reduce((acc: any, item: any) => {
        const supplierName = item.supplier_name || '미지정';
        if (!acc[supplierName]) acc[supplierName] = [];
        acc[supplierName].push({
          item_id: item.id,
          name: item.item_name,
          qty: item.min_quantity * 2 - item.quantity,
          unit_price: item.unit_price || 0
        });
        return acc;
      }, {});

      for (const [supplierName, items] of Object.entries(itemsBySupplier)) {
        const totalAmount = (items as any[]).reduce((sum, item) => sum + (item.qty * item.unit_price), 0);
        const { error } = await supabase.from('purchase_orders').insert([{
          supplier_name: supplierName,
          items: items,
          status: '대기',
          total_amount: totalAmount,
          created_by: user.id,
          notes: '자동 생성된 발주서 (안전재고 미달)'
        }]);
        if (error) throw error;
      }

      alert(`발주서가 생성되었습니다.\n대상 품목: ${lowStockItems.length}개`);
      fetchPurchaseOrders();
    } catch (err) {
      alert('발주서 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprovePurchaseOrder = async (orderId: string) => {
    if (!confirm('이 발주서를 승인하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('purchase_orders').update({ status: '승인' }).eq('id', orderId);
      if (error) throw error;
      alert('발주서가 승인되었습니다.');
      fetchPurchaseOrders();
    } catch (err) {
      alert('발주서 승인에 실패했습니다.');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-6 md:p-10 border border-gray-100 shadow-xl rounded-[2.5rem]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tighter italic">스마트 발주 제어 시스템</h2>
            <p className="text-[10px] text-orange-600 font-bold mt-1 uppercase tracking-widest">Smart Purchase Order Engine</p>
          </div>
          <button
            onClick={handleAutoGeneratePurchaseOrder}
            disabled={loading || lowStockItems.length === 0}
            className="w-full md:w-auto px-8 py-4 bg-orange-600 text-white rounded-2xl text-sm font-black shadow-xl shadow-orange-100 hover:scale-[0.98] transition-all disabled:opacity-50"
          >
            🚨 자동 발주 생성 ({lowStockItems.length})
          </button>
        </div>

        {lowStockItems.length === 0 ? (
          <div className="text-center py-20 bg-green-50 rounded-[2rem] border border-dashed border-green-200">
            <p className="text-sm font-black text-green-600">✅ 모든 품목이 안전재고 이상입니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {lowStockItems.map((item: any) => (
              <div key={item.id} className="p-6 bg-orange-50 border border-orange-100 rounded-2xl flex justify-between items-center">
                <div>
                  <p className="text-sm font-black text-gray-900">{item.item_name}</p>
                  <p className="text-[10px] font-bold text-orange-600 mt-1">
                    현재: {item.quantity}개 / 최소: {item.min_quantity}개
                  </p>
                </div>
                <span className="px-3 py-1 bg-orange-600 text-white rounded-full text-[9px] font-black">재고부족</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white p-6 md:p-10 border border-gray-100 shadow-xl rounded-[2.5rem]">
        <h3 className="text-xl font-black text-gray-900 tracking-tighter italic mb-8">발주 이력 및 상태</h3>
        {purchaseOrders.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-[2rem] border border-dashed border-gray-200">
            <p className="text-sm font-black text-gray-400">발주 이력이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {purchaseOrders.map((order: any) => (
              <div key={order.id} className="p-8 border border-gray-100 rounded-[2rem] hover:shadow-lg transition-all bg-white">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <p className="text-lg font-black text-gray-900">발주서 #{order.id?.toString().slice(0, 8)}</p>
                    <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-widest">
                      {new Date(order.created_at).toLocaleDateString()} | {order.supplier_name || '미지정'}
                    </p>
                  </div>
                  <span className={`px-4 py-2 rounded-xl text-[10px] font-black ${
                    order.status === '승인' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
                  }`}>
                    {order.status}
                  </span>
                </div>
                <div className="bg-gray-50 p-6 rounded-2xl mb-6">
                  <div className="space-y-2">
                    {(order.items || []).map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-xs font-bold text-gray-600">
                        <span>{item.name}</span>
                        <span>{item.qty}개 × ₩{(item.unit_price || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
                    <span className="text-xs font-black text-gray-900">총 발주액</span>
                    <span className="text-lg font-black text-blue-600">₩{(order.total_amount || 0).toLocaleString()}</span>
                  </div>
                </div>
                {order.status === '대기' && (
                  <button onClick={() => handleApprovePurchaseOrder(order.id)} className="w-full py-4 bg-green-600 text-white rounded-xl font-black text-xs shadow-lg hover:scale-[0.98] transition-all">✅ 발주 승인하기</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getItemMinQuantity, getItemName, getItemQuantity, getItemUnitPrice, getRecommendedOrderQuantity } from '@/app/main/inventory-utils';

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
    const items = inventory.filter((item: any) => getItemQuantity(item) <= getItemMinQuantity(item));
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
          name: getItemName(item),
          qty: getRecommendedOrderQuantity(item),
          unit_price: getItemUnitPrice(item)
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
      <div className="bg-white p-6 md:p-10 border border-[var(--toss-border)] shadow-xl rounded-[2.5rem]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--foreground)] tracking-tight">스마트 발주 제어 시스템</h2>
          </div>
          <button
            onClick={handleAutoGeneratePurchaseOrder}
            disabled={loading || lowStockItems.length === 0}
            className="w-full md:w-auto px-8 py-4 bg-orange-600 text-white rounded-[12px] text-sm font-semibold shadow-xl shadow-orange-100 hover:scale-[0.98] transition-all disabled:opacity-50"
          >
            🚨 자동 발주 생성 ({lowStockItems.length})
          </button>
        </div>

        {lowStockItems.length === 0 ? (
          <div className="text-center py-20 bg-green-50 rounded-[16px] border border-dashed border-green-200">
            <p className="text-sm font-semibold text-green-600">✅ 모든 품목이 안전재고 이상입니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {lowStockItems.map((item: any) => (
              <div key={item.id} className="p-6 bg-orange-50 border border-orange-100 rounded-[12px] flex justify-between items-center">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{getItemName(item)}</p>
                  <p className="text-[11px] font-bold text-orange-600 mt-1">
                    현재: {getItemQuantity(item)}개 / 최소: {getItemMinQuantity(item)}개
                  </p>
                </div>
                <span className="px-3 py-1 bg-orange-600 text-white rounded-full text-[11px] font-semibold">재고부족</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white p-6 md:p-10 border border-[var(--toss-border)] shadow-xl rounded-[2.5rem]">
        <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight mb-8">발주 이력 및 상태</h3>
        {purchaseOrders.length === 0 ? (
          <div className="text-center py-20 bg-[var(--toss-gray-1)] rounded-[16px] border border-dashed border-[var(--toss-border)]">
            <p className="text-sm font-semibold text-[var(--toss-gray-3)]">발주 이력이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {purchaseOrders.map((order: any) => (
              <div key={order.id} className="p-8 border border-[var(--toss-border)] rounded-[16px] hover:shadow-lg transition-all bg-white">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <p className="text-lg font-semibold text-[var(--foreground)]">발주서 #{order.id?.toString().slice(0, 8)}</p>
                    <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1 uppercase tracking-widest">
                      {new Date(order.created_at).toLocaleDateString()} | {order.supplier_name || '미지정'}
                    </p>
                  </div>
                  <span className={`px-4 py-2 rounded-[16px] text-[11px] font-semibold ${
                    order.status === '승인' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
                  }`}>
                    {order.status}
                  </span>
                </div>
                <div className="bg-[var(--toss-gray-1)] p-6 rounded-[12px] mb-6">
                  <div className="space-y-2">
                    {(order.items || []).map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-xs font-bold text-[var(--toss-gray-4)]">
                        <span>{item.name}</span>
                        <span>{item.qty}개 × ₩{(item.unit_price || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-[var(--toss-border)] flex justify-between items-center">
                    <span className="text-xs font-semibold text-[var(--foreground)]">총 발주액</span>
                    <span className="text-lg font-semibold text-[var(--toss-blue)]">₩{(order.total_amount || 0).toLocaleString()}</span>
                  </div>
                </div>
                {order.status === '대기' && (
                  <button onClick={() => handleApprovePurchaseOrder(order.id)} className="w-full py-4 bg-green-600 text-white rounded-[16px] font-semibold text-xs shadow-lg hover:scale-[0.98] transition-all">✅ 발주 승인하기</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


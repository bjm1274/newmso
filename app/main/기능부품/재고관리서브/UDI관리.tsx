'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function UDIManagement({ user, inventory, fetchInventory }: any) {
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  // UDI 대상 품목 필터링 (is_udi 필드 사용)
  const udiItems = inventory.filter((item: any) => item.is_udi);

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => 
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === udiItems.length) setSelectedItems([]);
    else setSelectedItems(udiItems.map((item: any) => item.id));
  };

  const generateUDIReport = async () => {
    if (selectedItems.length === 0) return alert('보고할 품목을 선택해주세요.');
    setLoading(true);
    try {
      const reportItems = udiItems.filter((item: any) => selectedItems.includes(item.id));
      const reportData = {
        report_date: new Date().toISOString(),
        reporter_id: user.id,
        items: reportItems.map((item: any) => ({
          name: item.item_name,
          quantity: item.quantity,
          lot_number: item.lot_number || 'N/A',
          expiry_date: item.expiry_date || 'N/A',
          supplier: item.supplier_name || '미등록',
          unit_price: item.unit_price || 0
        })),
        total_items: reportItems.length,
        status: '생성완료'
      };

      // CSV 다운로드
      const headers = ['품목명', '수량', 'LOT번호', '유효기간', '공급업체', '단가'];
      const rows = reportData.items.map((item: any) => [
        item.name, item.quantity, item.lot_number, item.expiry_date, item.supplier, item.unit_price
      ]);
      const csvContent = [headers.join(','), ...rows.map((row: any[]) => row.join(','))].join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `UDI_공급내역보고_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();

      alert(`UDI 공급내역 보고서가 생성되었습니다.\n대상 품목: ${reportItems.length}개`);
      setSelectedItems([]);
    } catch (err) {
      alert('보고서 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="bg-[var(--card)] p-4 border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)]">의료기기 공급내역 보고 (UDI)</h2>
            <p className="text-[11px] text-purple-600 font-bold mt-0.5 uppercase tracking-widest">Medical Device Supply Reporting</p>
          </div>
          <button
            onClick={generateUDIReport}
            disabled={loading || selectedItems.length === 0}
            className="w-full md:w-auto px-4 py-2 bg-purple-600 text-white rounded-[var(--radius-md)] text-sm font-semibold shadow-sm hover:opacity-90 transition-all disabled:opacity-50"
          >
            보고서 생성 ({selectedItems.length})
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-purple-50 p-3 rounded-[var(--radius-md)] border border-purple-100">
            <p className="text-[11px] font-semibold text-purple-500 uppercase tracking-widest mb-0.5">UDI 대상 품목</p>
            <p className="text-lg font-bold text-purple-700">{udiItems.length}개</p>
          </div>
          <div className="bg-blue-50 p-3 rounded-[var(--radius-md)] border border-blue-100">
            <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-widest mb-0.5">선택된 품목</p>
            <p className="text-lg font-bold text-blue-700">{selectedItems.length}개</p>
          </div>
          <div className="bg-green-50 p-3 rounded-[var(--radius-md)] border border-green-100">
            <p className="text-[11px] font-semibold text-green-500 uppercase tracking-widest mb-0.5">총 자산가치</p>
            <p className="text-lg font-bold text-green-700">
              ₩{udiItems.reduce((sum: number, item: any) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0).toLocaleString()}
            </p>
          </div>
        </div>

        {udiItems.length === 0 ? (
          <div className="text-center py-20 bg-[var(--muted)] rounded-[var(--radius-lg)] border border-dashed border-[var(--border)]">
            <p className="text-sm font-semibold text-[var(--toss-gray-3)]">UDI 보고 대상 품목이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-3 pb-3 border-b border-[var(--border)]">
              <input type="checkbox" checked={selectedItems.length === udiItems.length} onChange={toggleSelectAll} className="w-5 h-5 accent-purple-600 rounded-[var(--radius-md)] cursor-pointer" />
              <span className="text-xs font-semibold text-[var(--foreground)]">전체 선택</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {udiItems.map((item: any) => (
                <div
                  key={item.id}
                  onClick={() => toggleItemSelection(item.id)}
                  className={`p-3 rounded-[var(--radius-md)] border-2 transition-all cursor-pointer ${
                    selectedItems.includes(item.id) ? 'bg-purple-50 border-purple-600 shadow-sm shadow-purple-50' : 'bg-[var(--card)] border-[var(--border)] hover:border-purple-200'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <input type="checkbox" checked={selectedItems.includes(item.id)} onChange={() => {}} className="w-6 h-6 mt-1 accent-purple-600 rounded-[var(--radius-md)]" />
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="col-span-2 md:col-span-1">
                        <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">제품명</p>
                        <p className="text-sm font-semibold text-[var(--foreground)]">{item.item_name}</p>
                        <p className="text-[11px] font-bold text-purple-500 mt-1">{item.company}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">현재고</p>
                        <p className="text-sm font-semibold text-[var(--accent)]">{item.quantity}개</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">LOT번호</p>
                        <p className="text-sm font-semibold text-[var(--foreground)]">{item.lot_number || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">유효기간</p>
                        <p className="text-sm font-semibold text-[var(--foreground)]">{item.expiry_date || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

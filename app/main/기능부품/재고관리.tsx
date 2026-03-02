'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import UDIManagement from './재고관리서브/UDI관리';
import StatementManagement from './재고관리서브/명세서관리';
import PurchaseOrderManagement from './재고관리서브/발주관리';
import ScanModule from './재고관리서브/스캔모듈완성';
import PhotoModule from './재고관리서브/촬영모듈';
import ProductRegistration from './재고관리서브/물품등록';
import { useInventoryAlertSystem, InventoryAlertBadge } from './재고관리서브/재고알림시스템';

export default function IntegratedInventoryManagement({ user }: any) {
  const [activeTab, setActiveTab] = useState('현황');
  const [inventory, setInventory] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCo, setSelectedCo] = useState('전체');
  const [selectedDept, setSelectedDept] = useState('전체');
  const [notifications, setNotifications] = useState<any[]>([]);

  // 재고 알림 시스템 활성화
  const { lowStockItems, expiryImminentItems } = useInventoryAlertSystem(inventory, user);

  useEffect(() => {
    fetchData();
    fetchNotifications();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchInventory(), fetchSuppliers()]);
    setLoading(false);
  };

  const fetchInventory = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*, suppliers(name)')
        .order('name');
      if (error) throw error;
      setInventory(data || []);
    } catch (err) {
      console.error('재고 조회 실패 상세:', JSON.stringify(err, null, 2));
    }
  };

  const fetchSuppliers = async () => {
    try {
      const { data, error } = await supabase.from('suppliers').select('*').order('name');
      if (error) throw error;
      setSuppliers(data || []);
    } catch (err) {
      console.error('거래처 조회 실패:', err);
    }
  };

  const fetchNotifications = async () => {
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .is('read_at', null);
      if (data) setNotifications(data);
    } catch (err) {
      console.error('알림 조회 실패:', err);
    }
  };

  // 물품 부서이동 완료 처리
  const handleMoveComplete = async (notif: any) => {
    if (!confirm("물품 부서 이동을 완료 처리하시겠습니까? 해당 수량만큼 재고가 차감됩니다.")) return;

    const { items } = notif.metadata;
    let successCount = 0;

    for (const item of items) {
      const { data: inv } = await supabase.from('inventory').select('stock').eq('name', item.name).single();
      if (inv) {
        const newStock = inv.stock - item.qty;
        const { error } = await supabase.from('inventory').update({ stock: newStock }).eq('name', item.name);
        if (!error) {
          await supabase.from('inventory_logs').insert([{
            item_id: item.name,
            type: '부서이동완료',
            qty: item.qty,
            worker_id: user.id,
            dept: item.dept
          }]);
          successCount++;
        }
      }
    }

    if (successCount > 0) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notif.id);
      alert(`${successCount}건의 물품 이동 처리가 완료되었습니다.`);
      fetchNotifications();
      fetchInventory();
    }
  };

  const tabs = [
    { id: '현황', icon: '📊', label: '현황' },
    { id: 'UDI', icon: '📡', label: 'UDI' },
    { id: '명세서', icon: '📄', label: '명세서' },
    { id: '발주', icon: '📝', label: '발주' },
    { id: '스캔', icon: '📱', label: '스캔' },
    { id: '촬영', icon: '📷', label: '촬영' },
    { id: '등록', icon: '+', label: '등록' }
  ];

  const companies = ['전체', '박철홍정형외과', '수연의원', 'SY INC.'];
  const hospitalDepts = ['전체', '진료부', '병동팀', '수술팀', '외래팀', '검사팀', '총무팀', '원무팀', '관리팀', '영양팀'];

  const filteredInventory = inventory.filter(item => {
    const coMatch = selectedCo === '전체' || item.company === selectedCo;
    const deptMatch = selectedDept === '전체' || item.department === selectedDept;
    return coMatch && deptMatch;
  });

  return (
    <div className="flex flex-col h-full bg-[var(--tab-bg)] overflow-hidden">
      {/* 알림 배지 */}
      <InventoryAlertBadge lowCount={lowStockItems.length} expiryCount={expiryImminentItems.length} />

      {/* 탭 네비게이션 */}
      <div className="flex bg-[var(--toss-card)] border-b border-[var(--toss-border)] px-6 py-2 gap-2 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-[16px] text-sm font-semibold transition-all whitespace-nowrap ${activeTab === tab.id
                ? 'bg-[var(--toss-blue)] text-white shadow-lg'
                : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]/80'
              }`}
          >
            <span className="text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--toss-blue)]"></div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* 행정팀 물품이동 알림 섹션 */}
            {user.department === '행정팀' && notifications.length > 0 && (
              <div className="bg-orange-50 border-2 border-orange-200 rounded-[12px] p-6 space-y-4">
                <h3 className="font-semibold text-orange-700 flex items-center gap-2">🚚 물품 이동 대기 중 ({notifications.length})</h3>
                <div className="space-y-3">
                  {notifications.map(n => (
                    <div key={n.id} className="bg-[var(--toss-card)] p-4 rounded-[16px] shadow-sm border border-orange-100 flex justify-between items-center">
                      <div>
                        <p className="text-xs font-semibold text-[var(--foreground)]">{n.body}</p>
                        <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1">
                          {n.metadata.items.map((i: any) => `${i.name}(${i.qty}개/수령:${i.dept})`).join(', ')}
                        </p>
                      </div>
                      <button
                        onClick={() => handleMoveComplete(n)}
                        className="px-4 py-2 bg-orange-600 text-white text-[11px] font-semibold rounded-[12px] shadow-md hover:bg-orange-700 transition-all"
                      >
                        이동 완료 처리
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === '현황' && (
              <div className="space-y-6">
                {/* 필터 섹션 */}
                <div className="flex gap-4 items-center bg-[var(--toss-card)] p-4 rounded-[12px] border border-[var(--toss-border)] shadow-sm overflow-x-auto">
                  <div className="flex gap-2 shrink-0">
                    <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase self-center mr-2">🏢 회사별</span>
                    {companies.map(co => (
                      <button key={co} onClick={() => { setSelectedCo(co); setSelectedDept('전체'); }} className={`px-4 py-2 rounded-[16px] text-[11px] font-semibold transition-all ${selectedCo === co ? 'bg-[var(--toss-blue)] text-white shadow-md' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)]'}`}>{co}</button>
                    ))}
                  </div>
                  {selectedCo === '박철홍정형외과' && (
                    <div className="flex gap-2 shrink-0 border-l pl-4">
                      <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase self-center mr-2">🏥 부서별</span>
                      {hospitalDepts.map(dept => (
                        <button key={dept} onClick={() => setSelectedDept(dept)} className={`px-4 py-2 rounded-[16px] text-[11px] font-semibold transition-all ${selectedDept === dept ? 'bg-green-600 text-white shadow-md' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)]'}`}>{dept}</button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[var(--toss-card)] p-8 border border-[var(--toss-border)] shadow-sm rounded-[12px]">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-semibold text-[var(--foreground)]">📊 {selectedCo} {selectedDept !== '전체' ? `[${selectedDept}]` : ''} 재고 현황</h2>
                    <button onClick={fetchInventory} className="p-2 hover:bg-[var(--toss-gray-1)] rounded-full transition-all">🔄</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b-2 border-[var(--toss-border)]">
                          <th className="py-4 px-4 text-xs font-semibold text-[var(--toss-gray-3)] uppercase">품목명</th>
                          <th className="py-4 px-4 text-xs font-semibold text-[var(--toss-gray-3)] uppercase">분류</th>
                          <th className="py-4 px-4 text-xs font-semibold text-[var(--toss-gray-3)] uppercase">현재고</th>
                          <th className="py-4 px-4 text-xs font-semibold text-[var(--toss-gray-3)] uppercase">최소재고</th>
                          <th className="py-4 px-4 text-xs font-semibold text-[var(--toss-gray-3)] uppercase">상태</th>
                          <th className="py-4 px-4 text-xs font-semibold text-[var(--toss-gray-3)] uppercase">UDI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInventory.map((item: any) => (
                          <tr key={item.id} className="border-b border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)] transition-all">
                            <td className="py-4 px-4 font-semibold text-[var(--foreground)]">{item.name}</td>
                            <td className="py-4 px-4 text-sm font-bold text-[var(--toss-gray-3)]">{item.category}</td>
                            <td className="py-4 px-4 font-semibold text-[var(--foreground)]">{item.stock}</td>
                            <td className="py-4 px-4 text-sm font-bold text-[var(--toss-gray-3)]">{item.min_stock}</td>
                            <td className="py-4 px-4">
                              {item.stock <= item.min_stock ? (
                                <span className="px-3 py-1 bg-red-100 text-red-600 rounded-[12px] text-[11px] font-semibold">발주필요</span>
                              ) : (
                                <span className="px-3 py-1 bg-green-100 text-green-600 rounded-[12px] text-[11px] font-semibold">정상</span>
                              )}
                            </td>
                            <td className="py-4 px-4">
                              {item.is_udi_reportable && <span className="text-[var(--toss-blue)] font-semibold text-xs">REPORT</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'UDI' && <UDIManagement user={user} inventory={inventory} />}
            {activeTab === '명세서' && <StatementManagement user={user} suppliers={suppliers} fetchSuppliers={fetchSuppliers} />}
            {activeTab === '발주' && <PurchaseOrderManagement user={user} inventory={inventory} suppliers={suppliers} fetchInventory={fetchInventory} />}
            {activeTab === '스캔' && <ScanModule user={user} inventory={inventory} fetchInventory={fetchInventory} />}
            {activeTab === '촬영' && <PhotoModule user={user} inventory={inventory} fetchInventory={fetchInventory} />}
            {activeTab === '등록' && <ProductRegistration user={user} suppliers={suppliers} fetchInventory={fetchInventory} fetchSuppliers={fetchSuppliers} />}
          </div>
        )}
      </div>
    </div>
  );
}

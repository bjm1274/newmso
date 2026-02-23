'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdvancedInventoryManagement({ user }: any) {
  const [activeTab, setActiveTab] = useState('현황');
  const [inventory, setInventory] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [udiItems, setUdiItems] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showUDIReport, setShowUDIReport] = useState(false);
  const [showSupplierInvoice, setShowSupplierInvoice] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  // 폼 상태
  const [supplierForm, setSupplierForm] = useState({ name: '', contact: '', address: '', phone: '' });
  const [productForm, setProductForm] = useState({
    name: '', qty: 0, unit_price: 0, supplier_id: '', 
    expiry_date: '', lot_number: '', is_udi_reportable: false, category: ''
  });
  const [invoiceForm, setInvoiceForm] = useState({ supplier_id: '', invoice_date: '', items: [] });
  const [scanData, setScanData] = useState({ product_name: '', qty: 0, unit_price: 0, expiry_date: '', lot_number: '' });

  // 재고 조회
  const fetchInventory = async () => {
    const { data } = await supabase.from('inventory').select('*').order('name');
    if (data) setInventory(data as any);
  };

  // 거래처 조회
  const fetchSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('*');
    if (data) setSuppliers(data as any);
  };

  // UDI 대상 품목 조회
  const fetchUDIItems = async () => {
    const { data } = await supabase.from('inventory').select('*').eq('is_udi_reportable', true);
    if (data) setUdiItems(data as any);
  };

  // 발주 현황 조회
  const fetchPurchaseOrders = async () => {
    const { data } = await supabase.from('purchase_orders').select('*').order('created_at', { ascending: false });
    if (data) setPurchaseOrders(data as any);
  };

  useEffect(() => {
    fetchInventory();
    fetchSuppliers();
    fetchUDIItems();
    fetchPurchaseOrders();
  }, []);

  // 거래처 추가
  const handleAddSupplier = async () => {
    if (!supplierForm.name) return alert('거래처명을 입력해주세요.');
    
    setLoading(true);
    try {
      const { error } = await supabase.from('suppliers').insert([supplierForm]);
      if (!error) {
        alert('거래처가 등록되었습니다.');
        setSupplierForm({ name: '', contact: '', address: '', phone: '' });
        setShowNewSupplier(false);
        fetchSuppliers();
      }
    } catch (err) {
      console.error('거래처 등록 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  // 물품 등록
  const handleAddProduct = async () => {
    if (!productForm.name || !productForm.supplier_id) return alert('필수 정보를 입력해주세요.');

    setLoading(true);
    try {
      const { error } = await supabase.from('inventory').insert([{
        name: productForm.name,
        stock: productForm.qty,
        unit_price: productForm.unit_price,
        supplier_id: productForm.supplier_id,
        expiry_date: productForm.expiry_date,
        lot_number: productForm.lot_number,
        is_udi_reportable: productForm.is_udi_reportable,
        category: productForm.category,
        min_stock: Math.ceil(productForm.qty * 0.3) // 기본값: 현재 수량의 30%
      }]);

      if (!error) {
        alert('물품이 등록되었습니다.');
        setProductForm({ name: '', qty: 0, unit_price: 0, supplier_id: '', expiry_date: '', lot_number: '', is_udi_reportable: false, category: '' });
        setShowNewProduct(false);
        fetchInventory();
        fetchUDIItems();
      }
    } catch (err) {
      console.error('물품 등록 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  // 안전재고 미달 자동 발주
  const handleAutoGeneratePurchaseOrder = async () => {
    const itemsToOrder = inventory.filter(item => item.stock <= item.min_stock);
    
    if (itemsToOrder.length === 0) return alert('발주 대상 품목이 없습니다.');

    setLoading(true);
    try {
      const { error } = await supabase.from('purchase_orders').insert([{
        supplier_id: itemsToOrder[0].supplier_id,
        items: itemsToOrder.map(item => ({ item_id: item.id, name: item.name, qty: item.min_stock * 2, unit_price: item.unit_price })),
        status: '대기',
        created_at: new Date().toISOString(),
        created_by: user.id
      }]);

      if (!error) {
        alert('발주서가 생성되었습니다. 행정팀에 알림이 전송됩니다.');
        
        // 행정팀에 알림 전송
        await supabase.from('notifications').insert([{
          user_id: user.id,
          type: 'inventory',
          title: '안전재고 미달 - 발주 필요',
          body: `${itemsToOrder.length}개 품목의 재고가 안전재고 이하로 떨어졌습니다. 발주 승인을 요청합니다.`
        }]);

        fetchPurchaseOrders();
      }
    } catch (err) {
      console.error('발주서 생성 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  // 스캔 데이터 입고 처리 (추가 정보 확인)
  const handleProcessScanData = async () => {
    if (!scanData.product_name) return alert('제품명을 입력해주세요.');

    setLoading(true);
    try {
      const { data: existingProduct } = await supabase
        .from('inventory')
        .select('*')
        .eq('name', scanData.product_name)
        .single();

      if (existingProduct) {
        // 기존 제품: 수량 증가
        const newStock = existingProduct.stock + scanData.qty;
        await supabase
          .from('inventory')
          .update({ stock: newStock })
          .eq('id', existingProduct.id);

        alert(`${scanData.product_name} ${scanData.qty}개가 입고되었습니다.`);
      } else {
        // 새 제품: 등록 후 입고
        const { error } = await supabase.from('inventory').insert([{
          name: scanData.product_name,
          stock: scanData.qty,
          unit_price: scanData.unit_price,
          expiry_date: scanData.expiry_date,
          lot_number: scanData.lot_number,
          is_udi_reportable: false,
          category: '스캔등록'
        }]);

        if (!error) alert(`${scanData.product_name}이 신규 등록되어 입고되었습니다.`);
      }

      setScanData({ product_name: '', qty: 0, unit_price: 0, expiry_date: '', lot_number: '' });
      setShowScanDialog(false);
      fetchInventory();
    } catch (err) {
      console.error('입고 처리 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--toss-gray-1)]/30 overflow-y-auto custom-scrollbar space-y-8 p-8">
      <header>
        <h2 className="text-2xl font-semibold text-[var(--foreground)] tracking-tighter italic">고급 재고 관리</h2>
        <p className="text-xs text-[var(--toss-gray-3)] font-bold uppercase mt-1">UDI, 명세서, 발주, 스캔 통합 시스템</p>
      </header>

      {/* 탭 */}
      <div className="flex gap-2 flex-wrap bg-white p-4 rounded-[12px] border border-[var(--toss-border)] shadow-sm overflow-x-auto">
        {['현황', 'UDI보고', '명세서', '발주', '물품등록', '스캔입고'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 rounded-[16px] text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab
                ? 'bg-[var(--toss-blue)] text-white shadow-lg'
                : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 현황 탭 */}
      {activeTab === '현황' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-[12px] border border-[var(--toss-border)] shadow-sm text-center">
              <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">전체 품목</p>
              <p className="text-3xl font-semibold text-[var(--toss-blue)] mt-2">{inventory.length}</p>
            </div>
            <div className="bg-white p-6 rounded-[12px] border border-[var(--toss-border)] shadow-sm text-center">
              <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">UDI 대상</p>
              <p className="text-3xl font-semibold text-red-600 mt-2">{udiItems.length}</p>
            </div>
            <div className="bg-white p-6 rounded-[12px] border border-[var(--toss-border)] shadow-sm text-center">
              <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">안전재고 미달</p>
              <p className="text-3xl font-semibold text-orange-600 mt-2">
                {inventory.filter(i => i.stock <= i.min_stock).length}
              </p>
            </div>
            <div className="bg-white p-6 rounded-[12px] border border-[var(--toss-border)] shadow-sm text-center">
              <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">거래처</p>
              <p className="text-3xl font-semibold text-green-600 mt-2">{suppliers.length}</p>
            </div>
          </div>

          {/* 안전재고 미달 품목 */}
          <div className="bg-white p-8 border border-[var(--toss-border)] shadow-sm rounded-[12px] space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">⚠️ 안전재고 미달 품목</h3>
              <button
                onClick={handleAutoGeneratePurchaseOrder}
                className="px-6 py-3 bg-red-600 text-white rounded-[16px] text-xs font-semibold shadow-lg hover:scale-[0.98] transition-all"
              >
                자동 발주 생성
              </button>
            </div>

            <div className="space-y-2">
              {inventory.filter(i => i.stock <= i.min_stock).map((item, idx) => (
                <div key={item.id || idx} className="p-4 bg-red-50 border border-red-200 rounded-[16px] flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">{item.name}</p>
                    <p className="text-xs text-[var(--toss-gray-3)] font-bold">현재: {item.stock}개 | 최소: {item.min_stock}개</p>
                  </div>
                  <span className="px-3 py-1 bg-red-600 text-white rounded-[12px] text-xs font-semibold">부족</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* UDI 보고 탭 */}
      {activeTab === 'UDI보고' && (
        <div className="bg-white p-8 border border-[var(--toss-border)] shadow-sm rounded-[12px] space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-[var(--foreground)]">의료기기 공급내역 보고</h3>
            <button
              onClick={() => setShowUDIReport(!showUDIReport)}
              className="px-6 py-3 bg-[var(--toss-blue)] text-white rounded-[16px] text-xs font-semibold shadow-lg"
            >
              보고서 생성
            </button>
          </div>

          <div className="space-y-3">
            {udiItems.map((item, idx) => (
              <div key={item.id || idx} className="p-6 bg-blue-50 border border-blue-200 rounded-[12px]">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">제품명</p>
                    <p className="font-semibold text-[var(--foreground)] mt-1">{item.name}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">수량</p>
                    <p className="font-semibold text-[var(--foreground)] mt-1">{item.stock}개</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">LOT번호</p>
                    <p className="font-semibold text-[var(--foreground)] mt-1">{item.lot_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">유효기간</p>
                    <p className="font-semibold text-[var(--foreground)] mt-1">{item.expiry_date || '-'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 명세서 탭 */}
      {activeTab === '명세서' && (
        <div className="space-y-6">
          <button
            onClick={() => setShowNewSupplier(!showNewSupplier)}
            className="px-6 py-3 bg-black text-white rounded-[16px] text-xs font-semibold shadow-lg"
          >
            {showNewSupplier ? '✕ 취소' : '+ 거래처 추가'}
          </button>

          {showNewSupplier && (
            <div className="bg-white p-8 border border-[var(--toss-border)] shadow-sm rounded-[12px] space-y-4">
              <input
                value={supplierForm.name}
                onChange={e => setSupplierForm({...supplierForm, name: e.target.value})}
                placeholder="거래처명"
                className="w-full p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
              <input
                value={supplierForm.contact}
                onChange={e => setSupplierForm({...supplierForm, contact: e.target.value})}
                placeholder="담당자"
                className="w-full p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
              <input
                value={supplierForm.phone}
                onChange={e => setSupplierForm({...supplierForm, phone: e.target.value})}
                placeholder="전화번호"
                className="w-full p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
              <input
                value={supplierForm.address}
                onChange={e => setSupplierForm({...supplierForm, address: e.target.value})}
                placeholder="주소"
                className="w-full p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
              <button
                onClick={handleAddSupplier}
                disabled={loading}
                className="w-full py-4 bg-[var(--toss-blue)] text-white rounded-[16px] font-semibold text-sm shadow-lg disabled:opacity-50"
              >
                거래처 등록
              </button>
            </div>
          )}

          {/* 거래처 목록 */}
          <div className="space-y-3">
            {suppliers.map((supplier, idx) => (
              <div key={supplier.id || idx} className="bg-white p-6 border border-[var(--toss-border)] shadow-sm rounded-[12px]">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">{supplier.name}</p>
                    <p className="text-xs text-[var(--toss-gray-3)] font-bold mt-1">{supplier.contact} | {supplier.phone}</p>
                    <p className="text-xs text-[var(--toss-gray-3)] font-bold mt-1">{supplier.address}</p>
                  </div>
                  <button className="px-4 py-2 bg-[var(--toss-blue-light)] text-[var(--toss-blue)] rounded-[12px] text-xs font-semibold">
                    명세서 생성
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 발주 탭 */}
      {activeTab === '발주' && (
        <div className="space-y-4">
          {purchaseOrders.map((order, idx) => (
            <div key={order.id || idx} className="bg-white p-6 border border-[var(--toss-border)] shadow-sm rounded-[12px]">
              <div className="flex justify-between items-center mb-4">
                <p className="font-semibold text-[var(--foreground)]">발주 #{order.id?.slice(0, 8)}</p>
                <span className={`px-3 py-1 rounded-[12px] text-xs font-semibold ${
                  order.status === '승인' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-500'
                }`}>
                  {order.status}
                </span>
              </div>
              <p className="text-xs text-[var(--toss-gray-3)] font-bold">{new Date(order.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* 물품등록 탭 */}
      {activeTab === '물품등록' && (
        <div className="space-y-6">
          <button
            onClick={() => setShowNewProduct(!showNewProduct)}
            className="px-6 py-3 bg-black text-white rounded-[16px] text-xs font-semibold shadow-lg"
          >
            {showNewProduct ? '✕ 취소' : '+ 새 물품 등록'}
          </button>

          {showNewProduct && (
            <div className="bg-white p-8 border border-[var(--toss-border)] shadow-sm rounded-[12px] space-y-4">
              <input
                value={productForm.name}
                onChange={e => setProductForm({...productForm, name: e.target.value})}
                placeholder="제품명"
                className="w-full p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  value={productForm.qty}
                  onChange={e => setProductForm({...productForm, qty: parseInt(e.target.value) || 0})}
                  placeholder="수량"
                  className="p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                />
                <input
                  type="number"
                  value={productForm.unit_price}
                  onChange={e => setProductForm({...productForm, unit_price: parseInt(e.target.value) || 0})}
                  placeholder="단가"
                  className="p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                />
              </div>
              <select
                value={productForm.supplier_id}
                onChange={e => setProductForm({...productForm, supplier_id: e.target.value})}
                className="w-full p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              >
                <option value="">거래처 선택</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input
                type="date"
                value={productForm.expiry_date}
                onChange={e => setProductForm({...productForm, expiry_date: e.target.value})}
                placeholder="유효기간"
                className="w-full p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
              <input
                value={productForm.lot_number}
                onChange={e => setProductForm({...productForm, lot_number: e.target.value})}
                placeholder="LOT번호"
                className="w-full p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={productForm.is_udi_reportable}
                  onChange={e => setProductForm({...productForm, is_udi_reportable: e.target.checked})}
                  className="w-4 h-4"
                />
                <label className="text-sm font-semibold text-[var(--foreground)]">공급내역 보고 대상</label>
              </div>
              <button
                onClick={handleAddProduct}
                disabled={loading}
                className="w-full py-4 bg-[var(--toss-blue)] text-white rounded-[16px] font-semibold text-sm shadow-lg disabled:opacity-50"
              >
                물품 등록
              </button>
            </div>
          )}
        </div>
      )}

      {/* 스캔입고 탭 */}
      {activeTab === '스캔입고' && (
        <div className="space-y-6">
          <button
            onClick={() => setShowScanDialog(!showScanDialog)}
            className="px-6 py-3 bg-black text-white rounded-[16px] text-xs font-semibold shadow-lg"
          >
            {showScanDialog ? '✕ 취소' : '📸 스캔 입고'}
          </button>

          {showScanDialog && (
            <div className="bg-white p-8 border border-[var(--toss-border)] shadow-sm rounded-[12px] space-y-4">
              <p className="text-sm font-bold text-[var(--toss-gray-4)]">명세서 스캔 또는 바코드 촬영 후 정보를 확인하세요.</p>
              <input
                value={scanData.product_name}
                onChange={e => setScanData({...scanData, product_name: e.target.value})}
                placeholder="제품명 (OCR 인식 또는 수동 입력)"
                className="w-full p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  value={scanData.qty}
                  onChange={e => setScanData({...scanData, qty: parseInt(e.target.value) || 0})}
                  placeholder="수량"
                  className="p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                />
                <input
                  type="number"
                  value={scanData.unit_price}
                  onChange={e => setScanData({...scanData, unit_price: parseInt(e.target.value) || 0})}
                  placeholder="단가"
                  className="p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                />
              </div>
              <input
                type="date"
                value={scanData.expiry_date}
                onChange={e => setScanData({...scanData, expiry_date: e.target.value})}
                placeholder="유효기간 (추가 입력)"
                className="w-full p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
              <input
                value={scanData.lot_number}
                onChange={e => setScanData({...scanData, lot_number: e.target.value})}
                placeholder="LOT번호 (추가 입력)"
                className="w-full p-4 bg-[var(--toss-gray-1)] rounded-[16px] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
              <button
                onClick={handleProcessScanData}
                disabled={loading}
                className="w-full py-4 bg-[var(--toss-blue)] text-white rounded-[16px] font-semibold text-sm shadow-lg disabled:opacity-50"
              >
                입고 처리
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

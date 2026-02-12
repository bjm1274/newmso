'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const PRESET_HOSPITAL = { 
  reg_num: '000-00-00000', 
  sangho: '박철홍정형외과', 
  ceo: '박철홍', 
  addr: '전라남도 목포시', 
  phone: '061-000-0000', 
  status: '보건업', 
  type: '정형외과' 
};

export default function InvoiceManagement({ user, inventory, suppliers, fetchSuppliers }: any) {
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customPresets, setCustomPresets] = useState<any[]>([]);
  
  const [supplierForm, setSupplierForm] = useState({ 
    name: '',
    contact: '',
    address: '',
    phone: '',
    email: '',
    reg_num: '',
    ceo: '',
  });

  const [invoiceData, setInvoiceData] = useState({
    date: new Date().toISOString().split('T')[0],
    supplier: { ...PRESET_HOSPITAL },
    receiver: { reg_num: '', sangho: '', ceo: '', addr: '', phone: '' },
    items: [] as any[]
  });

  const [focusedRow, setFocusedRow] = useState<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('invoice_partners');
    if (saved) setCustomPresets(JSON.parse(saved));
  }, []);

  const handleAddSupplier = async () => {
    if (!supplierForm.name) return alert('거래처명을 입력해주세요.');
    setLoading(true);
    try {
      const { error } = await supabase.from('suppliers').insert([supplierForm]);
      if (!error) {
        alert('거래처가 등록되었습니다.');
        setSupplierForm({ name: '', contact: '', address: '', phone: '', email: '', reg_num: '', ceo: '' });
        setShowNewSupplier(false);
        fetchSuppliers();
      }
    } catch (err) {
      alert('거래처 등록에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (role: 'supplier' | 'receiver', data: any) => {
    setInvoiceData(prev => ({ ...prev, [role]: { ...data } }));
  };

  const addRow = () => {
    setInvoiceData(prev => ({
      ...prev,
      items: [...prev.items, { name: '', spec: '', qty: 0, price: 0, supply_price: 0, tax: 0 }]
    }));
  };

  const selectItem = (index: number, item: any) => {
    const newItems = [...invoiceData.items];
    newItems[index] = { 
      ...newItems[index], 
      name: item.item_name, 
      spec: item.category || '', 
      price: item.unit_price || 0,
      qty: newItems[index].qty || 1
    };
    newItems[index].supply_price = newItems[index].qty * newItems[index].price;
    newItems[index].tax = Math.floor(newItems[index].supply_price * 0.1);
    setInvoiceData({ ...invoiceData, items: newItems });
    setFocusedRow(null);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...invoiceData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'qty' || field === 'price') {
      newItems[index].supply_price = (Number(newItems[index].qty) || 0) * (Number(newItems[index].price) || 0);
      newItems[index].tax = Math.floor(newItems[index].supply_price * 0.1);
    }
    setInvoiceData({ ...invoiceData, items: newItems });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-6 md:p-10 border border-gray-100 shadow-xl rounded-[2.5rem]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tighter italic">거래처 및 명세서 관리</h2>
            <p className="text-[10px] text-green-600 font-bold mt-1 uppercase tracking-widest">Supplier & Invoice Control</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => setShowNewSupplier(!showNewSupplier)} className="flex-1 md:flex-none px-6 py-3 bg-green-600 text-white rounded-xl text-xs font-black shadow-lg hover:scale-[0.98] transition-all">+ 거래처 추가</button>
            <button onClick={() => setShowInvoiceForm(!showInvoiceForm)} className="flex-1 md:flex-none px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black shadow-lg hover:scale-[0.98] transition-all">📄 명세서 작성</button>
          </div>
        </div>

        {showNewSupplier && (
          <div className="bg-gray-50 p-6 rounded-[2rem] space-y-4 mb-8 border border-gray-100 animate-in slide-in-from-top-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                value={supplierForm.name}
                onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
                placeholder="거래처명 *"
                className="p-4 bg-white rounded-xl border border-gray-100 outline-none text-sm font-black focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.ceo}
                onChange={e => setSupplierForm({ ...supplierForm, ceo: e.target.value })}
                placeholder="대표자 이름"
                className="p-4 bg-white rounded-xl border border-gray-100 outline-none text-sm font-black focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.reg_num}
                onChange={e => setSupplierForm({ ...supplierForm, reg_num: e.target.value })}
                placeholder="사업자등록번호 (예: 000-00-00000)"
                className="p-4 bg-white rounded-xl border border-gray-100 outline-none text-sm font-black focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.contact}
                onChange={e => setSupplierForm({ ...supplierForm, contact: e.target.value })}
                placeholder="담당자"
                className="p-4 bg-white rounded-xl border border-gray-100 outline-none text-sm font-black focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.phone}
                onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                placeholder="전화번호"
                className="p-4 bg-white rounded-xl border border-gray-100 outline-none text-sm font-black focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.email}
                onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })}
                placeholder="이메일"
                className="p-4 bg-white rounded-xl border border-gray-100 outline-none text-sm font-black focus:ring-2 focus:ring-green-100"
              />
            </div>
            <input
              value={supplierForm.address}
              onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })}
              placeholder="주소"
              className="w-full p-4 bg-white rounded-xl border border-gray-100 outline-none text-sm font-black focus:ring-2 focus:ring-green-100"
            />
            <button
              onClick={handleAddSupplier}
              disabled={loading}
              className="w-full py-4 bg-green-600 text-white rounded-xl font-black text-sm shadow-lg disabled:opacity-50"
            >
              거래처 등록하기
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((supplier: any) => (
            <div key={supplier.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
              <p className="font-black text-gray-900 text-sm">{supplier.name}</p>
              <div className="mt-3 space-y-1">
                <p className="text-[10px] text-gray-400 font-bold flex items-center gap-2">👤 {supplier.contact || '-'}</p>
                <p className="text-[10px] text-gray-400 font-bold flex items-center gap-2">📞 {supplier.phone || '-'}</p>
                <p className="text-[10px] text-gray-400 font-bold flex items-center gap-2 truncate">📍 {supplier.address || '-'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showInvoiceForm && (
        <div className="bg-white p-6 md:p-10 border border-gray-100 shadow-2xl rounded-[2.5rem] animate-in slide-in-from-bottom-10">
          <div className="flex justify-between items-center mb-6 border-b border-gray-50 pb-4">
            <div>
              <h3 className="text-xl font-black text-gray-900 tracking-tighter italic">거래명세서 작성 엔진</h3>
              <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-widest">
                발행일자 및 공급자/공급받는자 정보를 선택하세요
              </p>
            </div>
            <button onClick={() => setShowInvoiceForm(false)} className="text-gray-300 hover:text-red-500 text-2xl">✕</button>
          </div>
          
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-[11px] text-gray-500 font-bold">
                <span className="mr-1">📅 발행일자</span>
                <span className="text-gray-400">(세금계산서/명세서 기준일)</span>
              </div>
              <input
                type="date"
                value={invoiceData.date}
                onChange={(e) =>
                  setInvoiceData((prev: any) => ({
                    ...prev,
                    date: e.target.value,
                  }))
                }
                className="w-full md:w-48 p-3 bg-gray-50 rounded-xl border border-gray-100 outline-none text-xs font-black text-gray-800 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100">
                <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-4">공급자 정보 (업체 선택)</p>
                <select
                  value={invoiceData.supplier.sangho || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '__HOSPITAL__') {
                      applyPreset('supplier', { ...PRESET_HOSPITAL });
                    } else {
                      const s = suppliers.find((sup: any) => String(sup.id) === value);
                      if (s)
                        applyPreset('supplier', {
                          reg_num: s.reg_num || '',
                          sangho: s.name,
                          ceo: s.ceo || s.contact || '',
                          addr: s.address,
                          phone: s.phone,
                        });
                    }
                  }}
                  className="w-full p-3 bg-white rounded-xl border border-blue-100 outline-none font-black text-xs mb-4"
                >
                  <option value="">공급자 선택</option>
                  <option value="__HOSPITAL__">본원 (박철홍정형외과)</option>
                  {suppliers.map((s: any) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="space-y-1 text-[11px] font-bold text-gray-700">
                  <p>상호: {invoiceData.supplier.sangho || '-'}</p>
                  <p>사업자등록번호: {invoiceData.supplier.reg_num || '-'}</p>
                  <p>대표자: {invoiceData.supplier.ceo || '-'}</p>
                  <p>전화: {invoiceData.supplier.phone || '-'}</p>
                  <p>주소: {invoiceData.supplier.addr || '-'}</p>
                </div>
              </div>
              <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">공급받는자 정보 (업체 선택)</p>
                <select
                  value={invoiceData.receiver.sangho || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '__HOSPITAL__') {
                      applyPreset('receiver', { ...PRESET_HOSPITAL });
                    } else {
                      const s = suppliers.find((sup: any) => String(sup.id) === value);
                      if (s)
                        applyPreset('receiver', {
                          reg_num: s.reg_num || '',
                          sangho: s.name,
                          ceo: s.ceo || s.contact || '',
                          addr: s.address,
                          phone: s.phone,
                        });
                    }
                  }}
                  className="w-full p-3 bg-white rounded-xl border border-gray-100 outline-none font-black text-xs mb-4"
                >
                  <option value="">거래처 선택</option>
                  <option value="__HOSPITAL__">본원 (박철홍정형외과)</option>
                  {suppliers.map((s: any) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="space-y-1 text-[11px] font-bold text-gray-700">
                  <p>상호: {invoiceData.receiver.sangho || '-'}</p>
                  <p>사업자등록번호: {invoiceData.receiver.reg_num || '-'}</p>
                  <p>대표자: {invoiceData.receiver.ceo || '-'}</p>
                  <p>전화: {invoiceData.receiver.phone || '-'}</p>
                  <p>주소: {invoiceData.receiver.addr || '-'}</p>
                </div>
              </div>
            </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">품목 리스트</p>
                  <button onClick={addRow} className="text-[10px] font-black text-blue-600 hover:underline">
                    + 품목 추가
                  </button>
                </div>
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-100">
                        <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase">품목명</th>
                        <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase text-center">수량</th>
                        <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase text-right">단가</th>
                        <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase text-right">공급가액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {invoiceData.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-4 py-3 relative">
                            <input
                              value={item.name}
                              onChange={(e) => updateItem(idx, 'name', e.target.value)}
                              onFocus={() => setFocusedRow(idx)}
                              placeholder="품목 선택/입력"
                              className="w-full px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 outline-none text-xs font-black text-gray-800 focus:bg-white focus:ring-2 focus:ring-blue-100"
                            />
                            {focusedRow === idx && (
                              <div className="absolute left-0 top-full w-full bg-white border border-gray-100 shadow-2xl z-50 rounded-xl max-h-40 overflow-y-auto">
                                {inventory
                                  .filter((i: any) => i.item_name.includes(item.name))
                                  .map((i: any) => (
                                    <button
                                      key={i.id}
                                      onClick={() => selectItem(idx, i)}
                                      className="w-full text-left p-3 text-[10px] font-bold hover:bg-blue-50 border-b border-gray-50"
                                    >
                                      {i.item_name}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              value={item.qty}
                              onChange={(e) => updateItem(idx, 'qty', e.target.value)}
                              className="w-20 px-2 py-2 bg-gray-50 rounded-lg border border-gray-200 outline-none text-xs font-black text-center text-gray-800 focus:bg-white focus:ring-2 focus:ring-blue-100"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              value={item.price}
                              onChange={(e) => updateItem(idx, 'price', e.target.value)}
                              className="w-24 px-2 py-2 bg-gray-50 rounded-lg border border-gray-200 outline-none text-xs font-black text-right text-gray-800 focus:bg-white focus:ring-2 focus:ring-blue-100"
                            />
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-black text-gray-900">
                            {(item.supply_price || 0).toLocaleString()}원
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            <div className="flex justify-end pt-6 border-t border-gray-50">
              <div className="text-right">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">최종 합계액</p>
                <p className="text-2xl font-black text-blue-600 tracking-tighter">
                  {invoiceData.items.reduce((sum, item) => sum + (item.supply_price || 0), 0).toLocaleString()}원
                </p>
              </div>
            </div>

            <button onClick={() => window.print()} className="w-full py-5 bg-gray-900 text-white rounded-2xl font-black text-sm shadow-xl hover:bg-black transition-all">🖨️ 명세서 인쇄 및 발행</button>
          </div>
        </div>
      )}
    </div>
  );
}

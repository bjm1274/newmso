'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const PRESET_HOSPITAL = { 
  reg_num: '000-00-00000', 
  sangho: '박철홍정형외과', 
  ceo: '박철홍', 
  addr: '전라남도 목포시', 
  phone: '061-000-0000', 
  contact: '',
  email: '',
  status: '보건업', 
  type: '정형외과' 
};

export default function InvoiceManagement({ user, inventory, suppliers, fetchSuppliers }: any) {
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
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
    receiver: { reg_num: '', sangho: '', ceo: '', addr: '', phone: '', contact: '', email: '' },
    items: [] as any[]
  });

  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('invoice_partners');
    if (saved) setCustomPresets(JSON.parse(saved));
  }, []);

  const handleAddSupplier = async () => {
    if (!supplierForm.name) return alert('거래처명을 입력해주세요.');
    setLoading(true);
    try {
      const { error } = await supabase.from('suppliers').insert([supplierForm]);
      if (error) {
        console.error('suppliers insert error', error);
        alert(`거래처 등록에 실패했습니다.\n\n${error.message || ''}`);
      } else {
        alert('거래처가 등록되었습니다.');
        setSupplierForm({ name: '', contact: '', address: '', phone: '', email: '', reg_num: '', ceo: '' });
        setShowNewSupplier(false);
        fetchSuppliers();
      }
    } catch (err: any) {
      console.error('handleAddSupplier error', err);
      alert(`거래처 등록에 실패했습니다.\n\n${err?.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  const startEditSupplier = (supplier: any) => {
    setEditingSupplier({
      id: supplier.id,
      name: supplier.name || '',
      contact: supplier.contact || '',
      address: supplier.address || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      reg_num: supplier.reg_num || '',
      ceo: supplier.ceo || '',
    });
  };

  const handleUpdateSupplier = async () => {
    if (!editingSupplier?.id) return;
    if (!editingSupplier.name) return alert('거래처명을 입력해주세요.');
    setEditLoading(true);
    try {
      const payload = {
        name: editingSupplier.name,
        contact: editingSupplier.contact,
        address: editingSupplier.address,
        phone: editingSupplier.phone,
        email: editingSupplier.email,
        reg_num: editingSupplier.reg_num,
        ceo: editingSupplier.ceo,
      };
      const { error } = await supabase.from('suppliers').update(payload).eq('id', editingSupplier.id);
      if (error) {
        console.error('suppliers update error', error);
        alert(`거래처 수정에 실패했습니다.\n\n${error.message || ''}`);
      } else {
        alert('거래처 정보가 수정되었습니다.');
        setEditingSupplier(null);
        fetchSuppliers();
      }
    } catch (err: any) {
      console.error('handleUpdateSupplier error', err);
      alert(`거래처 수정에 실패했습니다.\n\n${err?.message || ''}`);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!id) return;
    const ok = window.confirm('해당 거래처를 삭제하시겠습니까?\n\n관련 발주/명세서 데이터가 있다면 영향이 있을 수 있습니다.');
    if (!ok) return;
    try {
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (error) {
        console.error('suppliers delete error', error);
        alert(`거래처 삭제에 실패했습니다.\n\n${error.message || ''}`);
      } else {
        alert('거래처가 삭제되었습니다.');
        if (editingSupplier?.id === id) setEditingSupplier(null);
        fetchSuppliers();
      }
    } catch (err: any) {
      console.error('handleDeleteSupplier error', err);
      alert(`거래처 삭제에 실패했습니다.\n\n${err?.message || ''}`);
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
      <div className="bg-white p-6 md:p-10 border border-[var(--toss-border)] shadow-xl rounded-[2.5rem]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--foreground)] tracking-tighter italic">거래처 및 명세서 관리</h2>
            <p className="text-[11px] text-green-600 font-bold mt-1 uppercase tracking-widest">Supplier & Invoice Control</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => setShowNewSupplier(!showNewSupplier)} className="flex-1 md:flex-none px-6 py-3 bg-green-600 text-white rounded-[16px] text-xs font-semibold shadow-lg hover:scale-[0.98] transition-all">+ 거래처 추가</button>
            <button onClick={() => setShowInvoiceForm(!showInvoiceForm)} className="flex-1 md:flex-none px-6 py-3 bg-[var(--toss-blue)] text-white rounded-[16px] text-xs font-semibold shadow-lg hover:scale-[0.98] transition-all">📄 명세서 작성</button>
          </div>
        </div>

        {showNewSupplier && (
          <div className="bg-[var(--toss-gray-1)] p-6 rounded-[16px] space-y-4 mb-8 border border-[var(--toss-border)] animate-in slide-in-from-top-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                value={supplierForm.name}
                onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
                placeholder="거래처명 *"
                className="p-4 bg-white rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.ceo}
                onChange={e => setSupplierForm({ ...supplierForm, ceo: e.target.value })}
                placeholder="대표자 이름"
                className="p-4 bg-white rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.reg_num}
                onChange={e => setSupplierForm({ ...supplierForm, reg_num: e.target.value })}
                placeholder="사업자등록번호 (예: 000-00-00000)"
                className="p-4 bg-white rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.contact}
                onChange={e => setSupplierForm({ ...supplierForm, contact: e.target.value })}
                placeholder="담당자"
                className="p-4 bg-white rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.phone}
                onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                placeholder="전화번호"
                className="p-4 bg-white rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.email}
                onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })}
                placeholder="이메일"
                className="p-4 bg-white rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
              />
            </div>
            <input
              value={supplierForm.address}
              onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })}
              placeholder="주소"
              className="w-full p-4 bg-white rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
            />
            <button
              onClick={handleAddSupplier}
              disabled={loading}
              className="w-full py-4 bg-green-600 text-white rounded-[16px] font-semibold text-sm shadow-lg disabled:opacity-50"
            >
              거래처 등록하기
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((supplier: any) => (
            <div
              key={supplier.id}
              className="bg-white p-6 rounded-[12px] border border-[var(--toss-border)] shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <p className="font-semibold text-[var(--foreground)] text-sm">{supplier.name}</p>
                <div className="mt-3 space-y-1">
                  <p className="text-[11px] text-[var(--toss-gray-3)] font-bold flex items-center gap-2">
                    🧾 사업자번호: {supplier.reg_num || '-'}
                  </p>
                  <p className="text-[11px] text-[var(--toss-gray-3)] font-bold flex items-center gap-2">
                    👤 대표자: {supplier.ceo || supplier.contact || '-'}
                  </p>
                  <p className="text-[11px] text-[var(--toss-gray-3)] font-bold flex items-center gap-2">
                    📞 {supplier.phone || '-'}
                  </p>
                  <p className="text-[11px] text-[var(--toss-gray-3)] font-bold flex items-center gap-2 truncate">
                    📍 {supplier.address || '-'}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => startEditSupplier(supplier)}
                  className="px-3 py-1.5 rounded-[12px] text-[11px] font-semibold bg-blue-50 text-[var(--toss-blue)] hover:bg-[var(--toss-blue-light)]"
                >
                  수정
                </button>
                <button
                  onClick={() => handleDeleteSupplier(supplier.id)}
                  className="px-3 py-1.5 rounded-[12px] text-[11px] font-semibold bg-red-50 text-red-600 hover:bg-red-100"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingSupplier && (
        <div className="bg-white p-6 md:p-8 border border-blue-100 shadow-xl rounded-[16px]">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--foreground)]">거래처 정보 수정</h3>
              <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1 uppercase tracking-widest">
                선택한 거래처의 정보를 수정합니다
              </p>
            </div>
            <button
              onClick={() => setEditingSupplier(null)}
              className="text-[var(--toss-gray-3)] hover:text-red-500 text-xl"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input
              value={editingSupplier.name}
              onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
              placeholder="거래처명 *"
              className="p-3 bg-[var(--toss-gray-1)] rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/30"
            />
            <input
              value={editingSupplier.ceo}
              onChange={(e) => setEditingSupplier({ ...editingSupplier, ceo: e.target.value })}
              placeholder="대표자 이름"
              className="p-3 bg-[var(--toss-gray-1)] rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/30"
            />
            <input
              value={editingSupplier.reg_num}
              onChange={(e) => setEditingSupplier({ ...editingSupplier, reg_num: e.target.value })}
              placeholder="사업자등록번호 (예: 000-00-00000)"
              className="p-3 bg-[var(--toss-gray-1)] rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/30"
            />
            <input
              value={editingSupplier.contact}
              onChange={(e) => setEditingSupplier({ ...editingSupplier, contact: e.target.value })}
              placeholder="담당자"
              className="p-3 bg-[var(--toss-gray-1)] rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/30"
            />
            <input
              value={editingSupplier.phone}
              onChange={(e) => setEditingSupplier({ ...editingSupplier, phone: e.target.value })}
              placeholder="전화번호"
              className="p-3 bg-[var(--toss-gray-1)] rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/30"
            />
            <input
              value={editingSupplier.email}
              onChange={(e) => setEditingSupplier({ ...editingSupplier, email: e.target.value })}
              placeholder="이메일"
              className="p-3 bg-[var(--toss-gray-1)] rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/30"
            />
          </div>
          <input
            value={editingSupplier.address}
            onChange={(e) => setEditingSupplier({ ...editingSupplier, address: e.target.value })}
            placeholder="주소"
            className="w-full p-3 bg-[var(--toss-gray-1)] rounded-[16px] border border-[var(--toss-border)] outline-none text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/30 mb-4"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditingSupplier(null)}
              className="px-4 py-2 rounded-[16px] text-[11px] font-semibold bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-2)]"
            >
              취소
            </button>
            <button
              onClick={handleUpdateSupplier}
              disabled={editLoading}
              className="px-5 py-2 rounded-[16px] text-[11px] font-semibold bg-[var(--toss-blue)] text-white shadow-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {editLoading ? '저장 중...' : '변경 사항 저장'}
            </button>
          </div>
        </div>
      )}

      {showInvoiceForm && (
        <div className="bg-white p-6 md:p-10 border border-[var(--toss-border)] shadow-2xl rounded-[2.5rem] animate-in slide-in-from-bottom-10">
          <div className="flex justify-between items-center mb-6 border-b border-gray-50 pb-4">
            <div>
              <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tighter italic">거래명세서 작성 엔진</h3>
              <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1 uppercase tracking-widest">
                발행일자 및 공급자/공급받는자 정보를 선택하세요
              </p>
            </div>
            <button onClick={() => setShowInvoiceForm(false)} className="text-[var(--toss-gray-3)] hover:text-red-500 text-2xl">✕</button>
          </div>
          
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-[11px] text-[var(--toss-gray-3)] font-bold">
                <span className="mr-1">📅 발행일자</span>
                <span className="text-[var(--toss-gray-3)]">(세금계산서/명세서 기준일)</span>
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
                className="w-full md:w-48 p-3 bg-[var(--toss-gray-1)] rounded-[16px] border border-[var(--toss-border)] outline-none text-xs font-semibold text-[var(--foreground)] focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-6 bg-blue-50/50 rounded-[12px] border border-blue-100">
                <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-widest mb-4">공급자 정보 (업체 선택)</p>
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
                          contact: s.contact || '',
                          email: s.email || '',
                        });
                    }
                  }}
                  className="w-full p-3 bg-white rounded-[16px] border border-blue-100 outline-none font-semibold text-xs mb-4"
                >
                  <option value="">공급자 선택</option>
                  <option value="__HOSPITAL__">본원 (박철홍정형외과)</option>
                  {suppliers.map((s: any) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="space-y-1 text-[11px] font-bold text-[var(--foreground)]">
                  <p>상호: {invoiceData.supplier.sangho || '-'}</p>
                  <p>사업자등록번호: {invoiceData.supplier.reg_num || '-'}</p>
                  <p>대표자: {invoiceData.supplier.ceo || '-'}</p>
                  <p>담당자: {invoiceData.supplier.contact || '-'}</p>
                  <p>전화: {invoiceData.supplier.phone || '-'}</p>
                  <p>이메일: {invoiceData.supplier.email || '-'}</p>
                  <p>주소: {invoiceData.supplier.addr || '-'}</p>
                </div>
              </div>
              <div className="p-6 bg-[var(--toss-gray-1)] rounded-[12px] border border-[var(--toss-border)]">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-4">공급받는자 정보 (업체 선택)</p>
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
                          contact: s.contact || '',
                          email: s.email || '',
                        });
                    }
                  }}
                  className="w-full p-3 bg-white rounded-[16px] border border-[var(--toss-border)] outline-none font-semibold text-xs mb-4"
                >
                  <option value="">거래처 선택</option>
                  <option value="__HOSPITAL__">본원 (박철홍정형외과)</option>
                  {suppliers.map((s: any) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="space-y-1 text-[11px] font-bold text-[var(--foreground)]">
                  <p>상호: {invoiceData.receiver.sangho || '-'}</p>
                  <p>사업자등록번호: {invoiceData.receiver.reg_num || '-'}</p>
                  <p>대표자: {invoiceData.receiver.ceo || '-'}</p>
                  <p>담당자: {invoiceData.receiver.contact || '-'}</p>
                  <p>전화: {invoiceData.receiver.phone || '-'}</p>
                  <p>이메일: {invoiceData.receiver.email || '-'}</p>
                  <p>주소: {invoiceData.receiver.addr || '-'}</p>
                </div>
              </div>
            </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">품목 리스트</p>
                  <button onClick={addRow} className="text-[11px] font-semibold text-[var(--toss-blue)] hover:underline">
                    + 품목 추가
                  </button>
                </div>
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-[var(--toss-gray-1)]/50 border-b border-[var(--toss-border)]">
                        <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">품목명</th>
                        <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-center">수량</th>
                        <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-right">단가</th>
                        <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-right">공급가액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {invoiceData.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-[var(--toss-gray-1)]/70 transition-colors">
                          <td className="px-4 py-3 relative">
                            <input
                              value={item.name}
                              onChange={(e) => updateItem(idx, 'name', e.target.value)}
                              onFocus={() => setFocusedRow(idx)}
                              placeholder="품목 선택/입력"
                              className="w-full px-3 py-2 bg-[var(--toss-gray-1)] rounded-[12px] border border-[var(--toss-border)] outline-none text-xs font-semibold text-[var(--foreground)] focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                            />
                            {focusedRow === idx && (
                              <div className="absolute left-0 top-full w-full bg-white border border-[var(--toss-border)] shadow-2xl z-50 rounded-[16px] max-h-40 overflow-y-auto">
                                {inventory
                                  .filter((i: any) => i.item_name.includes(item.name))
                                  .map((i: any) => (
                                    <button
                                      key={i.id}
                                      onClick={() => selectItem(idx, i)}
                                      className="w-full text-left p-3 text-[11px] font-bold hover:bg-blue-50 border-b border-gray-50"
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
                              className="w-20 px-2 py-2 bg-[var(--toss-gray-1)] rounded-[12px] border border-[var(--toss-border)] outline-none text-xs font-semibold text-center text-[var(--foreground)] focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              value={item.price}
                              onChange={(e) => updateItem(idx, 'price', e.target.value)}
                              className="w-24 px-2 py-2 bg-[var(--toss-gray-1)] rounded-[12px] border border-[var(--toss-border)] outline-none text-xs font-semibold text-right text-[var(--foreground)] focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                            />
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-semibold text-[var(--foreground)]">
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
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">최종 합계액</p>
                <p className="text-2xl font-semibold text-[var(--toss-blue)] tracking-tighter">
                  {invoiceData.items.reduce((sum, item) => sum + (item.supply_price || 0), 0).toLocaleString()}원
                </p>
              </div>
            </div>

            <button onClick={() => window.print()} className="w-full py-5 bg-gray-900 text-white rounded-[12px] font-semibold text-sm shadow-xl hover:bg-black transition-all">🖨️ 명세서 인쇄 및 발행</button>
          </div>
        </div>
      )}
    </div>
  );
}

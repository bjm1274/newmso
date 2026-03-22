'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type AnyRecord = Record<string, unknown>;

const PRESET_HOSPITAL = {
  reg_num: '',
  sangho: '',
  ceo: '',
  addr: '',
  phone: '',
  contact: '',
  email: '',
  status: '',
  type: ''
};

function isValidRegNum(v: string) {
  return !v || /^\d{3}-\d{2}-\d{5}$/.test(v);
}
function isValidPhone(v: string) {
  return !v || /^0\d{1,2}-\d{3,4}-\d{4}$/.test(v);
}
function isValidEmail(v: string) {
  return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function InvoiceManagement({ user, inventory, suppliers, fetchSuppliers }: AnyRecord) {
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [customPresets, setCustomPresets] = useState<any[]>([]);

  const _suppliers = (suppliers ?? []) as AnyRecord[];
  const _inventory = (inventory ?? []) as AnyRecord[];
  const _fetchSuppliers = fetchSuppliers as (() => void) | undefined;

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
    if (!supplierForm.name) return toast('거래처명을 입력해주세요.', 'warning');
    if (!isValidRegNum(supplierForm.reg_num)) return toast('사업자번호 형식이 올바르지 않습니다. (예: 123-45-67890)', 'warning');
    if (!isValidPhone(supplierForm.phone)) return toast('전화번호 형식이 올바르지 않습니다. (예: 02-1234-5678)', 'warning');
    if (!isValidEmail(supplierForm.email)) return toast('이메일 형식이 올바르지 않습니다.', 'warning');
    setLoading(true);
    try {
      const { error } = await supabase.from('suppliers').insert([supplierForm]);
      if (error) {
        toast('거래처 등록에 실패했습니다.', 'error');
      } else {
        toast('거래처가 등록되었습니다.', 'success');
        setSupplierForm({ name: '', contact: '', address: '', phone: '', email: '', reg_num: '', ceo: '' });
        setShowNewSupplier(false);
        _fetchSuppliers?.();
      }
    } catch {
      toast('거래처 등록에 실패했습니다.', 'error');
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
    if (!editingSupplier.name) return toast('거래처명을 입력해주세요.', 'warning');
    if (!isValidRegNum(editingSupplier.reg_num)) return toast('사업자번호 형식이 올바르지 않습니다. (예: 123-45-67890)', 'warning');
    if (!isValidPhone(editingSupplier.phone)) return toast('전화번호 형식이 올바르지 않습니다. (예: 02-1234-5678)', 'warning');
    if (!isValidEmail(editingSupplier.email)) return toast('이메일 형식이 올바르지 않습니다.', 'warning');
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
        toast('거래처 수정에 실패했습니다.', 'error');
      } else {
        toast('거래처 정보가 수정되었습니다.', 'success');
        setEditingSupplier(null);
        _fetchSuppliers?.();
      }
    } catch {
      toast('거래처 수정에 실패했습니다.', 'error');
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
        toast('거래처 삭제에 실패했습니다.', 'error');
      } else {
        toast('거래처가 삭제되었습니다.', 'success');
        if (editingSupplier?.id === id) setEditingSupplier(null);
        _fetchSuppliers?.();
      }
    } catch {
      toast('거래처 삭제에 실패했습니다.', 'error');
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
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="bg-[var(--card)] p-4 border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)]">거래처 및 명세서 관리</h2>
            <p className="text-[11px] text-green-600 font-bold mt-0.5 uppercase tracking-widest">Supplier & Invoice Control</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => setShowNewSupplier(!showNewSupplier)} className="flex-1 md:flex-none px-4 py-2 bg-green-600 text-white rounded-[var(--radius-md)] text-xs font-semibold shadow-sm hover:opacity-90 transition-all">+ 거래처 추가</button>
            <button onClick={() => setShowInvoiceForm(!showInvoiceForm)} className="flex-1 md:flex-none px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-xs font-semibold shadow-sm hover:opacity-90 transition-all">명세서 작성</button>
          </div>
        </div>

        {showNewSupplier && (
          <div className="bg-[var(--muted)] p-3 rounded-[var(--radius-md)] space-y-3 mb-4 border border-[var(--border)] animate-in slide-in-from-top-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={supplierForm.name}
                onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
                placeholder="거래처명 *"
                className="px-3 py-2 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.ceo}
                onChange={e => setSupplierForm({ ...supplierForm, ceo: e.target.value })}
                placeholder="대표자 이름"
                className="px-3 py-2 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.reg_num}
                onChange={e => setSupplierForm({ ...supplierForm, reg_num: e.target.value })}
                placeholder="사업자등록번호 (예: 000-00-00000)"
                className="px-3 py-2 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.contact}
                onChange={e => setSupplierForm({ ...supplierForm, contact: e.target.value })}
                placeholder="담당자"
                className="px-3 py-2 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.phone}
                onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                placeholder="전화번호"
                className="px-3 py-2 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
              />
              <input
                value={supplierForm.email}
                onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })}
                placeholder="이메일"
                className="px-3 py-2 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
              />
            </div>
            <input
              value={supplierForm.address}
              onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })}
              placeholder="주소"
              className="w-full px-3 py-2 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:ring-2 focus:ring-green-100"
            />
            <button
              onClick={handleAddSupplier}
              disabled={loading}
              className="w-full py-2 bg-green-600 text-white rounded-[var(--radius-md)] font-semibold text-sm shadow-sm disabled:opacity-50"
            >
              거래처 등록하기
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {_suppliers.map((supplier: AnyRecord) => (
            <div
              key={supplier.id as string}
              className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <p className="font-semibold text-[var(--foreground)] text-sm">{supplier.name as string}</p>
                <div className="mt-2 space-y-0.5">
                  <p className="text-[11px] text-[var(--toss-gray-3)] font-bold flex items-center gap-2">
                    🧾 사업자번호: {(supplier.reg_num as string) || '-'}
                  </p>
                  <p className="text-[11px] text-[var(--toss-gray-3)] font-bold flex items-center gap-2">
                    👤 대표자: {(supplier.ceo as string) || (supplier.contact as string) || '-'}
                  </p>
                  <p className="text-[11px] text-[var(--toss-gray-3)] font-bold flex items-center gap-2">
                    📞 {(supplier.phone as string) || '-'}
                  </p>
                  <p className="text-[11px] text-[var(--toss-gray-3)] font-bold flex items-center gap-2 truncate">
                    📍 {(supplier.address as string) || '-'}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => startEditSupplier(supplier)}
                  className="px-3 py-1.5 rounded-[var(--radius-md)] text-[11px] font-semibold bg-blue-50 text-[var(--accent)] hover:bg-[var(--toss-blue-light)]"
                >
                  수정
                </button>
                <button
                  onClick={() => handleDeleteSupplier(supplier.id as string)}
                  className="px-3 py-1.5 rounded-[var(--radius-md)] text-[11px] font-semibold bg-red-50 text-red-600 hover:bg-red-100"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingSupplier && (
        <div className="bg-[var(--card)] p-4 border border-blue-100 shadow-sm rounded-[var(--radius-lg)]">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--foreground)]">거래처 정보 수정</h3>
              <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-0.5 uppercase tracking-widest">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <input
              value={editingSupplier.name}
              onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
              placeholder="거래처명 *"
              className="px-3 py-2 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/30"
            />
            <input
              value={editingSupplier.ceo}
              onChange={(e) => setEditingSupplier({ ...editingSupplier, ceo: e.target.value })}
              placeholder="대표자 이름"
              className="px-3 py-2 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/30"
            />
            <input
              value={editingSupplier.reg_num}
              onChange={(e) => setEditingSupplier({ ...editingSupplier, reg_num: e.target.value })}
              placeholder="사업자등록번호 (예: 000-00-00000)"
              className="px-3 py-2 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/30"
            />
            <input
              value={editingSupplier.contact}
              onChange={(e) => setEditingSupplier({ ...editingSupplier, contact: e.target.value })}
              placeholder="담당자"
              className="px-3 py-2 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/30"
            />
            <input
              value={editingSupplier.phone}
              onChange={(e) => setEditingSupplier({ ...editingSupplier, phone: e.target.value })}
              placeholder="전화번호"
              className="px-3 py-2 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/30"
            />
            <input
              value={editingSupplier.email}
              onChange={(e) => setEditingSupplier({ ...editingSupplier, email: e.target.value })}
              placeholder="이메일"
              className="px-3 py-2 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/30"
            />
          </div>
          <input
            value={editingSupplier.address}
            onChange={(e) => setEditingSupplier({ ...editingSupplier, address: e.target.value })}
            placeholder="주소"
            className="w-full px-3 py-2 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-semibold focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/30 mb-3"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditingSupplier(null)}
              className="px-4 py-2 rounded-[var(--radius-lg)] text-[11px] font-semibold bg-[var(--muted)] text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-2)]"
            >
              취소
            </button>
            <button
              onClick={handleUpdateSupplier}
              disabled={editLoading}
              className="px-5 py-2 rounded-[var(--radius-lg)] text-[11px] font-semibold bg-[var(--accent)] text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {editLoading ? '저장 중...' : '변경 사항 저장'}
            </button>
          </div>
        </div>
      )}

      {showInvoiceForm && (
        <div className="bg-[var(--card)] p-4 border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] animate-in slide-in-from-bottom-10">
          <div className="flex justify-between items-center mb-3 border-b border-[var(--border)] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--foreground)]">거래명세서 작성</h3>
              <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-0.5 uppercase tracking-widest">
                발행일자 및 공급자/공급받는자 정보를 선택하세요
              </p>
            </div>
            <button onClick={() => setShowInvoiceForm(false)} className="text-[var(--toss-gray-3)] hover:text-red-500 text-lg">✕</button>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-[11px] text-[var(--toss-gray-3)] font-bold">
                <span className="mr-1">📅 발행일자</span>
                <span className="text-[var(--toss-gray-3)]">(세금계산서/명세서 기준일)</span>
              </div>
              <input
                type="text"
                placeholder="0000-00-00"
                value={invoiceData.date}
                onChange={(e) =>
                  setInvoiceData((prev: any) => ({
                    ...prev,
                    date: e.target.value,
                  }))
                }
                className="w-full md:w-48 px-3 py-2 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-xs font-semibold text-[var(--foreground)] focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 bg-blue-50/50 rounded-[var(--radius-md)] border border-blue-100">
                <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-widest mb-4">공급자 정보 (업체 선택)</p>
                <select
                  value={invoiceData.supplier.sangho || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '__HOSPITAL__') {
                      applyPreset('supplier', { ...PRESET_HOSPITAL });
                    } else {
                      const s = _suppliers.find((sup: AnyRecord) => String(sup.id) === value);
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
                  className="w-full p-3 bg-[var(--card)] rounded-[var(--radius-lg)] border border-blue-100 outline-none font-semibold text-xs mb-4"
                >
                  <option value="">공급자 선택</option>
                  <option value="__HOSPITAL__">본원 (박철홍정형외과)</option>
                  {_suppliers.map((s: AnyRecord) => (
                    <option key={s.id as string} value={String(s.id)}>
                      {s.name as string}
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
              <div className="p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)]">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-4">공급받는자 정보 (업체 선택)</p>
                <select
                  value={invoiceData.receiver.sangho || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '__HOSPITAL__') {
                      applyPreset('receiver', { ...PRESET_HOSPITAL });
                    } else {
                      const s = _suppliers.find((sup: AnyRecord) => String(sup.id) === value);
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
                  className="w-full p-3 bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] outline-none font-semibold text-xs mb-4"
                >
                  <option value="">거래처 선택</option>
                  <option value="__HOSPITAL__">본원 (박철홍정형외과)</option>
                  {_suppliers.map((s: AnyRecord) => (
                    <option key={s.id as string} value={String(s.id)}>
                      {s.name as string}
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
                <button onClick={addRow} className="text-[11px] font-semibold text-[var(--accent)] hover:underline">
                  + 품목 추가
                </button>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-[var(--muted)]/50 border-b border-[var(--border)]">
                      <th className="px-4 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">품목명</th>
                      <th className="px-4 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-center">수량</th>
                      <th className="px-4 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-right">단가</th>
                      <th className="px-4 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-right">공급가액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {invoiceData.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-[var(--muted)]/70 transition-colors">
                        <td className="px-4 py-3 relative">
                          <input
                            value={item.name}
                            onChange={(e) => updateItem(idx, 'name', e.target.value)}
                            onFocus={() => setFocusedRow(idx)}
                            placeholder="품목 선택/입력"
                            className="w-full px-3 py-2 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-xs font-semibold text-[var(--foreground)] focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/30"
                          />
                          {focusedRow === idx && (
                            <div className="absolute left-0 top-full w-full bg-[var(--card)] border border-[var(--border)] shadow-sm z-50 rounded-[var(--radius-lg)] max-h-40 overflow-y-auto">
                              {_inventory
                                .filter((i: AnyRecord) => String(i.item_name ?? '').includes(item.name))
                                .map((i: AnyRecord) => (
                                  <button
                                    key={i.id as string}
                                    onClick={() => selectItem(idx, i)}
                                    className="w-full text-left p-3 text-[11px] font-bold hover:bg-blue-50 border-b border-[var(--border-subtle)]"
                                  >
                                    {i.item_name as string}
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
                            className="w-20 px-2 py-2 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-xs font-semibold text-center text-[var(--foreground)] focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/30"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            value={item.price}
                            onChange={(e) => updateItem(idx, 'price', e.target.value)}
                            className="w-24 px-2 py-2 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-xs font-semibold text-right text-[var(--foreground)] focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/30"
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

            <div className="flex justify-end pt-4 border-t border-[var(--border)]">
              <div className="text-right">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-0.5">최종 합계액</p>
                <p className="text-lg font-bold text-[var(--accent)]">
                  {invoiceData.items.reduce((sum, item) => sum + (item.supply_price || 0), 0).toLocaleString()}원
                </p>
              </div>
            </div>

            <button onClick={() => window.print()} className="w-full py-2 bg-gray-900 text-white rounded-[var(--radius-md)] font-semibold text-sm shadow-sm hover:bg-black transition-all">명세서 인쇄 및 발행</button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ProductRegistration({ user, suppliers, fetchInventory, fetchSuppliers }: any) {
  const [loading, setLoading] = useState(false);
  const [productForm, setProductForm] = useState({
    item_name: '',
    category: '',
    quantity: 0,
    min_quantity: 0,
    unit_price: 0,
    supplier_name: '',
    expiry_date: '',
    lot_number: '',
    is_udi: false,
    company: user?.company || '박철홍정형외과'
  });

  const handleRegisterProduct = async () => {
    if (!productForm.item_name || !productForm.category) return alert('제품명과 분류를 입력해주세요.');
    setLoading(true);
    try {
      // 선택적 필드 처리: 빈 문자열은 null로 변환하여 저장
      const submissionData = {
        ...productForm,
        unit_price: productForm.unit_price || 0,
        expiry_date: productForm.expiry_date || null,
        lot_number: productForm.lot_number || null
      };

      const { error } = await supabase.from('inventory').insert([submissionData]);
      if (error) throw error;
      alert(`${productForm.item_name} 등록 완료`);
      fetchInventory();
      // 폼 초기화
      setProductForm({
        item_name: '',
        category: '',
        quantity: 0,
        min_quantity: 0,
        unit_price: 0,
        supplier_name: '',
        expiry_date: '',
        lot_number: '',
        is_udi: false,
        company: user?.company || '박철홍정형외과'
      });
    } catch (err) {
      console.error('등록 실패:', err);
      alert('등록 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-6 md:p-10 border border-gray-100 shadow-xl rounded-[2.5rem]">
        <div className="mb-8">
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter italic">신규 물품 자산 등록</h2>
          <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase tracking-widest">New Asset Registration</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* 기본 정보 */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">제품명 *</label>
            <input value={productForm.item_name} onChange={e => setProductForm({...productForm, item_name: e.target.value})} className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100" placeholder="제품명을 입력하세요" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">분류 *</label>
            <select value={productForm.category} onChange={e => setProductForm({...productForm, category: e.target.value})} className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100">
              <option value="">분류 선택</option>
              <option value="의료기기">의료기기</option>
              <option value="소모품">소모품</option>
              <option value="약품">약품</option>
              <option value="사무용품">사무용품</option>
            </select>
          </div>

          {/* 수량 및 단가 */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">현재 수량</label>
            <input type="number" value={productForm.quantity} onChange={e => setProductForm({...productForm, quantity: parseInt(e.target.value) || 0})} className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">단가 (원)</label>
            <input type="number" value={productForm.unit_price} onChange={e => setProductForm({...productForm, unit_price: parseInt(e.target.value) || 0})} className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100" placeholder="0" />
          </div>

          {/* 유효기간 및 LOT */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">유효기간 (선택)</label>
            <input type="date" value={productForm.expiry_date} onChange={e => setProductForm({...productForm, expiry_date: e.target.value})} className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">LOT 번호 (선택)</label>
            <input value={productForm.lot_number} onChange={e => setProductForm({...productForm, lot_number: e.target.value})} className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100" placeholder="LOT-0000-00" />
          </div>

          {/* 기타 설정 */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">안전 재고</label>
            <input type="number" value={productForm.min_quantity} onChange={e => setProductForm({...productForm, min_quantity: parseInt(e.target.value) || 0})} className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">공급 업체</label>
            <select value={productForm.supplier_name} onChange={e => setProductForm({...productForm, supplier_name: e.target.value})} className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100">
              <option value="">업체 선택</option>
              {suppliers.map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>

          <div className="flex items-center pt-6">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" checked={productForm.is_udi} onChange={e => setProductForm({...productForm, is_udi: e.target.checked})} className="w-6 h-6 accent-blue-600 rounded-lg" />
              <span className="text-xs font-black text-gray-700 group-hover:text-blue-600 transition-colors">UDI 공급내역 보고 대상</span>
            </label>
          </div>
        </div>

        <button onClick={handleRegisterProduct} disabled={loading} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl hover:scale-[0.98] transition-all">✅ 물품 자산 등록하기</button>
      </div>
    </div>
  );
}

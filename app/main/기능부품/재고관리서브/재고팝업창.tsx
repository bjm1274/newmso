'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// [모달 1] 신규 품목 등록 (단가 추가됨)
export function AddItemModal({ isOpen, onClose, onComplete }: any) {
  // price 필드 추가
  const [newItem, setNewItem] = useState({ 
    name: '', spec: '', quantity: 0, safety_stock: 10, supplier: '', 
    barcode: '', expiration_date: '', price: 0 
  });

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.spec || !newItem.supplier) {
        return alert("필수 입력 항목을 확인해주세요.\n(품목명, 규격, 공급사는 필수입니다)");
    }
    
    const { error } = await supabase.from('inventory').insert([{
      ...newItem,
      barcode: newItem.barcode || null,
      expiration_date: newItem.expiration_date || null
    }]);

    if (!error) {
      alert("등록되었습니다.");
      setNewItem({ name: '', spec: '', quantity: 0, safety_stock: 10, supplier: '', barcode: '', expiration_date: '', price: 0 });
      onComplete();
    } else {
      alert("등록 실패: " + error.message);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-8" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-semibold text-[var(--foreground)] border-b pb-4">새 품목 상세 등록</h2>
        
        <div className="space-y-2">
           <label className="text-xs font-bold text-[var(--toss-gray-3)] ml-1">기본 정보</label>
           <input className="w-full p-3 bg-[var(--toss-gray-1)] rounded-xl text-sm font-bold" placeholder="품목명" value={newItem.name} onChange={e=>setNewItem({...newItem, name: e.target.value})} />
           <input className="w-full p-3 bg-[var(--toss-gray-1)] rounded-xl text-sm font-bold" placeholder="규격" value={newItem.spec} onChange={e=>setNewItem({...newItem, spec: e.target.value})} />
        </div>

        {/* [NEW] 단가 입력 추가 */}
        <div>
            <label className="text-xs font-bold text-[var(--toss-blue)] ml-1">단가 (필수)</label>
            <input type="number" className="w-full p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm font-bold" placeholder="개당 가격" value={newItem.price} onChange={e=>setNewItem({...newItem, price: Number(e.target.value)})} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-[var(--toss-gray-3)] ml-1">초기 수량</label>
            <input type="number" className="w-full p-3 bg-[var(--toss-gray-1)] rounded-xl text-sm font-bold" value={newItem.quantity} onChange={e=>setNewItem({...newItem, quantity: Number(e.target.value)})} />
          </div>
          <div>
            <label className="text-xs font-bold text-red-400 ml-1">최소 유지</label>
            <input type="number" className="w-full p-3 bg-red-50 text-red-500 rounded-xl text-sm font-bold" value={newItem.safety_stock} onChange={e=>setNewItem({...newItem, safety_stock: Number(e.target.value)})} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-xs font-bold text-[var(--toss-gray-3)] ml-1">바코드 (선택)</label><input className="w-full p-3 bg-[var(--toss-gray-1)] rounded-xl text-sm font-bold" value={newItem.barcode} onChange={e=>setNewItem({...newItem, barcode: e.target.value})} /></div>
          <div><label className="text-xs font-bold text-[var(--toss-gray-3)] ml-1">유효기간 (선택)</label><input type="date" className="w-full p-3 bg-[var(--toss-gray-1)] rounded-xl text-sm font-bold text-[var(--toss-gray-4)]" value={newItem.expiration_date} onChange={e=>setNewItem({...newItem, expiration_date: e.target.value})} /></div>
        </div>

        <div><label className="text-xs font-bold text-[var(--toss-gray-3)] ml-1">공급사</label><input className="w-full p-3 bg-[var(--toss-gray-1)] rounded-xl text-sm font-bold" value={newItem.supplier} onChange={e=>setNewItem({...newItem, supplier: e.target.value})} /></div>
        
        <button onClick={handleAddItem} className="w-full py-4 bg-[var(--toss-blue)] text-white rounded-lg font-bold shadow-lg mt-2">등록 완료</button>
      </div>
    </div>
  );
}

// [모달 2] 입고/출고 (기존 유지)
export function StockProcessModal({ isOpen, onClose, onComplete, modalData, setModalData, depts, user }: any) {
  /* 이전 코드와 완전히 동일합니다. (생략 없이 유지해주세요) */
  const [qtyInput, setQtyInput] = useState(1);
  const [targetDept, setTargetDept] = useState('');
  const [lotInput, setLotInput] = useState('');
  const [expInput, setExpInput] = useState('');

  const handleStockProcess = async () => {
    if (!modalData.item || qtyInput <= 0) return;
    const newQty = modalData.type === 'in' ? modalData.item.quantity + qtyInput : modalData.item.quantity - qtyInput;
    if (modalData.type === 'out') { if (modalData.item.quantity < qtyInput) return alert("재고가 부족합니다."); if (!targetDept) return alert("사용 부서를 선택해주세요."); }
    const logData: any = { item_id: modalData.item.id, type: modalData.type === 'in' ? '입고' : '출고', amount: qtyInput, worker_id: user.id, department_id: modalData.type === 'out' ? targetDept : null };
    if (modalData.type === 'in') { logData.lot_number = lotInput || null; logData.expiration_date = expInput || null; }
    await supabase.from('inventory').update({ quantity: newQty, ...(modalData.type === 'in' && expInput ? { expiration_date: expInput } : {}) }).eq('id', modalData.item.id);
    await supabase.from('inventory_logs').insert([logData]);
    alert("처리 완료"); setQtyInput(1); setLotInput(''); setExpInput(''); setTargetDept(''); onComplete();
  };

  if (!isOpen || !modalData.item) return null;
  return (
    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-8" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl text-center space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-semibold text-[var(--foreground)]">{modalData.item.name}</h2>
        <div className={`p-6 rounded-3xl ${modalData.type === 'in' ? 'bg-blue-50' : 'bg-orange-50'}`}>
          {modalData.type === 'in' && (<div className="space-y-2 mb-4 text-left"><div><label className="text-xs font-bold text-[var(--toss-gray-3)] ml-1">LOT</label><input className="w-full p-2 bg-white rounded-xl text-sm font-bold border" value={lotInput} onChange={e=>setLotInput(e.target.value)} /></div><div><label className="text-xs font-bold text-[var(--toss-gray-3)] ml-1">유통기한</label><input type="date" className="w-full p-2 bg-white rounded-xl text-sm font-bold border" value={expInput} onChange={e=>setExpInput(e.target.value)} /></div></div>)}
          {modalData.type === 'out' && (<div className="mb-4 text-left"><label className="text-xs font-bold text-[var(--toss-gray-3)] ml-1">사용 부서</label><select value={targetDept} onChange={e=>setTargetDept(e.target.value)} className="w-full p-2 bg-white rounded-xl text-sm font-bold border"><option value="">선택...</option>{depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>)}
          <label className="block text-xs font-bold mb-2">수량</label>
          <div className="flex items-center justify-center gap-4"><button onClick={() => setQtyInput(q => Math.max(1, q-1))} className="w-10 h-10 rounded-full bg-white font-semibold">-</button><input type="number" value={qtyInput} onChange={(e) => setQtyInput(Number(e.target.value))} className="w-20 text-center bg-transparent text-3xl font-semibold outline-none" /><button onClick={() => setQtyInput(q => q+1)} className="w-10 h-10 rounded-full bg-white font-semibold">+</button></div>
        </div>
        <button onClick={handleStockProcess} className={`w-full py-4 text-white rounded-lg font-bold shadow-lg ${modalData.type === 'in' ? 'bg-[var(--toss-blue)]' : 'bg-orange-500'}`}>확인</button>
      </div>
    </div>
  );
}
'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type DeliveryItem = { name: string; spec: string; unit: string; quantity: number; unit_price: number; amount: number };

export default function DeliveryConfirmation({ user, selectedCo }: { user: any; selectedCo: string }) {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    doc_number: '', issue_date: new Date().toISOString().split('T')[0], supplier_name: '', supplier_rep: '',
    receiver_company: selectedCo === '전체' ? '' : selectedCo, receiver_rep: '', delivery_date: '', notes: '',
    items: [{ name: '', spec: '', unit: '개', quantity: 1, unit_price: 0, amount: 0 }] as DeliveryItem[],
  });

  const fetchDeliveries = useCallback(async () => {
    const { data } = await supabase.from('delivery_confirmations').select('*').order('created_at', { ascending: false });
    setDeliveries(data || []);
  }, []);

  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  const updateItem = (idx: number, field: keyof DeliveryItem, value: any) => {
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        items[idx].amount = items[idx].quantity * items[idx].unit_price;
      }
      return { ...prev, items };
    });
  };

  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { name: '', spec: '', unit: '개', quantity: 1, unit_price: 0, amount: 0 }] }));
  const removeItem = (idx: number) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const totalAmount = form.items.reduce((sum, i) => sum + i.amount, 0);

  const autoDocNumber = () => {
    const d = new Date();
    return `DC-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(deliveries.length + 1).padStart(3, '0')}`;
  };

  const handleSave = async () => {
    if (!form.supplier_name.trim()) return toast('공급업체명을 입력하세요.', 'warning');
    if (form.items.some(i => !i.name.trim())) return toast('모든 품목명을 입력하세요.', 'warning');
    setSaving(true);
    try {
      const docNumber = form.doc_number || autoDocNumber();
      await supabase.from('delivery_confirmations').insert([{
        ...form, doc_number: docNumber, total_amount: totalAmount, created_by: user?.name, created_by_id: user?.id,
        items: form.items,
      }]);
      setShowForm(false);
      fetchDeliveries();
      toast('납품확인서가 저장되었습니다.', 'success');
    } catch { toast('저장 실패', 'error'); } finally { setSaving(false); }
  };

  const printDelivery = (d: any) => {
    const items = Array.isArray(d.items) ? d.items : [];
    const total = items.reduce((sum: number, i: any) => sum + (i.amount || 0), 0);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>납품확인서</title><style>
      body{font-family:'Malgun Gothic',sans-serif;font-size:12px;padding:30px;max-width:800px;margin:0 auto}
      h1{text-align:center;font-size:20px;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:20px}
      .info-block{border:1px solid #ccc;padding:10px;border-radius:4px}
      .info-block p{margin:4px 0}
      table{width:100%;border-collapse:collapse;margin-top:15px}
      th,td{border:1px solid #ccc;padding:8px;text-align:left}
      th{background:#f5f5f5;font-weight:bold}
      .total-row{font-weight:bold;background:#f0f0f0}
      .signature{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:30px}
      .sig-box{border:1px solid #ccc;padding:15px;min-height:80px;text-align:center}
      @media print{button{display:none}}
    </style></head><body>
    <h1>납 품 확 인 서</h1>
    <div style="text-align:right;margin-bottom:10px">문서번호: ${d.doc_number} &nbsp; 발행일: ${d.issue_date}</div>
    <div class="info-grid">
      <div class="info-block"><p><strong>공급업체</strong></p><p>${d.supplier_name}</p><p>대표: ${d.supplier_rep || '-'}</p></div>
      <div class="info-block"><p><strong>납품처</strong></p><p>${d.receiver_company}</p><p>담당: ${d.receiver_rep || '-'}</p><p>납품일: ${d.delivery_date || '-'}</p></div>
    </div>
    <table>
      <thead><tr><th>No</th><th>품목명</th><th>규격</th><th>단위</th><th>수량</th><th>단가</th><th>금액</th></tr></thead>
      <tbody>
        ${items.map((item: any, i: number) => `<tr><td>${i + 1}</td><td>${item.name}</td><td>${item.spec || '-'}</td><td>${item.unit}</td><td>${item.quantity.toLocaleString()}</td><td>${item.unit_price.toLocaleString()}</td><td>${item.amount.toLocaleString()}</td></tr>`).join('')}
        <tr class="total-row"><td colspan="6" style="text-align:right">합계</td><td>${total.toLocaleString()}원</td></tr>
      </tbody>
    </table>
    ${d.notes ? `<p style="margin-top:15px"><strong>비고:</strong> ${d.notes}</p>` : ''}
    <div class="signature">
      <div class="sig-box"><p>공급업체 확인</p><p style="margin-top:30px">${d.supplier_name}</p><p>대표: ${d.supplier_rep || ''} (인)</p></div>
      <div class="sig-box"><p>납품처 확인</p><p style="margin-top:30px">${d.receiver_company}</p><p>담당: ${d.receiver_rep || ''} (인)</p></div>
    </div>
    <script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">납품 확인서 자동 생성</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">납품 확인서를 작성하고 인쇄합니다.</p>
        </div>
        <button onClick={() => { setForm(prev => ({ ...prev, doc_number: autoDocNumber(), receiver_company: selectedCo === '전체' ? '' : selectedCo })); setShowForm(v => !v); }}
          className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-bold shadow-sm hover:opacity-90">
          {showForm ? '닫기' : '+ 새 납품확인서'}
        </button>
      </div>

      {/* 작성 폼 */}
      {showForm && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: '문서번호', key: 'doc_number', placeholder: '자동 생성' },
              { label: '발행일', key: 'issue_date', type: 'date' },
              { label: '납품일', key: 'delivery_date', type: 'date' },
              { label: '공급업체명', key: 'supplier_name', placeholder: '예: (주)메디컬서플라이' },
              { label: '공급업체 대표', key: 'supplier_rep', placeholder: '' },
              { label: '납품처', key: 'receiver_company', placeholder: '' },
              { label: '납품처 담당자', key: 'receiver_rep', placeholder: '' },
              { label: '비고', key: 'notes', placeholder: '특이사항' },
            ].map(({ label, key, placeholder, type }) => (
              <div key={key}>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">{label}</label>
                <input type={type || 'text'} value={(form as any)[key]} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none" />
              </div>
            ))}
          </div>

          {/* 품목 테이블 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-[var(--foreground)]">품목 목록</p>
              <button onClick={addItem} className="px-2 py-1 text-[10px] bg-green-50 text-green-700 font-bold rounded-md">+ 품목 추가</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ minWidth: '600px' }}>
                <thead className="bg-[var(--muted)] border border-[var(--border)]">
                  <tr>
                    {['품목명', '규격', '단위', '수량', '단가', '금액', ''].map(h => (
                      <th key={h} className="px-2 py-2 text-[10px] font-semibold text-[var(--toss-gray-3)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-[var(--border)]">
                      <td className="px-1 py-1"><input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} className="w-full px-2 py-1 border border-[var(--border)] rounded text-xs outline-none" /></td>
                      <td className="px-1 py-1"><input value={item.spec} onChange={e => updateItem(idx, 'spec', e.target.value)} className="w-24 px-2 py-1 border border-[var(--border)] rounded text-xs outline-none" /></td>
                      <td className="px-1 py-1"><input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} className="w-14 px-2 py-1 border border-[var(--border)] rounded text-xs outline-none" /></td>
                      <td className="px-1 py-1"><input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} className="w-16 px-2 py-1 border border-[var(--border)] rounded text-xs outline-none" /></td>
                      <td className="px-1 py-1"><input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))} className="w-24 px-2 py-1 border border-[var(--border)] rounded text-xs outline-none" /></td>
                      <td className="px-2 py-1 text-xs font-bold text-right">{item.amount.toLocaleString()}</td>
                      <td className="px-1 py-1"><button onClick={() => removeItem(idx)} className="px-1.5 py-0.5 text-[9px] bg-red-50 text-red-500 rounded">삭제</button></td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--muted)]">
                    <td colSpan={5} className="px-2 py-2 text-xs font-bold text-right">합계</td>
                    <td className="px-2 py-2 text-sm font-bold text-[var(--accent)]">{totalAmount.toLocaleString()}원</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-bold disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-[var(--muted)] text-[var(--toss-gray-4)] rounded-[var(--radius-md)] text-sm font-bold">취소</button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {deliveries.length === 0 ? (
        <div className="text-center py-10 text-[var(--toss-gray-3)] font-bold text-sm">납품확인서가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {deliveries.map(d => (
            <div key={d.id} className="flex items-center justify-between p-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[var(--foreground)]">{d.doc_number}</p>
                  <span className="px-2 py-0.5 rounded-[var(--radius-md)] text-[9px] font-bold bg-blue-100 text-blue-700">납품확인서</span>
                </div>
                <p className="text-[10px] text-[var(--toss-gray-3)]">{d.supplier_name} → {d.receiver_company} · {d.issue_date}</p>
                <p className="text-[10px] font-bold text-[var(--accent)]">합계: {(d.total_amount || 0).toLocaleString()}원</p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => printDelivery(d)} className="px-3 py-1.5 text-[10px] bg-green-50 text-green-700 font-bold rounded-[var(--radius-md)] hover:bg-green-100">인쇄</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

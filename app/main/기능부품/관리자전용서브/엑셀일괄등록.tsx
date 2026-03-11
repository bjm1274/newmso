'use client';
import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

type UploadMode = 'staff' | 'inventory' | 'inventory_ecount';

// 이카운트 재고 엑셀 행 → 컬럼 매핑 (한글/영문 혼용 대응)
function mapEcountRow(r: any) {
  const itemName = String(r['품목명'] ?? r['품목'] ?? r['ItemName'] ?? r['item_name'] ?? '').trim();
  const qty = parseInt(r['수량'] ?? r['재고'] ?? r['재고수량'] ?? r['Quantity'] ?? r['quantity'] ?? 0, 10) || 0;
  const unitPrice = parseInt(r['단가'] ?? r['UnitPrice'] ?? r['unit_price'] ?? r['원가'] ?? 0, 10) || 0;
  const category = String(r['품목그룹'] ?? r['분류'] ?? r['Category'] ?? r['category'] ?? r['규격'] ?? '').trim();
  const company = String(r['회사'] ?? r['Company'] ?? r['company'] ?? '박철홍정형외과').trim() || '박철홍정형외과';
  const minQty = parseInt(r['최소재고'] ?? r['안전재고'] ?? r['MinStock'] ?? r['min_quantity'] ?? 5, 10) || 5;
  return { itemName, qty, unitPrice, category, company, minQty };
}

export default function ExcelBulkUpload({ onRefresh }: any) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<UploadMode>('staff');
  const [preview, setPreview] = useState<any[]>([]);
  const [defaultCompany, setDefaultCompany] = useState('박철홍정형외과');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      setPreview(rows.slice(0, 10));
      if (rows.length > 0) {
        if (mode === 'staff') {
          for (const r of rows) {
            const empNo = String(r.사번 ?? r.employee_no ?? r.employeeNo ?? '');
            if (!empNo) continue;
            await supabase.from('staff_members').upsert({
              employee_no: empNo,
              name: r.이름 ?? r.name ?? '',
              company: r.회사 ?? r.company ?? '박철홍정형외과',
              department: r.부서 ?? r.department ?? '',
              position: r.직급 ?? r.position ?? '',
              base_salary: parseInt(r.기본급 ?? r.base_salary ?? 0, 10) || 0,
              join_date: r.입사일 ?? r.join_date ?? null
            }, { onConflict: 'employee_no' });
          }
          alert(`${rows.length}건 등록 완료`);
        } else if (mode === 'inventory') {
          for (const r of rows) {
            await supabase.from('inventory').insert({
              item_name: r.품목명 ?? r.item_name ?? '',
              name: r.품목명 ?? r.item_name ?? '',
              quantity: parseInt(r.수량 ?? r.quantity ?? 0, 10) || 0,
              stock: parseInt(r.수량 ?? r.quantity ?? 0, 10) || 0,
              min_quantity: parseInt(r.최소재고 ?? r.min_quantity ?? 5, 10) || 5,
              unit_price: parseInt(r.단가 ?? r.unit_price ?? 0, 10) || 0,
              company: r.회사 ?? r.company ?? '박철홍정형외과',
              category: r.분류 ?? r.category ?? ''
            });
          }
          alert(`${rows.length}건 등록 완료`);
        } else {
          // 재고 리스트 - 이카운트 형식: 한 번에 올리고, 동일 품목+회사면 수정 반영
          const { data: existingList } = await supabase.from('inventory').select('id, item_name, name, company');
          const byKey: Record<string, { id: string }> = {};
          (existingList || []).forEach((x: any) => {
            const k = `${(x.company || '').trim()}|${(x.item_name || x.name || '').trim()}`;
            byKey[k] = { id: x.id };
          });
          let inserted = 0;
          let updated = 0;
          for (const r of rows) {
            const { itemName, qty, unitPrice, category, company, minQty } = mapEcountRow(r);
            if (!itemName) continue;
            const companyVal = company || defaultCompany;
            const key = `${companyVal}|${itemName}`;
            const existing = byKey[key];
            const payload = {
              item_name: itemName,
              name: itemName,
              quantity: qty,
              stock: qty,
              min_quantity: minQty,
              min_stock: minQty,
              unit_price: unitPrice,
              company: companyVal,
              category: category || null
            };
            if (existing?.id) {
              await supabase.from('inventory').update(payload).eq('id', existing.id);
              updated += 1;
            } else {
              const { data: insertedRow } = await supabase.from('inventory').insert(payload).select('id').single();
              inserted += 1;
              if (insertedRow?.id) byKey[key] = { id: insertedRow.id };
            }
          }
          alert(`재고(이카운트) 반영 완료: 신규 ${inserted}건, 수정 ${updated}건`);
        }
        setPreview([]);
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error(err);
      alert('파일 처리 실패');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const isEcount = mode === 'inventory_ecount';

  return (
    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[12px] p-8 shadow-sm max-w-2xl">
      <h3 className="text-xl font-bold text-[var(--foreground)] mb-2">엑셀 일괄 등록</h3>
      <p className="text-xs text-[var(--toss-gray-3)] font-bold mb-6">
        {mode === 'staff' && ''}
        {mode === 'inventory' && ''}
        {isEcount && ''}
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setMode('staff')} className={`px-4 py-2 rounded-[12px] text-xs font-bold ${mode === 'staff' ? 'bg-[var(--toss-blue)] text-white' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}>직원</button>
        <button onClick={() => setMode('inventory')} className={`px-4 py-2 rounded-[12px] text-xs font-bold ${mode === 'inventory' ? 'bg-[var(--toss-blue)] text-white' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}>재고</button>
        <button onClick={() => setMode('inventory_ecount')} className={`px-4 py-2 rounded-[12px] text-xs font-bold ${mode === 'inventory_ecount' ? 'bg-teal-600 text-white' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}>재고 리스트 (이카운트)</button>
      </div>
      {isEcount && (
        <div className="mb-4 p-3 bg-teal-50 border border-teal-100 rounded-[12px] text-[11px] text-teal-800">
          <div className="flex items-center gap-2">
            <label className="font-bold text-[var(--toss-gray-4)]">엑셀에 회사가 없을 때 기본 회사:</label>
            <input type="text" value={defaultCompany} onChange={e => setDefaultCompany(e.target.value)} className="border border-[var(--toss-border)] rounded-[12px] px-2 py-1 w-40 text-sm" placeholder="박철홍정형외과" />
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
      <button onClick={() => fileRef.current?.click()} disabled={loading} className="w-full py-4 bg-[var(--toss-blue)] text-white font-bold rounded-[12px] text-sm hover:bg-[var(--toss-blue)] disabled:opacity-50">
        {loading ? '처리 중...' : '📁 엑셀 파일 선택'}
      </button>
      {preview.length > 0 && (
        <div className="mt-4 p-4 bg-[var(--toss-gray-1)] rounded-[12px] text-[11px] overflow-x-auto">
          <p className="font-bold mb-2">미리보기 (상위 10건)</p>
          <pre>{JSON.stringify(preview, null, 2).slice(0, 500)}...</pre>
        </div>
      )}
    </div>
  );
}

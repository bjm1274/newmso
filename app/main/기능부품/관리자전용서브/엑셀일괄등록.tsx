'use client';
import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

export default function ExcelBulkUpload({ onRefresh }: any) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'staff' | 'inventory'>('staff');
  const [preview, setPreview] = useState<any[]>([]);
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
        } else {
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
        }
        alert(`${rows.length}건 등록 완료`);
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

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-xl max-w-2xl">
      <h3 className="text-xl font-black text-gray-900 mb-2">엑셀 일괄 등록</h3>
      <p className="text-xs text-gray-500 font-bold mb-6">엑셀 파일(사번, 이름, 회사, 부서, 직급, 기본급, 입사일 또는 품목명, 수량, 단가) 업로드</p>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode('staff')} className={`px-4 py-2 rounded-xl text-xs font-black ${mode === 'staff' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>직원</button>
        <button onClick={() => setMode('inventory')} className={`px-4 py-2 rounded-xl text-xs font-black ${mode === 'inventory' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>재고</button>
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
      <button onClick={() => fileRef.current?.click()} disabled={loading} className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl text-sm">📁 엑셀 파일 선택</button>
      {preview.length > 0 && (
        <div className="mt-4 p-4 bg-gray-50 rounded-xl text-[10px] overflow-x-auto">
          <p className="font-black mb-2">미리보기 (상위 10건)</p>
          <pre>{JSON.stringify(preview, null, 2).slice(0, 500)}...</pre>
        </div>
      )}
    </div>
  );
}

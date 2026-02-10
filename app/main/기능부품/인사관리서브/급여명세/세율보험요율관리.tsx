'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function TaxInsuranceRatesPanel({ companyName }: { companyName?: string }) {
  const [list, setList] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('tax_insurance_rates').select('*').order('effective_year', { ascending: false }).limit(5);
      setList(data || []);
    })();
  }, []);

  if (list.length === 0) {
    return (
      <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem]">
        <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest mb-4">세율·보험요율 버전</h3>
        <p className="text-xs text-gray-500">hr_full_features 마이그레이션 후 tax_insurance_rates 테이블에서 연도별 요율을 조회합니다.</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem]">
      <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest mb-4">세율·보험요율</h3>
      <div className="space-y-3">
        {list.map((r) => (
          <div key={r.id} className="p-4 bg-gray-50 rounded-xl">
            <p className="text-sm font-black text-gray-800">{r.effective_year}년</p>
            <div className="grid grid-cols-2 gap-2 text-[10px] mt-2">
              <span>국민연금 {(Number(r.national_pension_rate) * 100).toFixed(2)}%</span>
              <span>건강 {(Number(r.health_insurance_rate) * 100).toFixed(2)}%</span>
              <span>장기요양 {(Number(r.long_term_care_rate) * 100).toFixed(2)}%</span>
              <span>고용 {(Number(r.employment_insurance_rate) * 100).toFixed(2)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const EDI_TYPES = [
  { id: 'NPS', label: '국민연금', rate: 0.045, desc: '기준소득월액의 4.5% (근로자)' },
  { id: 'HI', label: '건강보험', rate: 0.03545, desc: '보수월액의 3.545% (근로자)' },
  { id: 'LCI', label: '장기요양보험', rate: 0.009182, desc: '건강보험료의 12.95% (2024)' },
  { id: 'EI', label: '고용보험', rate: 0.009, desc: '보수총액의 0.9% (근로자)' },
];

type Row = { id: string; name: string; position: string; base: number; nps: number; hi: number; lci: number; ei: number; total: number };

function calcInsurance(base: number) {
  const nps = Math.round(base * 0.045 / 10) * 10;
  const hi = Math.round(base * 0.03545 / 10) * 10;
  const lci = Math.round(hi * 0.1295 / 10) * 10;
  const ei = Math.round(base * 0.009 / 10) * 10;
  return { nps, hi, lci, ei, total: nps + hi + lci + ei };
}

export default function InsuranceEDI({ staffs = [], selectedCo, user }: { staffs: any[]; selectedCo: string; user: any }) {
  const [yearMonth, setYearMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Row[]>([]);
  const [generating, setGenerating] = useState(false);
  const [filterType, setFilterType] = useState('전체');

  const filtered = staffs.filter(s => selectedCo === '전체' || s.company === selectedCo);

  useEffect(() => {
    const computed: Row[] = filtered.map(s => {
      const base = s.base_salary || s.base || 3000000;
      const ins = calcInsurance(base);
      return { id: s.id, name: s.name, position: s.position || '', base, ...ins };
    });
    setRows(computed);
  }, [staffs, selectedCo]);

  const totalRow = rows.reduce((acc, r) => ({
    nps: acc.nps + r.nps, hi: acc.hi + r.hi, lci: acc.lci + r.lci, ei: acc.ei + r.ei, total: acc.total + r.total,
  }), { nps: 0, hi: 0, lci: 0, ei: 0, total: 0 });

  const generateEDI = () => {
    setGenerating(true);
    const lines: string[] = [];
    lines.push(`[4대보험 EDI 파일 - ${yearMonth}]`);
    lines.push(`생성일시: ${new Date().toLocaleString('ko-KR')}`);
    lines.push(`사업장: ${selectedCo}`);
    lines.push(`총 인원: ${rows.length}명`);
    lines.push('');
    lines.push('번호,성명,직위,기준소득,국민연금,건강보험,장기요양,고용보험,합계');
    rows.forEach((r, i) => {
      lines.push(`${i + 1},${r.name},${r.position},${r.base.toLocaleString()},${r.nps.toLocaleString()},${r.hi.toLocaleString()},${r.lci.toLocaleString()},${r.ei.toLocaleString()},${r.total.toLocaleString()}`);
    });
    lines.push('');
    lines.push(`합계,,,,${totalRow.nps.toLocaleString()},${totalRow.hi.toLocaleString()},${totalRow.lci.toLocaleString()},${totalRow.ei.toLocaleString()},${totalRow.total.toLocaleString()}`);

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `4대보험EDI_${yearMonth}_${selectedCo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setGenerating(false);
  };

  const fmt = (n: number) => n.toLocaleString() + '원';

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">4대보험 EDI 파일 자동 생성</h2>
        </div>
        <div className="flex gap-2 items-center">
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm font-bold bg-[var(--toss-card)] outline-none" />
          <button onClick={generateEDI} disabled={generating || rows.length === 0} className="px-4 py-2 bg-[var(--toss-blue)] text-white rounded-[10px] text-sm font-bold shadow-sm hover:opacity-90 disabled:opacity-50">
            CSV 다운로드
          </button>
        </div>
      </div>

      {/* 보험료율 안내 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {EDI_TYPES.map(t => (
          <div key={t.id} className="p-3 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[14px]">
            <p className="text-xs font-bold text-[var(--foreground)]">{t.label}</p>
            <p className="text-lg font-bold text-[var(--toss-blue)] mt-0.5">{(t.rate * 100).toFixed(3)}%</p>
            <p className="text-[9px] text-[var(--toss-gray-3)] mt-0.5">{t.desc}</p>
          </div>
        ))}
      </div>

      {/* 합계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: '국민연금 합계', value: totalRow.nps, color: 'text-blue-600' },
          { label: '건강보험 합계', value: totalRow.hi, color: 'text-green-600' },
          { label: '장기요양 합계', value: totalRow.lci, color: 'text-teal-600' },
          { label: '고용보험 합계', value: totalRow.ei, color: 'text-orange-600' },
          { label: '근로자 부담 합계', value: totalRow.total, color: 'text-[var(--toss-blue)]' },
        ].map(c => (
          <div key={c.label} className="p-3 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[14px] text-center">
            <p className={`text-base font-bold ${c.color}`}>{c.value.toLocaleString()}</p>
            <p className="text-[9px] text-[var(--toss-gray-3)] mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: '700px' }}>
            <thead className="bg-[var(--toss-gray-1)]/60 border-b border-[var(--toss-border)]">
              <tr>
                {['성명', '직위', '기준소득', '국민연금', '건강보험', '장기요양', '고용보험', '합계'].map(h => (
                  <th key={h} className="px-3 py-3 text-[10px] font-semibold text-[var(--toss-gray-3)] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--toss-border)]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-[var(--toss-gray-1)]/30">
                  <td className="px-3 py-2.5 text-xs font-bold text-[var(--foreground)]">{r.name}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--toss-gray-3)]">{r.position}</td>
                  <td className="px-3 py-2.5 text-xs text-right">{r.base.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs text-right text-blue-600">{r.nps.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs text-right text-green-600">{r.hi.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs text-right text-teal-600">{r.lci.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs text-right text-orange-600">{r.ei.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs text-right font-bold text-[var(--toss-blue)]">{r.total.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="bg-[var(--toss-gray-1)]/50 border-t-2 border-[var(--toss-border)] font-bold">
                <td className="px-3 py-2.5 text-xs font-bold" colSpan={2}>합계 ({rows.length}명)</td>
                <td className="px-3 py-2.5 text-xs text-right">-</td>
                <td className="px-3 py-2.5 text-xs text-right text-blue-600">{totalRow.nps.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-xs text-right text-green-600">{totalRow.hi.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-xs text-right text-teal-600">{totalRow.lci.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-xs text-right text-orange-600">{totalRow.ei.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-xs text-right font-bold text-[var(--toss-blue)]">{totalRow.total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-[var(--toss-gray-3)]">* 본 계산은 참고용이며, 실제 신고 시 건강보험공단·고용노동부 기준을 확인하세요. 사업주 부담분(근로자와 동일 비율)은 별도 계산됩니다.</p>
    </div>
  );
}

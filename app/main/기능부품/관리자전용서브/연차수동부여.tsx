'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// 기본 함수 이름을 영문 대문자로 시작하도록 변경해
// React ESLint 규칙을 만족시킵니다. default export 이므로
// 외부에서의 import 이름(연차수동부여)은 그대로 유지됩니다.
export default function AnnualLeaveManualGrant({ staffs = [], onRefresh }: { staffs?: any[]; onRefresh?: () => void }) {
  const [companyFilter, setCompanyFilter] = useState<string>('전체');
  const [edits, setEdits] = useState<Record<string, { total: number; used: number }>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const list = Array.isArray(staffs) ? staffs : [];
  const companies = Array.from(new Set(list.map((s: any) => s.company).filter(Boolean))).sort();
  const filtered = companyFilter === '전체' ? list : list.filter((s: any) => s.company === companyFilter);

  const getTotal = (s: any) => edits[s.id]?.total ?? Number(s.annual_leave_total) ?? 0;
  const getUsed = (s: any) => edits[s.id]?.used ?? Number(s.annual_leave_used) ?? 0;

  const setTotal = (id: string, value: number) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], total: value } }));
  const setUsed = (id: string, value: number) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], used: value } }));

  const handleSaveOne = async (staff: any) => {
    const total = getTotal(staff);
    const used = getUsed(staff);
    setSaving(true);
    setMessage('');
    try {
      const { error } = await supabase
        .from('staff_members')
        .update({ annual_leave_total: total, annual_leave_used: used })
        .eq('id', staff.id);
      if (error) throw error;
      setMessage(`${staff.name} 연차 저장 완료`);
      onRefresh?.();
    } catch (e: any) {
      setMessage('저장 실패: ' + (e?.message || String(e)));
    }
    setSaving(false);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setMessage('');
    try {
      for (const s of filtered) {
        const total = getTotal(s);
        const used = getUsed(s);
        await supabase
          .from('staff_members')
          .update({ annual_leave_total: total, annual_leave_used: used })
          .eq('id', s.id);
      }
      setMessage(`총 ${filtered.length}명 연차 반영 완료`);
      onRefresh?.();
    } catch (e: any) {
      setMessage('저장 실패: ' + (e?.message || String(e)));
    }
    setSaving(false);
  };

  return (
    <div className="bg-white border border-[var(--toss-border)] rounded-[2rem] p-8 shadow-xl max-w-5xl">
      <h3 className="text-xl font-semibold text-[var(--foreground)] mb-2">연차 개수 수동 부여</h3>
      <p className="text-[10px] text-[var(--toss-gray-3)] font-bold mb-6">
        신규입사자 포함 모든 직원의 연차 부여일·사용일을 직접 설정할 수 있습니다. 자동 부여 규칙과 무관하게 반영됩니다.
      </p>

      <div className="flex items-center gap-4 mb-6">
        <label className="text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase">회사</label>
        <select
          value={companyFilter}
          onChange={e => setCompanyFilter(e.target.value)}
          className="border border-[var(--toss-border)] rounded-xl px-4 py-2 text-sm font-bold"
        >
          <option value="전체">전체</option>
          {companies.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-xl text-sm font-bold ${message.includes('실패') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {message}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--toss-border)]">
              <th className="pb-3 text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase">이름</th>
              <th className="pb-3 text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase">회사/부서</th>
              <th className="pb-3 text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase">입사일</th>
              <th className="pb-3 text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase">부여 연차(일)</th>
              <th className="pb-3 text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase">사용 연차(일)</th>
              <th className="pb-3 text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase">동작</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s: any) => (
              <tr key={s.id} className="border-b border-[var(--toss-border)]">
                <td className="py-3 font-bold text-[var(--foreground)]">{s.name}</td>
                <td className="py-3 text-xs text-[var(--toss-gray-3)]">{s.company} / {s.department || '-'}</td>
                <td className="py-3 text-xs text-[var(--toss-gray-4)]">{s.join_date || s.joined_at || '-'}</td>
                <td className="py-3">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={getTotal(s)}
                    onChange={e => setTotal(s.id, Number(e.target.value) || 0)}
                    className="w-20 p-2 border border-[var(--toss-border)] rounded-lg text-sm font-bold"
                  />
                </td>
                <td className="py-3">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={getUsed(s)}
                    onChange={e => setUsed(s.id, Number(e.target.value) || 0)}
                    className="w-20 p-2 border border-[var(--toss-border)] rounded-lg text-sm font-bold"
                  />
                </td>
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => handleSaveOne(s)}
                    disabled={saving}
                    className="px-3 py-1.5 bg-[var(--toss-blue)] text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    저장
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-[var(--toss-gray-3)] font-bold">표시할 직원이 없습니다.</p>
      )}

      {filtered.length > 0 && (
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={saving}
          className="mt-6 w-full py-4 bg-teal-600 text-white font-semibold rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? '저장 중...' : `위 ${filtered.length}명 일괄 저장`}
        </button>
      )}
    </div>
  );
}

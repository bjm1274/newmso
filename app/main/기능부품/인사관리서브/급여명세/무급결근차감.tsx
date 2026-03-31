'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

interface AbsenceRecord {
  id?: number;
  staff_id: number;
  staff_name: string;
  year_month: string;
  absent_days: number;
  monthly_salary: number;
  working_days: number;
  daily_wage: number;
  deduction_amount: number;
  note: string;
}

export default function UnpaidAbsenceDeduction({ staffs, selectedCo, user }: Props) {
  const [yearMonth, setYearMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<AbsenceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<AbsenceRecord>>({});

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('unpaid_absence_records')
        .select('*')
        .eq('year_month', yearMonth)
        .order('staff_name');
      if (error) throw error;
      setRecords(data || []);
    } catch (e: unknown) {
      console.warn('무급결근 조회 실패:', ((e as Error)?.message ?? String(e)));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [yearMonth, selectedCo]);

  const calcDeduction = (monthlySalary: number, workingDays: number, absentDays: number) => {
    if (!workingDays || workingDays <= 0) return { dailyWage: 0, deduction: 0 };
    const dailyWage = Math.round(monthlySalary / workingDays);
    const deduction = dailyWage * absentDays;
    return { dailyWage, deduction };
  };

  const openAdd = (staff: any) => {
    const monthlySalary = staff.base || 3000000;
    const workingDays = 22;
    const absentDays = 0;
    const { dailyWage, deduction } = calcDeduction(monthlySalary, workingDays, absentDays);
    setForm({
      staff_id: staff.id,
      staff_name: staff.name,
      year_month: yearMonth,
      absent_days: absentDays,
      monthly_salary: monthlySalary,
      working_days: workingDays,
      daily_wage: dailyWage,
      deduction_amount: deduction,
      note: '',
    });
    setEditingId(-1);
  };

  const openEdit = (rec: AbsenceRecord) => {
    setForm({ ...rec });
    setEditingId(rec.id ?? -1);
  };

  const handleFormChange = (field: keyof AbsenceRecord, value: any) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      const ms = Number(updated.monthly_salary) || 0;
      const wd = Number(updated.working_days) || 1;
      const ad = Number(updated.absent_days) || 0;
      const { dailyWage, deduction } = calcDeduction(ms, wd, ad);
      updated.daily_wage = dailyWage;
      updated.deduction_amount = deduction;
      return updated;
    });
  };

  const handleSave = async () => {
    if (!form.staff_id || !form.year_month) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        staff_id: form.staff_id,
        staff_name: form.staff_name,
        year_month: form.year_month,
        absent_days: form.absent_days ?? 0,
        monthly_salary: form.monthly_salary ?? 0,
        working_days: form.working_days ?? 22,
        daily_wage: form.daily_wage ?? 0,
        deduction_amount: form.deduction_amount ?? 0,
        note: form.note ?? '',
      };
      if (editingId && editingId > 0) {
        const { error } = await supabase.from('unpaid_absence_records').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('unpaid_absence_records').insert([payload]);
        if (error) throw error;
      }
      setMessage({ type: 'success', text: '저장되었습니다.' });
      setEditingId(null);
      setForm({});
      fetchRecords();
    } catch (e: unknown) {
      setMessage({ type: 'error', text: `저장 실패: ${((e as Error)?.message ?? String(e))}` });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('unpaid_absence_records').delete().eq('id', id);
      if (error) throw error;
      fetchRecords();
    } catch (e: unknown) {
      setMessage({ type: 'error', text: `삭제 실패: ${((e as Error)?.message ?? String(e))}` });
    }
  };

  const totalDeduction = records.reduce((sum, r) => sum + (r.deduction_amount || 0), 0);

  return (
    <div className="p-4 md:p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">무급 결근 자동 차감</h2>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="px-3 py-2 text-sm font-bold border border-[var(--border)] rounded-xl bg-[var(--card)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
          />
        </div>
      </div>

      {/* 메시지 */}
      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-500/10 text-red-700 border border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4">
          <p className="text-xs font-bold text-[var(--toss-gray-3)]">결근 인원</p>
          <p className="text-2xl font-extrabold text-[var(--foreground)] mt-1">{records.length}<span className="text-sm ml-1">명</span></p>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4">
          <p className="text-xs font-bold text-[var(--toss-gray-3)]">총 결근 일수</p>
          <p className="text-2xl font-extrabold text-[var(--foreground)] mt-1">{records.reduce((s, r) => s + (r.absent_days || 0), 0)}<span className="text-sm ml-1">일</span></p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
          <p className="text-xs font-bold text-red-400">총 차감 금액</p>
          <p className="text-2xl font-extrabold text-red-600 mt-1">{totalDeduction.toLocaleString()}<span className="text-sm ml-1">원</span></p>
        </div>
      </div>

      {/* 직원별 결근 추가 버튼 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4">
        <p className="text-xs font-bold text-[var(--toss-gray-3)] mb-3">결근 직원 추가</p>
        <div className="flex flex-wrap gap-2">
          {filtered.map((s: any) => (
            <button
              key={s.id}
              onClick={() => openAdd(s)}
              className="px-3 py-1.5 text-xs font-bold bg-[var(--muted)] hover:bg-[var(--accent)] hover:text-white text-[var(--foreground)] rounded-xl border border-[var(--border)] transition-all"
            >
              + {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* 입력 폼 */}
      {editingId !== null && (
        <div className="bg-blue-500/10 border border-[var(--accent)]/30 rounded-2xl p-4 space-y-4">
          <h3 className="text-sm font-bold text-[var(--accent)]">{editingId > 0 ? '결근 기록 수정' : '결근 기록 추가'} — {form.staff_name}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">결근 일수</label>
              <input
                type="number"
                min={0}
                value={form.absent_days ?? ''}
                onChange={(e) => handleFormChange('absent_days', Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--card)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">월 기본급 (원)</label>
              <input
                type="number"
                value={form.monthly_salary ?? ''}
                onChange={(e) => handleFormChange('monthly_salary', Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--card)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">월 근무일수</label>
              <input
                type="number"
                min={1}
                value={form.working_days ?? ''}
                onChange={(e) => handleFormChange('working_days', Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--card)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">비고</label>
              <input
                type="text"
                value={form.note ?? ''}
                onChange={(e) => handleFormChange('note', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--card)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                placeholder="사유 입력"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 bg-[var(--card)] rounded-xl border border-[var(--border)] px-4 py-3">
            <div className="text-sm">
              <span className="font-bold text-[var(--toss-gray-3)]">일급: </span>
              <span className="font-extrabold text-[var(--foreground)]">{(form.daily_wage || 0).toLocaleString()}원</span>
            </div>
            <div className="text-sm">
              <span className="font-bold text-[var(--toss-gray-3)]">차감 금액: </span>
              <span className="font-extrabold text-red-600">{(form.deduction_amount || 0).toLocaleString()}원</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 bg-[var(--accent)] text-white text-xs font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={() => { setEditingId(null); setForm({}); }}
              className="px-5 py-2.5 bg-[var(--muted)] text-[var(--foreground)] text-xs font-bold rounded-xl hover:bg-[var(--toss-gray-2)] transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 결근 현황 테이블 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[var(--border)]">
          <h3 className="text-sm font-bold text-[var(--foreground)]">월별 결근 현황 — {yearMonth}</h3>
        </div>
        {loading ? (
          <div className="p-5 text-center text-sm text-[var(--toss-gray-3)]">불러오는 중...</div>
        ) : records.length === 0 ? (
          <div className="p-5 text-center text-sm text-[var(--toss-gray-3)]">해당 월 결근 기록이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--muted)]">
                <tr>
                  {['직원명', '결근일수', '월기본급', '월근무일수', '일급', '차감금액', '비고', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[var(--muted)]/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-[var(--foreground)]">{rec.staff_name}</td>
                    <td className="px-4 py-3 font-bold text-orange-600">{rec.absent_days}일</td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{(rec.monthly_salary || 0).toLocaleString()}원</td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{rec.working_days}일</td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{(rec.daily_wage || 0).toLocaleString()}원</td>
                    <td className="px-4 py-3 font-extrabold text-red-600">{(rec.deduction_amount || 0).toLocaleString()}원</td>
                    <td className="px-4 py-3 text-[var(--toss-gray-3)]">{rec.note || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(rec)} className="px-2 py-1 text-[10px] font-bold bg-blue-500/10 text-[var(--accent)] rounded-lg hover:bg-blue-500/20 transition-colors">수정</button>
                        <button onClick={() => handleDelete(rec.id!)} className="px-2 py-1 text-[10px] font-bold bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[var(--muted)] border-t-2 border-[var(--border)]">
                <tr>
                  <td className="px-4 py-3 font-extrabold text-[var(--foreground)]">합계</td>
                  <td className="px-4 py-3 font-extrabold text-orange-600">{records.reduce((s, r) => s + (r.absent_days || 0), 0)}일</td>
                  <td colSpan={4} />
                  <td className="px-4 py-3 font-extrabold text-red-600">{totalDeduction.toLocaleString()}원</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

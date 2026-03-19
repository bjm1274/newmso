'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

type WorkType = '정규직' | '파트타임' | '계약직' | '파견';

interface WorkTypeRecord {
  id?: number;
  staff_id: number;
  staff_name: string;
  changed_date: string;
  prev_type: WorkType | '';
  new_type: WorkType;
  reason: string;
  approver: string;
  company: string;
}

const WORK_TYPES: WorkType[] = ['정규직', '파트타임', '계약직', '파견'];

const TYPE_COLOR: Record<WorkType, string> = {
  정규직: 'bg-blue-100 text-blue-700',
  파트타임: 'bg-green-100 text-green-700',
  계약직: 'bg-orange-100 text-orange-700',
  파견: 'bg-purple-100 text-purple-700',
};

export default function WorkTypeChangeHistory({ staffs, selectedCo, user }: Props) {
  const [records, setRecords] = useState<WorkTypeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchName, setSearchName] = useState('');
  const [form, setForm] = useState<Partial<WorkTypeRecord>>({
    changed_date: new Date().toISOString().slice(0, 10),
    prev_type: '',
    new_type: '정규직',
    reason: '',
    approver: user?.name || '',
  });

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('work_type_change_history')
        .select('*')
        .order('changed_date', { ascending: false });
      if (error) throw error;
      setRecords(data || []);
    } catch (e: unknown) {
      console.warn('근무형태변경이력 조회 실패:', ((e as Error)?.message ?? String(e)));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords, selectedCo]);

  const handleSave = async () => {
    if (!form.staff_id || !form.changed_date || !form.new_type) {
      setMessage({ type: 'error', text: '직원, 변경일, 변경 근무형태는 필수입니다.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        staff_id: form.staff_id,
        staff_name: form.staff_name,
        changed_date: form.changed_date,
        prev_type: form.prev_type || '',
        new_type: form.new_type,
        reason: form.reason || '',
        approver: form.approver || '',
        company: filtered.find((s: any) => s.id === form.staff_id)?.company || selectedCo,
      };
      const { error } = await supabase.from('work_type_change_history').insert([payload]);
      if (error) throw error;
      setMessage({ type: 'success', text: '변경 이력이 등록되었습니다.' });
      setShowForm(false);
      setForm({ changed_date: new Date().toISOString().slice(0, 10), prev_type: '', new_type: '정규직', reason: '', approver: user?.name || '' });
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
      const { error } = await supabase.from('work_type_change_history').delete().eq('id', id);
      if (error) throw error;
      fetchRecords();
    } catch (e: unknown) {
      setMessage({ type: 'error', text: `삭제 실패: ${((e as Error)?.message ?? String(e))}` });
    }
  };

  // 현재 근무형태 현황: 직원별 최신 기록
  const currentStatusMap: Record<number, WorkTypeRecord> = {};
  [...records].reverse().forEach((r) => {
    currentStatusMap[r.staff_id] = r;
  });
  const currentStatuses = Object.values(currentStatusMap);

  const displayRecords = searchName
    ? records.filter((r) => r.staff_name?.includes(searchName))
    : records;

  return (
    <div className="p-4 md:p-4 space-y-4" data-testid="attendance-analysis-worktype-history">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">근무 형태 변경 이력</h2>
        </div>
        <button
          onClick={() => { setShowForm(true); setMessage(null); }}
          className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
        >
          + 변경 이력 추가
        </button>
      </div>

      {/* 메시지 */}
      {message && (
        <div className={`px-3 py-2 rounded-[var(--radius-md)] text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* 현재 근무형태 현황 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">현재 근무 형태 현황</h3>
        <div className="flex flex-wrap gap-2">
          {filtered.map((s: any) => {
            const latest = currentStatuses.find((r) => r.staff_id === s.id);
            const wt = (latest?.new_type || '정규직') as WorkType;
            return (
              <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)]">
                <span className="text-xs font-bold text-[var(--foreground)]">{s.name}</span>
                <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-[var(--radius-md)] ${TYPE_COLOR[wt]}`}>{wt}</span>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="text-xs text-[var(--toss-gray-3)]">소속 직원이 없습니다.</p>}
        </div>
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <div className="bg-blue-50 border border-[var(--accent)]/30 rounded-[var(--radius-lg)] p-4 space-y-3">
          <h3 className="text-sm font-bold text-[var(--accent)]">근무 형태 변경 이력 등록</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">직원 선택</label>
              <select
                value={form.staff_id ?? ''}
                onChange={(e) => {
                  const s = filtered.find((x: any) => x.id === Number(e.target.value));
                  setForm((prev) => ({ ...prev, staff_id: Number(e.target.value), staff_name: s?.name || '' }));
                }}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              >
                <option value="">-- 선택 --</option>
                {filtered.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">변경 일자</label>
              <input
                type="date"
                value={form.changed_date ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, changed_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">이전 근무형태</label>
              <select
                value={form.prev_type ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, prev_type: e.target.value as WorkType | '' }))}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              >
                <option value="">-- 없음(신규) --</option>
                {WORK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">변경 근무형태</label>
              <select
                value={form.new_type ?? '정규직'}
                onChange={(e) => setForm((prev) => ({ ...prev, new_type: e.target.value as WorkType }))}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              >
                {WORK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">변경 사유</label>
              <input
                type="text"
                value={form.reason ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                placeholder="변경 사유 입력"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">승인자</label>
              <input
                type="text"
                value={form.approver ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, approver: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                placeholder="승인자명"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)] hover:opacity-90 transition-opacity disabled:opacity-50">
              {saving ? '저장 중...' : '저장'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-[var(--muted)] text-[var(--foreground)] text-xs font-bold rounded-[var(--radius-md)] hover:opacity-90 transition-colors">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 검색 */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          placeholder="직원명 검색..."
          className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30 w-56"
        />
        {searchName && (
          <button onClick={() => setSearchName('')} className="text-xs text-[var(--toss-gray-3)] hover:text-[var(--foreground)]">초기화</button>
        )}
      </div>

      {/* 이력 테이블 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-bold text-[var(--foreground)]">변경 이력 목록 ({displayRecords.length}건)</h3>
        </div>
        {loading ? (
          <div className="p-5 text-center text-sm text-[var(--toss-gray-3)]">불러오는 중...</div>
        ) : displayRecords.length === 0 ? (
          <div className="p-5 text-center text-sm text-[var(--toss-gray-3)]">변경 이력이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--muted)]">
                <tr>
                  {['변경일자', '직원명', '이전 형태', '변경 형태', '변경 사유', '승인자', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {displayRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[var(--muted)]/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-[var(--foreground)]">{rec.changed_date}</td>
                    <td className="px-4 py-3 font-bold text-[var(--foreground)]">{rec.staff_name}</td>
                    <td className="px-4 py-3">
                      {rec.prev_type ? (
                        <span className={`px-2 py-0.5 rounded-[var(--radius-md)] text-[10px] font-extrabold ${TYPE_COLOR[rec.prev_type as WorkType] || 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'}`}>{rec.prev_type}</span>
                      ) : <span className="text-[var(--toss-gray-3)]">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-[var(--radius-md)] text-[10px] font-extrabold ${TYPE_COLOR[rec.new_type as WorkType] || 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'}`}>{rec.new_type}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{rec.reason || '-'}</td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{rec.approver || '-'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(rec.id!)} className="px-2 py-1 text-[10px] font-bold bg-red-50 text-red-500 rounded-md hover:bg-red-100 transition-colors">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

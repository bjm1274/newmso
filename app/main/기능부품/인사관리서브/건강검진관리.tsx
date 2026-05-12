'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from '../공통/SmartDatePicker';
import { getScopedActiveStaffs } from '@/lib/active-staff';

const CHECKUP_TYPES = ['일반검진', '특수검진', '채용검진', '배치전검진'] as const;
const STATUS_OPTIONS = ['예정', '완료', '미수검'] as const;

type CheckupForm = {
    staff_id: string;
    checkup_type: string;
    scheduled_date: string;
    completed_date: string;
    status: string;
    hospital: string;
    result: string;
    memo: string;
};

const emptyForm: CheckupForm = {
    staff_id: '',
    checkup_type: '일반검진',
    scheduled_date: '',
    completed_date: '',
    status: '예정',
    hospital: '',
    result: '',
    memo: '',
};

export default function HealthCheckupManagement({ staffs, selectedCo }: Record<string, unknown>) {
    const _staffs = (staffs as Record<string, unknown>[]) ?? [];
    const [records, setRecords] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState<CheckupForm>(emptyForm);

    useEffect(() => { fetchRecords(); }, []);
    const fetchRecords = async () => {
        const { data } = await supabase.from('health_checkups').select('*').order('scheduled_date', { ascending: false });
        if (data) setRecords(data);
    };

    const filtered = getScopedActiveStaffs(_staffs, String(selectedCo ?? '전체'));
    const filteredRecords = records.filter((r: any) => selectedCo === '전체' || r.company === selectedCo);

    const checkupDue = useMemo(() => filtered.filter((s: any) => {
        const last = filteredRecords.filter((r: any) => r.staff_id === s.id && r.status === '완료').sort((a: any, b: any) => new Date(b.completed_date || '').getTime() - new Date(a.completed_date || '').getTime())[0];
        if (!last) return true;
        return (Date.now() - new Date(last.completed_date || '').getTime()) / 86400000 > 365;
    }), [filtered, filteredRecords]);

    const closeForm = () => {
        setShowForm(false);
        setEditId(null);
        setForm(emptyForm);
    };

    const openAdd = (presetStaffId?: string) => {
        setEditId(null);
        setForm({ ...emptyForm, staff_id: presetStaffId ?? '' });
        setShowForm(true);
    };

    const openEdit = (rec: any) => {
        setEditId(String(rec.id));
        setForm({
            staff_id: String(rec.staff_id ?? ''),
            checkup_type: String(rec.checkup_type ?? '일반검진'),
            scheduled_date: String(rec.scheduled_date ?? ''),
            completed_date: String(rec.completed_date ?? ''),
            status: String(rec.status ?? '예정'),
            hospital: String(rec.hospital ?? ''),
            result: String(rec.result ?? ''),
            memo: String(rec.memo ?? ''),
        });
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const staff = _staffs.find((s: any) => s.id === form.staff_id);
        if (!staff) return toast('직원을 선택해주세요.', 'warning');
        // PostgreSQL date 컬럼은 빈 문자열을 거부하므로 null로 변환
        const payload = {
            staff_id: form.staff_id,
            staff_name: (staff as any).name,
            company: (staff as any).company,
            department: (staff as any).department || '',
            checkup_type: form.checkup_type,
            scheduled_date: form.scheduled_date || null,
            completed_date: form.completed_date || null,
            status: form.status,
            hospital: form.hospital,
            result: form.result,
            memo: form.memo,
        };
        if (editId) {
            const { data, error } = await supabase.from('health_checkups').update(payload).eq('id', editId).select();
            if (error) {
                console.error('health_checkups update failed:', error);
                toast('건강검진 정보 수정에 실패했습니다.', 'error');
                return;
            }
            if (data?.[0]) setRecords(records.map((r: any) => r.id === editId ? data[0] : r));
        } else {
            const { data, error } = await supabase.from('health_checkups').insert([payload]).select();
            if (error) {
                console.error('health_checkups insert failed:', error);
                toast('건강검진 일정 저장에 실패했습니다.', 'error');
                return;
            }
            if (data?.[0]) setRecords([data[0], ...records]);
        }
        closeForm();
    };

    const markComplete = async (id: string) => {
        const now = new Date().toISOString().slice(0, 10);
        const { error } = await supabase.from('health_checkups').update({ status: '완료', completed_date: now }).eq('id', id);
        if (error) {
            console.error('health_checkups update failed:', error);
            toast('건강검진 완료 처리에 실패했습니다.', 'error');
            return;
        }
        setRecords(records.map((r: any) => r.id === id ? { ...r, status: '완료', completed_date: now } : r));
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300">
            <header className="px-4 py-2 border-b border-[var(--border)] bg-[var(--card)] shrink-0">
                <div className="flex justify-between items-center">
                    <span className="text-[12px] font-bold text-[var(--toss-gray-3)] truncate">{selectedCo as string}</span>
                    <div className="flex items-center gap-2">
                        {checkupDue.length > 0 && <span className="px-3 py-1.5 bg-red-500/20 text-red-700 text-[11px] font-bold rounded-xl">미수검 {checkupDue.length}명</span>}
                        <button onClick={() => showForm ? closeForm() : openAdd()} className="px-5 py-2.5 bg-[var(--accent)] text-white text-[11px] font-bold rounded-xl shadow-md hover:opacity-90 transition-all">{showForm ? '취소' : '+ 검진 등록'}</button>
                    </div>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 custom-scrollbar bg-[var(--page-bg)]">
                {showForm && (
                    <form onSubmit={handleSubmit} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm space-y-4 animate-in slide-in-from-top-4">
                        <h3 className="text-sm font-bold text-[var(--foreground)]">{editId ? '검진 일정 수정' : '검진 일정 등록'}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <select value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" required disabled={!!editId}>
                                <option value="">직원 선택</option>
                                {filtered.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.department || '미배정'})</option>)}
                            </select>
                            <select value={form.checkup_type} onChange={e => setForm({ ...form, checkup_type: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none">
                                {CHECKUP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" aria-label="상태">
                                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <div>
                                <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">예정일</p>
                                <SmartDatePicker value={form.scheduled_date} onChange={val => setForm({ ...form, scheduled_date: val })} inputClassName="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none w-full" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">완료일</p>
                                <SmartDatePicker value={form.completed_date} onChange={val => setForm({ ...form, completed_date: val })} inputClassName="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none w-full" />
                            </div>
                            <input type="text" value={form.hospital} onChange={e => setForm({ ...form, hospital: e.target.value })} placeholder="검진 병원명" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                            <input type="text" value={form.result} onChange={e => setForm({ ...form, result: e.target.value })} placeholder="검진 결과" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)] md:col-span-2" />
                            <input type="text" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="비고" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)] md:col-span-3" />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={closeForm} className="px-4 py-2.5 bg-[var(--muted)] text-[var(--toss-gray-4)] text-[11px] font-bold rounded-xl">취소</button>
                            <button type="submit" className="px-4 py-2.5 bg-[var(--accent)] text-white text-[11px] font-bold rounded-xl shadow-md">{editId ? '저장' : '등록'}</button>
                        </div>
                    </form>
                )}
                {checkupDue.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
                        <h3 className="text-[11px] font-bold text-red-800 mb-3">🚨 검진 미수검 대상자 (1년 내 기록 없음)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {checkupDue.slice(0, 12).map((s: any) => (
                                <div key={s.id} className="flex items-center justify-between bg-[var(--card)] p-3 rounded-xl border border-red-100">
                                    <div><p className="text-[11px] font-bold">{s.name}</p><p className="text-[9px] text-[var(--toss-gray-3)]">{s.department || '미배정'}</p></div>
                                    <button onClick={() => openAdd(s.id)} className="px-2.5 py-1 bg-[var(--accent)] text-white text-[9px] font-bold rounded-lg">등록</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-x-auto shadow-sm">
                    <table className="w-full text-[11px]">
                        <thead><tr className="bg-[var(--muted)] border-b border-[var(--border)]">
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">직원</th>
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">종류</th>
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">예정일</th>
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">완료일</th>
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">기관</th>
                            <th className="px-4 py-3 text-center font-bold text-[var(--toss-gray-4)]">상태</th>
                            <th className="px-4 py-3 text-center font-bold text-[var(--toss-gray-4)]">액션</th>
                        </tr></thead>
                        <tbody>
                            {filteredRecords.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--toss-gray-3)] font-bold">검진 이력이 없습니다</td></tr> : filteredRecords.map((r: any) => (
                                <tr key={r.id} className="border-b border-[var(--border)] hover:bg-[var(--muted)]/50">
                                    <td className="px-4 py-3 font-bold text-[var(--foreground)]">{r.staff_name}<br /><span className="text-[9px] text-[var(--toss-gray-3)]">{r.department}</span></td>
                                    <td className="px-4 py-3">{r.checkup_type}</td>
                                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.scheduled_date || '-'}</td>
                                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.completed_date || '-'}</td>
                                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.hospital || '-'}</td>
                                    <td className="px-4 py-3 text-center"><span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${r.status === '완료' ? 'bg-emerald-100 text-emerald-700' : r.status === '미수검' ? 'bg-red-500/20 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span></td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex justify-center gap-1.5">
                                            <button onClick={() => openEdit(r)} className="px-2.5 py-1 bg-blue-500/10 text-blue-600 text-[10px] font-bold rounded-lg hover:bg-blue-500/20">수정</button>
                                            {r.status === '예정' && <button onClick={() => markComplete(r.id)} className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-lg">완료</button>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

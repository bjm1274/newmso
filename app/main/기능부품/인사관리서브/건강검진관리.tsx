'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

const CHECKUP_TYPES = ['일반검진', '특수검진', '채용검진', '배치전검진'] as const;

export default function HealthCheckupManagement({ staffs = [], selectedCo }: any) {
    const [records, setRecords] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ staff_id: '', checkup_type: '일반검진', scheduled_date: '', hospital: '', memo: '' });

    useEffect(() => { fetchRecords(); }, []);
    const fetchRecords = async () => {
        const { data } = await supabase.from('health_checkups').select('*').order('scheduled_date', { ascending: false });
        if (data) setRecords(data);
    };

    const filtered = staffs.filter((s: any) => (selectedCo === '전체' || s.company === selectedCo) && s.status !== '퇴사');
    const filteredRecords = records.filter((r: any) => selectedCo === '전체' || r.company === selectedCo);

    const checkupDue = useMemo(() => filtered.filter((s: any) => {
        const last = filteredRecords.filter((r: any) => r.staff_id === s.id && r.status === '완료').sort((a: any, b: any) => new Date(b.completed_date || '').getTime() - new Date(a.completed_date || '').getTime())[0];
        if (!last) return true;
        return (Date.now() - new Date(last.completed_date || '').getTime()) / 86400000 > 365;
    }), [filtered, filteredRecords]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const staff = staffs.find((s: any) => s.id === form.staff_id);
        if (!staff) return alert('직원을 선택해주세요.');
        const newRec = { staff_id: form.staff_id, staff_name: staff.name, company: staff.company, department: staff.department || '', checkup_type: form.checkup_type, scheduled_date: form.scheduled_date, completed_date: null, status: '예정', hospital: form.hospital, result: '', memo: form.memo };
        const { data, error } = await supabase.from('health_checkups').insert([newRec]).select();
        if (error) { setRecords([{ ...newRec, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...records]); }
        else if (data) { setRecords([data[0], ...records]); }
        setShowForm(false);
        setForm({ staff_id: '', checkup_type: '일반검진', scheduled_date: '', hospital: '', memo: '' });
    };

    const markComplete = async (id: string) => {
        const now = new Date().toISOString().slice(0, 10);
        setRecords(records.map((r: any) => r.id === id ? { ...r, status: '완료', completed_date: now } : r));
        await supabase.from('health_checkups').update({ status: '완료', completed_date: now }).eq('id', id);
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300">
            <header className="p-6 md:p-8 border-b border-[var(--toss-border)] bg-[var(--toss-card)] shrink-0">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-[var(--foreground)] tracking-tight">🩺 건강검진 관리 <span className="text-sm text-[var(--toss-blue)] ml-2">[{selectedCo}]</span></h2>
                        <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1">법정 의무 건강검진 일정 관리 및 이력 추적</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {checkupDue.length > 0 && <span className="px-3 py-1.5 bg-red-100 text-red-700 text-[11px] font-bold rounded-xl">🚨 미수검 {checkupDue.length}명</span>}
                        <button onClick={() => setShowForm(!showForm)} className="px-5 py-2.5 bg-[var(--toss-blue)] text-white text-[11px] font-bold rounded-xl shadow-md hover:opacity-90 transition-all">{showForm ? '취소' : '+ 검진 등록'}</button>
                    </div>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar bg-[var(--page-bg)]">
                {showForm && (
                    <form onSubmit={handleSubmit} className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-2xl p-6 shadow-sm space-y-4 animate-in slide-in-from-top-4">
                        <h3 className="text-sm font-bold text-[var(--foreground)]">검진 일정 등록</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <select value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" required>
                                <option value="">직원 선택</option>
                                {filtered.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.department || '미배정'})</option>)}
                            </select>
                            <select value={form.checkup_type} onChange={e => setForm({ ...form, checkup_type: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none">
                                {CHECKUP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <input type="date" value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" required />
                            <input type="text" value={form.hospital} onChange={e => setForm({ ...form, hospital: e.target.value })} placeholder="검진 병원명" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                            <input type="text" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="비고" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)] md:col-span-2" />
                        </div>
                        <div className="flex justify-end"><button type="submit" className="px-6 py-2.5 bg-[var(--toss-blue)] text-white text-[11px] font-bold rounded-xl shadow-md">등록</button></div>
                    </form>
                )}
                {checkupDue.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
                        <h3 className="text-[11px] font-bold text-red-800 mb-3">🚨 검진 미수검 대상자 (1년 내 기록 없음)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {checkupDue.slice(0, 12).map((s: any) => (
                                <div key={s.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-red-100">
                                    <div><p className="text-[11px] font-bold">{s.name}</p><p className="text-[9px] text-[var(--toss-gray-3)]">{s.department || '미배정'}</p></div>
                                    <button onClick={() => { setForm({ ...form, staff_id: s.id }); setShowForm(true); }} className="px-2.5 py-1 bg-[var(--toss-blue)] text-white text-[9px] font-bold rounded-lg">등록</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-[11px]">
                        <thead><tr className="bg-[var(--toss-gray-1)] border-b border-[var(--toss-border)]">
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">직원</th>
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">종류</th>
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">예정일</th>
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">기관</th>
                            <th className="px-4 py-3 text-center font-bold text-[var(--toss-gray-4)]">상태</th>
                            <th className="px-4 py-3 text-center font-bold text-[var(--toss-gray-4)]">액션</th>
                        </tr></thead>
                        <tbody>
                            {filteredRecords.length === 0 ? <tr><td colSpan={6} className="px-4 py-16 text-center text-[var(--toss-gray-3)] font-bold">검진 이력이 없습니다</td></tr> : filteredRecords.map((r: any) => (
                                <tr key={r.id} className="border-b border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)]/50">
                                    <td className="px-4 py-3 font-bold text-[var(--foreground)]">{r.staff_name}<br /><span className="text-[9px] text-[var(--toss-gray-3)]">{r.department}</span></td>
                                    <td className="px-4 py-3">{r.checkup_type}</td>
                                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.scheduled_date}</td>
                                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.hospital || '-'}</td>
                                    <td className="px-4 py-3 text-center"><span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${r.status === '완료' ? 'bg-emerald-100 text-emerald-700' : r.status === '미수검' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span></td>
                                    <td className="px-4 py-3 text-center">{r.status === '예정' && <button onClick={() => markComplete(r.id)} className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-lg">완료</button>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

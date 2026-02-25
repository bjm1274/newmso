'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const ORDER_TYPES = ['승진', '전보(부서이동)', '직무변경', '직급변경', '파견', '복직', '휴직', '기타'] as const;

export default function PersonnelAppointment({ staffs = [], selectedCo, user }: any) {
    const [records, setRecords] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [activeTab, setActiveTab] = useState<'발령목록' | '관보생성'>('발령목록');
    const [filter, setFilter] = useState('전체');
    const [form, setForm] = useState({ staff_id: '', order_type: '승진', effective_date: '', before_dept: '', after_dept: '', before_position: '', after_position: '', before_role: '', after_role: '', reason: '', memo: '' });

    useEffect(() => { fetchRecords(); }, []);
    const fetchRecords = async () => {
        const { data } = await supabase.from('personnel_appointments').select('*').order('effective_date', { ascending: false });
        if (data) setRecords(data);
    };

    const filtered = staffs.filter((s: any) => (selectedCo === '전체' || s.company === selectedCo));
    const filteredRecords = records.filter((r: any) => {
        if (selectedCo !== '전체' && r.company !== selectedCo) return false;
        if (filter !== '전체' && r.order_type !== filter) return false;
        return true;
    });

    const handleStaffSelect = (staffId: string) => {
        const s = staffs.find((st: any) => st.id === staffId);
        if (s) setForm({ ...form, staff_id: staffId, before_dept: s.department || '', before_position: s.position || '', before_role: s.role || '' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const staff = staffs.find((s: any) => s.id === form.staff_id);
        if (!staff) return alert('직원을 선택해주세요.');
        const newRec = { ...form, staff_name: staff.name, company: staff.company, status: '발령완료', issued_by: user?.name || '관리자', issued_at: new Date().toISOString() };
        const { data, error } = await supabase.from('personnel_appointments').insert([newRec]).select();
        if (error) { setRecords([{ ...newRec, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...records]); }
        else if (data) { setRecords([data[0], ...records]); }
        // 직원 정보 실제 업데이트 (부서/직급 변경 반영)
        if (form.after_dept || form.after_position) {
            const updates: any = {};
            if (form.after_dept) updates.department = form.after_dept;
            if (form.after_position) updates.position = form.after_position;
            await supabase.from('staff_members').update(updates).eq('id', form.staff_id);
        }
        setShowForm(false);
        setForm({ staff_id: '', order_type: '승진', effective_date: '', before_dept: '', after_dept: '', before_position: '', after_position: '', before_role: '', after_role: '', reason: '', memo: '' });
    };

    // 관보(공지) 자동 생성
    const generateGazette = () => {
        const thisMonth = filteredRecords.filter((r: any) => {
            const d = new Date(r.effective_date);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        if (thisMonth.length === 0) return alert('이번 달 발령 내역이 없습니다.');
        const lines = thisMonth.map((r: any) => `▸ ${r.staff_name} | ${r.order_type} | ${r.before_dept}${r.before_position ? `(${r.before_position})` : ''} → ${r.after_dept}${r.after_position ? `(${r.after_position})` : ''} | 발령일: ${r.effective_date}`);
        const text = `═══ 인사발령 관보 ═══\n발행일: ${new Date().toLocaleDateString()}\n\n${lines.join('\n')}\n\n위와 같이 인사발령 합니다.\n${user?.company || ''} 대표`;
        navigator.clipboard?.writeText(text);
        alert('관보 내용이 클립보드에 복사되었습니다!\n게시판에 붙여넣기 해주세요.');
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300">
            <header className="p-6 md:p-8 border-b border-[var(--toss-border)] bg-[var(--toss-card)] shrink-0">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-[var(--foreground)] tracking-tight">📋 인사발령 관리 <span className="text-sm text-[var(--toss-blue)] ml-2">[{selectedCo}]</span></h2>
                        <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1">승진 · 전보 · 직무변경 · 휴직/복직 발령 및 관보 생성</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={generateGazette} className="px-4 py-2.5 bg-gray-800 text-white text-[11px] font-bold rounded-xl shadow-md hover:opacity-90 transition-all">📃 관보 생성</button>
                        <button onClick={() => setShowForm(!showForm)} className="px-5 py-2.5 bg-[var(--toss-blue)] text-white text-[11px] font-bold rounded-xl shadow-md hover:opacity-90 transition-all">{showForm ? '취소' : '+ 발령 등록'}</button>
                    </div>
                </div>
                <div className="flex gap-1 mt-4 border-b border-[var(--toss-border)] -mb-8">
                    {(['발령목록', '관보생성'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-3 text-[11px] font-bold border-b-2 transition-all ${activeTab === tab ? 'border-[var(--toss-blue)] text-[var(--toss-blue)]' : 'border-transparent text-[var(--toss-gray-3)]'}`}>
                            {tab === '발령목록' ? '📑 발령 이력' : '📰 관보/공지'}
                        </button>
                    ))}
                </div>
            </header>
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar bg-[var(--page-bg)]">
                {showForm && (
                    <form onSubmit={handleSubmit} className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-2xl p-6 shadow-sm space-y-4 animate-in slide-in-from-top-4">
                        <h3 className="text-sm font-bold text-[var(--foreground)]">인사발령 등록</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <select value={form.staff_id} onChange={e => handleStaffSelect(e.target.value)} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" required>
                                <option value="">직원 선택</option>
                                {filtered.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.department || '미배정'} · {s.position || '미정'})</option>)}
                            </select>
                            <select value={form.order_type} onChange={e => setForm({ ...form, order_type: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none">
                                {ORDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <input type="date" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" required />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <div><label className="text-[9px] font-bold text-[var(--toss-gray-4)] block mb-1">현재 부서</label><input value={form.before_dept} readOnly className="w-full px-2 py-2 text-[11px] font-bold rounded-lg bg-gray-100 text-[var(--toss-gray-4)] border-none" /></div>
                            <div><label className="text-[9px] font-bold text-[var(--toss-blue)] block mb-1">변경 부서 →</label><input value={form.after_dept} onChange={e => setForm({ ...form, after_dept: e.target.value })} placeholder="변경될 부서" className="w-full px-2 py-2 text-[11px] font-bold rounded-lg border border-[var(--toss-blue)]/30 bg-blue-50/30 text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" /></div>
                            <div><label className="text-[9px] font-bold text-[var(--toss-gray-4)] block mb-1">현재 직급</label><input value={form.before_position} readOnly className="w-full px-2 py-2 text-[11px] font-bold rounded-lg bg-gray-100 text-[var(--toss-gray-4)] border-none" /></div>
                            <div><label className="text-[9px] font-bold text-[var(--toss-blue)] block mb-1">변경 직급 →</label><input value={form.after_position} onChange={e => setForm({ ...form, after_position: e.target.value })} placeholder="변경될 직급" className="w-full px-2 py-2 text-[11px] font-bold rounded-lg border border-[var(--toss-blue)]/30 bg-blue-50/30 text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" /></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input type="text" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="발령 사유" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                            <input type="text" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="비고" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                        </div>
                        <div className="flex justify-end"><button type="submit" className="px-6 py-2.5 bg-[var(--toss-blue)] text-white text-[11px] font-bold rounded-xl shadow-md">발령 등록</button></div>
                    </form>
                )}

                {/* 필터 */}
                <div className="flex gap-1 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-xl p-1 w-fit overflow-x-auto">
                    {['전체', ...ORDER_TYPES].map(t => (
                        <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all whitespace-nowrap ${filter === t ? 'bg-[var(--toss-blue)] text-white' : 'text-[var(--toss-gray-3)]'}`}>{t}</button>
                    ))}
                </div>

                {activeTab === '발령목록' && (
                    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-[11px]">
                            <thead><tr className="bg-[var(--toss-gray-1)] border-b border-[var(--toss-border)]">
                                <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">직원</th>
                                <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">유형</th>
                                <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">변경 내용</th>
                                <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">발령일</th>
                                <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">사유</th>
                            </tr></thead>
                            <tbody>
                                {filteredRecords.length === 0 ? <tr><td colSpan={5} className="px-4 py-16 text-center text-[var(--toss-gray-3)] font-bold">발령 이력이 없습니다</td></tr> : filteredRecords.map((r: any) => (
                                    <tr key={r.id} className="border-b border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)]/50">
                                        <td className="px-4 py-3 font-bold text-[var(--foreground)]">{r.staff_name}</td>
                                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${r.order_type === '승진' ? 'bg-emerald-100 text-emerald-700' : r.order_type?.includes('전보') ? 'bg-blue-100 text-blue-700' : r.order_type === '휴직' ? 'bg-gray-200 text-gray-600' : 'bg-purple-100 text-purple-700'}`}>{r.order_type}</span></td>
                                        <td className="px-4 py-3 text-[var(--toss-gray-4)]">
                                            {r.before_dept && r.after_dept ? <span>{r.before_dept} → <strong className="text-[var(--foreground)]">{r.after_dept}</strong></span> : null}
                                            {r.before_position && r.after_position ? <span className="ml-2">{r.before_position} → <strong className="text-[var(--foreground)]">{r.after_position}</strong></span> : null}
                                        </td>
                                        <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.effective_date}</td>
                                        <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.reason || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === '관보생성' && (
                    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-2xl p-6 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-bold text-[var(--foreground)]">📰 이번 달 인사발령 관보</h3>
                            <button onClick={generateGazette} className="px-4 py-2 bg-gray-800 text-white text-[10px] font-bold rounded-xl">클립보드 복사</button>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 font-mono text-[11px] text-[var(--foreground)] whitespace-pre-wrap leading-relaxed">
                            <p className="text-center font-bold text-lg mb-4 border-b pb-3">═══ 인사발령 관보 ═══</p>
                            <p className="text-[10px] text-[var(--toss-gray-3)] mb-4">발행일: {new Date().toLocaleDateString()}</p>
                            {filteredRecords.filter((r: any) => { const d = new Date(r.effective_date); const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).map((r: any, i: number) => (
                                <div key={r.id} className="py-2 border-b border-gray-100">
                                    <span className="text-[var(--toss-gray-3)]">{i + 1}.</span> <strong>{r.staff_name}</strong> | {r.order_type} | {r.before_dept}{r.before_position ? `(${r.before_position})` : ''} → {r.after_dept}{r.after_position ? `(${r.after_position})` : ''} | {r.effective_date}
                                </div>
                            ))}
                            {filteredRecords.filter((r: any) => { const d = new Date(r.effective_date); const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length === 0 && <p className="text-center text-[var(--toss-gray-3)] py-8">이번 달 발령 내역이 없습니다</p>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

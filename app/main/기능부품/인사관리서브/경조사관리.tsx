'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const EVENT_TYPES = ['결혼', '출산', '사망(본인가족)', '회갑/칠순', '입학/졸업', '기타'] as const;
const AMOUNT_GUIDE: Record<string, string> = { '결혼': '50,000~100,000', '출산': '50,000', '사망(본인가족)': '100,000~200,000', '회갑/칠순': '50,000', '입학/졸업': '30,000', '기타': '별도 결정' };

export default function CongratulationsCondolences({ staffs = [], selectedCo }: any) {
    const [records, setRecords] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [filter, setFilter] = useState('전체');
    const [form, setForm] = useState({ staff_id: '', event_type: '결혼', event_date: '', amount: 0, relation: '', recipient: '', memo: '', wreath_sent: false });

    useEffect(() => { fetchRecords(); }, []);
    const fetchRecords = async () => {
        const { data } = await supabase.from('congratulations_condolences').select('*').order('event_date', { ascending: false });
        if (data) setRecords(data);
    };

    const filtered = staffs.filter((s: any) => (selectedCo === '전체' || s.company === selectedCo) && s.status !== '퇴사');
    const filteredRecords = records.filter((r: any) => {
        if (selectedCo !== '전체' && r.company !== selectedCo) return false;
        if (filter !== '전체' && r.event_type !== filter) return false;
        return true;
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const staff = staffs.find((s: any) => s.id === form.staff_id);
        if (!staff) return alert('직원을 선택해주세요.');
        const newRec = { ...form, staff_name: staff.name, company: staff.company, department: staff.department || '', status: '지급완료' };
        const { data, error } = await supabase.from('congratulations_condolences').insert([newRec]).select();
        if (error) { setRecords([{ ...newRec, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...records]); }
        else if (data) { setRecords([data[0], ...records]); }
        setShowForm(false);
        setForm({ staff_id: '', event_type: '결혼', event_date: '', amount: 0, relation: '', recipient: '', memo: '', wreath_sent: false });
    };

    const totalAmount = filteredRecords.reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
    const thisYear = filteredRecords.filter((r: any) => new Date(r.event_date).getFullYear() === new Date().getFullYear());
    const yearTotal = thisYear.reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300">
            <header className="p-6 md:p-8 border-b border-[var(--toss-border)] bg-[var(--toss-card)] shrink-0">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-[var(--foreground)] tracking-tight">🎊 경조사 관리 <span className="text-sm text-[var(--toss-blue)] ml-2">[{selectedCo}]</span></h2>
                        <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1">직원 경조사 등록 및 경조금 지급 이력 관리</p>
                    </div>
                    <button onClick={() => setShowForm(!showForm)} className="px-5 py-2.5 bg-[var(--toss-blue)] text-white text-[11px] font-bold rounded-xl shadow-md hover:opacity-90 transition-all">{showForm ? '취소' : '+ 경조사 등록'}</button>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar bg-[var(--page-bg)]">
                {/* 요약 카드 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-2xl p-4 shadow-sm">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">전체 건수</p>
                        <p className="text-2xl font-black text-[var(--foreground)]">{filteredRecords.length}<span className="text-sm ml-1 font-bold text-[var(--toss-gray-3)]">건</span></p>
                    </div>
                    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-2xl p-4 shadow-sm">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">총 지급액</p>
                        <p className="text-2xl font-black text-[var(--foreground)]">{totalAmount.toLocaleString()}<span className="text-sm ml-1 font-bold text-[var(--toss-gray-3)]">원</span></p>
                    </div>
                    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-2xl p-4 shadow-sm">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">{new Date().getFullYear()}년 건수</p>
                        <p className="text-2xl font-black text-[var(--toss-blue)]">{thisYear.length}<span className="text-sm ml-1 font-bold text-[var(--toss-gray-3)]">건</span></p>
                    </div>
                    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-2xl p-4 shadow-sm">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">{new Date().getFullYear()}년 지급</p>
                        <p className="text-2xl font-black text-emerald-600">{yearTotal.toLocaleString()}<span className="text-sm ml-1 font-bold text-[var(--toss-gray-3)]">원</span></p>
                    </div>
                </div>

                {/* 등록 폼 */}
                {showForm && (
                    <form onSubmit={handleSubmit} className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-2xl p-6 shadow-sm space-y-4 animate-in slide-in-from-top-4">
                        <h3 className="text-sm font-bold text-[var(--foreground)]">경조사 등록</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <select value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" required>
                                <option value="">직원 선택</option>
                                {filtered.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.department || '미배정'})</option>)}
                            </select>
                            <select value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none">
                                {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <input type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" required />
                            <div className="flex flex-col gap-1">
                                <input type="number" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} placeholder="경조금 (원)" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                                <p className="text-[9px] text-[var(--toss-gray-3)] font-bold ml-1">가이드: {AMOUNT_GUIDE[form.event_type] || '-'}원</p>
                            </div>
                            <input type="text" value={form.relation} onChange={e => setForm({ ...form, relation: e.target.value })} placeholder="관계 (본인/부모/배우자 등)" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                            <input type="text" value={form.recipient} onChange={e => setForm({ ...form, recipient: e.target.value })} placeholder="대상자명" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                            <input type="text" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="비고" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                            <label className="flex items-center gap-2 text-[11px] font-bold text-[var(--foreground)]">
                                <input type="checkbox" checked={form.wreath_sent} onChange={e => setForm({ ...form, wreath_sent: e.target.checked })} className="rounded" /> 화환/조화 발송
                            </label>
                        </div>
                        <div className="flex justify-end"><button type="submit" className="px-6 py-2.5 bg-[var(--toss-blue)] text-white text-[11px] font-bold rounded-xl shadow-md">등록</button></div>
                    </form>
                )}

                {/* 필터 */}
                <div className="flex gap-1 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-xl p-1 w-fit">
                    {['전체', ...EVENT_TYPES].map(t => (
                        <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${filter === t ? 'bg-[var(--toss-blue)] text-white' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}>{t}</button>
                    ))}
                </div>

                {/* 이력 테이블 */}
                <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-[11px]">
                        <thead><tr className="bg-[var(--toss-gray-1)] border-b border-[var(--toss-border)]">
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">직원</th>
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">유형</th>
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">일자</th>
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">관계/대상</th>
                            <th className="px-4 py-3 text-right font-bold text-[var(--toss-gray-4)]">경조금</th>
                            <th className="px-4 py-3 text-center font-bold text-[var(--toss-gray-4)]">화환</th>
                        </tr></thead>
                        <tbody>
                            {filteredRecords.length === 0 ? <tr><td colSpan={6} className="px-4 py-16 text-center text-[var(--toss-gray-3)] font-bold">경조사 이력이 없습니다</td></tr> : filteredRecords.map((r: any) => (
                                <tr key={r.id} className="border-b border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)]/50">
                                    <td className="px-4 py-3 font-bold text-[var(--foreground)]">{r.staff_name}<br /><span className="text-[9px] text-[var(--toss-gray-3)]">{r.department}</span></td>
                                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${r.event_type?.includes('사망') ? 'bg-gray-800 text-white' : 'bg-pink-100 text-pink-700'}`}>{r.event_type}</span></td>
                                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.event_date}</td>
                                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.relation} {r.recipient ? `(${r.recipient})` : ''}</td>
                                    <td className="px-4 py-3 text-right font-bold text-[var(--foreground)]">{(r.amount || 0).toLocaleString()}원</td>
                                    <td className="px-4 py-3 text-center">{r.wreath_sent ? '🌸' : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

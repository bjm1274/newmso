'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from '../공통/SmartDatePicker';

const REWARD_TYPES = ['우수사원', '근속상', '모범직원', '특별공로', '사내공모 수상', '기타포상'] as const;
const DISCIPLINE_TYPES = ['구두경고', '서면경고', '감봉', '정직', '해임', '기타'] as const;

export default function RewardDisciplineManagement({ staffs = [], selectedCo, user }: Record<string, unknown>) {
    const _staffs = (staffs as Record<string, unknown>[]) ?? [];
    const [records, setRecords] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [activeTab, setActiveTab] = useState<'포상' | '징계' | '징계위원회'>('포상');
    const [form, setForm] = useState({ staff_id: '', category: '포상' as '포상' | '징계', type: '', date: '', reason: '', detail: '', amount: 0, committee_date: '', committee_members: '', committee_result: '', memo: '' });

    useEffect(() => { fetchRecords(); }, []);
    const fetchRecords = async () => {
        const { data } = await supabase.from('reward_discipline').select('*').order('date', { ascending: false });
        if (data) setRecords(data);
    };

    const filtered = _staffs.filter((s: any) => (selectedCo === '전체' || s.company === selectedCo));
    const rewards = records.filter((r: any) => r.category === '포상' && (selectedCo === '전체' || r.company === selectedCo));
    const disciplines = records.filter((r: any) => r.category === '징계' && (selectedCo === '전체' || r.company === selectedCo));
    const committees = disciplines.filter((r: any) => r.committee_date);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const staff = _staffs.find((s: any) => s.id === form.staff_id);
        if (!staff) return toast('직원을 선택해주세요.', 'warning');
        const cat = activeTab === '포상' ? '포상' : '징계';
        const newRec = { ...form, category: cat, staff_name: staff.name as string, company: staff.company, department: (staff.department as string) || '', issued_by: (user as any)?.name || '관리자', date: form.date || null, committee_date: form.committee_date || null };
        const { data, error } = await supabase.from('reward_discipline').insert([newRec]).select();
        if (error) {
            console.error('reward_discipline insert failed:', error);
            toast('포상/징계 기록 저장에 실패했습니다.', 'error');
            return;
        }
        if (data?.[0]) { setRecords([data[0], ...records]); }
        setShowForm(false);
        setForm({ staff_id: '', category: '포상', type: '', date: '', reason: '', detail: '', amount: 0, committee_date: '', committee_members: '', committee_result: '', memo: '' });
    };

    const currentList = activeTab === '포상' ? rewards : activeTab === '징계' ? disciplines : committees;

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300">
            <header className="p-4 md:p-5 border-b border-[var(--border)] bg-[var(--card)] shrink-0">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-[var(--foreground)] tracking-tight">🏅 포상 · 징계 관리 <span className="text-sm text-[var(--accent)] ml-2">[{selectedCo as string}]</span></h2>
                    </div>
                    <button onClick={() => setShowForm(!showForm)} className="px-5 py-2.5 bg-[var(--accent)] text-white text-[11px] font-bold rounded-xl shadow-md hover:opacity-90 transition-all">{showForm ? '취소' : '+ 등록'}</button>
                </div>
                <div className="flex gap-1 mt-4 border-b border-[var(--border)] -mb-5">
                    {(['포상', '징계', '징계위원회'] as const).map(tab => (
                        <button key={tab} onClick={() => { setActiveTab(tab); setShowForm(false); }} className={`px-5 py-3 text-[11px] font-bold border-b-2 transition-all ${activeTab === tab ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--toss-gray-3)]'}`}>
                            {tab === '포상' ? '🏅 포상 이력' : tab === '징계' ? '⚖️ 징계 이력' : '🏛️ 징계위원회'}
                        </button>
                    ))}
                </div>
            </header>
            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 custom-scrollbar bg-[var(--page-bg)]">
                {/* 요약 카드 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">전체 포상</p>
                        <p className="text-2xl font-black text-emerald-600">{rewards.length}<span className="text-sm ml-1 font-bold text-[var(--toss-gray-3)]">건</span></p>
                    </div>
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">전체 징계</p>
                        <p className="text-2xl font-black text-red-600">{disciplines.length}<span className="text-sm ml-1 font-bold text-[var(--toss-gray-3)]">건</span></p>
                    </div>
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">위원회 심의</p>
                        <p className="text-2xl font-black text-[var(--foreground)]">{committees.length}<span className="text-sm ml-1 font-bold text-[var(--toss-gray-3)]">건</span></p>
                    </div>
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">포상금 합계</p>
                        <p className="text-2xl font-black text-[var(--accent)]">{rewards.reduce((s: number, r: any) => s + (r.amount || 0), 0).toLocaleString()}<span className="text-sm ml-1 font-bold text-[var(--toss-gray-3)]">원</span></p>
                    </div>
                </div>

                {showForm && activeTab !== '징계위원회' && (
                    <form onSubmit={handleSubmit} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm space-y-4 animate-in slide-in-from-top-4">
                        <h3 className="text-sm font-bold text-[var(--foreground)]">{activeTab === '포상' ? '🏅 포상 등록' : '⚖️ 징계 등록'}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <select value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" required>
                                <option value="">직원 선택</option>
                                {filtered.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.department || '미배정'})</option>)}
                            </select>
                            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" required>
                                <option value="">유형 선택</option>
                                {(activeTab === '포상' ? REWARD_TYPES : DISCIPLINE_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <SmartDatePicker value={form.date} onChange={val => setForm({ ...form, date: val })} inputClassName="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" />
                            <input type="text" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="사유" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" required />
                            <textarea value={form.detail} onChange={e => setForm({ ...form, detail: e.target.value })} placeholder="상세 내용" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)] resize-none h-20" />
                            {activeTab === '포상' && <input type="number" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} placeholder="포상금(원)" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" />}
                        </div>
                        {activeTab === '징계' && (
                            <div className="p-4 bg-[var(--tab-bg)] rounded-xl border border-[var(--border)] space-y-3">
                                <p className="text-[10px] font-bold text-[var(--toss-gray-4)]">징계위원회 정보 (해당 시)</p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <SmartDatePicker value={form.committee_date} onChange={val => setForm({ ...form, committee_date: val })} inputClassName="px-3 py-2 text-[11px] font-bold rounded-lg border border-[var(--border)] bg-[var(--card)] outline-none" />
                                    <input type="text" value={form.committee_members} onChange={e => setForm({ ...form, committee_members: e.target.value })} placeholder="위원 (쉼표 구분)" className="px-3 py-2 text-[11px] font-bold rounded-lg border border-[var(--border)] bg-[var(--card)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                                    <input type="text" value={form.committee_result} onChange={e => setForm({ ...form, committee_result: e.target.value })} placeholder="심의 결과" className="px-3 py-2 text-[11px] font-bold rounded-lg border border-[var(--border)] bg-[var(--card)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                                </div>
                            </div>
                        )}
                        <div className="flex justify-end"><button type="submit" className="px-4 py-2.5 bg-[var(--accent)] text-white text-[11px] font-bold rounded-xl shadow-md">등록</button></div>
                    </form>
                )}

                {/* 이력 테이블 */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-x-auto shadow-sm">
                    <table className="w-full text-[11px]">
                        <thead><tr className="bg-[var(--muted)] border-b border-[var(--border)]">
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">직원</th>
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">유형</th>
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">일자</th>
                            <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">사유</th>
                            {activeTab === '포상' && <th className="px-4 py-3 text-right font-bold text-[var(--toss-gray-4)]">포상금</th>}
                            {activeTab === '징계위원회' && <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">심의 결과</th>}
                        </tr></thead>
                        <tbody>
                            {currentList.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--toss-gray-3)] font-bold">
                                    {activeTab === '포상' ? '포상 이력이 없습니다' : activeTab === '징계' ? '징계 이력이 없습니다' : '징계위원회 심의 기록이 없습니다'}
                                </td></tr>
                            ) : currentList.map((r: any) => (
                                <tr key={r.id} className="border-b border-[var(--border)] hover:bg-[var(--muted)]/50">
                                    <td className="px-4 py-3 font-bold text-[var(--foreground)]">{r.staff_name}<br /><span className="text-[9px] text-[var(--toss-gray-3)]">{r.department}</span></td>
                                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${r.category === '포상' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{r.type}</span></td>
                                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.date}</td>
                                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.reason}</td>
                                    {activeTab === '포상' && <td className="px-4 py-3 text-right font-bold text-[var(--foreground)]">{(r.amount || 0).toLocaleString()}원</td>}
                                    {activeTab === '징계위원회' && <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.committee_result || '-'}<br /><span className="text-[9px]">심의일: {r.committee_date} · 위원: {r.committee_members}</span></td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

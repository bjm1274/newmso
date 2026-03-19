'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from '../공통/SmartDatePicker';

type InsuranceRecord = {
    id: string;
    staff_id: string;
    staff_name: string;
    company: string;
    department: string;
    type: '취득' | '변경' | '상실';
    insurance_type: '국민연금' | '건강보험' | '고용보험' | '산재보험';
    reason: string;
    effective_date: string;
    reported_at: string | null;
    status: '미신고' | '신고완료' | '반려';
    resident_no?: string;
    memo: string;
    created_at: string;
};

const INSURANCE_TYPES = ['국민연금', '건강보험', '고용보험', '산재보험'] as const;
const ACTION_TYPES = ['취득', '변경', '상실'] as const;
const STATUS_COLORS: Record<string, string> = {
    '미신고': 'bg-amber-100 text-amber-700',
    '신고완료': 'bg-emerald-100 text-emerald-700',
    '반려': 'bg-red-100 text-red-700',
};

export default function InsuranceManagement({ staffs = [], selectedCo }: Record<string, unknown>) {
    const _staffs = (staffs as Record<string, unknown>[]) ?? [];
    const [records, setRecords] = useState<InsuranceRecord[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [filter, setFilter] = useState<string>('전체');
    const [statusFilter, setStatusFilter] = useState<string>('전체');
    const [searchQuery, setSearchQuery] = useState('');

    const [form, setForm] = useState({
        staff_id: '',
        type: '취득' as '취득' | '변경' | '상실',
        insurance_type: '국민연금' as typeof INSURANCE_TYPES[number],
        reason: '',
        effective_date: new Date().toISOString().slice(0, 10),
        memo: '',
    });

    useEffect(() => {
        fetchRecords();
    }, []);

    const fetchRecords = async () => {
        const { data, error } = await supabase
            .from('insurance_records')
            .select('*')
            .order('created_at', { ascending: false });
        if (!error && data) setRecords(data);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const staff = _staffs.find((s: any) => s.id === form.staff_id);
        if (!staff) return alert('직원을 선택해주세요.');

        const newRecord = {
            staff_id: form.staff_id,
            staff_name: staff.name,
            company: staff.company,
            department: staff.department || '',
            type: form.type,
            insurance_type: form.insurance_type,
            reason: form.reason,
            effective_date: form.effective_date,
            reported_at: null,
            status: '미신고',
            memo: form.memo,
        };

        const { data, error } = await supabase.from('insurance_records').insert([newRecord]).select();
        if (error) {
            alert('보험 신고 기록 저장에 실패했습니다. (DB 연결 확인 필요)');
        } else if (data) {
            setRecords([data[0], ...records]);
        }
        setShowForm(false);
        setForm({ staff_id: '', type: '취득', insurance_type: '국민연금', reason: '', effective_date: new Date().toISOString().slice(0, 10), memo: '' });
    };

    const markReported = async (id: string) => {
        const now = new Date().toISOString();
        setRecords(records.map(r => r.id === id ? { ...r, status: '신고완료' as const, reported_at: now } : r));
        await supabase.from('insurance_records').update({ status: '신고완료', reported_at: now }).eq('id', id);
    };

    const filteredStaffs = _staffs.filter((s: any) => {
        if (selectedCo !== '전체' && s.company !== selectedCo) return false;
        return s.status !== '퇴사';
    });

    const filteredRecords = records.filter(r => {
        if (selectedCo !== '전체' && r.company !== selectedCo) return false;
        if (filter !== '전체' && r.type !== filter) return false;
        if (statusFilter !== '전체' && r.status !== statusFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return r.staff_name.toLowerCase().includes(q) || r.insurance_type.includes(q);
        }
        return true;
    });

    const pendingCount = records.filter(r => r.status === '미신고' && (selectedCo === '전체' || r.company === selectedCo)).length;

    // 4대보험 현황 요약 (간이)
    const activeStaffs = _staffs.filter((s: any) => s.status !== '퇴사' && (selectedCo === '전체' || s.company === selectedCo));
    const summaryCards = INSURANCE_TYPES.map(ins => ({
        name: ins,
        enrolled: activeStaffs.length,
        pending: records.filter(r => r.insurance_type === ins && r.status === '미신고' && (selectedCo === '전체' || r.company === selectedCo)).length,
    }));

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300" data-testid="payroll-utility-insurance">
            {/* 헤더 */}
            <header className="p-4 md:p-5 border-b border-[var(--border)] bg-[var(--card)] shrink-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-[var(--foreground)] tracking-tight">
                            🏛️ 4대보험 관리 <span className="text-sm text-[var(--accent)] ml-2">[{selectedCo as string}]</span>
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        {pendingCount > 0 && (
                            <span className="px-3 py-1.5 bg-amber-100 text-amber-700 text-[11px] font-bold rounded-xl animate-pulse">
                                ⚠️ 미신고 {pendingCount}건
                            </span>
                        )}
                        <button
                            onClick={() => setShowForm(!showForm)}
                            className="px-5 py-2.5 bg-[var(--accent)] text-white text-[11px] font-bold rounded-xl shadow-md hover:opacity-90 transition-all"
                        >
                            {showForm ? '취소' : '+ 신규 신고'}
                        </button>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 custom-scrollbar bg-[var(--page-bg)]">
                {/* 4대보험 현황 요약 카드 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {summaryCards.map(card => (
                        <div key={card.name} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
                            <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-2">{card.name}</p>
                            <p className="text-2xl font-black text-[var(--foreground)]">{card.enrolled}<span className="text-sm font-bold text-[var(--toss-gray-3)] ml-1">명</span></p>
                            {card.pending > 0 && (
                                <p className="text-[10px] font-bold text-amber-600 mt-1">미신고 {card.pending}건</p>
                            )}
                        </div>
                    ))}
                </div>

                {/* 신규 등록 폼 */}
                {showForm && (
                    <form onSubmit={handleSubmit} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm space-y-4 animate-in slide-in-from-top-4">
                        <h3 className="text-sm font-bold text-[var(--foreground)]">신규 4대보험 신고 등록</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">대상 직원</label>
                                <select value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30" required>
                                    <option value="">직원 선택</option>
                                    {filteredStaffs.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.department || '미배정'})</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">신고 유형</label>
                                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30">
                                    {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">보험 종류</label>
                                <select value={form.insurance_type} onChange={e => setForm({ ...form, insurance_type: e.target.value as any })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30">
                                    {INSURANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">적용일</label>
                                <SmartDatePicker value={form.effective_date} onChange={val => setForm({ ...form, effective_date: val })} inputClassName="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">사유</label>
                                <input type="text" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="입사, 퇴사, 소득변경 등" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30 placeholder:text-[var(--toss-gray-3)]" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">비고</label>
                                <input type="text" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="추가 메모" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30 placeholder:text-[var(--toss-gray-3)]" />
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
                            <button type="submit" className="px-4 py-2.5 bg-[var(--accent)] text-white text-[11px] font-bold rounded-xl shadow-md hover:opacity-90 transition-all">등록</button>
                        </div>
                    </form>
                )}

                {/* 필터 & 검색 */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex gap-1 bg-[var(--card)] border border-[var(--border)] rounded-xl p-1">
                        {['전체', ...ACTION_TYPES].map(t => (
                            <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${filter === t ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}>{t}</button>
                        ))}
                    </div>
                    <div className="flex gap-1 bg-[var(--card)] border border-[var(--border)] rounded-xl p-1">
                        {['전체', '미신고', '신고완료', '반려'].map(s => (
                            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${statusFilter === s ? 'bg-gray-800 text-white shadow-sm' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}>{s}</button>
                        ))}
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="이름 또는 보험종류 검색..."
                        className="ml-auto px-4 py-2 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30 w-48 placeholder:text-[var(--toss-gray-3)]"
                    />
                </div>

                {/* 신고 이력 테이블 */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="bg-[var(--muted)] border-b border-[var(--border)]">
                                    <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">직원</th>
                                    <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">유형</th>
                                    <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">보험</th>
                                    <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">적용일</th>
                                    <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">사유</th>
                                    <th className="px-4 py-3 text-center font-bold text-[var(--toss-gray-4)]">상태</th>
                                    <th className="px-4 py-3 text-center font-bold text-[var(--toss-gray-4)]">액션</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.length === 0 ? (
                                    <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--toss-gray-3)] font-bold">등록된 신고 이력이 없습니다</td></tr>
                                ) : filteredRecords.map(r => (
                                    <tr key={r.id} className="border-b border-[var(--border)] hover:bg-[var(--muted)]/50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-[var(--foreground)]">
                                            <div>{r.staff_name}</div>
                                            <div className="text-[9px] text-[var(--toss-gray-3)]">{r.company} · {r.department}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${r.type === '취득' ? 'bg-blue-100 text-blue-700' : r.type === '상실' ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'}`}>
                                                {r.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-[var(--foreground)]">{r.insurance_type}</td>
                                        <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.effective_date}</td>
                                        <td className="px-4 py-3 text-[var(--toss-gray-4)]">{r.reason || '-'}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {r.status === '미신고' && (
                                                <button onClick={() => markReported(r.id)} className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600 transition-all shadow-sm">
                                                    신고완료
                                                </button>
                                            )}
                                            {r.status === '신고완료' && r.reported_at && (
                                                <span className="text-[9px] text-[var(--toss-gray-3)]">{new Date(r.reported_at).toLocaleDateString()}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 자동 감지 영역 */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
                    <h3 className="text-sm font-bold text-[var(--foreground)] mb-4">🤖 자동 감지 알림</h3>
                    <div className="space-y-3">
                        {_staffs.filter((s: any) => {
                            if (selectedCo !== '전체' && s.company !== selectedCo) return false;
                            const joinDate = s.joined_at ? new Date(s.joined_at) : null;
                            if (!joinDate) return false;
                            const diff = (Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24);
                            return diff <= 14 && s.status !== '퇴사';
                        }).map((s: any) => (
                            <div key={s.id} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">🆕</span>
                                    <div>
                                        <p className="text-[11px] font-bold text-[var(--foreground)]">{s.name} ({s.department || '미배정'})</p>
                                        <p className="text-[9px] text-[var(--toss-gray-3)]">입사일: {s.joined_at} · 4대보험 취득 신고 필요</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setForm({ ...form, staff_id: s.id, type: '취득', reason: '신규입사' });
                                        setShowForm(true);
                                    }}
                                    className="px-3 py-1.5 bg-[var(--accent)] text-white text-[10px] font-bold rounded-lg hover:opacity-90 transition-all"
                                >
                                    취득 신고
                                </button>
                            </div>
                        ))}
                        {_staffs.filter((s: any) => {
                            if (selectedCo !== '전체' && s.company !== selectedCo) return false;
                            return s.status === '퇴사' && s.resigned_at;
                        }).slice(0, 5).map((s: any) => (
                            <div key={s.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">📤</span>
                                    <div>
                                        <p className="text-[11px] font-bold text-[var(--foreground)]">{s.name}</p>
                                        <p className="text-[9px] text-[var(--toss-gray-3)]">퇴사일: {s.resigned_at} · 4대보험 상실 신고 확인 필요</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setForm({ ...form, staff_id: s.id, type: '상실', reason: '퇴사' });
                                        setShowForm(true);
                                    }}
                                    className="px-3 py-1.5 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:opacity-90 transition-all"
                                >
                                    상실 신고
                                </button>
                            </div>
                        ))}
                        {_staffs.filter((s: any) => {
                            if (selectedCo !== '전체' && s.company !== selectedCo) return false;
                            const joinDate = s.joined_at ? new Date(s.joined_at) : null;
                            if (!joinDate) return false;
                            const diff = (Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24);
                            return diff <= 14 && s.status !== '퇴사';
                        }).length === 0 && _staffs.filter((s: any) => s.status === '퇴사' && s.resigned_at && (selectedCo === '전체' || s.company === selectedCo)).length === 0 && (
                                <div className="text-center py-5 text-[var(--toss-gray-3)]">
                                    <p className="text-3xl mb-2 opacity-30">✅</p>
                                    <p className="text-[11px] font-bold">현재 미처리 건이 없습니다</p>
                                </div>
                            )}
                    </div>
                </div>
            </div>
        </div>
    );
}

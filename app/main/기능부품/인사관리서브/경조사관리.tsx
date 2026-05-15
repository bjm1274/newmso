'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from '../공통/SmartDatePicker';
import { getScopedActiveStaffs } from '@/lib/active-staff';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

const EVENT_TYPES = ['생일', '결혼', '출산', '사망(본인가족)', '회갑/칠순', '입학/졸업', '기타'] as const;
const AMOUNT_GUIDE: Record<string, string> = {
    '생일': '30,000~50,000', '결혼': '50,000~100,000', '출산': '50,000',
    '사망(본인가족)': '100,000~200,000', '회갑/칠순': '50,000', '입학/졸업': '30,000', '기타': '별도 결정',
};

type CongratRecord = {
    id: string;
    staff_name: string;
    department: string;
    event_type: string;
    event_date: string;
    relation: string;
    recipient: string;
    amount: number;
    wreath_sent: boolean;
    company: string;
    status: string;
};

type FormState = {
    staff_id: string;
    event_type: string;
    event_date: string;
    amount: number;
    relation: string;
    recipient: string;
    memo: string;
    wreath_sent: boolean;
};

const INITIAL_FORM: FormState = {
    staff_id: '', event_type: '결혼', event_date: '', amount: 0,
    relation: '', recipient: '', memo: '', wreath_sent: false,
};

const COLUMNS: Column<CongratRecord>[] = [
    {
        key: 'staff_name',
        label: '직원',
        primary: true,
        render: (r) => (
            <span className="font-bold text-[var(--foreground)]">
                {r.staff_name}
                <br />
                <span className="text-[9px] text-[var(--toss-gray-3)]">{r.department}</span>
            </span>
        ),
    },
    {
        key: 'event_type',
        label: '유형',
        render: (r) => (
            <span className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                r.event_type?.includes('사망') ? 'bg-[var(--foreground)] text-white' :
                r.event_type === '생일' ? 'bg-blue-100 text-blue-700' :
                'bg-pink-100 text-pink-700'
            }`}>
                {r.event_type}
            </span>
        ),
    },
    {
        key: 'event_date',
        label: '일자',
        render: (r) => <span className="text-[var(--toss-gray-4)]">{r.event_date}</span>,
        showOnMobile: false,
    },
    {
        key: 'relation',
        label: '관계/대상',
        render: (r) => (
            <span className="text-[var(--toss-gray-4)]">
                {r.relation}{r.recipient ? ` (${r.recipient})` : ''}
            </span>
        ),
        showOnMobile: false,
    },
    {
        key: 'amount',
        label: '경조금',
        align: 'right',
        render: (r) => <span className="font-bold text-[var(--foreground)]">{(r.amount || 0).toLocaleString()}원</span>,
    },
    {
        key: 'wreath_sent',
        label: '화환',
        align: 'center',
        showOnMobile: false,
        render: (r) => <span>{r.wreath_sent ? '🌸' : '—'}</span>,
    },
];

export default function CongratulationsCondolences({ staffs = [], selectedCo }: Record<string, unknown>) {
    const _staffs = (staffs as Record<string, unknown>[]) ?? [];
    const [records, setRecords] = useState<CongratRecord[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [filter, setFilter] = useState('전체');
    const [form, setForm] = useState<FormState>(INITIAL_FORM);

    useEffect(() => { fetchRecords(); }, []);

    const fetchRecords = async () => {
        const { data } = await supabase.from('congratulations_condolences').select('*').order('event_date', { ascending: false });
        if (data) setRecords(data as CongratRecord[]);
    };

    const filtered = getScopedActiveStaffs(_staffs, String(selectedCo ?? '전체'));
    const filteredRecords = useMemo(() => records.filter((r) => {
        if (selectedCo !== '전체' && r.company !== selectedCo) return false;
        if (filter !== '전체' && r.event_type !== filter) return false;
        return true;
    }), [records, selectedCo, filter]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const staff = _staffs.find((s) => s.id === form.staff_id);
        if (!staff) return toast('직원을 선택해주세요.', 'warning');
        const newRec = {
            ...form,
            staff_name: staff.name,
            company: staff.company,
            department: (staff.department as string) || '',
            status: '지급완료',
        };
        const { data, error } = await supabase.from('congratulations_condolences').insert([newRec]).select();
        if (error) {
            const fallback = { ...(newRec as unknown as CongratRecord), id: crypto.randomUUID() };
            setRecords([fallback, ...records]);
        } else if (data) {
            setRecords([data[0] as CongratRecord, ...records]);
        }
        setShowForm(false);
        setForm(INITIAL_FORM);
    };

    const totalAmount = useMemo(() => filteredRecords.reduce((sum, r) => sum + (r.amount || 0), 0), [filteredRecords]);
    const thisYear = useMemo(() => filteredRecords.filter((r) => new Date(r.event_date).getFullYear() === new Date().getFullYear()), [filteredRecords]);
    const yearTotal = useMemo(() => thisYear.reduce((sum, r) => sum + (r.amount || 0), 0), [thisYear]);

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300">
            <header className="px-4 md:px-5 py-2 border-b border-[var(--border)] bg-[var(--card)] shrink-0">
                <div className="flex justify-between items-center">
                    <span className="text-[12px] font-bold text-[var(--toss-gray-3)] truncate">{selectedCo as string}</span>
                    <button onClick={() => setShowForm(!showForm)} className="px-5 py-2 bg-[var(--accent)] text-white text-[11px] font-bold rounded-xl shadow-md hover:opacity-90 transition-all">
                        {showForm ? '취소' : '+ 경조사 등록'}
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 custom-scrollbar bg-[var(--page-bg)]">
                {/* 요약 카드 */}
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
                        <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1">전체 건수</p>
                        <p className="text-2xl font-black text-[var(--foreground)]">{filteredRecords.length}<span className="text-sm ml-1 font-bold text-[var(--toss-gray-3)]">건</span></p>
                    </div>
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
                        <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1">총 지급액</p>
                        <p className="text-2xl font-black text-[var(--foreground)]">{totalAmount.toLocaleString()}<span className="text-sm ml-1 font-bold text-[var(--toss-gray-3)]">원</span></p>
                    </div>
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
                        <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1">{new Date().getFullYear()}년 건수</p>
                        <p className="text-2xl font-black text-[var(--accent)]">{thisYear.length}<span className="text-sm ml-1 font-bold text-[var(--toss-gray-3)]">건</span></p>
                    </div>
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
                        <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1">{new Date().getFullYear()}년 지급</p>
                        <p className="text-2xl font-black text-emerald-600">{yearTotal.toLocaleString()}<span className="text-sm ml-1 font-bold text-[var(--toss-gray-3)]">원</span></p>
                    </div>
                </div>

                {/* 등록 폼 */}
                {showForm && (
                    <form onSubmit={handleSubmit} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm space-y-4 animate-in slide-in-from-top-4">
                        <h3 className="text-sm font-bold text-[var(--foreground)]">경조사 등록</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <select value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" required>
                                <option value="">직원 선택</option>
                                {filtered.map((s) => <option key={s.id as string} value={s.id as string}>{s.name as string} ({(s.department as string) || '미배정'})</option>)}
                            </select>
                            <select value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none">
                                {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <SmartDatePicker value={form.event_date} onChange={val => setForm({ ...form, event_date: val })} inputClassName="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" />
                            <div className="flex flex-col gap-1">
                                <input type="number" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} placeholder="경조금 (원)" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                                <p className="text-[9px] text-[var(--toss-gray-3)] font-bold ml-1">가이드: {AMOUNT_GUIDE[form.event_type] || '—'}원</p>
                            </div>
                            <input type="text" value={form.relation} onChange={e => setForm({ ...form, relation: e.target.value })} placeholder="관계 (본인/부모/배우자 등)" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                            <input type="text" value={form.recipient} onChange={e => setForm({ ...form, recipient: e.target.value })} placeholder="대상자명" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                            <input type="text" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="비고" className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]" />
                            <label className="flex items-center gap-2 text-[11px] font-bold text-[var(--foreground)]">
                                <input type="checkbox" checked={form.wreath_sent} onChange={e => setForm({ ...form, wreath_sent: e.target.checked })} className="rounded" /> 화환/조화 발송
                            </label>
                        </div>
                        <div className="flex justify-end">
                            <button type="submit" className="px-4 py-2.5 bg-[var(--accent)] text-white text-[11px] font-bold rounded-xl shadow-md">등록</button>
                        </div>
                    </form>
                )}

                {/* 필터 */}
                <div className="flex gap-1 bg-[var(--card)] border border-[var(--border)] rounded-xl p-1 w-fit overflow-x-auto">
                    {['전체', ...EVENT_TYPES].map(t => (
                        <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${filter === t ? 'bg-[var(--accent)] text-white' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}>{t}</button>
                    ))}
                </div>

                {/* 이력 테이블 */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                    <ResponsiveTable<CongratRecord>
                        columns={COLUMNS}
                        rows={filteredRecords}
                        keyField="id"
                        emptyMessage="경조사 이력이 없습니다"
                        className="text-[11px]"
                    />
                </div>
            </div>
        </div>
    );
}

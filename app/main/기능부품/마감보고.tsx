'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from './공통/SmartDatePicker';

interface ClosureItem {
    id?: string;
    patient_name: string;
    amount: number;
    payment_method: string;
    receipt_type: string;
    memo: string;
}

interface CheckDoc {
    id?: string;
    check_number: string;
    amount: number;
    bank_name: string;
}

interface DailyClosure {
    id: string;
    date: string;
    total_amount: number;
    petty_cash_start: number;
    petty_cash_end: number;
    status: string;
    memo: string;
    created_by: string;
}

export default function DailyClosurePage({ user }: { user: any }) {
    const [view, setView] = useState<'list' | 'form'>('list');
    const [loading, setLoading] = useState(false);
    const [closures, setClosures] = useState<DailyClosure[]>([]);

    // Form State
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [pettyCashStart, setPettyCashStart] = useState(0);
    const [pettyCashEnd, setPettyCashEnd] = useState(0);
    const [memo, setMemo] = useState('');
    const [items, setItems] = useState<ClosureItem[]>([]);
    const [checks, setChecks] = useState<CheckDoc[]>([]);

    const totalCalculated = useMemo(() => items.reduce((sum, item) => sum + item.amount, 0), [items]);
    const balance = useMemo(() => (pettyCashStart + totalCalculated) - pettyCashEnd, [pettyCashStart, totalCalculated, pettyCashEnd]);

    useEffect(() => {
        loadClosures();
    }, []);

    const loadClosures = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('daily_closures')
            .select('*')
            .order('date', { ascending: false });
        if (error) { console.error('마감보고 목록 조회 오류:', error); }
        else if (data) setClosures(data);
        setLoading(false);
    };

    const addItem = () => {
        setItems([...items, { patient_name: '', amount: 0, payment_method: '카드', receipt_type: '진료비', memo: '' }]);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: keyof ClosureItem, value: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const addCheck = () => {
        setChecks([...checks, { check_number: '', amount: 100000, bank_name: '' }]);
    };

    const removeCheck = (index: number) => {
        setChecks(checks.filter((_, i) => i !== index));
    };

    const saveClosure = async () => {
        if (items.length === 0) {
            alert('수납 내역을 최소 하나 이상 입력해주세요.');
            return;
        }

        setLoading(true);
        try {
            const closureData = {
                company_id: user.company_id,
                date: selectedDate,
                total_amount: totalCalculated,
                petty_cash_start: pettyCashStart,
                petty_cash_end: pettyCashEnd,
                status: 'completed',
                created_by: user.id,
                memo: memo
            };

            const { data: closure, error: cError } = await supabase
                .from('daily_closures')
                .upsert(closureData, { onConflict: 'company_id, date' })
                .select()
                .single();

            if (cError) throw cError;

            // Delete existing items if any (for update)
            const { error: delErr1 } = await supabase.from('daily_closure_items').delete().eq('closure_id', closure.id);
            if (delErr1) throw delErr1;
            const { error: delErr2 } = await supabase.from('daily_checks').delete().eq('closure_id', closure.id);
            if (delErr2) throw delErr2;

            // Insert new items
            if (items.length > 0) {
                const { error: insErr1 } = await supabase.from('daily_closure_items').insert(
                    items.map(item => ({ ...item, closure_id: closure.id }))
                );
                if (insErr1) throw insErr1;
            }

            if (checks.length > 0) {
                const { error: insErr2 } = await supabase.from('daily_checks').insert(
                    checks.map(check => ({ ...check, closure_id: closure.id }))
                );
                if (insErr2) throw insErr2;
            }

            alert('마감 보고가 저장되었습니다.');
            setView('list');
            loadClosures();
        } catch (err: any) {
            alert('저장 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="daily-closure-view">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span>💰</span> 원무과 마감보고
                    </h2>
                </div>
                <button
                    data-testid="daily-closure-toggle-view"
                    onClick={() => setView(view === 'list' ? 'form' : 'list')}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-gray-900 text-white shadow-sm hover:bg-black transition-all"
                >
                    {view === 'list' ? '➕ 새 마감 작성' : '📋 마감 목록 보기'}
                </button>
            </div>

            {view === 'list' ? (
                <div className="grid gap-4">
                    {loading ? (
                        <div className="text-center py-20 text-gray-400">로딩 중...</div>
                    ) : closures.length === 0 ? (
                        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-medium">
                            등록된 마감 보고가 없습니다.
                        </div>
                    ) : (
                        closures.map(c => (
                            <div key={c.id} className="p-5 bg-white rounded-2xl border border-[var(--toss-border)] shadow-sm flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-bold text-gray-800">{c.date}</p>
                                    <p className="text-[11px] text-gray-400 mt-1">총 수납액: {c.total_amount.toLocaleString()}원</p>
                                </div>
                                <div className="text-right">
                                    <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-green-100 text-green-700">마감완료</span>
                                    <p className="text-[10px] text-gray-300 mt-2">작성자: {c.created_by}</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                <div className="max-w-5xl mx-auto space-y-6 pb-20">
                    {/* 기본 정보 */}
                    <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-gray-500 uppercase">마감 일자 *</label>
                            <SmartDatePicker value={selectedDate} onChange={setSelectedDate} data-testid="daily-closure-date" className="w-full h-11 px-4 bg-gray-50 border-none rounded-xl text-sm font-medium" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-gray-500 uppercase">기초 시재 (전일 이월) *</label>
                            <input
                                type="number"
                                value={pettyCashStart}
                                onChange={e => setPettyCashStart(Number(e.target.value))}
                                className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-gray-500 uppercase">기말 시재 (마감 시재) *</label>
                            <input
                                type="number"
                                value={pettyCashEnd}
                                onChange={e => setPettyCashEnd(Number(e.target.value))}
                                className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                    </div>

                    {/* 수납 상세 */}
                    <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-bold text-gray-800">📊 수납 내역 상세</h3>
                            <button data-testid="daily-closure-add-item" onClick={addItem} className="px-3 py-1.5 text-[11px] font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700">➕ 항목 추가</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="py-3 px-2 font-bold text-gray-400">환자명</th>
                                        <th className="py-3 px-2 font-bold text-gray-400">금액</th>
                                        <th className="py-3 px-2 font-bold text-gray-400">수납방식</th>
                                        <th className="py-3 px-2 font-bold text-gray-400">항목</th>
                                        <th className="py-3 px-2 font-bold text-gray-400">메모</th>
                                        <th className="py-3 px-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, idx) => (
                                        <tr key={idx} className="border-b border-gray-50 last:border-0">
                                            <td className="py-2 px-1"><input data-testid={`daily-closure-item-patient-${idx}`} value={item.patient_name} onChange={e => updateItem(idx, 'patient_name', e.target.value)} className="w-full bg-transparent outline-none font-medium" placeholder="환자명" /></td>
                                            <td className="py-2 px-1"><input data-testid={`daily-closure-item-amount-${idx}`} type="number" value={item.amount} onChange={e => updateItem(idx, 'amount', Number(e.target.value))} className="w-full bg-transparent outline-none font-bold text-blue-600" /></td>
                                            <td className="py-2 px-1">
                                                <select value={item.payment_method} onChange={e => updateItem(idx, 'payment_method', e.target.value)} className="bg-transparent outline-none">
                                                    <option value="카드">카드</option>
                                                    <option value="현금">현금</option>
                                                    <option value="계좌이체">계좌이체</option>
                                                </select>
                                            </td>
                                            <td className="py-2 px-1">
                                                <select value={item.receipt_type} onChange={e => updateItem(idx, 'receipt_type', e.target.value)} className="bg-transparent outline-none">
                                                    <option value="진료비">진료비</option>
                                                    <option value="제증명">제증명</option>
                                                    <option value="기타">기타</option>
                                                </select>
                                            </td>
                                            <td className="py-2 px-1"><input value={item.memo} onChange={e => updateItem(idx, 'memo', e.target.value)} className="w-full bg-transparent outline-none text-gray-400" placeholder="비고" /></td>
                                            <td className="py-2 px-1"><button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">✕</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 수표 조회/기록 */}
                    <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-bold text-gray-800">🏴 수표 및 자기앞수표 기록</h3>
                            <div className="flex gap-2">
                                <a href="https://www.giro.or.kr/check/check_01.do" target="_blank" className="px-3 py-1.5 text-[11px] font-bold text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200">기로 수표조회 가기 ↗</a>
                                <button data-testid="daily-closure-add-check" onClick={addCheck} className="px-3 py-1.5 text-[11px] font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700">➕ 수표 추가</button>
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {checks.map((check, idx) => (
                                <div key={idx} className="p-4 bg-gray-50 rounded-xl relative group">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-gray-400">수표번호</label>
                                            <input
                                                data-testid={`daily-closure-check-number-${idx}`}
                                                value={check.check_number}
                                                onChange={e => {
                                                    const newChecks = [...checks];
                                                    newChecks[idx].check_number = e.target.value;
                                                    setChecks(newChecks);
                                                }}
                                                className="w-full bg-transparent outline-none text-sm font-mono font-bold"
                                                placeholder="00000000"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-gray-400">금액</label>
                                            <input
                                                type="number"
                                                value={check.amount}
                                                onChange={e => {
                                                    const newChecks = [...checks];
                                                    newChecks[idx].amount = Number(e.target.value);
                                                    setChecks(newChecks);
                                                }}
                                                className="w-full bg-transparent outline-none text-sm font-bold text-purple-600"
                                            />
                                        </div>
                                    </div>
                                    <button onClick={() => removeCheck(idx)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 transition-opacity">✕</button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 요약 및 저장 */}
                    <div className="bg-gray-900 rounded-3xl p-8 text-white shadow-2xl space-y-6">
                        <div className="grid grid-cols-2 gap-8 border-b border-white/10 pb-8">
                            <div>
                                <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">오늘 총 수납금액</p>
                                <p className="text-3xl font-black">{totalCalculated.toLocaleString()}원</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">정산 오차 (현금)</p>
                                <p className={`text-3xl font-black ${balance === 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {balance === 0 ? '정상' : `${balance > 0 ? '+' : ''}${balance.toLocaleString()}원`}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[11px] font-bold text-gray-400 uppercase">마감 총평 및 특이사항</label>
                            <textarea
                                data-testid="daily-closure-memo"
                                value={memo}
                                onChange={e => setMemo(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:ring-2 focus:ring-white/20 h-24 resize-none"
                                placeholder="당일 특이사항을 입력하세요..."
                            />
                        </div>

                        <button
                            data-testid="daily-closure-save"
                            onClick={saveClosure}
                            disabled={loading}
                            className="w-full py-4 bg-white text-gray-900 text-sm font-black rounded-2xl hover:bg-gray-100 transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                            {loading ? '저장 중...' : '오늘 업무 마감 및 보고 저장'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

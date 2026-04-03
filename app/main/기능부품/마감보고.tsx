'use client';
import { toast } from '@/lib/toast';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
    company_id?: string | null;
    created_by_name?: string | null;
    created_at?: string | null;
}

const DEPARTMENT_HEAD_KEYWORDS = ['부서장', '팀장', '과장', '실장', '부장', '이사', '원장', '병원장'];

export default function DailyClosurePage({
    user,
    staffs = [],
    selectedCompanyId = null,
}: {
    user: any;
    staffs?: any[];
    selectedCompanyId?: string | null;
}) {
    const isDepartmentHeadOrHigher = useMemo(() => {
        const position = String(user?.position || '');
        return (
            user?.role === 'admin' ||
            user?.role === 'manager' ||
            user?.permissions?.mso === true ||
            DEPARTMENT_HEAD_KEYWORDS.some((keyword) => position.includes(keyword))
        );
    }, [user?.permissions?.mso, user?.position, user?.role]);

    const canReadClosures = isDepartmentHeadOrHigher;
    const effectiveCompanyId = selectedCompanyId || user?.company_id || null;
    const [view, setView] = useState<'list' | 'form'>(canReadClosures ? 'list' : 'form');
    const [loading, setLoading] = useState(false);
    const [closures, setClosures] = useState<DailyClosure[]>([]);
    const [activeClosure, setActiveClosure] = useState<DailyClosure | null>(null);

    // Form State
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [pettyCashStart, setPettyCashStart] = useState(0);
    const [pettyCashEnd, setPettyCashEnd] = useState(0);
    const [memo, setMemo] = useState('');
    const [items, setItems] = useState<ClosureItem[]>([]);
    const [checks, setChecks] = useState<CheckDoc[]>([]);

    const totalCalculated = useMemo(() => items.reduce((sum, item) => sum + item.amount, 0), [items]);
    const cashTotal = useMemo(() => items.filter(item => item.payment_method === '현금').reduce((sum, item) => sum + item.amount, 0), [items]);
    const balance = useMemo(() => (pettyCashStart + cashTotal) - pettyCashEnd, [pettyCashStart, cashTotal, pettyCashEnd]);
    const staffNameById = useMemo(
        () => new Map((staffs || []).map((staff: any) => [String(staff?.id || ''), String(staff?.name || '').trim()])),
        [staffs]
    );
    const isOwnActiveClosure = Boolean(activeClosure?.created_by && String(activeClosure.created_by) === String(user?.id || ''));
    const canEditSelectedDateClosure = !activeClosure || isOwnActiveClosure;

    const getAuthorName = useCallback((closure: DailyClosure | null | undefined) => {
        if (!closure) return '작성자 미상';
        const explicitName = String(closure.created_by_name || '').trim();
        if (explicitName) return explicitName;
        const mappedName = staffNameById.get(String(closure.created_by || ''));
        if (mappedName) return mappedName;
        return String(closure.created_by || '').trim() || '작성자 미상';
    }, [staffNameById]);

    const resetFormFields = useCallback(() => {
        setPettyCashStart(0);
        setPettyCashEnd(0);
        setMemo('');
        setItems([]);
        setChecks([]);
    }, []);

    useEffect(() => {
        setView(canReadClosures ? 'list' : 'form');
    }, [canReadClosures]);

    const loadClosures = useCallback(async () => {
        if (!canReadClosures || !effectiveCompanyId) {
            setClosures([]);
            return;
        }
        setLoading(true);
        const { data, error } = await supabase
            .from('daily_closures')
            .select('*')
            .eq('company_id', effectiveCompanyId)
            .order('date', { ascending: false });
        if (error) { console.error('마감보고 목록 조회 오류:', error); }
        else if (data) setClosures(data);
        setLoading(false);
    }, [canReadClosures, effectiveCompanyId]);

    const loadClosureDetails = useCallback(async (closure: DailyClosure) => {
        const [{ data: detailItems, error: itemError }, { data: detailChecks, error: checkError }] = await Promise.all([
            supabase.from('daily_closure_items').select('*').eq('closure_id', closure.id).order('created_at', { ascending: true }),
            supabase.from('daily_checks').select('*').eq('closure_id', closure.id).order('created_at', { ascending: true }),
        ]);

        if (itemError) {
            console.error('마감보고 상세 항목 조회 오류:', itemError);
        }
        if (checkError) {
            console.error('마감보고 수표 조회 오류:', checkError);
        }

        setPettyCashStart(Number(closure.petty_cash_start) || 0);
        setPettyCashEnd(Number(closure.petty_cash_end) || 0);
        setMemo(String(closure.memo || ''));
        setItems((detailItems || []).map((item: any) => ({
            id: item.id,
            patient_name: String(item.patient_name || ''),
            amount: Number(item.amount) || 0,
            payment_method: String(item.payment_method || '카드'),
            receipt_type: String(item.receipt_type || '진료비'),
            memo: String(item.memo || ''),
        })));
        setChecks((detailChecks || []).map((check: any) => ({
            id: check.id,
            check_number: String(check.check_number || ''),
            amount: Number(check.amount) || 0,
            bank_name: String(check.bank_name || ''),
        })));
    }, []);

    const loadSelectedDateClosure = useCallback(async () => {
        if (!effectiveCompanyId || !selectedDate) {
            setActiveClosure(null);
            resetFormFields();
            return;
        }

        const { data, error } = await supabase
            .from('daily_closures')
            .select('*')
            .eq('company_id', effectiveCompanyId)
            .eq('date', selectedDate)
            .maybeSingle();

        if (error) {
            console.error('선택 날짜 마감보고 조회 오류:', error);
            setActiveClosure(null);
            resetFormFields();
            return;
        }

        if (!data) {
            setActiveClosure(null);
            resetFormFields();
            return;
        }

        setActiveClosure(data);

        if (String(data.created_by || '') === String(user?.id || '')) {
            await loadClosureDetails(data);
            return;
        }

        resetFormFields();
    }, [effectiveCompanyId, loadClosureDetails, resetFormFields, selectedDate, user?.id]);

    useEffect(() => {
        void loadClosures();
    }, [loadClosures]);

    useEffect(() => {
        void loadSelectedDateClosure();
    }, [loadSelectedDateClosure]);

    const openClosureForEdit = useCallback((closure: DailyClosure) => {
        if (String(closure.created_by || '') !== String(user?.id || '')) {
            return;
        }
        setSelectedDate(closure.date);
        setView('form');
    }, [user?.id]);

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
        if (!effectiveCompanyId) {
            toast('회사 정보가 없어 마감보고를 저장할 수 없습니다.', 'warning');
            return;
        }

        if (items.length === 0) {
            toast('수납 내역을 최소 하나 이상 입력해주세요.', 'warning');
            return;
        }

        if (!canEditSelectedDateClosure) {
            toast('해당 날짜 마감보고는 작성자 본인만 수정할 수 있습니다.', 'warning');
            return;
        }

        setLoading(true);
        try {
            const closureData = {
                company_id: effectiveCompanyId,
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

            toast('마감보고가 저장되었습니다.', 'success');
            setActiveClosure(closure);
            if (canReadClosures) {
                setView('list');
            }
            await loadClosures();
        } catch (err: unknown) {
            toast('저장 중 오류가 발생했습니다: ' + ((err as Error)?.message ?? String(err)), 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4" data-testid="daily-closure-view">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span>💰</span> 마감보고
                    </h2>
                    <p className="mt-1 text-[11px] font-medium text-[var(--toss-gray-3)]">
                        작성은 누구나 가능하며, 목록 열람은 부서장 이상만 가능합니다.
                    </p>
                </div>
                {canReadClosures ? (
                    <button
                        data-testid="daily-closure-toggle-view"
                        onClick={() => setView(view === 'list' ? 'form' : 'list')}
                        className="px-4 py-2 text-xs font-bold rounded-xl bg-gray-900 text-white shadow-sm hover:bg-black transition-all"
                    >
                        {view === 'list' ? '➕ 새 마감 작성' : '📋 마감 목록 보기'}
                    </button>
                ) : (
                    <div
                        data-testid="daily-closure-read-restricted-note"
                        className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)]"
                    >
                        목록 열람은 부서장 이상
                    </div>
                )}
            </div>

            {view === 'list' ? (
                <div className="grid gap-4" data-testid="daily-closure-list">
                    {loading ? (
                        <div className="text-center py-20 text-[var(--toss-gray-3)]">로딩 중...</div>
                    ) : closures.length === 0 ? (
                        <div className="text-center py-20 border-2 border-dashed border-[var(--border)] rounded-2xl text-[var(--toss-gray-3)] font-medium">
                            등록된 마감 보고가 없습니다.
                        </div>
                    ) : (
                        closures.map(c => (
                            <div
                                key={c.id}
                                data-testid={`daily-closure-card-${c.id}`}
                                className="p-5 bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm flex justify-between items-center gap-4"
                            >
                                <div>
                                    <p className="text-sm font-bold text-[var(--foreground)]">{c.date}</p>
                                    <p className="text-[11px] text-[var(--toss-gray-3)] mt-1">총 수납액: {c.total_amount.toLocaleString()}원</p>
                                </div>
                                <div className="text-right">
                                    <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-green-100 text-green-700">마감완료</span>
                                    <p data-testid={`daily-closure-author-${c.id}`} className="text-[10px] text-[var(--toss-gray-3)] mt-2">
                                        작성자: {getAuthorName(c)}
                                    </p>
                                    {String(c.created_by || '') === String(user?.id || '') ? (
                                        <button
                                            type="button"
                                            data-testid={`daily-closure-edit-${c.id}`}
                                            onClick={() => openClosureForEdit(c)}
                                            className="mt-2 text-[11px] font-bold text-[var(--accent)] hover:underline"
                                        >
                                            수정
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                <div className="max-w-5xl mx-auto space-y-4 pb-20">
                    {activeClosure ? (
                        <div
                            data-testid="daily-closure-date-status"
                            className={`rounded-2xl border p-4 text-sm font-semibold ${
                                isOwnActiveClosure
                                    ? 'border-blue-100 bg-blue-50 text-blue-700'
                                    : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}
                        >
                            {isOwnActiveClosure
                                ? `${selectedDate} 작성분을 수정 중입니다.`
                                : canReadClosures
                                    ? `${selectedDate} 마감보고는 ${getAuthorName(activeClosure)} 작성본이 이미 등록되어 있어 열람만 가능합니다.`
                                    : `${selectedDate} 마감보고가 이미 등록되어 있어 작성자 본인만 수정할 수 있습니다.`}
                        </div>
                    ) : null}

                    {/* 기본 정보 */}
                    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase">마감 일자 *</label>
                            <SmartDatePicker value={selectedDate} onChange={setSelectedDate} data-testid="daily-closure-date" className="w-full h-11 px-4 bg-[var(--tab-bg)] border-none rounded-xl text-sm font-medium" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase">기초 시재 (전일 이월) *</label>
                            <input
                                type="number"
                                value={pettyCashStart}
                                onChange={e => setPettyCashStart(Number(e.target.value))}
                                className="w-full px-4 py-3 bg-[var(--tab-bg)] border-none rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase">기말 시재 (마감 시재) *</label>
                            <input
                                type="number"
                                value={pettyCashEnd}
                                onChange={e => setPettyCashEnd(Number(e.target.value))}
                                className="w-full px-4 py-3 bg-[var(--tab-bg)] border-none rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                    </div>

                    {/* 수납 상세 */}
                    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 shadow-sm space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-bold text-[var(--foreground)]">📊 수납 내역 상세</h3>
                            <button data-testid="daily-closure-add-item" onClick={addItem} className="px-3 py-1.5 text-[11px] font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700">➕ 항목 추가</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-[var(--border-subtle)]">
                                        <th className="py-3 px-2 font-bold text-[var(--toss-gray-3)]">환자명</th>
                                        <th className="py-3 px-2 font-bold text-[var(--toss-gray-3)]">금액</th>
                                        <th className="py-3 px-2 font-bold text-[var(--toss-gray-3)]">수납방식</th>
                                        <th className="py-3 px-2 font-bold text-[var(--toss-gray-3)]">항목</th>
                                        <th className="py-3 px-2 font-bold text-[var(--toss-gray-3)]">메모</th>
                                        <th className="py-3 px-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, idx) => (
                                        <tr key={idx} className="border-b border-[var(--border-subtle)] last:border-0">
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
                                            <td className="py-2 px-1"><input value={item.memo} onChange={e => updateItem(idx, 'memo', e.target.value)} className="w-full bg-transparent outline-none text-[var(--toss-gray-3)]" placeholder="비고" /></td>
                                            <td className="py-2 px-1"><button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">✕</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 수표 조회/기록 */}
                    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 shadow-sm space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-bold text-[var(--foreground)]">🏴 수표 및 자기앞수표 기록</h3>
                            <div className="flex gap-2">
                                <a href="https://www.giro.or.kr/check/check_01.do" target="_blank" className="px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] bg-[var(--tab-bg)] rounded-lg hover:bg-[var(--tab-bg)]">기로 수표조회 가기 ↗</a>
                                <button data-testid="daily-closure-add-check" onClick={addCheck} className="px-3 py-1.5 text-[11px] font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700">➕ 수표 추가</button>
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {checks.map((check, idx) => (
                                <div key={idx} className="p-3 sm:p-4 bg-[var(--tab-bg)] rounded-xl relative group">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-[var(--toss-gray-3)]">수표번호</label>
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
                                            <label className="text-[10px] font-bold text-[var(--toss-gray-3)]">금액</label>
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
                    <div className="bg-gray-900 rounded-2xl p-5 text-white shadow-sm space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-white/10 pb-8">
                            <div>
                                <p className="text-xs font-bold text-[var(--toss-gray-3)] mb-2 uppercase tracking-wider">오늘 총 수납금액</p>
                                <p className="text-2xl sm:text-3xl font-black">{totalCalculated.toLocaleString()}원</p>
                            </div>
                            <div className="sm:text-right">
                                <p className="text-xs font-bold text-[var(--toss-gray-3)] mb-2 uppercase tracking-wider">정산 오차 (현금)</p>
                                <p className={`text-2xl sm:text-3xl font-black ${balance === 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {balance === 0 ? '정상' : `${balance > 0 ? '+' : ''}${balance.toLocaleString()}원`}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">마감 총평 및 특이사항</label>
                            <textarea
                                data-testid="daily-closure-memo"
                                value={memo}
                                onChange={e => setMemo(e.target.value)}
                                className="w-full bg-[var(--card)]/5 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:ring-2 focus:ring-white/20 h-24 resize-none"
                                placeholder="당일 특이사항을 입력하세요..."
                            />
                        </div>

                        <button
                            data-testid="daily-closure-save"
                            onClick={saveClosure}
                            disabled={loading || !canEditSelectedDateClosure}
                            className="w-full py-4 bg-[var(--card)] text-[var(--foreground)] text-sm font-black rounded-2xl hover:bg-[var(--tab-bg)] transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                            {loading ? '저장 중...' : isOwnActiveClosure ? '작성한 마감보고 수정 저장' : '오늘 업무 마감 및 보고 저장'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

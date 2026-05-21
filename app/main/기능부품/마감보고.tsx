'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { canAccessExtraFeature, isAdminUser } from '@/lib/access-control';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from './공통/SmartDatePicker';
import ClosureItemsGrid from './마감보고Grid';

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

export default function DailyClosurePage({
    user,
    staffs = [],
    selectedCompanyId = null,
}: {
    user: any;
    staffs?: any[];
    selectedCompanyId?: string | null;
}) {
    const { dialog, openConfirm } = useActionDialog();
    const normalizedPosition = String(user?.position || '').trim();
    const isAdmin = useMemo(() => isAdminUser(user), [user]);
    const isSyIncDirector = useMemo(() => {
        return String(user?.company || '').trim() === 'SY INC.' && /(이사|director)/i.test(normalizedPosition);
    }, [normalizedPosition, user?.company]);

    const hasClosureAccess = useMemo(() => {
        return isAdmin || canAccessExtraFeature(user, '마감보고');
    }, [isAdmin, user]);

    const canReadClosures = hasClosureAccess;
    const canEditClosures = hasClosureAccess;
    const canReadAcrossCompanies = (isSyIncDirector || isAdmin) && !selectedCompanyId;
    const baseCompanyId = selectedCompanyId || user?.company_id || null;
    const listCompanyId = canReadAcrossCompanies ? null : baseCompanyId;
    const [view, setView] = useState<'list' | 'form'>(canReadClosures ? 'list' : 'form');
    const [loading, setLoading] = useState(false);
    const [closures, setClosures] = useState<DailyClosure[]>([]);
    const [activeClosure, setActiveClosure] = useState<DailyClosure | null>(null);
    const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
    const detailCompanyId = editingCompanyId || baseCompanyId;

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
    const canEditSelectedDateClosure = !activeClosure || canEditClosures;

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
        if (!canReadClosures) {
            setClosures([]);
            return;
        }
        setLoading(true);
        let query = supabase
            .from('daily_closures')
            .select('*')
            .order('date', { ascending: false });

        if (listCompanyId) {
            query = query.eq('company_id', listCompanyId);
        }

        const { data, error } = await query;
        if (error) { console.error('마감보고 목록 조회 오류:', error); }
        else if (data) setClosures(data);
        setLoading(false);
    }, [canReadClosures, listCompanyId]);

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
        if (canReadAcrossCompanies && !detailCompanyId) {
            setActiveClosure(null);
            resetFormFields();
            return;
        }

        if (!detailCompanyId || !selectedDate) {
            setActiveClosure(null);
            resetFormFields();
            return;
        }

        const { data, error } = await supabase
            .from('daily_closures')
            .select('*')
            .eq('company_id', detailCompanyId)
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

        if (canReadClosures || String(data.created_by || '') === String(user?.id || '')) {
            await loadClosureDetails(data);
            return;
        }

        resetFormFields();
    }, [canReadAcrossCompanies, canReadClosures, detailCompanyId, loadClosureDetails, resetFormFields, selectedDate, user?.id]);

    useEffect(() => {
        void loadClosures();
    }, [loadClosures]);

    useEffect(() => {
        void loadSelectedDateClosure();
    }, [loadSelectedDateClosure]);

    const openClosureForEdit = useCallback(async (closure: DailyClosure) => {
        if (!canEditClosures && String(closure.created_by || '') !== String(user?.id || '')) {
            return;
        }
        setActiveClosure(closure);
        setEditingCompanyId(String(closure.company_id || '').trim() || null);
        setSelectedDate(closure.date);
        setPettyCashStart(Number(closure.petty_cash_start) || 0);
        setPettyCashEnd(Number(closure.petty_cash_end) || 0);
        setMemo(String(closure.memo || ''));
        setView('form');
        await loadClosureDetails(closure);
    }, [canEditClosures, loadClosureDetails, user?.id]);

    const addItem = () => {
        setItems([...items, { patient_name: '', amount: 0, payment_method: '카드', receipt_type: '진료비', memo: '' }]);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: keyof ClosureItem, value: unknown) => {
        const newItems = [...items];
        const target = { ...newItems[index] };
        if (field === 'amount') {
            const num = typeof value === 'number' ? value : Number(value);
            target.amount = Number.isFinite(num) ? num : 0;
        } else {
            target[field] = String(value ?? '') as never;
        }
        newItems[index] = target;
        setItems(newItems);
    };

    const addCheck = () => {
        setChecks([...checks, { check_number: '', amount: 100000, bank_name: '' }]);
    };

    const removeCheck = (index: number) => {
        setChecks(checks.filter((_, i) => i !== index));
    };

    const saveClosure = async () => {
        if (!detailCompanyId) {
            toast('회사 정보가 없어 마감보고를 저장할 수 없습니다.', 'warning');
            return;
        }

        if (!canEditClosures) {
            toast('마감보고 수정 권한이 없습니다.', 'warning');
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
            const preservedAuthorName = activeClosure ? getAuthorName(activeClosure) : String(user?.name || '').trim();
            const closureData = {
                company_id: detailCompanyId,
                date: selectedDate,
                total_amount: totalCalculated,
                petty_cash_start: pettyCashStart,
                petty_cash_end: pettyCashEnd,
                status: 'completed',
                created_by: activeClosure?.created_by || user.id,
                created_by_name: preservedAuthorName || null,
                memo: memo
            };

            const upsertClosure = async (payload: Record<string, unknown>) =>
                await supabase
                    .from('daily_closures')
                    .upsert(payload, { onConflict: 'company_id, date' })
                    .select()
                    .single();

            let { data: closure, error: cError } = await upsertClosure(closureData);

            if (cError && String(cError.message || '').includes("created_by_name")) {
                const { created_by_name: _ignored, ...fallbackClosureData } = closureData;
                ({ data: closure, error: cError } = await upsertClosure(fallbackClosureData));
            }

            if (cError) throw cError;

            // Delete existing items if any (for update)
            const { error: delErr1 } = await supabase.from('daily_closure_items').delete().eq('closure_id', closure.id);
            if (delErr1) throw delErr1;
            const { error: delErr2 } = await supabase.from('daily_checks').delete().eq('closure_id', closure.id);
            if (delErr2) throw delErr2;

            // Insert new items
            if (items.length > 0) {
                const { error: insErr1 } = await supabase.from('daily_closure_items').insert(
                    items.map(({ id: _itemId, ...item }) => ({ ...item, closure_id: closure.id }))
                );
                if (insErr1) throw insErr1;
            }

            if (checks.length > 0) {
                const { error: insErr2 } = await supabase.from('daily_checks').insert(
                    checks.map(({ id: _checkId, ...check }) => ({ ...check, closure_id: closure.id }))
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

    const deleteClosure = async (closure: DailyClosure) => {
        if (!canEditClosures) {
            toast('마감보고 삭제 권한이 없습니다.', 'warning');
            return;
        }

        const authorName = getAuthorName(closure);
        const confirmed = await openConfirm({
            title: '마감보고 삭제',
            description: `${closure.date} 마감보고를 삭제합니다.\n작성자: ${authorName}\n삭제 후에는 복구할 수 없습니다.`,
            confirmText: '삭제',
            tone: 'danger',
        });
        if (!confirmed) return;

        setLoading(true);
        try {
            const { error: deleteItemsError } = await supabase
                .from('daily_closure_items')
                .delete()
                .eq('closure_id', closure.id);
            if (deleteItemsError) throw deleteItemsError;

            const { error: deleteChecksError } = await supabase
                .from('daily_checks')
                .delete()
                .eq('closure_id', closure.id);
            if (deleteChecksError) throw deleteChecksError;

            const { error: deleteClosureError } = await supabase
                .from('daily_closures')
                .delete()
                .eq('id', closure.id);
            if (deleteClosureError) throw deleteClosureError;

            setClosures((prev) => prev.filter((item) => item.id !== closure.id));

            if (activeClosure?.id === closure.id) {
                setActiveClosure(null);
                setEditingCompanyId(null);
                resetFormFields();
                if (canReadClosures) {
                    setView('list');
                }
            }

            toast('마감보고를 삭제했습니다.', 'success');
            await loadClosures();
        } catch (err: unknown) {
            toast('삭제 중 오류가 발생했습니다: ' + ((err as Error)?.message ?? String(err)), 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4" data-testid="daily-closure-view">
            {dialog}
            {/* §4-12, §13.13 마감보고: Chart 이관 예정 안내 배너 + PageHeader 제목/서브 삭제 */}
            <div className="rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] font-bold text-amber-800">
                Chart 프로그램으로 이관 예정인 모듈입니다.
            </div>

            {/* 상단 컨트롤 바 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                {/* 좌측: 전체회사 열람 안내 */}
                {canReadAcrossCompanies ? (
                    <p
                        data-testid="daily-closure-all-company-note"
                        className="text-[11px] font-semibold text-[var(--accent)]"
                    >
                        SY INC. 이사 권한으로 전체 회사 마감보고를 열람 중입니다.
                    </p>
                ) : <span />}

                {/* 우측: 2-segmented + 새 마감 작성 버튼 */}
                {canReadClosures ? (
                    <div className="flex items-center gap-2">
                        {/* 2-segmented 컨트롤 */}
                        <div className="flex rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden bg-[var(--muted)]">
                            <button
                                type="button"
                                data-testid="daily-closure-toggle-view"
                                onClick={() => setView('list')}
                                className={`px-3 py-1.5 text-xs font-bold transition-all ${
                                    view === 'list'
                                        ? 'bg-[var(--accent)] text-white'
                                        : 'text-[var(--toss-gray-4)] hover:bg-[var(--card)]'
                                }`}
                            >
                                마감 목록
                            </button>
                            <button
                                type="button"
                                onClick={() => setView('form')}
                                className={`px-3 py-1.5 text-xs font-bold transition-all ${
                                    view === 'form'
                                        ? 'bg-[var(--accent)] text-white'
                                        : 'text-[var(--toss-gray-4)] hover:bg-[var(--card)]'
                                }`}
                            >
                                새 마감 작성
                            </button>
                        </div>
                        {/* 우측 primary 버튼 */}
                        <button
                            type="button"
                            onClick={() => {
                                setEditingCompanyId(null);
                                setActiveClosure(null);
                                resetFormFields();
                                setView('form');
                            }}
                            className="px-4 py-1.5 text-xs font-bold rounded-[var(--radius-md)] bg-[var(--accent)] text-white shadow-sm hover:opacity-90 transition-all"
                        >
                            새 마감 작성
                        </button>
                    </div>
                ) : (
                    <div
                        data-testid="daily-closure-read-restricted-note"
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)]"
                    >
                        마감보고 권한 또는 관리자 권한이 필요합니다.
                    </div>
                )}
            </div>

            {view === 'list' ? (
                <div data-testid="daily-closure-list">
                    {loading ? (
                        <div className="text-center py-20 text-[var(--toss-gray-3)] text-sm">로딩 중...</div>
                    ) : closures.length === 0 ? (
                        <div className="empty-state py-20">
                            등록된 마감 보고가 없습니다.
                        </div>
                    ) : (
                        /* 5열 테이블: 날짜 / 총 수납액 / 상태 칩 / 작성자 / 액션 */
                        <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden shadow-sm">
                            {/* 헤더 */}
                            <div className="grid grid-cols-[1fr_1fr_auto_1fr_auto] gap-x-4 px-4 py-2.5 bg-[var(--muted)] border-b border-[var(--border)] text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider">
                                <span>날짜</span>
                                <span>총 수납액</span>
                                <span>상태</span>
                                <span>작성자</span>
                                {canEditClosures ? <span className="text-right">액션</span> : <span />}
                            </div>
                            {/* 행 */}
                            {closures.map(c => (
                                <div
                                    key={c.id}
                                    data-testid={`daily-closure-card-${c.id}`}
                                    className="grid grid-cols-[1fr_1fr_auto_1fr_auto] gap-x-4 items-center px-4 py-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)] transition-colors"
                                >
                                    {/* 날짜 */}
                                    <p className="text-sm font-bold text-[var(--foreground)]">{c.date}</p>
                                    {/* 총 수납액 */}
                                    <p className="text-sm font-semibold text-[var(--foreground)]">
                                        {c.total_amount.toLocaleString()}원
                                    </p>
                                    {/* 상태 칩 */}
                                    <span className="badge badge-green whitespace-nowrap">마감완료</span>
                                    {/* 작성자 */}
                                    <p
                                        data-testid={`daily-closure-author-${c.id}`}
                                        className="text-xs text-[var(--toss-gray-3)] truncate"
                                    >
                                        {getAuthorName(c)}
                                    </p>
                                    {/* 액션 */}
                                    {canEditClosures ? (
                                        <div className="flex items-center justify-end gap-3">
                                            <button
                                                type="button"
                                                data-testid={`daily-closure-edit-${c.id}`}
                                                onClick={() => { void openClosureForEdit(c); }}
                                                className="text-xs font-bold text-[var(--accent)] hover:underline focus-visible:outline-[var(--accent)]"
                                            >
                                                수정
                                            </button>
                                            <button
                                                type="button"
                                                data-testid={`daily-closure-delete-${c.id}`}
                                                onClick={() => { void deleteClosure(c); }}
                                                disabled={loading}
                                                className="text-xs font-bold text-[var(--danger,#ef4444)] hover:underline disabled:opacity-50 focus-visible:outline-[var(--danger,#ef4444)]"
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    ) : <span />}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="max-w-5xl mx-auto space-y-4 pb-20">
                    {activeClosure ? (
                        <div
                            data-testid="daily-closure-date-status"
                            className={`rounded-[var(--radius-lg)] border p-4 text-sm font-semibold ${
                                isOwnActiveClosure
                                    ? 'border-[var(--accent-light,#dbeafe)] bg-[var(--accent-light,#eff6ff)] text-[var(--accent)]'
                                    : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}
                        >
                            {isOwnActiveClosure
                                ? `${selectedDate} 작성분을 수정 중입니다.`
                                : canEditClosures
                                    ? `${selectedDate} 마감보고는 ${getAuthorName(activeClosure)} 작성본이 이미 등록되어 있으며, 현재 권한으로 수정할 수 있습니다.`
                                    : `${selectedDate} 마감보고가 이미 등록되어 있어 작성자 본인만 수정할 수 있습니다.`}
                        </div>
                    ) : null}

                    {/* 기본 정보 — 3-col 필수 입력 */}
                    <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] p-4 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
                                마감 일자 <span className="text-[var(--accent)]">*</span>
                            </label>
                            <SmartDatePicker
                                value={selectedDate}
                                onChange={setSelectedDate}
                                data-testid="daily-closure-date"
                                className="w-full h-10 px-3 bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
                                기초 시재 (전일 이월) <span className="text-[var(--accent)]">*</span>
                            </label>
                            <input
                                data-testid="daily-closure-petty-cash-start"
                                type="number"
                                value={pettyCashStart}
                                onChange={e => setPettyCashStart(Number(e.target.value))}
                                className="w-full px-3 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
                                기말 시재 (마감 시재) <span className="text-[var(--accent)]">*</span>
                            </label>
                            <input
                                data-testid="daily-closure-petty-cash-end"
                                type="number"
                                value={pettyCashEnd}
                                onChange={e => setPettyCashEnd(Number(e.target.value))}
                                className="w-full px-3 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                            />
                        </div>
                    </div>

                    {/* 수납 상세 */}
                    <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] p-4 shadow-sm space-y-3">
                        <div className="section-header">
                            <h3 className="section-title">수납 내역 상세</h3>
                            <button
                                type="button"
                                data-testid="daily-closure-add-item"
                                onClick={addItem}
                                className="px-3 py-1.5 text-[11px] font-bold text-white bg-[var(--accent)] rounded-[var(--radius-md)] hover:opacity-90 transition-opacity focus-visible:outline-[var(--accent)]"
                            >
                                항목 추가
                            </button>
                        </div>
                        <ClosureItemsGrid
                            items={items}
                            updateItem={updateItem}
                            removeItem={removeItem}
                        />
                    </div>

                    {/* 수표 조회/기록 */}
                    <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] p-4 shadow-sm space-y-3">
                        <div className="section-header">
                            <h3 className="section-title">수표 및 자기앞수표 기록</h3>
                            <div className="flex gap-2">
                                <a
                                    href="https://www.giro.or.kr/check/check_01.do"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-md)] hover:bg-[var(--card)] transition-colors"
                                >
                                    기로 수표조회 ↗
                                </a>
                                <button
                                    type="button"
                                    data-testid="daily-closure-add-check"
                                    onClick={addCheck}
                                    className="px-3 py-1.5 text-[11px] font-bold text-white bg-[var(--accent)] rounded-[var(--radius-md)] hover:opacity-90 transition-opacity focus-visible:outline-[var(--accent)]"
                                >
                                    수표 추가
                                </button>
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {checks.map((check, idx) => (
                                <div key={idx} className="p-3 sm:p-4 bg-[var(--muted)] rounded-[var(--radius-md)] relative group border border-[var(--border)]">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                                className="w-full bg-transparent outline-none text-sm font-mono font-bold text-[var(--foreground)] focus:underline"
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
                                                className="w-full bg-transparent outline-none text-sm font-bold text-[var(--accent)] focus:underline"
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeCheck(idx)}
                                        className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-[var(--radius-md)] text-[var(--danger,#ef4444)] opacity-60 transition-all hover:bg-red-500/10 hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
                                        aria-label="수표 삭제"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 요약 다크 카드 */}
                    <div className="bg-[var(--foreground)] rounded-[var(--radius-lg)] p-5 text-[var(--card)] shadow-sm space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-white/10 pb-5">
                            <div>
                                <p className="text-[10px] font-bold text-white/50 mb-1.5 uppercase tracking-wider">오늘 총 수납금액</p>
                                <p className="text-2xl sm:text-3xl font-black">{totalCalculated.toLocaleString()}원</p>
                            </div>
                            <div className="sm:text-right">
                                <p className="text-[10px] font-bold text-white/50 mb-1.5 uppercase tracking-wider">정산 오차 (현금)</p>
                                <p className={`text-2xl sm:text-3xl font-black ${balance === 0 ? 'text-[var(--success,#22c55e)]' : 'text-[var(--danger,#ef4444)]'}`}>
                                    {balance === 0 ? '정상' : `${balance > 0 ? '+' : ''}${balance.toLocaleString()}원`}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider">마감 총평 및 특이사항</label>
                            <textarea
                                data-testid="daily-closure-memo"
                                value={memo}
                                onChange={e => setMemo(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-[var(--radius-md)] p-3 text-sm text-white outline-none focus:ring-2 focus:ring-white/20 h-24 resize-none placeholder:text-white/30"
                                placeholder="당일 특이사항을 입력하세요..."
                            />
                        </div>

                        {/* 풀폭 다크 저장 버튼 */}
                        <button
                            type="button"
                            data-testid="daily-closure-save"
                            onClick={saveClosure}
                            disabled={loading || !canEditSelectedDateClosure}
                            className="w-full py-4 bg-[var(--accent)] text-white text-sm font-black rounded-[var(--radius-lg)] hover:opacity-90 transition-all active:scale-[0.99] disabled:opacity-40 focus-visible:outline-white"
                        >
                            {loading ? '저장 중...' : activeClosure ? '마감보고 수정 저장' : '오늘 업무 마감 및 보고 저장'}
                        </button>

                        {activeClosure && canEditClosures ? (
                            <button
                                type="button"
                                data-testid="daily-closure-delete-active"
                                onClick={() => { void deleteClosure(activeClosure); }}
                                disabled={loading}
                                className="w-full py-3 border border-red-400/30 bg-red-500/10 text-sm font-bold text-[var(--danger,#ef4444)] rounded-[var(--radius-lg)] hover:bg-red-500/20 transition-all disabled:opacity-50 focus-visible:outline-[var(--danger,#ef4444)]"
                            >
                                {loading ? '처리 중...' : '현재 마감보고 삭제'}
                            </button>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}

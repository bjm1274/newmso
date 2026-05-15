'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from '../공통/SmartDatePicker';
import { getScopedActiveStaffs } from '@/lib/active-staff';
import { ExpandableTable, type ExpandableColumn } from '@/app/components/ExpandableTable';

const CHECKUP_TYPES = ['일반검진', '특수검진', '배치전검진', '잠복결핵검진'] as const;
const STATUS_OPTIONS = ['예정', '완료', '미수검'] as const;

// 채용검진은 일반검진으로 통합. 기존 DB 데이터 호환을 위해 표시·필터 단계에서 매핑.
const normalizeCheckupType = (raw: unknown): string => {
    const s = String(raw ?? '').trim();
    return s === '채용검진' ? '일반검진' : s;
};

type CheckupForm = {
    staff_id: string;
    checkup_type: string;
    completed_date: string;
    status: string;
    hospital: string;
    result: string;
    memo: string;
};

type CheckupRecord = {
    id: string;
    staff_id: string;
    staff_name: string;
    department?: string;
    company?: string;
    checkup_type?: string;
    completed_date?: string | null;
    hospital?: string;
    status?: string;
    result?: string;
    memo?: string;
    isVirtual?: boolean;
};

type Group = { sid: string; latest: CheckupRecord; history: CheckupRecord[] };

const emptyForm: CheckupForm = {
    staff_id: '',
    checkup_type: '일반검진',
    completed_date: '',
    status: '완료',
    hospital: '',
    result: '',
    memo: '',
};

const statusBadgeClass = (s?: string) =>
    s === '완료' ? 'bg-emerald-100 text-emerald-700'
    : s === '미수검' ? 'bg-red-500/20 text-red-700'
    : 'bg-amber-100 text-amber-700';

export default function HealthCheckupManagement({ staffs, selectedCo }: Record<string, unknown>) {
    const _staffs = (staffs as Record<string, unknown>[]) ?? [];
    const [records, setRecords] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState<CheckupForm>(emptyForm);
    const [showStaffSearch, setShowStaffSearch] = useState(false);
    const [staffSearchQuery, setStaffSearchQuery] = useState('');
    const [openColMenu, setOpenColMenu] = useState<string | null>(null);
    const [colFilter, setColFilter] = useState<{ checkup_type: string; status: string }>({ checkup_type: '', status: '' });
    const [colSort, setColSort] = useState<{ key: 'staff_name' | 'completed_date' | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'desc' });

    useEffect(() => {
        if (!openColMenu) return;
        const onDocClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && !target.closest('[data-col-menu]')) setOpenColMenu(null);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [openColMenu]);

    useEffect(() => { fetchRecords(); }, []);
    const fetchRecords = async () => {
        const { data } = await supabase.from('health_checkups').select('*').order('completed_date', { ascending: false });
        if (data) setRecords(data);
    };

    const filtered = getScopedActiveStaffs(_staffs, String(selectedCo ?? '전체'));
    const filteredRecords = records.filter((r: any) => selectedCo === '전체' || r.company === selectedCo);

    // 등록 폼·검색 모달용: 회사 범위 무시하고 ERP 전체 활성 직원
    const allStaffs = useMemo(() => getScopedActiveStaffs(_staffs, '전체'), [_staffs]);

    const searchedStaffs = useMemo(() => {
        const q = staffSearchQuery.trim().toLowerCase();
        if (!q) return allStaffs;
        return allStaffs.filter((s: any) =>
            String(s.name ?? '').toLowerCase().includes(q) ||
            String(s.department ?? '').toLowerCase().includes(q) ||
            String(s.company ?? '').toLowerCase().includes(q)
        );
    }, [allStaffs, staffSearchQuery]);

    const closeStaffSearch = () => {
        setShowStaffSearch(false);
        setStaffSearchQuery('');
    };

    const pickStaff = (id: string) => {
        setForm(prev => ({ ...prev, staff_id: id }));
        closeStaffSearch();
    };

    // 미수검 대상자: 회사 범위 내 활성 직원 중 "올해(현재 연도)"에 완료 검진이 없는 사람.
    const checkupDue = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return filtered.filter((s: any) => {
            const last = filteredRecords
                .filter((r: any) => r.staff_id === s.id && r.status === '완료' && r.completed_date)
                .sort((a: any, b: any) => new Date(b.completed_date || '').getTime() - new Date(a.completed_date || '').getTime())[0];
            if (!last) return true;
            const lastYear = new Date(last.completed_date).getFullYear();
            return Number.isFinite(lastYear) ? lastYear < currentYear : true;
        });
    }, [filtered, filteredRecords]);

    const displayRecords = useMemo(() => {
        let rows = filteredRecords;
        if (colFilter.checkup_type) rows = rows.filter((r: any) => normalizeCheckupType(r.checkup_type) === colFilter.checkup_type);
        if (colFilter.status === '미수검') {
            const dbMissed = rows.filter((r: any) => r.status === '미수검');
            const dbMissedStaffIds = new Set(dbMissed.map((r: any) => String(r.staff_id)));
            const virtuals = checkupDue
                .filter((s: any) => !dbMissedStaffIds.has(String(s.id)))
                .map((s: any) => ({
                    id: `virtual-missed-${s.id}`,
                    staff_id: s.id,
                    staff_name: s.name,
                    department: s.department || '미배정',
                    company: s.company,
                    checkup_type: '-',
                    completed_date: null,
                    hospital: '-',
                    status: '미수검',
                    isVirtual: true,
                }));
            rows = [...dbMissed, ...virtuals];
        } else if (colFilter.status) {
            rows = rows.filter((r: any) => r.status === colFilter.status);
        }
        return rows;
    }, [filteredRecords, colFilter, checkupDue]);

    // 직원별 그룹: 같은 staff_id의 검진 기록을 최신순으로 묶음.
    const groupedDisplay = useMemo<Group[]>(() => {
        const sorted = [...displayRecords].sort((a: any, b: any) => {
            const ad = String(a.completed_date ?? '');
            const bd = String(b.completed_date ?? '');
            if (ad === bd) return 0;
            if (!ad) return 1;
            if (!bd) return -1;
            return bd.localeCompare(ad);
        });
        const map = new Map<string, CheckupRecord[]>();
        for (const r of sorted) {
            const sid = String(r.staff_id ?? '');
            if (!sid) continue;
            if (!map.has(sid)) map.set(sid, []);
            map.get(sid)!.push(r as CheckupRecord);
        }
        let groups: Group[] = Array.from(map.entries()).map(([sid, rows]) => ({
            sid,
            latest: rows[0],
            history: rows.slice(1),
        }));
        if (colSort.key === 'staff_name') {
            const dir = colSort.dir === 'asc' ? 1 : -1;
            groups = groups.sort((a, b) =>
                String(a.latest.staff_name ?? '').localeCompare(String(b.latest.staff_name ?? ''), 'ko') * dir
            );
        } else if (colSort.key === 'completed_date') {
            const dir = colSort.dir === 'asc' ? 1 : -1;
            groups = groups.sort((a, b) => {
                const av = String(a.latest.completed_date ?? '');
                const bv = String(b.latest.completed_date ?? '');
                if (av === bv) return 0;
                if (!av) return 1;
                if (!bv) return -1;
                return av.localeCompare(bv) * dir;
            });
        }
        return groups;
    }, [displayRecords, colSort]);

    const handleDelete = async (id: string) => {
        if (!window.confirm('이 검진 기록을 삭제하시겠습니까?')) return;
        const { error } = await supabase.from('health_checkups').delete().eq('id', id);
        if (error) {
            console.error('health_checkups delete failed:', error);
            toast('삭제에 실패했습니다.', 'error');
            return;
        }
        setRecords(prev => prev.filter((r: any) => r.id !== id));
        toast('삭제되었습니다.', 'success');
    };

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

    const openEdit = (rec: CheckupRecord) => {
        setEditId(String(rec.id));
        setForm({
            staff_id: String(rec.staff_id ?? ''),
            checkup_type: normalizeCheckupType(rec.checkup_type ?? '일반검진'),
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
        const payload = {
            staff_id: form.staff_id,
            staff_name: (staff as any).name,
            company: (staff as any).company,
            department: (staff as any).department || '',
            checkup_type: form.checkup_type,
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

    // 행 액션 버튼들 (이벤트 전파 차단 onClick으로 wrapping해서 expand toggle을 막음)
    const renderActions = (r: CheckupRecord) => {
        if (r.isVirtual) {
            return (
                <button onClick={(e) => { e.stopPropagation(); openAdd(String(r.staff_id)); }} className="px-2.5 py-1 bg-[var(--accent)] text-white text-[10px] font-bold rounded-lg">등록</button>
            );
        }
        return (
            <div className="flex justify-center gap-1.5">
                <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="px-2.5 py-1 bg-blue-500/10 text-blue-600 text-[10px] font-bold rounded-lg hover:bg-blue-500/20">수정</button>
                {r.status === '예정' && <button onClick={(e) => { e.stopPropagation(); markComplete(r.id); }} className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-lg">완료</button>}
                <button onClick={(e) => { e.stopPropagation(); handleDelete(String(r.id)); }} className="px-2.5 py-1 bg-red-500/10 text-red-600 text-[10px] font-bold rounded-lg hover:bg-red-500/20">삭제</button>
            </div>
        );
    };

    // ExpandableTable column 정의 (row 단위 = Group)
    const columns: ExpandableColumn<Group>[] = useMemo(() => [
        {
            key: 'staff_name',
            label: '직원',
            primary: true,
            render: (g) => {
                const r = g.latest;
                const count = g.history.length;
                return (
                    <span>
                        {r.staff_name}
                        {count > 0 && <span className="ml-1.5 text-[9px] font-bold text-[var(--accent)]">+{count}</span>}
                        <br /><span className="text-[9px] font-medium text-[var(--toss-gray-3)]">{r.department}</span>
                    </span>
                );
            },
        },
        { key: 'checkup_type', label: '종류', render: (g) => normalizeCheckupType(g.latest.checkup_type) },
        { key: 'completed_date', label: '완료일', render: (g) => g.latest.completed_date || '-' },
        { key: 'hospital', label: '기관', render: (g) => g.latest.hospital || '-' },
        {
            key: 'status',
            label: '상태',
            align: 'center',
            render: (g) => (
                <span className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold ${statusBadgeClass(g.latest.status)}`}>{g.latest.status}</span>
            ),
        },
        { key: 'actions', label: '액션', align: 'center', render: (g) => renderActions(g.latest) },
    ], []);

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
                            <div className="flex gap-2">
                                <select value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} className="flex-1 min-w-0 px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none" required disabled={!!editId}>
                                    <option value="">직원 선택</option>
                                    {allStaffs.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.company || ''} / {s.department || '미배정'})</option>)}
                                </select>
                                <button type="button" onClick={() => setShowStaffSearch(true)} disabled={!!editId} aria-label="직원 검색" title="직원 검색" className="shrink-0 px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">🔍</button>
                            </div>
                            <select value={form.checkup_type} onChange={e => setForm({ ...form, checkup_type: e.target.value })} className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none">
                                {CHECKUP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
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
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
                        <h3 className="text-[11px] font-bold text-red-800 mb-2">🚨 검진 미수검 대상자 ({checkupDue.length}명, {new Date().getFullYear()}년 검진 기록 없음)</h3>
                        <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-1.5">
                            {checkupDue.map((s: any) => (
                                <div key={s.id} className="flex items-center justify-between gap-1 bg-[var(--card)] px-2 py-1.5 rounded-lg border border-red-100 min-w-0">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-bold truncate">{s.name}</p>
                                        <p className="text-[8px] text-[var(--toss-gray-3)] truncate">{s.department || '미배정'}</p>
                                    </div>
                                    <button onClick={() => openAdd(s.id)} aria-label={`${s.name} 검진 등록`} className="shrink-0 px-1.5 py-0.5 bg-[var(--accent)] text-white text-[9px] font-bold rounded">등록</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 정렬/필터 컨트롤 (thead 외부 인라인 — ExpandableTable에 그대로 위임하기엔 정렬·미수검 가상행 로직이 외부에 있어 분리) */}
                <div className="flex flex-wrap items-center gap-2 px-1 text-[10px] font-bold text-[var(--toss-gray-4)]">
                    <label>정렬</label>
                    <select
                        value={colSort.key ? `${colSort.key}:${colSort.dir}` : ''}
                        onChange={e => {
                            const v = e.target.value;
                            if (!v) return setColSort({ key: null, dir: 'desc' });
                            const [k, d] = v.split(':');
                            setColSort({ key: k as 'staff_name' | 'completed_date', dir: d as 'asc' | 'desc' });
                        }}
                        className="px-2 py-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none"
                    >
                        <option value="">기본순</option>
                        <option value="staff_name:asc">이름 가나다순</option>
                        <option value="staff_name:desc">이름 역순</option>
                        <option value="completed_date:desc">완료일 최신순</option>
                        <option value="completed_date:asc">완료일 오래된순</option>
                    </select>
                    <label className="ml-2">종류</label>
                    <select value={colFilter.checkup_type} onChange={e => setColFilter(p => ({ ...p, checkup_type: e.target.value }))} className="px-2 py-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none">
                        <option value="">전체</option>
                        {CHECKUP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <label className="ml-2">상태</label>
                    <select value={colFilter.status} onChange={e => setColFilter(p => ({ ...p, status: e.target.value }))} className="px-2 py-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none">
                        <option value="">전체</option>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm p-2 md:p-3">
                    <ExpandableTable<Group>
                        columns={columns}
                        rows={groupedDisplay}
                        keyField="sid"
                        hasExpandable={(g) => g.history.length > 0}
                        emptyMessage="검진 이력이 없습니다"
                        renderExpanded={(g) => (
                            <div className="space-y-2">
                                <h4 className="text-[10px] font-bold text-[var(--toss-gray-3)]">과거 이력 ({g.history.length})</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {g.history.map((h) => (
                                        <div key={h.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2.5 text-[10px]">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-bold text-[var(--foreground)]">{normalizeCheckupType(h.checkup_type)}</span>
                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${statusBadgeClass(h.status)}`}>{h.status}</span>
                                            </div>
                                            <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[var(--toss-gray-4)]">
                                                <span>완료일: {h.completed_date || '-'}</span>
                                                <span>기관: {h.hospital || '-'}</span>
                                            </div>
                                            <div className="mt-2 flex justify-end gap-1.5">
                                                <button onClick={() => openEdit(h)} className="px-2.5 py-1 bg-blue-500/10 text-blue-600 text-[10px] font-bold rounded-lg hover:bg-blue-500/20">수정</button>
                                                <button onClick={() => handleDelete(String(h.id))} className="px-2.5 py-1 bg-red-500/10 text-red-600 text-[10px] font-bold rounded-lg hover:bg-red-500/20">삭제</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    />
                </div>
            </div>
            {showStaffSearch && (
                <div role="dialog" aria-modal="true" aria-label="직원 검색" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeStaffSearch}>
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col gap-3 p-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-[var(--foreground)]">직원 검색</h4>
                            <button type="button" onClick={closeStaffSearch} aria-label="닫기" className="text-[12px] font-bold text-[var(--toss-gray-3)] hover:text-[var(--foreground)] px-2">✕</button>
                        </div>
                        <input
                            type="text"
                            value={staffSearchQuery}
                            onChange={e => setStaffSearchQuery(e.target.value)}
                            placeholder="이름·회사·부서로 검색"
                            aria-label="이름·회사·부서로 검색"
                            autoFocus
                            className="px-3 py-2.5 text-[11px] font-bold rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]"
                        />
                        <div className="overflow-y-auto custom-scrollbar flex-1 -mx-1 px-1">
                            {searchedStaffs.length === 0 ? (
                                <p className="text-center py-8 text-[11px] font-bold text-[var(--toss-gray-3)]">검색 결과가 없습니다</p>
                            ) : searchedStaffs.map((s: any) => (
                                <button key={s.id} type="button" onClick={() => pickStaff(String(s.id))}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl hover:bg-[var(--muted)] flex items-center justify-between gap-2 ${form.staff_id === String(s.id) ? 'bg-[var(--muted)]' : ''}`}>
                                    <span className="text-[11px] font-bold text-[var(--foreground)] truncate">{s.name}</span>
                                    <span className="text-[10px] font-bold text-[var(--toss-gray-3)] shrink-0 truncate max-w-[60%] text-right">{[s.company, s.department || '미배정'].filter(Boolean).join(' · ')}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

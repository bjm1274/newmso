'use client';

/**
 * 연차·휴가 워크센터 (leave) — 새 디자인 (.handoff-part2/redesign/screen-hr.jsx 기반)
 *
 * 원본 4장 통합:
 *   - 연차 잔여 (연차원장)
 *   - 연차 신청 (연차/휴가 신청내역)
 *   - 소멸 알림 (연차소멸알림)
 *   - 계획서 (연차사용촉진)
 *
 * 구조 (지시서 §1-2):
 *   - 4 KPI 행 (총 잔여 / 사용률 / 소멸 예정 / 신청 대기)
 *   - 직원별 잔여 표 + 빠른 신청 사이드 폼 (행 클릭 → 폼 prefill)
 *   - 소멸 알림 통합 보드 (전체 폭, 권유 모달 액션)
 *
 * 분리 (JM 500줄):
 *   - LeaveWorkcenter/LeaveBalanceTable.tsx — 표
 *   - LeaveWorkcenter/LeaveQuickForm.tsx — 폼
 *   - LeaveWorkcenter/LeaveExpiryBoard.tsx — 소멸 보드
 *   - LeaveWorkcenter/data.ts — fetch & 타입
 *
 * JM, JM2, JM3, JM4, JM6 준수
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StaffMember } from '@/types';
import { toast } from '@/lib/toast';
import {
  WorkcenterKpiRow,
  WorkcenterSection,
  WorkcenterShell,
  type WorkcenterKpi } from './workcenter-common';
import { db } from '@/lib/db-client';
import { calculateLeaveDays } from '@/lib/annual-leave-ledger';
import { logAudit, readClientAuditActor } from '@/lib/audit';
import { LeaveBalanceTable } from './LeaveWorkcenter/LeaveBalanceTable';
import LeaveQuickForm from './LeaveWorkcenter/LeaveQuickForm';
import { LeaveExpiryBoard } from './LeaveWorkcenter/LeaveExpiryBoard';
import LeaveCalendar, { type LeaveCalendarEntry } from './LeaveWorkcenter/LeaveCalendar';
import {
  fetchLeaveData,
  type LeaveDataResult,
  type LeaveExpiryItem,
  type LeaveStaffRow } from './LeaveWorkcenter/data';

interface LeaveWorkcenterProps {
  staffs?: StaffMember[];
  selectedCo?: string;
  user?: Record<string, unknown> | null;
  onRefresh?: () => void;
}

interface SuggestModalState {
  open: boolean;
  item: LeaveExpiryItem | null;
}

const EMPTY_RESULT: LeaveDataResult = {
  rows: [],
  requests: [],
  expiryItems: [],
  totals: { remaining: 0, total: 0, used: 0, pending: 0, expiringStaff: 0 } };

export default function LeaveWorkcenter({
  staffs = [],
  selectedCo,
  user = null,
  onRefresh }: LeaveWorkcenterProps) {
  const [data, setData] = useState<LeaveDataResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [picked, setPicked] = useState<LeaveStaffRow | null>(null);
  const [suggest, setSuggest] = useState<SuggestModalState>({ open: false, item: null });
  const [reloadKey, setReloadKey] = useState(0);

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalTab, setApprovalTab] = useState<'pending' | 'history'>('pending');
  const [actioningId, setActioningId] = useState<string | null>(null);

  const [doubleClickedStaff, setDoubleClickedStaff] = useState<LeaveStaffRow | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [detailTab, setDetailTab] = useState<'usage' | 'grant'>('usage');
  const [accrualList, setAccrualList] = useState<any[]>([]);
  const [accrualLoading, setAccrualLoading] = useState(false);
  const [mainTab, setMainTab] = useState<'balance' | 'calendar' | 'expiry' | 'diagnose'>('balance');
  const [diagnose, setDiagnose] = useState<Record<string, unknown> | null>(null);
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);

  const openStaffDetail = useCallback(async (row: LeaveStaffRow, event?: React.MouseEvent | null) => {
    setDoubleClickedStaff(row);
    setDetailTab('usage');
    setAccrualList([]);
    setAccrualLoading(true);
    setPicked(row);

    const popupWidth = 675;
    const popupHeight = 525;
    if (event) {
      const x = Math.max(10, Math.min(event.clientX, window.innerWidth - popupWidth - 10));
      const y = Math.max(10, Math.min(event.clientY, window.innerHeight - popupHeight - 10));
      setPopupPosition({ x, y });
    } else {
      setPopupPosition({
        x: Math.max(10, (window.innerWidth - popupWidth) / 2),
        y: Math.max(10, (window.innerHeight - popupHeight) / 2),
      });
    }

    try {
      // leave_balances 만 재계산 (staff_members 미수정)
      await fetch('/api/admin/annual-leave/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: String(row.staff.id) })
      }).catch(err => console.error('실시간 연차 동기화 실패:', err));

      const res = await fetch('/api/d1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'leave_accruals',
          where: [
            { field: 'staff_id', op: 'eq', value: String(row.staff.id) }
          ],
          order: [
            { field: 'created_at', ascending: false }
          ]
        })
      });
      const result = await res.json();
      if (result.ok && Array.isArray(result.data)) {
        setAccrualList(result.data);
      } else {
        console.error('자동발생 연차 조회 실패:', result.error);
      }
    } catch (err) {
      console.error('자동발생 연차 API 에러:', err);
    } finally {
      setAccrualLoading(false);
    }
  }, []);

  const handleDoubleClick = useCallback(
    (row: LeaveStaffRow, event: React.MouseEvent<HTMLTableRowElement>) => {
      void openStaffDetail(row, event);
    },
    [openStaffDetail],
  );

  const loadDiagnose = useCallback(async () => {
    setDiagnoseLoading(true);
    try {
      const res = await fetch('/api/admin/annual-leave/diagnose');
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || '진단 실패');
      setDiagnose(json);
    } catch (e) {
      console.error(e);
      toast('연차 진단 로드 실패', 'error');
      setDiagnose(null);
    } finally {
      setDiagnoseLoading(false);
    }
  }, []);

  const rebalanceAll = useCallback(async () => {
    setRebalancing(true);
    try {
      const res = await fetch('/api/admin/annual-leave/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allActive: true }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || '재계산 실패');
      toast(
        `잔액 재계산 완료 ${json.processed}명` +
          (json.failed ? ` · 실패 ${json.failed}` : '') +
          ' (직원 명단 미변경)',
        'success',
      );
      setReloadKey((k) => k + 1);
      await loadDiagnose();
    } catch (e) {
      console.error(e);
      toast('잔액 재계산 실패', 'error');
    } finally {
      setRebalancing(false);
    }
  }, [loadDiagnose]);

  const handleStatusUpdate = async (id: string, status: '승인' | '반려') => {
    setActioningId(id);
    try {
      const targetLeave = data.requests.find((l) => l.id === id);
      if (!targetLeave) return;
      const previousStatus = targetLeave.status;

      const { error } = await db
        .from('leave_requests')
        .update({
          status,
          approved_at: status === '승인' ? new Date().toISOString() : null })
        .eq('id', id);

      if (error) throw error;

      // 연차(부여) 포함 — staff_members.annual_leave_total 직접 쓰기 금지.
      // leave_balances SSOT 재계산 (recalculateLeaveBalance)
      try {
        const syncRes = await fetch('/api/admin/annual-leave/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staffId: targetLeave.staff_id }) });
        if (!syncRes.ok) {
          console.error('연차 동기화 서버 실패:', await syncRes.text());
        }
      } catch (syncErr) {
        console.error('연차 동기화 API 호출 실패:', syncErr);
      }

      const actor = readClientAuditActor();
      await logAudit(
        'leave_request_status_updated',
        'leave_request',
        id,
        {
          staff_id: targetLeave.staff_id,
          leave_type: targetLeave.leave_type,
          before_status: previousStatus,
          after_status: status },
        actor.userId,
        actor.userName
      );

      toast(`신청이 ${status} 처리되었습니다.`, 'success');
      handleSubmitted();
    } catch (err) {
      console.error('결재 처리 실패:', err);
      toast('처리에 실패했습니다.', 'error');
    } finally {
      setActioningId(null);
    }
  };

  const handleDeleteLeave = async (id: string) => {
    const target = data.requests.find((l) => l.id === id);
    if (!target) return;
    const confirmed = confirm('이 결재 내역을 완전히 삭제하시겠습니까?');
    if (!confirmed) return;
    try {
      const { error } = await db.from('leave_requests').delete().eq('id', id);
      if (error) throw error;

      // 삭제 후 leave_balances 재계산 (staff_members.annual_leave_total 직접 쓰기 금지)
      try {
        const syncRes = await fetch('/api/admin/annual-leave/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staffId: target.staff_id }) });
        if (!syncRes.ok) {
          console.error('연차 동기화 서버 실패:', await syncRes.text());
        }
      } catch (syncErr) {
        console.error('연차 동기화 API 호출 실패:', syncErr);
      }

      toast('결재 요청이 삭제되었습니다.', 'success');
      handleSubmitted();
    } catch (err) {
      console.error('결재 삭제 실패:', err);
      toast('삭제에 실패했습니다.', 'error');
    }
  };

  const safeUser = useMemo<StaffMember | null>(() => {
    if (!user || typeof user !== 'object') return null;
    const candidate = user as { id?: unknown; name?: unknown };
    if (typeof candidate.id === 'string' && typeof candidate.name === 'string') {
      return user as unknown as StaffMember;
    }
    return null;
  }, [user]);

  // 데이터 로드 — AbortController (JM2/JM3)
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    setErrMsg(null);
    fetchLeaveData({
      staffs,
      selectedCo: selectedCo || '전체',
      signal: controller.signal })
      .then((result) => {
        if (!alive) return;
        setData(result);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('연차 워크센터 데이터 로드 실패:', error);
        if (!alive) return;
        setData(EMPTY_RESULT);
        setErrMsg('연차 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [staffs, selectedCo, reloadKey]);

  // KPI 계산 (memo — staffs/data 변경 시만)
  const kpis = useMemo<WorkcenterKpi[]>(() => {
    const { totals, rows } = data;
    const totalCount = rows.length;
    const usageRate = totals.total > 0
      ? Math.round((totals.used / totals.total) * 100)
      : 0;
    return [
      {
        key: 'remaining',
        label: '전체 잔여 연차',
        value: totals.remaining.toString(),
        unit: '일',
        sub: totalCount > 0 ? `재직 ${totalCount}명 합산` : '데이터 없음' },
      {
        key: 'usage',
        label: '사용률',
        value: usageRate.toString(),
        unit: '%',
        sub: totals.total > 0 ? `${totals.used} / ${totals.total}일` : '연간 누적',
        tone: 'success' },
      {
        key: 'expire',
        label: '소멸 예정',
        value: totals.expiringStaff.toString(),
        unit: '명',
        sub: '30일 이내 사용 권고',
        tone: 'warn' },
      {
        key: 'pending',
        label: '신청 대기',
        value: totals.pending.toString(),
        unit: '건',
        sub: '결재 필요',
        tone: 'accent' },
    ];
  }, [data]);

  const handlePick = useCallback((row: LeaveStaffRow) => {
    setPicked(row);
  }, []);

  const handleSubmitted = useCallback(() => {
    setReloadKey((k) => k + 1);
    onRefresh?.();
  }, [onRefresh]);

  const handleSuggestUse = useCallback((item: LeaveExpiryItem) => {
    setSuggest({ open: true, item });
  }, []);

  const closeSuggest = useCallback(() => {
    setSuggest({ open: false, item: null });
  }, []);

  const pickedRequests = useMemo(() => {
    if (!picked) return [];
    return data.requests
      .filter((r) => String(r.staff_id) === String(picked.staff.id))
      .sort((a, b) => {
        const dateA = a.created_at || a.start_date || '';
        const dateB = b.created_at || b.start_date || '';
        return dateB.localeCompare(dateA);
      });
  }, [picked, data.requests]);

  const staffLeaveHistory = useMemo(() => {
    if (!doubleClickedStaff) return [];
    return data.requests
      .filter((r) => String(r.staff_id) === String(doubleClickedStaff.staff.id) && r.leave_type !== '연차(부여)')
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
  }, [doubleClickedStaff, data.requests]);

  const totalAccrued = useMemo(() => {
    const annualItems = accrualList.filter((item) => item.kind === 'annual');
    if (annualItems.length > 0) {
      // 소급 적용으로 여러 연도의 연차가 존재할 경우, 당해 연도에 적용되는 가장 최근 N년차(기념일)의 발생분 1건만 인정합니다.
      const sortedAnnuals = [...annualItems].sort((a, b) => {
        const numA = Number(a.period_key?.replace('annual:', '')) || 0;
        const numB = Number(b.period_key?.replace('annual:', '')) || 0;
        return numB - numA;
      });
      return Number(sortedAnnuals[0].days || 0);
    }
    return accrualList
      .filter((item) => item.kind === 'monthly')
      .reduce((sum, item) => sum + Number(item.days || 0), 0);
  }, [accrualList]);

  const manualAdjustment = useMemo(() => {
    if (!doubleClickedStaff) return 0;
    return doubleClickedStaff.total - totalAccrued;
  }, [doubleClickedStaff, totalAccrued]);

  // 캘린더용 entries — leave_requests의 start_date~end_date를 일자 단위로 펼침
  const calendarEntries = useMemo<LeaveCalendarEntry[]>(() => {
    const staffMap = new Map<string, string>();
    for (const s of staffs) {
      if (s.id) staffMap.set(String(s.id), s.name || '');
    }
    const list: LeaveCalendarEntry[] = [];
    const DAY_MS = 24 * 60 * 60 * 1000;
    for (const req of data.requests) {
      const startStr = (req.start_date || '').slice(0, 10);
      const endStr = (req.end_date || req.start_date || '').slice(0, 10);
      if (!startStr) continue;
      const startMs = Date.parse(`${startStr}T00:00:00`);
      const endMs = Date.parse(`${endStr}T00:00:00`);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
      const status: 'pending' | 'approved' | 'rejected' =
        req.status === '승인' ? 'approved' : req.status === '반려' ? 'rejected' : 'pending';
      for (let t = startMs; t <= endMs; t += DAY_MS) {
        const d = new Date(t);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        list.push({
          date: iso,
          status,
          staffName: staffMap.get(String(req.staff_id)) || null,
          leaveType: req.leave_type || null });
      }
    }
    return list;
  }, [data.requests, staffs]);

  const confirmSuggest = useCallback(() => {
    const item = suggest.item;
    if (!item) {
      closeSuggest();
      return;
    }
    // 표 행 prefill로 빠른 신청 흐름 자연스럽게 연결
    const matched = data.rows.find((r) => String(r.staff.id) === String(item.staff.id));
    if (matched) {
      setPicked(matched);
      toast(`${item.staff.name ?? '직원'}에게 사용 권유 — 연차 사용기록 폼에 채웠습니다.`, 'success');
    } else {
      toast('해당 직원 정보를 찾을 수 없습니다.', 'error');
    }
    closeSuggest();
  }, [closeSuggest, data.rows, suggest.item]);

  return (
    <div data-testid="leave-workcenter-view" className="contents">
    <WorkcenterShell headerExtra={<WorkcenterKpiRow items={kpis} />}>
      {errMsg && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-[12px] font-semibold text-[#DC2626]"
        >
          {errMsg}
        </div>
      )}

      <div className="rounded-[var(--radius-md)] border border-blue-200 bg-blue-50/80 px-3 py-2 text-[11px] leading-relaxed text-blue-900">
        <strong>발생 규칙:</strong> 1년 미만 = 월 만근 시 +1일(최대 11일) · 1년 이상 = 입사 응당일마다 15일+가산(최대 25일).
        화면 잔액은 <strong>발생 원장·당해 사용</strong> 기준으로 재계산하며, 직원 명단 DB는 수정하지 않습니다.
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="연차 휴가 구역">
        {(
          [
            { id: 'balance' as const, label: '잔여 현황' },
            { id: 'calendar' as const, label: '캘린더' },
            { id: 'expiry' as const, label: '소멸·촉진' },
            { id: 'diagnose' as const, label: '정합 진단' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mainTab === t.id}
            onClick={() => {
              setMainTab(t.id);
              if (t.id === 'diagnose') void loadDiagnose();
            }}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
              mainTab === t.id
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mainTab === 'diagnose' && (
        <WorkcenterSection
          title="연차 정합 진단 (읽기 전용 + 잔액만 재계산)"
          rightSlot={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadDiagnose()}
                disabled={diagnoseLoading}
                className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold"
              >
                {diagnoseLoading ? '조회 중…' : '다시 조회'}
              </button>
              <button
                type="button"
                onClick={() => void rebalanceAll()}
                disabled={rebalancing}
                className="rounded-[var(--radius-md)] bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50"
              >
                {rebalancing ? '재계산 중…' : '잔액 일괄 재계산'}
              </button>
            </div>
          }
        >
          {!diagnose ? (
            <p className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">
              {diagnoseLoading ? '진단 중…' : '조회를 눌러 주세요.'}
            </p>
          ) : (
            <div className="space-y-3 text-[12px]">
              <div className="flex flex-wrap gap-3">
                {Object.entries((diagnose.summary as Record<string, number>) || {}).map(([k, v]) => (
                  <span key={k} className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11px] font-bold">
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-[var(--toss-gray-4)]">{String(diagnose.note || '')}</p>
              <DiagnoseTable
                title="사용 > 부여 (used&gt;total)"
                rows={(diagnose.overuse as Array<Record<string, unknown>>) || []}
                cols={['name', 'department', 'company', 'total_days', 'used_days', 'excess']}
              />
              <DiagnoseTable
                title="total ↔ 발생원장 괴리 (상위)"
                rows={(diagnose.totalAccrualGaps as Array<Record<string, unknown>>) || []}
                cols={['name', 'department', 'staffTotal', 'accrualSum', 'grantedForBalance', 'gap']}
              />
              <DiagnoseTable
                title="발생 원장 없음"
                rows={(diagnose.noAccrual as Array<Record<string, unknown>>) || []}
                cols={['name', 'department', 'company']}
              />
            </div>
          )}
        </WorkcenterSection>
      )}

      {mainTab === 'calendar' && (
        <WorkcenterSection title="휴가 캘린더">
          <LeaveCalendar entries={calendarEntries} />
        </WorkcenterSection>
      )}

      {mainTab === 'expiry' && (
        <LeaveExpiryBoard items={data.expiryItems} onSuggestUse={handleSuggestUse} />
      )}

      {mainTab === 'balance' && (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-3">
          <WorkcenterSection
            title="직원별 연차 현황"
            padded={false}
            rightSlot={
              data.totals.pending > 0 ? (
                <button
                  type="button"
                  data-testid="leave-approval-pending-btn"
                  onClick={() => {
                    setApprovalTab('pending');
                    setShowApprovalModal(true);
                  }}
                  className="bg-orange-500 text-white px-2.5 py-1 text-[11px] font-bold rounded-[var(--radius-md)] animate-pulse hover:opacity-90 transition-all shadow-sm"
                >
                  🔔 승인 대기 결재 ({data.totals.pending}건)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setApprovalTab('history');
                    setShowApprovalModal(true);
                  }}
                  className="bg-[var(--muted)] text-[var(--toss-gray-4)] border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold rounded-[var(--radius-md)] hover:bg-[var(--card)] transition-colors"
                >
                  결재 내역 보기
                </button>
              )
            }
          >
            <LeaveBalanceTable
              rows={data.rows}
              selectedStaffId={picked ? String(picked.staff.id) : null}
              loading={loading}
              onPick={handlePick}
              onDoubleClick={handleDoubleClick}
              onOpenDetail={(row) => void openStaffDetail(row)}
            />
          </WorkcenterSection>

          {picked && (
            <WorkcenterSection
              title={`연차 사용 및 부여 내역 - ${picked.staff.name}`}
              padded={false}
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--muted)]/30 text-[var(--toss-gray-4)] font-bold">
                      <th className="px-4 py-2">날짜 범위</th>
                      <th className="px-4 py-2">유형</th>
                      <th className="px-4 py-2">일수</th>
                      <th className="px-4 py-2">사유</th>
                      <th className="px-4 py-2">상태</th>
                      <th className="px-4 py-2 text-right">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickedRequests.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-[var(--toss-gray-3)] font-medium">
                          이 직원의 연차 사용/부여 내역이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      pickedRequests.map((req) => {
                        let typeBadgeColor = 'bg-blue-500/10 text-blue-600 border-blue-200';
                        let typeLabel = req.leave_type;
                        if (req.leave_type === '연차(부여)') {
                          typeBadgeColor = 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
                          typeLabel = '연차 신규 부여';
                        } else if (req.leave_type === '연차(과거사용)') {
                          typeBadgeColor = 'bg-orange-500/10 text-orange-600 border-orange-200';
                          typeLabel = '과거 사용 소급';
                        } else if (req.leave_type === '오전반차' || req.leave_type === '오후반차') {
                          typeBadgeColor = 'bg-sky-500/10 text-sky-600 border-sky-200';
                        } else if (req.leave_type === '병가') {
                          typeBadgeColor = 'bg-red-500/10 text-red-600 border-red-200';
                        } else if (req.leave_type === '경조') {
                          typeBadgeColor = 'bg-purple-500/10 text-purple-600 border-purple-200';
                        }

                        const reqDays = typeof req.days === 'number' && req.days > 0
                          ? req.days
                          : Math.max(1, calculateLeaveDays(req.start_date, req.end_date || req.start_date));

                        return (
                          <tr key={req.id} className="border-b border-[var(--border)] hover:bg-[var(--muted)]/10 transition-colors">
                            <td className="px-4 py-2.5 font-medium text-[var(--foreground)]">
                              {req.start_date} {req.end_date !== req.start_date ? `~ ${req.end_date}` : ''}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeBadgeColor}`}>
                                {typeLabel}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-bold text-[var(--foreground)]">
                              {reqDays}일
                            </td>
                            <td className="px-4 py-2.5 text-[var(--toss-gray-4)] max-w-[200px] truncate" title={req.reason}>
                              {req.reason || '-'}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                req.status === '승인'
                                  ? 'bg-green-500/10 text-green-700'
                                  : req.status === '반려'
                                    ? 'bg-red-500/10 text-red-700'
                                    : 'bg-orange-500/10 text-orange-700'
                              }`}>
                                {req.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteLeave(req.id)}
                                className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-md text-[10px] font-bold transition shadow-sm border border-red-500/20"
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </WorkcenterSection>
          )}
        </div>

        <LeaveQuickForm
          picked={picked}
          user={safeUser}
          staffs={staffs}
          onSubmitted={handleSubmitted}
        />
      </div>
      )}

      {suggest.open && suggest.item && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="연차 사용 권유"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3"
          onClick={closeSuggest}
        >
          <div
            className="app-card w-full max-w-sm p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-[14px] font-bold text-[var(--foreground)]">
              연차 사용 권유
            </h4>
            <p className="mt-2 text-[12px] text-[var(--toss-gray-4)]">
              <b className="text-[var(--foreground)]">{suggest.item.staff.name ?? '직원'}</b>님의
              잔여 연차 <b className="text-[var(--foreground)]">{suggest.item.remaining}일</b> 중
              소멸 임박 분에 대해 사용 권유 안내를 진행합니다.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeSuggest}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmSuggest}
                className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
              >
                폼에 채우기
              </button>
            </div>
          </div>
        </div>
      )}

      {showApprovalModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="연차/휴가 결재 대시보드"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-md px-3 p-4 min-h-screen"
          onClick={() => setShowApprovalModal(false)}
        >
          <div
            className="bg-[var(--card)] w-full max-w-2xl rounded-2xl overflow-hidden shadow-sm flex flex-col h-[75vh] animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--card)] shrink-0">
              <div>
                <h3 className="text-base font-bold text-[var(--foreground)]">연차·휴가 결재 대시보드</h3>
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1">총 {data.requests.filter(r => r.status === '대기').length}건의 대기 요청이 있습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowApprovalModal(false)}
                className="text-[var(--toss-gray-3)] hover:text-red-500 text-2xl font-bold p-2"
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            {/* Tab selector */}
            <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--card)] flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setApprovalTab('pending')}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-[var(--radius-md)] ${
                  approvalTab === 'pending'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--card)]'
                }`}
              >
                결재 대기 목록 ({data.requests.filter(r => r.status === '대기').length}건)
              </button>
              <button
                type="button"
                onClick={() => setApprovalTab('history')}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-[var(--radius-md)] ${
                  approvalTab === 'history'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--card)]'
                }`}
              >
                전체 결재 이력 ({data.requests.length}건)
              </button>
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--muted)]/20 custom-scrollbar">
              {(() => {
                const list = data.requests.filter((r) =>
                  approvalTab === 'pending' ? r.status === '대기' : true
                );
                if (list.length === 0) {
                  return (
                    <div className="py-24 text-center text-[var(--toss-gray-3)] font-bold text-xs">
                      {approvalTab === 'pending' ? '결재 대기 중인 연차/휴가 요청이 없습니다.' : '기록이 없습니다.'}
                    </div>
                  );
                }
                return list.map((req) => {
                  const staff = staffs.find((s) => String(s.id) === String(req.staff_id));
                  const isPending = req.status === '대기';
                  
                  let typeBadgeColor = 'bg-blue-500/10 text-blue-600 border-blue-200';
                  let typeLabel = req.leave_type;
                  if (req.leave_type === '연차(부여)') {
                    typeBadgeColor = 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
                    typeLabel = '연차 신규 부여';
                  } else if (req.leave_type === '연차(과거사용)') {
                    typeBadgeColor = 'bg-orange-500/10 text-orange-600 border-orange-200';
                    typeLabel = '과거 사용 소급';
                  } else if (req.leave_type === '병가') {
                    typeBadgeColor = 'bg-red-500/10 text-red-600 border-red-200';
                  } else if (req.leave_type === '경조') {
                    typeBadgeColor = 'bg-purple-500/10 text-purple-600 border-purple-200';
                  }

                  const calculatedDays = Math.max(
                    1,
                    calculateLeaveDays(req.start_date, req.end_date || req.start_date),
                  );

                  return (
                    <div
                      key={req.id}
                      className="bg-[var(--card)] p-4 rounded-[var(--radius-xl)] border border-[var(--border)] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:shadow-md transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[13px] font-bold text-[var(--foreground)]">
                            {staff?.name ?? '미확인 직원'}
                          </span>
                          <span className="text-[10px] text-[var(--toss-gray-4)] font-medium">
                            ({staff?.company ?? '소속 없음'} · {staff?.department ?? '부서 없음'})
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${typeBadgeColor}`}>
                            {typeLabel}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 mt-2">
                          <p className="text-[12px] font-bold text-[var(--toss-gray-4)]">
                            📅 {req.start_date} ~ {req.end_date} ({calculatedDays}일)
                          </p>
                          {req.reason && (
                            <p className="text-[11px] text-[var(--toss-gray-3)] italic">
                              &quot; {req.reason} &quot;
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 w-full md:w-auto shrink-0 justify-end">
                        {isPending ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStatusUpdate(req.id, '반려')}
                              disabled={actioningId === req.id}
                              className="px-4 py-2 border border-red-200 bg-red-500/10 text-red-600 rounded-xl text-[10px] font-bold hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                            >
                              반려
                            </button>
                            <button
                              type="button"
                              data-testid={`leave-approve-btn-${req.id}`}
                              onClick={() => handleStatusUpdate(req.id, '승인')}
                              disabled={actioningId === req.id}
                              className="px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-[10px] font-bold shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                            >
                              승인하기
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold ${
                                req.status === '승인'
                                  ? 'bg-green-500/15 text-green-700'
                                  : 'bg-red-500/15 text-red-700'
                              }`}
                            >
                              {req.status}됨
                            </span>
                            <button
                              type="button"
                              onClick={() => handleStatusUpdate(req.id, req.status === '승인' ? '반려' : '승인')}
                              className="px-2 py-1.5 text-[9px] font-semibold text-[var(--toss-gray-4)] hover:bg-[var(--muted)] border border-[var(--border)] rounded-lg"
                            >
                              변경
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLeave(req.id)}
                              className="px-2 py-1.5 text-[9px] font-semibold text-red-600 hover:bg-red-500/10 border border-red-100 rounded-lg"
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 bg-[var(--card)] border-t border-[var(--border)] text-center shrink-0">
              <button
                type="button"
                onClick={() => setShowApprovalModal(false)}
                className="px-5 py-2.5 bg-[var(--muted)] text-[var(--toss-gray-4)] rounded-xl text-[11px] font-bold hover:bg-[var(--toss-gray-2)] transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 더블클릭 상세 팝업창 */}
      {doubleClickedStaff && popupPosition && (
        <>
          {/* Backdrop (클릭 시 닫힘) */}
          <div
            className="fixed inset-0 z-[130] bg-transparent"
            onClick={() => {
              setDoubleClickedStaff(null);
              setPopupPosition(null);
            }}
          />
          {/* Popup Container */}
          <div
            style={{
              position: 'fixed',
              left: `${popupPosition.x}px`,
              top: `${popupPosition.y}px`,
              width: '675px',
              height: '525px',
              maxHeight: '525px' }}
            className="z-[140] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-6 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4">
              <div>
                <h4 className="text-[15px] font-bold text-[var(--foreground)]">
                  연차 상세 내역 — {doubleClickedStaff.staff.name}
                </h4>
                <p className="text-[12px] text-[var(--toss-gray-4)] mt-0.5">
                  {doubleClickedStaff.staff.department ?? '부서 없음'} · 잔여 {doubleClickedStaff.remaining}일
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDoubleClickedStaff(null);
                  setPopupPosition(null);
                }}
                className="text-[var(--toss-gray-4)] hover:text-red-500 text-xl font-bold px-1"
                aria-label="상세 팝업 닫기"
              >
                ×
              </button>
            </div>

            {/* Tab selector */}
            <div className="flex gap-2 border-b border-[var(--border)] pb-2 mb-3">
              <button
                type="button"
                onClick={() => setDetailTab('usage')}
                className={`px-3 py-1.5 text-[12px] font-bold rounded-[var(--radius-md)] ${
                  detailTab === 'usage'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--card)]'
                }`}
              >
                사용 내역 ({staffLeaveHistory.length}건)
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('grant')}
                className={`px-3 py-1.5 text-[12px] font-bold rounded-[var(--radius-md)] ${
                  detailTab === 'grant'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--card)]'
                }`}
              >
                발생 내역 ({accrualList.length + (manualAdjustment !== 0 ? 1 : 0)}건)
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar text-[12px]">
              {accrualLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                </div>
              ) : detailTab === 'usage' ? (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[10px] text-[var(--toss-gray-4)] font-bold">
                      <th className="pb-1">날짜</th>
                      <th className="pb-1">유형</th>
                      <th className="pb-1 text-center">일수</th>
                      <th className="pb-1">사유</th>
                      <th className="pb-1 text-right">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffLeaveHistory.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-[var(--toss-gray-3)]">
                          사용 내역이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      staffLeaveHistory.map((h) => {
                        const calculated = typeof h.days === 'number' && h.days > 0
                          ? h.days
                          : Math.max(1, calculateLeaveDays(h.start_date, h.end_date || h.start_date));
                        
                        let typeColor = 'text-blue-600';
                        if (h.leave_type === '연차(과거사용)') typeColor = 'text-orange-600';
                        else if (h.leave_type === '병가') typeColor = 'text-red-600';

                        return (
                          <tr key={h.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--muted)]/20">
                            <td className="py-1.5 font-medium">{h.start_date}</td>
                            <td className={`py-1.5 font-semibold ${typeColor}`}>{h.leave_type.replace('연차(과거사용)', '과거 소급')}</td>
                            <td className="py-1.5 text-center font-bold">{calculated}일</td>
                            <td className="py-1.5 truncate max-w-[80px]" title={h.reason}>{h.reason || '-'}</td>
                            <td className="py-1.5 text-right font-semibold">
                              <span className={h.status === '승인' ? 'text-green-600' : h.status === '반려' ? 'text-red-600' : 'text-orange-600'}>
                                {h.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[10px] text-[var(--toss-gray-4)] font-bold">
                      <th className="pb-1">날짜</th>
                      <th className="pb-1">발생 구분</th>
                      <th className="pb-1 text-center">일수</th>
                      <th className="pb-1">사유</th>
                      <th className="pb-1 text-right">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 수동 조정(부여/차감) 내역 표시 */}
                    {manualAdjustment !== 0 && (
                      <tr className="border-b border-[var(--border)]/50 hover:bg-[var(--muted)]/20 font-semibold">
                        <td className="py-2.5">
                          {doubleClickedStaff.updatedAt ? doubleClickedStaff.updatedAt.slice(0, 10) : '-'}
                        </td>
                        <td className="py-2.5 text-emerald-600">관리자 수동 조정 (부여/차감)</td>
                        <td className={`py-2.5 text-center font-bold ${manualAdjustment > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {manualAdjustment > 0 ? `+${manualAdjustment}` : manualAdjustment}일
                        </td>
                        <td className="py-2.5 text-[10px] text-[var(--toss-gray-4)]">관리자가 수동으로 총 연차 직접 변경</td>
                        <td className="py-2.5 text-right text-green-600">완료</td>
                      </tr>
                    )}
                    {/* 자동 발생(accruals) 내역 표시 */}
                    {accrualList.length === 0 && manualAdjustment === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-[var(--toss-gray-3)]">
                          발생 내역이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      accrualList.map((g) => {
                        const dateStr = (g.created_at || '').slice(0, 10) || '-';
                        return (
                          <tr key={g.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--muted)]/20">
                            <td className="py-1.5">{dateStr}</td>
                            <td className="py-1.5 font-semibold text-emerald-600">{g.kind === 'annual' ? '회계연도/입사일 연차' : '월차 (만근)'}</td>
                            <td className="py-1.5 text-center font-bold">+{g.days}일</td>
                            <td className="py-1.5 truncate max-w-[80px]" title={g.note}>{g.note || '-'}</td>
                            <td className="py-1.5 text-right font-semibold text-green-600">완료</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </WorkcenterShell>
    </div>
  );
}

function DiagnoseTable({
  title,
  rows,
  cols,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  cols: string[];
}) {
  if (!rows.length) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
        <p className="text-[12px] font-bold text-[var(--foreground)]">{title}</p>
        <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">해당 없음</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
      <div className="border-b border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-[12px] font-bold">
        {title} ({rows.length})
      </div>
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--toss-gray-4)]">
            {cols.map((c) => (
              <th key={c} className="px-2 py-1.5 font-bold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--border)] last:border-0">
              {cols.map((c) => (
                <td key={c} className="px-2 py-1.5 font-medium text-[var(--foreground)]">
                  {String(r[c] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

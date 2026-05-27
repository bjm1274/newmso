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
  type WorkcenterKpi,
} from './workcenter-common';
import { LeaveBalanceTable } from './LeaveWorkcenter/LeaveBalanceTable';
import LeaveQuickForm from './LeaveWorkcenter/LeaveQuickForm';
import { LeaveExpiryBoard } from './LeaveWorkcenter/LeaveExpiryBoard';
import LeaveCalendar, { type LeaveCalendarEntry } from './LeaveWorkcenter/LeaveCalendar';
import {
  fetchLeaveData,
  type LeaveDataResult,
  type LeaveExpiryItem,
  type LeaveStaffRow,
} from './LeaveWorkcenter/data';

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
  totals: { remaining: 0, total: 0, used: 0, pending: 0, expiringStaff: 0 },
};

export default function LeaveWorkcenter({
  staffs = [],
  selectedCo,
  user = null,
  onRefresh,
}: LeaveWorkcenterProps) {
  const [data, setData] = useState<LeaveDataResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [picked, setPicked] = useState<LeaveStaffRow | null>(null);
  const [suggest, setSuggest] = useState<SuggestModalState>({ open: false, item: null });
  const [reloadKey, setReloadKey] = useState(0);

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
      signal: controller.signal,
    })
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
        sub: totalCount > 0 ? `재직 ${totalCount}명 합산` : '데이터 없음',
      },
      {
        key: 'usage',
        label: '사용률',
        value: usageRate.toString(),
        unit: '%',
        sub: totals.total > 0 ? `${totals.used} / ${totals.total}일` : '연간 누적',
        tone: 'success',
      },
      {
        key: 'expire',
        label: '소멸 예정',
        value: totals.expiringStaff.toString(),
        unit: '명',
        sub: '30일 이내 사용 권고',
        tone: 'warn',
      },
      {
        key: 'pending',
        label: '신청 대기',
        value: totals.pending.toString(),
        unit: '건',
        sub: '결재 필요',
        tone: 'accent',
      },
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
          leaveType: req.leave_type || null,
        });
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
      toast(`${item.staff.name ?? '직원'}에게 사용 권유 — 빠른 신청 폼에 채웠습니다.`, 'success');
    } else {
      toast('해당 직원 정보를 찾을 수 없습니다.', 'error');
    }
    closeSuggest();
  }, [closeSuggest, data.rows, suggest.item]);

  return (
    <WorkcenterShell headerExtra={<WorkcenterKpiRow items={kpis} />}>
      {errMsg && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-[12px] font-semibold text-[#DC2626]"
        >
          {errMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <WorkcenterSection title="직원별 연차 현황" padded={false}>
          <LeaveBalanceTable
            rows={data.rows}
            selectedStaffId={picked ? String(picked.staff.id) : null}
            loading={loading}
            onPick={handlePick}
          />
        </WorkcenterSection>

        <LeaveQuickForm
          picked={picked}
          user={safeUser}
          staffs={staffs}
          onSubmitted={handleSubmitted}
        />
      </div>

      <LeaveCalendar entries={calendarEntries} />

      <WorkcenterSection
        title={`소멸 예정 알림 · ${data.expiryItems.length}명`}
      >
        <LeaveExpiryBoard
          items={data.expiryItems}
          loading={loading}
          onSuggestUse={handleSuggestUse}
        />
      </WorkcenterSection>

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
    </WorkcenterShell>
  );
}

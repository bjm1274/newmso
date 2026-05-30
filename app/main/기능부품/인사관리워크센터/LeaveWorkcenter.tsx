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
import { supabase } from '@/lib/supabase';
import { syncAnnualLeaveUsedForStaff, calculateLeaveDays } from '@/lib/annual-leave-ledger';
import { recalculateLeaveBalance } from '@/lib/annual-leave-balance';
import { logAudit, readClientAuditActor } from '@/lib/audit';
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

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalTab, setApprovalTab] = useState<'pending' | 'history'>('pending');
  const [actioningId, setActioningId] = useState<string | null>(null);

  const handleStatusUpdate = async (id: string, status: '승인' | '반려') => {
    setActioningId(id);
    try {
      const targetLeave = data.requests.find((l) => l.id === id);
      if (!targetLeave) return;
      const previousStatus = targetLeave.status;

      const { error } = await supabase
        .from('leave_requests')
        .update({
          status,
          approved_at: status === '승인' ? new Date().toISOString() : null,
        })
        .eq('id', id);

      if (error) throw error;

      // 만약 '연차(부여)' 유형이고 상태가 '승인'으로 되었거나 철회되는 경우
      if (targetLeave.leave_type === '연차(부여)') {
        // 정본 calculateLeaveDays 로 통일 (Math.ceil + 음수 보정)
        const days = calculateLeaveDays(targetLeave.start_date, targetLeave.end_date || targetLeave.start_date);

        const staff = staffs.find((s) => String(s.id) === String(targetLeave.staff_id));
        const currentTotal = Number(staff?.annual_leave_total ?? 0);
        let newTotal = currentTotal;

        if (previousStatus !== '승인' && status === '승인') {
          newTotal = currentTotal + days;
        } else if (previousStatus === '승인' && status !== '승인') {
          newTotal = Math.max(0, currentTotal - days);
        }

        if (newTotal !== currentTotal) {
          await supabase
            .from('staff_members')
            .update({ annual_leave_total: newTotal })
            .eq('id', targetLeave.staff_id);
        }
      }

      await syncAnnualLeaveUsedForStaff(targetLeave.staff_id);
      await recalculateLeaveBalance(targetLeave.staff_id);

      const actor = readClientAuditActor();
      await logAudit(
        'leave_request_status_updated',
        'leave_request',
        id,
        {
          staff_id: targetLeave.staff_id,
          leave_type: targetLeave.leave_type,
          before_status: previousStatus,
          after_status: status,
        },
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
      const { error } = await supabase.from('leave_requests').delete().eq('id', id);
      if (error) throw error;

      if (target.status === '승인' && target.leave_type === '연차(부여)') {
        const days = calculateLeaveDays(target.start_date, target.end_date || target.start_date);
        const staff = staffs.find((s) => String(s.id) === String(target.staff_id));
        const currentTotal = Number(staff?.annual_leave_total ?? 0);
        const newTotal = Math.max(0, currentTotal - days);
        await supabase
          .from('staff_members')
          .update({ annual_leave_total: newTotal })
          .eq('id', target.staff_id);
      }

      await syncAnnualLeaveUsedForStaff(target.staff_id);
      await recalculateLeaveBalance(target.staff_id);

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
      toast(`${item.staff.name ?? '직원'}에게 사용 권유 — 연차 사용기록 폼에 채웠습니다.`, 'success');
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
        <WorkcenterSection
          title="직원별 연차 현황"
          padded={false}
          rightSlot={
            data.totals.pending > 0 ? (
              <button
                type="button"
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
    </WorkcenterShell>
  );
}

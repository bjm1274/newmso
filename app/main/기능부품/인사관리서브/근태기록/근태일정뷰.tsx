'use client';

import { useMemo } from 'react';
import { useActionDialog } from '@/app/components/useActionDialog';
import {
  CalendarTable,
  type CalendarCellInfo,
  type CalendarRow,
} from '@/app/components/CalendarTable';
import {
  getCompactShiftLabel,
  getShiftBandColorClass,
  resolveRosterShiftBand,
} from './근태유틸';
import { LucideIcon } from '../../조직도서브/조직도측면창';
import {
  ApprovalPanel,
  LaborLawWarnings,
  ShiftSwapModal,
  SwapRequestsPanel,
  ToolPalette,
} from './근태일정뷰.internal';
import type { AttendanceScheduleViewProps, LocalStaffMember } from './근태일정뷰.types';

export type { AttendanceScheduleViewProps } from './근태일정뷰.types';

export default function AttendanceScheduleView({
  rosterFiltered,
  teamList,
  rosterTeam,
  setRosterTeam,
  selectedMonth,
  daysArray,
  shiftAssignments,
  visibleWorkShifts,
  workShifts,
  shiftLookup,
  activeTool,
  setActiveTool,
  approvalPending,
  approvalStatus,
  validateSchedule,
  pendingApprovals,
  pendingSwaps,
  canCreateRoster,
  canApproveRoster,
  showSwapModal,
  setShowSwapModal,
  swapData,
  setSwapData,
  handleSwapRequest,
  setAssignment,
  handleApprove,
  handleReject,
  handleApproveSwap,
  handleRejectSwap,
  handleSubmitApproval,
}: AttendanceScheduleViewProps) {
  const { dialog, openPrompt } = useActionDialog();

  // CalendarTable 위임용 데이터 (daysArray + selectedMonth → startDate/endDate)
  const [yearStr, monthStr] = selectedMonth.split('-');
  const yearNum = Number(yearStr);
  const monthNum = Number(monthStr);
  const firstDay = daysArray[0] ?? 1;
  const lastDay = daysArray[daysArray.length - 1] ?? firstDay;
  const startDate = useMemo(
    () => new Date(yearNum || 2000, (monthNum || 1) - 1, firstDay),
    [yearNum, monthNum, firstDay],
  );
  const endDate = useMemo(
    () => new Date(yearNum || 2000, (monthNum || 1) - 1, lastDay),
    [yearNum, monthNum, lastDay],
  );
  const toIso = (d: Date): string => {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dd}`;
  };
  const rows: CalendarRow<LocalStaffMember>[] = useMemo(
    () =>
      rosterFiltered.map((s) => ({
        id: String(s.id),
        data: s,
        label: (
          <div className="flex flex-col">
            <span className="font-bold text-sm text-foreground whitespace-nowrap">{s.name}</span>
            <span className="text-[10px] text-[var(--toss-gray-4)] font-medium">{s.department}</span>
          </div>
        ),
      })),
    [rosterFiltered],
  );

  // 드래그/지우개/Swap 위임 (기존 onMouseDown/onMouseEnter 로직 보존).
  // JM6: 셀 단일 클릭(mousedown=click 시작)으로 동일 결과를 얻을 수 있어 키보드 대안 유지.
  const handleCellDown = (cell: CalendarCellInfo, row?: CalendarRow<LocalStaffMember>) => {
    if (!row) return;
    const dStr = toIso(cell.date);
    const value = shiftAssignments[`${row.id}_${dStr}`] ?? '';
    if (canCreateRoster) {
      if (activeTool === 'eraser') setAssignment(row.id, dStr, null);
      else if (activeTool) setAssignment(row.id, dStr, activeTool);
    } else {
      setSwapData({ staffId: row.id, date: dStr, currentShiftId: value || null });
      setShowSwapModal(true);
    }
  };
  const handleCellEnter = (cell: CalendarCellInfo, row?: CalendarRow<LocalStaffMember>) => {
    if (!row || !canCreateRoster || !activeTool) return;
    const dStr = toIso(cell.date);
    if (activeTool === 'eraser') setAssignment(row.id, dStr, null);
    else setAssignment(row.id, dStr, activeTool);
  };

  return (
    <>
    {dialog}
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden shadow-sm flex flex-col min-h-[calc(100dvh-200px)]">
      <div className="p-4 border-b border-[var(--border)] bg-[var(--tab-bg)]/50 flex flex-col gap-3 shrink-0">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <LucideIcon name="ClipboardList" size={17} strokeWidth={2.2} />
              근무표 생성
              {approvalStatus === 'pending' && <span className="px-2 py-0.5 rounded-[var(--radius-md)] bg-amber-100 text-amber-700 text-[10px] font-bold animate-pulse">승인 대기중</span>}
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={rosterTeam}
              onChange={(e) => setRosterTeam(e.target.value)}
              className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold text-foreground bg-[var(--card)]"
            >
              {teamList.length === 0
                ? <option value="전체">교대근무자 없음</option>
                : teamList.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Approval panel for approvers */}
        {canApproveRoster && (
          <ApprovalPanel
            pendingApprovals={pendingApprovals}
            onApprove={handleApprove}
            onRejectRequest={(req) => {
              void (async () => {
                const reason = await openPrompt({
                  title: '근무표를 반려할까요?',
                  description: `${req.team_name || '전체'} · ${req.year_month} 근무표를 반려합니다. 사유는 요청자에게 전달됩니다.`,
                  placeholder: '반려 사유를 입력하세요.',
                  inputType: 'textarea',
                  required: true,
                  confirmText: '반려',
                  tone: 'danger',
                });
                if (reason?.trim()) handleReject(req, reason.trim());
              })();
            }}
          />
        )}

        {/* Swap requests panel */}
        {(canApproveRoster || canCreateRoster) && (
          <SwapRequestsPanel
            pendingSwaps={pendingSwaps}
            onApprove={handleApproveSwap}
            onRejectRequest={(req) => {
              void (async () => {
                const reason = await openPrompt({
                  title: '근무 교환 요청을 반려할까요?',
                  description: `${req.requested_by_name || '요청자'}님의 ${req.work_date || '선택일'} 근무 교환 요청을 반려합니다.`,
                  placeholder: '반려 사유를 입력하세요.',
                  inputType: 'textarea',
                  required: true,
                  confirmText: '반려',
                  tone: 'danger',
                });
                if (reason?.trim()) handleRejectSwap(req, reason.trim());
              })();
            }}
          />
        )}

        <LaborLawWarnings warnings={validateSchedule} />

        <ToolPalette
          visibleWorkShifts={visibleWorkShifts}
          activeTool={activeTool}
          onToolChange={setActiveTool}
        />
      </div>

      <div className="overflow-auto flex-1 custom-scrollbar pb-4 relative">
        <CalendarTable<LocalStaffMember>
          mode="staff-by-day"
          startDate={startDate}
          endDate={endDate}
          rows={rows}
          rowHeaderLabel="직원명"
          ariaLabel={`${selectedMonth} 근무표`}
          emptyMessage="표시할 직원이 없습니다."
          className="p-2 sm:p-3"
          cellTone={(cell, row) => {
            if (!row) return 'normal';
            const dStr = toIso(cell.date);
            const value = shiftAssignments[`${row.id}_${dStr}`] ?? '';
            const shiftObj = shiftLookup.get(String(value));
            if (!shiftObj) return cell.isWeekend ? 'danger' : 'normal';
            const band = resolveRosterShiftBand(shiftObj);
            if (band === 'off') return 'danger';
            if (band === 'night') return 'normal';
            if (band === 'evening') return 'warn';
            return 'ok';
          }}
          renderCell={(cell, row) => {
            if (!row) return null;
            const dStr = toIso(cell.date);
            const value = shiftAssignments[`${row.id}_${dStr}`] ?? '';
            const shiftObj = shiftLookup.get(String(value));
            const cellBand = shiftObj ? resolveRosterShiftBand(shiftObj) : null;
            const colorClass = shiftObj
              ? getShiftBandColorClass(cellBand || 'day', 'cell')
              : '';
            return (
              <div
                title={shiftObj?.name || ''}
                className={`flex min-h-8 w-full items-center justify-center rounded px-1 py-0.5 text-center text-[10px] leading-tight break-keep transition-all ${colorClass}`}
              >
                {shiftObj ? (
                  getCompactShiftLabel(shiftObj)
                ) : (
                  <span className="text-[9px] text-[var(--toss-gray-3)] font-black opacity-30">+</span>
                )}
              </div>
            );
          }}
          onCellPointerDown={handleCellDown}
          onCellPointerEnter={handleCellEnter}
        />
      </div>

      {/* Submit approval button */}
      {canCreateRoster && (
        <div className="p-4 border-t border-[var(--border)] bg-[var(--tab-bg)]/50 flex items-center justify-between gap-3">
          <div className="text-[11px] text-[var(--toss-gray-4)] font-medium">
            {Object.values(shiftAssignments).filter(Boolean).length}건 배정됨
            {validateSchedule.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-rose-500">
                <LucideIcon name="AlertTriangle" size={12} strokeWidth={2.2} />
                경고 {validateSchedule.length}건
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmitApproval}
            disabled={approvalPending || approvalStatus === 'pending'}
            className="px-5 py-2.5 bg-success text-white font-bold text-[12px] rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {approvalPending ? '전송중...' : approvalStatus === 'pending' ? (
              <>
                <LucideIcon name="Hourglass" size={14} strokeWidth={2.2} />
                승인 대기중
              </>
            ) : (
              <>
                <LucideIcon name="Save" size={14} strokeWidth={2.2} />
                승인요청
              </>
            )}
          </button>
        </div>
      )}

      <ShiftSwapModal
        open={showSwapModal}
        swapData={swapData}
        rosterFiltered={rosterFiltered}
        workShifts={workShifts}
        onClose={() => setShowSwapModal(false)}
        onSubmit={handleSwapRequest}
      />
    </div>
    </>
  );
}

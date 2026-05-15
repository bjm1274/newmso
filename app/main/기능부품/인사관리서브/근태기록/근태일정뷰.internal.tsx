'use client';

/**
 * 근태일정뷰.internal.tsx
 *
 * 근태일정뷰의 보조 패널/모달 컴포넌트.
 * 본 컴포넌트가 300줄을 초과하지 않도록 본 파일에서 분리 (JM).
 *
 * 분리 대상:
 *  - ApprovalPanel: 승인 대기 근무표 목록
 *  - SwapRequestsPanel: 근무 교환 요청 목록
 *  - LaborLawWarnings: 근로기준법 위반 경고 박스
 *  - ShiftSwapModal: 근무 교환 신청 모달
 *  - ToolPalette: 도구(데이/이브/나이트/지우개) 버튼 묶음
 */

import { toast } from '@/lib/toast';
import { LucideIcon } from '../../조직도서브/조직도측면창';
import { getShiftBandColorClass, resolveRosterShiftBand } from './근태유틸';

// ---------------------------------------------------------------------------
// 공통 타입 (호출자가 넘기는 비정형 객체를 그대로 사용)
// ---------------------------------------------------------------------------
type ApprovalRequest = {
  id: string;
  team_name?: string;
  year_month?: string;
  requested_by_name?: string;
  created_at: string;
  assignments?: unknown[];
};

type SwapRequest = {
  id: string;
  requested_by_name?: string;
  work_date?: string;
  reason?: string;
};

type WorkShift = {
  id: string;
  name?: string;
};

type StaffRef = {
  id: string;
  name?: string;
};

// ---------------------------------------------------------------------------
// 승인 대기 근무표 패널
// ---------------------------------------------------------------------------
export type ApprovalPanelProps = {
  pendingApprovals: ApprovalRequest[];
  onApprove: (req: ApprovalRequest) => void;
  onRejectRequest: (req: ApprovalRequest) => void;
};

export function ApprovalPanel({ pendingApprovals, onApprove, onRejectRequest }: ApprovalPanelProps) {
  if (pendingApprovals.length === 0) return null;
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-[var(--radius-lg)] p-3 space-y-2">
      <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
        <LucideIcon name="Inbox" size={15} strokeWidth={2.2} />
        승인 대기 근무표 {pendingApprovals.length}건
      </p>
      {pendingApprovals.map((req) => (
        <div key={req.id} className="bg-[var(--card)] border border-amber-200/50 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 text-[11px]">
            <p className="font-bold text-foreground">{req.team_name || '전체'} · {req.year_month}</p>
            <p className="text-[var(--toss-gray-4)] mt-0.5">요청: {req.requested_by_name} · {new Date(req.created_at).toLocaleDateString('ko-KR')}</p>
            <p className="text-[var(--toss-gray-3)] mt-0.5">{(req.assignments || []).length}건 배정</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => onApprove(req)} className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--success)] px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:opacity-90">
              <LucideIcon name="Check" size={13} strokeWidth={2.4} />
              승인
            </button>
            <button type="button" onClick={() => onRejectRequest(req)} className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--danger)] px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:opacity-90">
              <LucideIcon name="X" size={13} strokeWidth={2.4} />
              반려
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 근무 교환 요청 패널
// ---------------------------------------------------------------------------
export type SwapRequestsPanelProps = {
  pendingSwaps: SwapRequest[];
  onApprove: (req: SwapRequest) => void;
  onRejectRequest: (req: SwapRequest) => void;
};

export function SwapRequestsPanel({ pendingSwaps, onApprove, onRejectRequest }: SwapRequestsPanelProps) {
  if (pendingSwaps.length === 0) return null;
  return (
    <div className="bg-[var(--success-light)] border border-[var(--success-light)] rounded-[var(--radius-lg)] p-3 space-y-2">
      <p className="text-[11px] font-bold text-[var(--success)] flex items-center gap-2">
        <LucideIcon name="RefreshCw" size={15} strokeWidth={2.2} />
        근무 교환 요청 {pendingSwaps.length}건
      </p>
      {pendingSwaps.map((req) => (
        <div key={req.id} className="bg-[var(--card)] border border-[var(--success-light)] rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 text-[11px]">
            <p className="font-bold text-foreground">{req.requested_by_name} ➔ {req.work_date} 근무 변경 희망</p>
            <p className="text-[var(--toss-gray-4)] mt-0.5">사유: {req.reason || '사유 미입력'}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => onApprove(req)} className="px-3 py-1.5 bg-[var(--success)] text-white text-[10px] font-bold rounded-lg hover:opacity-90">승인</button>
            <button type="button" onClick={() => onRejectRequest(req)} className="px-3 py-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-lg hover:bg-rose-600">반려</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 근로기준법 위반 경고
// ---------------------------------------------------------------------------
export function LaborLawWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-[var(--radius-lg)] p-3">
      <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-400">
        <LucideIcon name="AlertTriangle" size={13} strokeWidth={2.2} />
        근로기준법 위반 경고
      </p>
      {warnings.slice(0, 10).map((w, i) => (
        <p key={i} className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">{w}</p>
      ))}
      {warnings.length > 10 && <p className="text-[10px] text-rose-400">... 외 {warnings.length - 10}건</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 도구 팔레트 (근무형태/지우개)
// ---------------------------------------------------------------------------
export type ToolPaletteProps = {
  visibleWorkShifts: { id: string; name?: string }[];
  activeTool: string | null;
  onToolChange: (tool: string | null) => void;
};

export function ToolPalette({ visibleWorkShifts, activeTool, onToolChange }: ToolPaletteProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-[var(--card)] p-2 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm w-fit">
      <span className="text-[10px] font-bold text-[var(--toss-gray-3)] mx-3">도구</span>
      <div className="w-px h-6 bg-[var(--tab-bg)] mr-2" />
      {visibleWorkShifts.map((sh) => {
        const isActive = activeTool === sh.id;
        const colorClass = getShiftBandColorClass(resolveRosterShiftBand(sh), 'tool');
        return (
          <button
            key={sh.id}
            type="button"
            onClick={() => onToolChange(isActive ? null : sh.id)}
            className={`px-4 py-2 rounded-[var(--radius-md)] text-[11px] font-bold transition-all border ${isActive ? 'ring-2 ring-offset-2 ring-blue-500 scale-105 shadow-md ' + colorClass : colorClass}`}
          >
            {sh.name}
          </button>
        );
      })}
      <div className="w-px h-6 bg-[var(--tab-bg)] mx-1" />
      <button
        type="button"
        onClick={() => onToolChange(activeTool === 'eraser' ? null : 'eraser')}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-md)] text-[11px] font-bold transition-all border ${activeTool === 'eraser' ? 'bg-red-500/100 border-red-500 text-white ring-2 ring-offset-2 ring-red-500 scale-105 shadow-md' : 'bg-[var(--card)] text-red-500 border-red-500/20 hover:bg-red-500/10'}`}
      >
        <LucideIcon name="Eraser" size={14} strokeWidth={2.2} />
        지우개
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 근무 교환 신청 모달
// ---------------------------------------------------------------------------
export type ShiftSwapModalProps = {
  open: boolean;
  swapData: { staffId: string; date: string; currentShiftId: string | null } | null;
  rosterFiltered: StaffRef[];
  workShifts: WorkShift[];
  onClose: () => void;
  onSubmit: (date: string, reason: string) => void;
};

export function ShiftSwapModal({ open, swapData, rosterFiltered, workShifts, onClose, onSubmit }: ShiftSwapModalProps) {
  if (!open || !swapData) return null;
  const staffName = rosterFiltered.find((f) => f.id === swapData.staffId)?.name || '본인';
  const currentShiftName = workShifts.find((w) => w.id === swapData.currentShiftId)?.name || '휴무';
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200 backdrop-blur-sm">
      <div className="bg-[var(--background)] rounded-[var(--radius-xl)] w-full max-w-sm shadow-[var(--shadow-premium)] relative border border-[var(--border)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--success-light)] flex justify-between items-center">
          <h3 className="font-bold text-sm flex items-center gap-2 text-[var(--success)]">
            <LucideIcon name="RefreshCw" size={16} strokeWidth={2.2} />
            근무 교환 신청
          </h3>
          <button type="button" onClick={onClose} className="text-[var(--success)]/50 hover:text-[var(--success)]" aria-label="닫기">
            <LucideIcon name="X" size={16} strokeWidth={2.4} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-[var(--tab-bg)] p-3 rounded-[var(--radius-lg)] border border-[var(--border)]">
            <p className="text-[10px] font-bold text-[var(--toss-gray-4)] mb-1 uppercase">선택된 근무</p>
            <p className="text-[13px] font-bold">{swapData.date} ({staffName})</p>
            <p className="text-[11px] text-[var(--success)] font-bold mt-1">현재: {currentShiftName}</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="swapReason" className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1 block">
              교환 사유 (수간호사/관리자 확인용)
            </label>
            <textarea
              id="swapReason"
              rows={3}
              placeholder="예: 개인 사정으로 인한 데이-나이트 교환 희망"
              className="w-full px-3 py-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--success)]/20"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('swapReason') as HTMLTextAreaElement | null;
              const reason = el?.value ?? '';
              if (!reason.trim()) {
                toast('사유를 입력해주세요.', 'warning');
                return;
              }
              onSubmit(swapData.date, reason);
            }}
            className="w-full py-3 bg-[var(--success)] text-white font-bold text-sm rounded-[var(--radius-lg)] hover:opacity-90 shadow-md transition-all"
          >
            교환 요청 보내기
          </button>
          <p className="text-[10px] text-center text-[var(--toss-gray-3)]">관리자 승인 후 최종 반영됩니다.</p>
        </div>
      </div>
    </div>
  );
}

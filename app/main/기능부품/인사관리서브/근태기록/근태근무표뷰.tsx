'use client';

import { toast } from '@/lib/toast';
import { MenuIcon } from '../../조직도서브/조직도측면창';
import type { ActionDialogInputType, ActionDialogTone } from '@/app/components/ActionDialog';
import {
  type StaffMember,
  getShiftBandColorClass,
  getShiftCellLabel,
  resolveRosterShiftBand } from './근태관리메인-내부유틸';

type OpenPrompt = (options: {
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  inputType?: ActionDialogInputType;
  required?: boolean;
  maxLength?: number;
  helperText?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ActionDialogTone;
  centerText?: boolean;
  largeText?: boolean;
}) => Promise<string | null>;

type AttendanceScheduleViewProps = {
  selectedMonth: string;
  daysArray: number[];
  teamList: string[];
  rosterTeam: string;
  setRosterTeam: (team: string) => void;
  rosterFiltered: StaffMember[];
  toolboxShifts: any[];
  workShifts: any[];
  shiftAssignments: Record<string, string>;
  shiftLookup: Map<string, any>;
  setAssignment: (staffId: string, workDate: string, shiftId: string | null) => void;
  activeTool: string | null;
  setActiveTool: (tool: string | null) => void;
  canCreateRoster: boolean;
  canApproveRoster: boolean;
  approvalStatus: 'idle' | 'pending' | 'approved' | 'rejected';
  approvalPending: boolean;
  pendingApprovals: any[];
  pendingSwaps: any[];
  validateSchedule: string[];
  setShowShiftWizard: (show: boolean) => void;
  handleSubmitApproval: () => void;
  handleApprove: (request: any) => void;
  handleReject: (request: any, reason: string) => void;
  handleApproveSwap: (req: any) => void;
  handleRejectSwap: (req: any, reason: string) => void;
  handleSwapRequest: (targetDate: string, reason: string) => void;
  showSwapModal: boolean;
  setShowSwapModal: (show: boolean) => void;
  swapData: { staffId: string; date: string; currentShiftId: string | null } | null;
  setSwapData: (data: { staffId: string; date: string; currentShiftId: string | null } | null) => void;
  openPrompt: OpenPrompt;
};

export default function AttendanceScheduleView({
  selectedMonth,
  daysArray,
  teamList,
  rosterTeam,
  setRosterTeam,
  rosterFiltered,
  toolboxShifts,
  workShifts,
  shiftAssignments,
  shiftLookup,
  setAssignment,
  activeTool,
  setActiveTool,
  canCreateRoster,
  canApproveRoster,
  approvalStatus,
  approvalPending,
  pendingApprovals,
  pendingSwaps,
  validateSchedule,
  setShowShiftWizard,
  handleSubmitApproval,
  handleApprove,
  handleReject,
  handleApproveSwap,
  handleRejectSwap,
  handleSwapRequest,
  showSwapModal,
  setShowSwapModal,
  swapData,
  setSwapData,
  openPrompt }: AttendanceScheduleViewProps) {
  return (
    <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[calc(100dvh-200px)]">
      <div className="p-4 border-b border-[var(--border)] dark:border-zinc-800 bg-[var(--tab-bg)]/50 dark:bg-zinc-900/50 flex flex-col gap-3 shrink-0">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <span className="text-xl">📋</span> 근무표 생성
              {approvalStatus === 'pending' && <span className="px-2 py-0.5 rounded-[var(--radius-md)] bg-amber-100 text-amber-700 text-[10px] font-bold animate-pulse">승인 대기중</span>}
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={rosterTeam}
              onChange={(e) => setRosterTeam(e.target.value)}
              className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold text-foreground bg-[var(--card)]"
            >
              {teamList.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {canCreateRoster && (
              <button
                type="button"
                onClick={() => setShowShiftWizard(true)}
                className="px-4 py-2 bg-purple-500/10 text-purple-600 border border-purple-500/20 font-bold text-[11px] rounded-[var(--radius-lg)] shadow-sm hover:bg-purple-500/20 transition-all shrink-0 flex items-center gap-2 focus:outline-none"
              >
                <MenuIcon name="edit" className="h-4 w-4 shrink-0" />
                3교대 마법사
              </button>
            )}
          </div>
        </div>

        {/* Approval panel for approvers */}
        {canApproveRoster && pendingApprovals.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 space-y-2">
            <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <span className="text-base">📨</span> 승인 대기 근무표 {pendingApprovals.length}건
            </p>
            {pendingApprovals.map((req: any) => (
              <div key={req.id} className="bg-[var(--card)] dark:bg-zinc-800 border border-amber-200/50 dark:border-zinc-700 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 text-[11px]">
                  <p className="font-bold text-foreground">{req.team_name || '전체'} · {req.year_month}</p>
                  <p className="text-[var(--toss-gray-4)] mt-0.5">요청: {req.requested_by_name} · {new Date(req.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
                  <p className="text-[var(--toss-gray-3)] mt-0.5">{(req.assignments || []).length}건 배정</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleApprove(req)} className="px-3 py-1.5 bg-emerald-500 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-600 transition-colors">✅ 승인</button>
                  <button onClick={() => {
                    void (async () => {
                      const reason = await openPrompt({
                        title: '근무표를 반려할까요?',
                        description: `${req.team_name || '전체'} · ${req.year_month} 근무표를 반려합니다. 사유는 요청자에게 전달됩니다.`,
                        placeholder: '반려 사유를 입력하세요.',
                        inputType: 'textarea',
                        required: true,
                        confirmText: '반려',
                        tone: 'danger' });
                      if (reason?.trim()) handleReject(req, reason.trim());
                    })();
                  }} className="px-3 py-1.5 bg-rose-500 text-white text-[11px] font-bold rounded-lg hover:bg-rose-600 transition-colors">❌ 반려</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Swap requests panel */}
        {(canApproveRoster || canCreateRoster) && pendingSwaps.length > 0 && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-3 space-y-2">
            <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <span className="text-base">🔄</span> 근무 교환(Swap) 요청 {pendingSwaps.length}건
            </p>
            {pendingSwaps.map((req: any) => (
              <div key={req.id} className="bg-[var(--card)] dark:bg-zinc-800 border border-emerald-200/50 dark:border-zinc-700 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 text-[11px]">
                  <p className="font-bold text-foreground">{req.requested_by_name} ➔ {req.work_date} 근무 변경 희망</p>
                  <p className="text-[var(--toss-gray-4)] mt-0.5">사유: {req.reason || '사유 미입력'}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleApproveSwap(req)} className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600">승인</button>
                  <button onClick={() => {
                    void (async () => {
                      const reason = await openPrompt({
                        title: '근무 교환 요청을 반려할까요?',
                        description: `${req.requested_by_name || '요청자'}님의 ${req.work_date || '선택일'} 근무 교환 요청을 반려합니다.`,
                        placeholder: '반려 사유를 입력하세요.',
                        inputType: 'textarea',
                        required: true,
                        confirmText: '반려',
                        tone: 'danger' });
                      if (reason?.trim()) handleRejectSwap(req, reason.trim());
                    })();
                  }} className="px-3 py-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-lg hover:bg-rose-600">반려</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Labor law warnings */}
        {validateSchedule.length > 0 && (
          <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-xl p-3">
            <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400 mb-1 flex items-center gap-1"><span>🚨</span> 근로기준법 위반 경고</p>
            {validateSchedule.slice(0, 10).map((w, i) => (
              <p key={i} className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">{w}</p>
            ))}
            {validateSchedule.length > 10 && <p className="text-[10px] text-rose-400">... 외 {validateSchedule.length - 10}건</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 bg-[var(--card)] dark:bg-zinc-800 p-2 rounded-2xl border border-[var(--border)] dark:border-zinc-700 shadow-sm w-fit">
          <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mx-3">Toolbox</span>
          <div className="w-px h-6 bg-[var(--tab-bg)] dark:bg-zinc-700 mr-2"></div>
          {toolboxShifts.map((sh: any) => {
            const isActive = activeTool === sh.id;
            const colorClass = getShiftBandColorClass(resolveRosterShiftBand(sh), 'tool');

            return (
              <button
                key={sh.id}
                onClick={() => setActiveTool(isActive ? null : sh.id)}
                className={`px-4 py-2 rounded-[var(--radius-md)] text-[11px] font-bold transition-all border ${isActive ? 'ring-2 ring-offset-2 ring-blue-500 scale-105 shadow-md ' + colorClass : colorClass}`}
              >
                {sh.name}
              </button>
            );
          })}
          <div className="w-px h-6 bg-[var(--tab-bg)] dark:bg-zinc-700 mx-1"></div>
          <button
            type="button"
            onClick={() => setActiveTool(activeTool === 'eraser' ? null : 'eraser')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-md)] text-[11px] font-bold transition-all border ${activeTool === 'eraser' ? 'bg-red-500/100 border-red-500 text-white ring-2 ring-offset-2 ring-red-500 scale-105 shadow-md' : 'bg-[var(--card)] dark:bg-zinc-800 text-red-500 border-red-500/20 dark:border-red-900/50 hover:bg-red-500/10 dark:hover:bg-red-900/20'}`}
          >
            <span className="text-sm">🧹</span> 지우개
          </button>
        </div>
      </div>

      <div className="overflow-x-auto flex-1 custom-scrollbar pb-4 relative">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead className="bg-[var(--tab-bg)] dark:bg-zinc-900/80 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider sticky top-0 z-20 shadow-sm border-b border-[var(--border)] dark:border-zinc-800">
            <tr>
              <th className="px-4 py-4 sticky left-0 bg-[var(--tab-bg)] dark:bg-zinc-900 z-30 border-r border-[var(--border)] dark:border-zinc-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">직원명</th>
              {daysArray.map((d) => {
                const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                const dayOfWeek = new Date(dStr).getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                return (
                  <th key={d} className={`px-2 py-4 text-center border-r border-[var(--border)] dark:border-zinc-800 min-w-[44px] ${isWeekend ? 'text-red-400 dark:text-red-500' : ''}`}>
                    <div className="flex flex-col items-center">
                      <span>{d}</span>
                      <span className="text-[9px] font-medium opacity-60 mt-0.5">{['일', '월', '화', '수', '목', '금', '토'][dayOfWeek]}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rosterFiltered.map((s: StaffMember) => (
              <tr key={s.id} className="hover:bg-[var(--tab-bg)]/50 dark:hover:bg-zinc-800/30 group">
                <td className="px-4 py-3 sticky left-0 bg-[var(--card)] dark:bg-zinc-900 group-hover:bg-[var(--tab-bg)] dark:group-hover:bg-zinc-800/80 z-10 border-r border-[var(--border)] dark:border-zinc-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors">
                  <div className="flex flex-col">
                    <span className="font-bold text-sm text-foreground whitespace-nowrap">{s.name}</span>
                    <span className="text-[10px] text-[var(--toss-gray-4)] font-medium">{s.department}</span>
                  </div>
                </td>
                {daysArray.map((d) => {
                  const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                  const key = `${s.id}_${dStr}`;
                  const value = shiftAssignments[key] ?? '';
                  const shiftObj = shiftLookup.get(String(value));
                  const isWeekend = new Date(dStr).getDay() === 0 || new Date(dStr).getDay() === 6;
                  const cellBand = shiftObj ? resolveRosterShiftBand(shiftObj) : null;
                  const cellColor = shiftObj
                    ? getShiftBandColorClass(cellBand || 'day', 'cell')
                    : isWeekend
                      ? 'bg-red-500/10/30 dark:bg-red-900/5 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800/50'
                      : 'hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800/50';
                  return (
                    <td
                      key={d}
                      title={shiftObj?.name || ''}
                      className={`p-1 border-r border-[var(--border)] dark:border-zinc-800 min-w-[44px] cursor-pointer select-none transition-colors border-b-0 border-t-0 active:bg-blue-500/10 dark:active:bg-blue-900/20 active:ring-inset active:ring-2 active:ring-blue-400 ${cellColor}`}
                      onMouseDown={() => {
                        if (canCreateRoster) {
                          if (activeTool === 'eraser') setAssignment(s.id, dStr, null);
                          else if (activeTool) setAssignment(s.id, dStr, activeTool);
                        } else {
                          // Regular nurse click -> request swap
                          setSwapData({ staffId: s.id, date: dStr, currentShiftId: value });
                          setShowSwapModal(true);
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (e.buttons === 1 && canCreateRoster) { // 1 is left click drag
                          if (activeTool === 'eraser') setAssignment(s.id, dStr, null);
                          else if (activeTool) setAssignment(s.id, dStr, activeTool);
                        }
                      }}
                    >
                      <div className="w-full h-8 flex items-center justify-center text-center text-[10px] leading-tight font-bold rounded transition-all px-0.5">
                        {shiftObj ? getShiftCellLabel(shiftObj) : <span className="text-[var(--toss-gray-3)] font-semibold">휴무</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Submit approval button */}
      {canCreateRoster && (
        <div className="p-4 border-t border-[var(--border)] dark:border-zinc-800 bg-[var(--tab-bg)]/50 flex items-center justify-between gap-3">
          <div className="text-[11px] text-[var(--toss-gray-4)] font-medium">
            {Object.values(shiftAssignments).filter(Boolean).length}건 배정됨
            {validateSchedule.length > 0 && <span className="text-rose-500 ml-2">⚠️ 경고 {validateSchedule.length}건</span>}
          </div>
          <button
            type="button"
            onClick={handleSubmitApproval}
            disabled={approvalPending || approvalStatus === 'pending'}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-[12px] rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {approvalPending ? '전송중...' : approvalStatus === 'pending' ? '⏳ 승인 대기중' : '💾 승인요청'}
          </button>
        </div>
      )}

      {/* Shift Swap Modal */}
      {showSwapModal && swapData && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200 backdrop-blur-sm">
          <div className="bg-[var(--background)] rounded-2xl w-full max-w-sm shadow-2xl relative border border-[var(--border)] dark:border-zinc-800 overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] dark:border-zinc-800 bg-emerald-50 dark:bg-emerald-900/20 flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center gap-2 text-emerald-800 dark:text-emerald-400"><span className="text-xl">🔄</span> 근무 교환 신청</h3>
              <button onClick={() => setShowSwapModal(false)} className="text-emerald-800/50 hover:text-emerald-800">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-[var(--tab-bg)] dark:bg-zinc-800/50 p-3 rounded-xl border border-[var(--border)] dark:border-zinc-700">
                <p className="text-[10px] font-bold text-[var(--toss-gray-4)] mb-1 uppercase">선택된 근무</p>
                <p className="text-[13px] font-bold">{swapData.date} ({rosterFiltered.find(f => f.id === swapData.staffId)?.name || '본인'})</p>
                <p className="text-[11px] text-emerald-600 font-bold mt-1">현재: {workShifts.find(w => w.id === swapData.currentShiftId)?.name || 'OFF'}</p>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">교환 사유 (수간호사/관리자 확인용)</p>
                <textarea id="swapReason" rows={3} placeholder="예: 개인 사정으로 인한 데이-나이트 교환 희망" className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 ring-emerald-500/20" />
              </div>

              <button
                onClick={() => {
                  const reason = (document.getElementById('swapReason') as HTMLTextAreaElement).value;
                  if (!reason) {
                    toast('사유를 입력해주세요.', 'warning');
                    return;
                  }
                  handleSwapRequest(swapData.date, reason);
                }}
                className="w-full py-3 bg-emerald-500 text-white font-bold text-sm rounded-xl hover:bg-emerald-600 shadow-md transition-all"
              >
                교환 요청 보내기
              </button>
              <p className="text-[10px] text-center text-[var(--toss-gray-3)]">관리자 승인 후 최종 반영됩니다.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

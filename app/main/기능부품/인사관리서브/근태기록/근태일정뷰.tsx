'use client';

import { toast } from '@/lib/toast';
import { useActionDialog } from '@/app/components/useActionDialog';
import {
  getCompactShiftLabel,
  getShiftBandColorClass,
  resolveRosterShiftBand,
} from './근태유틸';
import { LucideIcon } from '../../조직도서브/조직도측면창';

type LocalStaffMember = {
  id: string;
  name: string;
  position: string;
  department: string;
  company: string;
  shift_type?: string;
  [key: string]: unknown;
};

export type AttendanceScheduleViewProps = {
  // 직원 데이터
  rosterFiltered: LocalStaffMember[];
  teamList: string[];
  rosterTeam: string;
  setRosterTeam: (team: string) => void;
  // 근무표 데이터
  selectedMonth: string;
  daysArray: number[];
  shiftAssignments: Record<string, string>;
  visibleWorkShifts: any[];
  workShifts: any[];
  shiftLookup: Map<string, any>;
  // 상태
  activeTool: string | null;
  setActiveTool: (tool: string | null) => void;
  approvalPending: boolean;
  approvalStatus: 'idle' | 'pending' | 'approved' | 'rejected';
  validateSchedule: string[];
  pendingApprovals: any[];
  pendingSwaps: any[];
  canCreateRoster: boolean;
  canApproveRoster: boolean;
  // Swap Modal
  showSwapModal: boolean;
  setShowSwapModal: (show: boolean) => void;
  swapData: { staffId: string; date: string; currentShiftId: string | null } | null;
  setSwapData: (data: { staffId: string; date: string; currentShiftId: string | null } | null) => void;
  handleSwapRequest: (targetDate: string, reason: string) => void;
  // 핸들러
  setAssignment: (staffId: string, workDate: string, shiftId: string | null) => void;
  handleApprove: (request: any) => void;
  handleReject: (request: any, reason: string) => void;
  handleApproveSwap: (req: any) => void;
  handleRejectSwap: (req: any, reason: string) => void;
  handleSubmitApproval: () => void;
  setShowShiftWizard: (show: boolean) => void;
};

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
  setShowShiftWizard,
}: AttendanceScheduleViewProps) {
  const { dialog, openConfirm, openPrompt } = useActionDialog();

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
            {canCreateRoster && (
              <>
                <button
                  type="button"
                  onClick={() => setShowShiftWizard(true)}
                  className="px-4 py-2 bg-purple-500/10 text-purple-600 border border-purple-500/20 font-bold text-[11px] rounded-[var(--radius-lg)] shadow-sm hover:bg-purple-500/20 transition-all shrink-0 flex items-center gap-2"
                >
                  <LucideIcon name="Wand2" size={15} strokeWidth={2.2} />
                  3교대 마법사
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const standardShift = visibleWorkShifts.find((sh: any) => sh.name.includes('통상') || sh.name.includes('일반') || sh.name.includes('주간') || sh.name.includes('9to6'));
                    if (!standardShift) {
                      toast('통상/일반/주간 이라는 이름이 포함된 근무형태가 부재합니다.', 'warning');
                      return;
                    }
                    const weekdayCount = daysArray.filter((d) => {
                      const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                      const dayOfWeek = new Date(dStr).getDay();
                      return dayOfWeek !== 0 && dayOfWeek !== 6;
                    }).length;
                    const confirmed = await openConfirm({
                      title: '통상근무를 일괄 적용할까요?',
                      description: [
                        `${selectedMonth} ${rosterTeam} 범위의 평일 근무를 "${standardShift.name}"으로 채웁니다.`,
                        `대상: ${rosterFiltered.length}명 · ${weekdayCount}일 · 최대 ${rosterFiltered.length * weekdayCount}칸`,
                        '이미 입력된 평일 배정도 덮어쓸 수 있습니다.',
                      ].join('\n'),
                      confirmText: '일괄 적용',
                      tone: 'accent',
                    });
                    if (!confirmed) return;
                    rosterFiltered.forEach((s: LocalStaffMember) => {
                      daysArray.forEach((d) => {
                        const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                        const dayOfWeek = new Date(dStr).getDay();
                        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                          setAssignment(s.id, dStr, standardShift.id);
                        }
                      });
                    });
                  }}
                  className="px-4 py-2 bg-blue-500/10 text-blue-600 border border-blue-500/20 font-bold text-[11px] rounded-[var(--radius-lg)] shadow-sm hover:bg-blue-500/20 transition-all shrink-0 flex items-center gap-2"
                >
                  <LucideIcon name="Building2" size={15} strokeWidth={2.2} />
                  통상근무 일괄
                </button>
              </>
            )}
          </div>
        </div>

        {/* Approval panel for approvers */}
        {canApproveRoster && pendingApprovals.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-[var(--radius-lg)] p-3 space-y-2">
            <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <LucideIcon name="Inbox" size={15} strokeWidth={2.2} />
              승인 대기 근무표 {pendingApprovals.length}건
            </p>
            {pendingApprovals.map((req: any) => (
              <div key={req.id} className="bg-[var(--card)] border border-amber-200/50 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 text-[11px]">
                  <p className="font-bold text-foreground">{req.team_name || '전체'} · {req.year_month}</p>
                  <p className="text-[var(--toss-gray-4)] mt-0.5">요청: {req.requested_by_name} · {new Date(req.created_at).toLocaleDateString('ko-KR')}</p>
                  <p className="text-[var(--toss-gray-3)] mt-0.5">{(req.assignments || []).length}건 배정</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleApprove(req)} className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--success)] px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:opacity-90">
                    <LucideIcon name="Check" size={13} strokeWidth={2.4} />
                    승인
                  </button>
                  <button onClick={() => {
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
                  }} className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--danger)] px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:opacity-90">
                    <LucideIcon name="X" size={13} strokeWidth={2.4} />
                    반려
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Swap requests panel */}
        {(canApproveRoster || canCreateRoster) && pendingSwaps.length > 0 && (
          <div className="bg-[var(--success-light)] border border-[var(--success-light)] rounded-[var(--radius-lg)] p-3 space-y-2">
            <p className="text-[11px] font-bold text-[var(--success)] flex items-center gap-2">
              <LucideIcon name="RefreshCw" size={15} strokeWidth={2.2} />
              근무 교환 요청 {pendingSwaps.length}건
            </p>
            {pendingSwaps.map((req: any) => (
              <div key={req.id} className="bg-[var(--card)] border border-[var(--success-light)] rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 text-[11px]">
                  <p className="font-bold text-foreground">{req.requested_by_name} ➔ {req.work_date} 근무 변경 희망</p>
                  <p className="text-[var(--toss-gray-4)] mt-0.5">사유: {req.reason || '사유 미입력'}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleApproveSwap(req)} className="px-3 py-1.5 bg-[var(--success)] text-white text-[10px] font-bold rounded-lg hover:opacity-90">승인</button>
                  <button onClick={() => {
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
                  }} className="px-3 py-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-lg hover:bg-rose-600">반려</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Labor law warnings */}
        {validateSchedule.length > 0 && (
          <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-[var(--radius-lg)] p-3">
            <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-400">
              <LucideIcon name="AlertTriangle" size={13} strokeWidth={2.2} />
              근로기준법 위반 경고
            </p>
            {validateSchedule.slice(0, 10).map((w, i) => (
              <p key={i} className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">{w}</p>
            ))}
            {validateSchedule.length > 10 && <p className="text-[10px] text-rose-400">... 외 {validateSchedule.length - 10}건</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 bg-[var(--card)] p-2 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm w-fit">
          <span className="text-[10px] font-bold text-[var(--toss-gray-3)] mx-3">도구</span>
          <div className="w-px h-6 bg-[var(--tab-bg)] mr-2"></div>
          {visibleWorkShifts.map((sh: any) => {
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
          <div className="w-px h-6 bg-[var(--tab-bg)] mx-1"></div>
          <button
            type="button"
            onClick={() => setActiveTool(activeTool === 'eraser' ? null : 'eraser')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-md)] text-[11px] font-bold transition-all border ${activeTool === 'eraser' ? 'bg-red-500/100 border-red-500 text-white ring-2 ring-offset-2 ring-red-500 scale-105 shadow-md' : 'bg-[var(--card)] text-red-500 border-red-500/20 hover:bg-red-500/10'}`}
          >
            <LucideIcon name="Eraser" size={14} strokeWidth={2.2} />
            지우개
          </button>
        </div>
      </div>

      <div className="overflow-x-auto flex-1 custom-scrollbar pb-4 relative">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead className="bg-[var(--tab-bg)] text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider sticky top-0 z-20 shadow-sm border-b border-[var(--border)]">
            <tr>
              <th className="px-4 py-4 sticky left-0 bg-[var(--tab-bg)] z-30 border-r border-[var(--border)] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">직원명</th>
              {daysArray.map((d) => {
                const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                const dayOfWeek = new Date(dStr).getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                return (
                  <th key={d} className={`px-2 py-4 text-center border-r border-[var(--border)] min-w-[72px] ${isWeekend ? 'text-red-400' : ''}`}>
                    <div className="flex flex-col items-center">
                      <span>{d}</span>
                      <span className="text-[9px] font-medium opacity-60 mt-0.5">{['일', '월', '화', '수', '목', '금', '토'][dayOfWeek]}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rosterFiltered.map((s: LocalStaffMember) => (
              <tr key={s.id} className="hover:bg-[var(--tab-bg)]/50 group">
                <td className="px-4 py-3 sticky left-0 bg-[var(--card)] group-hover:bg-[var(--tab-bg)] z-10 border-r border-[var(--border)] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors">
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
                      ? 'bg-red-500/10 hover:bg-[var(--tab-bg)]'
                      : 'hover:bg-[var(--tab-bg)]';
                  return (
                    <td
                      key={d}
                      title={shiftObj?.name || ''}
                      className={`p-1 border-r border-[var(--border)] min-w-[72px] cursor-pointer select-none transition-colors border-b-0 border-t-0 active:bg-blue-500/10 active:ring-inset active:ring-2 active:ring-blue-400 ${cellColor}`}
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
                        if (e.buttons === 1 && canCreateRoster) {
                          if (activeTool === 'eraser') setAssignment(s.id, dStr, null);
                          else if (activeTool) setAssignment(s.id, dStr, activeTool);
                        }
                      }}
                    >
                      <div className="flex min-h-8 w-full items-center justify-center rounded px-1 py-0.5 text-center text-[10px] leading-tight break-keep transition-all">
                        {shiftObj ? getCompactShiftLabel(shiftObj) : <span className="opacity-0 group-hover:opacity-20 [@media(hover:none)]:opacity-20 text-[9px] text-[var(--toss-gray-3)] font-black">+</span>}
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

      {/* Shift Swap Modal */}
      {showSwapModal && swapData && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200 backdrop-blur-sm">
          <div className="bg-[var(--background)] rounded-[var(--radius-xl)] w-full max-w-sm shadow-[var(--shadow-premium)] relative border border-[var(--border)] overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] bg-[var(--success-light)] flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center gap-2 text-[var(--success)]">
                <LucideIcon name="RefreshCw" size={16} strokeWidth={2.2} />
                근무 교환 신청
              </h3>
              <button onClick={() => setShowSwapModal(false)} className="text-[var(--success)]/50 hover:text-[var(--success)]" aria-label="닫기">
                <LucideIcon name="X" size={16} strokeWidth={2.4} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-[var(--tab-bg)] p-3 rounded-[var(--radius-lg)] border border-[var(--border)]">
                <p className="text-[10px] font-bold text-[var(--toss-gray-4)] mb-1 uppercase">선택된 근무</p>
                <p className="text-[13px] font-bold">{swapData.date} ({rosterFiltered.find(f => f.id === swapData.staffId)?.name || '본인'})</p>
                <p className="text-[11px] text-[var(--success)] font-bold mt-1">현재: {workShifts.find((w: any) => w.id === swapData.currentShiftId)?.name || '휴무'}</p>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">교환 사유 (수간호사/관리자 확인용)</p>
                <textarea id="swapReason" rows={3} placeholder="예: 개인 사정으로 인한 데이-나이트 교환 희망" className="w-full px-3 py-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--success)]/20" />
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
                className="w-full py-3 bg-[var(--success)] text-white font-bold text-sm rounded-[var(--radius-lg)] hover:opacity-90 shadow-md transition-all"
              >
                교환 요청 보내기
              </button>
              <p className="text-[10px] text-center text-[var(--toss-gray-3)]">관리자 승인 후 최종 반영됩니다.</p>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

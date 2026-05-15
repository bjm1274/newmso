/**
 * 근태일정뷰.types.ts
 *
 * AttendanceScheduleView 컴포넌트의 외부 인터페이스 타입.
 * 호출자(미연결 컴포넌트 → 향후 근무관리 메인)와 본 컴포넌트가 공유.
 *
 * JM 분리 사유: props가 길어 본 컴포넌트 파일을 300줄 내로 유지하기 위해 분리.
 * 주의: 기존 호출자 호환을 위해 any/Record 타입은 그대로 보존 (점진적 좁히기는 향후 과제).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type LocalStaffMember = {
  id: string;
  name: string;
  position: string;
  department: string;
  company: string;
  shift_type?: string;
  [key: string]: unknown;
};

export type SwapData = {
  staffId: string;
  date: string;
  currentShiftId: string | null;
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
  swapData: SwapData | null;
  setSwapData: (data: SwapData | null) => void;
  handleSwapRequest: (targetDate: string, reason: string) => void;
  // 핸들러
  setAssignment: (staffId: string, workDate: string, shiftId: string | null) => void;
  handleApprove: (request: any) => void;
  handleReject: (request: any, reason: string) => void;
  handleApproveSwap: (req: any) => void;
  handleRejectSwap: (req: any, reason: string) => void;
  handleSubmitApproval: () => void;
};

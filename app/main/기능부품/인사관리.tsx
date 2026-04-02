'use client';

import { useEffect, useMemo, useState } from 'react';
import { HR_COMPANY_KEY, HR_STATUS_KEY, HR_TAB_KEY, HR_WORKSPACE_KEY } from '@/app/main/navigation-state';
import { canAccessHrSection, canAccessMainMenu, isAdminUser } from '@/lib/access-control';
import { supabase } from '@/lib/supabase';
import 구성원관리 from './인사관리서브/구성원현황';
import CertificateGenerator from './인사관리서브/증명서발급';
import PayrollMain from './인사관리서브/급여관리';
import AttendanceMain from './인사관리서브/근태기록/근태관리메인';
import LeaveManagement from './인사관리서브/휴가신청/휴가관리메인';
import SharedCalendarView from './공유캘린더';
import CalendarSync from './캘린더동기화';
import ContractMain from './인사관리서브/계약관리';
import 문서보관함 from './인사관리서브/문서보관함';
import EducationMain from './인사관리서브/교육관리';
import ShiftCalendar from './인사관리서브/시프트캘린더';
import DocumentScanner from './인사관리서브/스마트서류제출';
import OffboardingView from './인사관리서브/오프보딩';
import TaxFileGenerator from './인사관리서브/원천징수파일생성';
import InsuranceManagement from './인사관리서브/4대보험관리';
import HealthCheckupManagement from './인사관리서브/건강검진관리';
import CongratulationsCondolences from './인사관리서브/경조사관리';
import PersonnelAppointment from './인사관리서브/인사발령관리';
import RewardDisciplineManagement from './인사관리서브/포상징계관리';
import LicenseManager from './인사관리서브/면허자격증관리';
import MedicalDeviceInspection from './인사관리서브/의료기기점검';
import AnnualLeaveExpiryAlert from './인사관리서브/연차소멸알림';
import LatenessPatternAnalysis from './인사관리서브/지각조퇴분석';
import IncidentReport from './인사관리서브/사고보고서';
import WorkTypeChangeHistory from './인사관리서브/근무형태변경이력';
import EarlyLeavingDetection from './인사관리서브/조기퇴근감지';
import ContractAutoGenerator from './인사관리서브/계약서자동생성';
import InsuranceEDI from './인사관리서브/급여명세/4대보험EDI';
import AutoRosterPlanner from './근무표자동편성';


type HrWorkspaceId = '인력관리' | '근태 · 급여' | '복지 · 문서';
type StaffStatus = '재직' | '퇴사';
type HrMenuId =
  | '구성원'
  | '인사변동'
  | '입퇴사·교육센터'
  | '근태'
  | '연차/휴가'
  | '급여'
  | '경조사'
  | '자격·안전센터'
  | '계약'
  | '문서센터'
  | '캘린더';

type AttendanceAnalysisTabId =
  | '근태관리'
  | '연차소멸알림'
  | '지각조퇴분석'
  | '근무형태이력'
  | '조기퇴근감지';

type PersonnelSuiteTabId = '인사발령' | '포상/징계';
type LifecycleSuiteTabId = '교육' | '오프보딩';
type ComplianceSuiteTabId = '건강검진' | '면허/자격증' | '의료기기점검' | '사고보고서';
type DocumentCenterTabId = '문서보관함' | '증명서' | '서류제출';
type PayrollEmbeddedTabId = '기본' | '원천징수파일' | '4대보험';
type ContractEmbeddedTabId = '기본' | '계약서생성기';
type LeaveSuiteTabId = '연차/휴가 신청내역' | '공휴일 달력';

type HrTabDef = {
  id: HrMenuId;
  label: string;
  perm: string;
  icon: string;
  group: '인력관리' | '근태/급여' | '복무/복지' | '문서/기타';
};

type AttendanceAnalysisTabDef = {
  id: AttendanceAnalysisTabId;
  label: string;
  perm: string;
  icon: string;
};

const HR_WORKSPACES: { id: HrWorkspaceId; label: string; icon: string; groups: HrTabDef['group'][] }[] = [
  { id: '인력관리', label: '인력관리', icon: '👥', groups: ['인력관리'] },
  { id: '근태 · 급여', label: '근태 · 급여', icon: '💰', groups: ['근태/급여'] },
  { id: '복지 · 문서', label: '복지 · 문서', icon: '📂', groups: ['복무/복지', '문서/기타'] },
];

const HR_GROUP_LABELS: Record<HrTabDef['group'], string> = {
  인력관리: '👥 인력관리',
  '근태/급여': '💰 근태 · 급여',
  '복무/복지': '🏥 복무 · 복지',
  '문서/기타': '📂 문서 · 기타',
};

const HR_TABS: HrTabDef[] = [
  { id: '구성원', label: '구성원', perm: 'hr_구성원', icon: '👥', group: '인력관리' },
  { id: '인사변동', label: '인사변동', perm: 'hr_인사발령', icon: '🗂️', group: '인력관리' },
  { id: '입퇴사·교육센터', label: '입퇴사·교육센터', perm: 'hr_교육', icon: '🧭', group: '인력관리' },
  { id: '근태', label: '근태', perm: 'hr_근태', icon: '⏰', group: '근태/급여' },
  { id: '연차/휴가', label: '연차 / 휴가', perm: 'hr_연차휴가', icon: '🌴', group: '근태/급여' },
  { id: '급여', label: '급여', perm: 'hr_급여', icon: '💰', group: '근태/급여' },
  { id: '경조사', label: '경조사 지원', perm: 'hr_경조사', icon: '🎊', group: '복무/복지' },
  { id: '자격·안전센터', label: '자격·안전센터', perm: 'hr_건강검진', icon: '🛡️', group: '복무/복지' },
  { id: '계약', label: '계약 관리', perm: 'hr_계약', icon: '📝', group: '문서/기타' },
  { id: '문서센터', label: '문서센터', perm: 'hr_문서보관함', icon: '🗃️', group: '문서/기타' },
  { id: '캘린더', label: '캘린더', perm: 'hr_캘린더', icon: '📅', group: '문서/기타' },
];

const ATTENDANCE_ANALYSIS_TABS: AttendanceAnalysisTabDef[] = [
  { id: '근태관리', label: '근태 현황', perm: 'hr_근태', icon: '⏰' },
  { id: '연차소멸알림', label: '연차소멸알림', perm: 'hr_연차휴가', icon: '⏳' },
  { id: '지각조퇴분석', label: '지각조퇴분석', perm: 'hr_근태', icon: '📊' },
  { id: '근무형태이력', label: '근무형태이력', perm: 'hr_근무형태', icon: '🔁' },
  { id: '조기퇴근감지', label: '조기퇴근감지', perm: 'hr_근태', icon: '🚶' },
];

const PERSONNEL_SUITE_TABS = [
  { id: '인사발령', label: '인사발령', perm: 'hr_인사발령', icon: '📋' },
  { id: '포상/징계', label: '포상 · 징계', perm: 'hr_포상징계', icon: '🏅' },
] as const;

const LIFECYCLE_SUITE_TABS = [
  { id: '교육', label: '교육', perm: 'hr_교육', icon: '📚' },
  { id: '오프보딩', label: '오프보딩', perm: 'hr_오프보딩', icon: '🚪' },
] as const;

const COMPLIANCE_SUITE_TABS = [
  { id: '건강검진', label: '건강검진', perm: 'hr_건강검진', icon: '🩺' },
  { id: '면허/자격증', label: '면허 · 자격증', perm: 'hr_면허자격증', icon: '📜' },
  { id: '의료기기점검', label: '의료기기점검', perm: 'hr_의료기기점검', icon: '🔧' },
  { id: '사고보고서', label: '사고보고서', perm: 'hr_사고보고서', icon: '🚨' },
] as const;

const DOCUMENT_CENTER_TABS = [
  { id: '문서보관함', label: '문서보관함', perm: 'hr_문서보관함', icon: '📁' },
  { id: '증명서', label: '증명서 발급', perm: 'hr_증명서', icon: '📄' },
  { id: '서류제출', label: '서류 제출', perm: 'hr_서류제출', icon: '📤' },
] as const;

const PAYROLL_UTILITY_TABS = [
  { id: '기본', label: '급여 메인', icon: '💰' },
  { id: '원천징수파일', label: '원천징수파일', icon: '📊' },
  { id: '4대보험', label: '4대보험 / EDI', icon: '🏛️' },
] as const;

const CONTRACT_UTILITY_TABS = [
  { id: '기본', label: '계약 현황', icon: '📝' },
  { id: '계약서생성기', label: '계약서 자동생성', icon: '🧾' },
] as const;


const LEAVE_SUITE_MENU_MAP: Record<string, LeaveSuiteTabId> = {
  '연차/휴가': '연차/휴가 신청내역',
  공휴일달력: '공휴일 달력',
};

const REMOVED_MENU_FALLBACKS: Record<string, HrMenuId> = {
  생일기념일: '경조사',
  '생일/기념일': '경조사',
  칭찬배지: '인사변동',
  인사발령: '인사변동',
  '포상/징계': '인사변동',
  교육: '입퇴사·교육센터',
  오프보딩: '입퇴사·교육센터',
  '인력생애주기센터': '입퇴사·교육센터',
  조직도: '구성원',
  스킬매트릭스: '구성원',
  회의실예약: '구성원',
  차량배차: '구성원',
  원천징수파일: '급여',
  '4대보험': '급여',
  계약서생성기: '계약',
  연차소멸알림: '근태',
  지각조퇴분석: '근태',
  근무형태이력: '근태',
  조기퇴근감지: '근태',
  근무표자동편성: '근태',
  간호근무표: '근태',
  교대근무: '근태',
  공휴일달력: '연차/휴가',
  건강검진: '자격·안전센터',
  '면허/자격증': '자격·안전센터',
  의료기기점검: '자격·안전센터',
  사고보고서: '자격·안전센터',
  '규정준수센터': '자격·안전센터',
  문서보관함: '문서센터',
  증명서: '문서센터',
  서류제출: '문서센터',
  비품대여: '구성원',
};

const PAYROLL_UTILITY_MENU_MAP: Record<string, PayrollEmbeddedTabId> = {
  원천징수파일: '원천징수파일',
  '4대보험': '4대보험',
};

const CONTRACT_UTILITY_MENU_MAP: Record<string, ContractEmbeddedTabId> = {
  계약서생성기: '계약서생성기',
};


const ATTENDANCE_ANALYSIS_MENU_MAP: Record<string, AttendanceAnalysisTabId> = {
  연차소멸알림: '연차소멸알림',
  지각조퇴분석: '지각조퇴분석',
  근무형태이력: '근무형태이력',
  조기퇴근감지: '조기퇴근감지',
};

const PERSONNEL_SUITE_MENU_MAP: Record<string, PersonnelSuiteTabId> = {
  인사발령: '인사발령',
  '포상/징계': '포상/징계',
};

const LIFECYCLE_SUITE_MENU_MAP: Record<string, LifecycleSuiteTabId> = {
  교육: '교육',
  오프보딩: '오프보딩',
  '입퇴사·교육센터': '교육',
  '인력생애주기센터': '교육',
};

const COMPLIANCE_SUITE_MENU_MAP: Record<string, ComplianceSuiteTabId> = {
  건강검진: '건강검진',
  '면허/자격증': '면허/자격증',
  의료기기점검: '의료기기점검',
  사고보고서: '사고보고서',
  '자격·안전센터': '건강검진',
  '규정준수센터': '건강검진',
};

const DOCUMENT_CENTER_MENU_MAP: Record<string, DocumentCenterTabId> = {
  문서보관함: '문서보관함',
  증명서: '증명서',
  서류제출: '서류제출',
  문서센터: '문서보관함',
};

const LEGACY_WORKSPACE_MAP: Record<string, HrWorkspaceId> = {
  '근태 및 급여': '근태 · 급여',
  '복지 및 문서': '복지 · 문서',
};

function normalizeHrMenu(menuId?: string | null): HrMenuId {
  if (menuId && HR_TABS.some((tab) => tab.id === menuId)) {
    return menuId as HrMenuId;
  }

  if (menuId && REMOVED_MENU_FALLBACKS[menuId]) {
    return REMOVED_MENU_FALLBACKS[menuId];
  }

  return '구성원';
}

function getWorkspaceForHrMenu(menuId: HrMenuId): HrWorkspaceId {
  const tab = HR_TABS.find((item) => item.id === menuId);
  if (!tab) return '인력관리';
  if (tab.group === '인력관리') return '인력관리';
  if (tab.group === '근태/급여') return '근태 · 급여';
  return '복지 · 문서';
}

function getPayrollInitialTab(menuId?: string | null): PayrollEmbeddedTabId {
  return PAYROLL_UTILITY_MENU_MAP[menuId || ''] || '기본';
}

function getContractInitialTab(menuId?: string | null): ContractEmbeddedTabId {
  return CONTRACT_UTILITY_MENU_MAP[menuId || ''] || '기본';
}


function getLeaveSuiteInitialTab(menuId?: string | null): LeaveSuiteTabId {
  return LEAVE_SUITE_MENU_MAP[menuId || ''] || '연차/휴가 신청내역';
}

function getAttendanceInitialTab(menuId?: string | null): AttendanceAnalysisTabId {
  return ATTENDANCE_ANALYSIS_MENU_MAP[menuId || ''] || '근태관리';
}

function getPersonnelSuiteInitialTab(menuId?: string | null): PersonnelSuiteTabId {
  return PERSONNEL_SUITE_MENU_MAP[menuId || ''] || '인사발령';
}

function getLifecycleSuiteInitialTab(menuId?: string | null): LifecycleSuiteTabId {
  return LIFECYCLE_SUITE_MENU_MAP[menuId || ''] || '교육';
}

function getComplianceSuiteInitialTab(menuId?: string | null): ComplianceSuiteTabId {
  return COMPLIANCE_SUITE_MENU_MAP[menuId || ''] || '건강검진';
}

function getDocumentCenterInitialTab(menuId?: string | null): DocumentCenterTabId {
  return DOCUMENT_CENTER_MENU_MAP[menuId || ''] || '문서보관함';
}

function normalizeWorkspaceId(workspaceId?: string | null): HrWorkspaceId | null {
  if (!workspaceId) return null;
  if (HR_WORKSPACES.some((workspace) => workspace.id === workspaceId)) {
    return workspaceId as HrWorkspaceId;
  }
  return LEGACY_WORKSPACE_MAP[workspaceId] || null;
}

function getInitialHrMenuState(initialMenu?: string | null): HrMenuId {
  if (initialMenu) {
    return normalizeHrMenu(initialMenu);
  }

  if (typeof window !== 'undefined') {
    const savedTab = window.localStorage.getItem(HR_TAB_KEY);
    if (savedTab) {
      return normalizeHrMenu(savedTab);
    }
  }

  return '구성원';
}

function getInitialHrWorkspaceState(initialMenu?: string | null): HrWorkspaceId {
  const hasExplicitInitialHrMenu = typeof initialMenu === 'string' && initialMenu.trim().length > 0;

  if (!hasExplicitInitialHrMenu && typeof window !== 'undefined') {
    const savedWorkspace = normalizeWorkspaceId(window.localStorage.getItem(HR_WORKSPACE_KEY));
    if (savedWorkspace) {
      return savedWorkspace;
    }
  }

  return getWorkspaceForHrMenu(getInitialHrMenuState(initialMenu));
}

function normalizeAttendanceTabForUser(user: any, requestedTab: AttendanceAnalysisTabId): AttendanceAnalysisTabId {
  const visibleTabs = ATTENDANCE_ANALYSIS_TABS.filter((tab) => canAccessHrSection(user, tab.perm));
  if (visibleTabs.some((tab) => tab.id === requestedTab)) {
    return requestedTab;
  }
  return visibleTabs[0]?.id || '근태관리';
}

function normalizePersonnelTabForUser(user: any, requestedTab: PersonnelSuiteTabId): PersonnelSuiteTabId {
  const visibleTabs = PERSONNEL_SUITE_TABS.filter((tab) => canAccessHrSection(user, tab.perm));
  if (visibleTabs.some((tab) => tab.id === requestedTab)) {
    return requestedTab;
  }
  return visibleTabs[0]?.id || '인사발령';
}

function normalizeLifecycleTabForUser(user: any, requestedTab: LifecycleSuiteTabId): LifecycleSuiteTabId {
  const visibleTabs = LIFECYCLE_SUITE_TABS.filter((tab) => canAccessHrSection(user, tab.perm));
  if (visibleTabs.some((tab) => tab.id === requestedTab)) {
    return requestedTab;
  }
  return visibleTabs[0]?.id || '교육';
}

function normalizeComplianceTabForUser(user: any, requestedTab: ComplianceSuiteTabId): ComplianceSuiteTabId {
  const visibleTabs = COMPLIANCE_SUITE_TABS.filter((tab) => canAccessHrSection(user, tab.perm));
  if (visibleTabs.some((tab) => tab.id === requestedTab)) {
    return requestedTab;
  }
  return visibleTabs[0]?.id || '건강검진';
}

function normalizeDocumentCenterTabForUser(user: any, requestedTab: DocumentCenterTabId): DocumentCenterTabId {
  const visibleTabs = DOCUMENT_CENTER_TABS.filter((tab) => canAccessHrSection(user, tab.perm));
  if (visibleTabs.some((tab) => tab.id === requestedTab)) {
    return requestedTab;
  }
  return visibleTabs[0]?.id || '문서보관함';
}

function canAccessHrTab(user: any, tab: HrTabDef) {
  if (tab.id === '인사변동') {
    return canAccessHrSection(user, 'hr_인사발령') || canAccessHrSection(user, 'hr_포상징계');
  }
  if (tab.id === '입퇴사·교육센터') {
    return canAccessHrSection(user, 'hr_교육') || canAccessHrSection(user, 'hr_오프보딩');
  }
  if (tab.id === '연차/휴가') {
    return canAccessHrSection(user, 'hr_연차휴가') || canAccessHrSection(user, 'hr_근태');
  }
  if (tab.id === '자격·안전센터') {
    return (
      canAccessHrSection(user, 'hr_건강검진') ||
      canAccessHrSection(user, 'hr_면허자격증') ||
      canAccessHrSection(user, 'hr_의료기기점검') ||
      canAccessHrSection(user, 'hr_사고보고서')
    );
  }
  if (tab.id === '문서센터') {
    return (
      canAccessHrSection(user, 'hr_문서보관함') ||
      canAccessHrSection(user, 'hr_증명서') ||
      canAccessHrSection(user, 'hr_서류제출')
    );
  }
  return canAccessHrSection(user, tab.perm);
}

function SectionTabBar({
  tabs,
  activeTab,
  onChange,
  testIdPrefix,
}: {
  tabs: { id: string; label: string; icon: string }[];
  activeTab: string;
  onChange: (tabId: string) => void;
  testIdPrefix?: string;
}) {
  return (
    <div
      className="shrink-0 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2.5 md:px-5"
      data-testid={testIdPrefix ? `${testIdPrefix}-bar` : undefined}
    >
      <div className="no-scrollbar flex gap-1 overflow-x-auto">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${index}` : undefined}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] px-3 py-2 text-[12px] font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--tab-bg)] hover:text-[var(--foreground)]'
            }`}
          >
            <span className="shrink-0 text-[12px]">{tab.icon}</span>
            <span className="whitespace-nowrap break-keep">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface HRMainViewProps {
  user?: Record<string, unknown> | null;
  staffs?: Record<string, unknown>[];
  depts?: Record<string, unknown>[];
  onRefresh?: () => void;
  initialMenu?: string | null;
  selectedCo?: string | null;
}

export default function HRMainView({ user, staffs, depts, onRefresh, initialMenu, selectedCo: mainSelectedCo }: HRMainViewProps) {
  const [현재메뉴, 메뉴설정] = useState<HrMenuId>(() => getInitialHrMenuState(initialMenu));
  const [선택워크스페이스, 워크스페이스설정] = useState<HrWorkspaceId>(() => getInitialHrWorkspaceState(initialMenu));
  const [선택사업체, 사업체설정] = useState('전체');
  const [등록창상태, 창상태설정] = useState(false);
  const [직원상태필터, 직원상태필터설정] = useState<StaffStatus>('재직');
  const [문서연결대상, 문서연결대상설정] = useState<{ id?: string; name?: string } | undefined>(undefined);
  const [근태분석탭, 근태분석탭설정] = useState<AttendanceAnalysisTabId>(getAttendanceInitialTab(initialMenu));
  const [인사변동탭, 인사변동탭설정] = useState<PersonnelSuiteTabId>(getPersonnelSuiteInitialTab(initialMenu));
  const [입퇴사교육탭, 입퇴사교육탭설정] = useState<LifecycleSuiteTabId>(getLifecycleSuiteInitialTab(initialMenu));
  const [자격안전탭, 자격안전탭설정] = useState<ComplianceSuiteTabId>(getComplianceSuiteInitialTab(initialMenu));
  const [문서센터탭, 문서센터탭설정] = useState<DocumentCenterTabId>(getDocumentCenterInitialTab(initialMenu));
  const [급여내부탭, 급여내부탭설정] = useState<PayrollEmbeddedTabId>(getPayrollInitialTab(initialMenu));
  const [계약내부탭, 계약내부탭설정] = useState<ContractEmbeddedTabId>(getContractInitialTab(initialMenu));
  const [휴가내부탭, 휴가내부탭설정] = useState<LeaveSuiteTabId>(getLeaveSuiteInitialTab(initialMenu));
  const [전체직원목록, 전체직원목록설정] = useState<any[]>([]);

  type UserLike = Parameters<typeof canAccessMainMenu>[0];
  const userLike = user as unknown as UserLike;
  const hasAccess = canAccessMainMenu(userLike, '인사관리');
  const isMsoViewer = (user?.company as string) === 'SY INC.' || (user?.permissions as Record<string, unknown>)?.mso === true;
  const visibleHrTabs = HR_TABS.filter((tab) => canAccessHrTab(user, tab));
  const visibleHrTabIds = visibleHrTabs.map((tab) => tab.id);
  const activeMenu = visibleHrTabs.some((tab) => tab.id === 현재메뉴) ? 현재메뉴 : (visibleHrTabs[0]?.id || '구성원');
  const availableWorkspaces = HR_WORKSPACES.filter((workspace) =>
    visibleHrTabs.some((tab) => workspace.groups.includes(tab.group))
  );
  const activeWorkspace = availableWorkspaces.some((workspace) => workspace.id === 선택워크스페이스)
    ? 선택워크스페이스
    : (availableWorkspaces[0]?.id || '인력관리');
  const activeWorkspaceConfig = HR_WORKSPACES.find((workspace) => workspace.id === activeWorkspace) || HR_WORKSPACES[0];
  const workspaceTabs = visibleHrTabs.filter((tab) => activeWorkspaceConfig.groups.includes(tab.group));
  const visibleAttendanceTabs = ATTENDANCE_ANALYSIS_TABS.filter((tab) => canAccessHrSection(user, tab.perm));
  const visiblePersonnelTabs = PERSONNEL_SUITE_TABS.filter((tab) => canAccessHrSection(user, tab.perm));
  const visibleLifecycleTabs = LIFECYCLE_SUITE_TABS.filter((tab) => canAccessHrSection(user, tab.perm));
  const visibleComplianceTabs = COMPLIANCE_SUITE_TABS.filter((tab) => canAccessHrSection(user, tab.perm));
  const visibleDocumentCenterTabs = DOCUMENT_CENTER_TABS.filter((tab) => canAccessHrSection(user, tab.perm));
  const canRegisterNewStaff = isAdminUser(user) || canAccessHrSection(user, 'hr_직원등록');
  const activeAttendanceTab = normalizeAttendanceTabForUser(user, 근태분석탭);
  const activePersonnelTab = normalizePersonnelTabForUser(user, 인사변동탭);
  const activeLifecycleTab = normalizeLifecycleTabForUser(user, 입퇴사교육탭);
  const activeComplianceTab = normalizeComplianceTabForUser(user, 자격안전탭);
  const activeDocumentCenterTab = normalizeDocumentCenterTabForUser(user, 문서센터탭);
  const 인사직원목록 = useMemo(
    () => (isMsoViewer && 전체직원목록.length > 0 ? 전체직원목록 : staffs || []),
    [isMsoViewer, staffs, 전체직원목록]
  );
  const 인사부서목록 = useMemo(
    () =>
      Array.from(new Set(인사직원목록.map((staff: any) => staff?.department).filter(Boolean))) as string[],
    [인사직원목록]
  );

  const 사업체목록: string[] = [
    '전체',
    ...Array.from(new Set<string>(인사직원목록.map((staff: any) => staff?.company).filter(Boolean))),
  ];
  if (!사업체목록.includes('SY INC.')) {
    사업체목록.push('SY INC.');
  }

  useEffect(() => {
    if (!isMsoViewer) {
      전체직원목록설정([]);
      return;
    }

    let isActive = true;

    const fetchAllStaffsForHr = async () => {
      const { data, error } = await supabase
        .from('staff_members')
        .select('*')
        .order('employee_no', { ascending: true });

      if (error) {
        console.error('인사관리 전체 직원 목록 조회 실패:', error);
        return;
      }

      if (isActive) {
        전체직원목록설정(data || []);
      }
    };

    fetchAllStaffsForHr();

    return () => {
      isActive = false;
    };
  }, [isMsoViewer, staffs, user?.id]);

  useEffect(() => {
    if (사업체목록.includes(선택사업체)) return;

    const fallbackCompany =
      mainSelectedCo && 사업체목록.includes(mainSelectedCo)
        ? mainSelectedCo
        : '전체';

    사업체설정(fallbackCompany);
  }, [mainSelectedCo, 선택사업체, 사업체목록]);

  const 적용입장메뉴 = (requestedMenu?: string | null) => {
    const normalizedMenu = normalizeHrMenu(requestedMenu);
    메뉴설정(normalizedMenu);
    워크스페이스설정(getWorkspaceForHrMenu(normalizedMenu));
    근태분석탭설정(normalizeAttendanceTabForUser(user, getAttendanceInitialTab(requestedMenu)));
    인사변동탭설정(normalizePersonnelTabForUser(user, getPersonnelSuiteInitialTab(requestedMenu)));
    입퇴사교육탭설정(normalizeLifecycleTabForUser(user, getLifecycleSuiteInitialTab(requestedMenu)));
    자격안전탭설정(normalizeComplianceTabForUser(user, getComplianceSuiteInitialTab(requestedMenu)));
    문서센터탭설정(normalizeDocumentCenterTabForUser(user, getDocumentCenterInitialTab(requestedMenu)));
    급여내부탭설정(getPayrollInitialTab(requestedMenu));
    계약내부탭설정(getContractInitialTab(requestedMenu));
    휴가내부탭설정(getLeaveSuiteInitialTab(requestedMenu));
  };

  const handleWorkspaceChange = (workspaceId: HrWorkspaceId) => {
    워크스페이스설정(workspaceId);
    const workspaceConfig = HR_WORKSPACES.find((workspace) => workspace.id === workspaceId);
    if (!workspaceConfig) return;
    if (!workspaceConfig.groups.some((group) => visibleHrTabs.some((tab) => tab.id === activeMenu && tab.group === group))) {
      const nextTab = visibleHrTabs.find((tab) => workspaceConfig.groups.includes(tab.group));
      if (nextTab) {
        메뉴설정(nextTab.id);
      }
    }
  };

  const handleMenuSelect = (menuId: HrMenuId) => {
    적용입장메뉴(menuId);
  };

  useEffect(() => {
    적용입장메뉴(initialMenu);
  }, [initialMenu]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const savedTab = window.localStorage.getItem(HR_TAB_KEY);
      const savedCo = window.localStorage.getItem(HR_COMPANY_KEY);
      const savedStatus = window.localStorage.getItem(HR_STATUS_KEY) as StaffStatus | null;
      const savedWorkspace = normalizeWorkspaceId(window.localStorage.getItem(HR_WORKSPACE_KEY));

      const hasExplicitInitialHrMenu = typeof initialMenu === 'string' && initialMenu.trim().length > 0;

      if (!hasExplicitInitialHrMenu && savedTab) {
        적용입장메뉴(savedTab);
      }

      if (savedWorkspace) {
        워크스페이스설정(savedWorkspace);
      }

      if (savedCo) {
        사업체설정(savedCo);
      }

      if (savedStatus === '재직' || savedStatus === '퇴사') {
        직원상태필터설정(savedStatus);
      }
    } catch {
      // ignore
    }
  }, [initialMenu, user?.id]);

  const visibleHrTabIdsKey = visibleHrTabIds.join(',');
  useEffect(() => {
    if (!visibleHrTabIds.includes(activeMenu)) {
      메뉴설정(visibleHrTabs[0]?.id || '구성원');
    }
  }, [activeMenu, visibleHrTabIdsKey]);

  useEffect(() => {
    if (workspaceTabs.some((tab) => tab.id === activeMenu)) {
      return;
    }

    const fallbackTab = workspaceTabs[0]?.id;
    if (fallbackTab && fallbackTab !== activeMenu) {
      메뉴설정(fallbackTab);
    }
  }, [activeMenu, workspaceTabs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(HR_TAB_KEY, activeMenu);
      window.localStorage.setItem(HR_WORKSPACE_KEY, activeWorkspace);
      window.localStorage.setItem(HR_COMPANY_KEY, 선택사업체);
      window.localStorage.setItem(HR_STATUS_KEY, 직원상태필터);
    } catch {
      // ignore
    }
  }, [activeMenu, activeWorkspace, 선택사업체, 직원상태필터]);

  const 인사서류보기 = (직원: any) => {
    문서연결대상설정({ id: 직원.id, name: 직원.name });
    사업체설정(직원.company || '전체');
    메뉴설정('문서센터');
    문서센터탭설정('문서보관함');
    워크스페이스설정(getWorkspaceForHrMenu('문서센터'));
  };

  if (!hasAccess || visibleHrTabs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--muted)] p-4">
        <div className="mb-4 text-5xl">🔒</div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">인사관리 접근 권한이 없습니다.</h2>
        <p className="mt-2 text-sm font-bold text-[var(--toss-gray-4)]">
          메인 메뉴 권한과 세부 인사관리 권한을 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="app-page flex h-full min-h-0 flex-col overflow-x-hidden md:flex-row">
      {/* ── 사이드바 ── */}
      <aside className="flex h-auto w-full shrink-0 flex-col overflow-hidden border-b border-[var(--border)] bg-[var(--card)] md:sticky md:top-0 md:h-[100dvh] md:max-h-[100dvh] md:w-48 md:border-b-0 md:border-r">

        {/* 데스크탑 전용 헤더 */}
        <div className="hidden shrink-0 border-b border-[var(--border)] px-4 py-3.5 md:block">
          <p className="text-[13px] font-bold text-[var(--foreground)]">인사관리</p>
          <p className="mt-0.5 text-[10px] text-[var(--toss-gray-3)]">
            {인사직원목록.length > 0 ? `${인사직원목록.length}명 등록됨` : '직원 정보 관리'}
          </p>
        </div>

        {/* 워크스페이스 탭 */}
        <div className="shrink-0 border-b border-[var(--border)] px-2 py-2 md:px-3 md:py-2.5">
          <p className="mb-1.5 hidden px-1 text-[9px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)] md:block">
            업무 공간
          </p>
          <div className="flex gap-1 md:flex-col md:gap-1">
            {availableWorkspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                onClick={() => handleWorkspaceChange(workspace.id)}
                data-testid={`hr-workspace-${workspace.id}`}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-2 py-2 text-[11px] font-bold transition-all md:w-full md:flex-none md:justify-start md:px-3 md:py-2 ${
                  activeWorkspace === workspace.id
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <span className="shrink-0 text-[13px] md:text-sm">{workspace.icon}</span>
                <span className="truncate whitespace-nowrap break-keep text-[10px] md:text-[11px]">{workspace.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 메뉴 탭 */}
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {/* 모바일: 가로 스크롤 chip */}
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-2 py-2 md:hidden">
            {workspaceTabs.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleMenuSelect(id)}
                data-testid={`hr-menu-${id}`}
                className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
                  activeMenu === id
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                }`}
              >
                <span className="text-[10px]">{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* 데스크탑: 그룹 목록 */}
          <div className="hidden px-2 py-1 md:block">
            {activeWorkspaceConfig.groups.map((group, index) => {
              const groupTabs = workspaceTabs.filter((tab) => tab.group === group);
              if (groupTabs.length === 0) return null;

              return (
                <div key={group} className={index > 0 ? 'mt-2 border-t border-[var(--border)] pt-2' : 'pt-1'}>
                  <p className="mb-1 px-1 text-[9px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">
                    {HR_GROUP_LABELS[group]?.replace(/^[^\s]+ /, '')}
                  </p>
                  {groupTabs.map(({ id, label, icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleMenuSelect(id)}
                      data-testid={`hr-menu-${id}`}
                      className={`flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left text-[11px] font-semibold transition-all ${
                        activeMenu === id
                          ? 'bg-[var(--accent)] text-white shadow-sm'
                          : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      <span className="shrink-0 text-[12px]">{icon}</span>
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* 필터 */}
        <div className="shrink-0 border-t border-[var(--border)] px-2 py-2 md:sticky md:bottom-0 md:z-10 md:px-3">
          <div className="flex gap-1.5 md:flex-col md:gap-2">
            <select
              data-testid="hr-company-select"
              value={선택사업체}
              onChange={(event) => 사업체설정(event.target.value)}
              className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--tab-bg)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] outline-none"
            >
              {사업체목록.map((회사명) => (
                <option key={회사명} value={회사명}>
                  {회사명}
                </option>
              ))}
            </select>
            <select
              data-testid="hr-status-select"
              value={직원상태필터}
              onChange={(event) => 직원상태필터설정(event.target.value as StaffStatus)}
              className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--tab-bg)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] outline-none"
            >
              <option value="재직">재직자</option>
              <option value="퇴사">퇴사자</option>
            </select>
          </div>
        </div>

      </aside>

      {/* ── 메인 콘텐츠 ── */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <section className="custom-scrollbar flex-1 overflow-y-auto bg-[var(--page-bg)] p-3 md:p-0">
          {activeMenu === '구성원' && (
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <구성원관리
                  직원목록={인사직원목록 as import('@/types').StaffMember[]}
                  부서목록={인사부서목록}
                  선택사업체={선택사업체}
                  보기상태={직원상태필터}
                  canRegisterNewStaff={canRegisterNewStaff}
                  onOpenDocumentRepoForStaff={인사서류보기}
                  새로고침={onRefresh}
                  창상태={등록창상태 ? '열기' : undefined}
                  창닫기={() => 창상태설정(false)}
                  onOpenNewStaff={() => canRegisterNewStaff && 창상태설정(true)}
                />
              </div>
            </div>
          )}

          {activeMenu === '인사변동' && (
            <div className="flex h-full flex-col">
              <SectionTabBar
                tabs={visiblePersonnelTabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon }))}
                activeTab={activePersonnelTab}
                onChange={(tabId) => 인사변동탭설정(tabId as PersonnelSuiteTabId)}
                testIdPrefix="personnel-suite"
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                {activePersonnelTab === '인사발령' && (
                  <PersonnelAppointment staffs={인사직원목록} selectedCo={선택사업체} user={user} />
                )}
                {activePersonnelTab === '포상/징계' && (
                  <RewardDisciplineManagement staffs={인사직원목록} selectedCo={선택사업체} user={user} />
                )}
              </div>
            </div>
          )}

          {activeMenu === '입퇴사·교육센터' && (
            <div className="flex h-full flex-col">
              <SectionTabBar
                tabs={visibleLifecycleTabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon }))}
                activeTab={activeLifecycleTab}
                onChange={(tabId) => 입퇴사교육탭설정(tabId as LifecycleSuiteTabId)}
                testIdPrefix="lifecycle-suite"
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                {activeLifecycleTab === '교육' && (
                  <div className="p-3 md:p-4">
                    <EducationMain staffs={인사직원목록} selectedCo={선택사업체} />
                  </div>
                )}
                {activeLifecycleTab === '오프보딩' && (
                  <div className="p-3 md:p-4">
                    <OffboardingView staffs={인사직원목록} selectedCo={선택사업체} onRefresh={onRefresh} />
                  </div>
                )}
              </div>
            </div>
          )}

          {activeMenu === '근태' && (
            <div className="flex h-full flex-col">
              <SectionTabBar
                tabs={visibleAttendanceTabs}
                activeTab={activeAttendanceTab}
                onChange={(tabId) => 근태분석탭설정(tabId as AttendanceAnalysisTabId)}
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                {activeAttendanceTab === '근태관리' && <AttendanceMain staffs={인사직원목록} selectedCo={선택사업체} user={user} />}
                {activeAttendanceTab === '연차소멸알림' && (
                  <AnnualLeaveExpiryAlert staffs={인사직원목록} selectedCo={선택사업체} user={user} />
                )}
                {activeAttendanceTab === '지각조퇴분석' && (
                  <LatenessPatternAnalysis staffs={인사직원목록} selectedCo={선택사업체} user={user} />
                )}
                {activeAttendanceTab === '근무형태이력' && (
                  <WorkTypeChangeHistory staffs={인사직원목록} selectedCo={선택사업체} user={user} />
                )}
                {activeAttendanceTab === '조기퇴근감지' && (
                  <EarlyLeavingDetection staffs={인사직원목록} selectedCo={선택사업체} user={user} />
                )}
              </div>
            </div>
          )}


          {activeMenu === '연차/휴가' && (
            <div className="flex h-full flex-col overflow-hidden">
              <LeaveManagement
                staffs={인사직원목록}
                selectedCo={선택사업체}
                onRefresh={onRefresh}
                user={user}
                initialTab={휴가내부탭}
                allowLeaveTabs={canAccessHrSection(user, 'hr_연차휴가')}
                allowHolidayTab={canAccessHrSection(user, 'hr_근태')}
                tabMode="operational"
              />
            </div>
          )}
          {activeMenu === '급여' && (
            <div className="flex h-full flex-col">
              <SectionTabBar
                tabs={[...PAYROLL_UTILITY_TABS]}
                activeTab={급여내부탭}
                onChange={(tabId) => 급여내부탭설정(tabId as PayrollEmbeddedTabId)}
                testIdPrefix="payroll-utility"
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                {급여내부탭 === '기본' && <PayrollMain staffs={인사직원목록} selectedCo={선택사업체} onRefresh={onRefresh} showAdminPolicyTabs={false} />}
                {급여내부탭 === '원천징수파일' && (
                    <div className="p-3 md:p-4">
                    <TaxFileGenerator staffs={인사직원목록} selectedCo={선택사업체} />
                  </div>
                )}
                {급여내부탭 === '4대보험' && (
                  <div className="grid gap-4 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:p-4">
                    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                      <InsuranceManagement staffs={인사직원목록} selectedCo={선택사업체} />
                    </div>
                    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                      <InsuranceEDI staffs={인사직원목록} selectedCo={선택사업체} user={user} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {activeMenu === '경조사' && <CongratulationsCondolences staffs={인사직원목록} selectedCo={선택사업체} />}
          {activeMenu === '자격·안전센터' && (
            <div className="flex h-full flex-col">
              <SectionTabBar
                tabs={visibleComplianceTabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon }))}
                activeTab={activeComplianceTab}
                onChange={(tabId) => 자격안전탭설정(tabId as ComplianceSuiteTabId)}
                testIdPrefix="compliance-suite"
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                {activeComplianceTab === '건강검진' && <HealthCheckupManagement staffs={인사직원목록} selectedCo={선택사업체} />}
                {activeComplianceTab === '면허/자격증' && <LicenseManager staffs={인사직원목록} selectedCo={선택사업체} user={user} />}
                {activeComplianceTab === '의료기기점검' && <MedicalDeviceInspection selectedCo={선택사업체} user={user} />}
                {activeComplianceTab === '사고보고서' && <IncidentReport staffs={인사직원목록} selectedCo={선택사업체} user={user} />}
              </div>
            </div>
          )}

          {activeMenu === '계약' && (
            <div className="flex h-full flex-col">
              <SectionTabBar
                tabs={[...CONTRACT_UTILITY_TABS]}
                activeTab={계약내부탭}
                onChange={(tabId) => 계약내부탭설정(tabId as ContractEmbeddedTabId)}
                testIdPrefix="contract-utility"
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                {계약내부탭 === '기본' && (
                  <ContractMain staffs={인사직원목록} selectedCo={선택사업체} onRefresh={onRefresh} showAdminPolicyTabs={false} showTemplateEditor={false} />
                )}
                {계약내부탭 === '계약서생성기' && (
                    <div className="p-3 md:p-4">
                    <ContractAutoGenerator staffs={인사직원목록} selectedCo={선택사업체} user={user} />
                  </div>
                )}
              </div>
            </div>
          )}

          {activeMenu === '문서센터' && (
            <div className="flex h-full flex-col">
              <SectionTabBar
                tabs={visibleDocumentCenterTabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon }))}
                activeTab={activeDocumentCenterTab}
                onChange={(tabId) => 문서센터탭설정(tabId as DocumentCenterTabId)}
                testIdPrefix="document-center"
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                {activeDocumentCenterTab === '문서보관함' && (
                  <문서보관함 user={user} selectedCo={선택사업체} linkedTarget={문서연결대상} canManageDocuments={false} />
                )}
                {activeDocumentCenterTab === '증명서' && (
                  <div className="p-3 md:p-4">
                    <CertificateGenerator staffs={인사직원목록} selectedCo={선택사업체} />
                  </div>
                )}
                {activeDocumentCenterTab === '서류제출' && (
                  <div className="p-3 md:p-4">
                    <DocumentScanner user={user ?? undefined} staffs={인사직원목록} selectedCo={선택사업체 ?? undefined} />
                  </div>
                )}
              </div>
            </div>
          )}

          {activeMenu === '캘린더' && (
            <div className="flex flex-col gap-4 p-3 md:flex-row md:p-4">
              <div className="flex-1">
                <SharedCalendarView user={user} />
              </div>
              <div className="shrink-0 md:w-80">
                <CalendarSync />
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

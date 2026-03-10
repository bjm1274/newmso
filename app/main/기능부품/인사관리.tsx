'use client';

import { useEffect, useState } from 'react';
import { canAccessHrSection, canAccessMainMenu } from '@/lib/access-control';
import 구성원관리 from './인사관리서브/구성원현황';
import CertificateGenerator from './인사관리서브/증명서발급';
import PayrollMain from './인사관리서브/급여관리';
import AttendanceMain from './인사관리서브/근태기록/근태관리메인';
import LeaveManagement from './인사관리서브/휴가신청/휴가관리메인';
import SharedCalendarView from './공유캘린더';
import CalendarSync from './캘린더동기화';
import AssetLoanManager from './인사관리서브/비품장비대여관리';
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
import OrgChartEditor from './인사관리서브/조직도편집기';
import SkillMatrix from './인사관리서브/스킬매트릭스';
import NurseSchedule from './인사관리서브/간호근무표';
import LicenseManager from './인사관리서브/면허자격증관리';
import MedicalDeviceInspection from './인사관리서브/의료기기점검';
import AnnualLeaveExpiryAlert from './인사관리서브/연차소멸알림';
import HolidayCalendar from './인사관리서브/공휴일달력';
import LatenessPatternAnalysis from './인사관리서브/지각조퇴분석';
import IncidentReport from './인사관리서브/사고보고서';
import WorkTypeChangeHistory from './인사관리서브/근무형태변경이력';
import EarlyLeavingDetection from './인사관리서브/조기퇴근감지';
import ContractAutoGenerator from './인사관리서브/계약서자동생성';
import InsuranceEDI from './인사관리서브/급여명세/4대보험EDI';
import AutoRosterPlanner from './근무표자동편성';

const HR_TAB_KEY = 'erp_hr_tab';
const HR_COMPANY_KEY = 'erp_hr_company';
const HR_STATUS_KEY = 'erp_hr_status';
const HR_WORKSPACE_KEY = 'erp_hr_workspace';

type HrWorkspaceId = '인력관리' | '근태 · 급여' | '복지 · 문서';
type StaffStatus = '재직' | '퇴사';
type HrMenuId =
  | '구성원'
  | '인사발령'
  | '포상/징계'
  | '교육'
  | '조직도'
  | '스킬매트릭스'
  | '오프보딩'
  | '근태'
  | '교대근무'
  | '근무표자동편성'
  | '연차/휴가'
  | '급여'
  | '간호근무표'
  | '공휴일달력'
  | '건강검진'
  | '경조사'
  | '면허/자격증'
  | '의료기기점검'
  | '비품대여'
  | '사고보고서'
  | '계약'
  | '문서보관함'
  | '증명서'
  | '서류제출'
  | '캘린더';

type AttendanceAnalysisTabId =
  | '근태관리'
  | '연차소멸알림'
  | '지각조퇴분석'
  | '근무형태이력'
  | '조기퇴근감지';

type PayrollEmbeddedTabId = '기본' | '원천징수파일' | '4대보험';
type ContractEmbeddedTabId = '기본' | '계약서생성기';

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
  { id: '인사발령', label: '인사발령', perm: 'hr_구성원', icon: '📋', group: '인력관리' },
  { id: '포상/징계', label: '포상 / 징계', perm: 'hr_구성원', icon: '🏅', group: '인력관리' },
  { id: '교육', label: '교육', perm: 'hr_구성원', icon: '📚', group: '인력관리' },
  { id: '조직도', label: '조직도 편집', perm: 'hr_구성원', icon: '🌳', group: '인력관리' },
  { id: '스킬매트릭스', label: '스킬매트릭스', perm: 'hr_구성원', icon: '📊', group: '인력관리' },
  { id: '오프보딩', label: '오프보딩', perm: 'hr_구성원', icon: '🚪', group: '인력관리' },
  { id: '근태', label: '근태', perm: 'hr_근태', icon: '⏰', group: '근태/급여' },
  { id: '교대근무', label: '교대근무', perm: 'hr_교대근무', icon: '🔄', group: '근태/급여' },
  { id: '근무표자동편성', label: '근무표 자동편성', perm: 'hr_교대근무', icon: '🧩', group: '근태/급여' },
  { id: '연차/휴가', label: '연차 / 휴가', perm: 'hr_연차휴가', icon: '🌴', group: '근태/급여' },
  { id: '급여', label: '급여', perm: 'hr_급여', icon: '💰', group: '근태/급여' },
  { id: '간호근무표', label: '간호근무표', perm: 'hr_교대근무', icon: '🏥', group: '근태/급여' },
  { id: '공휴일달력', label: '공휴일달력', perm: 'hr_근태', icon: '📅', group: '근태/급여' },
  { id: '건강검진', label: '건강검진', perm: 'hr_구성원', icon: '🩺', group: '복무/복지' },
  { id: '경조사', label: '경조사 지원', perm: 'hr_구성원', icon: '🎊', group: '복무/복지' },
  { id: '면허/자격증', label: '면허 / 자격증', perm: 'hr_구성원', icon: '📜', group: '복무/복지' },
  { id: '의료기기점검', label: '의료기기점검', perm: 'hr_구성원', icon: '🔧', group: '복무/복지' },
  { id: '비품대여', label: '비품대여', perm: 'hr_비품대여', icon: '📦', group: '복무/복지' },
  { id: '사고보고서', label: '사고보고서', perm: 'hr_구성원', icon: '🚨', group: '복무/복지' },
  { id: '계약', label: '계약 관리', perm: 'hr_계약', icon: '📝', group: '문서/기타' },
  { id: '문서보관함', label: '문서보관함', perm: 'hr_문서보관함', icon: '📁', group: '문서/기타' },
  { id: '증명서', label: '증명서 발급', perm: 'hr_증명서', icon: '📄', group: '문서/기타' },
  { id: '서류제출', label: '서류 제출 관리', perm: 'hr_구성원', icon: '📤', group: '문서/기타' },
  { id: '캘린더', label: '캘린더', perm: 'hr_캘린더', icon: '📅', group: '문서/기타' },
];

const ATTENDANCE_ANALYSIS_TABS: AttendanceAnalysisTabDef[] = [
  { id: '근태관리', label: '근태 현황', perm: 'hr_근태', icon: '⏰' },
  { id: '연차소멸알림', label: '연차소멸알림', perm: 'hr_연차휴가', icon: '⏳' },
  { id: '지각조퇴분석', label: '지각조퇴분석', perm: 'hr_근태', icon: '📊' },
  { id: '근무형태이력', label: '근무형태이력', perm: 'hr_근무형태', icon: '🔁' },
  { id: '조기퇴근감지', label: '조기퇴근감지', perm: 'hr_근태', icon: '🚶' },
];

const PAYROLL_UTILITY_TABS = [
  { id: '기본', label: '급여 메인', icon: '💰' },
  { id: '원천징수파일', label: '원천징수파일', icon: '📊' },
  { id: '4대보험', label: '4대보험 / EDI', icon: '🏛️' },
] as const;

const CONTRACT_UTILITY_TABS = [
  { id: '기본', label: '계약 현황', icon: '📝' },
  { id: '계약서생성기', label: '계약서 자동생성', icon: '🧾' },
] as const;

const REMOVED_MENU_FALLBACKS: Record<string, HrMenuId> = {
  생일기념일: '경조사',
  '생일/기념일': '경조사',
  칭찬배지: '포상/징계',
  회의실예약: '구성원',
  차량배차: '구성원',
  원천징수파일: '급여',
  '4대보험': '급여',
  계약서생성기: '계약',
  연차소멸알림: '근태',
  지각조퇴분석: '근태',
  근무형태이력: '근태',
  조기퇴근감지: '근태',
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

function getAttendanceInitialTab(menuId?: string | null): AttendanceAnalysisTabId {
  return ATTENDANCE_ANALYSIS_MENU_MAP[menuId || ''] || '근태관리';
}

function normalizeAttendanceTabForUser(user: any, requestedTab: AttendanceAnalysisTabId): AttendanceAnalysisTabId {
  const visibleTabs = ATTENDANCE_ANALYSIS_TABS.filter((tab) => canAccessHrSection(user, tab.perm));
  if (visibleTabs.some((tab) => tab.id === requestedTab)) {
    return requestedTab;
  }
  return visibleTabs[0]?.id || '근태관리';
}

function SectionTabBar({
  title,
  description,
  tabs,
  activeTab,
  onChange,
  testIdPrefix,
}: {
  title: string;
  description: string;
  tabs: { id: string; label: string; icon: string }[];
  activeTab: string;
  onChange: (tabId: string) => void;
  testIdPrefix?: string;
}) {
  return (
    <div
      className="border-b border-[var(--toss-border)] bg-[var(--toss-card)] px-4 py-4 md:px-6"
      data-testid={testIdPrefix ? `${testIdPrefix}-bar` : undefined}
    >
      <div className="mb-3">
        <h3 className="text-sm font-bold text-[var(--foreground)]">{title}</h3>
        <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{description}</p>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${index}` : undefined}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-[var(--toss-blue)] text-white shadow-md'
                : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] hover:bg-[var(--toss-blue-light)] hover:text-[var(--foreground)]'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function HRMainView({ user, staffs, depts, onRefresh, initialMenu }: any) {
  const [현재메뉴, 메뉴설정] = useState<HrMenuId>(normalizeHrMenu(initialMenu));
  const [선택워크스페이스, 워크스페이스설정] = useState<HrWorkspaceId>(
    getWorkspaceForHrMenu(normalizeHrMenu(initialMenu))
  );
  const [선택사업체, 사업체설정] = useState('전체');
  const [등록창상태, 창상태설정] = useState(false);
  const [직원상태필터, 직원상태필터설정] = useState<StaffStatus>('재직');
  const [문서연결대상, 문서연결대상설정] = useState<{ id?: string; name?: string } | undefined>(undefined);
  const [근태분석탭, 근태분석탭설정] = useState<AttendanceAnalysisTabId>(getAttendanceInitialTab(initialMenu));
  const [급여내부탭, 급여내부탭설정] = useState<PayrollEmbeddedTabId>(getPayrollInitialTab(initialMenu));
  const [계약내부탭, 계약내부탭설정] = useState<ContractEmbeddedTabId>(getContractInitialTab(initialMenu));

  const hasAccess = canAccessMainMenu(user, '인사관리');
  const visibleHrTabs = HR_TABS.filter((tab) => canAccessHrSection(user, tab.perm));
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
  const activeAttendanceTab = normalizeAttendanceTabForUser(user, 근태분석탭);

  const 사업체목록: string[] = [
    '전체',
    ...Array.from(new Set<string>((staffs || []).map((staff: any) => staff?.company).filter(Boolean))),
  ];
  if (!사업체목록.includes('SY INC.')) {
    사업체목록.push('SY INC.');
  }

  const 적용입장메뉴 = (requestedMenu?: string | null) => {
    const normalizedMenu = normalizeHrMenu(requestedMenu);
    메뉴설정(normalizedMenu);
    워크스페이스설정(getWorkspaceForHrMenu(normalizedMenu));
    근태분석탭설정(normalizeAttendanceTabForUser(user, getAttendanceInitialTab(requestedMenu)));
    급여내부탭설정(getPayrollInitialTab(requestedMenu));
    계약내부탭설정(getContractInitialTab(requestedMenu));
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
    메뉴설정(menuId);
    워크스페이스설정(getWorkspaceForHrMenu(menuId));
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
      const savedWorkspace = window.localStorage.getItem(HR_WORKSPACE_KEY) as HrWorkspaceId | null;

      if (!initialMenu && savedTab) {
        적용입장메뉴(savedTab);
      }

      if (savedWorkspace && HR_WORKSPACES.some((workspace) => workspace.id === savedWorkspace)) {
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

  useEffect(() => {
    if (!visibleHrTabIds.includes(activeMenu)) {
      메뉴설정(visibleHrTabs[0]?.id || '구성원');
    }
  }, [activeMenu, visibleHrTabs]);

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
    메뉴설정('문서보관함');
    워크스페이스설정(getWorkspaceForHrMenu('문서보관함'));
  };

  if (!hasAccess) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--toss-gray-1)] p-6">
        <div className="mb-4 text-5xl">🔒</div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">인사관리 접근 권한이 없습니다.</h2>
        <p className="mt-2 text-sm font-bold text-[var(--toss-gray-4)]">
          MSO 직원이거나 인사 조회 권한이 부여된 직원만 이용할 수 있습니다. 관리자에게 문의해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="app-page flex h-full min-h-0 flex-row overflow-hidden">
      <aside className="flex h-auto w-full shrink-0 flex-col overflow-hidden border-b border-[var(--toss-border)] bg-[var(--toss-card)] md:h-full md:w-56 md:border-b-0 md:border-r">
        <div className="shrink-0 border-b border-[var(--toss-border)] p-2 md:p-3">
          <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">업무 공간</p>
          <div className="no-scrollbar flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {availableWorkspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                onClick={() => handleWorkspaceChange(workspace.id)}
                data-testid={`hr-workspace-${workspace.id}`}
                className={`flex min-w-[110px] items-center justify-center gap-2 rounded-[12px] px-3 py-2 text-[11px] font-bold transition-all md:w-full md:justify-start ${
                  activeWorkspace === workspace.id
                    ? 'bg-[var(--foreground)] text-white shadow-md'
                    : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] hover:bg-[var(--toss-blue-light)] hover:text-[var(--foreground)]'
                }`}
              >
                <span className="text-[13px]">{workspace.icon}</span>
                <span>{workspace.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="no-scrollbar flex min-h-0 flex-row gap-1 overflow-x-auto p-2 md:flex-1 md:flex-col md:overflow-y-auto md:p-3">
          <div className="flex gap-1 md:hidden">
            {workspaceTabs.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleMenuSelect(id)}
                data-testid={`hr-menu-${id}`}
                className={`flex-none whitespace-nowrap rounded-[10px] px-3 py-2 text-[11px] font-bold transition-all ${
                  activeMenu === id
                    ? 'bg-[var(--toss-blue)] text-white shadow-md'
                    : 'text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)] hover:text-[var(--foreground)]'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex md:flex-col gap-0.5">
            {activeWorkspaceConfig.groups.map((group, index) => {
              const groupTabs = workspaceTabs.filter((tab) => tab.group === group);
              if (groupTabs.length === 0) return null;

              return (
                <div key={group} className={index > 0 ? 'mt-2 border-t border-[var(--toss-border)] pt-2' : ''}>
                  <p className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">
                    {HR_GROUP_LABELS[group]}
                  </p>
                  {groupTabs.map(({ id, label, icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleMenuSelect(id)}
                      data-testid={`hr-menu-${id}`}
                      className={`flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[11px] font-bold transition-all ${
                        activeMenu === id
                          ? 'bg-[var(--toss-blue)] text-white shadow-md'
                          : 'text-[var(--toss-gray-4)] hover:bg-[var(--toss-gray-1)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      <span className="shrink-0 text-[13px]">{icon}</span>
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--toss-border)] p-2 md:grid-cols-1 md:gap-3 md:p-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-[var(--toss-gray-4)] md:text-[11px]">사업체</label>
            <select
              data-testid="hr-company-select"
              value={선택사업체}
              onChange={(event) => 사업체설정(event.target.value)}
              className="w-full rounded-[12px] border border-[var(--toss-border)] bg-emerald-50 px-2 py-2 text-[11px] font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-emerald-950/20 md:px-3 md:py-2.5"
            >
              {사업체목록.map((회사명) => (
                <option key={회사명} value={회사명}>
                  {회사명}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-[var(--toss-gray-4)] md:text-[11px]">직원 상태</label>
            <select
              data-testid="hr-status-select"
              value={직원상태필터}
              onChange={(event) => 직원상태필터설정(event.target.value as StaffStatus)}
              className="w-full rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-blue-light)]/30 px-2 py-2 text-[11px] font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 md:px-3 md:py-2.5"
            >
              <option value="재직">재직자</option>
              <option value="퇴사">퇴사자</option>
            </select>
          </div>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <section className="custom-scrollbar flex-1 overflow-y-auto bg-[var(--page-bg)] p-4 md:p-0">
          {activeMenu === '구성원' && (
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <구성원관리
                  직원목록={staffs}
                  부서목록={depts}
                  선택사업체={선택사업체}
                  보기상태={직원상태필터}
                  on문서보기={인사서류보기}
                  새로고침={onRefresh}
                  창상태={등록창상태}
                  창닫기={() => 창상태설정(false)}
                  onOpenNewStaff={() => 창상태설정(true)}
                />
              </div>
            </div>
          )}

          {activeMenu === '인사발령' && <PersonnelAppointment staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '포상/징계' && <RewardDisciplineManagement staffs={staffs} selectedCo={선택사업체} user={user} />}

          {activeMenu === '교육' && (
            <div className="p-4 md:p-10">
              <EducationMain staffs={staffs} selectedCo={선택사업체} />
            </div>
          )}

          {activeMenu === '조직도' && <OrgChartEditor staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '스킬매트릭스' && <SkillMatrix staffs={staffs} selectedCo={선택사업체} user={user} />}

          {activeMenu === '오프보딩' && (
            <div className="p-4 md:p-10">
              <OffboardingView staffs={staffs} selectedCo={선택사업체} onRefresh={onRefresh} />
            </div>
          )}

          {activeMenu === '근태' && (
            <div className="flex h-full flex-col">
              <SectionTabBar
                title="근태 분석"
                description="근태 현황과 연차, 지각/조퇴, 근무형태 변경 이력을 한곳에서 확인합니다."
                tabs={visibleAttendanceTabs}
                activeTab={activeAttendanceTab}
                onChange={(tabId) => 근태분석탭설정(tabId as AttendanceAnalysisTabId)}
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                {activeAttendanceTab === '근태관리' && <AttendanceMain staffs={staffs} selectedCo={선택사업체} />}
                {activeAttendanceTab === '연차소멸알림' && (
                  <AnnualLeaveExpiryAlert staffs={staffs} selectedCo={선택사업체} user={user} />
                )}
                {activeAttendanceTab === '지각조퇴분석' && (
                  <LatenessPatternAnalysis staffs={staffs} selectedCo={선택사업체} user={user} />
                )}
                {activeAttendanceTab === '근무형태이력' && (
                  <WorkTypeChangeHistory staffs={staffs} selectedCo={선택사업체} user={user} />
                )}
                {activeAttendanceTab === '조기퇴근감지' && (
                  <EarlyLeavingDetection staffs={staffs} selectedCo={선택사업체} user={user} />
                )}
              </div>
            </div>
          )}

          {activeMenu === '교대근무' && <ShiftCalendar staffs={staffs} selectedCo={선택사업체} />}
          {activeMenu === '근무표자동편성' && <AutoRosterPlanner user={user} staffs={staffs} />}
          {activeMenu === '연차/휴가' && <LeaveManagement staffs={staffs} selectedCo={선택사업체} />}
          {activeMenu === '급여' && (
            <div className="flex h-full flex-col">
              <SectionTabBar
                title="급여관리"
                description="급여 정산 화면과 세무/보험 유틸을 한 곳에서 관리합니다."
                tabs={[...PAYROLL_UTILITY_TABS]}
                activeTab={급여내부탭}
                onChange={(tabId) => 급여내부탭설정(tabId as PayrollEmbeddedTabId)}
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                {급여내부탭 === '기본' && <PayrollMain staffs={staffs} selectedCo={선택사업체} onRefresh={onRefresh} />}
                {급여내부탭 === '원천징수파일' && (
                  <div className="p-4 md:p-10">
                    <TaxFileGenerator staffs={staffs} selectedCo={선택사업체} />
                  </div>
                )}
                {급여내부탭 === '4대보험' && (
                  <div className="grid gap-6 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:p-10">
                    <div className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-4 shadow-sm">
                      <InsuranceManagement staffs={staffs} selectedCo={선택사업체} />
                    </div>
                    <div className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-4 shadow-sm">
                      <InsuranceEDI staffs={staffs} selectedCo={선택사업체} user={user} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {activeMenu === '간호근무표' && <NurseSchedule staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '공휴일달력' && <HolidayCalendar staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '건강검진' && <HealthCheckupManagement staffs={staffs} selectedCo={선택사업체} />}
          {activeMenu === '경조사' && <CongratulationsCondolences staffs={staffs} selectedCo={선택사업체} />}
          {activeMenu === '면허/자격증' && <LicenseManager staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '의료기기점검' && <MedicalDeviceInspection selectedCo={선택사업체} user={user} />}

          {activeMenu === '비품대여' && (
            <div className="p-4 md:p-10">
              <AssetLoanManager staffs={staffs} selectedCo={선택사업체} />
            </div>
          )}

          {activeMenu === '사고보고서' && <IncidentReport staffs={staffs} selectedCo={선택사업체} user={user} />}

          {activeMenu === '계약' && (
            <div className="flex h-full flex-col">
              <SectionTabBar
                title="계약관리"
                description="전자 계약 현황과 계약서 자동생성을 하나의 워크스페이스에서 처리합니다."
                tabs={[...CONTRACT_UTILITY_TABS]}
                activeTab={계약내부탭}
                onChange={(tabId) => 계약내부탭설정(tabId as ContractEmbeddedTabId)}
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                {계약내부탭 === '기본' && (
                  <ContractMain staffs={staffs} selectedCo={선택사업체} onRefresh={onRefresh} />
                )}
                {계약내부탭 === '계약서생성기' && (
                  <div className="p-4 md:p-8">
                    <ContractAutoGenerator staffs={staffs} selectedCo={선택사업체} user={user} />
                  </div>
                )}
              </div>
            </div>
          )}

          {activeMenu === '문서보관함' && (
            <문서보관함 user={user} selectedCo={선택사업체} linkedTarget={문서연결대상} />
          )}

          {activeMenu === '증명서' && (
            <div className="p-4 md:p-10">
              <CertificateGenerator staffs={staffs} selectedCo={선택사업체} />
            </div>
          )}

          {activeMenu === '서류제출' && (
            <div className="p-4 md:p-10">
              <DocumentScanner user={user} staffs={staffs} selectedCo={선택사업체} />
            </div>
          )}

          {activeMenu === '캘린더' && (
            <div className="flex flex-col gap-8 p-4 md:flex-row md:p-10">
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

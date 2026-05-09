'use client';

export type AdminAnalysisTabId =
  | '경영대시보드'
  | '재무대시보드'
  | '예산관리'
  | '통합보고서'
  | '법인손익'
  | '커스텀대시보드';

export type AdminOperationsTabId = '알림자동화' | '수술검사템플릿' | '팝업관리';

export type AdminAuditTabId = '감사로그' | '접근감사로그' | '급여이상치';

export type AdminOuterTabId =
  | '경영분석'
  | '운영설정'
  | '감사센터'
  | '시스템마스터센터'
  | '회사관리'
  | '직원권한'
  | '데이터백업'
  | '데이터초기화'
  | '문서양식';

export type AdminSidebarItem = {
  id: string;
  label: string;
  group: string;
  icon: string;
  hidden?: boolean;
};

export type AdminInnerTab = {
  id: string;
  label: string;
  icon: string;
};

export type AdminEntryState = {
  activeTab: AdminOuterTabId;
  analysisTab: AdminAnalysisTabId;
  operationsTab: AdminOperationsTabId;
  auditTab: AdminAuditTabId;
};

export const ADMIN_ANALYSIS_TABS: { id: AdminAnalysisTabId; label: string; icon: string }[] = [
  { id: '경영대시보드', label: '경영대시보드', icon: 'analytics' },
  { id: '재무대시보드', label: '재무대시보드', icon: 'purchase' },
  { id: '예산관리', label: '예산관리', icon: 'calculator' },
  { id: '통합보고서', label: '통합보고서', icon: 'document' },
  { id: '법인손익', label: '법인손익', icon: 'analytics' },
  { id: '커스텀대시보드', label: '커스텀 대시보드', icon: 'settings' },
];

export const ADMIN_OPERATIONS_TABS: { id: AdminOperationsTabId; label: string; icon: string }[] = [
  { id: '알림자동화', label: '알림 자동화', icon: 'bell' },
  { id: '수술검사템플릿', label: '수술 / 검사 템플릿', icon: 'scan' },
  { id: '팝업관리', label: '팝업 관리', icon: 'document' },
];

export const ADMIN_AUDIT_TABS: { id: AdminAuditTabId; label: string; icon: string }[] = [
  { id: '접근감사로그', label: '접근감사로그', icon: 'admin' },
  { id: '감사로그', label: '감사로그', icon: 'document' },
  { id: '급여이상치', label: '급여 이상치', icon: 'alert' },
];

export const ADMIN_SIDEBAR_ITEMS: AdminSidebarItem[] = [
  { id: '경영분석', label: '경영 분석', group: '경영 분석', icon: 'analytics' },
  { id: '회사관리', label: '회사 / 조직', group: '조직 / 권한', icon: 'server' },
  { id: '직원권한', label: '직원 권한', group: '조직 / 권한', icon: 'admin' },
  { id: '운영설정', label: '운영 설정', group: '시스템 설정', icon: 'settings' },
  { id: '문서양식', label: '결재 양식 관리', group: '시스템 설정', icon: 'document' },
  { id: '데이터백업', label: '백업 / 복원', group: '데이터 관리', icon: 'save' },
  { id: '데이터초기화', label: '데이터 초기화', group: '데이터 관리', icon: 'refresh' },
  { id: '감사센터', label: '감사 센터', group: '감사 센터', icon: 'search' },
  { id: '시스템마스터센터', label: '시스템마스터센터', group: '시스템 마스터', icon: 'admin' },
  { id: '알림자동화', label: '알림 자동화', group: '시스템 설정', icon: 'bell', hidden: true },
  { id: '수술검사템플릿', label: '수술 / 검사 템플릿', group: '시스템 설정', icon: 'scan', hidden: true },
  { id: '팝업관리', label: '팝업 관리', group: '시스템 설정', icon: 'document', hidden: true },
  { id: '급여이상치', label: '급여 이상치 감지', group: '감사 센터', icon: 'alert', hidden: true },
];

export const ADMIN_OUTER_TABS: AdminOuterTabId[] = ADMIN_SIDEBAR_ITEMS.filter((item) => !item.hidden).map(
  (item) => item.id as AdminOuterTabId,
);

export const ADMIN_TAB_ALIASES: Record<string, AdminOuterTabId> = {
  양식빌더: '문서양식',
  문서서식: '문서양식',
  연차수동부여: '시스템마스터센터',
};

export const ADMIN_PARENT_SUBVIEW_MAP: Record<string, AdminOuterTabId> = {
  ...Object.fromEntries(ADMIN_ANALYSIS_TABS.map((tab) => [tab.id, '경영분석' as const])),
  ...Object.fromEntries(ADMIN_OPERATIONS_TABS.map((tab) => [tab.id, '운영설정' as const])),
  ...Object.fromEntries(ADMIN_AUDIT_TABS.map((tab) => [tab.id, '감사센터' as const])),
  ...ADMIN_TAB_ALIASES,
};

const DEFAULT_ADMIN_ENTRY: AdminEntryState = {
  activeTab: '경영분석',
  analysisTab: '경영대시보드',
  operationsTab: '알림자동화',
  auditTab: '접근감사로그',
};

const ADMIN_ANALYSIS_TAB_ID_SET = new Set<string>(ADMIN_ANALYSIS_TABS.map((tab) => tab.id));
const ADMIN_OPERATIONS_TAB_ID_SET = new Set<string>(ADMIN_OPERATIONS_TABS.map((tab) => tab.id));
const ADMIN_AUDIT_TAB_ID_SET = new Set<string>(ADMIN_AUDIT_TABS.map((tab) => tab.id));
const ADMIN_OUTER_TAB_ID_SET = new Set<string>(ADMIN_OUTER_TABS);

export function isAdminAnalysisTabId(tabId?: string | null): tabId is AdminAnalysisTabId {
  return Boolean(tabId && ADMIN_ANALYSIS_TAB_ID_SET.has(tabId));
}

export function isAdminOperationsTabId(tabId?: string | null): tabId is AdminOperationsTabId {
  return Boolean(tabId && ADMIN_OPERATIONS_TAB_ID_SET.has(tabId));
}

export function isAdminAuditTabId(tabId?: string | null): tabId is AdminAuditTabId {
  return Boolean(tabId && ADMIN_AUDIT_TAB_ID_SET.has(tabId));
}

export function isAdminOuterTabId(tabId?: string | null): tabId is AdminOuterTabId {
  return Boolean(tabId && ADMIN_OUTER_TAB_ID_SET.has(tabId));
}

export function getDisplayedAdminSubView(subViewId?: string | null) {
  if (!subViewId) return subViewId || '';
  return ADMIN_PARENT_SUBVIEW_MAP[subViewId] || subViewId;
}

export function normalizeAdminEntry(tabId?: string | null): AdminEntryState {
  const aliasedTabId = tabId ? ADMIN_TAB_ALIASES[tabId] || tabId : null;

  if (isAdminAnalysisTabId(aliasedTabId)) {
    return {
      ...DEFAULT_ADMIN_ENTRY,
      activeTab: '경영분석',
      analysisTab: aliasedTabId,
    };
  }

  if (isAdminAuditTabId(aliasedTabId)) {
    return {
      ...DEFAULT_ADMIN_ENTRY,
      activeTab: '감사센터',
      auditTab: aliasedTabId,
    };
  }

  if (isAdminOperationsTabId(aliasedTabId)) {
    return {
      ...DEFAULT_ADMIN_ENTRY,
      activeTab: '운영설정',
      operationsTab: aliasedTabId,
    };
  }

  if (isAdminOuterTabId(aliasedTabId)) {
    return {
      ...DEFAULT_ADMIN_ENTRY,
      activeTab: aliasedTabId,
    };
  }

  const parentTabId = aliasedTabId ? ADMIN_PARENT_SUBVIEW_MAP[aliasedTabId] : null;
  if (parentTabId) {
    return {
      ...DEFAULT_ADMIN_ENTRY,
      activeTab: parentTabId,
    };
  }

  return DEFAULT_ADMIN_ENTRY;
}

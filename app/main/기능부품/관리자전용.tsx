'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canAccessAdminSection, canAccessMainMenu } from '@/lib/access-control';
import { supabase } from '@/lib/supabase';
import {
  ADMIN_ANALYSIS_TABS,
  ADMIN_AUDIT_TABS,
  ADMIN_OPERATIONS_TABS,
  ADMIN_OUTER_TABS,
  normalizeAdminEntry,
  type AdminAnalysisTabId,
  type AdminAuditTabId,
  type AdminOperationsTabId,
  type AdminOuterTabId,
} from '../admin-menu-config';

import dynamic from 'next/dynamic';
import { hasSystemMasterPermission } from '@/lib/system-master';
import { MenuIcon } from './조직도서브/조직도측면창';

// ── 서브뷰 lazy 로드 (관리자 메뉴 번들 최소화) ──
const AdminSubViewLoading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-2 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
  </div>
);

const StaffPermissionManager = dynamic(() => import('./관리자전용서브/직원권한통합'), { ssr: false, loading: AdminSubViewLoading });
const PopupManager = dynamic(() => import('./관리자전용서브/팝업창관리자'), { ssr: false, loading: AdminSubViewLoading });
const DataReseter = dynamic(() => import('./관리자전용서브/데이터초기화'), { ssr: false, loading: AdminSubViewLoading });
const DataBackup = dynamic(() => import('./관리자전용서브/데이터백업'), { ssr: false, loading: AdminSubViewLoading });
const AuditLogViewer = dynamic(() => import('./관리자전용서브/감사로그뷰어'), { ssr: false, loading: AdminSubViewLoading });
const BusinessDashboard = dynamic(() => import('./관리자전용서브/경영대시보드'), { ssr: false, loading: AdminSubViewLoading });
const CompanyManager = dynamic(() => import('./관리자전용서브/회사관리'), { ssr: false, loading: AdminSubViewLoading });
const ExcelBulkUpload = dynamic(() => import('./관리자전용서브/엑셀일괄등록'), { ssr: false, loading: AdminSubViewLoading });
const NotificationAutomation = dynamic(() => import('./관리자전용서브/알림자동화설정'), { ssr: false, loading: AdminSubViewLoading });
const SurgeryExamTemplateManager = dynamic(() => import('./관리자전용서브/수술검사템플릿관리'), { ssr: false, loading: AdminSubViewLoading });
const FormBuilder = dynamic(() => import('./전자결재서브/양식빌더'), { ssr: false, loading: AdminSubViewLoading });
const FinancialDashboard = dynamic(() => import('./관리자전용서브/재무대시보드'), { ssr: false, loading: AdminSubViewLoading });
const CustomDashboard = dynamic(() => import('./관리자전용서브/커스텀대시보드'), { ssr: false, loading: AdminSubViewLoading });
const BudgetManagement = dynamic(() => import('./관리자전용서브/예산관리'), { ssr: false, loading: AdminSubViewLoading });
const IntegratedReport = dynamic(() => import('./관리자전용서브/통합보고서'), { ssr: false, loading: AdminSubViewLoading });
const SalaryAnomalyDetector = dynamic(() => import('./관리자전용서브/급여이상치감지'), { ssr: false, loading: AdminSubViewLoading });
const AccessAuditLog = dynamic(() => import('./관리자전용서브/접근감사로그'), { ssr: false, loading: AdminSubViewLoading });
const CompanyPnL = dynamic(() => import('./관리자전용서브/법인손익현황'), { ssr: false, loading: AdminSubViewLoading });
const SystemMasterCenter = dynamic(() => import('./관리자전용서브/시스템마스터센터/index'), { ssr: false, loading: AdminSubViewLoading });

function canAccessAdminTab(user: any, tabId: AdminOuterTabId) {
  if (!canAccessMainMenu(user, '관리자')) {
    return false;
  }

  return canAccessAdminSection(user, tabId);
}

function InnerTabBar({
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (!node) return;
      const container = scrollRef.current;
      if (!container) return;
      const left = node.offsetLeft - container.offsetLeft - 8;
      container.scrollTo({ left, behavior: 'smooth' });
    },
    [activeTab],
  );

  return (
    <div
      className="mb-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm"
      data-testid={testIdPrefix ? `${testIdPrefix}-bar` : undefined}
    >
      <div className="mb-2">
        <h3 className="text-sm font-bold text-[var(--foreground)]">{title}</h3>
        {description ? <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{description}</p> : null}
      </div>
      <div ref={scrollRef} className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            ref={activeTab === tab.id ? activeRef : undefined}
            onClick={() => onChange(tab.id)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${index}` : undefined}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] px-4 py-2.5 text-[11px] font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--toss-blue-light)] hover:text-[var(--foreground)]'
            }`}
          >
            <MenuIcon name={tab.icon} className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap break-keep">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AdminView(props: Record<string, unknown>) {
  const user = props.user;
  const staffs = (props.staffs ?? []) as any[];
  const onRefresh = props.onRefresh as (() => void) | undefined;
  const initialTab = props.initialTab as string | null | undefined;

  const initialState = normalizeAdminEntry(initialTab);
  const [activeTab, setActiveTab] = useState<AdminOuterTabId>(initialState.activeTab);
  const [analysisTab, setAnalysisTab] = useState<AdminAnalysisTabId>(initialState.analysisTab);
  const [operationsTab, setOperationsTab] = useState<AdminOperationsTabId>(initialState.operationsTab);
  const [auditTab, setAuditTab] = useState<AdminAuditTabId>(initialState.auditTab);
  const [inventory, setInventory] = useState<any[]>([]);

  const isSystemMaster = hasSystemMasterPermission(user as any);
  const hasAdminMenuAccess = canAccessMainMenu(user as any, '관리자');
  const visibleOperationsTabs = useMemo(
    () => ADMIN_OPERATIONS_TABS.filter((tab) => canAccessAdminSection(user as any, tab.id)),
    [user],
  );
  const visibleAuditTabs = useMemo(
    () => ADMIN_AUDIT_TABS.filter((tab) => canAccessAdminSection(user as any, tab.id)),
    [user],
  );
  const visibleAdminTabs = useMemo(() => {
    return ADMIN_OUTER_TABS.filter((tabId) => {
      if (tabId === '시스템마스터센터' && !isSystemMaster) {
        return false;
      }
      return canAccessAdminTab(user, tabId);
    });
  }, [isSystemMaster, user]);
  const fallbackAdminTab = visibleAdminTabs[0] || null;

  useEffect(() => {
    const nextState = normalizeAdminEntry(initialTab);
    const requestedTab =
      nextState.activeTab === '시스템마스터센터' && !isSystemMaster
        ? '감사센터'
        : nextState.activeTab;
    const nextActiveTab = visibleAdminTabs.includes(requestedTab)
      ? requestedTab
      : (fallbackAdminTab ?? requestedTab);
    setActiveTab(nextActiveTab);
    setAnalysisTab(nextState.analysisTab);
    setOperationsTab(nextState.operationsTab);
    setAuditTab(nextState.auditTab);
  }, [fallbackAdminTab, initialTab, isSystemMaster, visibleAdminTabs]);

  useEffect(() => {
    if (activeTab && visibleAdminTabs.includes(activeTab)) return;
    if (fallbackAdminTab) {
      setActiveTab(fallbackAdminTab);
    }
  }, [activeTab, fallbackAdminTab, visibleAdminTabs]);

  useEffect(() => {
    if (visibleOperationsTabs.length === 0) return;
    if (visibleOperationsTabs.some((tab) => tab.id === operationsTab)) return;
    setOperationsTab(visibleOperationsTabs[0].id);
  }, [operationsTab, visibleOperationsTabs]);

  useEffect(() => {
    if (visibleAuditTabs.length === 0) return;
    if (visibleAuditTabs.some((tab) => tab.id === auditTab)) return;
    setAuditTab(visibleAuditTabs[0].id);
  }, [auditTab, visibleAuditTabs]);

  useEffect(() => {
    if (!visibleAdminTabs.includes('경영분석')) return;
    if (activeTab !== '경영분석' || analysisTab !== '경영대시보드') return;

    const fetchInventory = async () => {
      const { data } = await supabase
        .from('inventory')
        .select('id, item_name, name, quantity, min_quantity, company, department');
      setInventory(data || []);
    };

    fetchInventory().catch((error) => {
      console.error('관리자 재고 조회 실패:', error);
    });
  }, [activeTab, analysisTab, visibleAdminTabs]);

  if (!hasAdminMenuAccess || visibleAdminTabs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--muted)] p-4 text-center">
        <div className="mb-4 text-6xl">🔒</div>
        <h2 className="text-xl font-bold text-[var(--foreground)]">관리자 메뉴 접근 권한이 없습니다.</h2>
        <p className="mt-2 text-sm font-semibold text-[var(--toss-gray-3)]">
          메인 메뉴 권한과 관리자 세부 권한을 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col bg-[var(--page-bg)] animate-in fade-in duration-500"
      data-testid="admin-view"
    >
      <main className="custom-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto bg-[var(--page-bg)] p-3 pb-20 md:p-4">
        {activeTab === '경영분석' && (
          <>
            <InnerTabBar
              title="경영분석"
              description=""
              tabs={ADMIN_ANALYSIS_TABS}
              activeTab={analysisTab}
              onChange={(tabId) => setAnalysisTab(tabId as AdminAnalysisTabId)}
              testIdPrefix="admin-analysis-tab"
            />
            {analysisTab === '경영대시보드' && <BusinessDashboard staffs={staffs} inventory={inventory} />}
            {analysisTab === '재무대시보드' && <FinancialDashboard />}
            {analysisTab === '예산관리' && <BudgetManagement staffs={staffs} />}
            {analysisTab === '통합보고서' && <IntegratedReport staffs={staffs} />}
            {analysisTab === '법인손익' && <CompanyPnL staffs={staffs} selectedCo="전체" user={user} />}
            {analysisTab === '커스텀대시보드' && <CustomDashboard user={user as Record<string, unknown>} />}
          </>
        )}

        {activeTab === '운영설정' && (
          <>
            <InnerTabBar
              title="운영설정"
              description=""
              tabs={visibleOperationsTabs}
              activeTab={operationsTab}
              onChange={(tabId) => setOperationsTab(tabId as AdminOperationsTabId)}
              testIdPrefix="admin-operations-tab"
            />
            {operationsTab === '알림자동화' && <NotificationAutomation user={user} />}
            {operationsTab === '수술검사템플릿' && <SurgeryExamTemplateManager user={user} />}
            {operationsTab === '팝업관리' && <PopupManager />}
          </>
        )}

        {activeTab === '감사센터' && (
          <>
            <InnerTabBar
              title="감사센터"
              description=""
              tabs={visibleAuditTabs}
              activeTab={auditTab}
              onChange={(tabId) => setAuditTab(tabId as AdminAuditTabId)}
              testIdPrefix="admin-audit-tab"
            />
            {auditTab === '접근감사로그' && <AccessAuditLog user={user} />}
            {auditTab === '감사로그' && <AuditLogViewer />}
            {auditTab === '급여이상치' && <SalaryAnomalyDetector staffs={staffs} />}
          </>
        )}

        {activeTab === '엑셀등록' && <ExcelBulkUpload onRefresh={onRefresh} />}
        {activeTab === '회사관리' && <CompanyManager user={user as Record<string, unknown> | null | undefined} staffs={staffs} onRefresh={onRefresh} />}
        {activeTab === '직원권한' && <StaffPermissionManager onRefresh={onRefresh} />}
        {activeTab === '데이터백업' && <DataBackup user={user as Record<string, unknown> | null | undefined} />}
        {activeTab === '데이터초기화' && <DataReseter onRefresh={onRefresh ?? (() => {})} />}
        {activeTab === '문서양식' && <FormBuilder user={user as Record<string, unknown> | null | undefined} />}
        {activeTab === '시스템마스터센터' && (
          <SystemMasterCenter
            user={user}
            staffs={staffs}
            onRefresh={onRefresh}
            initialTab={initialTab === '연차수동부여' ? '연차수동부여' : undefined}
          />
        )}
      </main>
    </div>
  );
}

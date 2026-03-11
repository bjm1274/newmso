'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

import StaffPermissionManager from './관리자전용서브/직원권한통합';
import PopupManager from './관리자전용서브/팝업창관리자';
import DataReseter from './관리자전용서브/데이터초기화';
import DataBackup from './관리자전용서브/데이터백업';
import AuditLogViewer from './관리자전용서브/감사로그뷰어';
import BusinessDashboard from './관리자전용서브/경영대시보드';
import CompanyManager from './관리자전용서브/회사관리';
import ExcelBulkUpload from './관리자전용서브/엑셀일괄등록';
import NotificationAutomation from './관리자전용서브/알림자동화설정';
import SurgeryExamTemplateManager from './관리자전용서브/수술검사템플릿관리';
import FormBuilder from './전자결재서브/양식빌더';
import FinancialDashboard from './관리자전용서브/재무대시보드';
import BudgetManagement from './관리자전용서브/예산관리';
import IntegratedReport from './관리자전용서브/통합보고서';
import SalaryAnomalyDetector from './관리자전용서브/급여이상치감지';
import AccessAuditLog from './관리자전용서브/접근감사로그';
import CompanyPnL from './관리자전용서브/법인손익현황';
import OfficialDocumentLog from './관리자전용서브/공문서발송대장';
import SystemMasterCenter from './관리자전용서브/시스템마스터센터';
import { isNamedSystemMasterAccount } from '@/lib/system-master';

type AnalysisTabId = '경영대시보드' | '재무대시보드' | '예산관리' | '통합보고서' | '법인손익';
type AuditTabId = '감사로그' | '접근감사로그';
type AdminOuterTabId =
  | '경영분석'
  | '감사센터'
  | '시스템마스터센터'
  | '엑셀등록'
  | '알림자동화'
  | '회사관리'
  | '직원권한'
  | '수술검사템플릿'
  | '팝업관리'
  | '데이터백업'
  | '데이터초기화'
  | '문서양식'
  | '급여이상치'
  | '공문서대장';

const ANALYSIS_TABS: { id: AnalysisTabId; label: string; icon: string }[] = [
  { id: '경영대시보드', label: '경영대시보드', icon: '📊' },
  { id: '재무대시보드', label: '재무대시보드', icon: '💸' },
  { id: '예산관리', label: '예산관리', icon: '🧮' },
  { id: '통합보고서', label: '통합보고서', icon: '🧾' },
  { id: '법인손익', label: '법인손익', icon: '📈' },
];

const AUDIT_TABS: { id: AuditTabId; label: string; icon: string }[] = [
  { id: '접근감사로그', label: '접근감사로그', icon: '🔐' },
  { id: '감사로그', label: '감사로그', icon: '🧾' },
];

const DIRECT_ADMIN_TABS: AdminOuterTabId[] = [
  '엑셀등록',
  '알림자동화',
  '회사관리',
  '직원권한',
  '수술검사템플릿',
  '팝업관리',
  '데이터백업',
  '데이터초기화',
  '문서양식',
  '급여이상치',
  '공문서대장',
  '시스템마스터센터',
];

function normalizeAdminEntry(tabId?: string | null): {
  activeTab: AdminOuterTabId;
  analysisTab: AnalysisTabId;
  auditTab: AuditTabId;
} {
  if (tabId === '회사관리') {
    return {
      activeTab: '회사관리',
      analysisTab: '경영대시보드',
      auditTab: '접근감사로그',
    };
  }

  if (tabId && ANALYSIS_TABS.some((tab) => tab.id === tabId)) {
    return {
      activeTab: '경영분석',
      analysisTab: tabId as AnalysisTabId,
      auditTab: '접근감사로그',
    };
  }

  if (tabId && AUDIT_TABS.some((tab) => tab.id === tabId)) {
    return {
      activeTab: '감사센터',
      analysisTab: '경영대시보드',
      auditTab: tabId as AuditTabId,
    };
  }

  if (tabId === '경영분석' || tabId === '감사센터') {
    return {
      activeTab: tabId,
      analysisTab: '경영대시보드',
      auditTab: '접근감사로그',
    };
  }

  if (tabId === '양식빌더' || tabId === '문서서식' || tabId === '문서양식') {
    return {
      activeTab: '문서양식',
      analysisTab: '경영대시보드',
      auditTab: '접근감사로그',
    };
  }

  if (tabId === '연차수동부여') {
    return {
      activeTab: '시스템마스터센터',
      analysisTab: '경영대시보드',
      auditTab: '접근감사로그',
    };
  }

  if (tabId && DIRECT_ADMIN_TABS.includes(tabId as AdminOuterTabId)) {
    return {
      activeTab: tabId as AdminOuterTabId,
      analysisTab: '경영대시보드',
      auditTab: '접근감사로그',
    };
  }

  return {
    activeTab: '경영분석',
    analysisTab: '경영대시보드',
    auditTab: '접근감사로그',
  };
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
  return (
    <div
      className="mb-6 rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-4 shadow-sm"
      data-testid={testIdPrefix ? `${testIdPrefix}-bar` : undefined}
    >
      <div className="mb-3">
        <h3 className="text-sm font-bold text-[var(--foreground)]">{title}</h3>
        {description ? <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{description}</p> : null}
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${index}` : undefined}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-[var(--toss-blue)] text-white shadow-md'
                : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] hover:bg-[var(--toss-blue-light)] hover:text-[var(--foreground)]'
            }`}
          >
            <span className="shrink-0">{tab.icon}</span>
            <span className="whitespace-nowrap break-keep">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AdminView({ user, staffs = [], onRefresh, initialTab }: any) {
  const initialState = normalizeAdminEntry(initialTab);
  const [activeTab, setActiveTab] = useState<AdminOuterTabId>(initialState.activeTab);
  const [analysisTab, setAnalysisTab] = useState<AnalysisTabId>(initialState.analysisTab);
  const [auditTab, setAuditTab] = useState<AuditTabId>(initialState.auditTab);
  const [inventory, setInventory] = useState<any[]>([]);

  const isMso = user?.company === 'SY INC.' || user?.permissions?.mso === true;
  const isSystemMaster = isNamedSystemMasterAccount(user);

  useEffect(() => {
    const nextState = normalizeAdminEntry(initialTab);
    const nextActiveTab = nextState.activeTab === '시스템마스터센터' && !isSystemMaster
      ? '감사센터'
      : nextState.activeTab;
    setActiveTab(nextActiveTab);
    setAnalysisTab(nextState.analysisTab);
    setAuditTab(nextState.auditTab);
  }, [initialTab, isSystemMaster]);

  useEffect(() => {
    if (!isMso) return;

    const fetchInventory = async () => {
      const { data } = await supabase.from('inventory').select('*');
      setInventory(data || []);
    };

    fetchInventory().catch((error) => {
      console.error('관리자 재고 조회 실패:', error);
    });
  }, [isMso]);

  if (!isMso) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--toss-gray-1)] p-6 text-center">
        <div className="mb-4 text-6xl">🔒</div>
        <h2 className="text-xl font-bold text-[var(--foreground)]">관리자 메뉴 접근 권한이 없습니다.</h2>
        <p className="mt-2 text-sm font-semibold text-[var(--toss-gray-3)]">
          이 메뉴는 MSO 권한이 있는 계정만 사용할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col bg-[var(--page-bg)] animate-in fade-in duration-500"
      data-testid="admin-view"
    >
      <main className="custom-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto bg-[var(--toss-gray-1)]/30 p-4 pb-24 md:p-10">
        {activeTab === '경영분석' && (
          <>
            <InnerTabBar
              title="경영분석"
              description=""
              tabs={ANALYSIS_TABS}
              activeTab={analysisTab}
              onChange={(tabId) => setAnalysisTab(tabId as AnalysisTabId)}
              testIdPrefix="admin-analysis-tab"
            />
            {analysisTab === '경영대시보드' && <BusinessDashboard staffs={staffs} inventory={inventory} />}
            {analysisTab === '재무대시보드' && <FinancialDashboard />}
            {analysisTab === '예산관리' && <BudgetManagement staffs={staffs} />}
            {analysisTab === '통합보고서' && <IntegratedReport staffs={staffs} />}
            {analysisTab === '법인손익' && <CompanyPnL staffs={staffs} selectedCo="전체" user={user} />}
          </>
        )}

        {activeTab === '감사센터' && (
          <>
            <InnerTabBar
              title="감사센터"
              description=""
              tabs={AUDIT_TABS}
              activeTab={auditTab}
              onChange={(tabId) => setAuditTab(tabId as AuditTabId)}
              testIdPrefix="admin-audit-tab"
            />
            {auditTab === '접근감사로그' && <AccessAuditLog user={user} />}
            {auditTab === '감사로그' && <AuditLogViewer />}
          </>
        )}

        {activeTab === '엑셀등록' && <ExcelBulkUpload onRefresh={onRefresh} />}
        {activeTab === '알림자동화' && <NotificationAutomation user={user} />}
        {activeTab === '회사관리' && <CompanyManager staffs={staffs} onRefresh={onRefresh} />}
        {activeTab === '직원권한' && <StaffPermissionManager onRefresh={onRefresh} />}
        {activeTab === '수술검사템플릿' && <SurgeryExamTemplateManager />}
        {activeTab === '팝업관리' && <PopupManager />}
        {activeTab === '데이터백업' && <DataBackup />}
        {activeTab === '데이터초기화' && <DataReseter onRefresh={onRefresh} />}
        {activeTab === '문서양식' && <FormBuilder user={user} />}
        {activeTab === '급여이상치' && <SalaryAnomalyDetector staffs={staffs} />}
        {activeTab === '공문서대장' && <OfficialDocumentLog staffs={staffs} selectedCo="전체" user={user} />}
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

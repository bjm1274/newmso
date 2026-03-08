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
import AnnualLeaveGrantTool from './관리자전용서브/연차수동부여';
import SurgeryExamTemplateManager from './관리자전용서브/수술검사템플릿관리';
import FormBuilder from './전자결재서브/양식빌더';
import FinancialDashboard from './관리자전용서브/재무대시보드';
import BudgetManagement from './관리자전용서브/예산관리';
import IntegratedReport from './관리자전용서브/통합보고서';
import SalaryAnomalyDetector from './관리자전용서브/급여이상치감지';
import AccessAuditLog from './관리자전용서브/접근감사로그';
import CompanyPnL from './관리자전용서브/법인손익현황';
import PayrollDocumentDesignManager from './관리자전용서브/급여명세서서식관리';
import OfficialDocumentLog from './관리자전용서브/공문서발송대장';

const ADMIN_TAB_IDS = [
  '경영대시보드',
  '재무대시보드',
  '예산관리',
  '통합보고서',
  '엑셀등록',
  '알림자동화',
  '연차수동부여',
  '회사관리',
  '직원권한',
  '수술검사템플릿',
  '팝업관리',
  '감사로그',
  '데이터백업',
  '데이터초기화',
  '양식빌더',
  '문서서식',
  '급여이상치',
  '접근감사로그',
  '법인손익',
  '공문서대장',
] as const;

export default function AdminView({ user, staffs = [], onRefresh, initialTab }: any) {
  const [activeTab, setActiveTab] = useState<string>(
    initialTab && ADMIN_TAB_IDS.includes(initialTab as (typeof ADMIN_TAB_IDS)[number])
      ? initialTab
      : '경영대시보드',
  );
  const [inventory, setInventory] = useState<any[]>([]);

  const isMso = user?.company === 'SY INC.' || user?.permissions?.mso === true;

  useEffect(() => {
    if (!initialTab || !ADMIN_TAB_IDS.includes(initialTab as (typeof ADMIN_TAB_IDS)[number])) return;
    setActiveTab(initialTab);
  }, [initialTab]);

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
        <div className="mb-4 text-6xl">권한</div>
        <h2 className="text-xl font-bold text-[var(--foreground)]">관리자 메뉴 접근 권한이 없습니다.</h2>
        <p className="mt-2 text-sm font-semibold text-[var(--toss-gray-3)]">
          이 메뉴는 MSO 권한이 있는 계정만 사용할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full flex-1 flex-col min-h-0 bg-[var(--page-bg)] animate-in fade-in duration-500"
      data-testid="admin-view"
    >
      <main className="custom-scrollbar flex-1 min-h-0 min-w-0 overflow-y-auto bg-[var(--toss-gray-1)]/30 p-4 md:p-10">
        {activeTab === '경영대시보드' && <BusinessDashboard staffs={staffs} inventory={inventory} />}
        {activeTab === '재무대시보드' && <FinancialDashboard />}
        {activeTab === '예산관리' && <BudgetManagement staffs={staffs} />}
        {activeTab === '통합보고서' && <IntegratedReport staffs={staffs} />}
        {activeTab === '엑셀등록' && <ExcelBulkUpload onRefresh={onRefresh} />}
        {activeTab === '알림자동화' && <NotificationAutomation user={user} />}
        {activeTab === '연차수동부여' && <AnnualLeaveGrantTool staffs={staffs} onRefresh={onRefresh} />}
        {activeTab === '회사관리' && <CompanyManager staffs={staffs} onRefresh={onRefresh} />}
        {activeTab === '직원권한' && <StaffPermissionManager onRefresh={onRefresh} />}
        {activeTab === '수술검사템플릿' && <SurgeryExamTemplateManager />}
        {activeTab === '팝업관리' && <PopupManager />}
        {activeTab === '감사로그' && <AuditLogViewer />}
        {activeTab === '데이터백업' && <DataBackup />}
        {activeTab === '데이터초기화' && <DataReseter onRefresh={onRefresh} />}
        {activeTab === '양식빌더' && <FormBuilder user={user} />}
        {activeTab === '문서서식' && <PayrollDocumentDesignManager />}
        {activeTab === '급여이상치' && <SalaryAnomalyDetector staffs={staffs} />}
        {activeTab === '접근감사로그' && <AccessAuditLog user={user} />}
        {activeTab === '법인손익' && <CompanyPnL staffs={staffs} selectedCo="전체" user={user} />}
        {activeTab === '공문서대장' && <OfficialDocumentLog staffs={staffs} selectedCo="전체" user={user} />}
      </main>
    </div>
  );
}

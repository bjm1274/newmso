'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

import 직원권한통합 from './관리자전용서브/직원권한통합';
import PopupManager from './관리자전용서브/팝업창관리자';
import DataReseter from './관리자전용서브/데이터초기화';
import DataBackup from './관리자전용서브/데이터백업';
import AuditLogViewer from './관리자전용서브/감사로그뷰어';
import BusinessDashboard from './관리자전용서브/경영대시보드';
import CompanyManager from './관리자전용서브/회사관리';
import ExcelBulkUpload from './관리자전용서브/엑셀일괄등록';
import NotificationAutomation from './관리자전용서브/알림자동화설정';
import 연차수동부여 from './관리자전용서브/연차수동부여';
import SurgeryExamTemplateManager from './관리자전용서브/수술검사템플릿관리';
import FormBuilder from './전자결재서브/양식빌더';
import FinancialDashboard from './관리자전용서브/재무대시보드';
import 예산관리 from './관리자전용서브/예산관리';
import 통합보고서 from './관리자전용서브/통합보고서';
import SalaryAnomalyDetector from './관리자전용서브/급여이상치감지';
import AccessAuditLog from './관리자전용서브/접근감사로그';
import CompanyPnL from './관리자전용서브/법인손익현황';

const ADMIN_TAB_IDS = ['경영대시보드', '재무대시보드', '예산관리', '통합보고서', '엑셀등록', '알림자동화', '연차부여', '회사관리', '직원권한', '수술검사템플릿', '팝업관리', '감사로그', '데이터백업', '데이터초기화', '양식빌더', '급여이상치', '접근감사로그', '법인손익'];

export default function AdminView({ user, staffs = [], depts = [], onRefresh, initialTab }: any) {
  const [activeTab, setActiveTab] = useState(initialTab && ADMIN_TAB_IDS.includes(initialTab) ? initialTab : '경영대시보드');
  const [inventory, setInventory] = useState<any[]>([]);

  const isMso = user?.company === 'SY INC.' || user?.permissions?.mso === true;

  useEffect(() => {
    const fetchInventory = async () => {
      const { data } = await supabase.from('inventory').select('*');
      if (data) setInventory(data);
    };

    if (isMso) {
      fetchInventory();
    }
  }, [isMso]);

  useEffect(() => {
    if (initialTab && ADMIN_TAB_IDS.includes(initialTab)) setActiveTab(initialTab);
  }, [initialTab]);

  const adminTabs = [
    { id: '경영대시보드', label: '📊 일반 대시보드' },
    { id: '재무대시보드', label: '📉 재무 대시보드' },
    { id: '예산관리', label: '💰 예산 관리' },
    { id: '통합보고서', label: '📊 통합 보고서' },
    { id: '엑셀등록', label: '📁 엑셀 일괄' },
    { id: '알림자동화', label: '🔔 알림 자동화' },
    { id: '연차부여', label: '🏖️ 연차 부여' },
    { id: '회사관리', label: '🏢 회사/조직' },
    { id: '직원권한', label: '직원·권한' },
    { id: '수술검사템플릿', label: '수술·검사명' },
    { id: '팝업관리', label: '팝업' },
    { id: '감사로그', label: '감사 로그' },
    { id: '데이터백업', label: '백업/복원' },
    { id: '데이터초기화', label: '초기화' },
    { id: '양식빌더', label: '📝 양식 빌더' },
    { id: '급여이상치', label: '🔍 급여 이상치' },
    { id: '접근감사로그', label: '🔒 접근 감사 로그' },
    { id: '법인손익', label: '📊 법인 손익 현황' },
  ];

  if (!isMso) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--toss-gray-1)]">
        <div className="text-6xl mb-4">🚫</div>
        <h2 className="text-xl font-bold text-[var(--foreground)]">접근 권한이 없습니다.</h2>
        <p className="text-sm text-[var(--toss-gray-3)] font-bold mt-2">이 메뉴는 MSO 소속 직원만 이용할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--page-bg)] h-full relative animate-in fade-in duration-500">
      {/* 상세 메뉴는 메인 좌측 사이드바에서 관리자 호버/클릭 시 플라이아웃으로 선택 */}
      <main className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 md:p-10 custom-scrollbar bg-[var(--toss-gray-1)]/30">
        {activeTab === '경영대시보드' && (
          <BusinessDashboard staffs={staffs} inventory={inventory} />
        )}
        {activeTab === '재무대시보드' && <FinancialDashboard />}
        {activeTab === '예산관리' && <예산관리 staffs={staffs} />}
        {activeTab === '통합보고서' && <통합보고서 staffs={staffs} />}
        {activeTab === '엑셀등록' && <ExcelBulkUpload onRefresh={onRefresh} />}
        {activeTab === '알림자동화' && <NotificationAutomation user={user} />}
        {activeTab === '연차부여' && (
          <연차수동부여 staffs={staffs} onRefresh={onRefresh} />
        )}
        {activeTab === '회사관리' && <CompanyManager staffs={staffs} onRefresh={onRefresh} />}
        {activeTab === '직원권한' && <직원권한통합 onRefresh={onRefresh} />}
        {activeTab === '수술검사템플릿' && <SurgeryExamTemplateManager />}
        {activeTab === '팝업관리' && <PopupManager />}
        {activeTab === '감사로그' && <AuditLogViewer />}
        {activeTab === '데이터백업' && <DataBackup />}
        {activeTab === '데이터초기화' && (
          <DataReseter onRefresh={onRefresh} />
        )}
        {activeTab === '양식빌더' && <FormBuilder user={user} />}
        {activeTab === '급여이상치' && <SalaryAnomalyDetector staffs={staffs} />}
        {activeTab === '접근감사로그' && <AccessAuditLog user={user} />}
        {activeTab === '법인손익' && <CompanyPnL staffs={staffs} selectedCo="전체" user={user} />}
      </main>
    </div>
  );
}

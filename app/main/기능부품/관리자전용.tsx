'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

import 직원권한통합 from './관리자전용서브/직원권한통합';
import AttendanceDeductionRules from './관리자전용서브/근태차감규칙설정';
import PopupManager from './관리자전용서브/팝업창관리자';
import DataReseter from './관리자전용서브/데이터초기화';
import DataBackup from './관리자전용서브/데이터백업';
import AuditLogViewer from './관리자전용서브/감사로그뷰어';
import BusinessDashboard from './관리자전용서브/경영대시보드';
import CompanyManager from './관리자전용서브/회사관리';
import ExcelBulkUpload from './관리자전용서브/엑셀일괄등록';
import NotificationAutomation from './관리자전용서브/알림자동화설정';
import ApprovalFormTypesManager from './관리자전용서브/전자결재양식관리';
import 연차수동부여 from './관리자전용서브/연차수동부여';
import SurgeryExamTemplateManager from './관리자전용서브/수술검사템플릿관리';

export default function AdminView({ user, staffs = [], depts = [], onRefresh }: any) {
  const [activeTab, setActiveTab] = useState('경영대시보드');
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

  const adminTabs = [
    { id: '경영대시보드', label: '📊 대시보드' },
    { id: '엑셀등록', label: '📁 엑셀 일괄' },
    { id: '알림자동화', label: '🔔 알림 자동화' },
    { id: '연차부여', label: '🏖️ 연차 부여' },
    { id: '근태차감규칙', label: '⏰ 근태 규칙' },
    { id: '회사관리', label: '🏢 회사/조직' },
    { id: '직원권한', label: '직원·권한' },
    { id: '전자결재양식', label: '서식양식' },
    { id: '수술검사템플릿', label: '수술·검사명' },
    { id: '팝업관리', label: '팝업' },
    { id: '감사로그', label: '감사 로그' },
    { id: '데이터백업', label: '백업/복원' },
    { id: '데이터초기화', label: '초기화' }
  ];

  if (!isMso) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#F2F4F6]">
        <div className="text-6xl mb-4">🚫</div>
        <h2 className="text-xl font-bold text-[#191F28]">접근 권한이 없습니다.</h2>
        <p className="text-sm text-gray-400 font-bold mt-2">이 메뉴는 MSO 소속 직원만 이용할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#FDFDFD] h-full relative animate-in fade-in duration-500">
      <header className="px-10 py-8 flex justify-end items-center bg-white border-b border-gray-100 shrink-0 shadow-sm flex-wrap gap-4">
        <div className="flex gap-1 bg-[#F2F4F6] p-1 border border-[#E5E8EB] rounded-[12px] overflow-x-auto max-w-full">
          {adminTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-[10px] font-bold whitespace-nowrap rounded-[12px] transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-[#3182F6] shadow-sm'
                  : 'text-gray-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-[#F2F4F6]/30">
        {activeTab === '경영대시보드' && (
          <BusinessDashboard staffs={staffs} inventory={inventory} />
        )}
        {activeTab === '엑셀등록' && <ExcelBulkUpload onRefresh={onRefresh} />}
        {activeTab === '알림자동화' && <NotificationAutomation user={user} />}
        {activeTab === '연차부여' && (
          <연차수동부여 staffs={staffs} onRefresh={onRefresh} />
        )}
        {activeTab === '근태차감규칙' && <AttendanceDeductionRules />}
        {activeTab === '회사관리' && <CompanyManager staffs={staffs} onRefresh={onRefresh} />}
        {activeTab === '직원권한' && <직원권한통합 onRefresh={onRefresh} />}
        {activeTab === '전자결재양식' && <ApprovalFormTypesManager />}
        {activeTab === '수술검사템플릿' && <SurgeryExamTemplateManager />}
        {activeTab === '팝업관리' && <PopupManager />}
        {activeTab === '감사로그' && <AuditLogViewer />}
        {activeTab === '데이터백업' && <DataBackup />}
        {activeTab === '데이터초기화' && (
          <DataReseter onRefresh={onRefresh} />
        )}
      </main>
    </div>
  );
}

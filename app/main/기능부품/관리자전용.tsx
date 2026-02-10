'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

import 직원권한통합 from './관리자전용서브/직원권한통합';
import TeamManager from './관리자전용서브/팀관리';
import AttendanceDeductionRules from './관리자전용서브/근태차감규칙설정';
import ContractManager from './관리자전용서브/계약관리도구';
import PopupManager from './관리자전용서브/팝업창관리자';
import DataReseter from './관리자전용서브/데이터초기화';
import DataBackup from './관리자전용서브/데이터백업';
import AuditLogViewer from './관리자전용서브/감사로그뷰어';
import BusinessDashboard from './관리자전용서브/경영대시보드';
import CompanyManager from './관리자전용서브/회사관리';
import ExcelBulkUpload from './관리자전용서브/엑셀일괄등록';
import NotificationAutomation from './관리자전용서브/알림자동화설정';
import CorporateCardTransactions from './인사관리서브/법인카드사용내역';

export default function AdminView({ user, staffs = [], depts = [], onRefresh }: any) {
  const [activeTab, setActiveTab] = useState('경영대시보드');
  const [inventory, setInventory] = useState<any[]>([]);

  const isMso = user?.company === 'SY INC.' || user?.permissions?.mso === true;
  if (!isMso) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50">
        <div className="text-6xl mb-4">🚫</div>
        <h2 className="text-xl font-black text-gray-800">접근 권한이 없습니다.</h2>
        <p className="text-sm text-gray-400 font-bold mt-2">이 메뉴는 MSO 소속 직원만 이용할 수 있습니다.</p>
      </div>
    );
  }

  useEffect(() => {
    const fetchInventory = async () => {
      const { data } = await supabase.from('inventory').select('*');
      if (data) setInventory(data);
    };
    fetchInventory();
  }, []);

  const adminTabs = [
    { id: '경영대시보드', label: '📊 대시보드' },
    { id: '엑셀등록', label: '📁 엑셀 일괄' },
    { id: '알림자동화', label: '🔔 알림 자동화' },
    { id: '근태차감규칙', label: '⏰ 근태 규칙' },
    { id: '회사관리', label: '🏢 회사' },
    { id: '팀관리', label: '팀' },
    { id: '직원권한', label: '직원·권한' },
    { id: '법인카드', label: '법인카드' },
    { id: '전자계약설정', label: '계약' },
    { id: '팝업관리', label: '팝업' },
    { id: '감사로그', label: '감사 로그' },
    { id: '데이터백업', label: '백업/복원' },
    { id: '데이터초기화', label: '초기화' }
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#FDFDFD] h-full relative animate-in fade-in duration-500">
      <header className="px-10 py-8 flex justify-between items-center bg-white border-b border-gray-100 shrink-0 shadow-sm flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tighter">SY INC. MSO 관리자 센터</h1>
          <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase tracking-widest">Integrated Admin Hub</p>
        </div>
        
        <div className="flex gap-1 bg-gray-100 p-1 border border-gray-200 rounded-xl overflow-x-auto max-w-full">
          {adminTabs.map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-[10px] font-black whitespace-nowrap rounded-lg transition-all ${
                activeTab === tab.id 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-gray-50/30">
        {activeTab === '경영대시보드' && <BusinessDashboard staffs={staffs} inventory={inventory} />}
        {activeTab === '엑셀등록' && <ExcelBulkUpload onRefresh={onRefresh} />}
        {activeTab === '알림자동화' && <NotificationAutomation user={user} />}
        {activeTab === '근태차감규칙' && <AttendanceDeductionRules />}
        {activeTab === '회사관리' && <CompanyManager />}
        {activeTab === '팀관리' && <TeamManager onRefresh={onRefresh} />}
        {activeTab === '직원권한' && <직원권한통합 onRefresh={onRefresh} />}
        {activeTab === '전자계약설정' && <ContractManager />}
        {activeTab === '법인카드' && <CorporateCardTransactions staffs={staffs} />}
        {activeTab === '팝업관리' && <PopupManager />}
        {activeTab === '감사로그' && <AuditLogViewer />}
        {activeTab === '데이터백업' && <DataBackup />}
        {activeTab === '데이터초기화' && <DataReseter onRefresh={onRefresh} />}
      </main>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';

// 기능 컴포넌트 불러오기
import MyProfileCard from './프로필카드';
import SalarySlipContainer from './급여명세서';
import MyTodoList from './나의할일';
import CommuteRecord from './출퇴근기록';
import MyCertificates from './증명서관리';
import NotificationInbox from '../알림인박스';

export default function MyPageMain({ user, initialMyPageTab, onConsumeMyPageInitialTab, onOpenApproval }: any) {
  const [activeTab, setActiveTab] = useState<'profile' | 'salary' | 'todo' | 'commute' | 'certificates' | 'notifications'>('profile');

  useEffect(() => {
    if (initialMyPageTab === 'notifications') {
      setActiveTab('notifications');
      onConsumeMyPageInitialTab?.();
    }
  }, [initialMyPageTab, onConsumeMyPageInitialTab]);

  if (!user) return <div className="p-10 text-center font-bold">사용자 정보 로딩 중...</div>;

  return (
    <div className="h-full flex flex-col bg-gray-50 p-6 rounded-[3rem] overflow-hidden">
      
      {/* 상단 헤더 및 통합 탭 메뉴 */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 shrink-0">
        <div className="text-left space-y-1">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            반갑습니다, {user.name}님 👋
          </h1>
          <p className="text-xs font-bold text-gray-400 mt-1">
            내 정보 · 출퇴근 · 할일 · 증명서 · 급여명세서를 한 곳에서 관리합니다.
          </p>
        </div>

        {/* 통합 탭 네비게이션 */}
        <div className="flex bg-white p-1.5 rounded-full shadow-sm border border-gray-100 overflow-x-auto max-w-full">
          <TabButton 
            isActive={activeTab === 'profile'} 
            onClick={() => setActiveTab('profile')} 
            label="내 정보" icon="👤" 
          />
          <TabButton 
            isActive={activeTab === 'commute'} 
            onClick={() => setActiveTab('commute')} 
            label="출퇴근" icon="⏰" 
          />
          <TabButton 
            isActive={activeTab === 'todo'} 
            onClick={() => setActiveTab('todo')} 
            label="할일" icon="✅" 
          />
          <TabButton 
            isActive={activeTab === 'certificates'} 
            onClick={() => setActiveTab('certificates')} 
            label="증명서" icon="📄" // [추가] 신규 탭
          />
          <TabButton 
            isActive={activeTab === 'salary'} 
            onClick={() => setActiveTab('salary')} 
            label="급여명세서" icon="💰" 
          />
          <TabButton 
            isActive={activeTab === 'notifications'} 
            onClick={() => setActiveTab('notifications')} 
            label="알림" icon="🔔" 
          />
        </div>
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 transition-all duration-300">
          {activeTab === 'profile' && <MyProfileCard user={user} />}
          {activeTab === 'commute' && (
            <CommuteRecord
              user={user}
              onRequestCorrection={(log: any) =>
                onOpenApproval?.({
                  type: '출결정정',
                  workDate: log.work_date,
                  todayLog: log,
                })
              }
            />
          )}
          {activeTab === 'todo' && <MyTodoList user={user} />}
          {activeTab === 'salary' && <SalarySlipContainer user={user} />}
          {activeTab === 'certificates' && <MyCertificates user={user} />}
          {activeTab === 'notifications' && <NotificationInbox user={user} onRefresh={() => {}} />}
        </div>
      </div>

    </div>
  );
}

function TabButton({ isActive, onClick, label, icon }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-black transition-all duration-200 whitespace-nowrap
        ${isActive ? 'bg-gray-900 text-white shadow-md transform scale-105' : 'bg-transparent text-gray-400 hover:bg-gray-50'}
      `}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
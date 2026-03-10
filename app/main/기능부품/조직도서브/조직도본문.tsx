'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

import OrgChart from './조직도그림';
import MyPage from '../마이페이지';
import ChatView from '../메신저';
import BoardView from '../게시판';
import ApprovalView from '../전자결재';
import HRView from '../인사관리';
import InventoryView from '../재고관리_통합완성';
import AdminView from '../관리자전용';
import 추가기능 from '../추가기능';

export default function MainContent({
  user,
  mainMenu,
  data,
  subView,
  setSubView,
  selectedCo,
  setSelectedCo,
  companies = [],
  selectedCompanyId,
  setSelectedCompanyId,
  onRefresh,
  initialMyPageTab,
  onConsumeMyPageInitialTab,
  initialOpenChatRoomId,
  onConsumeOpenChatRoomId,
  initialOpenMessageId,
  initialOpenPostId,
  onConsumeOpenPostId,
  setMainMenu,
}: any) {
  const [annualLeaveNotice, setAnnualLeaveNotice] = useState<{ remaining: number, total: number } | null>(null);
  const [contractTemplate, setContractTemplate] = useState<string>('');

  useEffect(() => {
    const checkNotifications = async () => {
      if (!user?.id) return;

      const { data: staff } = await supabase
        .from('staff_members')
        .select('annual_leave_total, annual_leave_used')
        .eq('id', user.id)
        .single();

      if (staff) {
        const remaining = (staff.annual_leave_total || 0) - (staff.annual_leave_used || 0);
        const currentMonth = new Date().getMonth() + 1;
        if (remaining > 0 && (currentMonth >= 7)) {
          setAnnualLeaveNotice({ remaining, total: staff.annual_leave_total });
        }
      }
    };
    checkNotifications();
  }, [user]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-[var(--page-bg)]">
      {mainMenu === '내정보' && (
        <div className="w-full flex-1 min-h-0 overflow-hidden" data-testid="mypage-view">
          <MyPage
            user={user}
            initialMyPageTab={initialMyPageTab}
            onConsumeMyPageInitialTab={onConsumeMyPageInitialTab}
            onOpenApproval={() => setMainMenu('전자결재')}
            setMainMenu={setMainMenu}
          />
        </div>
      )}
      {mainMenu === '조직도' && <div className="flex-1 overflow-hidden"><OrgChart user={user} staffs={data.staffs} selectedCo={selectedCo} setSelectedCo={setSelectedCo} /></div>}
      {mainMenu === '채팅' && <div className="flex-1 overflow-hidden bg-[var(--toss-card)] z-20"><ChatView user={user} onRefresh={onRefresh} staffs={data.staffs} initialOpenChatRoomId={initialOpenChatRoomId} initialOpenMessageId={initialOpenMessageId} onConsumeOpenChatRoomId={onConsumeOpenChatRoomId} /></div>}
      {mainMenu === '게시판' && (
        <div className="flex-1 overflow-hidden">
          <BoardView
            user={user}
            posts={data.posts?.filter((p: any) => p.board_type === (subView || '공지사항')) || []}
            subView={subView || '공지사항'}
            setSubView={setSubView}
            selectedCo={selectedCo}
            selectedCompanyId={selectedCompanyId}
            initialBoard={subView || '공지사항'}
            initialPostId={initialOpenPostId}
            onConsumePostId={onConsumeOpenPostId}
            surgeries={data.surgeries}
            mris={data.mris}
            onRefresh={onRefresh}
            setMainMenu={setMainMenu}
          />
        </div>
      )}
      {mainMenu === '전자결재' && <div className="flex-1 overflow-hidden"><ApprovalView user={user} staffs={data.staffs} selectedCo={selectedCo} setSelectedCo={setSelectedCo} selectedCompanyId={selectedCompanyId} onRefresh={onRefresh} initialView={subView} onViewChange={setSubView} /></div>}
      {mainMenu === '인사관리' && (
        <div className="flex-1 overflow-hidden" data-testid="hr-view">
          <HRView
            user={user}
            staffs={data.staffs}
            depts={data.depts}
            selectedCo={selectedCo}
            onRefresh={onRefresh}
            initialMenu={subView}
          />
        </div>
      )}
      {mainMenu === '재고관리' && <div className="flex-1 overflow-hidden"><InventoryView user={user} depts={data.depts} onRefresh={onRefresh} selectedCo={selectedCo} selectedCompanyId={selectedCompanyId} initialView={subView} /></div>}
      {mainMenu === '추가기능' && (
        <div className="flex-1 overflow-hidden flex flex-col" data-testid="extra-view">
          <추가기능
            user={user}
            staffs={data.staffs}
            posts={data.posts}
            onSearchSelect={(type: string) => {
              if (type === 'staff') setMainMenu('조직도');
              else if (type === 'post') setMainMenu('게시판');
              else if (type === 'approval') setMainMenu('전자결재');
              else if (type === 'message') setMainMenu('채팅');
            }}
            onOpenOrgChart={() => setMainMenu('조직도')}
          />
        </div>
      )}
      {mainMenu === '관리자' && <div className="flex-1 overflow-hidden"><AdminView user={user} staffs={data.staffs} depts={data.depts} onRefresh={onRefresh} initialTab={subView} /></div>}

      {/* 근로계약서 서명 팝업 제거됨 (마이페이지에서 통합 관리) */}

      {/* 연차 촉진 알림 - 모바일 대응 */}
      {annualLeaveNotice && (
        <div className="fixed bottom-28 right-4 left-4 md:bottom-10 md:left-auto md:right-10 z-[9998] animate-in slide-in-from-bottom-10">
          <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] p-6 md:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.08)] rounded-[20px] w-full md:w-80 space-y-4">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold text-[var(--foreground)] tracking-tight">연차 사용 촉진 알림</h3>
              <button onClick={() => setAnnualLeaveNotice(null)} className="text-[var(--toss-gray-3)] hover:text-[var(--foreground)] text-xl">✕</button>
            </div>
            <div className="bg-[#FFF8E6] p-4 rounded-[12px] border border-[#FFE4A0]">
              <p className="text-[11px] font-semibold text-[#F59E0B] uppercase mb-1 tracking-wider">법적 준수 사항</p>
              <p className="text-xs font-medium text-[var(--toss-gray-4)] leading-relaxed">
                {user.name}님, 현재 잔여 연차가 <span className="text-[#F59E0B] font-bold">{annualLeaveNotice.remaining}일</span> 남았습니다.
                근로기준법 제61조에 의거하여 연차 사용을 권고드립니다.
              </p>
            </div>
            <button onClick={() => setAnnualLeaveNotice(null)} className="w-full py-4 bg-[var(--toss-blue)] text-white text-[13px] font-semibold rounded-[12px] hover:bg-[var(--toss-blue)] transition-all">확인했습니다</button>
          </div>
        </div>
      )}
    </div>
  );
}

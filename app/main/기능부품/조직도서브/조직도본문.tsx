'use client';

import { useEffect, useState } from 'react';
import { normalizeMainMenuForUser } from '@/lib/access-control';
import { supabase } from '@/lib/supabase';
import type { ErpUser, ERPData } from '@/types';

import OrgChart from './OrgChart';
import MyPage from '../마이페이지';
import ChatView from '../메신저';
import BoardView from '../게시판';
import ApprovalView from '../전자결재';
import HRView from '../인사관리';
import InventoryView from '../재고관리_통합완성';
import AdminView from '../관리자전용';
import 추가기능 from '../추가기능';

interface MainContentProps {
  user: ErpUser | null;
  mainMenu: string;
  data: ERPData;
  subView?: string | null;
  setSubView?: (v: string | null) => void;
  selectedCo?: string | null;
  setSelectedCo?: (v: string | null) => void;
  companies?: string[];
  selectedCompanyId?: string | null;
  setSelectedCompanyId?: (v: string | null) => void;
  onRefresh?: () => void;
  initialMyPageTab?: string | null;
  onConsumeMyPageInitialTab?: () => void;
  initialBoard?: string | null;
  initialOpenChatRoomId?: string | null;
  onConsumeOpenChatRoomId?: () => void;
  initialOpenMessageId?: string | null;
  initialOpenPostId?: string | null;
  onConsumeOpenPostId?: () => void;
  onOpenApproval?: () => void;
  initialApprovalIntent?: string | null;
  onConsumeApprovalIntent?: () => void;
  initialInventoryWorkflowApprovalId?: string | null;
  onConsumeInitialInventoryWorkflowApprovalId?: () => void;
  setMainMenu?: (v: string) => void;
  onOpenChatMessage?: (roomId: string, messageId: string) => void;
}

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
  onOpenApproval,
  initialApprovalIntent,
  onConsumeApprovalIntent,
  initialInventoryWorkflowApprovalId,
  onConsumeInitialInventoryWorkflowApprovalId,
  setMainMenu,
  onOpenChatMessage,
}: MainContentProps) {
  const [annualLeaveNotice, setAnnualLeaveNotice] = useState<{ remaining: number; total: number } | null>(null);

  useEffect(() => {
    const checkNotifications = async () => {
      if (!user?.id) return;

      const { data: staff } = await supabase
        .from('staff_members')
        .select('annual_leave_total, annual_leave_used')
        .eq('id', user.id)
        .single();

      if (!staff) return;

      const remaining = (staff.annual_leave_total || 0) - (staff.annual_leave_used || 0);
      const currentMonth = new Date().getMonth() + 1;
      if (remaining > 0 && currentMonth >= 7) {
        setAnnualLeaveNotice({ remaining, total: staff.annual_leave_total });
      }
    };

    checkNotifications();
  }, [user]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden bg-[var(--page-bg)] pb-[88px] md:pb-0">
      {mainMenu === '내정보' && (
        <div className="w-full min-h-0 flex-1 overflow-x-hidden" data-testid="mypage-view">
          <MyPage
            user={user}
            initialMyPageTab={initialMyPageTab}
            onConsumeMyPageInitialTab={onConsumeMyPageInitialTab}
            onOpenApproval={onOpenApproval}
            setMainMenu={setMainMenu}
            onOpenChatMessage={onOpenChatMessage}
          />
        </div>
      )}

      {mainMenu === '조직도' && (
        <div className="min-h-0 flex-1 overflow-x-hidden" data-testid="org-view">
          <OrgChart user={user} staffs={data.staffs} depts={data.depts} selectedCo={selectedCo} setSelectedCo={setSelectedCo} />
        </div>
      )}

      {mainMenu === '채팅' && (
        <div className="z-20 min-h-0 flex-1 overflow-hidden bg-[var(--card)]">
          <ChatView
            user={user}
            onRefresh={onRefresh}
            staffs={data.staffs}
            initialOpenChatRoomId={initialOpenChatRoomId}
            initialOpenMessageId={initialOpenMessageId}
            onConsumeOpenChatRoomId={onConsumeOpenChatRoomId}
          />
        </div>
      )}

      {mainMenu === '게시판' && (
        <div className="min-h-0 flex-1 overflow-x-hidden">
          <BoardView
            user={user}
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

      {mainMenu === '전자결재' && (
        <div className="min-h-0 flex-1 overflow-x-hidden">
          <ApprovalView
            user={user}
            staffs={data.staffs}
            selectedCo={selectedCo ?? '전체'}
            setSelectedCo={setSelectedCo ? (co: string) => setSelectedCo(co) : () => {}}
            selectedCompanyId={selectedCompanyId}
            onRefresh={onRefresh}
            initialView={subView}
            onViewChange={setSubView}
            initialComposeRequest={initialApprovalIntent as Record<string, unknown> | null | undefined}
            onConsumeComposeRequest={onConsumeApprovalIntent}
          />
        </div>
      )}

      {mainMenu === '인사관리' && (
        <div className="min-h-0 flex-1 overflow-x-hidden" data-testid="hr-view">
          <HRView
            user={user}
            staffs={data.staffs}
            depts={data.depts as unknown as Record<string, unknown>[]}
            selectedCo={selectedCo ?? undefined}
            onRefresh={onRefresh}
            initialMenu={subView}
          />
        </div>
      )}

      {mainMenu === '재고관리' && (
        <div className="min-h-0 flex-1 overflow-x-hidden">
          <InventoryView
            user={user as never}
            depts={data.depts}
            onRefresh={onRefresh}
            selectedCo={selectedCo ?? undefined}
            selectedCompanyId={selectedCompanyId}
            initialView={subView}
            onViewChange={setSubView}
            initialWorkflowApprovalId={initialInventoryWorkflowApprovalId}
            onConsumeInitialWorkflowApprovalId={onConsumeInitialInventoryWorkflowApprovalId}
          />
        </div>
      )}

      {mainMenu === '추가기능' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden" data-testid="extra-view">
          <추가기능
            user={user}
            staffs={data.staffs}
            posts={data.posts}
            onSearchSelect={(type: string) => {
              if (type === 'staff') setMainMenu?.(normalizeMainMenuForUser(user, '조직도'));
              else if (type === 'post') setMainMenu?.('게시판');
              else if (type === 'approval') setMainMenu?.('전자결재');
              else if (type === 'message') setMainMenu?.('채팅');
            }}
            onOpenOrgChart={() => setMainMenu?.(normalizeMainMenuForUser(user, '조직도'))}
          />
        </div>
      )}

      {mainMenu === '관리자' && (
        <div className="min-h-0 flex-1 overflow-x-hidden">
          <AdminView user={user} staffs={data.staffs} depts={data.depts} onRefresh={onRefresh} initialTab={subView} />
        </div>
      )}

      {annualLeaveNotice && (
        <div className="fixed bottom-28 left-4 right-4 z-[9998] animate-in slide-in-from-bottom-10 md:bottom-10 md:left-auto md:right-10">
          <div className="w-full space-y-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.08)] md:w-80 md:p-5">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold tracking-tight text-[var(--foreground)]">연차 사용 촉진 알림</h3>
              <button
                type="button"
                onClick={() => setAnnualLeaveNotice(null)}
                className="text-xl text-[var(--toss-gray-3)] hover:text-[var(--foreground)]"
              >
                ×
              </button>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[#FFE4A0] bg-[#FFF8E6] p-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#F59E0B]">법적 준수 안내</p>
              <p className="text-xs font-medium leading-relaxed text-[var(--toss-gray-4)]">
                {user?.name}님의 현재 잔여 연차는 <span className="font-bold text-[#F59E0B]">{annualLeaveNotice.remaining}일</span> 입니다.
                근로기준법 제61조에 따라 연차 사용을 권고드립니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAnnualLeaveNotice(null)}
              className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] py-4 text-[13px] font-semibold text-white transition-all hover:bg-[var(--accent)]"
            >
              확인했습니다
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

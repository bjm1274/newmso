'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { normalizeMainMenuForUser } from '@/lib/access-control';
import { supabase } from '@/lib/supabase';
import type { ErpUser, ERPData, StaffMember } from '@/types';

const prefetchedMainMenuModules = new Set<string>();

const loadOrgChartView = () => import('./OrgChart');
const loadMyPageView = () => import('../마이페이지');
const loadNotificationInboxView = () => import('../알림인박스');
const loadChatView = () => import('../메신저');
const loadBoardView = () => import('../게시판');
const loadApprovalView = () => import('../전자결재');
const loadHRView = () => import('../인사관리');
const loadInventoryView = () => import('../재고관리_통합완성');
const loadAdminView = () => import('../관리자전용');
const loadExtraFeaturesView = () => import('../추가기능');

const OrgChart = dynamic(loadOrgChartView, {
  ssr: false,
  loading: () => <MenuViewLoading label="조직도" />,
});
const MyPage = dynamic(loadMyPageView, {
  ssr: false,
  loading: () => <MenuViewLoading label="내정보" />,
});
const NotificationInbox = dynamic(loadNotificationInboxView, {
  ssr: false,
  loading: () => <MenuViewLoading label="알림" />,
});
const ChatView = dynamic(loadChatView, {
  ssr: false,
  loading: () => <MenuViewLoading label="채팅" />,
});
const BoardView = dynamic(loadBoardView, {
  ssr: false,
  loading: () => <MenuViewLoading label="게시판" />,
});
const ApprovalView = dynamic(loadApprovalView, {
  ssr: false,
  loading: () => <MenuViewLoading label="전자결재" />,
});
const HRView = dynamic(loadHRView, {
  ssr: false,
  loading: () => <MenuViewLoading label="인사관리" />,
});
const InventoryView = dynamic(loadInventoryView, {
  ssr: false,
  loading: () => <MenuViewLoading label="재고관리" />,
});
const AdminView = dynamic(loadAdminView, {
  ssr: false,
  loading: () => <MenuViewLoading label="관리자" />,
});
const ExtraFeatures = dynamic(loadExtraFeaturesView, {
  ssr: false,
  loading: () => <MenuViewLoading label="추가기능" />,
});

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
  chatListResetToken?: number;
  initialOpenChatRoomId?: string | null;
  onConsumeOpenChatRoomId?: () => void;
  initialOpenMessageId?: string | null;
  initialOpenPostId?: string | null;
  onConsumeOpenPostId?: () => void;
  onOpenApproval?: (intent?: Record<string, unknown>) => void;
  initialApprovalIntent?: Record<string, unknown> | null;
  onConsumeApprovalIntent?: () => void;
  initialInventoryWorkflowApprovalId?: string | null;
  onConsumeInitialInventoryWorkflowApprovalId?: () => void;
  setMainMenu?: (v: string) => void;
  onOpenChatMessage?: (roomId: string, messageId: string) => void;
  shareTarget?: { id: string; fileCount: number; text: string | null; url: string | null; title: string | null } | null;
  onConsumeShareTarget?: () => void;
}

function MenuViewLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-[var(--foreground)]">{label} 불러오는 중</p>
          <p className="text-xs font-medium text-[var(--toss-gray-3)]">필요한 화면만 로드해서 더 빠르게 열고 있습니다.</p>
        </div>
      </div>
    </div>
  );
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
  chatListResetToken,
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
  shareTarget,
  onConsumeShareTarget,
}: MainContentProps) {
  const [annualLeaveNotice, setAnnualLeaveNotice] = useState<{ remaining: number; total: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loaderEntries: Array<[string, () => Promise<unknown>]> = [
      ['내정보', loadMyPageView],
      ['알림', loadNotificationInboxView],
      ['조직도', loadOrgChartView],
      ['채팅', loadChatView],
      ['게시판', loadBoardView],
    ];

    if (normalizeMainMenuForUser(user, '전자결재') === '전자결재') {
      loaderEntries.push(['전자결재', loadApprovalView]);
    }

    if (normalizeMainMenuForUser(user, '인사관리') === '인사관리') {
      loaderEntries.push(['인사관리', loadHRView]);
    }

    if (normalizeMainMenuForUser(user, '재고관리') === '재고관리') {
      loaderEntries.push(['재고관리', loadInventoryView]);
    }

    if (normalizeMainMenuForUser(user, '추가기능') === '추가기능') {
      loaderEntries.push(['추가기능', loadExtraFeaturesView]);
    }

    if (normalizeMainMenuForUser(user, '관리자') === '관리자') {
      loaderEntries.push(['관리자', loadAdminView]);
    }

    const pendingLoaders = loaderEntries.filter(([key]) => !prefetchedMainMenuModules.has(key));
    if (pendingLoaders.length === 0) return;

    const idleWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    let cancelled = false;
    let timeoutId: number | null = null;

    const prefetchNext = (index: number) => {
      if (cancelled || index >= pendingLoaders.length) {
        return;
      }

      const [key, loader] = pendingLoaders[index];
      prefetchedMainMenuModules.add(key);
      void loader().finally(() => {
        if (cancelled) return;
        timeoutId = window.setTimeout(() => prefetchNext(index + 1), 120);
      });
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(() => {
        prefetchNext(0);
      });

      return () => {
        cancelled = true;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        if (typeof idleWindow.cancelIdleCallback === 'function') {
          idleWindow.cancelIdleCallback(idleId);
        }
      };
    }

    timeoutId = window.setTimeout(() => prefetchNext(0), 300);
    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [user]);

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

    void checkNotifications();
  }, [user]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--page-bg)] pb-[88px] md:pb-0">
      {mainMenu === '내정보' && (
        <div className="w-full min-h-0 flex-1 overflow-x-hidden" data-testid="mypage-view">
          <MyPage
            user={user}
            initialMyPageTab={initialMyPageTab}
            onConsumeMyPageInitialTab={onConsumeMyPageInitialTab}
            onOpenApproval={onOpenApproval}
            setMainMenu={setMainMenu}
            onOpenChatMessage={onOpenChatMessage}
            selectedCo={selectedCo}
            selectedCompanyId={selectedCompanyId}
          />
        </div>
      )}

      {mainMenu === '알림' && (
        <div className="w-full min-h-0 flex-1 overflow-x-hidden" data-testid="notifications-view">
          <NotificationInbox user={user} onRefresh={() => {}} />
        </div>
      )}

      {mainMenu === '조직도' && (
        <div className="min-h-0 flex-1 overflow-x-hidden" data-testid="org-view">
          <OrgChart
            user={user}
            staffs={data.staffs}
            depts={data.depts}
            selectedCo={selectedCo}
            setSelectedCo={setSelectedCo}
          />
        </div>
      )}

      {mainMenu === '채팅' && (
        <div className="z-20 min-h-0 flex-1 flex flex-col overflow-hidden bg-[var(--card)]">
          <ChatView
            user={user}
            onRefresh={onRefresh}
            staffs={data.staffs}
            chatListResetToken={chatListResetToken}
            initialOpenChatRoomId={initialOpenChatRoomId}
            initialOpenMessageId={initialOpenMessageId}
            onConsumeOpenChatRoomId={onConsumeOpenChatRoomId}
            shareTarget={shareTarget}
            onConsumeShareTarget={onConsumeShareTarget}
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
            staffs={data.staffs}
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
          <ExtraFeatures
            user={user}
            staffs={data.staffs}
            posts={data.posts}
            selectedCo={selectedCo}
            selectedCompanyId={selectedCompanyId}
            onSearchSelect={(type: string) => {
              if (type === 'staff') setMainMenu?.(normalizeMainMenuForUser(user, '조직도'));
              else if (type === 'post') setMainMenu?.('게시판');
              else if (type === 'approval') setMainMenu?.('전자결재');
              else if (type === 'message') setMainMenu?.('채팅');
            }}
          />
        </div>
      )}

      {mainMenu === '관리자' && (
        <div className="min-h-0 flex-1 overflow-x-hidden">
          <AdminView
            user={user}
            staffs={data.staffs}
            depts={data.depts}
            onRefresh={onRefresh}
            initialTab={subView}
            onOpenApproval={onOpenApproval}
          />
        </div>
      )}

      {annualLeaveNotice && (
        <div className="fixed bottom-28 left-4 right-4 z-[9998] animate-slide-up md:bottom-10 md:left-auto md:right-10">
          <div className="w-full space-y-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-lg)] md:w-80 md:p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-bold tracking-tight text-[var(--foreground)]">연차 사용 촉진 알림</h3>
              <button
                type="button"
                onClick={() => setAnnualLeaveNotice(null)}
                className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors text-base"
              >
                ×
              </button>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[#FFE4A0] bg-[#FFF8E6] p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#D97706]">법적 준수 안내</p>
              <p className="text-[12px] font-medium leading-relaxed text-[var(--toss-gray-4)]">
                {user?.name}님의 현재 잔여 연차는 <span className="font-bold text-[#D97706]">{annualLeaveNotice.remaining}일</span>입니다.
                근로기준법 제61조에 따라 연차 사용을 권고드립니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAnnualLeaveNotice(null)}
              className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] py-2.5 text-[13px] font-semibold text-white transition-all duration-150 hover:bg-[var(--accent-hover)] active:scale-[0.98]"
            >
              확인했습니다
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

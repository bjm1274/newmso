'use client';

/**
 * MobileShell — 모바일 진입점.
 *   - .mso-mobile 컨테이너 (토큰 + 폰트 + 다크모드 클래스)
 *   - 9탭 라우트 상태 (tab + sub) + 바텀탭 + 화면 라우터
 * isMobile=true일 때 page.tsx가 PC 셸 대신 이걸 렌더.
 *
 * iOS 상태바(시계) 침범 원천 차단:
 *   tokens.css 의 .mso-mobile { top: env(safe-area-inset-top); transform: translateZ(0) }
 *   → 셸 전체가 시계 아래에서 시작, fixed 자손도 이 박스 기준.
 *   개별 화면에 safe-area-inset-top 패딩을 또 더하지 말 것.
 */

import { useEffect, useState, useCallback } from 'react';
import type { ErpUser } from '@/types';
import '../tokens.css';
import MobileBottomTab from './MobileBottomTab';
import type { MRoute, MTab, MHomeSub } from './m-routes';
import 알림탭 from '../내정보/알림탭';
import 내정보 from '../내정보';
import 추가기능 from '../추가기능';
import 채팅 from '../채팅';
import 게시판 from '../게시판';
import 결재 from '../결재';
import 인사관리 from '../인사관리';
import 재고관리 from '../재고';
import 관리자 from '../관리자';
import 오프라인배너 from '../공통/오프라인배너';
import 오프라인실패배너 from '../공통/오프라인실패배너';
import { initUploadQueueFlush } from '@/lib/offline-upload-queue';
import { useChatRoomsForMobile } from '../채팅/data-hooks';
import { useNavigation } from '../../contexts/NavigationContext';
import { db } from '@/lib/db-client';
import { completeContractSigning } from '@/lib/contract-sign-complete';
import { toast } from '@/lib/toast';
import { canAccessMainMenu } from '@/lib/access-control';
import { useVisualViewportOffset } from '@/app/hooks/useVisualViewportOffset';
import ContractSignatureModal from '@/app/main/기능부품/인사관리서브/계약문서/전자서명모달';
import {
  countUnreadNotifications,
  fetchUnreadNotificationCount,
  NOTIFICATION_LIST_UPDATED_EVENT,
  NOTIFICATION_READ_EVENT } from '@/app/main/기능부품/알림시스템/notification-api';
import { useResolvedStaffId } from '@/lib/use-resolved-staff-id';

export type MobileShellProps = {
  user: ErpUser;
  onLogout: () => void;
  initialOpenPostId?: string | null;
  onConsumeOpenPostId?: () => void;
  onOpenBoardPost?: (boardId: string, postId: string) => void;
  /** 푸시/알림 딥링크 — PC 메신저와 동일 계약 */
  initialOpenChatRoomId?: string | null;
  initialOpenMessageId?: string | null;
  initialOpenChatRequestToken?: number;
  onConsumeOpenChatRoomId?: () => void;
  initialApprovalIntent?: {
    approvalId?: string | null;
    viewMode?: string | null;
    formType?: string | null;
    extraData?: Record<string, unknown>;
  } | null;
  onConsumeApprovalIntent?: () => void;
  initialInventoryWorkflowApprovalId?: string | null;
  shareTarget?: {
    id: string;
    fileCount: number;
    text: string | null;
    url: string | null;
    title: string | null;
  } | null;
  onConsumeShareTarget?: () => void;
};

export default function MobileShell({ 
  user, 
  onLogout,
  initialOpenPostId,
  onConsumeOpenPostId,
  onOpenBoardPost,
  initialOpenChatRoomId = null,
  initialOpenMessageId = null,
  initialOpenChatRequestToken = 0,
  onConsumeOpenChatRoomId,
  initialApprovalIntent = null,
  onConsumeApprovalIntent,
  initialInventoryWorkflowApprovalId = null,
  shareTarget = null,
  onConsumeShareTarget,
}: MobileShellProps) {
  const { mainMenu, setMainMenu, subView, setSubView } = useNavigation();

  const getTabFromMenu = (menu: string): MTab => {
    const menuMap: Record<string, MTab> = {
      '알림': 'notif', 'notif': 'notif',
      '내정보': 'mypage', 'mypage': 'mypage',
      '추가기능': 'addon', 'addon': 'addon', 'extra': 'addon',
      '채팅': 'chat', 'chat': 'chat',
      '게시판': 'board', 'board': 'board',
      '전자결재': 'approval', 'approval': 'approval',
      '인사관리': 'hr', 'hr': 'hr',
      '재고관리': 'stock', 'stock': 'stock', 'inventory': 'stock',
      '관리자': 'admin', 'admin': 'admin'
    };
    return menuMap[menu] || 'mypage';
  };

  const [route, setRoute] = useState<MRoute>(() => {
    if (initialOpenChatRoomId) {
      const roomId = String(initialOpenChatRoomId).trim();
      const msgId = initialOpenMessageId ? String(initialOpenMessageId).trim() : '';
      return { tab: 'chat', sub: msgId ? `room:${roomId}:${msgId}` : `room:${roomId}` } as MRoute;
    }
    if (initialApprovalIntent?.approvalId) {
      return { tab: 'approval', sub: `detail:${initialApprovalIntent.approvalId}` } as MRoute;
    }
    return { tab: getTabFromMenu(mainMenu) };
  });
  const [dark, setDark] = useState(false);
  const [chatResetToken, setChatResetToken] = useState(0);
  const [deepLinkRoomId, setDeepLinkRoomId] = useState<string | null>(() => (initialOpenChatRoomId ? String(initialOpenChatRoomId).trim() : null));
  const [deepLinkMessageId, setDeepLinkMessageId] = useState<string | null>(() => (initialOpenMessageId ? String(initialOpenMessageId).trim() : null));

  // 푸시·알림 배너 딥링크 → 채팅 탭 + room 오픈
  useEffect(() => {
    if (!initialOpenChatRoomId) return;
    const roomId = String(initialOpenChatRoomId).trim();
    if (!roomId) return;
    const msgId = initialOpenMessageId ? String(initialOpenMessageId).trim() : '';
    setDeepLinkRoomId(roomId);
    setDeepLinkMessageId(msgId || null);
    setRoute({ tab: 'chat', sub: msgId ? `room:${roomId}:${msgId}` : `room:${roomId}` } as MRoute);
    if (setMainMenu) setMainMenu('채팅');
    if (setSubView) setSubView(msgId ? `room:${roomId}:${msgId}` : `room:${roomId}`);
    onConsumeOpenChatRoomId?.();
  }, [initialOpenChatRoomId, initialOpenMessageId, initialOpenChatRequestToken, onConsumeOpenChatRoomId, setMainMenu, setSubView]);

  // 전자결재 딥링크 → approval 탭 + 상세 또는 작성 화면 오픈
  useEffect(() => {
    if (!initialApprovalIntent) return;
    const { approvalId, viewMode, formType } = initialApprovalIntent;
    if (approvalId) {
      setRoute({ tab: 'approval', sub: `detail:${approvalId}` } as MRoute);
    } else if (formType === '연차' || formType === 'leave') {
      setRoute({ tab: 'approval', sub: 'compose:leave' } as MRoute);
    } else if (formType === '연차계획서' || formType === 'annual_plan') {
      setRoute({ tab: 'approval', sub: 'compose:annual_plan' } as MRoute);
    } else if (formType === '연차촉진통보서' || formType === 'leave_promotion_notice') {
      setRoute({ tab: 'approval', sub: 'compose:leave_promotion_notice' } as MRoute);
    } else if (viewMode) {
      const viewMap: Record<string, string> = {
        결재함: 'inbox',
        기안함: 'sent',
        참조함: 'ref',
        문서조회: 'docs',
        작성하기: 'write',
      };
      setRoute({ tab: 'approval', sub: viewMap[viewMode] || viewMode } as MRoute);
    } else {
      setRoute({ tab: 'approval', sub: 'inbox' } as MRoute);
    }
    if (setMainMenu) setMainMenu('전자결재');
  }, [initialApprovalIntent, setMainMenu]);

  // share-target: 채팅 탭으로 유도 (파일 공유는 채팅 목록에서 처리)
  useEffect(() => {
    if (!shareTarget) return;
    setRoute({ tab: 'chat' } as MRoute);
    if (setMainMenu) setMainMenu('채팅');
    onConsumeShareTarget?.();
  }, [shareTarget, onConsumeShareTarget, setMainMenu]);
  const resolvedStaffId = useResolvedStaffId(user as Record<string, unknown>);

  const [pendingContract, setPendingContract] = useState<any | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  const checkPendingContracts = useCallback(async (targetContractId?: string) => {
    if (!resolvedStaffId) return;
    try {
      let query = db
        .from('employment_contracts')
        .select('*')
        .eq('staff_id', resolvedStaffId);

      if (targetContractId) {
        query = query.eq('id', targetContractId);
      } else {
        query = query
          .eq('status', '서명대기')
          .order('requested_at', { ascending: false })
          .limit(1);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;

      if (data) {
        setPendingContract(data);
        setShowSignaturePad(true);
      } else {
        setPendingContract(null);
        setShowSignaturePad(false);
      }
    } catch (e) {
      console.error('[mobile-hr] checkPendingContracts failed', e);
    }
  }, [resolvedStaffId]);

  useEffect(() => {
    void checkPendingContracts();
  }, [checkPendingContracts]);

  useEffect(() => {
    const handleTriggerSignature = (event?: Event) => {
      const detail = (event as CustomEvent<{ contractId?: string }>)?.detail;
      void checkPendingContracts(detail?.contractId);
    };
    window.addEventListener('erp-mobile-trigger-signature', handleTriggerSignature);
    return () => {
      window.removeEventListener('erp-mobile-trigger-signature', handleTriggerSignature);
    };
  }, [checkPendingContracts]);

  const handleSignComplete = async (
    signatureDataUrl: string,
    contractText: string,
    receiptSignatureData?: string,
    privacyConsent?: boolean | null
  ) => {
    const currentUserId = resolvedStaffId;
    if (!pendingContract || !currentUserId) return;
    try {
      // 문서 보관함 선저장 → 실패 시 계약 상태 미변경 (부분 성공 트랩 방지)
      // 저장·상태변경은 PC 마이페이지와 공용 (lib/contract-sign-complete.ts)
      const signedAt = new Date().toISOString();
      await completeContractSigning({
        contractId: pendingContract.id,
        staffId: currentUserId,
        staffName: String(user?.name ?? ''),
        companyName: (user?.company as string) || '전체',
        contractText,
        signatureDataUrl,
        receiptSignatureData,
        privacyConsent,
        signedAt });

      const { data: checklistRows } = await db
        .from('onboarding_checklists')
        .select('id, checklist_type, items, target_date')
        .eq('staff_id', currentUserId);

      const { isChecklistComplete, normalizeChecklistItems, syncChecklistWithContract } = await import('@/lib/hr-checklists');
      const entryChecklistRow = Array.isArray(checklistRows)
        ? checklistRows.find((row) => String(row?.checklist_type ?? '').trim() === '입사') ?? null
        : null;
      const syncedItems = syncChecklistWithContract(
        normalizeChecklistItems(entryChecklistRow?.items ?? null, '입사'),
        '입사',
        {
          status: '서명완료',
          requestedAt: (pendingContract.requested_at as string) || null,
          signedAt },
      );
      const { error: checklistError } = await db.from('onboarding_checklists').upsert(
        {
          staff_id: currentUserId,
          checklist_type: '입사',
          items: syncedItems,
          target_date: entryChecklistRow?.target_date ?? null,
          completed_at: isChecklistComplete(syncedItems) ? signedAt : null },
        { onConflict: 'staff_id,checklist_type' },
      );

      if (checklistError) {
        console.warn('[모바일셸] 온보딩 체크리스트 업데이트 실패(서명·문서는 완료):', checklistError.message);
      }

      // HR에게 알림 전송
      try {
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'SUCCESS',
            title: '계약서 서명 완료',
            body: `${user?.name} 님이 근로계약서에 전자서명을 완료했습니다.`,
            metadata: { dedupe_key: `contract-signed:${pendingContract.id}` } }),
        });
      } catch {}

      toast('근로계약서 서명이 성공적으로 완료되었습니다. 마이페이지 > 급여·증명서 또는 문서보관함에서 확인하실 수 있습니다.', 'success');
      window.dispatchEvent(new CustomEvent('erp-contract-signed', { detail: { staffId: resolvedStaffId, contractId: pendingContract.id } }));
      setPendingContract(null);
      setShowSignaturePad(false);
    } catch (e) {
      console.error('[모바일셸] 근로계약서 서명 저장 실패:', e);
      toast(e instanceof Error ? e.message : '서명 저장 중 오류가 발생했습니다.', 'error');
    }
  };

  const userId = resolvedStaffId;
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const { rooms, loading: roomsLoading, refresh: refreshRooms } = useChatRoomsForMobile(userId, activeRoomId);
  const totalUnread = rooms.reduce((sum, r) => sum + (r.unread_count || 0), 0);
  const [notificationUnread, setNotificationUnread] = useState(0);

  const refreshNotificationUnread = useCallback(async () => {
    if (!userId) {
      setNotificationUnread(0);
      return;
    }
    try {
      setNotificationUnread(await fetchUnreadNotificationCount());
    } catch {
      // 알림시스템의 다음 broadcast 또는 visibility 복귀에서 다시 보정한다.
    }
  }, [userId]);

  useEffect(() => {
    void refreshNotificationUnread();
    if (typeof window === 'undefined') return;

    const handleListUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ notifications?: unknown }>).detail;
      if (Array.isArray(detail?.notifications)) {
        setNotificationUnread(countUnreadNotifications(detail.notifications as Array<{ read_at?: unknown }>));
        return;
      }
      void refreshNotificationUnread();
    };
    const handleRefresh = () => {
      void refreshNotificationUnread();
    };
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void refreshNotificationUnread();
    };

    window.addEventListener(NOTIFICATION_LIST_UPDATED_EVENT, handleListUpdated as EventListener);
    window.addEventListener(NOTIFICATION_READ_EVENT, handleRefresh);
    window.addEventListener('erp-new-notification', handleRefresh);
    window.addEventListener('focus', handleRefresh);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener(NOTIFICATION_LIST_UPDATED_EVENT, handleListUpdated as EventListener);
      window.removeEventListener(NOTIFICATION_READ_EVENT, handleRefresh);
      window.removeEventListener('erp-new-notification', handleRefresh);
      window.removeEventListener('focus', handleRefresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshNotificationUnread]);

  // Synchronize route.tab when global mainMenu changes
  useEffect(() => {
    const targetTab = getTabFromMenu(mainMenu);
    const routeSub = 'sub' in route ? (route as any).sub : undefined;
    // 내정보(mypage/home) 탭 및 채팅(chat) 탭의 sub은 모바일 전용 네임스페이스(room:..., attend 등)로,
    // PC용 전역 subView(기본값 '전체' 등)와 무관하다. 전역 subView로 덮어쓰지 않도록 예외 처리.
    if (targetTab === 'mypage' || targetTab === 'chat') {
      if (targetTab !== route.tab) {
        setRoute({
          tab: targetTab,
          sub: targetTab === 'chat' && subView && String(subView).startsWith('room:') ? subView : undefined,
        } as any);
      }
      return;
    }
    if (targetTab !== route.tab || (subView && subView !== routeSub)) {
      setRoute({ tab: targetTab, sub: subView || undefined } as any);
    }
  }, [mainMenu, subView, route.tab, route]);

  // URL query parameter synchronization on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const menu = params.get('open_menu');
    const board = params.get('open_board');
    if (menu) {
      const targetTab = getTabFromMenu(menu);
      setRoute({ tab: targetTab });
      if (setMainMenu) {
        setMainMenu(menu);
      }
      if (targetTab === 'board' && board && setSubView) {
        setSubView(board);
      }
    }
  }, [setMainMenu, setSubView]);

  // 시스템 다크모드 동기화
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    setDark(mql.matches);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // 오프라인 D1 큐 flush는 전역 PwaBootstrap(resolveQueueEndpoint → /api/d1/mutate)이 담당.
  // 여기서 중복 startAutoFlush 등록하면 동일 항목이 두 번 apply 될 수 있음.

  // 업로드 큐 자동 flush 초기화 (앱 마운트 시 1회)
  useEffect(() => {
    const stop = initUploadQueueFlush();
    return stop;
  }, []);

  const switchTab = (tab: MTab, sub?: string) => {
    const menuMap: Record<MTab, string> = {
      notif: '알림',
      mypage: '내정보',
      addon: '추가기능',
      chat: '채팅',
      board: '게시판',
      approval: '전자결재',
      hr: '인사관리',
      stock: '재고관리',
      admin: '관리자'
    };
    const targetMenu = menuMap[tab];
    // 바텀탭과 동일 권한 게이트
    if (targetMenu && !canAccessMainMenu(user, targetMenu)) {
      toast('해당 메뉴에 접근할 권한이 없습니다.', 'warning');
      return;
    }
    // 동일 탭 재탭 시 목록 리셋 — room: 딥링크 전환은 유지
    if (tab === 'chat' && route.tab === 'chat' && !(sub && sub.startsWith('room:'))) {
      setChatResetToken((prev) => prev + 1);
    }
    setRoute({ tab, sub } as any);
    if (targetMenu && setMainMenu) {
      setMainMenu(targetMenu);
    }
    // 비-mypage 탭은 mainMenu+subView → route 동기화가 있으므로 sub를 전역에도 반영
    if (sub !== undefined && setSubView) {
      setSubView(sub);
    }
  };

  const setHomeSub = (sub: MHomeSub | undefined) => {
    setRoute({ tab: 'mypage', sub });
  };

  const goMypage = () => switchTab('mypage');

  // 소프트 키보드 높이 → sticky foot 전역 상승 (tokens --m-kb-offset)
  const kbOffset = useVisualViewportOffset();
  const containerClass = 'mso-mobile' + (dark ? ' dark' : '');

  return (
    <div
      className={containerClass}
      data-testid="main-shell"
      style={{ ['--m-kb-offset' as string]: `${kbOffset}px` }}
    >
      {pendingContract && showSignaturePad && (
        <ContractSignatureModal
          contract={pendingContract}
          user={user}
          onClose={() => setShowSignaturePad(false)}
          onSuccess={handleSignComplete}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'absolute', inset: 0 }}>
        <div className="m-screen" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <오프라인실패배너 />
          <오프라인배너 />
          {route.tab === 'notif' && <알림탭 user={user} />}
          {route.tab === 'mypage' && (
            <내정보
              user={user}
              sub={route.sub}
              onSub={setHomeSub}
              onLogout={onLogout}
              onSwitchTab={switchTab}
            />
          )}
          {route.tab === 'addon' && (
            <추가기능
              user={user}
              onBack={goMypage}
              initialView={(route as any).sub}
            />
          )}
          {route.tab === 'chat' && (() => {
            const chatSub = typeof (route as { sub?: string }).sub === 'string'
              ? (route as { sub?: string }).sub
              : undefined;
            let initialRoomId: string | null = deepLinkRoomId;
            let initialMessageId: string | null = deepLinkMessageId;
            if (chatSub && chatSub.startsWith('room:')) {
              const parts = chatSub.slice('room:'.length).split(':');
              initialRoomId = parts[0] || initialRoomId;
              initialMessageId = parts[1] || initialMessageId;
            }
            return (
              <채팅
                user={user}
                rooms={rooms}
                roomsLoading={roomsLoading}
                refreshRooms={refreshRooms}
                onActiveRoomChange={(id) => {
                  setActiveRoomId(id);
                  if (id) {
                    setDeepLinkRoomId(null);
                    setDeepLinkMessageId(null);
                  }
                }}
                resetToken={chatResetToken}
                onOpenBoardPost={onOpenBoardPost}
                initialRoomId={initialRoomId}
                initialMessageId={initialMessageId}
                onConsumeInitialRoomId={() => {
                  setDeepLinkRoomId(null);
                  setDeepLinkMessageId(null);
                  if (route.tab === 'chat' && (route as any).sub?.startsWith('room:')) {
                    setRoute({ tab: 'chat' });
                  }
                }}
              />
            );
          })()}
          {route.tab === 'board' && (
            <게시판 
              user={user} 
              onBack={goMypage} 
              subView={subView} 
              setSubView={setSubView} 
              initialPostId={initialOpenPostId}
              onConsumePostId={onConsumeOpenPostId}
            />
          )}
          {route.tab === 'approval' && (
            <div data-testid="approval-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <결재
                user={user}
                sub={(route as any).sub}
                initialApprovalId={initialApprovalIntent?.approvalId}
                initialViewMode={initialApprovalIntent?.viewMode}
                onConsumeApprovalIntent={onConsumeApprovalIntent}
              />
            </div>
          )}
          {route.tab === 'hr' && (
            <div data-testid="hr-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <인사관리 user={user} onExit={goMypage} />
            </div>
          )}
          {route.tab === 'stock' && (
            <div data-testid="inventory-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <재고관리 user={user} onBack={goMypage} />
            </div>
          )}
          {route.tab === 'admin' && (
            <div data-testid="admin-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <관리자 user={user} onBack={goMypage} />
            </div>
          )}
        </div>
        {!activeRoomId && (
          <MobileBottomTab
            active={route.tab}
            onChange={switchTab}
            user={user}
            badges={{ chat: totalUnread, notif: notificationUnread }}
          />
        )}
      </div>
    </div>
  );
}

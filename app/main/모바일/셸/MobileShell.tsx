'use client';

/**
 * MobileShell — 모바일 진입점.
 *   - .mso-mobile 컨테이너 (토큰 + 폰트 + 다크모드 클래스)
 *   - 9탭 라우트 상태 (tab + sub) + 바텀탭 + 화면 라우터
 * isMobile=true일 때 page.tsx가 PC 셸 대신 이걸 렌더.
 * JM: 단일 책임 (라우팅), ~120줄
 * JM2: route는 단일 useState — 불필요한 리렌더 방지
 * JM6: aria-live 등은 자식 화면에서 처리
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
import { initOfflineQueueFlush } from '@/lib/offline-queue-d1';
import { initUploadQueueFlush } from '@/lib/offline-upload-queue';
import { useChatRoomsForMobile } from '../채팅/data-hooks';
import { useNavigation } from '../../contexts/NavigationContext';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { sendAdminNotifications } from '@/lib/notification-utils';
import ContractSignatureModal from '@/app/main/기능부품/인사관리서브/계약문서/전자서명모달';
import {
  countUnreadNotifications,
  fetchUnreadNotificationCount,
  NOTIFICATION_LIST_UPDATED_EVENT,
  NOTIFICATION_READ_EVENT } from '@/app/main/기능부품/알림시스템/notification-api';

export type MobileShellProps = {
  user: ErpUser;
  onLogout: () => void;
  initialOpenPostId?: string | null;
  onConsumeOpenPostId?: () => void;
  onOpenBoardPost?: (boardId: string, postId: string) => void;
};

export default function MobileShell({ 
  user, 
  onLogout,
  initialOpenPostId,
  onConsumeOpenPostId,
  onOpenBoardPost
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

  const [route, setRoute] = useState<MRoute>(() => ({
    tab: getTabFromMenu(mainMenu)
  }));
  const [dark, setDark] = useState(false);
  const [chatResetToken, setChatResetToken] = useState(0);

  const [pendingContract, setPendingContract] = useState<any | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  const checkPendingContracts = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await db
        .from('employment_contracts')
        .select('*')
        .eq('staff_id', user.id as string)
        .eq('status', '서명대기')
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();

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
  }, [user?.id]);

  useEffect(() => {
    void checkPendingContracts();
  }, [checkPendingContracts]);

  useEffect(() => {
    const handleTriggerSignature = () => {
      void checkPendingContracts();
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
    const currentUserId = typeof user?.id === 'string' ? user.id : null;
    if (!pendingContract || !currentUserId) return;
    try {
      const { error: updateError } = await db
        .from('employment_contracts')
        .update({
          status: '서명완료',
          signed_at: new Date().toISOString(),
          signature_data: signatureDataUrl,
          receipt_signature_data: receiptSignatureData || null,
          privacy_consent: privacyConsent === true ? 1 : (privacyConsent === false ? 0 : null)
        })
        .eq('id', pendingContract.id);

      if (updateError) {
        throw new Error(`계약서 상태 업데이트 실패: ${updateError.message}`);
      }

      const { data: checklistRows } = await db
        .from('onboarding_checklists')
        .select('id, checklist_type, items, target_date')
        .eq('staff_id', currentUserId);

      const { isChecklistComplete, normalizeChecklistItems, syncChecklistWithContract } = await import('@/lib/hr-checklists');
      const entryChecklistRow = Array.isArray(checklistRows)
        ? checklistRows.find((row) => String(row?.checklist_type ?? '').trim() === '입사') ?? null
        : null;
      const signedAt = new Date().toISOString();
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
        throw new Error(`온보딩 체크리스트 업데이트 실패: ${checklistError.message}`);
      }

      // 문서 보관함으로 자동 저장 (PDF는 보관함에서 열 때 생성됨)
      const { encryptContract } = await import('@/lib/contract-crypto');
      const encryptedContractText = await encryptContract(contractText);
      const { error: insertDocError } = await db.from('document_repository').insert({
        title: `${user?.name} 근로계약서 (${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })})`,
        // 문서보관함 정식 분류 SSOT — '계약서' 별칭은 폴더 매칭 실패 원인
        category: '근로계약서',
        content: encryptedContractText,
        company_name: (user?.company as string) || '전체',
        created_by: currentUserId,
        version: 1
      });

      if (insertDocError) {
        throw new Error(`문서 보관함 저장 실패: ${insertDocError.message}`);
      }

      // HR에게 알림 전송 — [4차 전수조사 admin-05] FK 위반하는 user_id='system_admin'
      // 대신 HR 담당 부서 staff fan-out + dedupe 공통 헬퍼 사용.
      await sendAdminNotifications([{
        type: 'SUCCESS',
        title: '계약서 서명 완료',
        body: `${user?.name} 님이 근로계약서에 전자서명을 완료했습니다.`,
        dedupeKey: `contract-signed:${pendingContract.id}` }]);

      toast('근로계약서 서명이 성공적으로 완료되었습니다. 마이페이지 > 급여·증명서 또는 문서보관함에서 확인하실 수 있습니다.', 'success');
      window.dispatchEvent(new CustomEvent('erp-contract-signed', { detail: { staffId: user?.id, contractId: pendingContract.id } }));
      setPendingContract(null);
      setShowSignaturePad(false);
    } catch (e) {
      console.error('[모바일셸] 근로계약서 서명 저장 실패:', e);
      toast(e instanceof Error ? e.message : '서명 저장 중 오류가 발생했습니다.', 'error');
    }
  };

  const userId = typeof user.id === 'string' ? user.id : null;
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const { rooms, refresh: refreshRooms } = useChatRoomsForMobile(userId, activeRoomId);
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
    // 내정보(mypage/home) 탭의 sub은 모바일 전용 MHomeSub('attend'|'leave'|...) 네임스페이스로,
    // PC용 전역 subView(기본값 '전체')와 무관하다. 전역 subView로 덮어쓰면 출퇴근 등
    // 홈 하위화면 진입 직후 '전체'로 되돌아가 홈으로 튕기므로, mypage 탭은 sub 동기화에서 제외한다.
    if (targetTab === 'mypage') {
      if (targetTab !== route.tab) setRoute({ tab: targetTab });
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

  // 오프라인 큐 자동 flush 초기화 (앱 마운트 시 1회)
  useEffect(() => {
    const stop = initOfflineQueueFlush();
    return stop;
  }, []);

  // 업로드 큐 자동 flush 초기화 (앱 마운트 시 1회)
  useEffect(() => {
    const stop = initUploadQueueFlush();
    return stop;
  }, []);

  const switchTab = (tab: MTab, sub?: string) => {
    if (tab === 'chat' && route.tab === 'chat') {
      setChatResetToken((prev) => prev + 1);
    }
    setRoute({ tab, sub } as any);
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
    if (targetMenu && setMainMenu) {
      setMainMenu(targetMenu);
    }
  };

  const setHomeSub = (sub: MHomeSub | undefined) => {
    setRoute({ tab: 'mypage', sub });
  };

  const goMypage = () => switchTab('mypage');

  const containerClass = 'mso-mobile' + (dark ? ' dark' : '');

  return (
    <div className={containerClass} data-testid="main-shell">
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
          {route.tab === 'chat' && (
            <채팅
              user={user}
              rooms={rooms}
              refreshRooms={refreshRooms}
              onActiveRoomChange={setActiveRoomId}
              resetToken={chatResetToken}
              onOpenBoardPost={onOpenBoardPost}
            />
          )}
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
              <결재 user={user} sub={(route as any).sub} />
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
          <MobileBottomTab active={route.tab} onChange={switchTab} badges={{ chat: totalUnread, notif: notificationUnread }} />
        )}
      </div>
    </div>
  );
}

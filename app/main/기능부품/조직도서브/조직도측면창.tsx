'use client';
import { useState, useRef, useEffect } from 'react';
import GlobalNotificationBell from '@/app/components/GlobalNotificationBell';

const MYPAGE_TAB_KEY = 'erp_mypage_tab';

/** 상세 메뉴가 있는 메뉴 정의 (페이지 우측 본문에서 사용, 전역 상수로 export) */
export const SUB_MENUS: Record<string, { id: string; label: string }[]> = {
  재고관리: [
    { id: 'UDI', label: '📡 UDI' },
    { id: '명세서', label: '📄 명세서' },
    { id: '발주', label: '📝 발주' },
    { id: '스캔', label: '🔍 스캔' },
    { id: '등록', label: '+ 등록' },
    { id: '현황', label: '📊 현황' },
    { id: '이력', label: '📋 이력' },
  ],
  게시판: [
    { id: '공지사항', label: '📢 공지사항' },
    { id: '자유게시판', label: '💬 자유게시판' },
    { id: '경조사', label: '🎉 경조사' },
    { id: '근무현황', label: '👥 근무현황' },
    { id: '수술일정', label: '🏥 수술일정' },
    { id: 'MRI일정', label: '🔬 MRI일정' },
  ],
  전자결재: [
    { id: '기안함', label: '📥 기안함' },
    { id: '결재함', label: '📤 결재함' },
    { id: '작성하기', label: '✍️ 작성하기' },
  ],
  인사관리: [
    { id: '구성원', label: '구성원' },
    { id: '계약', label: '계약' },
    { id: '문서보관함', label: '문서보관함' },
    { id: '교육', label: '교육' },
    { id: '근태', label: '근태' },
    { id: '급여', label: '급여' },
    { id: '연차/휴가', label: '연차/휴가' },
    { id: '캘린더', label: '캘린더' },
    { id: '비품대여', label: '비품대여' },
    { id: '증명서', label: '증명서' },
  ],
  관리자: [
    { id: '경영대시보드', label: '📊 대시보드' },
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
  ],
};

export default function Sidebar({ user, mainMenu, subView, onMenuChange, onOpenNotifications }: any) {

  /* 토스 스타일 통일: 단순 아이콘 + 동일 라운드/색상
   * 조직도는 메인 메뉴에서 제거하고, 추가기능 내부 카드로 진입하도록 구성
   */
  const menus = [
    { id: '내정보', icon: '👤', label: '내 정보' },
    { id: '추가기능', icon: '➕', label: '추가기능' },
    { id: '채팅', icon: '💬', label: '채팅' },
    { id: '게시판', icon: '📌', label: '게시판' },
    { id: '전자결재', icon: '📝', label: '전자결재' },
    { id: '인사관리', icon: '👥', label: '인사관리' },
    { id: '재고관리', icon: '📦', label: '재고관리' },
    { id: '관리자', icon: '⚙️', label: '관리자' }
  ];

  const p = user?.permissions || {};
  const isMso = user?.company === 'SY INC.' || p.mso === true;

  // 좌측 메인 메뉴는 권한과 상관없이 기본적으로 모두 노출하되,
  // 관리자 메뉴만 MSO/관리자 또는 명시적 허용(p.menu_관리자 === true)일 때만 표시.
  const canSeeMenu = (menuId: string) => {
    if (menuId === '관리자') {
      return isMso || user?.role === 'admin' || p.menu_관리자 === true;
    }
    // 개별 메뉴가 명시적으로 false인 경우에만 숨김
    if (p[`menu_${menuId}`] === false) return false;
    return true;
  };

  const visibleMenus = menus.filter(m => canSeeMenu(m.id));

  const primaryMenus = visibleMenus.slice(0, 4);
  const secondaryMenus = visibleMenus.slice(4);

  const handleMenuClick = (menuId: string, subId?: string) => {
    if (menuId === '내정보') {
      try {
        if (typeof window !== 'undefined') window.localStorage.removeItem(MYPAGE_TAB_KEY);
      } catch { /* ignore */ }
    }
    onMenuChange(menuId, subId);
  };

  return (
    <>
      {/* PC 사이드바 — 알림 상단, 메뉴 아래. 클릭 시 해당 메뉴로 이동 (서브메뉴는 본문 영역에서 별도 표시) */}
      <aside className="hidden md:flex w-[72px] bg-[var(--toss-card)] border-r border-[var(--toss-border)] flex-col items-center py-4 space-y-1 shrink-0 z-50 h-screen shadow-sm relative">
        <div className="flex flex-col items-center shrink-0 w-full px-2 mb-3">
          {onOpenNotifications && (
            <div className="w-full flex justify-center">
              <GlobalNotificationBell user={user} onOpenFull={onOpenNotifications} />
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col space-y-1 overflow-y-auto no-scrollbar w-full px-2">
          {visibleMenus.map(m => (
            <button
              key={m.id}
              onClick={() => handleMenuClick(m.id)}
              className={`w-full py-2.5 flex flex-col items-center justify-center rounded-[12px] transition-all ${mainMenu === m.id
                ? 'bg-[var(--toss-blue-light)] text-[var(--toss-blue)]'
                : 'text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)] hover:text-[var(--foreground)]'
                }`}
            >
              <span className="text-lg leading-none">{m.icon}</span>
              <span className="text-[11px] font-medium mt-1">{m.label}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* 모바일 하단 탭바 — 토스 스타일, 전체 메뉴 가로 슬라이드 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--toss-card)] border-t border-[var(--toss-border)] flex items-center gap-1 py-1 px-2 z-[100] shadow-[0_-2px_8px_rgba(0,0,0,0.04)] safe-area-pb overflow-x-auto no-scrollbar scroll-smooth">
        {visibleMenus.map(m => (
          <button
            key={m.id}
            onClick={() => handleMenuClick(m.id)}
            className={`flex flex-col items-center justify-center min-h-[50px] touch-manipulation py-1.5 px-3 min-w-[70px] flex-none transition-all rounded-[12px] ${mainMenu === m.id ? 'text-[var(--toss-blue)]' : 'text-[var(--toss-gray-3)]'
              }`}
          >
            <span className="text-xl leading-none">{m.icon}</span>
            <span className="text-[10px] font-bold mt-1 truncate w-full text-center">{m.label}</span>
          </button>
        ))}
      </nav>

    </>
  );
}

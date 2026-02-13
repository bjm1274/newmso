'use client';
import { useState } from 'react';
import AppLogo from '@/app/components/AppLogo';

const MYPAGE_TAB_KEY = 'erp_mypage_tab';

export default function Sidebar({ user, mainMenu, onMenuChange }: any) {
  const [showMore, setShowMore] = useState(false);

  /* 토스 스타일 통일: 단순 아이콘 + 동일 라운드/색상 */
  const menus = [
    { id: '내정보', icon: '👤', label: '내 정보' },
    { id: '조직도', icon: '🏢', label: '조직도' },
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
  const canAccessHr = isMso || p.hr === true;
  const canAccessInventory = p.inventory === true;

  const hasAnyPermission =
    !!p &&
    Object.keys(p).some((key) => key !== 'mso' && key !== 'hr' && key !== 'inventory' && p[key] === true);

  const canSeeMenu = (menuId: string) => {
    // 신규 직원(권한 미지정)은 기본적으로 '내정보'만 보이게
    if (!hasAnyPermission && !isMso && user?.role !== 'admin') {
      return menuId === '내정보';
    }
    if (menuId === '관리자') return isMso && p.menu_관리자 !== false;
    if (menuId === '인사관리') return (canAccessHr || p.menu_인사관리 === true) && p.menu_인사관리 !== false;
    if (menuId === '재고관리') return (canAccessInventory || p.menu_재고관리 === true) && p.menu_재고관리 !== false;
    if (p[`menu_${menuId}`] === false) return false;
    if (p[`menu_${menuId}`] === true) return true;
    return true; // 기본 표시
  };

  const visibleMenus = menus.filter(m => canSeeMenu(m.id));

  const primaryMenus = visibleMenus.slice(0, 4);
  const secondaryMenus = visibleMenus.slice(4);

  const handleMenuClick = (menuId: string) => {
    // 내정보 메뉴를 다시 누르면 내 정보 내부 탭을 초기화하도록 저장된 탭 키 제거
    if (menuId === '내정보') {
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(MYPAGE_TAB_KEY);
        }
      } catch {
        // ignore
      }
    }
    onMenuChange(menuId);
  };

  return (
    <>
      {/* PC 사이드바 — 토스 스타일 통일 */}
      <aside className="hidden md:flex w-[72px] bg-[var(--toss-card)] border-r border-[var(--toss-border)] flex-col items-center py-6 space-y-2 shrink-0 z-50 h-screen shadow-sm">
        <div className="mb-4 shrink-0">
          <AppLogo size={40} />
        </div>
        <div className="flex-1 flex flex-col space-y-1 overflow-y-auto no-scrollbar w-full px-2">
          {visibleMenus.map(m => (
            <button
              key={m.id}
              onClick={() => handleMenuClick(m.id)}
              className={`w-full py-2.5 flex flex-col items-center justify-center rounded-[12px] transition-all ${
                mainMenu === m.id
                  ? 'bg-[var(--toss-blue-light)] text-[var(--toss-blue)]'
                  : 'text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)] hover:text-[var(--foreground)]'
              }`}
            >
              <span className="text-lg leading-none">{m.icon}</span>
              <span className="text-[10px] font-bold mt-1">{m.label}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* 모바일 하단 탭바 — 토스 스타일 통일 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--toss-card)] border-t border-[var(--toss-border)] flex justify-around items-center py-2 px-2 z-[100] shadow-[0_-2px_8px_rgba(0,0,0,0.04)] safe-area-pb">
        {primaryMenus.map(m => (
          <button
            key={m.id}
            onClick={() => { handleMenuClick(m.id); setShowMore(false); }}
            className={`flex flex-col items-center justify-center py-2 px-2 min-w-0 flex-1 transition-all rounded-[12px] ${
              mainMenu === m.id && !showMore ? 'text-[var(--toss-blue)]' : 'text-[var(--toss-gray-3)]'
            }`}
          >
            <span className="text-xl leading-none">{m.icon}</span>
            <span className="text-[10px] font-bold mt-1 truncate w-full text-center">{m.label}</span>
          </button>
        ))}
        <button
          onClick={() => setShowMore(!showMore)}
          className={`flex flex-col items-center justify-center py-2 px-2 min-w-0 flex-1 transition-all rounded-[12px] ${
            showMore ? 'text-[var(--toss-blue)]' : 'text-[var(--toss-gray-3)]'
          }`}
        >
          <span className="text-xl leading-none">{showMore ? '✕' : '⋯'}</span>
          <span className="text-[10px] font-bold mt-1">{showMore ? '닫기' : '더보기'}</span>
        </button>
      </nav>

      {/* 모바일 더보기 — 토스 스타일 */}
      {showMore && (
        <div className="md:hidden fixed inset-0 bg-black/20 z-[90] animate-in fade-in duration-200" onClick={() => setShowMore(false)}>
          <div className="absolute bottom-[64px] left-4 right-4 bg-[var(--toss-card)] rounded-[16px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-[var(--toss-border)] animate-in slide-in-from-bottom-10 duration-300" onClick={e => e.stopPropagation()}>
            <h3 className="text-[13px] font-bold text-[var(--toss-gray-4)] mb-4 pb-3 border-b border-[var(--toss-border)]">전체 메뉴</h3>
            <div className="grid grid-cols-3 gap-3">
              {secondaryMenus.map(m => (
                <button 
                  key={m.id} 
                  onClick={() => { handleMenuClick(m.id); setShowMore(false); }}
                  className={`flex flex-col items-center justify-center py-4 rounded-[12px] transition-all ${
                    mainMenu === m.id ? 'bg-[#E8F3FF] text-[#3182F6]' : 'bg-[#F2F4F6] text-[#191F28]'
                  }`}
                >
                  <span className="text-2xl mb-2">{m.icon}</span>
                  <span className="text-[11px] font-semibold">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

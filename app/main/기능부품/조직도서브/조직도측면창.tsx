'use client';
import { useState } from 'react';
import { useTheme } from '@/lib/ThemeContext';

export default function Sidebar({ user, mainMenu, onMenuChange }: any) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [showMore, setShowMore] = useState(false);

  const menus = [
    { id: '내정보', icon: '🆔', label: '내 정보' },
    { id: '조직도', icon: '👤', label: '조직도' },
    { id: '추가기능', icon: '🔗', label: '추가기능' },
    { id: '채팅', icon: '✉️', label: '채팅' },
    { id: 'AI채팅', icon: '✨', label: 'AI채팅' },
    { id: '게시판', icon: '📋', label: '게시판' },
    { id: '알림', icon: '🔔', label: '알림' },
    { id: '전자결재', icon: '✍️', label: '전자결재' },
    { id: '인사관리', icon: '👥', label: '인사관리' },
    { id: '재고관리', icon: '📦', label: '재고관리' },
    { id: '관리자', icon: '⚙️', label: '관리자' } 
  ];

  const p = user?.permissions || {};
  const isMso = user?.company === 'SY INC.' || p.mso === true;
  const canAccessHr = isMso || p.hr === true;
  const canAccessInventory = p.inventory === true;

  const canSeeMenu = (menuId: string) => {
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

  return (
    <>
      {/* PC 사이드바 - 토스 스타일 */}
      <aside className="hidden md:flex w-[72px] bg-white border-r border-[#E5E8EB] flex-col items-center py-6 space-y-2 shrink-0 z-50 h-screen shadow-sm">
        <div className="w-10 h-10 bg-[#3182F6] mb-6 flex items-center justify-center rounded-[12px]">
          <span className="text-white font-bold text-base">SY</span>
        </div>
        <div className="flex-1 flex flex-col space-y-1 overflow-y-auto no-scrollbar w-full px-2">
          {visibleMenus.map(m => (
            <button 
              key={m.id} 
              onClick={() => onMenuChange(m.id)}
              className={`w-full py-2.5 flex flex-col items-center justify-center rounded-[12px] transition-all ${
                mainMenu === m.id 
                  ? 'bg-[#E8F3FF] text-[#3182F6]' 
                  : 'text-[#8B95A1] hover:bg-[#F2F4F6] hover:text-[#191F28]'
              }`}
            >
              <span className="text-lg">{m.icon}</span>
              <span className="text-[10px] font-semibold mt-1">{m.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="mt-2 p-2 rounded-[12px] text-[#8B95A1] hover:bg-[#F2F4F6] hover:text-[#191F28] transition-all"
          title={resolvedTheme === 'dark' ? '라이트 모드' : '다크 모드'}
          aria-label={resolvedTheme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          <span className="text-lg">{resolvedTheme === 'dark' ? '☀️' : '🌙'}</span>
        </button>
      </aside>

      {/* 모바일 하단 탭바 - 토스 스타일 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#E5E8EB] flex justify-around items-center py-2 px-2 z-[100] shadow-[0_-2px_8px_rgba(0,0,0,0.04)] safe-area-pb">
        {primaryMenus.map(m => (
          <button 
            key={m.id} 
            onClick={() => { onMenuChange(m.id); setShowMore(false); }}
            className={`flex flex-col items-center justify-center py-2 px-2 min-w-0 flex-1 transition-all rounded-[12px] ${
              mainMenu === m.id && !showMore ? 'text-[#3182F6]' : 'text-[#8B95A1]'
            }`}
          >
            <span className="text-xl">{m.icon}</span>
            <span className="text-[10px] font-semibold mt-1 truncate w-full text-center">{m.label}</span>
          </button>
        ))}
        <button 
          onClick={() => setShowMore(!showMore)}
          className={`flex flex-col items-center justify-center py-2 px-2 min-w-0 flex-1 transition-all rounded-[12px] ${
            showMore ? 'text-[#3182F6]' : 'text-[#8B95A1]'
          }`}
        >
          <span className="text-xl">{showMore ? '✕' : '➕'}</span>
          <span className="text-[10px] font-semibold mt-1">{showMore ? '닫기' : '더보기'}</span>
        </button>
      </nav>

      {/* 모바일 더보기 - 토스 스타일 */}
      {showMore && (
        <div className="md:hidden fixed inset-0 bg-black/20 z-[90] animate-in fade-in duration-200" onClick={() => setShowMore(false)}>
          <div className="absolute bottom-[64px] left-4 right-4 bg-white rounded-[16px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] animate-in slide-in-from-bottom-10 duration-300" onClick={e => e.stopPropagation()}>
            <h3 className="text-[13px] font-semibold text-[#4E5968] mb-4 pb-3 border-b border-[#E5E8EB]">전체 메뉴</h3>
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#E5E8EB]">
              <span className="text-[12px] font-medium text-[#8B95A1]">테마</span>
              <button
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="px-4 py-2 rounded-[12px] bg-[#F2F4F6] text-[#191F28] text-[12px] font-semibold"
                aria-label="테마 전환"
              >
                {resolvedTheme === 'dark' ? '☀️ 라이트' : '🌙 다크'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {secondaryMenus.map(m => (
                <button 
                  key={m.id} 
                  onClick={() => { onMenuChange(m.id); setShowMore(false); }}
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

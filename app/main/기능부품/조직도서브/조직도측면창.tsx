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

  const isMso = user?.company === 'SY INC.' || user?.permissions?.mso === true;
  const canAccessHr = isMso || user?.permissions?.hr === true;

  const visibleMenus = menus.filter(m => {
    if (m.id === '관리자') return isMso;
    if (m.id === '인사관리') return canAccessHr;
    return true;
  });

  const primaryMenus = visibleMenus.slice(0, 4);
  const secondaryMenus = visibleMenus.slice(4);

  return (
    <>
      {/* PC 사이드바 (md 이상) - 카카오 톤 */}
      <aside className="hidden md:flex w-20 bg-[#191919] border-r border-[#2C2C2E] flex-col items-center py-6 space-y-3 shrink-0 z-50 h-screen">
        <div className="w-12 h-12 bg-[#FEE500] mb-6 flex items-center justify-center rounded-xl shadow-sm">
          <span className="text-[#191919] font-black text-lg">SY</span>
        </div>
        <div className="flex-1 flex flex-col space-y-2 overflow-y-auto no-scrollbar w-full px-2">
          {visibleMenus.map(m => (
            <button 
              key={m.id} 
              onClick={() => onMenuChange(m.id)}
              className={`w-full py-3 flex flex-col items-center justify-center rounded-xl transition-all ${
                mainMenu === m.id 
                  ? 'bg-[#FEE500] text-[#191919] shadow-sm' 
                  : 'text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="text-xl">{m.icon}</span>
              <span className="text-[9px] font-bold mt-1.5">{m.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="mt-2 p-2.5 rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-all"
          title={resolvedTheme === 'dark' ? '라이트 모드' : '다크 모드'}
          aria-label={resolvedTheme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          <span className="text-lg">{resolvedTheme === 'dark' ? '☀️' : '🌙'}</span>
        </button>
      </aside>

      {/* 모바일 하단 탭바 - 카카오 스타일, 컴팩트 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#EBEBEB] flex justify-around items-center py-2 px-2 z-[100] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] safe-area-pb">
        {primaryMenus.map(m => (
          <button 
            key={m.id} 
            onClick={() => { onMenuChange(m.id); setShowMore(false); }}
            className={`flex flex-col items-center justify-center py-1.5 px-2 min-w-0 flex-1 transition-all ${
              mainMenu === m.id && !showMore ? 'text-[#191919]' : 'text-[#8E8E93]'
            }`}
          >
            <span className="text-xl">{m.icon}</span>
            <span className="text-[9px] font-semibold mt-0.5 truncate w-full text-center">{m.label}</span>
          </button>
        ))}
        <button 
          onClick={() => setShowMore(!showMore)}
          className={`flex flex-col items-center justify-center py-1.5 px-2 min-w-0 flex-1 transition-all ${
            showMore ? 'text-[#191919]' : 'text-[#8E8E93]'
          }`}
        >
          <span className="text-xl">{showMore ? '✕' : '➕'}</span>
          <span className="text-[9px] font-semibold mt-0.5">{showMore ? '닫기' : '더보기'}</span>
        </button>
      </nav>

      {/* 모바일 더보기 메뉴 - 컴팩트 */}
      {showMore && (
        <div className="md:hidden fixed inset-0 bg-black/30 z-[90] animate-in fade-in duration-200" onClick={() => setShowMore(false)}>
          <div className="absolute bottom-[60px] left-3 right-3 bg-white rounded-2xl p-6 shadow-xl animate-in slide-in-from-bottom-10 duration-300" onClick={e => e.stopPropagation()}>
            <h3 className="text-xs font-bold text-[#8E8E93] mb-4 pb-3 border-b border-[#EBEBEB]">전체 메뉴</h3>
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#EBEBEB]">
              <span className="text-[10px] font-semibold text-[#8E8E93]">테마</span>
              <button
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="px-3 py-1.5 rounded-lg bg-[#F5F5F5] text-[#191919] text-[11px] font-semibold"
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
                  className={`flex flex-col items-center justify-center py-3 rounded-xl transition-all ${
                    mainMenu === m.id ? 'bg-[#FEE500] text-[#191919]' : 'bg-[#F5F5F5] text-[#191919]'
                  }`}
                >
                  <span className="text-2xl mb-1">{m.icon}</span>
                  <span className="text-[10px] font-semibold">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

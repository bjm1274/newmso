'use client';
import { useState } from 'react';
import { useTheme } from '@/lib/ThemeContext';

export default function Sidebar({ user, mainMenu, onMenuChange }: any) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [showMore, setShowMore] = useState(false);

  const menus = [
    { id: '내정보', icon: '🆔', label: '내 정보' },
    { id: '조직도', icon: '👤', label: '조직도' },
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
      {/* PC 사이드바 (md 이상) */}
      <aside className="hidden md:flex w-24 bg-[#1E293B] border-r border-gray-800 flex-col items-center py-10 space-y-6 shrink-0 z-50 h-screen">
        <div className="w-16 h-16 bg-blue-600 mb-8 flex items-center justify-center rounded-[1.5rem] shadow-xl">
          <span className="text-white font-black text-2xl">SY</span>
        </div>
        <div className="flex-1 flex flex-col space-y-5 overflow-y-auto no-scrollbar w-full px-3">
          {visibleMenus.map(m => (
            <button 
              key={m.id} 
              onClick={() => onMenuChange(m.id)}
              className={`w-full py-4 flex flex-col items-center justify-center rounded-2xl transition-all ${
                mainMenu === m.id 
                  ? 'bg-blue-600 text-white shadow-lg scale-105' 
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-2xl">{m.icon}</span>
              <span className="text-[10px] font-black mt-2 tracking-tighter">{m.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="mt-4 p-3 rounded-2xl text-gray-400 hover:bg-gray-800 hover:text-white transition-all"
          title={resolvedTheme === 'dark' ? '라이트 모드' : '다크 모드'}
          aria-label={resolvedTheme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          <span className="text-2xl">{resolvedTheme === 'dark' ? '☀️' : '🌙'}</span>
        </button>
      </aside>

      {/* 모바일 하단 탭바 (md 미만) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around items-center py-3 px-4 z-[100] shadow-[0_-10px_30px_rgba(0,0,0,0.08)] rounded-t-[2rem]">
        {primaryMenus.map(m => (
          <button 
            key={m.id} 
            onClick={() => { onMenuChange(m.id); setShowMore(false); }}
            className={`flex flex-col items-center justify-center p-2 transition-all ${
              mainMenu === m.id && !showMore ? 'text-blue-600 scale-110' : 'text-gray-400'
            }`}
          >
            <span className="text-2xl">{m.icon}</span>
            <span className="text-[10px] font-black mt-1 tracking-tighter">{m.label}</span>
          </button>
        ))}
        <button 
          onClick={() => setShowMore(!showMore)}
          className={`flex flex-col items-center justify-center p-2 transition-all ${
            showMore ? 'text-blue-600 scale-110' : 'text-gray-400'
          }`}
        >
          <span className="text-2xl">{showMore ? '✕' : '➕'}</span>
          <span className="text-[10px] font-black mt-1 tracking-tighter">{showMore ? '닫기' : '더보기'}</span>
        </button>
      </nav>

      {/* 모바일 더보기 메뉴 팝업 */}
      {showMore && (
        <div className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-[90] animate-in fade-in duration-200" onClick={() => setShowMore(false)}>
          <div className="absolute bottom-[90px] left-4 right-4 bg-white rounded-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom-10 duration-300" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6 border-b border-gray-50 pb-4">전체 메뉴</h3>
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
              <span className="text-[10px] font-black text-gray-400 uppercase">테마</span>
              <button
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold"
                aria-label="테마 전환"
              >
                {resolvedTheme === 'dark' ? '☀️ 라이트' : '🌙 다크'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-6">
              {secondaryMenus.map(m => (
                <button 
                  key={m.id} 
                  onClick={() => { onMenuChange(m.id); setShowMore(false); }}
                  className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-all ${
                    mainMenu === m.id ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600'
                  }`}
                >
                  <span className="text-3xl mb-2">{m.icon}</span>
                  <span className="text-[11px] font-black tracking-tighter">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

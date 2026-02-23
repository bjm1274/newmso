'use client';
import { useState } from 'react';

export default function Sidebar({ user, mainMenu, onMenuChange }: any) {
  const [showMore, setShowMore] = useState(false);

  const menus = [
    { id: '내정보', icon: '🆔', label: '내 정보' },
    { id: '조직도', icon: '👤', label: '조직도' },
    { id: '채팅', icon: '✉️', label: '채팅' },
    { id: '게시판', icon: '📋', label: '게시판' },
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
      {/* PC 사이드바 (md 이상) - Cursor/Linear 스타일 */}
      <aside className="hidden md:flex w-20 bg-zinc-950 border-r border-zinc-800 flex-col items-center py-8 space-y-6 shrink-0 z-50 h-screen transition-all">
        <div className="w-12 h-12 bg-white flex items-center justify-center rounded-xl shadow-premium transform hover:scale-105 transition-transform cursor-pointer mb-6">
          <span className="text-zinc-950 font-black text-lg italic tracking-tighter">SY</span>
        </div>
        <div className="flex-1 flex flex-col space-y-2 overflow-y-auto no-scrollbar w-full px-2">
          {visibleMenus.map(m => (
            <button
              key={m.id}
              onClick={() => onMenuChange(m.id)}
              className={`w-full py-3 flex flex-col items-center justify-center rounded-lg transition-all duration-200 group relative ${mainMenu === m.id
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
            >
              {mainMenu === m.id && (
                <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-full"></div>
              )}
              <span className={`text-xl transition-all duration-200 ${mainMenu === m.id ? 'scale-110' : 'group-hover:scale-105 group-hover:text-zinc-300'}`}>{m.icon}</span>
              <span className={`text-[10px] font-semibold mt-1.5 transition-colors ${mainMenu === m.id ? 'text-zinc-100' : 'text-zinc-500 group-hover:text-zinc-400'}`}>{m.label}</span>
            </button>
          ))}
        </div>
        <div className="pt-4 border-t border-zinc-900 w-full px-4 mb-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-400 font-bold hover:bg-zinc-700 transition-colors cursor-pointer">
            {user?.name?.[0] || 'U'}
          </div>
        </div>
      </aside>

      {/* 모바일 하단 탭바 (md 미만) - 미니멀 플로팅 디자인 */}
      <nav className="md:hidden fixed bottom-6 left-6 right-6 glass border border-zinc-200/50 dark:border-zinc-800/50 flex justify-around items-center py-3 px-4 z-[100] shadow-premium rounded-2xl animate-premium-fade">
        {primaryMenus.map(m => (
          <button
            key={m.id}
            onClick={() => { onMenuChange(m.id); setShowMore(false); }}
            className={`flex flex-col items-center justify-center py-1 transition-all ${mainMenu === m.id && !showMore ? 'text-foreground scale-105 font-bold' : 'text-zinc-400'
              }`}
          >
            <span className="text-xl">{m.icon}</span>
            <span className="text-[9px] font-medium mt-1">{m.label}</span>
          </button>
        ))}
        <button
          onClick={() => setShowMore(!showMore)}
          className={`flex flex-col items-center justify-center py-1 transition-all ${showMore ? 'text-foreground scale-105 font-bold' : 'text-zinc-400'
            }`}
        >
          <span className="text-xl">{showMore ? '✕' : '➕'}</span>
          <span className="text-[9px] font-medium mt-1">{showMore ? '닫기' : '더보기'}</span>
        </button>
      </nav>

      {/* 모바일 더보기 메뉴 팝업 - 세련된 바텀 시트 스타일 */}
      {showMore && (
        <div className="md:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[90] animate-in fade-in duration-300" onClick={() => setShowMore(false)}>
          <div className="absolute bottom-[100px] left-6 right-6 bg-surface rounded-3xl p-8 shadow-2xl animate-in slide-in-from-bottom-10 duration-500" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-6"></div>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-8 text-center">전체 서비스 메뉴</h3>
            <div className="grid grid-cols-3 gap-6">
              {secondaryMenus.map(m => (
                <button
                  key={m.id}
                  onClick={() => { onMenuChange(m.id); setShowMore(false); }}
                  className={`flex flex-col items-center justify-center p-5 rounded-2xl transition-all duration-300 active:scale-95 ${mainMenu === m.id ? 'bg-primary-light text-primary ring-1 ring-primary/20 shadow-inner' : 'bg-slate-50 text-slate-600'
                    }`}
                >
                  <span className="text-3xl mb-3">{m.icon}</span>
                  <span className="text-[10px] font-black tracking-tighter text-center">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

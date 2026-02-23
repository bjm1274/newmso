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
      {/* PC 사이드바 (md 이상) */}
      <aside className="hidden md:flex w-24 bg-[#0F172A] border-r border-slate-800 flex-col items-center py-10 space-y-6 shrink-0 z-50 h-screen transition-all">
        <div className="w-14 h-14 bg-primary mb-8 flex items-center justify-center rounded-2xl shadow-xl shadow-blue-900/20 transform hover:rotate-3 transition-transform">
          <span className="text-white font-black text-xl italic tracking-tighter">SY</span>
        </div>
        <div className="flex-1 flex flex-col space-y-4 overflow-y-auto no-scrollbar w-full px-3">
          {visibleMenus.map(m => (
            <button 
              key={m.id} 
              onClick={() => onMenuChange(m.id)}
              className={`w-full py-4 flex flex-col items-center justify-center rounded-2xl transition-all duration-300 group ${
                mainMenu === m.id 
                  ? 'bg-primary text-white shadow-lg shadow-blue-900/40 scale-105' 
                  : 'text-slate-500 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className={`text-2xl transition-transform duration-300 ${mainMenu === m.id ? 'scale-110' : 'group-hover:scale-110'}`}>{m.icon}</span>
              <span className={`text-[9px] font-black mt-2 tracking-widest uppercase opacity-80 ${mainMenu === m.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>{m.label}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* 모바일 하단 탭바 (md 미만) - 프리미엄 곡률 및 플로팅 디자인 */}
      <nav className="md:hidden fixed bottom-6 left-6 right-6 bg-white/90 backdrop-blur-xl border border-white/20 flex justify-around items-center py-4 px-6 z-[100] shadow-2xl rounded-3xl animate-soft-fade">
        {primaryMenus.map(m => (
          <button 
            key={m.id} 
            onClick={() => { onMenuChange(m.id); setShowMore(false); }}
            className={`flex flex-col items-center justify-center transition-all ${
              mainMenu === m.id && !showMore ? 'text-primary scale-110 font-black' : 'text-slate-400'
            }`}
          >
            <span className="text-2xl">{m.icon}</span>
            <span className="text-[9px] font-black mt-1 tracking-tighter uppercase">{m.label}</span>
          </button>
        ))}
        <button 
          onClick={() => setShowMore(!showMore)}
          className={`flex flex-col items-center justify-center transition-all ${
            showMore ? 'text-primary scale-110 font-black' : 'text-slate-400'
          }`}
        >
          <span className="text-2xl">{showMore ? '✕' : '➕'}</span>
          <span className="text-[9px] font-black mt-1 tracking-tighter uppercase">{showMore ? '닫기' : '더보기'}</span>
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
                  className={`flex flex-col items-center justify-center p-5 rounded-2xl transition-all duration-300 active:scale-95 ${
                    mainMenu === m.id ? 'bg-primary-light text-primary ring-1 ring-primary/20 shadow-inner' : 'bg-slate-50 text-slate-600'
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

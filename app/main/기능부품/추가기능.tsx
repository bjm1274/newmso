'use client';

import { useState } from 'react';
import 부서별물품장비현황 from './재고관리서브/부서별물품장비현황';
import AIChatView from './AI채팅';

const EXTERNAL_LINKS = [
  { id: 'km-park', label: 'KM Park', url: 'http://kmp0001103.iptime.org/login?redirectTo=undefined', icon: '🏥' },
  { id: 'webfax', label: 'U+ 웹팩스', url: 'https://webfax.uplus.co.kr/m', icon: '📠' },
];

// 컴포넌트 이름을 영문 대문자로 시작하는 형태로 지정하여
// React ESLint 규칙을 만족시킵니다. default export 이므로
// 외부에서의 import 이름(추가기능)은 그대로 사용할 수 있습니다.
export default function ExtraFeatures({ user }: { user?: any }) {
  const [subView, setSubView] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-[#F9FAFB]">
      <div className="max-w-xl mx-auto">
        <h2 className="text-lg font-bold text-[#191F28] mb-1">추가 기능</h2>
        <p className="text-[11px] text-[#8B95A1] mb-6">외부 서비스 바로가기, 부서별 재고, AI채팅</p>

        {subView === '부서별재고' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="text-[11px] font-bold text-[#3182F6] hover:underline"
            >
              ← 목록으로
            </button>
            <div className="bg-white border border-[#E5E8EB] rounded-[16px] p-6 shadow-sm">
              <부서별물품장비현황 user={user || {}} />
            </div>
          </div>
        )}

        {subView === 'AI채팅' && (
          <div className="space-y-4 flex flex-col h-[calc(100vh-12rem)]">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="text-[11px] font-bold text-[#3182F6] hover:underline shrink-0"
            >
              ← 목록으로
            </button>
            <div className="flex-1 min-h-0 bg-white border border-[#E5E8EB] rounded-[16px] overflow-hidden shadow-sm">
              <AIChatView />
            </div>
          </div>
        )}

        {!subView && (
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setSubView('부서별재고')}
              className="flex items-center gap-3 p-4 bg-white border border-[#E5E8EB] rounded-[16px] shadow-sm hover:bg-[#E8F3FF]/50 hover:border-[#3182F6]/30 transition-all group text-left w-full"
            >
              <div className="w-12 h-12 bg-[#F2F4F6] group-hover:bg-[#E8F3FF] rounded-[12px] flex items-center justify-center text-xl transition-colors">
                🏢
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#191F28] text-sm">부서별 재고</h3>
                <p className="text-[11px] text-[#8B95A1] mt-0.5">우리 부서 물품·장비 현황</p>
              </div>
              <span className="text-[#8B95A1] group-hover:text-[#3182F6]">→</span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('AI채팅')}
              className="flex items-center gap-3 p-4 bg-white border border-[#E5E8EB] rounded-[16px] shadow-sm hover:bg-[#E8F3FF]/50 hover:border-[#3182F6]/30 transition-all group text-left w-full"
            >
              <div className="w-12 h-12 bg-[#F2F4F6] group-hover:bg-[#E8F3FF] rounded-[12px] flex items-center justify-center text-xl transition-colors">
                ✨
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#191F28] text-sm">AI채팅</h3>
                <p className="text-[11px] text-[#8B95A1] mt-0.5">AI와 대화하기</p>
              </div>
              <span className="text-[#8B95A1] group-hover:text-[#3182F6]">→</span>
            </button>
            {EXTERNAL_LINKS.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-white border border-[#E5E8EB] rounded-[16px] shadow-sm hover:bg-[#E8F3FF]/50 hover:border-[#3182F6]/30 transition-all group"
              >
                <div className="w-12 h-12 bg-[#F2F4F6] group-hover:bg-[#E8F3FF] rounded-[12px] flex items-center justify-center text-xl transition-colors">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[#191F28] text-sm">{item.label}</h3>
                  <p className="text-[11px] text-[#8B95A1] mt-0.5 truncate">{item.url}</p>
                </div>
                <span className="text-[#8B95A1] group-hover:text-[#3182F6]">↗</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

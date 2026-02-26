'use client';

import { useState } from 'react';
import ThemeToggle from '@/app/components/ThemeToggle';
import GlobalSearch from '@/app/components/GlobalSearch';
import 부서별물품장비현황 from './재고관리서브/부서별물품장비현황';
import 근무현황 from './근무현황';
import 인계노트 from './인계노트';

const EXTERNAL_LINKS = [
  { id: 'km-park', label: 'KM Park', url: 'http://kmp0001103.iptime.org/login?redirectTo=undefined', icon: '🏥' },
  { id: 'webfax', label: 'U+ 웹팩스', url: 'https://webfax.uplus.co.kr/m', icon: '📠' },
];

// 컴포넌트 이름을 영문 대문자로 시작하는 형태로 지정하여
// React ESLint 규칙을 만족시킵니다. default export 이므로
// 외부에서의 import 이름(추가기능)은 그대로 사용할 수 있습니다.
export default function ExtraFeatures({
  user,
  staffs = [],
  posts = [],
  onSearchSelect,
  onOpenOrgChart,
}: {
  user?: any;
  staffs?: any[];
  posts?: any[];
  onSearchSelect?: (type: string, id: string) => void;
  onOpenOrgChart?: () => void;
}) {
  const [subView, setSubView] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-[var(--page-bg)]">
      <div className="max-w-5xl mx-auto w-full">
        <h2 className="text-lg font-bold text-[var(--foreground)] mb-1">추가 기능</h2>
        <p className="text-[11px] text-[var(--toss-gray-3)] mb-4">모드 선택, 검색, 외부 서비스, 부서별 재고</p>

        <div className="flex flex-col sm:flex-row gap-3 mb-6 p-4 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] shadow-sm">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">모드</span>
            <ThemeToggle />
          </div>
          {onSearchSelect && (
            <div className="flex-1 min-w-0">
              <GlobalSearch user={user} staffs={staffs} posts={posts} onSelect={(type, id) => {
                if (type === 'handover') {
                  setSubView('인계노트');
                } else if (onSearchSelect) {
                  onSearchSelect(type, id);
                }
              }} variant="input" />
            </div>
          )}
        </div>

        {subView === '부서별재고' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline"
            >
              ← 목록으로
            </button>
            <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-6 shadow-sm">
              <부서별물품장비현황 user={user || {}} />
            </div>
          </div>
        )}

        {subView === '근무현황' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline"
            >
              ← 목록으로
            </button>
            <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-6 shadow-sm">
              <근무현황 user={user || {}} />
            </div>
          </div>
        )}

        {subView === '인계노트' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline"
            >
              ← 목록으로
            </button>
            <인계노트 user={user || {}} />
          </div>
        )}

        {!subView && (
          <div className="grid gap-3 md:grid-cols-2">
            {onOpenOrgChart && (
              <button
                type="button"
                onClick={onOpenOrgChart}
                className="flex items-center gap-3 p-4 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] shadow-sm hover:bg-[var(--toss-blue-light)]/50 hover:border-[var(--toss-blue)]/30 transition-all group text-left w-full"
              >
                <div className="w-12 h-12 bg-[var(--toss-gray-1)] group-hover:bg-[var(--toss-blue-light)] rounded-[12px] flex items-center justify-center text-xl transition-colors">
                  🏢
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[var(--foreground)] text-sm">조직도</h3>
                  <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5">조직 구성 및 연락처 보기</p>
                </div>
                <span className="text-[var(--toss-gray-3)] group-hover:text-[var(--toss-blue)]">→</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSubView('부서별재고')}
              className="flex items-center gap-3 p-4 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] shadow-sm hover:bg-[var(--toss-blue-light)]/50 hover:border-[var(--toss-blue)]/30 transition-all group text-left w-full"
            >
              <div className="w-12 h-12 bg-[var(--toss-gray-1)] group-hover:bg-[var(--toss-blue-light)] rounded-[12px] flex items-center justify-center text-xl transition-colors">
                📦
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[var(--foreground)] text-sm">부서별 재고</h3>
                <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5">우리 부서 물품·장비 현황</p>
              </div>
              <span className="text-[var(--toss-gray-3)] group-hover:text-[var(--toss-blue)]">→</span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('근무현황')}
              className="flex items-center gap-3 p-4 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] shadow-sm hover:bg-[var(--toss-blue-light)]/50 hover:border-[var(--toss-blue)]/30 transition-all group text-left w-full"
            >
              <div className="w-12 h-12 bg-[var(--toss-gray-1)] group-hover:bg-[var(--toss-blue-light)] rounded-[12px] flex items-center justify-center text-xl transition-colors">
                📅
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[var(--foreground)] text-sm">근무현황</h3>
                <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5">이번 달 직원 근무표</p>
              </div>
              <span className="text-[var(--toss-gray-3)] group-hover:text-[var(--toss-blue)]">→</span>
            </button>

            {(user?.department === '병동팀' || user?.team === '병동팀' || user?.role === 'admin' || user?.permissions?.mso || user?.permissions?.handover_read) && (
              <button
                type="button"
                onClick={() => setSubView('인계노트')}
                className="flex items-center gap-3 p-4 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] shadow-sm hover:bg-[var(--toss-blue-light)]/50 hover:border-[var(--toss-blue)]/30 transition-all group text-left w-full"
              >
                <div className="w-12 h-12 bg-red-50 text-red-500 group-hover:bg-red-100 rounded-[12px] flex items-center justify-center text-xl transition-colors">
                  📝
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[var(--foreground)] text-sm">인계노트</h3>
                  <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5">3교대 근무자 필수 공유사항</p>
                </div>
                <span className="text-[var(--toss-gray-3)] group-hover:text-[var(--toss-blue)]">→</span>
              </button>
            )}

            {EXTERNAL_LINKS.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] shadow-sm hover:bg-[var(--toss-blue-light)]/50 hover:border-[var(--toss-blue)]/30 transition-all group"
              >
                <div className="w-12 h-12 bg-[var(--toss-gray-1)] group-hover:bg-[var(--toss-blue-light)] rounded-[12px] flex items-center justify-center text-xl transition-colors">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[var(--foreground)] text-sm">{item.label}</h3>
                  <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5 truncate">{item.url}</p>
                </div>
                <span className="text-[var(--toss-gray-3)] group-hover:text-[var(--toss-blue)]">↗</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

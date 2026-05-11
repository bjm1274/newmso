# Phase 2 컴포넌트 — 사이드바 + 바텀탭 + 더보기시트

스트랭글러 패턴으로 신규 라우트(`app/main-v2/`)에 마운트될 청사진 컴포넌트입니다.
**기존 `app/main/` 경로의 어떤 파일도 수정하지 않습니다.**

---

## 파일 구성

| 파일 | 줄 수 | 역할 |
|---|---|---|
| `types.ts` | 78 | 공통 타입 (MenuId, BottomTabId, UserRole, Props) |
| `menu-config.ts` | 120 | 5개 메뉴 × 38장 화면 매핑, 아이콘 매핑 |
| `Sidebar.tsx` | 196 | 데스크톱 사이드바 (5개 메뉴 + 사용자 아바타) |
| `BottomTab.tsx` | 188 | 모바일 바텀탭 (5개 탭 + 알림 뱃지) |
| `MoreSheet.tsx` | 264 | 더보기 바텀시트 (검색 + 포커스 트랩) |

---

## 메뉴 구성 (5개 × 총 38장)

| 메뉴 | 아이콘 (lucide) | 하위 화면 수 |
|---|---|---|
| 업무 | `Briefcase` | 8장 |
| 인사·근태·급여 | `Users` | 9장 |
| 운영 | `Settings` | 9장 |
| 경영 | `TrendingUp` | 7장 |
| 설정 | `Cog` | 5장 |

---

## 사용 방법 (app/main-v2/ 이동 후)

### 1. 파일 이동

```bash
# 신규 라우트 디렉토리 생성
mkdir -p app/main-v2/components

# 파일 복사
cp analysis_artifacts/claude_design_handoff/out/Phase2/components/*.ts  app/main-v2/components/
cp analysis_artifacts/claude_design_handoff/out/Phase2/components/*.tsx app/main-v2/components/
```

### 2. import 경로 수정

`MoreSheet.tsx` 상단 주석 처리된 import를 활성화하고,
인라인 `useDebounced` / `useFocusTrap` 훅을 제거:

```tsx
// Before (인라인 훅 사용)
function useDebounced(...) { ... }  // 삭제

// After (프로젝트 훅 사용)
import { useDebouncedSearch } from '@/lib/hooks/useDebouncedSearch';
import { useModalFocusTrap } from '@/app/components/useModalFocusTrap';
```

### 3. 레이아웃에 마운트

```tsx
// app/main-v2/layout.tsx
'use client';

import { useState } from 'react';
import Sidebar from './components/Sidebar';
import BottomTab from './components/BottomTab';
import MoreSheet from './components/MoreSheet';
import { ALL_SCREENS } from './components/menu-config';
import type { MenuId, BottomTabId } from './components/types';

export default function MainV2Layout({ children }: { children: React.ReactNode }) {
  const [currentMenuId, setCurrentMenuId] = useState<MenuId>('업무');
  const [currentTabId, setCurrentTabId] = useState<BottomTabId>('홈');
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);

  function handleTabChange(id: BottomTabId) {
    if (id === '더보기') {
      setIsMoreSheetOpen(true);
    } else {
      setCurrentTabId(id);
    }
  }

  return (
    <div style={{ display: 'flex', height: '100dvh' }}>
      {/* 데스크톱 사이드바 (CSS로 모바일 숨김) */}
      <Sidebar
        currentMenuId={currentMenuId}
        onMenuChange={setCurrentMenuId}
        user={{ name: '홍길동', role: 'manager' }}
      />

      {/* 콘텐츠 영역 */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </main>

      {/* 모바일 바텀탭 */}
      <BottomTab
        currentTabId={currentTabId}
        onTabChange={handleTabChange}
        notificationCount={3}
      />

      {/* 더보기 시트 */}
      <MoreSheet
        isOpen={isMoreSheetOpen}
        onClose={() => setIsMoreSheetOpen(false)}
        screens={ALL_SCREENS}
        onScreenSelect={(screen) => {
          // screen.id 로 라우팅 처리
          console.log('navigate to', screen.id);
        }}
      />
    </div>
  );
}
```

---

## tsconfig include 범위 주의사항

**현재 위치 (`analysis_artifacts/`)는 tsconfig.json `exclude` 목록에 포함되어 있습니다:**

```json
"exclude": ["node_modules", "supabase/functions", "_*.ts", "_*.tsx", "analysis_artifacts", "board"]
```

따라서 이 디렉토리의 파일은 `npx tsc --noEmit` 검사 대상에서 **제외**됩니다.

`app/main-v2/components/` 로 복사 후에는 자동으로 include 범위에 포함되며 (`**/*.ts`, `**/*.tsx` 패턴 적용),
그 시점에 `npx tsc --noEmit` 검증을 진행하세요.

---

## 접근성 (a11y) 속성 목록

### Sidebar
- `<aside aria-label="주 메뉴 사이드바">`
- `<nav aria-label="주 탐색 메뉴">`
- `<ul role="menu" aria-label="메인 메뉴">`
- `<button role="menuitem" aria-current="page" aria-label="{메뉴명} 메뉴">`
- `<div aria-label="로그인 사용자: {name}, 역할: {role}">`
- 사용자 이니셜 아바타 `aria-hidden="true"`, 프로필 이미지 `alt="{name} 프로필 사진"`

### BottomTab
- `<nav aria-label="모바일 하단 탭 네비게이션">`
- `<div role="tablist" aria-label="메인 탭 목록">`
- `<button role="tab" aria-selected aria-label="{탭명} 탭">`
- 알림 뱃지 `<span role="status" aria-label="읽지 않은 알림 N개">`
- 활성 인디케이터 `aria-hidden="true"`

### MoreSheet
- `<div role="dialog" aria-modal="true" aria-labelledby="{titleId}">`
- `<h2 id="{titleId}">전체 메뉴</h2>`
- `<button aria-label="더보기 시트 닫기">`
- `<input aria-label="메뉴 검색">`
- `<section aria-labelledby="more-group-{menuId}">`
- `<div role="region" aria-live="polite" aria-atomic="false">`
- 빈 결과 `<div aria-live="polite" role="status">`
- 닫기(X) 버튼 `<button aria-label="검색어 지우기">`

---

## 스타일 의존성 (globals.css)

다음 CSS 변수 및 유틸리티 클래스가 `app/globals.css`에 선언되어 있어야 합니다:

**CSS 변수**: `--accent`, `--card`, `--muted`, `--border`, `--foreground`, `--toss-gray-4`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--sidebar-width`

**유틸리티 클래스**: `.badge`, `.badge-blue`, `.section-title`, `.empty-state`

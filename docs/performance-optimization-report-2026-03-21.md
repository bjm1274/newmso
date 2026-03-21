# 성능 최적화 보고서

작성일: 2026-03-21

## 1. 점검 범위

이번 최적화는 체감 성능에 가장 영향이 큰 화면 전환과 대형 화면 로딩 구간을 우선 대상으로 진행했다.

- 메인 콘텐츠 메뉴 전환
- 추가기능 서브뷰 전환
- 조직도 전사 직원 로딩
- 조직도/추가기능 관련 회귀 테스트

## 2. 확인된 핵심 병목

### 2-1. 메인 메뉴 대형 컴포넌트 정적 로딩

`조직도본문.tsx`에서 `내정보`, `채팅`, `게시판`, `전자결재`, `인사관리`, `재고관리`, `관리자`, `추가기능`을 모두 정적으로 가져오고 있었다.  
이 구조는 첫 진입 시 번들 크기를 키우고, 메뉴가 달라도 무거운 화면 코드가 한 번에 묶여 들어오게 만든다.

### 2-2. 추가기능 내부의 반복 서브뷰 래퍼

`추가기능.tsx`는 서브뷰별로 거의 같은 래퍼 마크업과 버튼 구조를 반복하고 있었다.  
반복 코드가 많을수록 유지보수 비용이 늘고, 사소한 UI 수정도 여러 군데를 동시에 수정해야 했다.

### 2-3. 조직도 전사 직원 반복 조회

`OrgChart.tsx`는 열릴 때마다 전체 `staff_members`를 다시 읽는 구조였다.  
전사 조직도처럼 데이터가 큰 화면에서는 메뉴를 오갈수록 체감 지연이 발생할 수 있다.

## 3. 적용한 최적화

### 3-1. 메인 메뉴 동적 로딩 적용

파일: `app/main/기능부품/조직도서브/조직도본문.tsx`

- 주요 화면 컴포넌트를 `next/dynamic`으로 전환
- 메뉴별 로딩 패널 추가
- 필요한 화면만 늦게 로드하도록 변경

효과:

- 초기 번들 과적재 감소
- 첫 진입 시 불필요한 대형 화면 코드 로딩 완화
- 메뉴 전환 체감 개선

### 3-2. 추가기능 서브뷰 공통 래퍼 정리

파일: `app/main/기능부품/추가기능.tsx`

- `FeatureShell` 공통 래퍼 도입
- 서브뷰 로딩 컴포넌트 공통화
- `visibleCards`, `favoriteCards`, `normalCards`, `recentCards`를 `useMemo`로 정리
- 조직도 포함 서브뷰 컴포넌트를 동적 로딩으로 전환

효과:

- 중복 코드 감소
- 유지보수 포인트 축소
- 추가기능 첫 진입/서브뷰 전환 시 불필요한 코드 로딩 완화

### 3-3. 조직도 전사 직원 캐시 적용

파일: `app/main/기능부품/조직도서브/OrgChart.tsx`

- 전사 직원 디렉터리 메모리 캐시 추가
- 같은 세션 내 재진입 시 캐시 재사용
- 회사별 피라미드 뷰를 유지하면서 전사 열람과 회사 전환 지원

효과:

- 조직도 재오픈 시 반복 fetch 감소
- 회사 전환/재진입 체감 개선
- 전사 열람 요구사항 유지

## 4. 정리한 중복 코드

### 4-1. 추가기능 서브뷰 컨테이너

이전:

- 뒤로가기 버튼
- `extra-subview` 래퍼
- 최대 폭 컨테이너
- 카드 박스 래퍼

가 서브뷰마다 반복됨.

현재:

- `FeatureShell` 1곳에서 공통 처리

### 4-2. 로딩 UI

이전:

- 화면별 로딩 처리가 제각각이거나 없음

현재:

- 메인 메뉴용 `MenuViewLoading`
- 추가기능용 `SubviewLoading`

으로 공통화

## 5. 검증 결과

실행한 검증:

- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\조직도서브\조직도본문.tsx" "C:\Users\baek_\newmso\app\main\기능부품\추가기능.tsx" "C:\Users\baek_\newmso\app\main\기능부품\조직도서브\OrgChart.tsx"`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `npx playwright test tests/e2e/extra-features-detail.desktop.spec.ts tests/e2e/extra-features-deep-actions.desktop.spec.ts tests/e2e/manual-audit.desktop.spec.ts tests/e2e/notification-open.desktop.spec.ts --reporter=line`

결과:

- lint 통과
- type check 통과
- production build 통과
- Playwright 9건 통과

## 6. 이번 변경의 직접 영향 파일

- `app/main/기능부품/조직도서브/조직도본문.tsx`
- `app/main/기능부품/추가기능.tsx`
- `app/main/기능부품/조직도서브/OrgChart.tsx`
- `tests/e2e/extra-features-detail.desktop.spec.ts`

## 7. 남아 있는 다음 최적화 우선순위

현재 코드베이스에서 다음 병목 후보는 아래 순서가 효과가 크다.

1. `app/main/기능부품/근무표자동편성.tsx`
   - 파일 크기가 매우 커서 기능 분리 효과가 큼
2. `app/main/기능부품/메신저.tsx`
   - 장문 컴포넌트 + 실시간 상태가 많아 추가 분리 가치가 큼
3. `app/main/기능부품/게시판.tsx`
   - 화면/폼/상세/댓글 상태가 한 파일에 모여 있음
4. 긴 목록 화면의 부분 가상화
   - 채팅 목록, 직원 목록, 긴 조직도/대시보드 카드 영역
5. `page.tsx` 초기 부트스트랩 분리
   - 초기 세션/데이터 로딩과 UI 상태 로직을 나누면 유지보수성과 성능 모두 좋아짐

## 8. 결론

이번 작업은 “전체를 다 얇게 건드리는” 방식이 아니라, 체감 성능에 영향이 큰 구간을 먼저 최적화하는 방식으로 진행했다.

핵심 성과:

- 메인 메뉴 초기 과적재 완화
- 추가기능 서브뷰 중복 구조 정리
- 조직도 반복 전사 조회 감소
- 관련 회귀 테스트까지 갱신 완료

다음 단계는 대형 단일 파일인 `근무표자동편성`, `메신저`, `게시판`을 기능 단위로 쪼개는 리팩터링이다.

## 9. 2차 추가 최적화

2차 작업에서는 입력 지연과 재계산 비용이 큰 `메신저`, `게시판`을 추가로 정리했다.

### 9-1. 메신저 검색 지연 계산

파일: `app/main/기능부품/메신저.tsx`

- `omniSearch`, `chatSearch`, `addMemberSearch`에 `useDeferredValue` 적용
- 사이드바 방 이름 검색용 label map 메모화
- 공유 미디어/링크 미리보기 목록 메모화

효과:

- 방 검색 타이핑 시 즉시 전체 목록 재계산 부담 완화
- 대화 검색 입력 시 타이핑 끊김 감소
- 드로어 열림 상태에서 반복 `filter().slice()` 호출 감소

### 9-2. 게시판 일정 캘린더 메모화

파일: `app/main/기능부품/게시판.tsx`

- 일정 검색어에 `useDeferredValue` 적용
- 수술/MRI 일정용 캘린더 데이터를 `useMemo`로 이동
- 비일정 게시판에서는 캘린더 계산 자체를 생략

효과:

- 일정 검색 입력 시 캘린더 전체 재계산 타이밍 완화
- JSX 내부 즉석 계산 감소
- 일정 게시판 외 화면에서 불필요한 날짜 계산 제거

### 9-3. 추가 검증

- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\메신저.tsx" "C:\Users\baek_\newmso\app\main\기능부품\게시판.tsx"`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `npx playwright test tests/e2e/chat-detailed-walkthrough.desktop.spec.ts tests/e2e/chat-deep-actions.desktop.spec.ts tests/e2e/chat-reverse-actions.desktop.spec.ts tests/e2e/chat-advanced-actions.desktop.spec.ts --reporter=line`
- `npx playwright test tests/e2e/board-detailed-walkthrough.desktop.spec.ts --reporter=line`

결과:

- lint 통과
- type check 통과
- build 통과
- 채팅 관련 4건 통과
- 게시판 상세 1건 통과

## 10. 3rd Optimization

This phase focused on safe performance cleanup inside the roster planner without rewriting the whole file structure.

### 10-1. Target
- `app/main/기능부품/근무표자동편성.tsx`

### 10-2. Changes
- Stabilized heavy interaction handlers with `useCallback`
  - `setManualAssignment`
  - `cycleManualAssignment`
  - `jumpToRosterWarningTarget`
- Memoized the warning report panel render result
- Memoized the fairness board render result
- Kept the existing UI/behavior intact to avoid risky large-scale edits in the biggest planner file

### 10-3. Expected effect
- Fewer unnecessary re-renders when toggling manual edit mode or interacting with roster cells
- Reduced re-creation cost for warning/fairness side panels when unrelated planner state changes
- Safer foundation for the next refactor step, which should split the planner into smaller modules

### 10-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성.tsx"`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `npx playwright test tests/e2e/shift-planner.desktop.spec.ts tests/e2e/shift-planner-advanced-rules.desktop.spec.ts --reporter=line`

Result:
- lint passed
- type check passed
- production build passed
- shift planner Playwright 11 tests passed

## 19. 12th Optimization

This round prioritized safe recovery first, then continued with a low-risk interaction optimization.

### 19-1. Target
- `app/main/기능부품/근무표자동편성.tsx`
- `app/main/기능부품/추가기능.tsx`

### 19-2. Changes
- Recovered `근무표자동편성.tsx` back to the stable HEAD version after an encoding-sensitive dead-code cleanup attempt proved unsafe on this large file
- Kept the planner behavior stable and revalidated the full shift-planner flow instead of forcing a risky partial cleanup
- Stabilized extra-features local-storage and navigation handlers with `useCallback`
  - `persistRecent`
  - `persistFavorites`
  - `toggleFavorite`
  - `handleFeatureClick`
  - `getFeatureCardTestId`

### 19-3. Expected effect
- Prevented a high-risk regression in the heaviest planner screen by returning it to a known-good baseline
- Reduced handler churn in the extra-features dashboard when favorites, recent items, and subview routing update
- Kept menu-card interactions smoother without touching sensitive business logic

### 19-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\추가기능.tsx" "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성.tsx"`
- `npm run build`
- `npx tsc --noEmit --pretty false`
- `npx playwright test tests/e2e/extra-features-detail.desktop.spec.ts tests/e2e/extra-features-deep-actions.desktop.spec.ts tests/e2e/shift-planner.desktop.spec.ts tests/e2e/shift-planner-advanced-rules.desktop.spec.ts --reporter=line`

Result:
- lint passed
- type check passed
- production build passed
- extra features and shift planner Playwright 18 tests passed

## 20. 13th Optimization

This round focused on safer UI-level render optimization in board details and the extra-features dashboard.

### 20-1. Target
- `app/main/기능부품/게시판.tsx`
- `app/main/기능부품/추가기능.tsx`

### 20-2. Changes
- Board
  - extracted selected-post comment data into memoized structures:
    - `selectedPostComments`
    - `selectedPostCommentTree`
  - stopped rebuilding root/reply comment trees inline inside the detail modal render
  - promoted the comment row type into a reusable top-level type for the memoized path
- Extra features
  - stabilized more card-list helpers with `useCallback`
    - `getCardStyle`
    - `renderCard`
  - kept favorites and recent-feature card rendering on a more stable function path

### 20-3. Expected effect
- Less repeated work when opening board details with many comments or replies
- Smoother board detail modal updates when unrelated board state changes
- Reduced handler and render-function churn in the extra-features dashboard
- Slightly steadier card-grid interaction when favorites or recent features update

### 20-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\게시판.tsx" "C:\Users\baek_\newmso\app\main\기능부품\추가기능.tsx"`
- `npm run build`
- `npx tsc --noEmit --pretty false`
- `npx playwright test tests/e2e/board-detailed-walkthrough.desktop.spec.ts tests/e2e/extra-features-detail.desktop.spec.ts tests/e2e/extra-features-deep-actions.desktop.spec.ts --reporter=line`

Result:
- lint passed
- production build passed
- type check passed
- board and extra-features Playwright 8 tests passed

## 21. 14th Optimization

This round focused on reducing repeated work in the chat sidebar.

### 21-1. Target
- `app/main/기능부품/메신저.tsx`

### 21-2. Changes
- Added a memoized `allKnownStaffMap` for direct id-based staff lookups
- Switched `findKnownStaffById` from array scanning to map lookup
- Added a memoized `sidebarRoomItems` projection that precomputes:
  - room id
  - unread count
  - selected state
  - notice-channel state
  - room label
  - preview text
  - peer online state
  - pinned/hidden state
- Simplified sidebar room rendering to consume the precomputed room-item data instead of recalculating label, preview, member ids, and peer presence inline for every render

### 21-3. Expected effect
- Less repeated per-room work when chat state changes
- Faster sidebar updates with many rooms or participant records
- Reduced render cost when unread counts, selection, or presence updates trigger a re-render

### 21-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\메신저.tsx"`
- `npm run build`
- `npx tsc --noEmit --pretty false`
- `npx playwright test tests/e2e/chat-detailed-walkthrough.desktop.spec.ts tests/e2e/chat-deep-actions.desktop.spec.ts tests/e2e/chat-reverse-actions.desktop.spec.ts tests/e2e/chat-advanced-actions.desktop.spec.ts --reporter=line`

Result:
- lint passed
- production build passed
- type check passed
- chat Playwright 4 tests passed

## 23. 16th Optimization

This round applied a low-risk optimization to board schedule aggregation and re-stabilized generated Next.js type artifacts.

### 23-1. Target
- `app/main/기능부품/게시판.tsx`

### 23-2. Changes
- Optimized `scheduleCalendarData` event grouping to avoid repeated array reallocation while building `eventsByDate`
  - switched from immutable `[...]` bucket rebuilding to in-place bucket initialization plus `push`
- Re-generated Next.js route types with `npx next typegen` so follow-up `tsc --noEmit` validation stayed clean after the optimization pass

### 23-3. Expected effect
- Lower allocation cost when building schedule-calendar event buckets for months with many posts
- Slightly smoother calendar rendering and board switching in schedule-heavy boards
- Cleaner validation workflow after build/type artifact drift

### 23-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\게시판.tsx"`
- `npm run build`
- `npx next typegen`
- `npx tsc --noEmit --pretty false`
- `npx playwright test tests/e2e/board-detailed-walkthrough.desktop.spec.ts --reporter=line`

Result:
- lint passed
- production build passed
- Next.js route types regenerated successfully
- type check passed
- board Playwright 1 test passed

## 22. 15th Optimization

This round focused on narrowing recomputation inside chat global search and timeline assembly.

### 22-1. Target
- `app/main/기능부품/메신저.tsx`

### 22-2. Changes
- Added a memoized `visibleRoomIds` list so chat global search no longer rebuilds room-id arrays inline each time the search action runs
- Wrapped `handleGlobalSearch` with `useCallback` and switched it to the memoized visible-room id list
- Split timeline preparation into smaller memoized stages:
  - `visibleTimelineMessages`
  - `selectedRoomPollTimelineItems`
  - `combinedTimeline`
- Reduced the scope of recalculation so message filtering and room-poll projection can update independently before final timeline merge/sort

### 22-3. Expected effect
- Less repeated work when executing chat-wide message search
- Reduced timeline recomputation cost when only chat search text changes
- Reduced poll/timeline merge churn when only selected-room poll data changes
- Smoother room switching and timeline search interaction

### 22-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\메신저.tsx"`
- `npm run build`
- `npx tsc --noEmit --pretty false`
- `npx playwright test tests/e2e/chat-detailed-walkthrough.desktop.spec.ts tests/e2e/chat-deep-actions.desktop.spec.ts tests/e2e/chat-reverse-actions.desktop.spec.ts tests/e2e/chat-advanced-actions.desktop.spec.ts --reporter=line`

Result:
- lint passed
- production build passed
- type check passed
- chat Playwright 4 tests passed

## 18. 11th Optimization

This round extracted the planner status-card summary into a shared panel.

### 18-1. Target
- `app/main/기능부품/근무표자동편성.tsx`
- `app/main/기능부품/근무표자동편성패널.tsx`

### 18-2. Changes
- Added `RosterPlannerStatsPanel`
- Switched the active planner stats-card render path to the extracted memoized component
- Left the older inline status-card block behind a disabled guard for safe migration

### 18-3. Expected effect
- Less repeated large-card JSX inside the main planner file
- Cleaner separation between planner summary data and UI card rendering
- Simpler follow-up cleanup when removing the remaining disabled legacy blocks

### 18-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성.tsx" "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성패널.tsx" "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성미리보기표.tsx"`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `npx playwright test tests/e2e/shift-planner.desktop.spec.ts tests/e2e/shift-planner-advanced-rules.desktop.spec.ts --reporter=line`

Result:
- lint passed
- type check passed
- production build passed
- shift planner Playwright 11 tests passed

## 17. 10th Optimization

This round reduced duplicated Gemini recommendation rendering in the roster planner.

### 17-1. Target
- `app/main/기능부품/근무표자동편성.tsx`
- `app/main/기능부품/근무표자동편성패널.tsx`

### 17-2. Changes
- Added shared extracted summary panels:
  - `RosterGenerationSummaryPanel`
  - `RosterGeminiSummaryPanel`
- Introduced resolved summary values in the planner:
  - `resolvedGeminiSummary`
  - `resolvedLeaveSummary`
- Switched the active summary render path to the extracted memoized panels
- Left the older inline summary blocks behind disabled guards for safe migration in this pass

### 17-3. Expected effect
- Less duplicated JSX for Gemini recommendation output
- Cleaner separation between recommendation data and summary rendering
- Simpler next cleanup step when removing the remaining disabled inline legacy blocks

### 17-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성.tsx" "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성패널.tsx" "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성미리보기표.tsx"`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `npx playwright test tests/e2e/shift-planner.desktop.spec.ts tests/e2e/shift-planner-advanced-rules.desktop.spec.ts --reporter=line`

Result:
- lint passed
- type check passed
- production build passed
- shift planner Playwright 11 tests passed

## 16. 9th Optimization

This round stabilized the extracted roster panel and preview modules after the previous split.

### 16-1. Target
- `app/main/기능부품/근무표자동편성.tsx`
- `app/main/기능부품/근무표자동편성패널.tsx`
- `app/main/기능부품/근무표자동편성미리보기표.tsx`

### 16-2. Changes
- Recreated the extracted roster panel and preview table modules cleanly
- Kept the active planner render path on the extracted components
- Preserved the slimmer preview-table props mapping introduced in the prior pass
- Revalidated the split so the planner keeps using the extracted rendering path without regression

### 16-3. Expected effect
- More stable extracted modules for subsequent cleanup work
- Cleaner foundation for the next pass that removes the remaining disabled legacy preview JSX
- Lower risk of regressions while continuing planner decomposition

### 16-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성.tsx" "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성패널.tsx" "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성미리보기표.tsx"`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `npx playwright test tests/e2e/shift-planner.desktop.spec.ts tests/e2e/shift-planner-advanced-rules.desktop.spec.ts --reporter=line`

Result:
- lint passed
- type check passed
- production build passed
- shift planner Playwright 11 tests passed

## 15. 8th Optimization

This round made the extracted roster preview table lighter at runtime.

### 15-1. Target
- `app/main/기능부품/근무표자동편성.tsx`
- `app/main/기능부품/근무표자동편성미리보기표.tsx`

### 15-2. Changes
- Added a lightweight `rosterPreviewTableRows` mapping layer
- Passed only the fields the preview table actually renders
  - slim staff payload
  - pattern label only
  - precomputed department label
  - cells and counts
- Updated the memoized preview table panel to depend on the slim row list instead of the full planner row objects

### 15-3. Expected effect
- Lower prop weight for the extracted preview table component
- Less coupling between the large planner state and the table renderer
- Safer path toward removing the remaining disabled legacy preview block in a later cleanup pass

### 15-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성.tsx" "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성미리보기표.tsx"`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `npx playwright test tests/e2e/shift-planner.desktop.spec.ts tests/e2e/shift-planner-advanced-rules.desktop.spec.ts --reporter=line`

Result:
- lint passed
- type check passed
- production build passed
- shift planner Playwright 11 tests passed

## 14. 7th Optimization

This round targeted the heaviest roster preview table render.

### 14-1. Target
- `app/main/기능부품/근무표자동편성.tsx`
- `app/main/기능부품/근무표자동편성미리보기표.tsx`

### 14-2. Changes
- Extracted the monthly roster preview table into a dedicated memoized component
- Moved preview-table view types into the new component module and reused them from the planner
- Added `departmentName` into preview row data so the table renderer no longer needs planner helper lookups
- Switched the active render path to the extracted component
- Kept the old inline table behind a disabled guard for a safe migration step in this pass

### 14-3. Expected effect
- Reduced render weight in the main planner component
- Cleaner separation between roster generation data and the large preview-table JSX tree
- Lower risk for the next refactor, which can fully remove the disabled legacy table block

### 14-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성.tsx" "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성미리보기표.tsx"`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `npx playwright test tests/e2e/shift-planner.desktop.spec.ts tests/e2e/shift-planner-advanced-rules.desktop.spec.ts --reporter=line`

Result:
- lint passed
- type check passed
- production build passed
- shift planner Playwright 11 tests passed

## 11. 4th Optimization

This round focused on the main shell and menu-navigation layer.

### 11-1. Target
- `app/main/page.tsx`

### 11-2. Changes
- Added memoized company lookup maps
  - `companyById`
  - `companyIdByName`
- Added memoized URL navigation intent parsing from `searchParams`
  - avoids repeating the same `.get(...).trim()` work across multiple effects
- Converted `fetchERPData` to `useCallback`
- Reused stable handlers for:
  - menu change
  - subview change
  - refresh
- Memoized submenu group list with `currentSubMenuGroups`
  - reused in grouped admin/inventory submenu rendering

### 11-3. Expected effect
- Less churn when switching menus and subviews in the main shell
- Reduced repeated company lookup work when syncing selected company state
- Reduced repeated parsing cost for navigation query parameters
- More stable props passed into shell-level child components

### 11-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\page.tsx"`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `npx playwright test tests/e2e/manual-audit.desktop.spec.ts tests/e2e/notification-open.desktop.spec.ts tests/e2e/extra-features-detail.desktop.spec.ts --reporter=line`

Result:
- lint passed
- type check passed
- production build passed
- shell/navigation Playwright 3 tests passed

## 12. 5th Optimization

This round focused on reducing shell-level churn in the sidebar and notification dropdown.

### 12-1. Target
- `app/main/기능부품/조직도서브/조직도측면창.tsx`
- `app/main/기능부품/NotificationCenter.tsx`

### 12-2. Changes
- Sidebar
  - memoized `visibleMenus`
  - stabilized `handleMenuClick` with `useCallback`
- Notification center
  - memoized `unread` and `read` notification groups
  - stabilized:
    - `markAllAsRead`
    - `markAsRead`
    - `openMyPage`
    - `openMyNotifications`
    - `handleNotiClick`

### 12-3. Expected effect
- Less repeated menu filtering work whenever shell state updates
- Reduced dropdown list recomputation when only unrelated shell state changes
- More stable handler props around the notification panel and sidebar button tree
- Smoother shell interaction when opening alerts or switching menus repeatedly

### 12-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\조직도서브\조직도측면창.tsx" "C:\Users\baek_\newmso\app\main\기능부품\NotificationCenter.tsx"`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `npx playwright test tests/e2e/manual-audit.desktop.spec.ts tests/e2e/notification-open.desktop.spec.ts --reporter=line`

Result:
- lint passed
- type check passed
- production build passed
- notification/shell Playwright 2 tests passed

## 13. 6th Optimization

This round moved heavy roster support panels into a dedicated component module.

### 13-1. Target
- `app/main/기능부품/근무표자동편성.tsx`
- `app/main/기능부품/근무표자동편성패널.tsx`

### 13-2. Changes
- Extracted the roster warning report panel into a standalone memoized component
- Extracted the fairness scoreboard into a standalone memoized component
- Reused shared panel data types across the planner and the new panel module
- Switched the planner render path to the extracted panel components while keeping existing computed data intact

### 13-3. Expected effect
- Reduced JSX weight inside the biggest planner file
- Better separation between schedule generation logic and support-panel rendering
- Safer foundation for the next split, which should target the roster preview table itself
- More maintainable type reuse for warning and fairness panel data

### 13-4. Verification
- `npx eslint "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성.tsx" "C:\Users\baek_\newmso\app\main\기능부품\근무표자동편성패널.tsx"`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `npx playwright test tests/e2e/shift-planner.desktop.spec.ts tests/e2e/shift-planner-advanced-rules.desktop.spec.ts --reporter=line`

Result:
- lint passed
- type check passed
- production build passed
- shift planner Playwright 11 tests passed

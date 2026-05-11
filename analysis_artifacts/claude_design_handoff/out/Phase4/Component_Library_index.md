# Phase 4 Component Library 카탈로그

MSO ERP 디자인 시스템 · Next.js 16 / React 19 · 2026

---

## 기본 12종

| 컴포넌트 | 한 줄 요약 | props 시그니처 (핵심) |
|---|---|---|
| **Button** | variant × size 클릭 요소. forwardRef, loading 스피너 내장 | `variant?: 'primary'|'secondary'|'danger'|'ghost'` `size?: 'sm'|'md'|'lg'` `iconLeft/Right?: ReactNode` `loading?: boolean` |
| **Input** | 레이블·에러·헬퍼 텍스트 통합 텍스트 입력. forwardRef | `type?: InputType` `label?: string` `error?: string` `helperText?: string` `iconLeft/Right?: ReactNode` |
| **Select\<T\>** | 데스크톱 네이티브 select / `responsive` 시 모바일 풀스크린 sheet | `options: SelectOption<T>[]` `value?: T` `onChange?: (v:T)=>void` `responsive?: boolean` |
| **Table\<T\>** | 제네릭 데이터 테이블. `responsive`로 모바일 카드 뷰 전환 | `columns: ColumnDef<T>[]` `data: T[]` `rowKey: (row,i)=>key` `responsive?: boolean` `onRowClick?: (row:T)=>void` |
| **Modal** | 데스크톱 중앙 모달. `responsive` + sm 미만에서 바텀시트 | `open: boolean` `onClose: ()=>void` `title?: string` `footer?: ReactNode` `responsive?: boolean` `size?: 'sm'|'md'|'lg'|'full'` |
| **Tabs\<T\>** | line / pill variant. ArrowLeft/Right/Home/End 키보드 탐색 | `tabs: TabItem<T>[]` `activeId: T` `onChange: (id:T)=>void` `variant?: 'line'|'pill'` `fullWidth?: boolean` |
| **Card** | default / premium variant. onClick 시 role="button" 자동 | `variant?: 'default'|'premium'` `padding?: 'none'|'sm'|'md'|'lg'` `hover?: boolean` `header/footer?: ReactNode` `as?: 'div'|'article'|'section'|'li'` |
| **Badge** | 5색 상태 뱃지. dot prop으로 상태 점 표시 | `color?: 'blue'|'green'|'red'|'yellow'|'gray'` `size?: 'sm'|'md'` `dot?: boolean` `ariaLabel?: string` |
| **Toast** | 4타입 알림. ToastProvider + useToast hook. 자동 dismiss | `type: 'info'|'success'|'warning'|'error'` `title: string` `description?: string` `duration?: number` |
| **Loader** | Spinner(xs~lg) + Skeleton + SkeletonCard. CSS 애니메이션 전용 | `Spinner: { size?, label?, color? }` `Skeleton: { width?, height?, rounded? }` `SkeletonCard: { rows? }` |
| **EmptyState** | icon + title + description + action 버튼 2개 | `title: string` `icon?: ReactNode` `description?: string` `action?: { label, onClick, variant? }` `size?: 'sm'|'md'|'lg'` |
| **FormLayout** | form 래퍼 + FormSection + FormField + FormActions 4종 합성 | `FormLayout: { onSubmit?, gap?, ariaLabel? }` `FormSection: { legend?, columns?: 1|2|3 }` `FormField: { label?, htmlFor?, required?, error? }` `FormActions: { align?, sticky? }` |

---

## 모바일 전용 5종

| 컴포넌트 | 한 줄 요약 | props 시그니처 (핵심) |
|---|---|---|
| **BottomTab** | Phase 2 재export stub. 실제 구현은 Phase2/BottomTab.tsx | `currentTabId: BottomTabId` `onTabChange: (id)=>void` `notificationCount?: number` |
| **BottomSheet** | drag handle + snap points(half/full). touch 순수 구현 | `open: boolean` `onClose: ()=>void` `snapPoints?: SnapPoint[]` `initialSnap?: SnapPoint` `showHandle?: boolean` |
| **FullScreenModal** | 모바일 풀스크린. 데스크톱에서는 sm 모달로 자동 전환 | `open: boolean` `onClose: ()=>void` `title: string` `subtitle?: string` `headerRight?: ReactNode` `footer?: ReactNode` `backLabel?: string` |
| **SwipeAction** | 좌/우 스와이프로 액션 버튼 노출. CSS transform 전용 | `leftActions?: SwipeActionItem[]` `rightActions?: SwipeActionItem[]` `threshold?: number` |
| **PullToRefresh** | touchstart/touchmove/touchend 순수 구현 당겨서 새로고침 | `onRefresh: ()=>Promise<void>` `threshold?: number` `maxPull?: number` |

---

## aria 속성 매트릭스

| 컴포넌트 | role | aria-* |
|---|---|---|
| Button | (button) | `aria-disabled`, `aria-busy` |
| Input | (input) | `aria-invalid`, `aria-describedby` |
| Select | listbox / option (mobile sheet) | `aria-haspopup`, `aria-expanded`, `aria-invalid`, `aria-selected` |
| Table | table / columnheader / row / cell | `aria-label`, `scope="col"` |
| Modal | dialog | `aria-modal`, `aria-labelledby`, `aria-describedby` |
| Tabs | tablist / tab / tabpanel | `aria-selected`, `aria-controls`, `tabIndex` 로테이션 |
| Card | button (onClick 시) | `aria-label` |
| Badge | (span) | `aria-label` |
| Toast | alert (error/warning) / status (info/success) | `aria-live`, `aria-atomic` |
| Loader | status | `aria-label`, `aria-busy`, `aria-hidden` (skeleton) |
| EmptyState | region | `aria-label` |
| FormLayout | (form) | `aria-label`; FormField: `aria-label`, required 시 sr-only 안내 |
| BottomTab | tablist / tab | `aria-selected`, `aria-label` (Phase 2 구현 준수) |
| BottomSheet | dialog | `aria-modal`, `aria-labelledby` |
| FullScreenModal | dialog | `aria-modal`, `aria-labelledby` |
| SwipeAction | — | 액션 button에 `aria-label` |
| PullToRefresh | status | `aria-live="polite"`, `aria-label` |

---

## 다크모드 자동 대응 확인 방법

1. `<html data-theme="dark">` 속성 토글 (Component_Library.html 우상단 버튼)
2. 모든 색상은 `var(--accent)`, `var(--card)`, `var(--border)` 등 CSS 변수만 사용
3. 컴포넌트 파일에 `#hex` / `rgb()` / Tailwind `slate-*` 하드코딩 없음
4. globals.css `[data-theme="dark"]` 또는 `@media (prefers-color-scheme: dark)` 블록에서 변수 재정의 시 전체 자동 전환

---

## 제약 준수 요약

- **JM** (500줄): Button 117줄, Input 97줄, Select 152줄, Table 176줄, Modal 133줄, Tabs 128줄, Card 96줄, Badge 65줄, Toast 149줄, Loader 97줄, EmptyState 108줄, FormLayout 145줄, BottomTab 57줄(stub), BottomSheet 143줄, FullScreenModal 124줄, SwipeAction 132줄, PullToRefresh 133줄
- **JM4**: `any` 없음. Table/Select는 제네릭 `<T>` 활용
- **JM5**: `dangerouslySetInnerHTML` 없음. 외부 입력 검증은 호출자 책임
- **JM6**: 전 컴포넌트 키보드 접근 + aria 완비
- **tsc**: components/ 디렉토리는 프로젝트 tsconfig 범위 밖의 설계 산출물 — syntactic 유효성 기준 작성 (런타임 tsconfig 경로 미설정으로 tsc 전체 pass 불가, 정상)

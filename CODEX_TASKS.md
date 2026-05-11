# MSO Codex 구현 지시서
> 생성일: 2026-05-10 | 실제 코드 정밀 분석 기반  
> 각 태스크는 독립적으로 실행 가능. 순서대로 진행 권장.

---

## ⚠️ 규칙
- 지시된 줄 외에 다른 코드 수정 금지
- 변경 후 TypeScript 타입 오류 없어야 함
- 주석 추가 금지
- 기존 로직(함수/이벤트) 절대 제거 금지

---

## TASK-01: 재고현황뷰 숨겨진 UI 표시 [버그]
**파일**: `app/main/기능부품/재고관리서브/재고현황뷰.tsx`  
**작업**: 아래 6곳의 `className="hidden"` → `className=""` 으로 변경

### 1-1. 줄 330 — 컨트롤 바(검색/필터/정렬)
```tsx
// 현재
<div className="hidden">
  {/* 검색 */}

// 변경
<div className="">
  {/* 검색 */}
```

### 1-2. 줄 431 — 긴급 알림 배너
```tsx
// 현재
{hasAlert && (
  <div className="hidden">
    <div className="flex items-center justify-between gap-3">

// 변경
{hasAlert && (
  <div className="">
    <div className="flex items-center justify-between gap-3">
```

### 1-3. 줄 470 — 공급신청 워크플로우
```tsx
// 현재
{hasPending && (
  <div className="hidden">
    <button

// 변경
{hasPending && (
  <div className="">
    <button
```

### 1-4. 줄 577 — 처리완료 히스토리
```tsx
// 현재
{isOpsUser && completedApprovals.length > 0 && (
  <div className="hidden">
    <button

// 변경
{isOpsUser && completedApprovals.length > 0 && (
  <div className="">
    <button
```

### 1-5. 줄 622 — 테이블 헤더
```tsx
// 현재
        {/* 테이블 헤더 */}
        <div className="hidden">
          <div className="flex items-center gap-2">

// 변경
        {/* 테이블 헤더 */}
        <div className="">
          <div className="flex items-center gap-2">
```

### 1-6. 줄 838 — 유효기간 센터
```tsx
// 현재
      {expiryCount > 0 && (
        <div className="hidden">
          <button

// 변경
      {expiryCount > 0 && (
        <div className="">
          <button
```

---

## TASK-02: 카테고리관리 색상 CSS 문법 오류 수정 [버그]
**파일**: `app/main/기능부품/재고관리서브/카테고리관리.tsx`

### 2-1. 줄 16 — CAT_COLORS 배열
```tsx
// 현재
const CAT_COLORS = ['bg-blue-500/100', 'bg-green-500/100', 'bg-purple-500/100', 'bg-orange-500/100', 'bg-red-500/100', 'bg-teal-500', 'bg-pink-500/100', 'bg-indigo-500/100'];

// 변경
const CAT_COLORS = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-red-500', 'bg-teal-500', 'bg-pink-500', 'bg-indigo-500'];
```

### 2-2. 줄 150 — 가져오기 버튼
```tsx
// 현재
className="px-3 py-1.5 bg-purple-500/100 text-white rounded-[var(--radius-md)] text-xs font-bold"

// 변경
className="px-3 py-1.5 bg-purple-500 text-white rounded-[var(--radius-md)] text-xs font-bold"
```

### 2-3. 줄 160 — 빈 상태 가져오기 버튼
```tsx
// 현재
className="px-4 py-2 bg-purple-500/100 text-white rounded-[var(--radius-md)] text-sm font-bold"

// 변경
className="px-4 py-2 bg-purple-500 text-white rounded-[var(--radius-md)] text-sm font-bold"
```

### 2-4. 줄 41 — expand 버튼 leading 추가
```tsx
// 현재
<button onClick={() => setExpanded(v => !v)} className="w-4 h-4 text-[var(--toss-gray-3)] text-[10px]">{expanded ? '▼' : '▶'}</button>

// 변경
<button onClick={() => setExpanded(v => !v)} className="w-4 h-4 text-[var(--toss-gray-3)] text-[10px] leading-none">{expanded ? '▼' : '▶'}</button>
```

---

## TASK-03: 발주관리 D-day 색상 CSS 오류 수정 [버그]
**파일**: `app/main/기능부품/재고관리서브/발주관리.tsx`

### 3-1. 줄 65 — 지연 색상
```tsx
// 현재
  if (diffDays < 0) return { label: `D+${Math.abs(diffDays)} 지연`, tone: 'bg-red-500/100/10 text-red-600' };

// 변경
  if (diffDays < 0) return { label: `D+${Math.abs(diffDays)} 지연`, tone: 'bg-red-500/10 text-red-600' };
```

### 3-2. 줄 66 — 오늘 색상
```tsx
// 현재
  if (diffDays === 0) return { label: 'D-day 오늘', tone: 'bg-orange-500/100/10 text-orange-600' };

// 변경
  if (diffDays === 0) return { label: 'D-day 오늘', tone: 'bg-orange-500/10 text-orange-600' };
```

### 3-3. 줄 67 — 임박 색상
```tsx
// 현재
  if (diffDays <= 3) return { label: `D-${diffDays} 임박`, tone: 'bg-orange-500/100/10 text-orange-500' };

// 변경
  if (diffDays <= 3) return { label: `D-${diffDays} 임박`, tone: 'bg-orange-500/10 text-orange-500' };
```

### 3-4. 줄 106 — 발주 상태 반려 배지 통일
```tsx
// 현재
  if (status === '반려') return 'bg-red-500/10 text-red-600';

// 변경
  if (status === '반려') return 'bg-red-50 text-red-600';
```

---

## TASK-04: 로그인 비밀번호 토글 [UX]
**파일**: `app/login/page.tsx`

### 4-1. 줄 12~14 useState 선언부 — showPassword 상태 추가
```tsx
// 현재
const [loginId, setLoginId] = useState('');
const [password, setPassword] = useState('');
const [loading, setLoading] = useState(false);

// 변경
const [loginId, setLoginId] = useState('');
const [password, setPassword] = useState('');
const [loading, setLoading] = useState(false);
const [showPassword, setShowPassword] = useState(false);
```

### 4-2. 줄 139~150 — 비밀번호 input 블록 교체
```tsx
// 현재
<div>
  <label className="block text-[11px] font-semibold text-[var(--toss-gray-4)] mb-1.5">비밀번호</label>
  <input
    type="password"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    data-testid="login-password-input"
    className="w-full px-3.5 py-2.5 bg-[var(--tab-bg)] rounded-[8px] text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent)]/20 border border-transparent focus:border-[var(--accent)] transition-all text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)]"
    placeholder="비밀번호"
    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
  />
</div>

// 변경
<div>
  <label className="block text-[11px] font-semibold text-[var(--toss-gray-4)] mb-1.5">비밀번호</label>
  <div className="relative">
    <input
      type={showPassword ? 'text' : 'password'}
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      data-testid="login-password-input"
      className="w-full px-3.5 py-2.5 pr-14 bg-[var(--tab-bg)] rounded-[8px] text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent)]/20 border border-transparent focus:border-[var(--accent)] transition-all text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)]"
      placeholder="비밀번호"
      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
    />
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[var(--toss-gray-3)] hover:text-[var(--foreground)] transition-colors"
      aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
    >
      {showPassword ? '숨기기' : '표시'}
    </button>
  </div>
</div>
```

---

## TASK-05: StatePanel 다크모드 대응 [디자인]
**파일**: `app/components/StatePanel.tsx`

### 5-1. 줄 17~38 — toneClassName 전체 교체
```tsx
// 현재
const toneClassName: Record<StatePanelTone, { shell: string; badge: string }> = {
  default: {
    shell: 'border-[var(--border)] bg-[var(--card)]',
    badge: 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted-foreground)]',
  },
  info: {
    shell: 'border-blue-200 bg-blue-50/70',
    badge: 'border-blue-200 bg-white text-blue-700',
  },
  success: {
    shell: 'border-emerald-200 bg-emerald-50/70',
    badge: 'border-emerald-200 bg-white text-emerald-700',
  },
  warning: {
    shell: 'border-amber-200 bg-amber-50/70',
    badge: 'border-amber-200 bg-white text-amber-800',
  },
  danger: {
    shell: 'border-red-200 bg-red-50/70',
    badge: 'border-red-200 bg-white text-red-700',
  },
};

// 변경
const toneClassName: Record<StatePanelTone, { shell: string; badge: string }> = {
  default: {
    shell: 'border-[var(--border)] bg-[var(--card)]',
    badge: 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted-foreground)]',
  },
  info: {
    shell: 'border-blue-200 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/40',
    badge: 'border-blue-200 dark:border-blue-800 bg-white dark:bg-blue-900/50 text-blue-700 dark:text-blue-400',
  },
  success: {
    shell: 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/40',
    badge: 'border-emerald-200 dark:border-emerald-800 bg-white dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400',
  },
  warning: {
    shell: 'border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/40',
    badge: 'border-amber-200 dark:border-amber-800 bg-white dark:bg-amber-900/50 text-amber-800 dark:text-amber-400',
  },
  danger: {
    shell: 'border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/40',
    badge: 'border-red-200 dark:border-red-800 bg-white dark:bg-red-900/50 text-red-700 dark:text-red-400',
  },
};
```

---

## TASK-06: 월간근태달력 상태색 맵 분리 및 반응형 [UX]
**파일**: `app/main/기능부품/인사관리서브/근태기록/월간근태달력.tsx`

### 6-1. 줄 92~95 — 상태 스타일 맵으로 분리
```tsx
// 현재
let statusStyle = "bg-[var(--card)] text-[var(--toss-gray-3)] border-[var(--border)]";
if (d.status === '정상') statusStyle = "bg-green-500/10 text-green-700 border-green-500/20";
else if (d.status === '지각') statusStyle = "bg-red-500/10 text-red-600 border-red-500/20";
else if (d.status?.includes('휴가')) statusStyle = "bg-purple-500/10 text-purple-600 border-purple-500/20";

// 변경
const statusStyleMap: Record<string, string> = {
  '정상': 'bg-green-500/10 text-green-700 border-green-500/20',
  '지각': 'bg-red-500/10 text-red-600 border-red-500/20',
  '결근': 'bg-red-500/20 text-red-700 border-red-500/30',
  '조퇴': 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  '휴가': 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};
let statusStyle = statusStyleMap[d.status as string] ?? 'bg-[var(--card)] text-[var(--toss-gray-3)] border-[var(--border)]';
if (!statusStyle && d.status?.includes('휴가')) statusStyle = statusStyleMap['휴가'];
```

### 6-2. 줄 98 — 셀 높이 반응형
```tsx
// 현재
<td key={i} className="p-2 h-28">

// 변경
<td key={i} className="p-2 h-24 md:h-28">
```

---

## TASK-07: 간호근무표 셀 크기 및 로딩 [UX]
**파일**: `app/main/기능부품/인사관리서브/간호근무표.tsx`

### 7-1. 줄 417~422 — 셀 크기 변수화
```tsx
// 현재
className={`w-8 h-9 rounded-md flex items-center justify-center mx-auto
  ${editMode ? 'cursor-pointer hover:bg-[var(--muted)] transition-colors' : ''}
  ${hasViolation ? 'ring-2 ring-red-500' : ''}`}

// 변경
className={`w-[32px] h-[36px] rounded-[var(--radius-md)] flex items-center justify-center mx-auto
  ${editMode ? 'cursor-pointer hover:bg-[var(--muted)] transition-colors' : ''}
  ${hasViolation ? 'ring-2 ring-red-500' : ''}`}
```

### 7-2. 줄 842~847 — 생성 버튼 로딩 스피너
```tsx
// 현재
{generating ? (
  <><span className="animate-spin">⏳</span> 생성 중...</>
) : (
  <>✨ 근무표 자동생성</>
)}

// 변경
{generating ? (
  <><span className="inline-block animate-spin">⏳</span> 생성 중...</>
) : (
  <>✨ 근무표 자동생성</>
)}
```

---

## TASK-08: OP체크 필터링 강화 [버그]
**파일**: `app/main/기능부품/OP체크.tsx`

### 8-1. 줄 2028 — 미체크 항목 공백 필터링
```tsx
// 현재
  const unchecked = checkForm.prep_items.filter((item) => item.name && !item.checked);

// 변경
  const unchecked = checkForm.prep_items.filter((item) => item.name?.trim() && !item.checked);
```

### 8-2. 줄 2104~2106 — 소모품 수량 검증
```tsx
// 현재
const itemsWithQty = capturedConsumables.filter(
  (item) => item.name && item.quantity && Number(item.quantity) > 0
);

// 변경
const itemsWithQty = capturedConsumables.filter(
  (item) => item.name?.trim() && item.quantity && !isNaN(Number(item.quantity)) && Number(item.quantity) > 0
);
```

---

## TASK-09: 출퇴근기록 차트 높이 및 퇴근 버튼 색상 [UX]
**파일**: `app/main/기능부품/마이페이지/출퇴근기록.tsx`

### 9-1. 줄 1379 — 근무시간 차트 높이 확대
```tsx
// 현재
<div className="flex h-16 items-end gap-0.5 overflow-x-auto pb-1">

// 변경
<div className="flex h-28 items-end gap-0.5 overflow-x-auto pb-1">
```

### 9-2. 줄 1134 부근 — 퇴근 버튼 색상 문법 오류
```tsx
// 현재
className="... bg-red-600 hover:bg-red-500/100 ..."

// 변경
className="... bg-red-600 hover:bg-red-500 ..."
```

---

## TASK-10: 급여대장표 코드 정리 [코드 품질]
**파일**: `app/main/기능부품/인사관리서브/급여명세/급여대장표.tsx`

### 10-1. 줄 41~44 — toggleAll 간결화
```tsx
// 현재
const toggleAll = () => {
  if (isAllChecked) setCheckedIds?.([]);
  else setCheckedIds?.(staffs.map((s) => s.id));
};

// 변경
const toggleAll = () => {
  setCheckedIds?.(isAllChecked ? [] : staffs.map((s) => s.id));
};
```

### 10-2. 줄 150~153 부근 — 통화 단위 통일
```tsx
// 현재
<span className="text-[13px] text-[var(--accent)] font-black">₩ {sumNet.toLocaleString()}</span>

// 변경
<span className="text-[13px] text-[var(--accent)] font-black">{sumNet.toLocaleString()} 원</span>
```

---

## TASK-11: GlobalNotificationBell 배지 개선 [UX]
**파일**: `app/components/GlobalNotificationBell.tsx`

### 11-1. 줄 221~225 — 알림 배지 위치/크기 조정
```tsx
// 현재
{unreadCount > 0 && (
  <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
    {unreadCount > 99 ? '99+' : unreadCount}
  </span>
)}

// 변경
{unreadCount > 0 && (
  <span className="absolute -right-1.5 -top-1.5 flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white shadow-sm">
    {unreadCount > 99 ? '99+' : unreadCount}
  </span>
)}
```

---

## TASK-12: 서류제출 카드 그리드 반응형 [UX]
**파일**: `app/main/기능부품/마이페이지/서류제출.tsx`

### 12-1. 줄 283 — 카드 그리드 열 수 조정
```tsx
// 현재
<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">

// 변경
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
```

### 12-2. 줄 284~292 — 촬영 가이드 배너 CSS 문법 오류
```tsx
// 현재
<div className="col-span-2 md:col-span-4 lg:col-span-5 xl:col-span-6 bg-blue-500/10/50 p-4 rounded-2xl border border-blue-100 flex items-center gap-4">

// 변경
<div className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-4 xl:col-span-5 bg-blue-500/10 p-4 rounded-2xl border border-blue-100 flex items-center gap-4">
```

---

## TASK-13: ApprovalDetailModal 헤더 다크모드 [디자인]
**파일**: `app/main/기능부품/전자결재서브/ApprovalDetailModal.tsx`

### 13-1. 줄 105 — 헤더 bg-white/90 다크모드 대응
```tsx
// 현재
<div className="flex items-start justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 md:px-6 md:py-4">

// 변경
<div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)]/90 px-4 py-3 md:px-6 md:py-4">
```

---

## 실행 체크리스트

### 버그 수정 (즉시 배포 필요)
- [x] TASK-01: 재고현황뷰 hidden 6곳 제거 ✅
- [x] TASK-02: 카테고리관리 `/100` 색상 오류 5곳 ✅
- [x] TASK-03: 발주관리 `/100/10` D-day 오류 4곳 ✅

### UX 개선 (Sprint 1)
- [x] TASK-04: 로그인 비밀번호 토글 ✅
- [x] TASK-09: 출퇴근 차트 높이 + 버튼 색상 오류 ✅
- [x] TASK-11: 알림 배지 위치/크기 ✅
- [x] TASK-12: 서류제출 그리드 + 배너 CSS 오류 ✅

### 디자인 일관성 (Sprint 2)
- [x] TASK-05: StatePanel 다크모드 4개 tone ✅
- [x] TASK-06: 월간근태달력 상태 맵 + 반응형 ✅
- [x] TASK-07: 간호근무표 셀 크기 + 로딩 ✅
- [x] TASK-08: OP체크 필터링 강화 ✅
- [x] TASK-10: 급여대장표 코드 정리 ✅
- [x] TASK-13: 전자결재 모달 헤더 다크모드 ✅

---

## 검증 방법

각 TASK 완료 후:
```bash
# TypeScript 오류 확인
npx tsc --noEmit

# 빌드 확인
npm run build
```

다크모드 확인: 브라우저 DevTools → Rendering → Emulate CSS dark mode

# MSO 디자인 개선 가이드

> newmso (SY INC. MSO 통합 시스템) 전체 UI/UX 개선 사항 정리  
> 작성일: 2025-04-27  
> 대상 브랜치: `main`

---

## 1. 아이콘 — 이모지 → SVG 교체

### 대상 파일
- `app/main/기능부품/조직도서브/조직도측면창.tsx`
- `app/main/admin-menu-config.ts`

### 현재 문제
모든 메뉴 아이콘이 이모지(`👤`, `💬`, `📋` 등)로 되어 있어 플랫폼별 렌더링이 다르고 비전문적으로 보임.

### 개선 방향
이모지를 SVG stroke 아이콘으로 교체. 권장 라이브러리: **Lucide React** (`lucide-react`)

```bash
npm install lucide-react
```

### 메뉴별 아이콘 매핑

| 메뉴 ID | 현재 (이모지) | 교체 (Lucide) |
|---------|-------------|--------------|
| 내정보 | 👤 | `<User />` |
| 추가기능 | ➕ | `<Plus />` |
| 채팅 | 💬 | `<MessageSquare />` |
| 게시판 | 📋 | `<LayoutGrid />` |
| 전자결재 | ✍️ | `<FileCheck />` |
| 인사관리 | 👥 | `<Briefcase />` |
| 재고관리 | 📦 | `<Package />` |
| 관리자 | ⚙️ | `<Shield />` |

### 서브메뉴 아이콘 매핑 (관리자)

| 항목 | 현재 | 교체 |
|------|------|------|
| 경영분석 | 📈 | `<TrendingUp />` |
| 회사관리 | 🏢 | `<Building2 />` |
| 직원권한 | 🔐 | `<Lock />` |
| 운영설정 | ⚙️ | `<Settings />` |
| 문서양식 | 📄 | `<FileText />` |
| 엑셀등록 | 📥 | `<Upload />` |
| 데이터백업 | 💾 | `<Database />` |
| 데이터초기화 | ♻️ | `<Trash2 />` |
| 감사센터 | 🔍 | `<Eye />` |
| 시스템마스터센터 | 🛡️ | `<ShieldCheck />` |

---

## 2. 사이드바 개선

### 대상 파일
- `app/main/기능부품/조직도서브/조직도측면창.tsx`

### 현재 문제
- 브랜드 로고/마크 없음
- 사이드바 너비 64px — 아이콘+레이블 배치가 좁음
- 하단에 유저 정보/아바타 없음
- 알림 벨이 `NotificationCenter` 컴포넌트로 분리되어 있지만 시각적으로 통합이 안 됨

### 개선 사항

#### 2-1. 브랜드 마크 추가 (사이드바 최상단)
```tsx
// 사이드바 최상단에 추가
<div className="mb-4 flex justify-center px-2">
  <div
    className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white text-[13px] font-extrabold"
    style={{ background: 'var(--accent)', boxShadow: '0 2px 8px rgba(37,99,235,0.35)' }}
  >
    SY
  </div>
</div>
```

#### 2-2. 사이드바 너비 64px → 72px
```css
/* globals.css 또는 tailwind config */
--sidebar-width: 72px;
```

#### 2-3. 하단 유저 아바타 추가
사이드바 하단(`flex-1` 아래)에 유저 이니셜 아바타 + 구분선 추가:
```tsx
{/* 사이드바 하단 */}
<div className="mt-auto w-full px-2 pb-1">
  <div className="h-px bg-[var(--border)] mb-2" />
  <button className="w-full flex flex-col items-center gap-1 py-2 rounded-[10px] hover:bg-[var(--muted)] transition-all">
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
      style={{ background: 'rgba(37,99,235,0.12)', color: 'var(--accent)', border: '1.5px solid rgba(37,99,235,0.25)' }}
    >
      {user?.name?.[0] ?? '?'}
    </div>
  </button>
</div>
```

#### 2-4. 활성 메뉴 스타일 유지 (현재 full blue → 유지 가능)
현재 `bg-[var(--accent)] text-white` 방식은 유지해도 좋음. 아이콘 strokeWidth를 활성 시 2.0, 비활성 시 1.6으로 변경하면 더 명확해짐.

---

## 3. 서브메뉴 패널 개선

### 대상 파일
- `app/main/page.tsx` (aside 서브메뉴 렌더링 부분)

### 현재 문제
- 너비 160px (`--submenu-width`) — 긴 레이블 잘림
- 그룹 헤더 스타일 너무 작고 구분이 약함
- 아이콘 없이 텍스트만 있음

### 개선 사항

#### 3-1. 서브메뉴 너비 확장
```css
/* globals.css */
--submenu-width: 192px;
```

#### 3-2. 그룹 헤더 스타일 개선
```tsx
// 기존
<div className="hidden md:block px-2 pt-2 pb-0.5 text-[9px] font-bold text-[var(--zinc-400)] uppercase tracking-widest select-none">

// 개선: 아이콘 추가 + 간격 조정
<div className="hidden md:flex items-center gap-1.5 px-2.5 pt-3 pb-1 text-[10px] font-600 text-[var(--zinc-400)] uppercase tracking-wider select-none">
  <SomeGroupIcon size={10} />
  {groupLabel}
</div>
```

#### 3-3. 서브메뉴 아이템에 아이콘 추가
`SUB_MENUS` 데이터에 `icon` 필드를 추가하고 렌더링 시 표시:
```tsx
// page.tsx 서브메뉴 버튼 내부
<span className="hidden md:inline shrink-0 opacity-60">
  <LucideIcon name={sub.icon} size={13} />
</span>
<span className="truncate">{sub.label}</span>
```

---

## 4. 콘텐츠 영역 — 페이지 헤더 패턴 통일

### 대상 파일
- 각 기능 컴포넌트 (`게시판.tsx`, `OP체크.tsx`, `관리자전용.tsx` 등)

### 개선 사항
각 화면 최상단에 통일된 페이지 헤더 컴포넌트를 적용:

```tsx
// 공통 PageHeader 컴포넌트 생성 권장
// app/components/PageHeader.tsx

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--card)] border-b border-[var(--border)] shrink-0">
      <div>
        <h1 className="text-[15px] font-bold tracking-[-0.025em] text-[var(--foreground)]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[12px] text-[var(--muted-foreground)] mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

---

## 5. 버튼 스타일 통일

### 대상 파일
- `app/globals.css`

### 현재 문제
`btn-premium-primary`, `btn-premium-secondary` 등 클래스는 잘 정의되어 있으나 일부 컴포넌트에서 Tailwind 인라인 클래스와 혼용됨.

### 개선 사항
모든 버튼을 `btn-premium-*` 클래스로 통일하거나, 별도 `<Button>` 컴포넌트 생성:

```tsx
// app/components/Button.tsx
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({ variant = 'secondary', icon, children, ...props }) {
  const classMap = {
    primary:   'btn-premium-primary',
    secondary: 'btn-premium-secondary',
    danger:    'btn-premium-danger',
    ghost:     'icon-btn',
  };
  return (
    <button className={classMap[variant]} {...props}>
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
```

---

## 6. 통계 카드 (Stat Card) 패턴 통일

### 대상 파일
- `app/main/기능부품/관리자전용서브/경영대시보드.tsx`
- `app/globals.css`

### 개선 사항
`stat-card` 클래스에 아이콘 영역 패턴 추가:

```tsx
// 권장 구조
<div className="stat-card">
  <div className="flex items-center justify-between mb-3">
    <span className="stat-card-label">{label}</span>
    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
         style={{ background: `${color}15` }}>
      <Icon size={16} color={color} />
    </div>
  </div>
  <div className="stat-card-value">{value}</div>
  {trend && <div className="text-[11px] mt-1 text-emerald-500">{trend}</div>}
</div>
```

---

## 7. 다크모드 안정성

### 대상 파일
- `app/globals.css`

### 현재 상태
이미 잘 구성되어 있음 (`:root.dark` 토큰 완비). 

### 추가 권장
일부 컴포넌트에서 `bg-white`, `text-gray-900` 등 하드코딩된 Tailwind 클래스 사용 → CSS 변수로 교체:

```tsx
// ❌ 피하기
className="bg-white text-gray-900"

// ✅ 권장
className="bg-[var(--card)] text-[var(--foreground)]"
```

---

## 8. 모바일 탭바 개선

### 대상 파일
- `app/main/기능부품/조직도서브/조직도측면창.tsx` (모바일 하단 탭바 부분)

### 개선 사항

```tsx
// 현재: 이모지 아이콘 22px
<span className="relative text-[22px] leading-none">{menu.icon}</span>

// 개선: SVG 아이콘 + 활성 탭 indicator dot 제거, 색상으로만 구분
<span className="relative">
  <LucideMenuIcon size={22} strokeWidth={isActive ? 2.2 : 1.6} />
</span>

// 탭 레이블 폰트 개선
<span className="mt-0.5 text-[10px] font-bold truncate text-center w-full">
  {menu.label}
</span>
```

---

## 9. 레이아웃 밀도 CSS 변수화 (선택)

일관된 spacing을 위해 밀도 변수 도입:

```css
/* globals.css */
:root {
  --density-xs: 4px;
  --density-sm: 8px;
  --density-md: 12px;
  --density-lg: 16px;
  --density-xl: 20px;
}
```

---

## 10. 우선순위 요약

| 우선순위 | 항목 | 예상 작업 시간 |
|---------|------|--------------|
| 🔴 높음 | 이모지 → SVG 아이콘 교체 | 2~3시간 |
| 🔴 높음 | 서브메뉴 너비 160→192px | 10분 |
| 🟡 중간 | 사이드바 브랜드마크 + 유저 아바타 | 30분 |
| 🟡 중간 | PageHeader 컴포넌트 통일 | 1~2시간 |
| 🟡 중간 | Button 컴포넌트 통일 | 1시간 |
| 🟢 낮음 | StatCard 패턴 통일 | 1시간 |
| 🟢 낮음 | 다크모드 하드코딩 클래스 정리 | 2시간 |
| 🟢 낮음 | 레이아웃 밀도 변수화 | 30분 |

---

## 참고: 디자인 목업

이 문서와 함께 `newmso-redesign.html` (인터랙티브 프로토타입)을 참고하세요.  
해당 파일에서 모든 메뉴 화면, 다크모드, 컬러 변경을 실시간으로 확인할 수 있습니다.

# 디자인 토큰 명세

> `mobile/m-tokens.css` 정의 기준. 모든 새 화면은 이 토큰만 사용할 것.

---

## 1. 컬러

### Zinc Neutrals (10단계)
```
--z-50:  #FAFAFB   // page bg (light)
--z-100: #F4F4F5   // subtle bg / hover
--z-150: #EEEEF1   // chip / divider
--z-200: #E4E4E7
--z-300: #D4D4D8   // disabled stroke
--z-400: #A1A1AA   // tertiary text / chevron
--z-500: #71717A   // secondary text / label
--z-600: #52525B
--z-700: #3F3F46   // tertiary heading
--z-800: #27272A   // secondary heading
--z-900: #18181B   // primary text
```

### Brand (Accent)
```
--accent:       #2563EB   // primary blue (Tweaks 5색 중 기본)
--accent-700:   #1D4ED8
--accent-soft:  #EBF2FF   // hover / 약한 강조
--accent-tint:  rgba(37,99,235,0.10)  // 칩 / 약한 hover
```

> Tweaks 강조색 5종: `#2563EB`, `#7C3AED`, `#10B981`, `#EC4899`, `#F59E0B`
> 강조색 변경 시 JS가 `--accent` 와 soft/tint 를 RGB로 자동 계산해 주입.

### State Colors
```
success: #10B981 / soft #ECFDF5
warning: #F59E0B / soft #FFFBEB
danger:  #EF4444 / soft #FEF2F2
```

### Borders & Surfaces
```
--border:         #E9E9EC   // 1px subtle
--border-strong:  #D4D4D8
--bg:             #F5F5F7   // page bg
--card:           #FFFFFF
```

### Dark Mode (`.mso-mobile.dark`)
Zinc 전체 반전 + bg/card/border 어둡게. accent 는 그대로 유지하되 soft/tint 알파 증가.

---

## 2. 간격 (Spacing)

명시적 토큰 없음. 다음 패턴 사용:

```
4px   inline gap
6px   chip gap, small grid gap
8px   list gap, card grid gap, button gap
10px  card-to-card / button group
12px  card padding (vertical)
14px  section gap
16px  page horizontal padding, card padding (horizontal)
18px  section vertical
20px  hero padding
24px  bottom spacer
```

화면 좌우 패딩은 **항상 16px**.

---

## 3. 라운드 (Border Radius)

```
--radius-sm:  8px    // small chip, mini card
--radius-md:  10px   // button, segmented control
--radius-lg:  14px   // card (기본)
--radius-xl:  20px   // bottom sheet, modal hero
999px              // pill (chip, FAB, dot)
```

---

## 4. 그림자 (Shadow)

```
--shadow-xs:  0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.03)
--shadow-pop: 0 8px 24px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.05)
```

카드는 기본적으로 그림자 X, 1px border만 사용. 강조 카드 또는 FAB에만 `--shadow-pop`.

---

## 5. 타이포그래피

### Font Family
```
--font: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif
--mono: 'JetBrains Mono', ui-monospace, monospace
```

### 크기 스케일

| 용도 | 크기 | 굵기 | letter-spacing |
|---|---|---|---|
| Hero 숫자 (44px+) | 32~48px | 800 | -0.035em |
| Page title | 17px | 800 | -0.025em |
| Card title (hero) | 18px | 800 | -0.022em |
| List label | 14px | 700~800 | -0.012em |
| Body | 14px | 500 | -0.012em |
| Section label (uppercase) | 11px | 800 | 0.04em |
| Sub / meta | 11px | 600 | 0 |
| Mono 숫자 | 11~22px | 800 | -0.025em |

### 라인 높이
- 본문 1.55~1.75
- 제목 1.35~1.45
- UI label 1.4

### 클래스 헬퍼
- `.m-tnum` — `font-feature-settings:"tnum"` (숫자 자릿수 고정)
- `text-wrap: pretty` (전역 적용 권장)

---

## 6. 공통 컴포넌트 토큰

### MBtn
```
height: 44px (default), 52px (lg)
padding: 0 16px
radius: 12px (14px on lg)
variant: default / primary / danger / ghost
```

### MChip
```
height: 22px
padding: 0 8px
radius: 999px
font: 11px / 700
tone: '' / accent / success / warning / danger
```

### MListRow
```
grid: 40px 1fr auto
gap: 12px
padding: 12px 16px
min-height: 56px (44+12)
```

### MAvatar
```
sm: 32px / 9px radius
default: 44px / 12px radius
lg: 56px / 16px radius
tone: blue / violet / pink / green / orange / cyan / gray
```

### MBottomTab
```
height: 56px (content) + 22px (safe area) = 78px total
icon: 22px (24 stroke if active)
label: 10px / 700
```

### 헤더 (MHeader)
```
padding: 14px 16px 12px
title: 17px / 800
back button: 32×32 grid place-items center
action button: 36×36
```

### Field (form)
```
padding: 12px 16px
label: 11px / 800 uppercase letter-spacing 0.04em
input: 15px (모바일 zoom 방지 최소 16px도 OK)
border-bottom: 1px solid var(--border)
```

---

## 7. 안티 패턴 (하지 말 것)

❌ 새로운 hex 색 만들기 (`#3A82DC` 같은 임의 색)
❌ 토큰 무시한 임의 spacing (`padding: 13px` 같은 비표준 값)
❌ 작은 터치 타깃 (`width:36, height:36` 버튼) — 최소 44×44
❌ 작은 글자 (10px 미만)
❌ MBtn 미사용 — 인라인 button 스타일 새로 작성
❌ MChip 미사용 — span에 동일 스타일 인라인 적용
❌ MIcon 미사용 — SVG 직접 인라인
❌ 다크모드 가정 안 한 색 (예: 흰 글자 위 흰 배경)
❌ 가로 스크롤 발생시키는 width (390px 안에서 항상 fit)

---

## 8. 예시 — 새 카드 작성

```jsx
<div className="m-card" style={{padding: '14px 16px'}}>
  <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
    <MChip tone="accent">대기</MChip>
    <MChip tone="warning">+1일</MChip>
    <div style={{flex:1}}/>
    <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>14:22</span>
  </div>
  <div style={{fontSize:14, fontWeight:800, letterSpacing:'-0.012em'}}>
    제목
  </div>
  <div style={{fontSize:12, color:'var(--z-600)', marginTop:4, lineHeight:1.5}}>
    본문
  </div>
</div>
```

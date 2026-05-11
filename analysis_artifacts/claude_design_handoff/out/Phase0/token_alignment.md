# 디자인 토큰 정렬표 — newmso(globals.css) vs Master Plan

## 색상 (Color Tokens)

| 토큰명 | 현행값 (globals.css) | 계획서값 (Master Plan) | 차이 | 결정 |
|---|---|---|---|---|
| `--background` | `#FFFFFF` | (해당 토큰 없음) | 현행만 존재 | 유지 — 라이트 모드 배경 |
| `--foreground` | `#09090B` | `--fg: #18181b` | 거의 동일 (9090B vs 18181B) | 유지 — 현행값이 더 어두움 |
| `--page-bg` | `#F8F8F9` | `--bg: #f8f8f9` | **동일** | 유지 |
| `--tab-bg` | `#F1F1F3` | (없음) | 현행 신규 | 유지 |
| `--input-bg` | `#FFFFFF` | (없음) | 현행 신규 | 유지 |
| `--accent` | `#2563EB` | `--accent: #2563eb` | **동일** | 유지 |
| `--accent-light` | `#EFF6FF` | `--accent-light: #eff6ff` | **동일** | 유지 |
| `--accent-hover` | `#1D4ED8` | (없음) | 현행 신규 | 유지 — interactive 상태용 |
| `--accent-subtle` | `rgba(37,99,235,0.08)` | (없음) | 현행 신규 | 유지 — 포커스 링용 |
| `--accent-selected` | `#2563EB` | (없음) | 현행, accent와 동일 | 유지 |
| `--accent-selected-subtle` | `#EBF2FF` | (없음) | 현행 신규 | 유지 |
| `--muted` | `#F1F1F3` | (없음) | 현행 신규 | 유지 |
| `--muted-foreground` | `#71717A` | (없음) | 현행 신규 | 유지 |
| `--border` | `#E9E9EC` | `--border: #e9e9ec` | **동일** | 유지 |
| `--border-subtle` | `#F0F0F2` | `--border-subtle: #f0f0f2` | **동일** | 유지 |
| `--card` | `#FFFFFF` | `--card: #ffffff` | **동일** | 유지 |
| `--danger` | `#EF4444` | `--danger: #ef4444` | **동일** | 유지 |
| `--danger-light` | `#FEF2F2` | `--danger-light: #fef2f2` | **동일** | 유지 |
| `--danger-hover` | `#DC2626` | (없음) | 현행 신규 | 유지 |
| `--success` | `#10B981` | `--success: #10b981` | **동일** | 유지 |
| `--success-light` | `#F0FDF4` | `--success-light: #ecfdf5` | 미세한 색상차 (F0FDF4 vs ECFDF5) | 유지 — 현행값이 더 연함 |
| `--warning` | `#F59E0B` | `--warning: #f59e0b` | **동일** | 유지 |
| `--warning-light` | `#FFFBEB` | `--warning-light: #fffbeb` | **동일** | 유지 |

### 계획서의 추가 색상 (Master Plan에만 있음)

| 토큰명 | 값 | 현행 상태 | 결정 |
|---|---|---|---|
| `--fg-muted` | `#71717A` | 현행 `--muted-foreground`와 동일 | 통합 검토 |
| `--fg-subtle` | `#A1A1AA` | 현행 `--zinc-400`과 동일 | 신규 추가 검토 |
| `--purple` | `#7c3aed` | 현행 없음 | 신규 추가 검토 |
| `--purple-light` | `#f3f0ff` | 현행 없음 | 신규 추가 검토 |

---

## 라디우스 (Border Radius Tokens)

| 토큰명 | 현행값 | 계획서값 | 차이 | 결정 |
|---|---|---|---|---|
| `--radius-xs` | `4px` | (없음) | 현행 신규 | 유지 |
| `--radius-sm` | `6px` | (없음) | 현행 신규 | 유지 |
| `--radius-md` | `8px` | (없음) | 현행 신규 | 유지 |
| `--radius-lg` | `8px` | `--radius: 10px` | **현행 더 작음 (8px vs 10px)** | 계획서로 통일 (10px) 검토 |
| `--radius-xl` | `10px` | (없음) | 현행 신규 | 유지 |
| `--radius-2xl` | `12px` | (없음) | 현행 신규 | 유지 |
| (없음) | (없음) | `--radius-lg: 14px` | 계획서 추가값 | 신규 추가 검토 (14px 사용처) |

**충돌**: `--radius-lg` 정의가 현행(8px)과 계획서(10px)에서 다름. 현행은 추가로 `--radius-xl` (10px), `--radius-2xl` (12px)까지 세분화.

---

## 레이아웃 (Layout Tokens)

| 토큰명 | 현행값 | 계획서값 | 차이 | 결정 |
|---|---|---|---|---|
| `--sidebar-width` | `72px` | (없음) | 현행 신규 | 유지 |
| `--submenu-width` | `192px` | (없음) | 현행 신규 | 유지 |
| `--sidebar-bg` | `#FFFFFF` | (없음) | 현행 신규 | 유지 |
| `--nav-hover` | `#F4F6FA` | (없음) | 현행 신규 | 유지 |
| `--nav-active` | `#2563EB` | (없음) | 현행 신규 | 유지 |
| `--nav-active-subtle` | `#EBF2FF` | (없음) | 현행 신규 | 유지 |

---

## 다크모드 토큰 (:root.dark)

현행 globals.css의 `:root.dark` 블록에서만 정의됨. 계획서에는 다크모드 토큰 없음.

### 주요 다크모드 차이

| 토큰명 | 라이트 모드 | 다크 모드 | 비고 |
|---|---|---|---|
| `--background` | `#FFFFFF` | `#09090B` | 명확한 명암 역전 |
| `--foreground` | `#09090B` | `#F4F4F5` | 명확한 명암 역전 |
| `--card` | `#FFFFFF` | `#111113` | 명확한 명암 역전 |
| `--muted` | `#F1F1F3` | `#18181B` | 명확한 명암 역전 |
| `--accent` | `#2563EB` | `#3B82F6` (밝음) | 다크모드에서 밝혀짐 |
| `--accent-selected` | `#2563EB` | `#3B82F6` | 다크모드에서 밝혀짐 |
| `--sidebar-bg` | `#FFFFFF` | `#111113` | 명확한 명암 역전 |
| `--nav-active` | `#2563EB` | `#3B82F6` | 다크모드에서 밝혀짐 |

**현상**: 다크모드 토큰이 완전하지만 계획서에는 선언되지 않음. 이는 추후 다크모드 확장 계획이 있을 수 있음을 시사.

---

## 섀도우 & 전환 (Shadow & Transition Tokens)

| 토큰명 | 현행값 | 비고 |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.04)` | 가벼운 섀도우 |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` | 중간 섀도우 |
| `--shadow-md` | `0 4px 8px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)` | 강한 섀도우 |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)` | 더 강한 섀도우 |
| `--shadow-premium` | `0 0 0 1px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.04), 0 8px 20px rgba(0,0,0,0.05)` | 프리미엄 카드용 |
| `--shadow-dropdown` | `0 4px 6px -1px rgba(0,0,0,0.07), 0 10px 24px -4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)` | 드롭다운/메뉴용 |
| `--transition-fast` | `100ms ease` | 빠른 전환 |
| `--transition-base` | `150ms ease` | 기본 전환 |
| `--transition-slow` | `220ms ease` | 느린 전환 |

**평가**: 계획서에는 섀도우 토큰이 정의되지 않았으나, 현행 globals.css의 섀도우 체계는 완성도 높음. 유지 추천.

---

## Zinc 색상 팔레트 (Neutral Scale)

| 토큰명 | 현행값 | 계획서값 | 차이 | 결정 |
|---|---|---|---|---|
| `--zinc-50` | `#FAFAFA` | (없음) | 현행 신규 | 유지 |
| `--zinc-100` | `#F4F4F5` | (없음) | 현행 신규 | 유지 |
| `--zinc-200` | `#E4E4E7` | (없음) | 현행 신규 | 유지 |
| `--zinc-300` | `#D4D4D8` | (없음) | 현행 신규 | 유지 |
| `--zinc-400` | `#A1A1AA` | (없음) | 현행 신규 | 유지 |
| `--zinc-500` | `#71717A` | (없음) | 현행 신규 | 유지 |
| `--zinc-600` | `#52525B` | (없음) | 현행 신규 | 유지 |
| `--zinc-700` | `#3F3F46` | (없음) | 현행 신규 | 유지 |
| `--zinc-800` | `#27272A` | (없음) | 현행 신규 | 유지 |
| `--zinc-900` | `#18181B` | (없음) | 현행 신규 | 유지 |

**평가**: 현행은 완전한 Zinc 팔레트 구현. 계획서에는 정의 없으나 필수 토큰.

---

## Toss System 호환성 색상 (Backward Compatibility)

| 토큰명 | 현행값 | 용도 |
|---|---|---|
| `--toss-blue` | `#2563EB` | 레거시 코드 호환 (`--accent`과 동일) |
| `--toss-blue-light` | `#EFF6FF` | 레거시 코드 호환 |
| `--toss-gray-1` | `#F8F8F9` | 레거시 코드 호환 |
| `--toss-gray-2` | `#E9E9EC` | 레거시 코드 호환 |
| `--toss-gray-3` | `#9CA3AF` | 레거시 코드 호환 |
| `--toss-gray-4` | `#6B7280` | 레거시 코드 호환 |
| `--toss-gray-5` | `#374151` | 레거시 코드 호환 |
| `--toss-border` | `#E9E9EC` | 레거시 코드 호환 |
| `--toss-card` | `#FFFFFF` | 레거시 코드 호환 |

**평가**: 현행에만 존재, 레거시 Toss 디자인 시스템과의 호환성 유지용. 신규 코드는 표준 토큰 사용.

---

## RGB 변수

| 토큰명 | 현행값 | 용도 |
|---|---|---|
| `--card-rgb` | `255,255,255` (라이트), `17,17,19` (다크) | CSS rgba() 직접 계산용 |

---

## 핵심 발견 & 권장사항

### 1. **라디우스 정의 충돌 — 조화 필요**
   - 현행: `--radius-lg: 8px`, `--radius-xl: 10px`, `--radius-2xl: 12px` (세분화)
   - 계획서: `--radius: 10px`, `--radius-lg: 14px` (단순화 + 더 큼)
   - **권장**: 현행 세분화 유지하되, 계획서의 14px 라디우스가 필요한 경우 신규 토큰 추가 (예: `--radius-3xl`)
   - **또는**: 계획서의 10px/14px 체계로 통일 검토 (큰 UI 요소용)

### 2. **다크모드 완전 구현 — 계획서 미반영**
   - 현행: `:root.dark` 블록에 완전한 다크모드 색상 세트 구현
   - 계획서: 다크모드 토큰 정의 없음
   - **권장**: 현행 다크모드 유지. 계획서는 라이트 모드만 규정한 것으로 해석.

### 3. **신규 토큰 다수 추가 — 설계 품질 향상**
   - 계획서 대비 현행이 추가한 토큰:
     - `--tab-bg`, `--input-bg`, `--accent-hover`, `--accent-subtle`, `--muted`, `--muted-foreground`
     - `--radius-xs`, `--radius-sm`, `--radius-xl`, `--radius-2xl`
     - `--sidebar-width`, `--submenu-width`, `--sidebar-bg`, `--nav-*` (네비게이션)
     - 섀도우 6개, 전환 3개, Zinc 팔레트 10개, Toss 호환성 9개
   - **평가**: 현행이 더 완성도 높음. 계획서는 MVP 토큰만 포함.
   - **권장**: 현행 확장 토큰 유지, 지속적 관리

### 4. **색상 정확도 높음 — 계획서와 동기화 완료**
   - 정의된 색상 (accent, border, card, danger, success, warning 등)이 계획서와 거의 정확하게 일치
   - 라이트 모드 기본 토큰 모두 정렬됨
   - **권장**: 현상 유지, 신규 색상 토큰 추가 시 마스터 플랜 검토

### 5. **계획서 미포함 기능성 토큰 — 현행의 합리적 확장**
   - 계획서에 없는 토큰들이 모두 필수 기능(네비게이션, 상호작용, 액세시빌리티)을 지원
   - 예: `--nav-active`, `--accent-hover`, `--shadow-dropdown` 등
   - **평가**: 합리적인 설계 확장으로 생산성 향상
   - **권장**: 유지, 문서화 강화 (마스터 플랜 업데이트 검토)

---

## 요약 및 액션 아이템

| 우선순위 | 항목 | 액션 |
|---|---|---|
| 🔴 높음 | 라디우스 체계 정렬 | 계획서 14px 필요성 확인 후, `--radius-3xl: 14px` 추가 또는 계획서 기반 통일 검토 |
| 🟡 중간 | 다크모드 마스터 플랜 업데이트 | 현행 다크모드 토큰을 계획서에 추가 문서화 |
| 🟢 낮음 | Toss 레거시 토큰 정리 | 신규 코드에서 사용 금지, 기존 코드는 점진적 마이그레이션 |
| 🟢 낮음 | 신규 토큰 마스터 플랜 병합 | 계획서 다음 버전에 현행의 nav, shadow, transition 토큰 통합 |

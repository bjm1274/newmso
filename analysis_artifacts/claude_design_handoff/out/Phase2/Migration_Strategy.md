# Phase 2 — 코드 마이그레이션 전략

## 1. 결정: 스트랭글러 패턴 (D8 권장안)

### 사유
- 안전성 우선: 196개 TSX 파일을 한 번에 갈아엎으면 회귀 위험 매우 큼
- 비즈니스 로직 보존: 데이터 fetch·검증·인증 로직 그대로 살리고 wrapper만 교체
- 점진 컷오버: 신규 라우트(`app/main-v2/`) 병행 운영 → feature flag로 단계 전환

## 2. 디렉토리 구조

### 현행
- `app/main/page.tsx` — 메인 라우터
- `app/main/기능부품/*.tsx` — 196개 컴포넌트
- `app/main/기능부품/조직도서브/조직도측면창.tsx` — 사이드바

### 신규 (병행)
- `app/main-v2/page.tsx` — 신규 라우터 (Phase 3에서 작성)
- `app/main-v2/components/Sidebar.tsx` — 5개 메뉴 사이드바 (Phase 2 산출물 이관)
- `app/main-v2/components/BottomTab.tsx` — 모바일 바텀탭
- `app/main-v2/screens/<menu>/<screen>.tsx` — 38장 신규 화면

### 라우팅
- `/main` → 기존 (default)
- `/main-v2` → 신규 (opt-in)
- 사용자 단위 feature flag (`COOKIE_USE_V2=true`)
- 단계 1: 신규 사용자 가입 시 자동 v2
- 단계 2: 기존 사용자 임의 toggle 가능
- 단계 3: 90% v2 전환 후 `/main`을 `/main-v2`로 alias
- 단계 4: 구버전 제거 (한 사이클 후)

## 3. 코드 이관 패턴

### 패턴 A — wrapper 교체 (80% 적용 예상)
기존 컴포넌트의 비즈니스 로직(useState, useEffect, supabase 쿼리)을 그대로 유지하면서:
- PageHeader → 신규 컴포넌트
- 레이아웃 → 신규 grid/flex 시스템
- 버튼/뱃지/카드 → 신규 컴포넌트 라이브러리 (Phase 4)

### 패턴 B — 통합 후 재작성 (15% 적용)
여러 화면이 하나로 통합되는 경우 (급여 13→1, OP체크 5→1 등). 비즈니스 로직은 함수 단위로 보존하되 UI는 새로 작성.

### 패턴 C — 폐기 (5% 적용)
사용 빈도 낮고 다른 화면에 흡수되는 경우 (운영설정 템플릿c 등).

## 4. API 가드레일 적용

신규 모든 컴포넌트는 Phase 0에서 도입한 가드레일 강제:
- `lib/fetcher.ts` 경유 (또는 `useCachedQuery` hook)
- `lib/realtime-bus.ts` 경유 (raw `supabase.channel` 금지)
- 검색 input은 `useDebouncedSearch`
- realtime은 `useThrottledRealtime`
- eslint warn → Phase 3에서 신규 코드는 error로 승격

## 5. 위험 통제

| 위험 | 통제 |
|---|---|
| v2 회귀 발견 시 빠른 롤백 | feature flag로 즉시 v1 복귀 |
| 데이터 정합성 (v1·v2 혼용) | API는 동일, 화면만 다름 |
| 권한 시스템 마이그레이션 | RBAC_Remap.csv 단계적 적용, 구·신 키 한 사이클 동시 운영 |
| 모바일 사용자 적응 | 첫 진입 시 안내 시트 |

## 6. 일정

| Phase | 작업 |
|---|---|
| Phase 2 (W2~W3) | 본 전략 + IA + 컴포넌트 청사진 |
| Phase 3 (W3~W6) | `/main-v2` 라우트 + 38장 신규 화면 작성 |
| Phase 4 (W6~W8) | 디자인 시스템 통일 + 컴포넌트 라이브러리 |
| W8 후 | 컷오버 시작 (신규 가입자부터) |
| W12 (3개월 후) | 90% 전환 목표 |
| W16 | 구버전 제거 |

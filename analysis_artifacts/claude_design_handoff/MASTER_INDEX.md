# MSO 리디자인 v2.1 — 산출물 마스터 인덱스

작성일: 2026-05-11  
기준 디렉토리: `analysis_artifacts/claude_design_handoff/`

---

## 목차

1. [종합 보고서](#종합-보고서)
2. [원본 입력 — 계획·분석·스크린샷](#원본-입력--계획분석스크린샷)
3. [Phase 0 산출물](#phase-0--전제조건-정비)
4. [Phase 1 산출물](#phase-1--통합-매트릭스)
5. [Phase 2 산출물](#phase-2--ia-재설계--코드-마이그레이션)
6. [Phase 3 — 8개 그룹 Mockup](#phase-3--8개-그룹-mockup)
7. [Phase 4 산출물](#phase-4--디자인-시스템-통일)
8. [Wave A/B/C — 실 라우트 구현](#wavea--실-라우트-구현)
9. [Menu Unification 시범](#menu-unification-시범)
10. [횡단 트랙](#횡단-트랙)
11. [업로드 소스 파일](#업로드-소스-파일-참고용)

---

## 종합 보고서

| 파일 | 설명 |
|---|---|
| [MSO_리디자인_진행보고서_v2.1.md](MSO_리디자인_진행보고서_v2.1.md) | 전체 진행 종합 보고서 — Phase 0~4 결과, KPI, 남은 작업 |
| [MASTER_INDEX.md](MASTER_INDEX.md) | 본 파일 — 전체 산출물 마스터 인덱스 |

---

## 원본 입력 — 계획·분석·스크린샷

### 핵심 계획 문서

| 파일 | 설명 |
|---|---|
| [MSO_Master_Plan.html](MSO_Master_Plan.html) | 리디자인 원안 마스터 플랜 (인터랙티브 HTML) |
| [MSO_전체계획표_v2.md](MSO_전체계획표_v2.md) | 리디자인 v2.1 전체 계획표 — 9주 5 Phase, KPI 8종, 갭 분석 |
| [MSO_Claude_Code_Handoff.md](MSO_Claude_Code_Handoff.md) | Claude Code 핸드오프 문서 — 코드베이스 현황 및 작업 지침 |
| [MSO_Menu_Unification_Brief.html](MSO_Menu_Unification_Brief.html) | 메뉴 통합 브리프 (인터랙티브 HTML) |

### 디자인 분석 문서

| 파일 | 설명 |
|---|---|
| [MSO_Design_Audit.html](MSO_Design_Audit.html) | 현행 디자인 감사 보고서 (HTML) |
| [MSO_Design_Improvement.md](MSO_Design_Improvement.md) | 디자인 개선 제안서 |
| [MSO_Detailed_Design_Spec.md](MSO_Detailed_Design_Spec.md) | 상세 디자인 명세 |
| [MSO_Screenshot_ContactSheet.html](MSO_Screenshot_ContactSheet.html) | 스크린샷 컨택트 시트 (96장 현행 화면) |
| [MSO_Screenshot_Labels.md](MSO_Screenshot_Labels.md) | 스크린샷 레이블 목록 (스크린샷-번호 매핑) |

### 초기 Notebook 프로토타입 (JSX)

| 파일 | 설명 |
|---|---|
| [newmso-redesign.html](newmso-redesign.html) | 초기 리디자인 프로토타입 HTML |
| [nb-screens.jsx](nb-screens.jsx) | Notebook 화면 컴포넌트 |
| [nb-sidebar.jsx](nb-sidebar.jsx) | Notebook 사이드바 컴포넌트 |
| [nb-icons.jsx](nb-icons.jsx) | Notebook 아이콘 컴포넌트 |
| [tweaks-panel.jsx](tweaks-panel.jsx) | Notebook 조정 패널 컴포넌트 |

### 원본 스크린샷

| 디렉토리 | 파일 수 | 설명 |
|---|---|---|
| [shots/](shots/) | 47개 PNG | 현행 화면 스크린샷 (1~47번) |
| [shots2/](shots2/) | 49개 PNG | 현행 화면 스크린샷 (48~96번) |

---

## Phase 0 — 전제조건 정비

> 경로: `out/Phase0/`

| 파일 | 설명 |
|---|---|
| [out/Phase0/index.md](out/Phase0/index.md) | Phase 0 전체 산출물 인덱스 (코드 + 문서 + 테스트) |
| [out/Phase0/api_hotspot_patch_report.md](out/Phase0/api_hotspot_patch_report.md) | 5곳 핫스팟 패치 상세 — Before/After + 감소율 (평균 ~83%) |
| [out/Phase0/rbac_inventory.csv](out/Phase0/rbac_inventory.csv) | RBAC 권한 키 99개 인벤토리 + 매핑 |
| [out/Phase0/token_alignment.md](out/Phase0/token_alignment.md) | 토큰 정렬표 + D1~D11 의사결정 권장안 |

**코드 산출물 (프로젝트 내 위치, 참고)**

| 코드 경로 | 설명 |
|---|---|
| `lib/fetcher.ts` | inflight dedup + 5분 캐시 + AbortController |
| `lib/realtime-bus.ts` | Supabase realtime 채널 통합 dispatcher + 1초 배치 |
| `lib/hooks/useCachedQuery.ts` | SWR 기반 캐시 쿼리 훅 |
| `lib/hooks/useDebouncedSearch.ts` | 검색 300ms debounce 훅 |
| `lib/hooks/useThrottledRealtime.ts` | realtime + 30초 throttle 훅 |
| `lib/measurement/web-vitals.ts` | Core Web Vitals 수집 |
| `lib/measurement/api-counter.ts` | API 호출 카운터 |
| `lib/measurement/axe-runner.ts` | axe-core WCAG AA 검사 |
| `app/components/dev/ApiCounterBadge.tsx` | dev floating 위젯 |
| `app/components/dev/WebVitalsInit.tsx` | 'use client' Web Vitals 진입점 |
| `tests/e2e/regression/api_call_count.spec.ts` | 회귀 테스트 5케이스 |

---

## Phase 1 — 통합 매트릭스

> 경로: `out/Phase1/`

| 파일 | 설명 |
|---|---|
| [out/Phase1/Consolidation_Matrix.html](out/Phase1/Consolidation_Matrix.html) | 96행 인터랙티브 통합 매트릭스 — 현행→신규 매핑 전체 |
| [out/Phase1/Pattern_Catalog.md](out/Phase1/Pattern_Catalog.md) | 5종 UI 패턴 카탈로그 (마스터-디테일, 카드피드 등) |
| [out/Phase1/Priority_Score.csv](out/Phase1/Priority_Score.csv) | 96장 우선순위 점수 (빈도·복잡도·모바일 가중치) |
| [out/Phase1/Domain_Interview_Notes.md](out/Phase1/Domain_Interview_Notes.md) | 도메인 인터뷰 노트 템플릿 (퇴원심사·OP체크 TODO) |

---

## Phase 2 — IA 재설계 + 코드 마이그레이션

> 경로: `out/Phase2/`

### IA 설계 문서

| 파일 | 설명 |
|---|---|
| [out/Phase2/New_IA_Sitemap_PC.html](out/Phase2/New_IA_Sitemap_PC.html) | 신규 PC IA 사이트맵 (인터랙티브 HTML) |
| [out/Phase2/New_IA_Sitemap_Mobile.html](out/Phase2/New_IA_Sitemap_Mobile.html) | 신규 모바일 IA 사이트맵 (인터랙티브 HTML) |
| [out/Phase2/Migration_Strategy.md](out/Phase2/Migration_Strategy.md) | 스트랭글러 패턴 마이그레이션 전략 — 단계별 공존 방식 |
| [out/Phase2/Menu_Unification_Absorption.md](out/Phase2/Menu_Unification_Absorption.md) | 메뉴 통합·흡수 상세 — 96장 → 38장 통합 근거 |

### 마이그레이션 매트릭스

| 파일 | 설명 |
|---|---|
| [out/Phase2/Migration_Map.csv](out/Phase2/Migration_Map.csv) | 96행 화면 단위 마이그레이션 맵 |
| [out/Phase2/File_Migration_Matrix.csv](out/Phase2/File_Migration_Matrix.csv) | 312행 파일 단위 마이그레이션 매트릭스 |
| [out/Phase2/RBAC_Remap.csv](out/Phase2/RBAC_Remap.csv) | 94행 권한 키 재매핑 (Phase 0 인벤토리 기반) |

### 신규 컴포넌트

| 파일 | 설명 |
|---|---|
| [out/Phase2/components/Sidebar.tsx](out/Phase2/components/Sidebar.tsx) | 신규 PC 사이드바 컴포넌트 |
| [out/Phase2/components/BottomTab.tsx](out/Phase2/components/BottomTab.tsx) | 모바일 하단 탭 컴포넌트 |
| [out/Phase2/components/MoreSheet.tsx](out/Phase2/components/MoreSheet.tsx) | 모바일 더보기 시트 컴포넌트 |
| [out/Phase2/components/types.ts](out/Phase2/components/types.ts) | 공통 타입 정의 |
| [out/Phase2/components/menu-config.ts](out/Phase2/components/menu-config.ts) | 메뉴 설정 데이터 |
| [out/Phase2/components/README.md](out/Phase2/components/README.md) | 컴포넌트 사용 가이드 |

---

## Phase 3 — 8개 그룹 Mockup

> 경로: `out/Phase3/{그룹명}/`  
> 각 그룹 공통 파일: `PC.html`, `Mobile.html`, `prototype.html`, `acceptance.md`, `before_after.md`

### 01\_payroll — 급여 (13 → 1)

| 파일 | 설명 |
|---|---|
| [out/Phase3/01_payroll/PC.html](out/Phase3/01_payroll/PC.html) | 급여 통합 PC 레이아웃 |
| [out/Phase3/01_payroll/Mobile.html](out/Phase3/01_payroll/Mobile.html) | 급여 통합 모바일 레이아웃 |
| [out/Phase3/01_payroll/prototype.html](out/Phase3/01_payroll/prototype.html) | PC/Mobile/Dark 토글 프로토타입 |
| [out/Phase3/01_payroll/acceptance.md](out/Phase3/01_payroll/acceptance.md) | 수락 기준 (WCAG, 권한별 변형 등) |
| [out/Phase3/01_payroll/before_after.md](out/Phase3/01_payroll/before_after.md) | Before/After 비교 |

### 02\_opcheck — OP체크 (5 → 1)

| 파일 | 설명 |
|---|---|
| [out/Phase3/02_opcheck/PC.html](out/Phase3/02_opcheck/PC.html) | OP체크 통합 PC 레이아웃 |
| [out/Phase3/02_opcheck/Mobile.html](out/Phase3/02_opcheck/Mobile.html) | OP체크 통합 모바일 레이아웃 |
| [out/Phase3/02_opcheck/prototype.html](out/Phase3/02_opcheck/prototype.html) | PC/Mobile/Dark 토글 프로토타입 |
| [out/Phase3/02_opcheck/acceptance.md](out/Phase3/02_opcheck/acceptance.md) | 수락 기준 |
| [out/Phase3/02_opcheck/before_after.md](out/Phase3/02_opcheck/before_after.md) | Before/After 비교 |

### 03\_discharge\_review — 퇴원심사 (6 → 2)

| 파일 | 설명 |
|---|---|
| [out/Phase3/03_discharge_review/PC.html](out/Phase3/03_discharge_review/PC.html) | 퇴원심사 통합 PC 레이아웃 |
| [out/Phase3/03_discharge_review/Mobile.html](out/Phase3/03_discharge_review/Mobile.html) | 퇴원심사 통합 모바일 레이아웃 |
| [out/Phase3/03_discharge_review/prototype.html](out/Phase3/03_discharge_review/prototype.html) | PC/Mobile/Dark 토글 프로토타입 |
| [out/Phase3/03_discharge_review/acceptance.md](out/Phase3/03_discharge_review/acceptance.md) | 수락 기준 |
| [out/Phase3/03_discharge_review/before_after.md](out/Phase3/03_discharge_review/before_after.md) | Before/After 비교 |

### 04\_attendance — 근태 (10 → 3)

| 파일 | 설명 |
|---|---|
| [out/Phase3/04_attendance/PC.html](out/Phase3/04_attendance/PC.html) | 근태 통합 PC 레이아웃 |
| [out/Phase3/04_attendance/Mobile.html](out/Phase3/04_attendance/Mobile.html) | 근태 통합 모바일 레이아웃 |
| [out/Phase3/04_attendance/prototype.html](out/Phase3/04_attendance/prototype.html) | PC/Mobile/Dark 토글 프로토타입 |
| [out/Phase3/04_attendance/acceptance.md](out/Phase3/04_attendance/acceptance.md) | 수락 기준 |
| [out/Phase3/04_attendance/before_after.md](out/Phase3/04_attendance/before_after.md) | Before/After 비교 |

### 05\_admin\_settings — 관리자 설정 (11 → 3)

| 파일 | 설명 |
|---|---|
| [out/Phase3/05_admin_settings/PC.html](out/Phase3/05_admin_settings/PC.html) | 관리자 설정 통합 PC 레이아웃 |
| [out/Phase3/05_admin_settings/Mobile.html](out/Phase3/05_admin_settings/Mobile.html) | 관리자 설정 통합 모바일 레이아웃 |
| [out/Phase3/05_admin_settings/prototype.html](out/Phase3/05_admin_settings/prototype.html) | PC/Mobile/Dark 토글 프로토타입 |
| [out/Phase3/05_admin_settings/acceptance.md](out/Phase3/05_admin_settings/acceptance.md) | 수락 기준 |
| [out/Phase3/05_admin_settings/before_after.md](out/Phase3/05_admin_settings/before_after.md) | Before/After 비교 |

### 06\_management\_insight — 경영인사이트 (2 → 1)

| 파일 | 설명 |
|---|---|
| [out/Phase3/06_management_insight/PC.html](out/Phase3/06_management_insight/PC.html) | 경영인사이트 통합 PC 레이아웃 |
| [out/Phase3/06_management_insight/Mobile.html](out/Phase3/06_management_insight/Mobile.html) | 경영인사이트 통합 모바일 레이아웃 |
| [out/Phase3/06_management_insight/prototype.html](out/Phase3/06_management_insight/prototype.html) | PC/Mobile/Dark 토글 프로토타입 |
| [out/Phase3/06_management_insight/acceptance.md](out/Phase3/06_management_insight/acceptance.md) | 수락 기준 |
| [out/Phase3/06_management_insight/before_after.md](out/Phase3/06_management_insight/before_after.md) | Before/After 비교 |

### 07\_team\_share — 업무공유 (1 → 1)

| 파일 | 설명 |
|---|---|
| [out/Phase3/07_team_share/PC.html](out/Phase3/07_team_share/PC.html) | 업무공유 PC 레이아웃 |
| [out/Phase3/07_team_share/Mobile.html](out/Phase3/07_team_share/Mobile.html) | 업무공유 모바일 레이아웃 |
| [out/Phase3/07_team_share/prototype.html](out/Phase3/07_team_share/prototype.html) | PC/Mobile/Dark 토글 프로토타입 |
| [out/Phase3/07_team_share/acceptance.md](out/Phase3/07_team_share/acceptance.md) | 수락 기준 |
| [out/Phase3/07_team_share/before_after.md](out/Phase3/07_team_share/before_after.md) | Before/After 비교 |

### 08\_chat\_mypage — 채팅·내정보 (28 → 4)

| 파일 | 설명 |
|---|---|
| [out/Phase3/08_chat_mypage/PC.html](out/Phase3/08_chat_mypage/PC.html) | 채팅·내정보 통합 PC 레이아웃 |
| [out/Phase3/08_chat_mypage/Mobile.html](out/Phase3/08_chat_mypage/Mobile.html) | 채팅·내정보 통합 모바일 레이아웃 |
| [out/Phase3/08_chat_mypage/prototype.html](out/Phase3/08_chat_mypage/prototype.html) | PC/Mobile/Dark 토글 프로토타입 |
| [out/Phase3/08_chat_mypage/acceptance.md](out/Phase3/08_chat_mypage/acceptance.md) | 수락 기준 |
| [out/Phase3/08_chat_mypage/before_after.md](out/Phase3/08_chat_mypage/before_after.md) | Before/After 비교 |

---

## Phase 4 — 디자인 시스템 통일

> 경로: `out/Phase4/`

### 토큰 및 가이드 문서

| 파일 | 라인 수 | 설명 |
|---|---|---|
| [out/Phase4/token_extension.md](out/Phase4/token_extension.md) | 40 | globals.css 토큰 확장 명세 — touch-target, mobile, print, z-index 등 19개 신규 토큰 |
| [out/Phase4/Component_Library.html](out/Phase4/Component_Library.html) | 726 | 17개 컴포넌트 인터랙티브 라이브러리 뷰어 |
| [out/Phase4/Component_Library_index.md](out/Phase4/Component_Library_index.md) | 77 | 컴포넌트 라이브러리 인덱스 |
| [out/Phase4/Pattern_Guide.html](out/Phase4/Pattern_Guide.html) | 1,494 | 6패턴 × PC/Mobile 패턴 가이드 (마스터-디테일, 카드피드, 폼, 테이블, 필터, 네비게이션) |
| [out/Phase4/A11y_Checklist.md](out/Phase4/A11y_Checklist.md) | 360 | WCAG AA 접근성 체크리스트 (색상, 대비, 키보드, 터치 타겟, 포커스 등) |

### 기본 컴포넌트 (5개 TSX)

| 파일 | 라인 수 | 설명 |
|---|---|---|
| [out/Phase4/components/Button.tsx](out/Phase4/components/Button.tsx) | 132 | 기본 Button 컴포넌트 (variant, size, state) |
| [out/Phase4/components/Input.tsx](out/Phase4/components/Input.tsx) | 128 | 기본 Input 컴포넌트 (text, number, search, 유효성 검사) |
| [out/Phase4/components/Select.tsx](out/Phase4/components/Select.tsx) | 221 | 기본 Select 컴포넌트 (드롭다운, 멀티셀렉트, 검색) |
| [out/Phase4/components/Table.tsx](out/Phase4/components/Table.tsx) | 215 | 기본 Table 컴포넌트 (정렬, 페이지, 행 선택) |
| [out/Phase4/components/Tabs.tsx](out/Phase4/components/Tabs.tsx) | 161 | 탭 내비게이션 컴포넌트 |

### 데이터 표현 컴포넌트 (4개 TSX)

| 파일 | 라인 수 | 설명 |
|---|---|---|
| [out/Phase4/components/Badge.tsx](out/Phase4/components/Badge.tsx) | 73 | 배지 컴포넌트 (variant, size) |
| [out/Phase4/components/Card.tsx](out/Phase4/components/Card.tsx) | 109 | 카드 컴포넌트 |
| [out/Phase4/components/EmptyState.tsx](out/Phase4/components/EmptyState.tsx) | 123 | 빈 상태 컴포넌트 |
| [out/Phase4/components/Loader.tsx](out/Phase4/components/Loader.tsx) | 124 | 로더 컴포넌트 (spinner, skeleton) |

### 피드백 컴포넌트 (2개 TSX)

| 파일 | 라인 수 | 설명 |
|---|---|---|
| [out/Phase4/components/Modal.tsx](out/Phase4/components/Modal.tsx) | 168 | 모달 대화상자 컴포넌트 |
| [out/Phase4/components/Toast.tsx](out/Phase4/components/Toast.tsx) | 148 | 토스트 알림 컴포넌트 |

### 폼 및 레이아웃 컴포넌트 (3개 TSX)

| 파일 | 라인 수 | 설명 |
|---|---|---|
| [out/Phase4/components/FormLayout.tsx](out/Phase4/components/FormLayout.tsx) | 185 | 폼 레이아웃 및 검증 헬퍼 |
| [out/Phase4/components/FullScreenModal.tsx](out/Phase4/components/FullScreenModal.tsx) | 140 | 전체 화면 모달 컴포넌트 |

### 모바일 전용 컴포넌트 (3개 TSX)

| 파일 | 라인 수 | 설명 |
|---|---|---|
| [out/Phase4/components/BottomTab.tsx](out/Phase4/components/BottomTab.tsx) | 45 | 모바일 하단 탭 네비게이션 |
| [out/Phase4/components/BottomSheet.tsx](out/Phase4/components/BottomSheet.tsx) | 140 | 모바일 하단 시트 컴포넌트 |
| [out/Phase4/components/PullToRefresh.tsx](out/Phase4/components/PullToRefresh.tsx) | 168 | 당겨서 새로고침 컴포넌트 |

### 인터랙션 컴포넌트 (2개 TSX)

| 파일 | 라인 수 | 설명 |
|---|---|---|
| [out/Phase4/components/SwipeAction.tsx](out/Phase4/components/SwipeAction.tsx) | 156 | 좌우 스와이프 액션 컴포넌트 |

---

**합계**: 3개 가이드 문서 (2,597줄) + 17개 컴포넌트 (2,491줄) = 총 5,088줄

---

## Wave A — 실 라우트 구현

> 경로: `app/main-v2/` (프로젝트 내, 핸드오프 외부)  
> Phase 2 신규 IA + Phase 4 컴포넌트 기반 Next.js 라우트 구현. 더미 데이터 포함.

### 라우트 골격 (Wave A)

| 파일 | 라인 수 | 설명 |
|---|---|---|
| `app/main-v2/feature-flag.ts` | 38 | 기능 플래그 설정 |
| `app/main-v2/layout.tsx` | 22 | 루트 레이아웃 |
| `app/main-v2/page.tsx` | 117 | 홈 페이지 |
| `app/main-v2/loading.tsx` | 40 | 로딩 상태 |
| `app/main-v2/error.tsx` | 52 | 에러 페이지 |
| `app/main-v2/not-found.tsx` | 37 | 404 페이지 |
| `app/main-v2/{work,hr,ops,mgmt,settings}/page.tsx` | ~170 | 5개 도메인 루트 (33~35 × 5) |
| `app/middleware.ts` (추가) | +6 | v2 라우트 feature flag 처리 |
| **라우트 소계** | **~550** | — |

### 네비게이션 컴포넌트 (이관)

| 파일 | 라인 수 | 설명 |
|---|---|---|
| `app/main-v2/components/Sidebar.tsx` | 156 | PC 사이드바 (활성 스타일) |
| `app/main-v2/components/BottomTab.tsx` | 124 | 모바일 하단 탭 (활성 스타일) |
| `app/main-v2/components/MoreSheet.tsx` | 198 | 모바일 더보기 시트 |
| `app/main-v2/components/ShellClient.tsx` | 78 | 라우트 레이아웃 래퍼 |
| `app/main-v2/components/types.ts` | 85 | 공통 타입 |
| `app/main-v2/components/menu-config.ts` | 290 | 메뉴 설정 데이터 |
| **네비게이션 소계** | **~931** | — |

### UI 라이브러리 이관

| 경로 | 파일 수 | 라인 수 | 설명 |
|---|---|---|---|
| `app/components/v2/` | 16 | ~2,000 | Button / Input / Select / Table / Modal / Tabs / Card / Badge / Toast / Loader / EmptyState / FormLayout / BottomSheet / FullScreenModal / SwipeAction / PullToRefresh + index.ts |

---

## Wave B/C — 그룹 ①~⑧ React 화면

> 경로: `app/main-v2/{hr,ops,mgmt,settings,work}/` (프로젝트 내, 핸드오프 외부)  
> Phase 3 mockup을 실제 React 컴포넌트 + 라우트로 구현. 더미 데이터 탑재. tsc 0 에러.

### Wave B — 그룹 ①~④

| 그룹 | 경로 | 파일 수 | 라인 수 | 설명 |
|---|---|---|---|---|
| **① 급여** | `app/main-v2/hr/payroll-workcenter/` | 8 | 1,949 | 급여 계산·검증·발급 통합 워크센터 |
| **② OP체크** | `app/main-v2/ops/op-check-board/` | 5 | 938 | 수술실 체크리스트 + 보드 |
| **③ 퇴원심사** | `app/main-v2/ops/discharge-review/` | 9 | 1,680 | 퇴원 환자 심사·결정 |
| **④ 근태 통합** | `app/main-v2/hr/attendance-*/(page,layout,components)/` | 8 | 1,678 | 출퇴근·휴가·근무 통합 |
| **합계** | — | **30** | **6,245** | — |

**테스트 및 분석:**
- `tests/e2e/v2/` — E2E spec 4개 (payroll, opcheck, discharge, attendance)
- `out/cross_cutting/E2E_Spec_Impact_Analysis.md` (88줄)

### Wave C — 그룹 ⑤~⑧

| 그룹 | 경로 | 파일 수 | 라인 수 | 설명 |
|---|---|---|---|---|
| **⑤ 관리자 설정** | `app/main-v2/settings/{company,operation,template-library}/` | 8 | 1,697 | 회사·운영·템플릿 설정 통합 |
| **⑥ 경영 인사이트** | `app/main-v2/mgmt/insights/` | 9 | 955 | KPI·대시보드·리포트 |
| **⑦ 업무공유** | `app/main-v2/work/team-share/` | 7 | 1,775 | 팀 공유·협업 공간 |
| **⑧ 채팅·내정보** | `app/main-v2/work/{chat,my-main,my-commute,my-todo}/` | 13 | 2,470 | 채팅·내정보·출퇴근기록 |
| **합계** | — | **37** | **6,897** | — |

---

## Menu Unification 시범

> Phase 2 메뉴 통합 계획의 실행 샘플

### 코드 수정 (3개 파일)

| 파일 | 변경 사항 |
|---|---|
| `app/main/기능부품/게시판메뉴.ts` | 이모지 → string 키 매핑 통일 |
| `app/main/기능부품/조직도서브/조직도측면창.tsx` | lock, lightbulb SVG 아이콘 추가 |

### 후속 계획 (11개 항목)

| 파일 | 라인 수 | 설명 |
|---|---|---|
| `out/cross_cutting/Menu_Unification_Followup.md` | 180 | v2 메뉴 통합 실행 계획 (11개 항목, 일정) |

---

## 횡단 트랙

> 경로: `out/cross_cutting/`

| 파일 | 라인 수 | 설명 |
|---|---|---|
| [out/cross_cutting/Backend_Impact_Analysis.md](out/cross_cutting/Backend_Impact_Analysis.md) | 166 | 백엔드·API 영향 분석 — 신규 라우트, 데이터베이스 스키마, 마이그레이션 전략 |
| [out/cross_cutting/PWA_Setup_Plan.md](out/cross_cutting/PWA_Setup_Plan.md) | 253 | PWA 설정 계획 — manifest, service worker, offline 전략 |
| [out/cross_cutting/Print_Templates_Plan.md](out/cross_cutting/Print_Templates_Plan.md) | 386 | 인쇄 템플릿 계획 — 급여명세, 문서, 레포트 인쇄 포맷 및 CSS |
| [out/cross_cutting/Push_Notification_UX_Plan.md](out/cross_cutting/Push_Notification_UX_Plan.md) | 274 | 푸시 알림 UX 계획 — 채널, 타이밍, 권한 관리 |

**합계**: 4개 문서, 1,179줄

---

## 업로드 소스 파일 (참고용)

> 경로: `uploads/`  
> 분석 과정에서 사용된 현행 코드베이스 원본 파일. 인덱스 산출물 아님.

| 디렉토리 | 내용 |
|---|---|
| `uploads/기능부품/` | 현행 기능 컴포넌트 TSX/TS 파일 (채팅·OP체크 등) |
| `uploads/기능부품/roster/` | 근무표 자동편성 관련 파일 |
| `uploads/기능부품/게시판서브/` | 업무가이드·게시판 관련 파일 |
| `uploads/기능부품/공통/` | SmartDatePicker, SmartMonthPicker 등 공통 컴포넌트 |
| `uploads/기능부품/관리자전용서브/` | 관리자 전용 서브 컴포넌트 파일 |
| `uploads/기능부품/마이페이지/` | 마이페이지 관련 파일 |
| `uploads/*.png` | 분석 참고용 업로드 이미지 (21개) |

---

## 파일 수 요약

| 카테고리 | 파일 수 | 라인 수 | 비고 |
|---|---|---|---|
| 종합 보고서 (본 문서 포함) | 2 | — | v3 업데이트됨 |
| 원본 입력 (HTML/MD/JSX) | 14 | — | — |
| 원본 스크린샷 (PNG) | 96 | — | — |
| Phase 0 산출물 | 4 | ~500 | — |
| Phase 1 산출물 | 4 | ~1,500 | — |
| Phase 2 산출물 | 13 | ~3,500 | — |
| Phase 3 mockup | 40 | ~20,190 | — |
| Phase 4 산출물 | 22 | ~5,088 | — |
| **Wave A 라우트 골격** | **12** | **~550** | 앱 내부 (프로젝트) |
| **Wave B 그룹 ①~④** | **30** | **~6,245** | 앱 내부 (프로젝트) |
| **Wave C 그룹 ⑤~⑧** | **37** | **~6,897** | 앱 내부 (프로젝트) |
| **Menu Unification 시범** | **3** | **180** | 앱 내부 (프로젝트) |
| 횡단 트랙 (MD) | 4 | 1,179 | — |
| **총 핵심 산출물 (이미지 제외)** | **182** | **~45,829+** | **v3 기준 (Wave A/B/C 포함)** |

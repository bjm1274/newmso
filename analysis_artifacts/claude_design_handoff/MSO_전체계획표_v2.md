# MSO ERP 통합 리디자인 — 전체 계획표 v2.1

> **버전**: v2.1 (Claude Design 원안 + 갭 분석 + **API 과다호출 가드레일** 추가)
> **작성일**: 2026-05-11
> **선행 문서**: `MSO_Claude_Code_Handoff.md`, `MSO_Master_Plan.html`, `MSO_Menu_Unification_Brief.html`
> **상태**: 초안 — 사용자 의사결정 10개(D1~D11) 확정 후 v3로 승격

---

## 0. 한 줄 요약

현행 96장 데스크톱 ERP를 **38장 PC+Mobile 반응형**으로 통합. 기존 디자인 시스템(2026-03-18 완성)을 **재정의가 아닌 확장·검증**으로 활용하고, 코드 마이그레이션·테스트·권한 매핑·**API 호출 최적화**·KPI 측정을 **횡단 트랙**으로 병행. **9주 / 5 Phase(Phase 0 추가)**.

---

## 1. 핵심 수정 사항 — 원안 대비 무엇이 달라졌나

| 영역 | 원안 | 수정안 |
|---|---|---|
| **디자인 토큰** | Phase 4에서 신규 정의 | 이미 완성됨 → Phase 4는 **검증·확장·문서화** |
| **Phase 수** | 4개 (8주) | **5개 (9주, Phase 0 신설)** |
| **Phase 3 mockup 대상** | 백오피스 6+1 그룹 | **8그룹 (채팅·내정보 추가)** |
| **테스트** | 언급 없음 | E2E 70개 영향분석 + 컴포넌트 테스트 트랙 |
| **코드 마이그레이션** | 메뉴 매핑표만 | **파일 단위 마이그레이션 매트릭스** |
| **권한(RBAC)** | 미고려 | Phase 2에 권한 키 재매핑 포함 |
| **백엔드·API** | 미고려 | 횡단 트랙(영향분석·호환성 검증) |
| **lucide-react** | 도입 전제 | **Phase 0에서 도입 + 8개 메뉴 아이콘 우선 교체** |
| **접근성·다크모드** | Phase 4 마지막 점검 | Phase 3 mockup의 **수락 기준에 포함** |
| **인쇄·PWA** | 미고려 | 횡단 트랙에서 별도 처리 |
| **도메인 인터뷰** | "권장" | Phase 1 일정에 **명시 포함** (불가 시 추정 명시) |
| **KPI** | 화면 감축만 | **8종 지표 + 측정 도구 도입** |
| **API 과다호출 방지** *(신규)* | 미고려 | **횡단 트랙 + Phase 0 즉시 패치** (캐싱·debounce·realtime 통합) |

---

## 2. KPI · 성공 지표

| # | 지표 | 현재 추정 | 목표 (8주 후) | 측정 방법 |
|---|---|---|---|---|
| K1 | 화면 수 | 96장 | **38장 (60%↓)** | 라우터/메뉴 정의 카운트 |
| K2 | 평균 도달 깊이 | 4~5 depth | **≤ 3 depth** | IA 시뮬레이션 |
| K3 | 모바일 사용 비중 | 미측정 | **측정 시작 + 30%↑ 목표** | GA4 또는 자체 로깅 도입 |
| K4 | LCP (모바일) | 미측정 | **≤ 2.5s (75th)** | Cloudflare Workers Analytics + Web Vitals |
| K5 | WCAG 자동 검사 | 미실행 | **AA 통과(주요 14화면)** | axe-core CI 통합 |
| K6 | 번들 사이즈 | 미측정 | **현재 대비 -10% 이상** | `@opennextjs/cloudflare build` 산출물 분석 |
| K7 | E2E 통과율 | 70개 spec / 미집계 | **신규 38장에 대해 90%↑** | Playwright CI |
| **K8** | **페이지별 API 호출 수** *(신규)* | **미측정 (핫스팟 5곳 확인)** | **초기 로드 ≤ 5건 · 1분 idle ≤ 2건** | Network 패널 카운터 + 자체 fetch 인터셉터 |

→ **Phase 0에 K3·K4·K5·K6·K8 측정 인프라 도입**을 포함.

---

## 3. Phase 0 — 전제조건 정비 (Week 0, 약 1주)

**목적**: 의사결정 미해결·인프라 누락·도구 부재를 정리해 Phase 1을 *추측이 아닌 결정 기반*으로 시작.

### 작업
- [ ] **의사결정 10개 확정** (§12 체크리스트)
- [ ] **lucide-react 도입** + 메인메뉴 8개 아이콘 우선 교체 (Quick Win)
- [ ] **기존 디자인 토큰 ↔ 신규 토큰 정렬표** 작성 (충돌·중복·신규 영역 표시)
- [ ] **KPI 측정 인프라 도입**: Web Vitals 로깅, axe-core dev 의존성, 모바일 사용 로깅(GA4 또는 Supabase), **API 호출 카운터(K8)**
- [ ] **도메인 인터뷰 슬롯 확보** (퇴원심사·OP체크 실사용자 30분 × 2명) — 불가 시 "추정 명시" 룰 확정
- [ ] **권한 키 인벤토리** 1페이지 (`lib/access-control.ts`의 RBAC 키 ↔ 96장 매핑)
- [ ] **Menu Unification Brief 배치 결정** (Phase 0 흡수 vs Phase 4 병합)
- [ ] **🚨 API 과다호출 핫스팟 5곳 즉시 패치** (대규모 리디자인 시작 전 격리):
  1. [시스템마스터센터.tsx:540-562](app/main/기능부품/관리자전용서브/시스템마스터센터.tsx) — 30s 폴링 + focus/visibilitychange 이중화 → **focus refetch에 60초 throttle, 폴링 30s→60s**
  2. [업무가이드.tsx:719-728](app/main/기능부품/게시판서브/업무가이드.tsx) — 3개 realtime 채널 단일 callback → **이벤트 배치(1초 윈도우) + dedup**
  3. [GlobalNotificationBell.tsx:62-121](app/components/GlobalNotificationBell.tsx) — INSERT/UPDATE마다 전체 리스트 재페치 → **payload만 state에 머지, 전체 fetch는 5분 stale 시에만**
  4. [근무현황.tsx:337-359](app/main/기능부품/근무현황.tsx) — realtime + visibilitychange + focus 삼중화 → **단일 scheduleRefresh + 30초 throttle**
  5. [출퇴근기록.tsx:328-331](app/main/기능부품/마이페이지/출퇴근기록.tsx) — visibilitychange + focus 이중 등록 → **단일 핸들러 + throttle**
- [ ] **데이터 페칭 라이브러리 도입 결정 (D11) 및 1차 도입** — SWR 또는 React Query 둘 중 채택, NotificationBell부터 시범 적용
- [ ] **공용 fetch 유틸 가드레일 작성** — `lib/fetcher.ts`에 inflight dedup + AbortController + 5분 메모리 캐시 wrapper

### 산출물
- `out/Phase0/decisions.md` (확정된 의사결정 10개)
- `out/Phase0/token_alignment.md` (현행 토큰 ↔ 계획서 토큰 매핑)
- `out/Phase0/rbac_inventory.csv` (권한 키 × 화면)
- `out/Phase0/measurement_setup.md` (Web Vitals·axe·GA·API 카운터 도입 안내)
- `out/Phase0/api_hotspot_patch_report.md` (5곳 핫스팟 패치 Before/After 호출 수)
- `out/Phase0/data_fetching_guidelines.md` (캐싱·debounce·realtime 규약 — Phase 1+ 신규 코드 적용)
- 코드 변경: `package.json`(lucide-react + 데이터 페칭 라이브러리), 메인 메뉴 8개 아이콘 SVG → Lucide, `lib/fetcher.ts` 신규, 핫스팟 5곳 패치 PR

---

## 4. Phase 1 — 통합 매트릭스 + 디바이스 분류 (Week 1–2)

**목적**: 96장 → 어떻게 38장으로 줄일지 정량적·시각적으로 합의.

### 작업
- [ ] 96장 × 5분류 매트릭스 (유지/탭통합/모달통합/스텝통합/삭제)
- [ ] 96장 × 디바이스 분류 (PC전용·Mobile전용·양쪽필수)
- [ ] 통합 패턴 카탈로그 5종 정의
  1. 상태전이 통합 (OP체크 5→1)
  2. 워크플로우 스텝 (퇴원심사 6→2)
  3. 탭 통합 (연차·근태·경영분석·감사센터)
  4. 마스터-디테일 (경조사·마감보고)
  5. 설정 통합 (템플릿 시스템 4장)
- [ ] 통합 그룹별 Before/After 다이어그램
- [ ] 우선순위 점수표 (임팩트 × 리스크 × 사용빈도 × 모바일비중)
- [ ] **도메인 인터뷰 1회 진행 또는 추정 명시**
- [ ] **Phase 1 종료 검증 게이트** — 사용자 승인 없이는 Phase 2 시작 금지

### 산출물
- `out/Phase1/Consolidation_Matrix.html` (인터랙티브, 필터 가능)
- `out/Phase1/Pattern_Catalog.md`
- `out/Phase1/Priority_Score.csv`
- `out/Phase1/Domain_Interview_Notes.md` (또는 추정 명시 문서)

---

## 5. Phase 2 — IA + 권한 매핑 + 코드 마이그레이션 전략 (Week 2–3)

**목적**: 5개 메뉴 IA + 모바일 IA + 코드 어떻게 옮길지 전략 확정.

### 작업
- [ ] 8개 대분류 → **5개 작업 중심 메뉴** 재편
  - 업무(내일·결재·소통) 7장 / 인사·근태·급여 12장 / 운영(재고·OP·심사) 9장 / 경영(대시보드·분석) 4장 / 설정(회사·권한·시스템) 6장
- [ ] 역할 기반 진입점 분리 (직원/관리자/원장)
- [ ] 3 depth 룰 적용 검증
- [ ] **모바일 IA 별도 설계** — 바텀탭 5개(홈·업무·내정보·알림·더보기)
- [ ] 검색·즐겨찾기 우선 IA (깊은 화면은 GlobalSearch로 도달)
- [ ] **RBAC 키 재매핑 표** — 현행 권한 키 ↔ 신규 화면 ID
- [ ] **코드 마이그레이션 전략 선택** (3안 중 택1)
  - A. 빅뱅 — 신규 라우트 전면 도입
  - B. 스트랭글러 — `app/main-v2/` 병행 운영 후 컷오버
  - C. 점진 wrapper — 기존 컴포넌트 유지하고 PageHeader·레이아웃만 교체
- [ ] **Menu Unification Brief의 53개 서브화면 통일 작업**을 코드 마이그레이션 전략에 흡수

### 산출물
- `out/Phase2/New_IA_Sitemap.html` (PC + Mobile 2종)
- `out/Phase2/Sidebar_Component.tsx` (Next.js 16/React 19 호환)
- `out/Phase2/BottomTab_Component.tsx` (모바일)
- `out/Phase2/Migration_Map.csv` (메뉴 단위)
- `out/Phase2/File_Migration_Matrix.csv` (코드 파일 단위, 196개 TSX)
- `out/Phase2/RBAC_Remap.csv`
- `out/Phase2/Migration_Strategy.md` (A/B/C 결정 및 사유)

---

## 6. Phase 3 — 우선순위 화면 리디자인 (Week 3–6)

**목적**: 임팩트 큰 8개 그룹의 PC+Mobile hi-fi mockup 및 인터랙티브 프로토타입.

### 리디자인 대상 — 8개 그룹 (원안 7 + 채팅 1)

| # | 그룹 | 현행 | → | 신규 | 디바이스 우선 | 변경 핵심 |
|---|---|---|---|---|---|---|
| ① | 급여 워크센터 | 13장 (#41~53) | → | 1장 | 🖥 Desktop | 단계 네비 + 모든 패널 한 화면 |
| ② | OP체크 실시간 보드 | 5장 (#08~12) | → | 1장 | 📱 Mobile | 상태전이를 카드 상태로, 인라인 액션 |
| ③ | 퇴원심사 워크플로우 | 6장 (#17~22) | → | 2장 | 🖥+📱 | 목록 + 사이드 패널 스텝 |
| ④ | 근태 통합 뷰 | 10장 (#30~40) | → | 3장 | 📱 Mobile | 대시보드/달력/근무표, 연차·이상감지 탭 |
| ⑤ | 관리자 운영·회사관리 | 11장 (#78~89) | → | 3장 | 🖥 Desktop | 회사정보 + 운영설정 + 템플릿 라이브러리 |
| ⑥ | 경영 인사이트 | 2장 (#71~72) | → | 1장 | 🖥 Desktop | 경영+재무 통합 대시보드 |
| ⑦ | 업무공유 협업센터 | 1장 (게시판 내) | → | 1장 | 📱 Mobile | 3분할 → 마스터-디테일 |
| ⑧ | **채팅·내정보 핵심** *(신규)* | 22+6장 | → | 4장 | 📱 Mobile | 메신저 통합 + 마이페이지 재정비 |

**합계: 70장 → 16장** (원안 47장 → 11장에서 확장)

### 각 그룹의 수락 기준 (Acceptance Criteria) — **모든 mockup에 적용**
- [ ] 🖥 PC hi-fi mockup (1280px)
- [ ] 📱 Mobile hi-fi mockup (375px), 터치 타깃 ≥ 44px
- [ ] 📐 Tablet 시안 (768px) + **PC축소/Mobile확장 선택 사유 명시**
- [ ] 🌙 **다크모드 변형 mockup** (수락 기준)
- [ ] ♿ **WCAG AA 자동검사 통과** (axe-core)
- [ ] 🖨 인쇄 필요 화면(급여명세서·계약서·증명서)은 인쇄 변형 포함
- [ ] 🎯 인터랙티브 프로토타입 (PC+Mobile)
- [ ] Before/After 비교 슬라이드
- [ ] **권한별 변형** (직원/관리자/원장 → 노출 차이 명시)
- [ ] **🚨 API 호출 예산 충족** (K8 목표) — 초기 로드 ≤ 5건, 1분 idle ≤ 2건, 검색 입력 시 debounce ≥ 300ms, realtime 채널 ≤ 2개 / 화면

### 산출물 디렉토리
- `out/Phase3/01_payroll/` ~ `out/Phase3/08_chat_mypage/`
- 각 디렉토리에 `PC.html`, `Mobile.html`, `Tablet.html`, `Dark.html`, `Print.html`(필요시), `prototype.html`, `acceptance.md`

---

## 7. Phase 4 — 디자인 시스템 검증·확장 (Week 4–8, Phase 3와 병행)

**목적**: 기존 토큰을 검증하고 **모바일·인쇄·접근성 누락 영역**을 확장. 코드 라이브러리 핸드오프.

### 작업
- [ ] **기존 토큰 검증** — `globals.css`의 `--accent`, `--radius-*`, `--sidebar-width`, `--submenu-width`, 다크모드 토큰이 신규 mockup과 1:1 정합되는지 점검
- [ ] **토큰 확장** — 누락 영역만 추가
  - 모바일 전용 spacing 토큰 (`--mobile-padding-*`)
  - 인쇄 전용 토큰 (`--print-foreground`, `--print-border`)
  - 터치 타깃 변수 (`--touch-target: 44px`)
- [ ] **컴포넌트 표준화 12종 — 반응형 변형 포함**
  - 버튼·인풋·셀렉트·테이블(→모바일 카드)·모달(→모바일 시트)·탭·카드·뱃지·토스트·로더·빈상태·폼레이아웃
- [ ] **모바일 전용 컴포넌트** — 바텀탭·바텀시트·풀스크린모달·스와이프액션·당겨서새로고침
- [ ] **패턴 가이드** — 빈상태/로딩/에러/확인 모달 (디바이스별 변형)
- [ ] **접근성 체크리스트** — WCAG AA + 키보드 + 포커스 링 + 터치 타깃 44px + Screen reader 라벨
- [ ] **Menu Unification Brief의 메뉴별 통일 작업** 흡수 (이모지→Lucide 전수 교체, PageHeader 통일)
- [ ] **Storybook 또는 컴포넌트 전시 페이지** — 개발팀 즉시 사용 가능 형태

### 산출물
- `out/Phase4/design_tokens.json` (기존 + 신규 통합)
- `out/Phase4/token_extension.md` (어떤 토큰이 추가됐는지)
- `out/Phase4/Component_Library.html` (실행 가능 전시)
- `out/Phase4/Pattern_Guide.html`
- `out/Phase4/A11y_Checklist.md`
- `out/Phase4/components/*.tsx` (Next.js 16/React 19 호환 컴포넌트)

---

## 8. 횡단 트랙 — 전 Phase 병행 진행

### 8-1. 코드 마이그레이션 트랙
Phase 2에서 결정된 전략(A/B/C)에 따라 Phase 3·4 진행 중 **점진적 코드 이관**.
- 196개 TSX 파일 × 마이그레이션 상태 추적
- JM 원칙: 신규 파일은 500줄 이내, 단일 책임
- 기존 비즈니스 로직(데이터 fetch, 검증) 보존, wrapper만 교체 우선

### 8-2. 테스트 트랙
- **E2E 70개 spec 영향 분석** → 화면 통합으로 deprecate되는 spec / 리팩토링 spec / 신규 spec 분류
- **신규 컴포넌트 단위 테스트 인프라 도입** (vitest 권장)
- Phase 3 산출물의 인터랙티브 프로토타입 → Playwright E2E로 발전

### 8-3. 백엔드·API 영향 트랙
- API 라우트(`app/api/*`) 변경 영향 분석
- Supabase 스키마 / R2 스토리지 / VAPID 푸시 / Firebase / OpenAI·Gemini 호환성 점검
- 신규 화면에서 필요한 API 추가 작업 목록

### 8-4. 인쇄·PWA·푸시 트랙
- 인쇄용 화면(급여명세서·계약서·증명서) 신규 토큰 대응
- PWA 매니페스트 (`public/manifest.json` 신규) — 의사결정 #2 결과에 따라
- VAPID + Firebase messaging 알림 UI 모바일 재설계

### 8-5. 권한·감사 트랙
- RBAC 키 재매핑 (Phase 2 산출물)
- 감사 로그 화면(#94~95) 영향 분석
- 권한별 mockup 변형 검증

### 8-6. 🚨 API 과다호출 방지 트랙 *(신규)*
**목적**: 리디자인된 38장이 *현재보다 적은 API 호출*로 작동하도록 구조적 가드레일을 박는다.

#### 핵심 원칙 (모든 신규 코드 강제 적용)
1. **공용 fetcher 사용 강제** — `lib/fetcher.ts` 경유, 직접 `supabase.from(...).select()` 또는 `fetch(...)` 금지 (eslint 룰로 차단)
2. **inflight dedup** — 동일 키의 fetch가 진행 중이면 새 호출은 기존 Promise 재사용
3. **클라이언트 메모리 캐시** — 기본 5분 stale, 컴포넌트는 캐시된 데이터를 먼저 렌더
4. **debounce 기본값** — 검색 input 300ms, 필터 변경 150ms (useDeferredValue로 표시 처리)
5. **realtime 채널 통합** — 화면당 채널 ≤ 2, 다중 테이블 구독 시 1초 윈도우 배치 + dedup
6. **focus/visibilitychange** — 최소 30초 throttle, realtime 활성 중이면 refetch 생략
7. **N+1 금지** — 리스트는 단일 JOIN/RPC로 일괄 로드, row별 fetch 금지
8. **AI/외부 API dedup** — 동일 입력 10초 내 중복 POST 차단 (서버측 idempotency key)
9. **AbortController 의무화** — 컴포넌트 unmount 시 inflight 요청 취소
10. **개발 환경 카운터** — `__API_CALL_COUNTER__` 글로벌 카운터로 페이지별 호출 수 측정 (K8)

#### Phase별 책임
| Phase | API 트랙 작업 |
|---|---|
| Phase 0 | 핫스팟 5곳 패치 + `lib/fetcher.ts` + eslint 룰 + 카운터 도입 |
| Phase 1 | 매트릭스에 화면별 *현재 API 호출 수* 컬럼 추가 |
| Phase 2 | IA 재편 시 *공통 데이터(직원·조직)* 캐시 정책 정의 |
| Phase 3 | 각 그룹 mockup 구현 시 K8 충족 검증 (수락 기준) |
| Phase 4 | 컴포넌트 라이브러리에 캐싱 wrapper hook 표준화 (`useCachedQuery`, `useThrottledRealtime` 등) |
| 회귀 방지 | Phase 0 패치 5곳에 *호출 카운트 회귀 테스트* 추가 (Playwright + network mock) |

#### 산출물
- `lib/fetcher.ts` — 공용 fetcher (dedup·cache·abort)
- `lib/realtime-bus.ts` — realtime 채널 통합·배치 dispatcher
- `lib/hooks/useCachedQuery.ts`, `useDebouncedSearch.ts`, `useThrottledRealtime.ts`
- `.eslintrc` 룰 — `no-restricted-syntax` 로 raw supabase/fetch 차단 (공용 fetcher 외)
- `docs/api_call_budget.md` — 화면별 호출 예산 표
- `tests/e2e/regression/api_call_count.spec.ts` — 핫스팟 회귀 테스트

---

## 9. 타임라인 — 9주

```
        W0  W1  W2  W3  W4  W5  W6  W7  W8
P0     ███
P1         ████████
P2             ████████
P3                 ████████████████
P4                     ████████████████
횡단 트랙  ████████████████████████████████████
```

| 주차 | 마일스톤 |
|---|---|
| W0 | 의사결정 확정, lucide 도입, KPI 인프라, **API 핫스팟 5곳 패치 + SWR 도입 + fetcher 가드레일** |
| W1 | 매트릭스 초안, 도메인 인터뷰 |
| W2 | 매트릭스 확정 + IA 초안 + **사용자 승인 게이트 1** |
| W3 | IA 확정, 코드 마이그레이션 전략 결정, Phase 3 1차 mockup |
| W4 | Phase 3 2~3 그룹 + 토큰 검증 + **승인 게이트 2** |
| W5 | Phase 3 4~6 그룹 + 컴포넌트 라이브러리 |
| W6 | Phase 3 7~8 그룹 + 패턴 가이드 |
| W7 | 접근성·다크모드 검증, Menu Unification 흡수 |
| W8 | 핸드오프 정리, KPI 측정 결과, **최종 승인 게이트 3** |

---

## 10. 산출물 인벤토리 (총 28종 + 코드 변경)

| Phase | 산출물 수 |
|---|---|
| Phase 0 | 4 + 코드(lucide 도입) |
| Phase 1 | 4 |
| Phase 2 | 7 |
| Phase 3 | 8 그룹 × 평균 6파일 ≈ 48파일 |
| Phase 4 | 6 + 컴포넌트 라이브러리 |
| 횡단 | 5 (E2E 영향분석, API 영향분석 등) |

---

## 11. 리스크 매트릭스

| ID | 리스크 | 영향 | 가능성 | 대응 |
|---|---|---|---|---|
| R1 | 도메인 검증 부족 → 워크플로우 파괴 | 매우 큼 | 중 | Phase 0/1에 인터뷰 슬롯 확보, 불가시 추정 명시 |
| R2 | 코드 마이그레이션 충돌 (병행 개발) | 큼 | 높 | 8주간 신규 화면 추가 보류 협의 |
| R3 | 디자인 시스템 토큰 충돌 | 중 | 높 | Phase 0 토큰 정렬표 + Phase 4 검증 |
| R4 | 모바일 사용 데이터 부재 | 큼 | 매우 높 | Phase 0 KPI 인프라 + 추정 명시 |
| R5 | E2E 70개 spec 리팩토링 비용 | 큼 | 매우 높 | 횡단 트랙에서 사전 영향 분석 |
| R6 | 권한 키 재매핑 누락 | 큼 | 중 | Phase 2 RBAC 재매핑 표 + 권한별 mockup 변형 |
| R7 | Cloudflare Workers 번들 크기 증가 | 중 | 중 | K6 측정, lucide tree-shaking 검증 |
| R8 | AI 채팅·푸시 알림 호환성 깨짐 | 중 | 낮 | 횡단 트랙 백엔드 영향 분석 |
| **R9** | **API 과다호출로 Supabase 비용·Rate limit 폭증** | **큼** | **높** *(현재 5곳 핫스팟 확인)* | **Phase 0 즉시 패치 + 8-6 트랙 가드레일 + K8 KPI** |
| **R10** | **신규 mockup이 기존보다 더 많이 호출하는 회귀** | 큼 | 중 | **Phase 3 수락 기준 K8 + 회귀 테스트 spec** |
| **R11** | **realtime 채널 폭발로 클라이언트 메모리 누수** | 중 | 중 | **realtime-bus 통합 dispatcher + 채널 수 제한** |

---

## 12. 의사결정 체크리스트 — Phase 0 진입 전 확정

| # | 항목 | 옵션 | 권장 |
|---|---|---|---|
| D1 | 전체 9주 vs Phase 1만 먼저 | 전체 / Phase 1 후 검토 | **Phase 1 후 검토** |
| D2 | 모바일 앱 형태 | 반응형웹 / PWA / 네이티브 | **PWA** (Firebase messaging 활용) |
| D3 | 산출물 포맷 | HTML 프로토 / Figma / React 코드 | **HTML 프로토 + React 코드** (Next.js 16/React 19 호환) |
| D4 | 채팅 메뉴 범위 | 포함 / 제외 / 별도 | **포함** (Phase 3 그룹 ⑧로 신설) |
| D5 | 도메인 인터뷰 가능 여부 | 가능 / 불가 | 가능시 진행, 불가시 추정 명시 |
| D6 | 모바일 사용 비중 데이터 | 있음 / 없음 | 없으면 Phase 0에서 측정 시작 |
| D7 | Menu Unification Brief 배치 | Phase 0 / Phase 4 / 별도 | **Phase 0 일부 + Phase 4 흡수** |
| D8 *(신규)* | 코드 마이그레이션 전략 | 빅뱅 / 스트랭글러 / 점진 | **스트랭글러** (안전성 우선) |
| D9 *(신규)* | Tablet(768px) 정책 | PC축소 / Mobile확장 / 그룹별 결정 | **그룹별 결정 + 사유 명시** |
| D10 *(신규)* | lucide-react 도입 시점 | Phase 0 / Phase 4 | **Phase 0** (Quick Win) |
| **D11** *(신규)* | **데이터 페칭 라이브러리** | **SWR / React Query / Custom hook only** | **SWR** (번들 작음, Next.js 친화, Cloudflare Workers 호환) |

---

## 13. 시작 명령 예시

```
Phase 0부터 진행합니다.
먼저 의사결정 D1~D11을 확정합시다. 권장안 검토 후 답해주시면,
- lucide-react + SWR 설치
- 공용 fetcher (lib/fetcher.ts) + eslint 룰 가드레일
- API 과다호출 핫스팟 5곳 즉시 패치 (시스템마스터센터·업무가이드·NotificationBell·근무현황·출퇴근기록)
- 메인메뉴 8개 아이콘 Lucide로 교체
- KPI 측정 인프라(Web Vitals + axe-core + API 카운터 K8) 도입
- 도메인 인터뷰 슬롯 확보
- 권한 키 인벤토리 작성
순으로 진행합니다.
```

---

## 14. 🚨 API 과다호출 — 현재 식별된 핫스팟 요약

Phase 0 직전 스캔 결과 (2026-05-11 기준):

| 우선순위 | 파일·라인 | 현재 위험 | Phase 0 즉시 조치 |
|---|---|---|---|
| **1** | [시스템마스터센터.tsx:540-562](app/main/기능부품/관리자전용서브/시스템마스터센터.tsx) | 30s 폴링 + focus + visibilitychange 삼중 호출 | 폴링 60s, focus refetch 60s throttle, realtime 중이면 폴링 중단 |
| **2** | [업무가이드.tsx:719-728](app/main/기능부품/게시판서브/업무가이드.tsx) | 3개 realtime 채널 동일 callback → 단일 변경에 3배 fetch | `realtime-bus` 통합 + 1초 윈도우 배치 dedup |
| **3** | [GlobalNotificationBell.tsx:62-121](app/components/GlobalNotificationBell.tsx) | INSERT/UPDATE 각각 전체 알림 리스트 재페치 | payload만 state merge, 전체 fetch는 5분 stale 시에만 |
| **4** | [근무현황.tsx:337-359](app/main/기능부품/근무현황.tsx) | realtime + focus + visibilitychange 삼중 호출 | 단일 scheduleRefresh + 30초 throttle |
| **5** | [출퇴근기록.tsx:328-331](app/main/기능부품/마이페이지/출퇴근기록.tsx) | focus + visibilitychange 이중 등록 | 단일 핸들러 + throttle |
| **(구조적)** | 전체 프로젝트 | SWR·React Query 미사용 → 캐싱 전무, debounce 라이브러리 미사용 | **SWR 도입 + `lib/fetcher.ts` 가드레일 + eslint 룰** |
| **(구조적)** | [OP체크.tsx](app/main/기능부품/OP체크.tsx) | 20+ useEffect, 다중 종속 쿼리 | Phase 3 그룹 ② 리디자인 시 단일 RPC 또는 JOIN으로 통합 |

### Phase 0 종료 시 검증
- 핫스팟 5곳 패치 전/후 API 호출 수 측정 → `out/Phase0/api_hotspot_patch_report.md`
- 목표: **총 합 50%↓**
- 회귀 방지: Playwright + network mock 으로 호출 수 상한 spec 작성

---

## 부록 A. 본 계획에서 의도적으로 제외된 항목

- 신규 기능 추가 (8주간 화면 추가 동결 협의 필요)
- 데이터베이스 스키마 변경 (별도 트랙으로 분리)
- 서버 인프라 변경 (Cloudflare Workers 유지)
- 다국어(i18n) 도입 — 현 단계에서 한국어 전용
- 모바일 네이티브 앱 — D2에서 PWA 권장

---

## 부록 B. 참조 문서

| 문서 | 역할 |
|---|---|
| `MSO_Claude_Code_Handoff.md` | 원안 작업 지시서 |
| `MSO_Master_Plan.html` | 원안 마스터 플랜 |
| `MSO_Screenshot_Labels.md` | 96장 라벨 매핑 |
| `MSO_Detailed_Design_Spec.md` | 메뉴별 세부 디자인 스펙 |
| `MSO_Design_Improvement.md` | 빠른 개선 가이드 |
| `MSO_Menu_Unification_Brief.html` | 메뉴 통일 작업 지시서 |
| `MSO_Design_Audit.html` | 초기 디자인 감사 |
| **`MSO_전체계획표_v2.md`** *(본 문서)* | **갭 분석 보완 통합 계획표** |

---

**Last note**: 본 계획은 *원안의 4 Phase 구조를 유지*하면서 **Phase 0 신설**과 **횡단 트랙 도입**, **수락 기준 강화**를 추가한 것입니다. v2.1은 D1~D10 확정 후 발행됩니다.

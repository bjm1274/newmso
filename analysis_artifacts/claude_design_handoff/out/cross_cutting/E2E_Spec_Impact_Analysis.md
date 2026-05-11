# E2E Spec 영향 분석 — v2 라우트 컷오버 대비

작성일: 2026-05-12  
분석 범위: `tests/e2e/*.desktop.spec.ts` (67개) + `tests/e2e/regression/*.desktop.spec.ts` (1개)  
v2 신규 라우트: `app/main-v2/` (Phase 2~3 전용)

---

## 1. 기존 spec 카테고리 분류 (전체 68개)

| 카테고리 | 파일 수 | 대표 파일 | 의존 라우트 |
|---|---|---|---|
| **Auth / 공통 smoke** | 3 | `smoke.desktop.spec.ts`, `admin-auth.desktop.spec.ts`, `integration.desktop.spec.ts` | `/` `/login` `/main` |
| **채팅** | 10 | `chat-detailed-walkthrough`, `chat-realtime`, `chat-deep-actions`, `chat-push-dispatch`, `chat-scroll-position`, `chat-room-list-actions`, `chat-font-loading`, `chat-image-fallback`, `chat-clipboard-image`, `chat-reverse-actions` | `/main` (채팅 서브뷰) |
| **게시판** | 2 | `board-detailed-walkthrough`, `board-notice-chat-announcement` | `/main` (게시판 서브뷰) |
| **전자결재** | 4 | `approval-detailed-walkthrough`, `approval-advanced-flows`, `approval-form-submissions`, `approval-date-filter` | `/main` (전자결재 서브뷰) |
| **인사(HR)** | 4 | `hr-detailed-walkthrough`, `hr-checklists`, `leave-management`, `training-capture` | `/main` (인사관리 서브뷰) |
| **근태** | 3 | `attendance-calendar`, `attendance-correction`, `attendance-issue-suite` | `/main` (근태 서브뷰) |
| **급여** | 4 | `payroll-ops`, `payroll-interim`, `payroll-working-hours`, `staff-salary-preview` | `/main` (급여 서브뷰) / `lib/` 함수 단위 |
| **재고** | 6 | `inventory-detailed-walkthrough`, `inventory-deep-operations`, `inventory-alerts`, `inventory-ecount-upload`, `inventory-supply-approval`, `inventory-legacy-schema` | `/main` (재고 서브뷰) |
| **OP 체크** | 1 | `op-check.desktop.spec.ts` | `/main` (추가기능 → OP체크) |
| **추가기능** | 2 | `extra-features-detail`, `extra-features-deep-actions` | `/main` (추가기능 서브뷰) |
| **알림 / 푸시** | 4 | `notification-open`, `notification-realtime`, `push-notification-shared`, `system-master-push-ops` | `/main` + `/api/` |
| **관리자 / 시스템마스터** | 4 | `admin-detailed-walkthrough`, `system-master-chat-filter`, `system-master-chat-history`, `system-master-empty-chat-room` | `/main` (관리자 서브뷰) |
| **기타 기능** | 8 | `incident-report`, `todo-reminder-dispatch`, `org-chart-working-status`, `mypage-deep-actions`, `salary-password`, `payment-deposits`, `shift-resolution`, `work-shift-custom-types` | `/main` (서브뷰 혼합) |
| **PWA / 디자인** | 4 | `pwa-installability`, `pwa-manifest-samsung`, `design-regression-check`, `manual-audit` | `/main` + 정적 자산 |
| **API 레벨 / lib 단위** | 5 | `api-authorization`, `download-url-helpers`, `system-master-route-compat`, `payroll-working-hours`, `real-db` | API 라우트 / `lib/` 직접 호출 |
| **회귀 (regression/)** | 1 | `regression/api_call_count.desktop.spec.ts` | `/main` |
| **메뉴 권한** | 1 | `menu-permissions.desktop.spec.ts` | `/main` |
| **chat-leave-room** | 1 | `chat-leave-room.desktop.spec.ts` | `/main` |

### 요약

- **총 68개** spec (desktop 67 + regression 폴더 1)
- **라우트 의존 비율**: `/main` 직접 진입 26파일, 간접(API·lib·정적) 의존 5파일, 혼용 37파일
- **v2 라우트 의존**: 현재 **0파일** (기존 spec은 모두 `/main` 또는 `/api/` 대상)

---

## 2. Sampling — 5개 spec 상세 분석

### 2-1. `smoke.desktop.spec.ts`
- `page.goto('/main')` → `data-testid="main-shell"` 검증
- v1 라우트(`/main`) **직접 의존** — v2 컷오버 시 URL만 교체하면 재사용 가능
- 판단: **리팩토링 필요 (낮은 비용)**

### 2-2. `op-check.desktop.spec.ts`
- `/main` 진입 후 사이드바 `extra-card-op-check` 클릭 → OP체크 서브뷰 진입
- v1 컴포넌트(data-testid)에 완전 의존 — v2 `/main-v2/ops/op-check-board`로 라우트가 독립될 시 구조 변경 필요
- 판단: **신규 작성 필요** (v2는 독립 페이지 라우트)

### 2-3. `payroll-working-hours.desktop.spec.ts`
- `lib/payroll-working-hours` 함수 직접 import, 브라우저 없이 로직 검증
- 라우트 무관 — v2 컷오버 **영향 없음**
- 판단: **유지 (Deprecate 불필요)**

### 2-4. `regression/api_call_count.desktop.spec.ts`
- `/main?open_menu=관리자&open_subview=시스템마스터센터` 형태의 v1 query param 라우팅
- v2는 라우트 분리(`/main-v2/...`)로 전환 — v1 query param 방식 폐기
- 판단: **v2 전환 후 신규 spec으로 대체 필요**

### 2-5. `api-authorization.desktop.spec.ts`
- `/api/` 엔드포인트에 직접 HTTP 요청, UI 없음
- v2 라우트 독립과 무관 — **영향 없음**
- 판단: **유지**

---

## 3. v2 컷오버 시 영향 추정

### 영향 없음 (Unaffected) — 약 26%

| 그룹 | 파일 수 | 이유 |
|---|---|---|
| lib/API 레벨 단위 테스트 | 5 | 라우트와 무관한 로직 검증 |
| 채팅 API 동작 (API 레벨) | 2 | `/api/chat/` 직접 호출 |
| PWA 매니페스트·정적 자산 | 2 | 라우트 독립적 |
| 알림·푸시 백엔드 ops | 3 | API 라우트 목 기반 |
| **소계** | **~18** | |

### 리팩토링 필요 (Refactor) — 약 50%

- `/main` → `/main-v2/[해당경로]` URL 교체
- `data-testid="main-shell"` → v2 쉘 testId 교체
- `seedSession` + `mockSupabase` 패턴 자체는 그대로 재사용 가능
- 대상: Auth smoke, 채팅, 게시판, 전자결재, HR 일부, 근태, 재고 등 (~34개)

### 신규 작성 필요 (New) — 약 15%

- v2는 서브뷰 대신 **독립 URL 라우트** 구조 → 기존 서브뷰 클릭 시퀀스 대신 직접 진입 패턴
- 대상: OP체크, 퇴원심사, 급여 워크센터, 근태 대시보드, 경영 대시보드 등 Phase 3 신규 화면 (~10개)

### Deprecate (폐기) — 약 9%

- v1 query param 라우팅 (`?open_menu=`, `?open_subview=`) 사용 spec
- 추가기능 카드 탐색 방식(`extra-card-*` testId) spec
- 대상: `regression/api_call_count`, `menu-permissions`, `extra-features-*` 일부 (~6개)

---

## 4. 전체 영향 요약

| 구분 | 수량 (추정) | 비율 |
|---|---|---|
| 영향 없음 (Unaffected) | ~18 | 26% |
| 리팩토링 필요 (Refactor) | ~34 | 50% |
| 신규 작성 필요 (New) | ~10 | 15% |
| Deprecate | ~6 | 9% |
| **합계** | **68** | 100% |

---

## 5. 권고 — spec 마이그레이션 전략

### 단계별 전략

**Phase A — 지금 (v2 개발 중)**
1. `tests/e2e/v2/` 디렉토리 신설 (완료)
2. Phase 3 그룹별 smoke spec 먼저 작성 (이 문서와 함께 제공)
3. v2 라우트가 없는 화면은 spec 작성 보류 — 구현 완료 후 작성

**Phase B — v2 피처 플래그 ON 단계**
1. `feature-flag.ts` 활성화 시점에 맞춰 v1 spec에 `.skip` 태그 추가
2. v2 spec에 해당 화면 커버리지 확보 후 v1 spec 제거
3. 리팩토링 대상(~34개)은 URL + testId만 교체 — 2시간 이내 완료 가능

**Phase C — 완전 컷오버 후**
1. `tests/e2e/` 최상위의 v1 spec 삭제 (또는 `_deprecated/` 이동)
2. `tests/e2e/v2/`를 `tests/e2e/` 루트로 승격
3. `regression/api_call_count.desktop.spec.ts`는 v2 핫스팟 기준으로 재작성

### 공통 패턴 보존 원칙
- `seedSession` + `mockSupabase` 헬퍼는 v2에서도 **동일하게 재사용**
- v2 쉘 진입점 testId(`data-testid="v2-shell"` 등) 규칙을 컴포넌트 개발 시 미리 약속
- API 호출 카운트 상한(`≤ N`) 패턴은 v2 spec에도 **K8 제약으로 유지**

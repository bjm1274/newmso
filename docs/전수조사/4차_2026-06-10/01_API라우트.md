# 4차 전수조사 — ① API 라우트 (2026-06-10)

> 범위: `app/api/**` route.ts 98개 + `middleware.ts` + `cloudflare-worker.ts` = 100파일 전수 정독
> ✅표시 = Opus가 코드 직접 재확인 완료

## 구조적 전제 (중요)

**middleware.ts는 `/main/:path*`만 보호한다** (`matcher: ['/main/:path*']`). 즉 `/api/*`는 전역 인증 게이트가 없고, **각 라우트가 자체적으로 세션을 검사해야 한다.** 아래 인증 누락 건은 이 전제 위에서 실제 외부 노출이다. ✅

## CRITICAL

### [C-1] 인증 전무 — 연차 동기화 엔드포인트 ✅
- 파일: `app/api/admin/annual-leave/sync/route.ts:5-21`
- POST 핸들러에 세션 확인이 전혀 없음. 주석("서버 측에서 D1 바인딩이 보장된 환경이므로 안전")은 인증과 무관한 잘못된 근거. 비로그인 외부에서 임의 `staffId`로 연차 재계산 강제 실행 가능.

### [C-2] 채팅방 PATCH 멤버십 미검증 — 수평 권한 상승 ✅
- 파일: `app/api/chat-rooms/[id]/route.ts:52-96`
- 헤더 주석(5~8행)에는 "members 변경 시 현재 사용자가 멤버여야 함" 정책이 명시돼 있으나 **구현 코드가 없음**. 로그인 사용자 누구나 임의 roomId의 name/members/type 변경 가능. 멤버 목록 교체로 타인 대화방 침입·축출 가능.

## MAJOR

### [M-1] 요청 경로 런타임 DDL — d1/mutate·d1/query ✅
- 파일: `app/api/d1/mutate/route.ts:267-288`, `app/api/d1/query/route.ts:327-345`
- 매 요청마다 `CREATE TABLE IF NOT EXISTS disciplinary_committees` + `CREATE UNIQUE INDEX idx_contracts_staff_contract_type` 실행. try/catch로 감싸져 실패가 요청을 막지는 않으나(에이전트 보고의 "요청 차단"은 과장), D1 잠금 경합·요청당 오버헤드·마이그레이션 이중 관리(0012와 중복)가 실재. → [07_SQL_DB.md](07_SQL_DB.md) 마이그레이션 체인 문제와 함께 해소 필요.

### [M-2] mock sentinel로 장애 은폐 — ai/chat
- 파일: `app/api/ai/chat/route.ts:41`
- `apiKey.startsWith('AIzaSyBGqA18')`로 mock 분기. Firebase 웹 API 키 자체는 NEXT_PUBLIC 공개값이라 "시크릿 노출"은 아니나(✅재해석), 실키 미설정·교체 시 **오류 없이 mock 응답을 반환해 장애를 은폐**하는 설계가 문제. env 플래그로 대체 권장.

### [M-3] 인-메모리 레이트 리미터 — Workers 환경 무력화
- 파일: `app/api/ai/roster-recommendation/route.ts:9`
- 모듈 스코프 `Map` 기반 카운터는 Cloudflare Workers 인스턴스 간 공유되지 않아 사실상 무력. (다른 rate-limit 적용 라우트 5종도 동일 패턴인지 점검 권장)

### [M-4] 은행 계좌번호 하드코딩 (2곳 중복) ✅
- 파일: `app/api/payments/virtual-account-deposits/route.ts:187`, `app/main/기능부품/입금실시간조회.tsx:70`
- `토스뱅크 1002-4939-3286` 리터럴. 계좌 변경 시 코드 배포 필요 + 동일 값 2중 관리. 환경변수/설정 테이블로 이전.

### [M-5] 웹훅 토큰 쿼리스트링 수락 — 로그 평문 노출
- 파일: `app/api/payments/virtual-account-webhook/route.ts:19-26`
- `?token=`을 deprecated 경고만 남기고 계속 수락. 액세스 로그·프록시에 토큰 평문 기록. 유예기간 종료 후 차단 필요.

### [M-6] `any` 남용 — 인증·푸시 핵심 경로
- `app/api/auth/master-login/route.ts` (successResponse(user: any), id:null 세션 가능), `app/api/notifications/push-self-test/route.ts`, `app/api/notifications/chat-push/route.ts:46`, `app/api/ai/roster-recommendation/route.ts:1712~`
- 인증/푸시 같은 민감 경로의 타입 무력화. master-login의 `id: null` 세션은 downstream null 참조 위험.

### [M-7] N+1 / 비원자 업데이트
- `app/api/license-ce/[id]/route.ts:145-177` — 순차 2쿼리(단일 OR 쿼리 가능)
- `app/api/admin/annual-leave/manual-grant/route.ts` — 직원 루프 내 `leave_balances`/`staff_members` 개별 UPDATE, 중간 실패 시 불일치. D1 `batch()` 필요.

## MINOR

| # | 파일 | 내용 |
|---|------|------|
| m-1 | `app/api/auth/check-force-logout/route.ts:49` | 시스템마스터(9999) 세션은 force_logout 검사 무조건 우회 — 계정 탈취 시 강제 로그아웃 불가 |
| m-2 | `app/api/extract-invoice/route.ts:118-120` | 최상위 catch가 오류를 완전 폐기(로그도 없음) — 디버깅 불가 |
| m-3 | `app/api/admin/audit/summary/route.ts` | `.limit(20000)` 단일 요청 메모리 적재 |
| m-4 | `app/api/admin/audit/{anomalies,payroll-outliers,summary}` | 쿼리 실패를 빈 배열 200 OK로 무음 처리 — 감사 누락 은폐 |
| m-5 | `app/api/realtime/stream/route.ts:121-157` | abort 신호 의존 무한 루프 — 조용한 연결 종료 시 CPU 소모 가능 |
| m-6 | `app/api/approvals/upload/route.ts` | 위험 MIME 거부 목록 없음 (board/upload는 매직바이트 검증과 대비) |
| m-7 | `app/api/notifications/push-subscription/route.ts:54-56` | `detectExtendedColumnSupport()` 항상 true — Supabase 잔재 죽은 분기 |
| m-8 | `app/api/roster/approval-request/route.ts:470` | 요청 처리 중 `await import('drizzle-orm')` 동적 import — 상단 정적 import로 |
| m-9 | `app/api/weather/route.ts:133-136` | lat/lon 범위검증은 있으나 문자열 그대로 URL 보간 — 숫자 변환 후 직렬화 권장 |
| m-10 | `app/api/notifications/push-config/route.ts` | VAPID 공개키 무인증 노출(공개키라 위험 낮음) — 의도 주석 부재 |

## 오탐 기각

- ~~transcribe 인증 조건 역전~~ — `readAuthorizedExtraFeatureUser`는 성공 시 `status: null` 반환(lib/server-extra-feature-access.ts:18-58 ✅확인). `if (!auth.user || auth.status || auth.error)`는 올바르게 동작. discharge-review의 `!== null` 표기와의 스타일 불일치만 존재.

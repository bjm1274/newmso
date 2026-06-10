# Fable5 재실행 — ① API 라우트 (검토 84파일)

> ✅ = Opus 코드 직접 재확인. [검증] = Fable5 독립 검증자 판정.

## CRITICAL
- **api-1 [보안/IDOR]** `app/api/admin/annual-leave/sync/route.ts:5-21` — 세션 검사 전무. body.staffId만으로 `syncAnnualLeaveUsedForStaff`/`recalculateLeaveBalance` 실행. middleware가 `/api` 미보호 → 미인증자가 임의 직원 연차 변조. [검증 confirmed critical] ✅ 라이브 호출처(LeaveWorkcenter·휴가관리메인) 존재.

## MAJOR
- **api-2 [보안]** `ai/roster-recommendation/route.ts:9,1730` — 모듈스코프 `Map` 레이트리밋. Workers isolate 분산으로 전역 차단 불가(같은 repo의 `lib/rate-limit.ts`는 이 이유로 D1 전환). 비싼 Gemini Pro 호출 과소차단. [검증 confirmed major]
- **api-3 [성능]** `d1/query/route.ts:327-348` — 매 POST마다 `CREATE TABLE IF NOT EXISTS disciplinary_committees` + `employment_contracts` UNIQUE INDEX `d1.exec`. read 핫패스에 마이그레이션 DDL. mutate에도 중복. [검증 confirmed major — 단 라우트 자체는 인증됨(297-300), 부하는 round-trip] (=sql-01, lib-04는 검증자가 minor 강등)

## MINOR
| ID | 파일:라인 | 분류 | 내용 |
|---|---|---|---|
| api-4 | d1/mutate/route.ts:267-288 | 중복 | api-3 DDL 블록이 mutate에도 복제 |
| api-5 | payments/virtual-account-webhook/route.ts:16-26 | 보안 | 웹훅 토큰 query string fallback 허용 — 로그/리퍼러 평문 노출(주석도 제거예정 인지) |
| api-6 | chat/og-preview/route.ts:15,175 | 성능 | 모듈스코프 `Map` OG 캐시 — isolate 분산으로 적중 저조(외부 fetch 반복). SSRF 가드는 적절 |
| api-7 | extract-invoice/route.ts:118-123 | 에러처리 | 최상위 `catch {}` — 에러 미바인딩·로그 없이 고정 문자열. 원인 진단 불가 |
| api-8 | d1/query/route.ts:54,153 | 의미없는 | `contains` op이 zod enum에 없어 빌더의 contains 분기 도달 불가(죽은 코드). ※ lib-02가 동전의 양면(클라가 보내면 400) |
| api-9 | notifications/mark-read/route.ts:25-33 | 코드오류 | 성공/실패 무관 매 요청 `recordFailedAttempt` 증가·reset 없음 — 정상 사용도 분당 120회 차단 가능. chat-push·repush-unread 등 복제 |

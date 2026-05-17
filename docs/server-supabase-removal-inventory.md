# 서버 측 Supabase 호출지 인벤토리 (Phase 8-B 시작 시점)

## 목적

Phase 7로 클라이언트 코드는 `d1Client`(`/api/d1/query`·`/api/d1/mutate`)
경유로 일원화되었지만, 서버 측 `lib/*` 와 `app/api/*/route.ts` 는 여전히
`supabase.from()` 직접 호출 + `mirrorRowsToD1` 패턴(dual-write)을 쓴다.

진짜 Supabase 완전 제거를 위해 이 인벤토리를 기준으로 단계별 변환을
수행한다.

## 범위 / 제외

- 포함: `lib/*` (Drizzle/D1 인프라 제외), `app/api/*` (D1 인프라 라우트 제외)
- 제외 (인프라):
  - `lib/supabase.ts` — Supabase 클라이언트 정의 자체
  - `lib/d1-supabase-compat.ts` — D1 쿼리를 supabase-from 호환 API로
    감싸는 호환 레이어
  - `lib/chat-rooms-client.ts` — 클라이언트 전용 헬퍼, 이미 `/api`
    경유 (코멘트만)
  - `app/api/d1/query/route.ts`, `app/api/d1/mutate/route.ts` — D1 게이트웨이

## 패턴 분류 기준

- **a) read만 (SELECT)** — D1 drizzle `select` 로 변환 쉬움
- **b) write만 (INSERT/UPDATE/DELETE)** — D1 drizzle write 로 변환 +
  dual-write 헬퍼 정리
- **c) read+write 혼재** — 신중 변환 (트랜잭션 경계 확인)
- **d) RPC 호출** — D1 TS 포트(`lib/db/functions/*.ts`) 활용
- **e) admin/service role 의존** — RLS 우회를 D1 측에서 어떻게 대체할지
  별도 처리 필요 (현재 admin/system-master, reset-staff 등 다수)

## 우선순위 기준

- **high**: 사용 빈도 높음 + dual-write 헬퍼가 이미 짝지어진 곳 (변환
  비용 대비 효과 큼)
- **medium**: 단일 도메인, 파일 격리되어 변환 안전
- **low**: 라인 수 많고 admin/service role 의존, 또는 cron 전용 (변환은
  필요하지만 후순위)

## 서버 lib/* 인벤토리

| # | 파일 (라인) | 라인 | 분류 | 비고 | 우선순위 |
|---|---|---:|---|---|---|
| 1 | `lib/annual-leave-expiry.ts` (159) | 45, 65 | b) write | `annual_leave_promotion_logs.insert` + `notifications.insert`. mirror 헬퍼 미사용. | medium |
| 2 | `lib/audit.ts` (162) | 139 | b) write | `audit_logs.insert` — 이미 `mirrorRowsToD1` 짝 있음 (Phase 2.5) | high |
| 3 | `lib/auto-report-generator.ts` (134) | 40, 131 | c) read+write | `staff_members.select` + `notifications.insert` | medium |
| 4 | `lib/chat-push-dispatch.ts` (989) | 574, 881 | c) read+write | `staff_members.select`, `push_subscriptions.delete`. **500줄 초과, 별도 PR로 헬퍼 분리 권장** | low |
| 5 | `lib/chat-push-health.ts` (209) | 127 | a) read | head:true count — D1 `count(*)` 로 변환 | medium |
| 6 | `lib/data/official-docs.ts` (88) | 79, 85 | b) write | `official_doc_log.update/delete` | medium |
| 7 | `lib/data/org.ts` (124) | 103, 121 | b) write | `org_teams.insert/delete` | medium |
| 8 | `lib/data/chat-monitoring.ts` (82) | 73 | b) write | `messages.delete` (admin 모니터링) | medium |
| 9 | `lib/leave-notice-cron.ts` (267) | 193 | b) write | `messages.insert` — cron 전용 | low |
| 10 | `lib/leave-policy-settings.ts` (166) | 142 | b) write | `system_settings.upsert` (onConflict: 'key') | medium |
| 11 | `lib/license-expiry-jobs.ts` (328) | 166, 307 | b) write | `notifications.insert` chunked — cron 전용 | low |
| 12 | `lib/notification-repush.ts` (370) | 340 | b) write | `push_subscriptions.delete` — cron 전용 | low |
| 13 | `lib/notification-utils.ts` (355) | 271, 282, 339 | b) write | `notifications.insert/upsert` — **본 PR 시범 변환 대상** | high |
| 14 | `lib/official-document-approval.ts` (135) | 114 | b) write | `official_doc_log.insert` | medium |
| 15 | `lib/payroll-record-upsert.ts` (281) | 178 | b) write | `payroll_records.upsert` — Phase 2.8 dual-write 짝 있음 | high |
| 16 | `lib/roster-policy-storage.ts` (176) | 116 | b) write | `roster_policy_settings.upsert` | medium |
| 17 | `lib/server-approval-processing.ts` (580) | 67, 125, 229, 335, 391, 412, 530 | c) read+write | 결재 처리 7+1 지점 dual-write (Phase 2.7) — 가장 핵심 도메인. **500줄 초과, 헬퍼 분리 권장** | high |
| 18 | `lib/todo-reminder-cron.ts` (239) | 135, 191, 213 | b) write | `notifications.insert` + `todo_reminder_logs.upsert` — cron 전용 | low |

## 서버 app/api/* 인벤토리

| # | 파일 (라인) | 라인 | 분류 | 비고 | 우선순위 |
|---|---|---:|---|---|---|
| 1 | `app/api/board/notice-broadcast/route.ts` (226) | 177, 188 | c) read+write | `staff_members.select` + `notifications.insert` | medium |
| 2 | `app/api/chat-rooms/[id]/route.ts` (106) | 96 | b) write | `chat_rooms.update` — Phase 2.11 신규 라우트 | medium |
| 3 | `app/api/chat-rooms/route.ts` (165) | (다수) | c) read+write | chat_rooms upsert/insert, service-role 직접 사용 | medium |
| 4 | `app/api/admin/notifications/push-health/route.ts` (111) | 61, 62 | a) read | service-role read — admin 진단 | low |
| 5 | `app/api/admin/staff-password/route.ts` (108) | 53, 84 | b) write | `audit_logs.insert` × 2 (성공/실패 둘 다 기록) | medium |
| 6 | `app/api/admin/system-master/route.ts` (1302) | 543~1191 (다수) | c) read+write | **admin 마스터 콘솔**, 30개+ 호출. service-role 의존. **별도 long-term PR 필요** | low |
| 7 | `app/api/admin/reset-staff/route.ts` (128) | 101, 108 | b) write | service-role bulk delete (dep tables + staff_members) | low |
| 8 | `app/api/cron/auto-report/route.ts` (109) | 66 | b) write | `generated_reports.insert` | low |
| 9 | `app/api/work-shifts/bulk-deactivate/route.ts` (109) | 95 | b) write | `work_shifts.delete` (fallback retry) | medium |
| 10 | `app/api/cron/push-subscription-cleanup/route.ts` (245) | 35, 100, 101 | c) read+write | push_subscriptions cleanup + staff_members read | low |
| 11 | `app/api/roster/approval-request/route.ts` (526) | 501 | b) write | `notifications.insert` | high |
| 12 | `app/api/payments/virtual-account-deposits/route.ts` (268) | 199 | a) read | `virtual_account_deposits.select` | medium |
| 13 | `app/api/notifications/push-subscription/route.ts` (271) | 48, 222 | c) read+write | health check + 초과 토큰 delete | medium |
| 14 | `app/api/admin/system-master/route.ts` | RPC | d) RPC | `chat_room_cleanup_via_rpc` 등 — D1 TS 포트 필요 | low |

## 총계

- **서버 호출지 총 파일 수**: 32개 (lib 18 + app/api 14)
- **분류별 카운트**:
  - a) read만: 3개 (`chat-push-health`, `admin/notifications/push-health`,
    `payments/virtual-account-deposits`)
  - b) write만: 17개 (대부분 notifications/logs insert)
  - c) read+write 혼재: 10개
  - d) RPC 호출: 1개 (`system-master`의 chat cleanup)
  - e) admin/service role 의존: 5개 (`admin/system-master`,
    `admin/reset-staff`, `admin/staff-password`,
    `admin/notifications/push-health`, `chat-rooms/route.ts`)
- **우선순위별**:
  - high: 5개 (`audit.ts`, `notification-utils.ts`,
    `payroll-record-upsert.ts`, `server-approval-processing.ts`,
    `roster/approval-request/route.ts`)
  - medium: 13개
  - low: 14개 (cron, admin 콘솔, 대형 파일)

## 변환 전략 (다음 Phase 8-C/D/...)

1. **Phase 8-B (본 PR)**: 시범 1개 — `lib/notification-utils.ts`. 패턴
   확립 + 인벤토리 보고서 작성.
2. **Phase 8-C**: high 우선순위 4개 일괄 변환 (`audit.ts`,
   `payroll-record-upsert.ts`, `server-approval-processing.ts`,
   `roster/approval-request/route.ts`).
3. **Phase 8-D**: medium write-only 일괄 (10개 내외).
4. **Phase 8-E**: read+write 혼재.
5. **Phase 8-F**: admin/service-role 의존 — 마지막. `admin/system-master`
   는 별도 long-term PR.
6. **Phase 8-G**: cron 전용 (`leave-notice-cron`, `license-expiry-jobs`,
   `notification-repush`, `todo-reminder-cron`,
   `cron/push-subscription-cleanup`, `cron/auto-report`).
7. **Phase 8-Z**: `mirrorRowsToD1`, `dual-write` 헬퍼 자체 제거 +
   `lib/supabase.ts` 제거.

## 시범 변환 결과 (Phase 8-B)

`lib/notification-utils.ts`:
- `supabase.from('notifications').insert(...)` 3곳 → D1 drizzle insert로
  교체
- `supabase.from('staff_members').select(...)` 1곳 → D1 drizzle select
- `supabase.from('notifications').select(...)` (admin dedupe lookup) →
  D1 drizzle select
- `mirrorNotificationsToD1` 함수는 유지 (다른 곳에서 import 됨), 단 본
  파일 내부에서는 더 이상 호출 불필요 (이미 D1에 직접 insert)

> 본 파일은 현재 355줄. 변환 후 약 +30/-30줄 수준이라 500줄 한도 안에
> 들어옴. 향후 helper 분리가 필요해질 경우 `notifications-d1.ts` 신규
> 파일로 normalize/insert helper만 떼는 것을 권장.

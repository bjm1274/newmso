# 6차 전수조사 — API ↔ lib 호출 정합 / 코드 위생

> 조사일: 2026-07-15  
> 범위: `lib/**/*.ts`, `app/api/**/*.ts`, 클라이언트 `fetch('/api/...')` 패턴  
> 방식: READ-ONLY 전수 grep + 핵심 파일 정독  
> 제외: `node_modules/`, `docs/` 내 문서만 언급(근거 아님)

---

## 0. 요약 (한 장)

| 분류 | 건수(대략) | 심각도 |
|------|-----------|--------|
| 호출 0인 dead/유령 API | **14+** | 중 (정리 대상) / 일부 고 (동작 불가 경로) |
| 라우트 없는 broken fetch | **0** (실코드 기준) | — |
| lib 유틸 중복·재export | **5군** | 중 |
| server-only 누수 위험 | **1군** (`notification-utils`) | 중 |
| D1 policy vs 클라이언트 쓰기 불일치 | **2~3군** | 고 |
| 이름만 다른 wrapper 체인 | **4군** | 중 |

**핵심 결론**

1. **실앱 broken API(라우트 없음)는 없음.** 호출 경로는 모두 존재하는 `route.ts`와 대응.
2. **dead API가 상당수.** 문서·주석·e2e만 남은 엔드포인트, 또는 cron이 라우트가 아니라 lib를 직접 호출하는 이중 구조.
3. **클라이언트 쓰기의 정본은 `/api/d1/mutate` + `assertAccess`.** 그런데 알림 등 일부는 정책과 어긋나거나 푸시 파이프라인을 우회.
4. **`lib/chat-write-service.ts`는 분할 모듈의 합본 유령.** 실제 import는 거의 `chat-rooms-client` / `chat-message-write` 쪽.

---

## 1. API 라우트 목록 vs 실제 fetch 호출

### 1.1 조사 방법

- 라우트: `app/api/**/route.ts` 내 `export async function (GET|POST|…)` (약 **111** 핸들 파일, shared 제외)
- 호출: `app/`, `lib/`, `public/`, `tests/` 의 `fetch('/api/…')` · `xhr.open(…, '/api/…')` · 상수 엔드포인트 맵
- cron 스케줄: `cloudflare-worker.ts` 의 `CRON_ROUTES_BY_SCHEDULE`

### 1.2 호출 경로가 있는 API (현역 요약)

| 영역 | 경로 | 주요 호출처 |
|------|------|-------------|
| Auth | `/api/auth/session`, `master-login`, `change-password`, `verify-password` | `app/login/page.tsx`, `app/main/page.tsx`, 마이페이지·모바일 내정보, `lib/client-logout.ts` |
| D1 게이트 | `/api/d1/query`, `/api/d1/mutate` | `lib/d1-compat/*`, `lib/db-client.ts` (전 클라이언트 DB 경로) |
| D1 RPC | `/api/d1/rpc/increment-post-views`, `register-staff` | 게시판, `lib/db-client.ts` RPC 맵 |
| 채팅 | `chat-rooms`, `chat/upload`, `presence`, `typing`, `read-cursors`, `quick-reply` | 메신저·모바일 채팅, `lib/polling-bus.ts`, SW |
| 알림 | `/api/notifications*`, `chat-push`, `chat-push-flush`, `push-subscription`, `push-config`, `mark-read`, `push-self-test` | `알림시스템*.tsx`, SW, 로그아웃 |
| 결재 | `approvals/transition`, `process-final`, `approval/recall`, `approvals/upload` | 전자결재 훅·모바일 결재 |
| 재고 | `inventory/stock-*`, `po-*`, `closing` (**consume 제외**) | `lib/inventory-stock-client.ts` |
| 관리자 | system-master, audit/*, annual-leave/sync·diagnose·manual-grant, staff-*, force-logout, data-reset, popups upload/delete, seal | 관리자 워크센터·전용 서브 |
| 기타 | weather, license-ce*, work-shifts*, roster/approval-request, discharge-review, ai/*, payments/*, calendar/feed-token, realtime/*, board/*, todos/reminders/dispatch | 각 기능 부품 |

### 1.3 Dead API (앱/lib 실호출 0)

클라이언트(`app/main`, `lib` 실코드)에서 **경로 문자열 참조 0**인 엔드포인트.

| # | 경로 | 상태 | 비고 |
|---|------|------|------|
| D-1 | `GET/POST?` `app/api/inventory/stock-consume/route.ts` | **완전 dead** | `inventory-stock-client`에 미등록. 형제 stock-transfer/post/update만 사용. 내부 `atomicStockConsumeWithLog`는 D1 `transaction()` 이슈 이력(4차) 있음 |
| D-2 | `GET` `app/api/chat/og-preview/route.ts` | **완전 dead** | `og-preview` / `ogPreview` / `ogCache` 전 코드베이스 0 (app+lib) |
| D-3 | `GET` `app/api/auth/check-force-logout/route.ts` | **완전 dead** | 주석은 “클라이언트 주기 호출”이지만 실제는 `GET /api/auth/session` 응답의 `force_logout_at` 사용 (`app/main/page.tsx`) |
| D-4 | `GET` `app/api/admin/notifications/push-health/route.ts` | **완전 dead** | 동일 로직 `collectChatPushQueueHealth`를 `admin/system-master/handlers/operations.ts`가 직접 호출 |
| D-5 | `POST` `app/api/notifications/repush-unread/route.ts` | **사실상 dead** | cron `unread-notification-repush`는 **lib `processUnreadNotificationRepushServer` 직접 호출** — 이 HTTP API는 호출 0 |
| D-6 | `GET` `app/api/popups/route.ts` | **완전 dead** | UI는 `db.from('popups')` (`팝업창관리자.tsx`). 본 라우트는 무인증·CORS `*` 잔재 |
| D-7 | `POST` `app/api/chart-ocr/route.ts` | **완전 dead** | `chart-ocr` 문자열 전 소스 0 |
| D-8 | `POST` `app/api/extract-invoice/route.ts` | **완전 dead** | 명세서 OCR UI 연결 없음 (재무 세금계산서 탭은 별 경로) |
| D-9 | `POST` `app/api/consultation/transcribe/route.ts` | **앱 dead** | 실 UI는 `POST /api/consultation/analyze` (`수술상담.tsx`). 모바일 주석만 transcribe 표기. e2e `api-authorization`만 호출 |
| D-10 | `GET` `app/api/consultation/config/route.ts` | **완전 dead** | Gemini 키 존재 여부 반환 — 호출 0 |
| D-11 | `POST` `app/api/consultation/upload-plan/route.ts` | **완전 dead** | presign 전용 — 호출 0 (분석은 FormData→analyze) |
| D-12 | `POST` `app/api/admin/annual-leave/accrual-run` | **UI dead** | 수동 백필용으로 보이나 UI fetch 0 (cron은 `/api/cron/annual-leave-accrual`) |
| D-13 | `POST` `app/api/admin/annual-leave/announce-run` | **UI dead** | 동일 |
| D-14 | `POST` `app/api/admin/annual-leave/promotion-run` | **UI dead** | 동일 |
| D-15 | `POST` `app/api/admin/audit/restore` | **alias 잔존** | 실호출은 `/api/admin/audit/backups/restore`. restore 자체는 re-export/동일 핸들러 의도 (501 미지원 설계) |

**빈 디렉터리 (유령)**

- `D:\newmso\app\api\check-notices\` — `route.ts` 없음. 디렉터리만 존재.

### 1.4 Cron 라우트: 존재 vs 스케줄 등록

`cloudflare-worker.ts` 등록 목록:

| 스케줄 | 경로 |
|--------|------|
| `*/5 * * * *` | `/api/cron/chat-push-dispatch` |
| `0 15 * * *` | `/api/cron/backup` |
| `0 17 * * *` | `/api/cron/chat-retention` |
| `0 3 * * *` | `/api/cron/push-subscription-cleanup` (+ 주석: license-expiry 통합) |
| `0 0 * * *` | unread-repush, leave-notice, birthday, annual-leave-*, substitute-holiday, payroll-notice |

**route.ts는 있으나 worker 스케줄에 없는 cron (외부 수동/미배선 가능):**

| 경로 | 비고 |
|------|------|
| `/api/cron/auto-report` | 스케줄 미등록 |
| `/api/cron/todo-reminders` | system-master `_shared.ts` 목록에는 있으나 worker 맵 없음 |
| `/api/cron/inapp-notifications` | 주석상 push-subscription-cleanup 연계 또는 수동 Bearer 호출 전제 |
| `/api/cron/license-expiry-check` | push-subscription-cleanup 끝 통합 — 단독 스케줄 없음 |

→ **“라우트 dead”가 아니라 “트리거 dead”** 후보. 운영 의도 확인 후 삭제 or wrangler 등록.

### 1.5 Broken API (호출 있으나 라우트 없음)

| 패턴 | 결과 |
|------|------|
| 실코드 `fetch('/api/...')` | **대응 라우트 전부 존재** |
| 주석/예시 | `lib/offline-queue.ts` 주석의 `/api/notes`, `PwaBootstrap` 예시 — **문서성, 런타임 무관** |

**주의: 이중 업로드 경로 혼선 (broken은 아님, 정합 이슈)**

| 용도 | 오프라인 큐 (`offline-upload-queue.ts`) | 온라인 UI 실호출 |
|------|----------------------------------------|------------------|
| 결재 첨부 | `/api/approval/upload` (presign 플랜) | 대부분 `/api/approvals/upload` (서버 직접 R2) |
| 서류 제출 | `/api/submission/upload` | UI는 주로 `approvals/upload` 재사용 |

→ 라우트는 둘 다 존재하나 **라이브 경로와 오프라인 경로 엔드포인트가 불일치**. 오프라인 재시도 시 결재/서류 업로드 동작 차이 가능.

### 1.6 외부·비브라우저 소비 (dead로 보지 않음)

| 경로 | 소비자 |
|------|--------|
| `/api/calendar/feed` | 외부 캘린더 구독 URL (`feed-token`이 URL 생성) |
| `/api/storage/object`, `/api/download` | URL 리라이트·다운로드 (`object-storage-url.ts`) — 브라우저 직접 fetch 적음 |
| `/api/payments/virtual-account-webhook` | 토스 웹훅 + 입금실시간조회 수동 트리거 |
| cron `*` | Cloudflare Cron Trigger |

---

## 2. lib 유틸 중복

### 2.1 날짜 삼분법: `seoul-time` / `date-utils` / `date-formatter`

| 파일 | 역할 | 비고 |
|------|------|------|
| `lib/seoul-time.ts` | **KST 정본** — `getKoreanTodayString`, `formatKoreanDateKey`, `getKoreanMonthString`, time/label | 서버·cron·업무 키에 광범위 사용 |
| `lib/date-utils.ts` | `getMonthBoundaries`, `formatDateDisplay`, `toDateKey` + **`getKoreanTodayString` re-export** | 캘린더 로컬 키(`toDateKey`)와 KST 키 혼용 위험 지점 |
| `lib/date-formatter.ts` | `formatDateLabel`, `formatMonthLabel`, `buildDateRangeLabel`, `formatWon` | 표시용. `formatDateLabel` ≈ `date-utils.formatDateDisplay` 와 유사 |

**호출 분산**

- `date-utils`: 메신저, 근무현황, 인계노트, OrgChart, 마이페이지, 모바일 내정보
- `date-formatter`: 재고 hooks, 서류제출, 구성원현황, 시스템마스터, 급여이상치
- `seoul-time`: lib 연차·급여·cron·모바일 결재/채팅/출퇴근 등 **정본 경로**

**권장**

- DB 키·오늘 날짜: 항상 `seoul-time` (또는 re-export 한 곳만)
- 로컬 달력 셀 키: `toDateKey` 유지하되 주석으로 KST와 차이 명시
- 표시 포맷: `date-formatter`로 통합, `formatDateDisplay` 흡수

### 2.2 Toast

- **단일 정본:** `lib/toast.ts` (DOM 직접 주입)
- sonner 등 이중 toast 없음 — 양호
- 사용: 모바일·PC 광범위 (`import { toast } from '@/lib/toast'`)

### 2.3 Access control 오버랩

| 파일 | 역할 |
|------|------|
| `lib/access-control.ts` | **런타임 게이트** — `canAccessMainMenu`, `hasPermission`, `canAccessExtraFeature`, `isAdminUser` 등 |
| `lib/feature-permissions.ts` | **권한 키 카탈로그/UI 메타** (label, hint, group) — 관리자 토글 UI용 |
| `lib/server-extra-feature-access.ts` | 세션 + `access-control` 조합 — API 전용 |
| `lib/server-session.ts` | 쿠키 세션 읽기 — API/middleware |

오버랩 자체는 역할 분리로 정당. 다만 **권한 키 문자열이 access-control 내부 맵과 feature-permissions 목록에 이중 정의**되어 키 추가 시 한쪽만 갱신될 위험.

### 2.4 대시보드 위젯 이중 파일

| 파일 | 내용 |
|------|------|
| `lib/dashboard-widgets.ts` | 위젯 타입·DEFAULT_WIDGETS·정의 |
| `lib/data/dashboard-widgets.ts` | 실제 count fetch (`fetcher` + `db-client`) |

이름 유사로 혼동 쉬움. import 시 `@/lib/data/dashboard-widgets` vs `@/lib/dashboard-widgets` 주의 — 현재 호출처는 대체로 올바름.

### 2.5 알림 유틸 이중 경로

| 파일 | server-only | 역할 |
|------|-------------|------|
| `lib/notification-utils.ts` | **없음** | 클라이언트 헬퍼(`toNotificationText`, `timeAgo`) + **서버/클라 분기 insert** (`sendAdminNotifications`) |
| `lib/notification-shared.ts` | **있음** | 푸시 구독 정리 등 서버 전용 |
| `lib/notification-push-dispatch.ts` | **있음** | FCM/WebPush 디스패치 |

`sendAdminNotifications` 클라이언트 분기: `d1.from('notifications').insert` — **푸시 파이프라인 미경유** (4차 M-5 계열 잔존).

---

## 3. server-only 모듈 vs 클라이언트 import

### 3.1 `import 'server-only'` 보유 모듈

| 모듈 | 클라이언트 import? |
|------|-------------------|
| `lib/object-storage.ts` | 없음 (API only). 클라이언트는 `object-storage-url.ts` |
| `lib/notification-shared.ts` | 없음 (API/lib 서버 경로) |
| `lib/notification-push-dispatch.ts` | 없음 |
| `lib/backup-cron.ts`, `contract-expiry-jobs.ts`, `license-expiry-jobs.ts` | 없음 |
| `lib/inapp-notification-jobs*` | 없음 |

### 3.2 위험: `notification-utils` (server-only 미표기)

- 상단에서 `getD1Binding`, `emitRealtimeSignal`, drizzle 테이블 import
- 클라이언트 다수 import:
  - `app/main/기능부품/알림시스템.tsx` — `toNotificationText`, `getInitials`, `timeAgo`
  - `app/main/모바일/내정보/알림탭.tsx`, `알림설정.tsx`
  - `app/main/기능부품/마이페이지/index.tsx`, `MobileShell.tsx` — **`sendAdminNotifications`**
- `sendAdminNotifications`는 `typeof window` 분기로 클라/서버 분리하지만, **모듈 그래프에 서버 전용 의존이 묶여 번들 비대화·실수 import 위험**
- 권장: pure helpers (`toNotificationText`, `timeAgo`, `getInitials`) → `notification-format.ts` 분리; insert는 서버 API 또는 명시적 server-only

### 3.3 정상 분리 사례

- `object-storage` (server) vs `object-storage-url` (client) — 의도적 분리, 잘 지켜짐
- 즐겨찾기설정.ts 주석: “server-only 모듈 import 금지” — 의식적 방어

### 3.4 `chat-write-service` / `chat-push-enqueue`

- `enqueueChatPushJob`은 `getD1Binding` 사용 → **서버 전용 성격**이나 server-only 미표기
- 현재 호출: `leave-notice-cron`, `birthday-announcements`, mutate 경로 등 서버측
- `chat-write-service`가 동일 함수를 재수록 → 클라이언트가 이 파일을 import하면 위험  
  - 실 import: `오프보딩.tsx` → `patchChatRoom` only (fetch 래퍼라 당장 안전하나 모듈 경계 불량)

---

## 4. D1 policy vs 실제 클라이언트 쓰기

### 4.1 정본 경로

```
브라우저 db.from(table).insert/update/delete
  → lib/d1-compat/mutation-builders.ts
  → POST /api/d1/mutate
  → assertAccess(POLICY_REGISTRY)
```

정책 정의: `lib/db/auth/policies.ts`  
강제 적용 위치: **mutate 라우트뿐** (주석: cron/직접 drizzle은 우회).

### 4.2 불일치 / 리스크

#### P-1. 알림 insert 정책 vs 다자 알림 발송 (고)

- 정책: `notifications.insert = SELF_OR_SAME_COMPANY`, `staffIdField: 'user_id'`
- 평가: 본인 `user_id` 이거나 `erpCanManageCompany` + 대상 동일 회사
- 클라이언트 실태:
  - `sendAdminNotifications` (클라이언트 분기): 행정/원무/경영지원 다수 admin에게 insert
  - `useSupplyWorkflow.ts`: 타 사용자 notifications 직접 insert
  - 메신저·OP체크·인사 data-hooks 등 다수 `d1.from('notifications').insert`
- **일반 직원이 타인 user_id로 insert 시 policy deny 가능** / 관리자·매니저는 통과
- 또한 서버 `insertNotificationsOrThrow`는 D1 직접 경로 → **mutate 시그널/정책 우회** (의도적 서버 권한)

#### P-2. 재고 수량 변경: 전용 API 정본 vs consume 고아

- 수량 원자 변경: `lib/inventory-stock-client.ts` → `/api/inventory/stock-update|post|transfer|po-*|closing`
- `/api/inventory/stock-consume` **미연결** → 부서 소모 UX가 있다면 다른 경로(stock-post 등)로 흡수됐거나 기능 공백
- 비수량 메타는 여전히 `db.from('inventory')` (d1 query/mutate + INVENTORY_SCOPE)

#### P-3. 팝업 읽기

- 정책/게이트 API: `GET /api/popups` (dead, 무인증)
- 실사용: `db.from('popups')` → d1/query (세션 필요)
- 관리 쓰기는 admin popups upload/delete API

#### P-4. 채팅방 멤버 변경

- 정책: `chatRoomsUpdateGuard` (멤버십·강퇴 규칙) — mutate 경로
- 클라이언트 쓰기는 `chat-rooms-client` → `/api/chat-rooms/[id]` PATCH (별 라우트 정책; 4차 C-2 이슈 이력 재확인 권장)

#### P-5. 결재 상태 전이

- 상태 변경 정본: `/api/approvals/transition`, `process-final`, `approval/recall`
- 메타/첨부 일부는 여전히 `db.from('approvals')` mutate — APPROVAL_SCOPE 적용

---

## 5. 이름만 다르고 같은 일 하는 wrapper 체인

### 5.1 채팅 쓰기 합본 vs 분할 (최우선 정리)

```
[분할 정본 — 실사용]
lib/chat-rooms-client.ts      → createOrUpsertChatRoom, patchChatRoom  → /api/chat-rooms*
lib/chat-message-write.ts     → insertChatMessageWithFallback         → d1 mutate messages
lib/chat-push-enqueue.ts      → enqueueChatPushJob                    → D1 chat_push_jobs
lib/chat-upload-constants.ts  → CHAT_MAX_*

[합본 유령]
lib/chat-write-service.ts     → 위 4종을 한 파일에 복제 수록
                              → 실 import: 오프보딩.tsx 의 patchChatRoom 1곳뿐
```

→ **chat-write-service 제거 또는 re-export 전용 얇은 배럴로 축소** 권장.

### 5.2 업로드 엔드포인트 이중화

```
온라인 UI  ──► /api/approvals/upload   (multipart → 서버 R2)
오프라인큐 ──► /api/approval/upload    (JSON presign)
오프라인큐 ──► /api/submission/upload  (presign)
게시판     ──► /api/board/upload
채팅       ──► /api/chat/upload
```

`approval` vs `approvals` 복수형 혼용 — 기능 유사, 구현 상이(presign vs 직접 업로드).

### 5.3 알림 발송 체인

```
[서버 정본]
insertNotificationsOrThrow / sendAdminNotifications(server)
  → D1 직접 insert + emitRealtimeSignal
  → (일부) dispatchPushForNotificationRows

[클라 우회]
d1.from('notifications').insert
  → /api/d1/mutate + policy
  → 푸시 미발송 가능

[HTTP 알림 목록]
/api/notifications  (알림시스템 / notification-api.ts)
```

### 5.4 수술상담 AI 이중 라우트

```
실사용: POST /api/consultation/analyze   (FormData, XHR)
유령:   POST /api/consultation/transcribe
        GET  /api/consultation/config
        POST /api/consultation/upload-plan
```

모바일 파일 헤더 주석은 여전히 `transcribe` — 문서/주석 정합 깨짐.

### 5.5 연차 실행 경로

```
UI 동기화: POST /api/admin/annual-leave/sync (+ diagnose, manual-grant)
Cron:      GET  /api/cron/annual-leave-{accrual,promotion,expiry}
수동 run:  POST /api/admin/annual-leave/{accrual,announce,promotion}-run  ← UI 0
```

---

## 6. API 전체 인벤토리 (경로 × 소비 상태)

범례: ● 현역 / ◐ 서버·cron·외부 / ○ dead·UI0 / ◆ alias

| 경로 | 상태 |
|------|------|
| `/api/auth/session` | ● |
| `/api/auth/master-login` | ● |
| `/api/auth/change-password` | ● |
| `/api/auth/verify-password` | ● |
| `/api/auth/check-force-logout` | ○ |
| `/api/d1/query` | ● |
| `/api/d1/mutate` | ● |
| `/api/d1/rpc/increment-post-views` | ● |
| `/api/d1/rpc/register-staff` | ● (RPC 맵) |
| `/api/chat-rooms` | ● |
| `/api/chat-rooms/[id]` | ● |
| `/api/chat/upload` | ● |
| `/api/chat/presence` | ● |
| `/api/chat/typing` | ● |
| `/api/chat/read-cursors` | ● |
| `/api/chat/quick-reply` | ● (SW) |
| `/api/chat/og-preview` | ○ |
| `/api/notifications` | ● |
| `/api/notifications/push-subscription` | ● |
| `/api/notifications/push-config` | ● |
| `/api/notifications/push-self-test` | ● |
| `/api/notifications/mark-read` | ● (SW) |
| `/api/notifications/chat-push` | ● |
| `/api/notifications/chat-push-flush` | ● |
| `/api/notifications/repush-unread` | ○ (cron은 lib 직행) |
| `/api/admin/notifications/push-health` | ○ |
| `/api/approvals/transition` | ● |
| `/api/approvals/process-final` | ● |
| `/api/approvals/upload` | ● |
| `/api/approval/recall` | ● |
| `/api/approval/upload` | ◐ (오프라인 큐 맵) |
| `/api/submission/upload` | ◐ (오프라인 큐 맵) |
| `/api/board/upload` | ● |
| `/api/board/notice-broadcast` | ● |
| `/api/inventory/stock-update` | ● |
| `/api/inventory/stock-post` | ● |
| `/api/inventory/stock-transfer` | ● |
| `/api/inventory/stock-consume` | ○ |
| `/api/inventory/po-receive` | ● |
| `/api/inventory/po-inspect` | ● |
| `/api/inventory/closing` | ● |
| `/api/admin/system-master` | ● |
| `/api/admin/audit/summary` | ● |
| `/api/admin/audit/anomalies` | ● |
| `/api/admin/audit/payroll-outliers` | ● |
| `/api/admin/audit/backups` | ● |
| `/api/admin/audit/backups/restore` | ● |
| `/api/admin/audit/restore` | ◆ |
| `/api/admin/annual-leave/sync` | ● |
| `/api/admin/annual-leave/diagnose` | ● |
| `/api/admin/annual-leave/manual-grant` | ● |
| `/api/admin/annual-leave/accrual-run` | ○ UI |
| `/api/admin/annual-leave/announce-run` | ○ UI |
| `/api/admin/annual-leave/promotion-run` | ○ UI |
| `/api/admin/staff-permission` | ● |
| `/api/admin/staff-password` | ● |
| `/api/admin/force-logout` | ● |
| `/api/admin/data-reset` | ● |
| `/api/admin/reset-staff` | ● |
| `/api/admin/verify-unlock` | ● |
| `/api/admin/popups/upload` | ● |
| `/api/admin/popups/delete` | ● |
| `/api/admin/seal/upload` | ● |
| `/api/popups` | ○ |
| `/api/staff/profile-photo/upload` | ● |
| `/api/license-ce` | ● |
| `/api/license-ce/[id]` | ● |
| `/api/license-ce/ocr` | ● |
| `/api/work-shifts` | ● |
| `/api/work-shifts/bulk-deactivate` | ● |
| `/api/roster/approval-request` | ● |
| `/api/ai/chat` | ● |
| `/api/ai/roster-recommendation` | ● |
| `/api/discharge-review` | ● |
| `/api/consultation/analyze` | ● |
| `/api/consultation/transcribe` | ○ 앱 / e2e only |
| `/api/consultation/config` | ○ |
| `/api/consultation/upload-plan` | ○ |
| `/api/chart-ocr` | ○ |
| `/api/extract-invoice` | ○ |
| `/api/payments/virtual-account-deposits` | ● |
| `/api/payments/virtual-account-webhook` | ● / 외부 |
| `/api/calendar/feed-token` | ● |
| `/api/calendar/feed` | ◐ 외부 구독 |
| `/api/realtime/stream` | ● (polling-bus) |
| `/api/realtime/tail` | ● |
| `/api/weather` | ● |
| `/api/todos/reminders/dispatch` | ● |
| `/api/storage/object` | ◐ URL |
| `/api/download` | ◐ URL |
| `/api/cron/*` (16) | ◐ 스케줄 일부만 worker 등록 |

---

## 7. 권장 조치 (우선순위)

### P0 — 동작/보안 정합

1. **알림 클라이언트 직접 insert 정리**  
   - 타 사용자 알림은 서버 API(`insertNotificationsOrThrow` 경유 전용 엔드포인트)로 통일  
   - `sendAdminNotifications` 클라이언트 분기 제거  
   - 푸시 파이프라인 우회 제거 (`useSupplyWorkflow` 등)

2. **`/api/popups` 무인증 엔드포인트**  
   - 호출 0이면 삭제 또는 세션 필수 + CORS `*` 제거

### P1 — dead 코드 제거/문서화

3. 삭제 후보: `stock-consume`, `og-preview`, `check-force-logout`, `chart-ocr`, `extract-invoice`, `consultation/{config,upload-plan}`, (선택) `transcribe` if analyze-only  
4. `chat-write-service.ts` → 배럴 re-export 또는 삭제, 오프보딩 import를 `chat-rooms-client`로  
5. `notification-utils` pure 분리 + server-only 경계  
6. cron 미배선(`auto-report`, `todo-reminders`, `inapp-notifications`) 운영 의도 확인 후 worker 등록 or 삭제  
7. `app/api/check-notices/` 빈 폴더 삭제

### P2 — 위생/중복

8. 날짜 유틸 역할 문서 1장 + import lint 규칙  
9. `approval/upload` vs `approvals/upload` 단일 계약 (presign vs direct)  
10. 연차 `*-run` admin API: 시스템마스터 UI 버튼 연결 or 삭제  
11. 모바일 수술상담 주석 `transcribe` → `analyze` 수정

---

## 8. 조사 한계

- 동적 URL 조립(`const path = '/api/' + x`) 전수는 정적 grep 한계 — 주요 패턴은 커버
- `analysis_artifacts/`, `scratch/`, `electron-app/` 제외
- e2e 전용 호출은 “앱 현역”과 분리 표기
- 런타임 403(policy deny) 실증은 코드 정적 분석 수준 — 스테이징 재현 권장

---

## 9. 관련 과거 문서

- `docs/전수조사/4차_2026-06-10/01_API라우트.md`
- `docs/전수조사/4차_2026-06-10/02_라이브러리.md`
- `docs/전수조사/4차_2026-06-10/08_죽은코드_중복_위생.md`
- `docs/전수조사/3차_2026-06-01/01_알림.md` (push-health 호출 0 — 본 조사 재확인)

---

*작성: 6차 코드위생 전수조사 서브에이전트 (READ-ONLY)*

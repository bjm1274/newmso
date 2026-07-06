# Gemini 작업 지시서: Cloudflare Durable Objects 실시간 채팅 전환 및 모바일 채팅 정상화

작성일: 2026-07-06  
대상 저장소: `D:\newmso`  
목표: Cloudflare $5 Workers Paid 플랜 안에 최대한 들어오도록 D1 realtime 스캔 비용을 제거하고, 모바일 채팅을 PC 채팅 수준으로 정상화한다.

## 1. 역할

Gemini는 이 저장소의 구현 담당자다. 단순 분석 보고서가 아니라 실제 코드 수정, 테스트, 검증 결과까지 완료해야 한다.

작업 중 반드시 지킬 것:

- 기존 사용자 변경사항을 되돌리지 않는다.
- Supabase를 다시 도입하지 않는다.
- 메시지 본문/첨부/이력 저장소는 기존처럼 D1/R2를 유지한다.
- Durable Objects는 메시지 저장소가 아니라 실시간 신호 버스로만 사용한다.
- WebSocket은 반드시 Cloudflare Durable Objects WebSocket Hibernation API를 사용한다.
- 일반 `ws.accept()` 방식으로 연결을 유지하지 않는다. 유휴 duration 비용이 발생할 수 있다.
- `.env.local`, API token, secret, Firebase service account 등 비밀값을 출력하거나 커밋하지 않는다.
- 한국어 파일명/경로가 많다. PowerShell 출력이 깨져 보여도 파일 자체를 임의로 rename하지 않는다.

## 2. 현재 실제 사용량 기준

다음 값은 Cloudflare API와 D1에서 확인한 실제 지표다. 측정 범위는 `2026-06-06 02:47 UTC ~ 2026-07-06 02:47 UTC`다.

### Cloudflare Workers

- Worker: `erp-pchos`
- 최근 30일 requests: 약 `5,449,555`
- 최근 30일 CPU: 약 `73,632,893 ms`
- Workers Paid 포함량:
  - requests: `10,000,000/month`
  - CPU: `30,000,000 ms/month`
- 판단:
  - requests는 포함량 안이다.
  - CPU는 포함량을 약 `43,632,893 ms` 초과한다.

### Cloudflare D1

- D1 DB: `pchos-d1`
- database_id: `e6e054c7-2bba-4a97-a740-b39a42906a74`
- 최근 30일 rows read: 약 `61,626,472,347`
- 최근 30일 rows written: 약 `953,801`
- DB size: 약 `75.6 MB`
- D1 Paid 포함량:
  - rows read: `25,000,000,000/month`
  - rows written: `50,000,000/month`
  - storage: `5 GB`
- 판단:
  - rows written과 storage는 충분히 포함량 안이다.
  - rows read는 포함량을 약 `36,626,472,347` 초과한다.
  - D1 read 초과분만 단순 계산해도 약 `$36.6` 추가 비용 수준이다.

### 최근 30일 채팅 실사용량

- messages total: `17,788`
- messages 30d: `4,753`
- messages 7d: `1,390`
- active rooms 30d: `140`
- senders 30d: `33`
- attachments 30d: `536`
- attachment bytes 30d: `1,380,536,412`
- reactions 30d: `254`
- replies 30d: `355`
- poll votes 30d: `2`

이 수치상 채팅 자체는 크지 않다. 비용 문제의 본질은 메시지 수가 아니라 realtime 변경 감지용 D1 반복 스캔이다.

## 3. 비용 폭증 원인

최근 30일 D1 rows read 상위 쿼리:

1. `SELECT "created_at" AS ts FROM "notifications" ORDER BY "created_at" DESC LIMIT ?`
   - rows read 약 `29,730,713,702`
2. `SELECT "created_at" AS ts FROM "messages" ORDER BY "created_at" DESC LIMIT ?`
   - rows read 약 `12,715,544,404`
3. `SELECT "created_at" AS ts FROM "messages" ORDER BY REPLACE("created_at", 'T', ' ') DESC LIMIT ?`
   - rows read 약 `12,212,250,828`
4. `SELECT "created_at" AS ts FROM "notifications" ORDER BY REPLACE("created_at", 'T', ' ') DESC LIMIT ?`
   - rows read 약 `4,019,957,470`
5. `SELECT "last_read_at" AS ts FROM "room_read_cursors" ORDER BY "last_read_at" DESC LIMIT ?`
   - rows read 약 `876,817,046`

관련 파일:

- `lib/polling-bus.ts`
- `lib/realtime-bus.ts`
- `app/api/realtime/stream/route.ts`
- `app/api/realtime/tail/route.ts`
- `app/main/모바일/채팅/data-hooks.ts`
- `app/main/기능부품/메신저구독훅.ts`
- `app/main/기능부품/useChatTypingD1.ts`
- `app/main/hooks/usePresenceHeartbeat.ts`

현재 `stream`/`tail` 구조는 구독된 테이블마다 최신 timestamp를 D1에서 계속 조회한다. 특히 `notifications`, `messages`가 반복 스캔되고, `ORDER BY REPLACE(created_at, 'T', ' ')`는 인덱스를 제대로 활용하지 못해 비용을 키운다.

## 4. 최종 목표

### 필수 목표

1. D1 table timestamp 스캔 기반 realtime 감지를 제거한다.
2. Cloudflare Durable Objects + WebSocket Hibernation 기반 실시간 신호 버스를 추가한다.
3. 기존 `subscribeRealtime`, `subscribeRealtimeBatched`, `pokeChannel` 호출부의 공개 API를 유지한다.
4. 채팅 메시지, 방 목록, 답글, 반응, 읽음, 투표, 알림이 실시간으로 갱신되어야 한다.
5. 모바일 채팅에서 PC처럼 오래된 답글 원문 보기, 검색 결과 이동, 스레드 답글 보기가 동작해야 한다.
6. 기존 D1/R2 데이터 모델을 유지한다.
7. 배포 후 D1 rows read가 월 250억 이하로 떨어질 수 있는 구조여야 한다.

### 비목표

- Supabase Realtime 재도입 금지.
- 메시지를 Durable Object storage에 영구 저장하지 않는다.
- `messages`, `notifications` 테이블을 다른 DB로 이전하지 않는다.
- 채팅 UI를 전면 재작성하지 않는다.
- 비용 문제를 단순히 poll interval만 늘려서 숨기지 않는다.

## 5. 권장 아키텍처

### 전체 흐름

현재:

```text
client subscribeRealtime
  -> EventSource /api/realtime/stream
  -> stream route가 5초마다 D1 최신 timestamp 조회
  -> 변경 감지 후 callback
```

변경 후:

```text
client subscribeRealtime
  -> WebSocket /api/realtime/ws
  -> Durable Object RealtimeHub에 구독 등록

server/client mutation 발생
  -> D1에 실제 데이터 저장
  -> emitRealtimeSignal([...channelKeys])
  -> Durable Object가 해당 구독자에게 change event broadcast
  -> client callback 실행 후 필요한 데이터만 refresh
```

### Durable Object 범위

초기 구현은 단순성과 현재 규모를 우선한다.

- DO class: `RealtimeHub`
- namespace binding: `REALTIME_HUB`
- object id: `idFromName("pchos-realtime-v1")`
- 단일 global hub로 시작한다.
- 현재 최근 30일 발신자 33명, 활성 방 140개 수준이므로 단일 hub가 충분하다.
- 추후 사용량이 커지면 `room:{roomId}` 또는 `company:{companyId}` 샤딩으로 확장한다.

### WebSocket Hibernation

반드시 Cloudflare Hibernation API를 사용한다.

- `ctx.acceptWebSocket(server)` 또는 현재 Workers 런타임의 동등한 Hibernation API를 사용한다.
- `ws.accept()` 사용 금지.
- 각 WebSocket에는 `serializeAttachment`로 최소 상태를 저장한다.
  - `userId`
  - `userName`
  - `subscriptions`
  - `connectedAt`
  - `lastSeenAt`
- DO constructor는 hibernation 복귀 시 가벼워야 한다.
- in-memory Map은 성능 최적화로만 사용하고, hibernation 이후 복원 가능한 구조로 만든다.

## 6. 파일별 작업 범위

### 6.1 Wrangler 설정

파일: `wrangler.toml`

추가할 항목 예시:

```toml
[[durable_objects.bindings]]
name = "REALTIME_HUB"
class_name = "RealtimeHub"

[[migrations]]
tag = "v1_realtime_hub"
new_sqlite_classes = [ "RealtimeHub" ]
```

주의:

- 기존 `[[d1_databases]]`, `[triggers]`, `[vars]`를 훼손하지 않는다.
- Cloudflare 공식 문서 기준으로 `new_sqlite_classes` 문법을 확인한다.
- 이미 migrations가 있다면 tag 충돌 없이 새 tag를 추가한다.

참고 문서:

- https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/

### 6.2 Worker entry

파일: `cloudflare-worker.ts`

현재 이 파일은 OpenNext handler를 감싸고 cron route를 직접 처리한다. 여기에 WebSocket 라우팅을 추가한다.

요구사항:

- `/api/realtime/ws` 요청을 OpenNext로 넘기기 전에 먼저 처리한다.
- `Upgrade: websocket`이 아니면 `426` 또는 `400` 응답한다.
- session cookie `erp_session`을 검증한다.
- 인증 실패 시 `401`.
- 인증 성공 시 `REALTIME_HUB` DO stub으로 request를 forward한다.
- DO에 넘기기 전 신뢰 가능한 header를 서버에서 덮어쓴다.
  - `x-realtime-user-id`
  - `x-realtime-user-name`
  - 필요 시 `x-realtime-company-id`
- 클라이언트가 보낸 동일 header는 신뢰하지 않는다.

세션 검증 주의:

- 기존 `lib/server-session.ts`의 `readSessionFromRequest`는 `process.env.SESSION_SECRET`를 본다.
- top-level Worker에서 안정적으로 쓰기 어렵다면, `verifySessionToken`을 secret 주입형 함수로 분리한다.
- 예: `verifySessionTokenWithSecret(token, secret)`.
- 기존 Next API route 동작을 깨지 않게 기존 export는 유지한다.

### 6.3 Durable Object class

권장 신규 파일:

- `lib/realtime/realtime-hub.ts`
- 또는 `workers/realtime-hub.ts`

그리고 `cloudflare-worker.ts`에서 반드시 export:

```ts
export { RealtimeHub } from './lib/realtime/realtime-hub';
```

DO가 처리할 endpoint:

1. `GET /api/realtime/ws`
   - WebSocket upgrade
   - 인증 header 확인
   - `acceptWebSocket`
   - attachment 저장
   - connected event broadcast는 필요 시 presence에만 사용

2. `POST /internal/realtime/signal`
   - 서버 내부에서만 사용
   - body:
     ```json
     {
       "channels": ["messages", "messages:room_id=eq.123", "chat_rooms"],
       "payload": {
         "source": "chat-message-write",
         "roomId": "123",
         "messageId": "..."
       }
     }
     ```
   - 해당 channel을 구독한 WebSocket에게 `change` 전송

3. WebSocket client message
   - `hello`
   - `subscribe`
   - `unsubscribe`
   - `signal`
   - `typing:start`
   - `typing:stop`
   - `presence:update`
   - `ping`

메시지 schema 예시:

```ts
type ClientToServer =
  | { type: 'hello'; clientId: string }
  | { type: 'subscribe'; channels: string[] }
  | { type: 'unsubscribe'; channels: string[] }
  | { type: 'signal'; channels: string[]; payload?: unknown }
  | { type: 'typing:start'; roomId: string; userName: string }
  | { type: 'typing:stop'; roomId: string }
  | { type: 'presence:update'; state: 'online' | 'away' }
  | { type: 'ping'; at: number };

type ServerToClient =
  | { type: 'ready'; serverTime: string }
  | { type: 'change'; channels: string[]; payload?: unknown; serverTime: string }
  | { type: 'typing'; roomId: string; userId: string; userName: string; typing: boolean; serverTime: string }
  | { type: 'presence'; userId: string; userName?: string; state: 'online' | 'away'; serverTime: string }
  | { type: 'pong'; at?: number; serverTime: string };
```

채널 매칭 규칙:

- exact key matching을 기본으로 한다.
- `messages:room_id=eq.123` 변경 시 emit caller가 아래를 모두 보낸다.
  - `messages:room_id=eq.123`
  - `messages`
  - `chat_rooms`
- DO는 복잡한 SQL filter parsing을 하지 않는다.
- 기존 `TableFilter`는 client에서 canonical key로 변환한다.

보안:

- DO는 header의 user id/name을 신뢰하되, 해당 header는 top-level Worker가 덮어쓴 요청에서만 온다고 가정한다.
- 외부에서 직접 DO endpoint에 접근하는 공개 route를 만들지 않는다.
- 공개 `/api/realtime/signal` route를 만들 경우 반드시 관리자/서버 secret 검증을 둔다. 가능하면 공개 route 없이 server helper가 DO stub을 직접 호출한다.

### 6.4 Server-side signal helper

권장 신규 파일:

- `lib/realtime/server-signal.ts`

역할:

```ts
export async function emitRealtimeSignal(input: {
  channels: string[];
  payload?: unknown;
  source?: string;
}): Promise<void>
```

구현 요구:

- `@opennextjs/cloudflare`의 `getCloudflareContext({ async: true })`로 `env.REALTIME_HUB`를 얻는다.
- local `next dev` 또는 binding 없음이면 조용히 no-op.
- signal 실패가 주요 DB write를 실패시키면 안 된다.
- 가능하면 `context.waitUntil` 또는 동등한 비동기 후처리로 보내되, 현재 프로젝트 패턴에 맞춘다.
- TypeScript global `CloudflareEnv`에 `REALTIME_HUB?: DurableObjectNamespace` 타입을 추가한다.

### 6.5 Client realtime bus

파일:

- `lib/realtime-bus.ts`
- `lib/polling-bus.ts`
- 신규 가능: `lib/realtime-ws-bus.ts`

요구사항:

- 기존 공개 API 유지:
  - `subscribeRealtime(channelKey, tables, callback, options?)`
  - `subscribeRealtimeBatched(channelKey, tables, callback, options?)`
  - `pokeChannel(channelKey)`
- 내부 transport를 WebSocket 우선으로 바꾼다.
- WebSocket 연결 실패 시 fallback은 가능하나, 기존처럼 `notifications`/`messages`를 5초마다 스캔하면 안 된다.
- fallback은 아래 중 하나로 제한한다.
  - 개발 모드에서만 기존 polling 허용
  - 운영 fallback은 30~60초 이상으로 제한
  - 또는 feature flag로 명시적으로 켤 때만 허용
- 기존 BroadcastChannel leader election은 되도록 유지한다.
  - 같은 브라우저의 여러 탭이 모두 WebSocket을 열 필요는 없다.
  - leader 탭만 WebSocket 연결.
  - follower 탭은 BroadcastChannel로 change event 수신.
- `TableFilter`를 canonical channel key로 변환한다.
  - `{ table: 'messages' }` -> `messages`
  - `{ table: 'messages', filter: 'room_id=eq.123' }` -> `messages:room_id=eq.123`
- `pokeChannel(channelKey)`는 다음을 수행해야 한다.
  - 현재 탭 callback 즉시 실행 또는 debounce refresh.
  - leader WebSocket을 통해 DO에 `signal` 전송.
  - 구독 entry가 없으면 no-op.
- 변경 event 수신 시 기존 `processTailData`처럼 callback을 실행하되, D1 tail 값을 비교하지 않는다.

### 6.6 Server mutation 지점에 signal 추가

기존 D1 스캔을 완전히 제거하려면 DB 변경 후 명시적으로 signal을 발행해야 한다.

우선 적용 대상:

1. 채팅 메시지 생성/수정/삭제
   - `lib/chat-message-write.ts`
   - `app/api/chat/quick-reply/route.ts`
   - `app/main/모바일/채팅/data-hooks.ts`
   - `app/main/모바일/채팅/업로드.ts`
   - `app/main/기능부품/메신저전송훅.ts`
   - emit:
     - `messages`
     - `messages:room_id=eq.${roomId}`
     - `chat_rooms`

2. 읽음 cursor
   - `app/api/chat/read-cursors/route.ts`
   - emit:
     - `room_read_cursors`
     - `room_read_cursors:room_id=eq.${roomId}`
     - `chat_rooms`

3. 반응/북마크/고정/투표
   - `app/main/모바일/채팅/반응.ts`
   - `app/main/모바일/채팅/메시지액션.ts`
   - PC 메신저 액션 훅
   - emit:
     - `message_reactions`
     - `message_bookmarks`
     - `pinned_messages`
     - `polls`
     - `poll_votes`
     - 관련 room의 `messages:room_id=eq.${roomId}`

4. 알림
   - `app/api/notifications/*`
   - `lib/notification-*`
   - `lib/chat-push-*`
   - `lib/inapp-notification-jobs*`
   - emit:
     - `notifications`
     - 가능하면 `notifications:user_id=eq.${userId}`

5. 게시판/전자결재/재고 등 기존 `subscribeRealtime` 사용자
   - `rg "subscribeRealtime" app lib -S`로 전체 호출부 확인.
   - 모든 도메인을 한 번에 끝내기 어렵다면 최소한 high-cost 테이블인 `notifications`, `messages`, `room_read_cursors`, `message_reactions`, `chat_rooms`부터 완료한다.

## 7. 모바일 채팅 정상화 작업

실시간 비용 절감과 별개로, 사용자가 처음 보고한 모바일 문제도 같이 처리해야 한다.

### 7.1 답글 원문/예전 글 보기

문제:

- 모바일은 최근 100개만 로드한다.
- `replyTarget`을 현재 로드된 `messages` 배열에서만 찾는다.
- 원문이 100개 이전이면 답글 미리보기와 원문 이동이 동작하지 않는다.

관련 파일:

- `app/main/모바일/채팅/data-hooks.ts`
- `app/main/모바일/채팅/버블리스트.tsx`
- `app/main/모바일/채팅/메시지버블.tsx`
- `app/main/모바일/채팅/채팅방.tsx`

PC 참고:

- `app/main/기능부품/메신저방데이터훅.ts`
- `loadMessagesAroundMessage(messageId)` 로직

요구사항:

- 모바일 hook에 `loadMessagesAroundMessage(messageId)` 또는 `jumpToMessage(messageId)` 추가.
- target message와 앞뒤 context를 D1에서 가져온다.
- 가져온 메시지에 reactions/read count 등 현재 모바일에서 필요한 metadata를 merge한다.
- 상태에 merge 또는 replace 후 해당 메시지로 scroll/highlight.
- 원문이 아직 로드되지 않았을 때도 답글 preview에 `원문 보기` fallback을 보여준다.
- 답글 preview 클릭 시 원문 메시지로 이동한다.

### 7.2 검색 결과 오래된 메시지 이동

문제:

- 검색 결과가 최신 100개 밖에 있으면 화면에 렌더링되지 않아 highlight가 실패한다.

요구사항:

- 검색 결과 선택 시 `jumpToMessage(messageId)`를 호출한다.
- target이 현재 messages에 없으면 주변 context를 먼저 로드한다.
- 모바일/PC 모두 같은 동작이 되도록 한다.

### 7.3 스레드 답글 목록

문제:

- 모바일 스레드 답글 수와 목록이 현재 로드된 100개 기준이다.

요구사항:

- 스레드 sheet를 열 때 `reply_to_id = root.id` 기준으로 DB에서 답글을 직접 조회한다.
- 현재 메모리 messages만 filter하지 않는다.
- 로딩/빈 상태/오류 상태를 모바일 UI에 자연스럽게 표시한다.
- thread reply count도 가능하면 서버 기준 값을 사용한다.

## 8. D1 쿼리/인덱스 보강

Durable Objects 전환이 핵심이지만, 아래도 같이 처리해야 한다.

### 8.1 `ORDER BY REPLACE(...)` 제거

대상:

- `app/api/realtime/stream/route.ts`
- `app/api/realtime/tail/route.ts`
- 기타 D1 최신 timestamp 조회 로직

요구사항:

- realtime 변경 감지에서 `ORDER BY REPLACE(created_at, 'T', ' ')`를 제거한다.
- timestamp 저장 형식은 write 시점에서 정규화한다.
- D1에서는 정렬 가능한 ISO 문자열 또는 SQLite timestamp 문자열 중 하나로 통일한다.

### 8.2 인덱스 추가

마이그레이션 파일 추가:

- `lib/db/migrations/00xx_realtime_cost_indexes.sql`

후보 인덱스:

```sql
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON notifications (created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created
  ON notifications (user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_reactions_created_at
  ON message_reactions (created_at);

CREATE INDEX IF NOT EXISTS idx_room_read_cursors_last_read_at
  ON room_read_cursors (last_read_at);

CREATE INDEX IF NOT EXISTS idx_board_post_reads_created_at
  ON board_post_reads (created_at);
```

주의:

- 실제 스키마와 기존 인덱스를 확인한 뒤 중복/불필요 인덱스는 조정한다.
- 인덱스는 writes rows를 늘리므로, high-read 쿼리에만 추가한다.
- 마이그레이션 적용 전후 `EXPLAIN QUERY PLAN`을 확인한다.

검증 예시:

```powershell
npx.cmd wrangler d1 execute pchos-d1 --remote --json --command "EXPLAIN QUERY PLAN SELECT created_at AS ts FROM notifications ORDER BY created_at DESC LIMIT 1;"
```

## 9. Feature flag 및 롤백

추천 flag:

- `NEXT_PUBLIC_REALTIME_TRANSPORT=ws`
- `REALTIME_TRANSPORT=ws`
- 또는 더 단순히 `NEXT_PUBLIC_REALTIME_WS_ENABLED=true`

요구사항:

- 첫 배포는 WS enabled + polling fallback 제한 형태로 한다.
- 문제가 생기면 flag로 기존 polling으로 되돌릴 수 있게 한다.
- 단, 운영에서 기존 5초 D1 table scan을 장시간 유지하지 않도록 경고 로그를 둔다.

롤백 기준:

- WebSocket 연결 실패율이 높다.
- 메시지 수신 누락이 재현된다.
- 로그인/세션 검증 오류가 증가한다.
- Cloudflare Worker errors가 증가한다.

롤백해도 D1 인덱스 추가는 일반적으로 유지 가능하다.

## 10. 수용 기준

### 기능 기준

- PC 채팅에서 새 메시지가 상대방 화면에 1초 이내 표시된다.
- 모바일 채팅에서 새 메시지가 상대방 화면에 1초 이내 표시된다.
- typing indicator가 2~5초 throttle/debounce로 표시된다.
- 온라인/오프라인 상태가 앱 접속/종료/idle에 맞게 표시된다.
- 모바일에서 답글 preview 클릭 시 오래된 원문 메시지로 이동한다.
- 모바일에서 검색 결과가 오래된 메시지여도 이동/하이라이트된다.
- 모바일 thread sheet가 오래된 답글도 표시한다.
- 기존 push notification, unread count, read cursor가 깨지지 않는다.

### 비용 기준

배포 후 24시간이 지난 다음 Cloudflare GraphQL Analytics 기준:

- D1 rows read/day가 `833,000,000` 이하로 내려가야 한다.
  - 월 250억 rows read 포함량 기준의 일평균 한도다.
- 목표치는 더 낮게 잡는다: `300,000,000 rows/day` 이하.
- `SELECT created_at AS ts FROM notifications ORDER BY created_at DESC LIMIT ?` 같은 realtime tail 쿼리가 top query에 남아 있으면 실패다.
- `messages`/`notifications` timestamp scan이 top 10에서 사라져야 한다.
- Workers requests는 월 1,000만 projection 이하를 유지한다.
- Workers CPU는 월 3,000만 ms projection 이하를 목표로 한다.

### 안정성 기준

- WebSocket 연결이 끊기면 자동 reconnect.
- reconnect 후 현재 구독 channels를 다시 등록.
- hidden/idle 상태에서는 불필요한 연결/heartbeat를 줄인다.
- follower tab은 BroadcastChannel로 leader event를 받는다.
- 네트워크 실패 시 UI가 멈추지 않는다.

## 11. 검증 명령

기본:

```powershell
npm run lint
npm run build
npm run build:cloudflare
```

채팅 관련:

```powershell
npx.cmd playwright test tests/e2e/chat-realtime.desktop.spec.ts --project=chromium
npx.cmd playwright test tests/e2e/chat-detailed-walkthrough.desktop.spec.ts --project=chromium
npx.cmd playwright test tests/e2e/chat-advanced-actions.desktop.spec.ts --project=chromium
npx.cmd playwright test tests/e2e/smoke.mobile.spec.ts --project=mobile-chromium --grep "mobile chat"
```

추가해야 할 테스트:

1. 모바일 답글 원문 이동
   - 150개 이상 메시지 생성
   - 1번 메시지에 대한 답글을 최신 메시지 근처에 생성
   - 모바일에서 답글 preview 클릭
   - 1번 메시지 주변 context 로드 및 highlight 확인

2. 모바일 검색 오래된 메시지 이동
   - 오래된 메시지를 검색
   - 결과 클릭
   - 해당 메시지 주변 로드 및 highlight 확인

3. DO realtime peer delivery
   - 두 browser context로 로그인
   - A가 메시지 전송
   - B가 polling 없이 WebSocket change로 refresh되는지 확인

4. typing throttle
   - 연속 입력 시 WebSocket message가 과도하게 나가지 않는지 확인

5. fallback
   - WebSocket 강제 close
   - reconnect 또는 제한된 fallback 동작 확인

Cloudflare 사용량 검증:

```powershell
# Workers/D1 GraphQL Analytics API로 최근 24h, 7d, 30d를 비교한다.
# 토큰은 .env.local에서 읽되 출력하지 않는다.
```

확인할 지표:

- `workersInvocationsAdaptive.sum.requests`
- `workersInvocationsAdaptive.sum.cpuTimeUs`
- `d1QueriesAdaptiveGroups.sum.rowsRead`
- `d1QueriesAdaptiveGroups.sum.rowsWritten`
- `d1QueriesAdaptiveGroups.dimensions.query` top rowsRead
- `d1StorageAdaptiveGroups.max.databaseSizeBytes`

## 12. 구현 순서

### Phase 0: baseline 보존

1. `git status --short` 확인.
2. 기존 사용자 변경사항이 있는 파일을 기록.
3. 현재 `wrangler.toml`, `cloudflare-worker.ts`, `lib/polling-bus.ts`, `app/api/realtime/*`를 읽고 변경 계획 확정.
4. 현재 테스트 중 실패하는 항목이 있으면 작업 전 baseline으로 기록.

### Phase 1: 비용 즉시 완화

1. realtime timestamp scan에서 `REPLACE(created_at...)` 제거.
2. high-cost 테이블 인덱스 migration 추가.
3. `/api/realtime/stream`의 filtered subscription 버그를 고친다.
   - 현재 SSE는 table 이름만 보고, `messages:room_id=eq.X` 같은 filter key를 제대로 전달하지 않는다.
   - WS 전환 전이라도 이 버그는 수정 대상이다.
4. 운영 fallback interval을 제한한다.

### Phase 2: Durable Objects WebSocket 신호 버스

1. `RealtimeHub` DO class 작성.
2. `wrangler.toml` binding/migration 추가.
3. `cloudflare-worker.ts`에 `/api/realtime/ws` route 추가.
4. `lib/realtime/server-signal.ts` 추가.
5. `lib/realtime-ws-bus.ts` 또는 `lib/polling-bus.ts` 내부 transport 교체.
6. 기존 API `subscribeRealtime`, `subscribeRealtimeBatched`, `pokeChannel` 호환 유지.
7. chat/notification mutation 후 `emitRealtimeSignal` 추가.

### Phase 3: 모바일 채팅 parity

1. 모바일 `jumpToMessage` / `loadMessagesAroundMessage` 구현.
2. 답글 preview fallback 및 원문 이동 구현.
3. 검색 결과 오래된 메시지 이동 구현.
4. 스레드 sheet DB 기반 replies fetch 구현.
5. 모바일 e2e 추가.

### Phase 4: 측정 및 정리

1. D1 top query에서 realtime timestamp scan 제거 확인.
2. Worker CPU 감소 확인.
3. docs에 결과 기록.
4. 남은 fallback polling이 필요한 도메인 목록을 작성.

## 13. 주의할 기존 변경사항

현재 작업 시작 전 git 상태에서 아래 파일들이 이미 수정되어 있었다.

- `app/main/기능부품/메신저스레드패널.tsx`
- `app/main/기능부품/메신저첨부미리보기.tsx`
- `app/main/기능부품/메신저컴포저.tsx`
- `app/main/기능부품/메신저타임라인.tsx`

이 변경은 사용자의 기존 작업일 수 있으므로 되돌리지 않는다. 같은 파일을 수정해야 하면 diff를 먼저 읽고 의도를 보존한다.

## 14. Gemini 최종 응답 형식

작업 완료 후 사용자에게 다음을 보고한다.

1. 무엇을 바꿨는지
2. 어떤 파일을 수정했는지
3. 모바일 답글/검색/스레드 문제가 어떻게 해결됐는지
4. D1 rows read를 줄이기 위해 어떤 스캔을 제거했는지
5. 테스트 결과
6. 아직 남은 위험
7. 배포 후 Cloudflare에서 확인해야 할 지표

최종 보고에는 반드시 아래를 포함한다.

```text
최근 24시간 D1 rows read가 얼마인지
Top D1 query에서 messages/notifications timestamp scan이 사라졌는지
Workers requests와 CPU projection이 $5 포함량 안인지
```

## 15. Gemini에게 줄 짧은 실행 프롬프트

아래 문장을 Gemini에게 그대로 붙여넣어도 된다.

```text
이 저장소 D:\newmso에서 Cloudflare D1 realtime 스캔 비용을 줄이고 모바일 채팅 문제를 고쳐줘.

반드시 docs/gemini-chat-realtime-do-work-order-2026-07-06.md를 먼저 끝까지 읽고 그대로 수행해.

핵심 목표는:
1. /api/realtime/stream, /api/realtime/tail, lib/polling-bus.ts 기반의 D1 timestamp 반복 스캔을 제거하거나 운영에서 쓰지 않게 만드는 것.
2. Cloudflare Durable Objects + WebSocket Hibernation으로 실시간 신호 버스를 구현하는 것.
3. messages/notifications/room_read_cursors/message_reactions/chat_rooms 변경은 D1 저장 후 명시적으로 realtime signal을 보내는 구조로 바꾸는 것.
4. 기존 subscribeRealtime/subscribeRealtimeBatched/pokeChannel API는 깨지지 않게 유지하는 것.
5. 모바일 채팅에서 답글 원문 보기, 오래된 검색 결과 이동, 스레드 답글 목록을 PC처럼 정상화하는 것.
6. Supabase는 다시 도입하지 말고, 메시지 저장은 D1, 첨부는 R2를 유지하는 것.

작업 전 git status를 확인하고 사용자 변경사항은 되돌리지 마.
구현 후 npm run lint, npm run build:cloudflare, 채팅 관련 Playwright 테스트를 실행해.
Cloudflare GraphQL Analytics로 D1 rows read와 top query도 다시 확인해서, $5 플랜 안으로 들어갈 가능성을 숫자로 보고해.
```

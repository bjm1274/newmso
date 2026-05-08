# Supabase Edge Logs 호출 과다/오류 분석 보고서

- 분석 파일: `C:\Users\baek_\Downloads\supabase-edge-logs-rtleqrtcqucntnygzudv.csv (9).csv`
- 분석 시각: 2026-05-08
- 로그 범위: 2026-05-08 19:11:56.156 KST ~ 2026-05-08 19:16:11.981 KST
- 총 기간: 255.825초, 약 4분 15.8초
- 총 요청: 2,000건
- 평균 요청률: 분당 469.1건
- 최대 순간 부하: 2026-05-08 19:13:00 KST 1초에 82건, 10초 구간 최대 190건

## 결론

Claude가 짚은 큰 방향은 맞습니다. 실제로 4분 남짓한 짧은 구간에 2,000건이 찍혔고, 그중 절반 이상이 채팅 안 읽음 수 계산용 `HEAD /rest/v1/messages`입니다. 또한 `message_reactions`, `message_bookmarks`에서 메시지 ID 790개 이상을 URL `IN` 절에 밀어 넣어 400 오류가 발생했습니다.

다만 일부 숫자는 정정이 필요합니다.

- `HEAD /rest/v1/messages`는 1,088건으로 맞습니다.
- 방마다 0.23초 간격이 아니라, 전체 합산 기준으로 0.235초마다 1건입니다. 방별 평균 간격은 약 10.55초입니다.
- `HEAD /rest/v1/messages`에 등장한 room id는 45개입니다.
- `00000000-0000-0000-0000-000000000000` 관련 요청은 최소 142건입니다. 이 값은 코드상 `NOTICE_ROOM_ID`로 쓰는 sentinel이므로 무조건 NULL 버그라고 단정하기보다는, 공지방 pseudo id가 일반 채팅방 쿼리 경로로 섞여 비용을 만들고 있는 문제로 보는 것이 안전합니다.

## 요청 분포

| 구분 | 건수 | 비율 |
|---|---:|---:|
| HEAD | 1,141 | 57.05% |
| GET | 661 | 33.05% |
| OPTIONS | 171 | 8.55% |
| PATCH | 26 | 1.30% |
| POST | 1 | 0.05% |

| 상태 코드 | 건수 | 의미 |
|---|---:|---|
| 200 | 1,966 | 성공 |
| 204 | 26 | PATCH 성공 |
| 400 | 8 | 클라이언트 쿼리 오류 |

## 상위 엔드포인트

| 메서드 | 경로 | 건수 | 비율 | 상태 |
|---|---|---:|---:|---|
| HEAD | `/rest/v1/messages` | 1,088 | 54.40% | 200 |
| GET | `/rest/v1/messages` | 193 | 9.65% | 200 |
| GET | `/rest/v1/room_read_cursors` | 113 | 5.65% | 200 |
| GET | `/rest/v1/chat_rooms` | 61 | 3.05% | 200 |
| GET | `/rest/v1/message_reactions` | 58 | 2.90% | 54건 200, 4건 400 |
| GET | `/rest/v1/pinned_messages` | 57 | 2.85% | 200 |
| GET | `/rest/v1/polls` | 56 | 2.80% | 200 |
| GET | `/rest/v1/message_bookmarks` | 55 | 2.75% | 51건 200, 4건 400 |
| OPTIONS | `/rest/v1/message_reactions` | 55 | 2.75% | 200 |
| OPTIONS | `/rest/v1/message_bookmarks` | 55 | 2.75% | 200 |
| GET | `/rest/v1/notifications` | 54 | 2.70% | 200 |
| HEAD | `/rest/v1/notifications` | 52 | 2.60% | 200 |

## P0. 메시지 안 읽음 수 계산이 REST HEAD를 폭발시킴

문제 패턴:

```text
HEAD /rest/v1/messages
?select=id
&room_id=eq.{roomId}
&sender_id=neq.{userId}
&is_deleted=eq.false
&created_at=gt.{lastReadAt}
```

측정값:

- 총 1,088건, 전체의 54.4%
- 분당 255.2건
- 전체 합산 기준 평균 0.235초마다 1건
- room id 45개에 대해 반복
- 방별 반복 간격 평균 10.547초
- `00000000-0000-0000-0000-000000000000`도 48건 포함

코드상 강한 후보:

- `app/main/기능부품/메신저방데이터훅.ts`
- `updateUnreadForRooms`
- 방 목록을 순회하면서 방마다 아래 쿼리를 실행합니다.

```ts
supabase
  .from('messages')
  .select('id', { count: 'exact', head: true })
  .eq('room_id', roomId)
  .neq('sender_id', effectiveChatUserId)
  .eq('is_deleted', false)
```

이미 `app/main/기능부품/메신저읽음상태훅.ts`에는 `fetchUnreadCountsForRoomIds`를 사용하는 배치형 구현이 존재합니다. 그런데 실제 `app/main/기능부품/메신저.tsx`는 `메신저방데이터훅.ts`의 `useChatRoomDataSync`를 import하고 있어, 로그에 찍힌 per-room HEAD 폭발과 잘 맞습니다.

권장 수정:

1. `메신저방데이터훅.ts`의 per-room `head:true,count:'exact'` 루프를 제거합니다.
2. 이미 존재하는 `fetchUnreadCountsForRoomIds` 배치 함수로 합치거나, unread count용 RPC를 만듭니다.
3. `last_message_at <= last_read_at`이면 DB 조회 없이 0으로 처리합니다.
4. `NOTICE_ROOM_ID`를 일반 방 목록의 unread count 루프에 넣을지 명확히 분리합니다. 공지방을 실제 `messages.room_id = ZERO_UUID`로 운영한다면 유지할 수 있지만, `chat_rooms` 조회/패치까지 흘러가면 낭비입니다.

최소 효과:

- 이것 하나만 제거해도 전체 REST 요청의 54.4%가 줄어듭니다.
- 평균 요청률은 분당 469건에서 약 214건 수준까지 내려갈 수 있습니다.

## P0. `message_reactions`/`message_bookmarks` 긴 IN 절로 400 오류 발생

오류 요약:

| 경로 | 400 건수 | URL 길이 | UUID 개수 |
|---|---:|---:|---:|
| `/rest/v1/message_reactions` | 4 | 30,942자 | 792개 |
| `/rest/v1/message_bookmarks` | 4 | 30,972자 | 793개 |

발생 시각:

- 2026-05-08 19:13:01 KST
- 2026-05-08 19:13:08 KST
- 2026-05-08 19:13:22 KST
- 2026-05-08 19:13:38 KST

문제 패턴:

```text
GET /rest/v1/message_reactions?select=message_id,emoji,user_id&message_id=in.(UUID 792개...)
GET /rest/v1/message_bookmarks?select=message_id&user_id=eq.{userId}&message_id=in.(UUID 793개...)
```

추가로, 400이 난 요청만 문제가 아닙니다. 긴 쿼리는 총 207건입니다.

| 경로 | 200 | 400 | 합계 |
|---|---:|---:|---:|
| `/rest/v1/message_reactions` | 101 | 4 | 105 |
| `/rest/v1/message_bookmarks` | 98 | 4 | 102 |

UUID 개수 분포:

| 경로 | UUID 개수 | 건수 |
|---|---:|---:|
| `message_reactions` | 48 | 4 |
| `message_reactions` | 50 | 5 |
| `message_reactions` | 56 | 22 |
| `message_reactions` | 462 | 23 |
| `message_reactions` | 792 | 4, 전부 400 |
| `message_bookmarks` | 49 | 4 |
| `message_bookmarks` | 51 | 4 |
| `message_bookmarks` | 57 | 20 |
| `message_bookmarks` | 463 | 23 |
| `message_bookmarks` | 793 | 4, 전부 400 |

코드상 강한 후보:

- `app/main/기능부품/메신저방데이터훅.ts`
- `app/main/기능부품/메신저메시지조회훅.ts`
- `syncVisibleMessageMetadata`, `fetchData` 계열에서 `messageIds` 전체를 그대로 `.in('message_id', messageIds)`에 넣습니다.

권장 수정:

1. `messageIds`는 현재 화면에 보이는 메시지 또는 현재 페이지 범위로 제한합니다.
2. URL 기반 `IN`은 최대 100개 이하로 chunking합니다.
3. 더 좋은 해법은 RPC 또는 view입니다. 예: `get_message_metadata(message_ids uuid[], user_id uuid)`처럼 서버 함수에서 reactions/bookmarks/read state를 한 번에 묶어 반환합니다.
4. 같은 `messageIds`에 대한 metadata 요청은 TTL 캐시만으로 막지 말고 in-flight dedupe도 적용합니다.
5. `message_reactions`, `message_bookmarks`, `room_read_cursors` 변경 이벤트가 전체 `fetchData()`를 다시 부르는 구조를 줄이고, 변경 row만 상태에 반영합니다.

## P1. 공지방/0 UUID sentinel이 일반 방 쿼리에 섞임

관련 값:

```text
00000000-0000-0000-0000-000000000000
```

코드상 의미:

- `lib/constants.ts`에서 `ZERO_UUID`
- `NOTICE_ROOM_ID = ZERO_UUID`

로그 집계:

| 메서드 | 경로 | 건수 |
|---|---|---:|
| GET | `/rest/v1/room_read_cursors` | 58 |
| HEAD | `/rest/v1/messages` | 48 |
| OPTIONS | `/rest/v1/room_read_cursors` | 23 |
| GET | `/rest/v1/messages` | 10 |
| PATCH | `/rest/v1/chat_rooms` | 1 |
| GET | `/rest/v1/chat_rooms` | 1 |
| OPTIONS | `/rest/v1/messages` | 1 |
| 합계 |  | 142 |

주의:

이 값은 코드에서 공지방 sentinel로 쓰이므로, 단순히 “NULL UUID 버그”라고만 보면 안 됩니다. 다만 로그상 문제는 sentinel이 `messages`, `room_read_cursors`, 심지어 `chat_rooms` PATCH/GET까지 일반 방처럼 흘러간다는 점입니다.

특히 아래는 무의미할 가능성이 큽니다.

```text
PATCH /rest/v1/chat_rooms?id=eq.00000000-0000-0000-0000-000000000000
GET   /rest/v1/chat_rooms?select=id&id=eq.00000000-0000-0000-0000-000000000000
```

권장 수정:

1. 공지방을 실제 DB row로 둘 것인지, 클라이언트 pseudo room으로 둘 것인지 결정합니다.
2. pseudo room이면 `chat_rooms` 조회/패치 대상에서 `NOTICE_ROOM_ID`를 제외합니다.
3. unread count, read cursor, room metadata 동기화에서 공지방 전용 경로를 분리합니다.
4. DB에 실제 공지 메시지를 `room_id = ZERO_UUID`로 저장하는 설계라면, 그 사실을 코드에 명시하고 `chat_rooms`만 제외합니다.

## P1. 같은 `messages` 요약 쿼리가 96회 반복됨

문제 패턴:

```text
GET /rest/v1/messages
?select=room_id,sender_id,created_at
&room_id=in.(32cda05e-...,ad7efef9-...)
&sender_id=not.is.null
&order=created_at.desc
```

측정값:

- 정확히 같은 URL이 96회 반복
- 평균 2.636초마다 반복

코드상 후보:

- `app/main/기능부품/메신저.tsx`
- `repairDirectRooms`
- direct room의 members가 비어 있을 때 메시지 sender를 역추론하기 위해 반복 조회합니다.

권장 수정:

1. 동일 orphan room set에 대한 in-flight dedupe를 둡니다.
2. 한 번 repair한 결과를 `chat_rooms.members`에 저장하거나 local cache에 저장합니다.
3. `repairDirectRooms`가 렌더/구독 refresh 때마다 재실행되지 않도록 TTL을 둡니다.
4. direct room 생성 시 members가 비어 있는 상태가 생기지 않도록 생성 경로를 먼저 고칩니다.

## P1. `chat_rooms` 전체 조회가 50회 반복됨

문제 패턴:

```text
GET /rest/v1/chat_rooms
?select=id,name,type,members,created_at,created_by,last_message,last_message_at,last_message_preview
```

측정값:

- 정확히 같은 URL이 50회 반복
- 현재 `chatQueryService.ts`의 TTL은 5초지만, 로그에서는 force refresh 또는 여러 호출 경로 때문에 더 자주 호출됩니다.

코드상 후보:

- `app/main/기능부품/chatQueryService.ts`
- `app/main/기능부품/useChatRealtimeBridge.ts`
- `app/main/기능부품/메신저방데이터훅.ts`
- `app/main/기능부품/메신저메시지조회훅.ts`

권장 수정:

1. `fetchAllChatRooms({ force: true })` 호출 경로를 줄입니다.
2. `chat_rooms` realtime 이벤트가 실제 room 목록에 영향을 줄 때만 invalidate합니다.
3. 전체 목록 재조회 대신 변경된 room만 `updateRoomInList`로 반영합니다.
4. TTL 5초는 짧습니다. 유저 인터랙션 중에는 30초 이상 또는 이벤트 기반 invalidate가 적절합니다.

## P1. `pinned_messages`와 `polls`가 방 refresh마다 반복 조회됨

측정값:

| 경로 | 건수 |
|---|---:|
| GET `/rest/v1/pinned_messages` | 57 |
| GET `/rest/v1/polls` | 56 |

대표 반복:

- room `114c5079-497d-41eb-a745-c3ea8fdd0eaf`: pinned 25회, polls 24회
- room `8ebdfec2-b68b-42dc-95ea-06b0781122dd`: pinned 20회, polls 20회

코드상 후보:

- `app/main/기능부품/메신저방데이터훅.ts`
- `app/main/기능부품/메신저구독훅.ts`

`메신저구독훅.ts`는 아래 변경 이벤트에서 `triggerDebouncedFetch`를 호출합니다.

- `messages` UPDATE/DELETE
- `chat_rooms`
- `room_read_cursors`
- `message_reactions`
- `message_bookmarks`
- `pinned_messages`
- `polls`
- `poll_votes`

이 구조에서는 작은 metadata 변경도 전체 방 데이터 fetch를 유발하고, 그때 pinned/polls가 같이 딸려옵니다.

권장 수정:

1. `pinned_messages` 변경은 pinned state만 갱신합니다.
2. `polls`/`poll_votes` 변경은 polls state만 갱신합니다.
3. `room_read_cursors` 변경은 read cursor state만 갱신합니다.
4. 전체 `fetchData({ force:true })`는 메시지 본문/방 전환/초기 로드에만 제한합니다.

## P1. 알림 카운트 HEAD 폴링도 별도 부하

문제 패턴:

```text
HEAD /rest/v1/notifications
?select=*&user_id=eq.{userId}&read_at=is.null
```

측정값:

- HEAD 52건
- GET 54건
- OPTIONS 28건
- 알림 관련 합계 134건

코드상 후보:

- `app/main/기능부품/알림시스템.tsx`
- `syncBadge`에서 `notifications.select('*', { count:'exact', head:true })` 사용

권장 수정:

1. 이미 realtime 알림 구독이 있다면 HEAD count polling은 줄입니다.
2. `read_at is null` 카운트는 insert/update 이벤트에서 local count를 증감합니다.
3. 서버 신뢰가 필요하면 30~60초에 한 번만 보정 조회합니다.

## P2. OPTIONS preflight가 많음

측정값:

- OPTIONS 총 171건
- `message_reactions` 55건
- `message_bookmarks` 55건
- `notifications` 28건
- `room_read_cursors` 24건

Supabase REST를 브라우저에서 cross-origin 호출하면 일부 preflight는 정상입니다. 하지만 지금은 같은 긴/반복 GET이 너무 많아 OPTIONS도 같이 늘어났습니다. 원 GET을 줄이면 OPTIONS도 줄어듭니다.

## P2. staff_members PATCH heartbeat

측정값:

- `PATCH /rest/v1/staff_members`: 25건
- 주요 user id 1명 17건, 다른 2명 각 4건

이건 온라인 상태/마지막 접속 시각 heartbeat일 가능성이 큽니다. 4분 15초에 25건이라 P0/P1은 아니지만, 다중 탭에서 중복 실행될 수 있으니 점검 대상입니다.

권장 수정:

1. 탭별 중복 heartbeat를 막습니다.
2. visibility hidden 상태에서는 주기를 늘립니다.
3. 10초 단위보다 30~60초 단위 heartbeat가 충분한지 검토합니다.

## 우선순위별 수정안

### 1순위: unread count HEAD 제거

- 대상: `메신저방데이터훅.ts`
- 조치: 방마다 `head:true,count:'exact'`를 날리는 루프 제거
- 기대 효과: 요청량 최소 54.4% 감소

### 2순위: message metadata 조회 제한

- 대상: `메신저방데이터훅.ts`, `메신저메시지조회훅.ts`
- 조치: `messageIds` 전체를 `IN`에 넣지 말고 visible/page 단위로 제한
- 조치: 100개 이하 chunk 또는 RPC 사용
- 기대 효과: 400 오류 제거, URL 30KB 쿼리 제거, OPTIONS 동반 감소

### 3순위: full fetchData 트리거 분리

- 대상: `메신저구독훅.ts`
- 조치: reactions/bookmarks/read cursors/pinned/polls 변경에서 전체 fetch 대신 해당 state만 갱신
- 기대 효과: pinned/polls/reactions/bookmarks 연쇄 호출 감소

### 4순위: 공지방 sentinel 분리

- 대상: `NOTICE_ROOM_ID` 사용 경로
- 조치: pseudo room이면 `chat_rooms` 조회/패치에서 제외
- 조치: 실제 room이면 DB row와 정책을 명확히 둠
- 기대 효과: 0 UUID 관련 불필요 쿼리 감소, 로직 혼선 감소

### 5순위: chat_rooms/repairDirectRooms dedupe

- 대상: `chatQueryService.ts`, `메신저.tsx`
- 조치: force refresh 줄이기, repairDirectRooms TTL/in-flight dedupe 추가
- 기대 효과: 동일 chat_rooms/messages 요약 쿼리 반복 감소

## Claude 보고와의 대조

맞는 부분:

- 총 2,000건, 약 4.3분, 분당 약 469건은 맞습니다.
- 400 오류 8건은 맞습니다.
- `message_reactions`, `message_bookmarks`의 긴 `IN` 절이 400을 만든다는 결론은 맞습니다.
- `HEAD /rest/v1/messages` 1,088건이 가장 큰 문제라는 결론은 맞습니다.
- 0 UUID가 일반 쿼리 흐름에 섞여 있다는 지적도 맞습니다.

정정할 부분:

- 방마다 0.23초 간격이 아닙니다. 전체 합산 간격이 0.235초이고, 방별 평균은 10.55초입니다.
- `HEAD /rest/v1/messages`의 unique room은 45개로 집계됩니다.
- 0 UUID 관련 요청은 109건보다 많습니다. GET/HEAD/OPTIONS/PATCH를 모두 포함하면 142건입니다.
- `00000000-0000-0000-0000-000000000000`은 코드상 `NOTICE_ROOM_ID`라서 완전한 NULL 버그라고 단정하기보다는 sentinel leakage/설계 혼합 문제로 보는 편이 정확합니다.

## 한 줄 요약

현재 로그의 핵심 병목은 채팅입니다. `unread count` 계산이 방마다 `HEAD count exact`를 반복하고, 메시지 metadata 조회가 수백 개 message id를 URL에 넣어 호출하면서 REST 요청량과 400 오류를 동시에 만들고 있습니다. 먼저 per-room HEAD를 배치/RPC로 바꾸고, metadata 조회 범위를 화면 단위로 제한하면 가장 큰 불이 꺼집니다.

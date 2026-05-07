# Supabase 중복/과다 호출 전수조사

> 분석 기준: `supabase-edge-logs-rtleqrtcqucntnygzudv.csv (5).csv` (약 10분간 로그)

---

## 로그 통계 요약

| 엔드포인트 | 총 호출 | 1초내 중복 | 중복률 |
|---|---|---|---|
| `messages` | 492 | 365 | **74%** 🔴 |
| `room_read_cursors` | 280 | 126 | **45%** 🔴 |
| `polls` | 154 | 25 | 16% 🟡 |
| `message_reactions` | 152 | 23 | 15% 🟡 |
| `message_bookmarks` | 152 | 23 | 15% 🟡 |
| `pinned_messages` | 151 | 21 | 14% 🟡 |
| `notifications` | 29 | 7 | 24% 🟡 |
| `chat_rooms` | 28 | 6 | 21% 🟡 |

- 전체 기간: 약 590초 (9.8분)
- `messages` 평균 호출 간격: 1.2초/회

---

## 원인 1 — `CHAT_METADATA_REFRESH_TTL_MS = 10초` (핵심)

**파일**: `app/main/기능부품/메신저메시지조회훅.ts:48`

`syncVisibleMessageMetadata`가 호출될 때 **`room_read_cursors` + `message_bookmarks` + `message_reactions`** 3개 쿼리를 동시에 실행하는데, 캐시 TTL이 10초입니다.  
`CHAT_ROOM_FETCH_MIN_INTERVAL_MS = 12초` 쿨다운보다 TTL이 짧아서, `fetchData`가 실행될 때마다 **항상** 메타데이터 3개를 다시 조회합니다.

```
fetchData() ← 12초 쿨다운
  └─ syncVisibleMessageMetadata() ← 10초 TTL (쿨다운보다 짧아 항상 만료)
       ├─ room_read_cursors  ×1
       ├─ message_bookmarks  ×1  ─── 매 fetchData마다 무조건 실행
       └─ message_reactions  ×1
```

**영향**: `messages` 492회 중 대다수, `room_read_cursors`/`reactions`/`bookmarks` 전량

---

## 원인 2 — `room_read_cursors` 변경 → full `fetchData()` 트리거

**파일**: `app/main/기능부품/메신저구독훅.ts:355-368`

누군가 메시지를 읽으면 `room_read_cursors` INSERT/UPDATE 이벤트 발생  
→ `triggerDebouncedFetch()` → `fetchData()` → **messages + 메타데이터 전부 재조회**

채팅방에 3명이 있으면 한 사람이 읽을 때마다 이 chain이 발생합니다.

```ts
.on('postgres_changes', { event: '*', table: 'room_read_cursors', filter: `room_id=eq.${selectedRoomId}` }, () => {
  // 타인의 커서 변경 → full fetchData 트리거
  triggerDebouncedFetch();  // ← messages까지 전부 재조회
})
```

**영향**: `room_read_cursors` 280회 중 상당수, 연쇄적으로 `messages` 재조회

---

## 원인 3 — 모든 mutation이 full `fetchData()` 트리거

**파일**: `app/main/기능부품/메신저구독훅.ts:353-380`

Realtime 이벤트 수신 시 모두 `fetchData()` (full re-fetch)를 호출합니다.  
reactions/bookmarks 하나 바뀌어도 **messages까지 전부 다시 가져옵니다**.

```
messages UPDATE/DELETE  → triggerDebouncedFetch (ROOM_MUTATION_REFRESH_MIN_GAP = 3초)
room_read_cursors 변경  → triggerDebouncedFetch (ROOM_REALTIME_REFRESH_MIN_GAP = 12초)
message_reactions 변경  → triggerDebouncedFetch (12초)
message_bookmarks 변경  → triggerDebouncedFetch (12초)
pinned_messages 변경    → triggerDebouncedFetch (3초)
polls 변경              → triggerDebouncedFetch (3초)
poll_votes 변경         → triggerDebouncedFetch (12초)
```

**영향**: 모든 mutation이 불필요하게 messages 재조회를 유발

---

## 원인 4 — `room_read_cursors` 이중 쿼리

같은 방에 대해 두 가지 포맷으로 각각 호출됩니다.

| 쿼리 | 목적 | 위치 |
|---|---|---|
| `select=room_id,last_read_at` | 사이드바 미읽음 카운트 | `메신저사이드바.tsx` |
| `select=user_id,last_read_at` | 타임라인 읽음 표시 | `메신저메시지조회훅.ts` |

방 전환할 때마다 두 쿼리가 모두 발생합니다.

**영향**: `room_read_cursors` 280회 중 절반가량이 이중 호출

---

## 원인 5 — Direct Room Repair 중복 호출

**파일**: `app/main/기능부품/메신저.tsx` (`repairDirectRooms`)

로그 상 완전히 동일한 쿼리가 90ms 간격으로 2회 연속 호출됩니다.

```
GET messages?select=room_id,sender_id,created_at&room_id=in.(32cda05e...,ad7efef9...)
GET messages?select=room_id,sender_id,created_at&room_id=in.(32cda05e...,ad7efef9...)  ← 90ms 후 재호출
```

React StrictMode double-invoke 또는 의존성 배열 변경으로 `repairDirectRooms`가 중복 실행됩니다.

---

## 개선 방안

| 우선순위 | 파일 | 수정 내용 | 예상 절감 |
|---|---|---|---|
| 🔴 P1 | `메신저메시지조회훅.ts:48` | `CHAT_METADATA_REFRESH_TTL_MS` 10초 → 60초 | messages/reactions/bookmarks/cursors ~80% 감소 |
| 🔴 P1 | `메신저구독훅.ts:355-368` | `room_read_cursors` 변경 시 full fetchData 대신 cursors 상태만 incremental 업데이트 | room_read_cursors ~50% 감소 |
| 🟡 P2 | `메신저구독훅.ts:370-375` | reactions/bookmarks 변경 시 해당 데이터만 incremental 업데이트 (full re-fetch 금지) | reactions/bookmarks ~60% 감소 |
| 🟡 P2 | `메신저메시지조회훅.ts:47` | `CHAT_ROOM_FETCH_MIN_INTERVAL_MS` 12초 → 30초 (또는 TTL > 쿨다운으로 맞추기) | 전반 ~30% 추가 감소 |
| 🟢 P3 | `메신저.tsx` (`repairDirectRooms`) | ref guard로 중복 실행 방지 | messages 중복 ~10건 제거 |

---

## 관련 상수 (현재값 → 권장값)

| 상수 | 파일 | 현재 | 권장 |
|---|---|---|---|
| `CHAT_METADATA_REFRESH_TTL_MS` | `메신저메시지조회훅.ts:48` | 10,000ms | 60,000ms |
| `CHAT_ROOM_FETCH_MIN_INTERVAL_MS` | `메신저메시지조회훅.ts:47` | 12,000ms | 30,000ms |
| `ROOM_REALTIME_REFRESH_MIN_GAP_MS` | `메신저구독훅.ts:16` | 12,000ms | 유지 |
| `ROOM_MUTATION_REFRESH_MIN_GAP_MS` | `메신저구독훅.ts:17` | 3,000ms | 유지 |

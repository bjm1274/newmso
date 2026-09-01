# 11차 · 03 채팅

> 조사일: 2026-08-31 · 1차 조사(미검증).

## 1. 기능 지도

PC `메신저.tsx` + 훅 다수. 모바일 `모바일/채팅/` 20파일. 서버: `chat-rooms`, `chat/*`, `realtime/tail|stream|ws`, 푸시 큐.

## 2. 10차 재검증

**「모바일에서 위로 올린 과거 대화가 5초 뒤 통째로 사라진다」는 현재 코드에서 재현되지 않는다.** 폴링 2초, `mergeLatestMessagePage`가 최신 창 이전을 유지. 잔여: 빈 페이지/에러 시 `setMessages([])`, 점프 후 창 merge는 PC id합집합보다 약함.

## 3. 조사 발견 (미검증)

### P0 후보
- **CH-01** 첨부 `publicBaseUrl`이면 `file_url`이 앱 밖 GET 가능. 키에 room id 없음. storage ACL은 exact url 0건이면 **403 스킵**. R2 binding 경로는 `Cache-Control: public, max-age=86400`.
- **CH-02** Oracle `server.mjs` WS: 클라 `signal`을 구독 교차/레이트리밋 없이 브로드캐스트. messages 외 채널은 멤버십 검사 없음.
- **CH-03** POST `/api/chat-rooms` 고정 id UPSERT가 mutate 가드를 우회해 `members` 통째 교체 (TOCTOU).

### P1 후보
- **CH-04** 열린 방 unread를 클라가 0으로 고정 + 이전 0 유지. 커서 POST 실패해도 배지 안 살아남.
- **CH-05** `room_read_cursors.select = AUTHENTICATED` — 전 방 커서 dump.
- **CH-06** `pinned_messages` / `polls.insert` AUTHENTICATED. 익명 투표는 PC가 aggregate API를 안 타고 admin은 `user_id` 조회.
- **CH-07** realtime/tail·stream은 멤버십 없이 존재/최신시각 오라클.
- **CH-08** 채팅 업로드: D1 없으면 멤버십 fail-open.
- **CH-09** 푸시 큐: 전원 실패 시 `next_attempt_at` 미갱신 → 1분 크론 핫루프.
- **CH-10** 운영센터 UI가 SY INC 전 직원·`board_공지_write`까지. 서버 롤 체크 없음.
- **CH-11** 모바일 그룹 강퇴: 생성자 검사·확인 없음 (PC는 created_by).
- **CH-12** 방 목록 캐시 user-id 없음 — 계정 전환 시 미리보기 잔존.
- **CH-13** CF DO `canAccessRoom`은 DB 없으면 true (Oracle `server.mjs`는 fail-closed).

### P2
타임스탬프 공백 vs T 비교, 중복 DM 키 병합, 연결 표시가 WS 전에 connected, 모바일 투표 room_id 구독 실패(30초), 삭제 첨부 그리드 잔존, 방 안 검색 없음, 점프 후 폴링 깜빡임, 알림 억제 키 미기록, CF DO 분기가 emit 경로에 잔존.

## 4. 연계
푸시 큐 → 알림 메뉴. 첨부 ACL → storage. 공지 운영센터 → 관리자/게시판. WS hub → Oracle 이전.

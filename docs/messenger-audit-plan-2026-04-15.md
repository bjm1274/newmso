# 메신저 감사 계획

작성일: 2026-04-15

## 2026-04-15 진행 현황

- 완료: unread 계산 공용화
  - `app/main/기능부품/메신저데이터유틸.ts`의 `fetchChatUnreadCountsByRoom`으로 메신저 방 목록과 조직도 측면창 unread 계산을 통합했다.
- 완료: 선택 방 fallback 공용화
  - `selectFallbackChatRoomId`를 도입해 메신저 방 로딩 훅과 사이드바 훅의 fallback 기준을 하나로 맞췄다.
- 완료: 메시지 select fallback 공용화
  - `selectChatMessagesWithFallback`를 도입해 메인 메신저, 방 데이터 훅, 검색 훅이 같은 missing-column fallback 경로를 사용하도록 정리했다.
- 완료: 테스트 이벤트 분리
  - `메신저테스트이벤트.ts`로 mock notification/message 이벤트 바인딩을 분리해 테스트 전용 연결 코드를 한곳으로 모았다.
- 완료: 메시지 쓰기 wrapper 정리
  - UI 쪽 wrapper 이름을 `insertChatMessage`로 정리해 역할을 명확히 했고, 기존 fallback 구현은 `lib/chat-message-write.ts`에 유지했다.
- 완료: dead code 제거
  - 숨겨진 레거시 버튼 `chat-open-group-modal-legacy`를 제거했다.
  - 사용처가 없는 `app/main/기능부품/메신저스와이프.ts`를 삭제했다.
  - 연결되지 않은 관리자 보조 화면 `app/main/기능부품/관리자전용서브/채팅모니터링.tsx`를 삭제했다.
- 유지: 수동 route / cron route 쌍
  - `chat-push-flush`, `chat-push-dispatch`, `repush-unread`, `unread-notification-repush`는 운영 수동 실행과 스케줄 실행 경로가 분리된 구조로 확인되어 중복 코드 후보에서 제외했다.

## 목표

이 문서는 현재 메신저 점검을 실제 실행 가능한 감사 계획으로 바꾸기 위한 문서다. 목적은 단순히 코드를 빨리 삭제하는 것이 아니라 아래 항목을 체계적으로 정리하는 데 있다.

- 메신저 전체 범위를 인벤토리화한다.
- 중복 기능과 중복 로직을 식별한다.
- 의도된 호환성 코드와 가치가 낮은 코드, 사실상 죽은 코드를 구분한다.
- 기존 회귀 테스트와 연결된 안전한 실행 순서를 정의한다.

## 현재 구조

메신저는 단일 화면이 아니라 UI, 훅, Supabase 쿼리, 알림 라우팅, 관리자 도구, cron 작업, E2E 테스트 픽스처까지 넓게 퍼져 있다.

핵심 파일:

- `app/main/기능부품/메신저.tsx`
  - 메인 오케스트레이션 레이어
  - 3092줄
  - 훅 분리 이후에도 fallback query helper와 read-cursor 연결 책임을 직접 들고 있다.
- `app/main/기능부품/메신저방데이터훅.ts`
  - 방 로딩, unread 계산, pinned/bookmark/reaction/poll 데이터 동기화
  - 685줄
- `app/main/기능부품/메신저구독훅.ts`
  - realtime, presence, typing, BroadcastChannel 동기화, mock event hook, 주기적 fallback
  - 432줄
- `app/main/기능부품/메신저운영센터.tsx`
  - 공지 읽음 추적, 방 파일 개요, 스케줄 작업, 리마인더 발송, 드라이브 링크 관리
  - 831줄
- `app/main/기능부품/관리자전용서브/시스템마스터센터.tsx`
  - 시스템마스터용 채팅 목록, flagged 필터, 빈 방 정리, 운영 액션
- `app/main/기능부품/관리자전용서브/채팅모니터링.tsx`
  - 금지어 관리와 직접 삭제 기능을 포함한 구형 스타일의 직원별 채팅 모니터링 화면

## 점검 원칙

- 소유 파일, 호출 지점, 테스트 커버리지가 확인되기 전에는 삭제하지 않는다.
- 테스트 전용 hook은 dead code와 별도로 취급한다.
- 수동 endpoint와 cron endpoint가 함께 있는 경우에는 실제 호출자와 인증 방식을 확인하기 전까지 “의도된 중복일 수 있음”으로 본다.
- 눈에 보이는 UI 정리보다 쿼리/상태 로직 통합을 먼저 한다.
- 모든 정리 항목은 최소 1개 이상의 회귀 테스트와 연결한다.

## 기능 인벤토리

| 기능 영역 | 주요 파일 | 관련 API/lib | 기존 테스트 커버리지 | 점검 초점 |
| --- | --- | --- | --- | --- |
| 채팅 셸 및 오케스트레이션 | `app/main/기능부품/메신저.tsx` | `lib/chat-query-columns.ts`, `lib/chat-read-cursors.ts` | `chat-detailed-walkthrough`, `chat-realtime` | 셸에 남아 있는 책임과 추출된 훅의 경계를 점검 |
| 방 목록, 중복 제거, 고정 순서, 숨김 방 | `app/main/기능부품/메신저사이드바.tsx`, `app/main/기능부품/메신저사이드바훅.ts` | `app/main/기능부품/메신저유틸.ts` | `chat-room-list-actions`, `chat-detailed-walkthrough`, `chat-realtime` | 방 dedupe, fallback 선택, hidden-room 동작, pinned 순서 로직 점검 |
| 방 로드 및 타임라인 데이터 동기화 | `app/main/기능부품/메신저방데이터훅.ts`, `app/main/기능부품/메신저방전환훅.ts` | `lib/chat-query-columns.ts` | `chat-realtime`, `chat-detailed-walkthrough` | 메시지 fetch 흐름, unread 계산, pinned message hydration, 방 fallback 동작 점검 |
| 실시간, presence, typing, 탭 간 동기화 | `app/main/기능부품/메신저구독훅.ts`, `app/main/기능부품/메신저실시간훅.ts` | Supabase realtime, `BroadcastChannel` | `chat-realtime` | realtime listener, window custom event, page-refresh fallback 간 중복 점검 |
| 컴포저, 전송, 재시도, 병동 quick reply | `app/main/기능부품/메신저컴포저.tsx`, `app/main/기능부품/메신저전송훅.ts`, `app/main/기능부품/메신저메시지워크플로훅.ts` | `app/main/기능부품/메신저메시지서비스.ts`, `lib/chat-message-write.ts`, `app/api/chat/quick-reply/route.ts` | `chat-detailed-walkthrough`, `chat-advanced-actions`, `chat-realtime` | optimistic message 경로, retry queue, quick reply 경로, wrapper 계층 점검 |
| 첨부 업로드 및 미리보기 | `app/main/기능부품/메신저업로드훅.ts`, `app/main/기능부품/메신저첨부.tsx`, `app/main/기능부품/메신저첨부미리보기.tsx` | `app/api/chat/upload/route.ts` | `chat-clipboard-image`, `chat-realtime` | direct upload와 app-server fallback, preview 분기, retry queue 점검 |
| 검색 및 메시지 이동 | `app/main/기능부품/메신저검색훅.ts`, `app/main/기능부품/메신저검색이동훅.ts`, `app/main/기능부품/메신저패널.tsx` | `lib/chat-query-columns.ts`, `withMissingColumnsFallback` | `chat-realtime` 검색 시나리오 | fallback query 로직 중복과 file/message/member/room 검색 분리 상태 점검 |
| 메시지 액션 및 오버레이 | `app/main/기능부품/메신저액션.tsx`, `app/main/기능부품/메신저액션훅.ts`, `app/main/기능부품/메신저오버레이.tsx`, `app/main/기능부품/메신저상태훅.ts` | `room_read_cursors`, `pinned_messages`, `message_bookmarks` | `chat-advanced-actions`, `chat-reverse-actions`, `chat-detailed-walkthrough` | pin/bookmark/read/edit/delete/reaction/thread/read-status 흐름 점검 |
| 드로어 및 방 단위 알림 설정 | `app/main/기능부품/메신저드로어.tsx`, `app/main/기능부품/메신저실시간훅.ts` | `room_notification_settings` | `chat-deep-actions` | 드로어 설정이 다른 곳과 중복되는지, room prefs 분리가 명확한지 점검 |
| 공지방 및 운영센터 | `app/main/기능부품/메신저운영센터.tsx`, `app/main/기능부품/메신저공지스케줄.ts` | `notifications`, `room_read_cursors`, `messages` | `chat-deep-actions`, `board-notice-chat-announcement` | 공지 리마인더 흐름, 스케줄 영속화, 방 파일 리포트, 드라이브 링크 부가기능 점검 |
| 관리자 모니터링 및 중재 | `app/main/기능부품/관리자전용서브/채팅모니터링.tsx`, `app/main/기능부품/관리자전용서브/시스템마스터센터.tsx` | `lib/banned-words.tsx`, `lib/system-master-chat-filter.ts`, `app/api/admin/system-master/route.ts` | `system-master-chat-filter`, `system-master-chat-history`, `system-master-empty-chat-room` | 두 화면이 공존해야 하는지, 금지어 툴링이 중복되는지 점검 |
| 푸시 발송, 수동 flush, 보관정책 | `lib/chat-push-dispatch.ts`, `app/api/notifications/chat-push/route.ts`, `app/api/notifications/chat-push-flush/route.ts`, `app/api/cron/chat-push-dispatch/route.ts`, `app/api/cron/chat-retention/route.ts` | push queue 테이블, `cleanup_chat_messages_by_retention` RPC | system-master push ops 테스트, board notice chat announcement | 즉시 발송, 수동 flush, cron flush, retention cleanup의 역할 분리를 점검 |

## 중복 기능 후보

### P1. unread 계산 로직이 두 군데에 구현되어 있음

근거:

- `app/main/기능부품/메신저방데이터훅.ts:99-179`
  - `updateUnreadForRooms`
- `app/main/기능부품/조직도서브/조직도측면창.tsx:174-253`
  - `fetchChatUnreadCount`

문제점:

- 두 경로 모두 `chat_rooms`를 조회한다.
- 두 경로 모두 `room_read_cursors`를 조회한다.
- 두 경로 모두 unread `messages`를 직접 센다.
- 두 경로 모두 열린 대화와 hidden room을 예외 처리한다.
- 이 둘이 어긋나면 메신저 내부 badge와 사이드바 badge가 달라질 수 있다.

점검 액션:

- unread 계산용 공통 query utility를 하나로 뽑는다.
- 방별 shape와 전체 badge shape를 분리해서 유지한다.
- 통합 후 `chat-realtime.desktop.spec.ts`를 다시 돌린다.

### P1. 선택된 방 fallback 로직이 두 군데에 구현되어 있음

근거:

- `app/main/기능부품/메신저방데이터훅.ts:329-337`
- `app/main/기능부품/메신저사이드바훅.ts:86-99`

문제점:

- 둘 다 선택된 방이 사라지거나 접근 불가가 되면 fallback room을 다시 고른다.
- 한쪽은 데이터 동기화 이후의 `roomList`를 사용한다.
- 다른 한쪽은 사이드바 내부의 `visibleRooms`를 사용한다.
- 이 구조는 이중 navigation이나 room flicker를 만들 수 있다.

점검 액션:

- fallback room 선정 규칙을 하나로 정의한다.
- 방 선택 소유권을 한 레이어에만 둔다.
- 방 삭제, hidden-room 시나리오로 검증한다.

### P1. 금지어 관리 UI가 관리자 화면 두 군데에 존재함

근거:

- `app/main/기능부품/관리자전용서브/채팅모니터링.tsx:67-88`
  - `BannedWordManager`
- `app/main/기능부품/관리자전용서브/시스템마스터센터.tsx:17-26`
  - `BannedWordModal`

문제점:

- 같은 기능이다.
- 같은 storage primitive를 사용한다.
- UI 래퍼와 필터 연결 방식만 다르다.
- 정책 drift와 UX 불일치가 생길 가능성이 높다.

점검 액션:

- `채팅모니터링`을 별도 도구로 유지할지 먼저 결정한다.
- 유지한다면 shared banned-word modal/component를 하나로 추출한다.
- 필터 utility 경로를 하나로 통일한다.

### P1. 관리자용 채팅 검토 기능이 두 화면에 겹쳐 있음

근거:

- `app/main/기능부품/관리자전용서브/채팅모니터링.tsx:134-221`
- `app/main/기능부품/관리자전용서브/시스템마스터센터.tsx:506-748`

문제점:

- 둘 다 채팅 내역을 검토한다.
- 둘 다 flagged 내용 필터링을 지원한다.
- 둘 다 파괴적 moderation 액션을 포함한다.
- 한쪽은 Supabase를 직접 호출하고, 다른 한쪽은 `/api/admin/system-master`를 경유한다.

점검 액션:

- 먼저 제품 의도를 결정한다.
- 서로 다른 워크플로로 유지할지
- 시스템마스터 화면으로 합칠지
- 구형 모니터링 화면을 폐기할지

### P2. 메시지 insert fallback이 두 번 감싸져 있음

근거:

- `lib/chat-message-write.ts:20-37`
- `app/main/기능부품/메신저메시지서비스.ts:22-25`

문제점:

- 앱 레벨 service는 shared insert helper 위에 거의 추가 로직이 없다.
- wrapper가 한 번 더 감싸지면서 schema-compat fallback의 실제 위치가 흐려진다.
- 이후 메시지 쓰기 변경이 생기면 잘못된 레이어를 수정할 가능성이 있다.

점검 액션:

- 앱 레벨 wrapper를 UI 도메인용 이름으로만 유지할지 판단한다.
- 필요 없다면 가능한 곳부터 lib helper를 직접 가져다 쓴다.

### P2. message select용 missing-column fallback이 셸과 검색 훅에 나뉘어 있음

근거:

- `app/main/기능부품/메신저.tsx:124-131`
  - `selectChatMessagesWithFallback`
- `app/main/기능부품/메신저검색훅.ts:411-420`
  - 직접 `withMissingColumnsFallback` 호출
- `app/main/기능부품/메신저검색훅.ts:93-95`
  - 직접 `buildChatMessageSelect(omittedColumns)` 호출

문제점:

- 같은 schema-compat 동작이 두 진입점에서 따로 구현되어 있다.
- 이후 message 컬럼이 또 바뀌면 검색과 방 로딩이 서로 다른 동작을 할 수 있다.

점검 액션:

- message-select fallback을 shared messenger query helper로 통합한다.
- 검색 전용 필터링 로직은 별도로 유지한다.

### P3. 수동 route와 cron route가 같은 작업을 재사용하지만 의도된 구조일 수 있음

근거:

- `app/api/notifications/chat-push-flush/route.ts`
- `app/api/cron/chat-push-dispatch/route.ts`
- `app/api/notifications/repush-unread/route.ts`
- `app/api/cron/unread-notification-repush/route.ts`

문제점:

- 이 쌍은 자동으로 나쁜 중복이라고 보기 어렵다.
- 운영자가 수동으로 실행하는 경로와 스케줄러가 실행하는 경로를 분리했을 가능성이 있다.

점검 액션:

- 인증 방식, 호출자, UI 트리거를 확인한다.
- 하나가 운영자 수동 실행용이고 다른 하나가 스케줄 실행용일 때만 둘 다 유지한다.

## 정리 및 dead-code 후보

### 후보 A. 숨겨진 legacy 그룹 채팅 버튼

근거:

- `app/main/기능부품/메신저사이드바.tsx:268-274`
  - 숨겨진 버튼 `data-testid="chat-open-group-modal-legacy"`

의심 이유:

- UI에서 hidden 상태다.
- 저장소 내부 테스트나 컴포넌트에서 사용 흔적을 찾지 못했다.
- 이름 자체가 legacy임을 드러낸다.

점검 액션:

- 외부 자동화가 이 test id에 의존하지 않는지 확인한다.
- 미사용이면 제거한다.

### 후보 B. 사용되지 않는 swipe helper 파일

근거:

- `app/main/기능부품/메신저스와이프.ts:16`
  - `createSwipeHandlers`
- `createSwipeHandlers`에 대한 저장소 내부 참조를 찾지 못했다.

의심 이유:

- 단독 utility인데 호출자가 없다.
- 모바일 swipe reply 동작이 다른 인터랙션으로 대체되었을 가능성이 있다.

점검 액션:

- dynamic import 또는 외부 사용 여부를 확인한다.
- 진짜 orphan이면 삭제한다.

### 후보 C. 테스트 전용 mock event hook이 운영 코드 안에 섞여 있음

근거:

- `app/main/기능부품/메신저구독훅.ts:388-403`
  - `erp-mock-chat-message-insert`
- `app/main/기능부품/메신저.tsx:1038-1053`
  - `erp-mock-notification-insert`
- 테스트 호출 지점:
  - `tests/e2e/chat-realtime.desktop.spec.ts`
  - `tests/e2e/chat-deep-actions.desktop.spec.ts`
  - `tests/e2e/helpers.ts`

의심 이유:

- dead code는 아니다.
- 다만 현재 프로덕션 번들 안에 테스트용 계측 hook이 같이 들어가 있다.
- 이 구조는 코드 이해 비용을 높이고 런타임 책임 경계를 흐릴 수 있다.

점검 액션:

- E2E에 필요하면 동작은 유지한다.
- 가능하면 test-only guard 또는 별도 helper module 뒤로 분리한다.

### 후보 D. realtime 동기화에 fallback 계층이 세 겹으로 겹쳐 있음

근거:

- `app/main/기능부품/메신저구독훅.ts:363-386`
  - `BroadcastChannel`
- `app/main/기능부품/메신저.tsx:1056-1064`
  - window custom event `erp-chat-sync`
- `app/main/기능부품/메신저구독훅.ts:457-472`
  - interval/page refresh fallback

의심 이유:

- 의도된 복원력일 수 있다.
- 하지만 중복 refresh와 상태 churn이 숨어들기 쉬운 복잡도 hotspot이다.

점검 액션:

- 현재 브라우저 환경에서 어떤 경로가 실제로 필요한지 추적한다.
- 복원력은 유지하되 중복 refresh trigger는 줄인다.

## 권장 실행 순서

### 1단계. 범위 고정

- 위 기능 인벤토리가 완전한지 확정한다.
- 관리자/백엔드 진입점을 각각 `user feature`, `ops feature`, `compatibility layer`로 분류한다.
- `메신저.tsx`, `메신저방데이터훅.ts`, `메신저구독훅.ts`의 책임 경계를 문서로 고정한다.

### 2단계. UI 정리보다 로직 중복부터 정리

- unread 계산
- selected-room fallback
- message-select fallback helper
- message-write wrapper 계층

회귀 기준:

- `tests/e2e/chat-realtime.desktop.spec.ts`
- `tests/e2e/chat-room-list-actions.desktop.spec.ts`

### 3단계. 관리자 기능을 의도적으로 합치거나 분리

- `채팅모니터링`과 `시스템마스터센터`를 비교한다.
- 금지어 UI와 flagged-room filtering 흐름을 비교한다.
- 아래 중 하나를 고른다.
- 합친다.
- 서로 다른 역할로 유지한다.
- 하나를 폐기한다.

회귀 기준:

- `tests/e2e/system-master-chat-filter.desktop.spec.ts`
- `tests/e2e/system-master-chat-history.desktop.spec.ts`
- `tests/e2e/system-master-empty-chat-room.desktop.spec.ts`

### 4단계. 가치가 낮은 코드 제거 또는 격리

- hidden legacy control
- orphan utility
- 운영 코드 내부의 테스트 hook

회귀 기준:

- 메신저 대상 E2E
- 채팅 진입 및 알림 smoke 테스트

### 5단계. 최종 검증

- 메신저 realtime/search/attachment/action 계열 테스트를 실행한다.
- system-master chat 계열 테스트를 실행한다.
- 게시판 공지가 notice room으로 계속 기록되는지 확인한다.

회귀 기준:

- `tests/e2e/chat-realtime.desktop.spec.ts`
- `tests/e2e/chat-clipboard-image.desktop.spec.ts`
- `tests/e2e/chat-advanced-actions.desktop.spec.ts`
- `tests/e2e/chat-reverse-actions.desktop.spec.ts`
- `tests/e2e/chat-deep-actions.desktop.spec.ts`
- `tests/e2e/chat-detailed-walkthrough.desktop.spec.ts`
- `tests/e2e/board-notice-chat-announcement.desktop.spec.ts`

## 완료 조건

- 모든 메신저 기능이 소유 파일 그룹에 매핑되어 있다.
- 모든 중복 후보가 아래 중 하나로 분류되어 있다.
- 유지
- 통합
- 제거
- 모든 정리 후보에 대해 caller 검증이 끝나 있다.
- 메신저 및 system-master chat 회귀 테스트가 정리 이후 통과한다.

## 즉시 착수 대상

이 감사를 단계적으로 실행한다면 아래 순서로 시작하는 것이 가장 효율적이다.

1. unread 계산 통합
2. selected-room fallback 통합
3. 관리자 채팅 화면 중복 여부 결정
4. hidden legacy 버튼 제거 가능 여부 확인
5. orphaned swipe helper 제거 가능 여부 확인

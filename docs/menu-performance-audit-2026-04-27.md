# 메뉴 전환 버벅임 및 코드 최적화 진단 보고서

작성일: 2026-04-27

## 1. 요약

이번 점검은 정적 코드 분석, 병렬 탐색 결과, `npm run build` 프로덕션 빌드 산출물 기준으로 진행했다. 실제 사용자 단말/운영 DB에서의 네트워크 타이밍 계측은 아직 포함하지 않았으므로, 아래 내용은 "가능성이 높은 병목 후보와 개선 우선순위"로 봐야 한다.

핵심 결론은 다음과 같다.

1. `/main`은 단일 클라이언트 페이지 상태로 전체 메뉴를 전환한다. 메뉴 클릭은 route 이동이 아니라 루트 상태 변경이며, 알림/배너/메인 콘텐츠가 같은 렌더 경로에 묶여 있다.
2. 메뉴 컴포넌트는 dynamic import를 쓰지만, `MainContent`가 로그인 직후 idle 시간에 거의 모든 주요 메뉴 번들을 순차 prefetch한다. 사용자가 메뉴를 빠르게 누르면 이 백그라운드 import와 클릭 대상 import가 겹친다.
3. 각 상위 메뉴 내부는 다시 서브뷰별로 충분히 나뉘지 않아, 특정 서브메뉴 하나를 열어도 도메인 전체 코드와 초기 데이터 로딩이 따라온다.
4. 채팅은 chunk 자체도 크고, 첫 진입 때 방 목록, 선택방 메시지, 읽음/북마크/반응/고정/투표 메타, realtime 구독, 안 읽음 수 계산이 몰린다. 사용자가 예로 든 "채팅 메뉴 로딩이 긴 현상"의 1순위 후보가 여기에 있다.
5. 재고/전자결재/게시판/인사관리/관리자/알림도 `select('*')`, 전체 목록 재조회, realtime 이벤트 시 전체 fetch, 중복 캐시 부재가 반복된다.

빌드는 통과했다.

```text
npm run build
Compiled successfully
```

빌드 경고로는 큰 문자열 직렬화 경고가 있었다.

```text
Serializing big strings (133kiB) impacts deserialization performance
```

## 2. 공통 병목

### P0. 모든 메뉴 번들을 idle prefetch

`app/main/기능부품/조직도서브/조직도본문.tsx`에서 상위 메뉴들이 dynamic import로 분리되어 있다. 그러나 같은 파일에서 `내정보`, `알림`, `조직도`, `채팅`, `게시판`, 권한이 있으면 `전자결재`, `인사관리`, `재고관리`, `추가기능`, `관리자`까지 순차 prefetch한다.

근거:

- `조직도본문.tsx:11-18`: 상위 메뉴 loader 정의
- `조직도본문.tsx:22-61`: dynamic import 선언
- `조직도본문.tsx:145-216`: idle prefetch queue

문제:

- 사용자가 로그인 직후 메뉴를 누르면, 아직 사용하지 않을 HR/Admin/Inventory 같은 큰 chunk 다운로드/파싱/평가가 클릭 대상 메뉴와 경쟁한다.
- `requestIdleCallback`은 네트워크/JS parse 비용을 완전히 격리하지 못한다. 특히 저사양 PC나 모바일 WebView에서는 체감 버벅임으로 이어질 수 있다.

개선:

- 전체 prefetch 제거 또는 강한 제한.
- 최근 사용 메뉴, hover/focus 메뉴, 사용자가 접근 직전인 메뉴만 prefetch.
- HR/Admin/Inventory는 idle prefetch 대상에서 제외.

### P0. 상위 메뉴 내부 static import 과다

상위 메뉴를 한 번 열면 해당 도메인의 하위 기능들이 상당 부분 같이 들어온다.

근거:

- `재고관리통합.tsx`: 재고 하위 화면 다수 import
- `인사관리.tsx`: 인사 하위 화면 다수 import
- `관리자전용.tsx`: 관리자 하위 화면 다수 import
- 빌드 산출물 기준 대형 chunk: 인사관리 약 900KB대, 관리자 약 900KB대, 재고관리/채팅 수백 KB대

개선:

- 상위 메뉴 내부도 서브뷰 단위 dynamic import로 재분할.
- 기본 탭에 필요한 컴포넌트만 즉시 로드.
- 엑셀, PDF, 차트, 서명, OCR, 로스터 생성 엔진 등 무거운 기능은 버튼 클릭 시점으로 지연 import.

### P1. `/main` 루트 상태 변경이 전역 컴포넌트와 결합

`app/main/page.tsx`에서 `mainMenu`, `subView`가 루트 state로 관리되고, 메뉴 클릭 시 루트가 다시 렌더된다. 같은 렌더 트리에 `ChatAlertBanner`, `NotificationSystem`, `MainContent`가 들어 있다.

근거:

- `app/main/page.tsx:100-101`: `mainMenu`, `subView`
- `app/main/page.tsx:961-1005`: 메뉴/서브뷰 변경
- `app/main/page.tsx:1110-1164`: 전역 알림/배너/메인 콘텐츠 렌더
- `app/main/기능부품/알림시스템.tsx`: 약 1,885라인 전역 알림 컴포넌트

개선:

- 얇은 shell + 메뉴별 route segment 구조 검토.
- 당장 라우팅 변경이 크면 전역 알림/배너를 memo 처리하고 handler를 안정화.
- 같은 메뉴 재클릭 시 `MainContent` 강제 remount(`menuResetVersion`)는 꼭 필요한 경우로 제한.

## 3. 채팅 메뉴 상세

### P1. 채팅 chunk와 첫 진입 로딩이 큼

`채팅`은 `dynamic(() => import('../메신저'), ssr:false)`로 분리되어 있지만 `메신저.tsx`가 레이아웃, 사이드바, 타임라인, 모달, 업로드, 검색, realtime hook 등을 정적으로 많이 가져온다. 빌드 산출물 기준 채팅 chunk는 약 280KB였다.

근거:

- `조직도본문.tsx:14`, `조직도본문.tsx:34`: 채팅 dynamic import
- `메신저.tsx:5-42`: 주요 채팅 모듈 정적 import

개선:

- 모달/드로어/검색/미디어 아카이브/투표/멤버 관리 등을 사용자 액션 시점으로 dynamic import.
- 초기 화면은 방 목록 + 선택방 메시지 렌더에 필요한 최소 모듈만 남긴다.

### P1. 방 목록 조회와 선택방 fetch 중복 가능

채팅 진입 직후 저장된 방/공지방 선택, 방 목록 로드, 선택방 realtime effect의 즉시 `fetchData()`가 겹친다. 캐시가 비어 있으면 `fetchData()`도 `chat_rooms` 전체를 다시 조회할 수 있다.

근거:

- `useChatNavigationState.ts:230`
- `useChatRealtimeBridge.ts:401-406`
- `메신저구독훅.ts:287-303`
- `메신저메시지조회훅.ts:597-604`

개선:

- 방 목록 로드 promise를 공유해서 첫 진입 중복 fetch를 막는다.
- 방 목록이 준비되기 전 선택방 메시지 fetch가 `chat_rooms` 전체 조회를 재실행하지 않게 한다.

### P1. 안 읽음 수 계산이 방 개수만큼 count query

안 읽음 수 계산은 `room_read_cursors`를 읽은 뒤 방별로 `messages.select('id', { count:'exact', head:true })`를 실행한다. 사이드바도 별도로 같은 패턴을 가진다. 방이 많으면 메뉴 클릭 주변 네트워크가 방 수에 비례한다.

근거:

- `메신저데이터유틸.ts:68-101`
- `조직도측면창.tsx:214-251`
- `메신저읽음상태훅.ts`의 unread refresh 흐름

개선:

- 서버 RPC 또는 DB view로 방별 unread count를 한 번에 반환.
- `room_unread_counts` materialized/denormalized 테이블 검토.
- 사이드바와 채팅 내부 unread 계산 공유.

### P2. 선택방 메시지 후속 메타 쿼리가 많음

최초 메시지 page 로드 후 읽음 커서/북마크/반응을 병렬 조회하고, 이어 고정 메시지, 누락 고정 메시지, polls, poll_votes를 순차 조회한다. `setMessages` 이후에도 여러 state 업데이트가 이어져 렌더가 흔들릴 수 있다.

근거:

- `메신저메시지조회훅.ts:193-215`: messages 조회
- `메신저메시지조회훅.ts:271-291`: read/bookmark/reaction
- `메신저메시지조회훅.ts:422-502`: pinned/polls/votes
- `메신저메시지조회훅.ts:693-707`: messages set 후 metadata sync

개선:

- 선택방 첫 paint는 메시지 목록만 먼저 완료.
- 반응/읽음/북마크/투표는 skeleton 또는 idle refresh로 후순위 처리.
- metadata state 업데이트를 batch 처리.

### P2. realtime 구독이 진입 직후 많음

global messages, room messages/update/delete, read cursors, reactions, bookmarks, pinned, polls, poll_votes, typing, fallback polling이 한 번에 붙는다. room effect는 구독 전에 `fetchData()`도 바로 호출한다.

근거:

- `메신저구독훅.ts:250-285`: global messages 구독
- `메신저구독훅.ts:287-335`: 선택방 구독과 즉시 fetch
- `메신저구독훅.ts:551-562`: fallback refresh

개선:

- 첫 화면 paint 이후 구독 단계화.
- 선택방 필수 이벤트만 우선 구독하고, reactions/polls/pinned는 지연.
- fallback polling은 realtime 연결 실패 상태에서만 켜는 방식으로 축소.

## 4. 메뉴별 진단

### 재고관리

주요 병목:

- `useInventoryData.ts:31-105`: `inventory`, `suppliers`, `inventory_logs`를 대부분 `select('*')`로 로드.
- `재고관리통합.tsx:141`, `:150`, `:160`: activeView 변경 시 재고/공급업체/로그/승인대기 로딩이 반복될 수 있음.
- `useSupplyWorkflow.ts:69-72`: 승인 건과 지원부서 재고를 함께 로드 후 클라이언트 매칭.
- 하위 화면들도 `select('*')` 재조회 반복: `AS반품관리.tsx`, `부서별물품장비현황.tsx`, `재고이관.tsx`, `소모품통계.tsx`.

개선:

- 현황 탭 초기 쿼리는 필요한 컬럼만 지정.
- logs는 최근 100건 유지가 있지만 화면별로 더 좁은 기간/회사/부서 필터를 서버에서 적용.
- 공급업체/카테고리/회사/부서 기준 데이터는 React Query/SWR 또는 자체 캐시로 공유.
- 하위 서브뷰 dynamic import + 데이터 fetch 지연.

### 전자결재

주요 병목:

- `전자결재.tsx:180-187`: 결재선 디렉터리용 `staff_members.select('*')`.
- `전자결재.tsx:568-575`: 전체 결재 `approvals.select('*')`.
- `전자결재.tsx:666-673`: realtime 이벤트가 전체 결재 재조회 트리거.
- `useApprovalComposeDraft.ts`: 선택 결재/최근 결재 추가 조회와 localStorage JSON 작업.
- `AttendanceCorrectionDateSection.tsx`: 출결 정정 섹션에서 출근기록, 근태, 정정신청, 직원, 배정, 근무조 등 다중 쿼리.

개선:

- 기안함/결재함/참조함별 서버 필터와 pagination.
- approval list에는 목록 카드에 필요한 컬럼만 사용하고 상세/본문/meta는 모달 진입 시 로드.
- realtime 이벤트는 해당 row만 patch하거나 stale 표시 후 debounce refresh.
- 결재선 직원 정보는 `id,name,department,position,company,photo_url` 수준으로 축소.

### 게시판

주요 병목:

- `useBoardDataSource.ts:64`: 게시글 최대 100건 로드.
- `게시판.tsx:284`: INSERT/DELETE realtime 이벤트마다 목록 전체 재조회 예약.
- `useBoardDataSource.ts:107`: 수술/MRI 템플릿을 활성 게시판과 무관하게 함께 로드.
- `useBoardReadStatus.ts`: 직원 목록과 읽음 상태 재조회.
- `useBoardPostInteractions.ts`: 댓글/상세/좋아요 처리마다 별도 요청 다수.

개선:

- 게시판별 cursor pagination.
- 목록 쿼리와 상세 쿼리 분리. attachments/comments/read status는 상세 진입 시.
- 수술/MRI 템플릿은 해당 게시판 탭 진입 시 로드.
- realtime은 insert row prepend/delete row remove 형태로 local patch 우선.

### 인사관리

주요 병목:

- `인사관리.tsx:516-527`: MSO 사용자용 전체 `staff_members.select('*')`를 다시 로드. `app/main/page.tsx`에서 이미 staffs를 전달하므로 중복 가능.
- `구성원현황/index.tsx:170-178`: 회사 직원 ID 기준 `audit_logs.select('*')`.
- `근태관리메인.tsx:492-565`: 월 범위 출근기록, 근무조, 배정 조회.
- 급여/근태/문서 하위 화면들에서 `select('*')` 및 클라이언트 필터 반복.
- 일부 분석 화면은 직원별 전체 기록 배열 반복 필터로 O(직원 수 x 기록 수) 계산 후보.

개선:

- 루트 `staffs` 재사용을 기본으로 하고, 필요한 경우 변경분만 refresh.
- 구성원 현황 audit log는 페이지네이션/최근 N건/대상 직원 상세 진입 시 로드.
- 근태/급여는 월/회사/부서/직원 범위를 서버 필터로 강제.
- 대형 계산은 Map/groupBy로 선집계하거나 Web Worker 검토.

### 근무표/로스터

주요 병목:

- 로스터 생성은 월 일자, 그룹, 직원별 배열/Map을 대량 생성하고 coverage 보정 루프를 수행한다.
- 저장 시 해당 월 기존 배정을 삭제한 뒤 직원 x 일자 전체 행을 만들어 500개 단위 upsert한다.
- 정책/프리셋/스냅샷 localStorage JSON read/write가 많다.

개선:

- 로스터 생성 엔진은 Web Worker 분리 검토.
- 변경된 셀/직원만 저장하는 delta upsert 구조.
- 정책/프리셋은 화면 mount 시 1회 parse 후 메모리 캐시.

### 관리자

주요 병목:

- `관리자전용.tsx:173-180`: 경영분석/대시보드 탭 진입 시 inventory 전체성 데이터 로드.
- 시스템 마스터 API는 overview/operations/integrity 등 넓은 범위 쿼리를 수행.
- 감사로그/백업성 기능에서 `select('*')`, JSON Blob 직렬화가 큼.

개선:

- 관리자 메인 진입과 시스템 마스터/백업/감사 기능을 완전히 lazy 분리.
- 관리자 API는 탭별 endpoint로 분리하고, 첫 화면은 summary만 제공.
- 백업은 streaming/export job 방식으로 분리.

### 알림/전역 기능

주요 병목:

- `알림센터.tsx:90-98`: unread count와 최근 알림 목록을 동시에 조회하고 목록은 `select('*')`.
- `알림시스템.tsx`는 루트에 항상 mount되고 다수 realtime 채널을 관리한다.
- `알림인박스`는 최대 200건 `select('*')` 로드 후보.

개선:

- 알림센터는 `id,title,body,type,read_at,created_at,metadata`처럼 최소 컬럼.
- 메뉴 전환과 관계없는 전역 알림 컴포넌트 memo/stable handler 적용.
- 알림 인박스 pagination.

## 5. 권장 실행 순서

### 1차: 체감 개선이 큰 저위험 작업

1. `MainContent` 전체 메뉴 idle prefetch 제거 또는 제한.
2. 채팅 unread count를 사이드바/채팅 내부에서 공유하고, 방별 count exact 다중 호출 제거 계획 수립.
3. 채팅 첫 paint 이후 metadata/realtime 구독 단계화.
4. 전역 `NotificationSystem` memo 및 handler 안정화.

### 2차: 메뉴별 데이터 로딩 개선

1. 전자결재 목록 쿼리 컬럼 축소 + 상세 지연 로드.
2. 재고 `inventory.select('*')`를 화면별 컬럼/범위로 축소.
3. 게시판 목록/상세/댓글/읽음 상태 로딩 분리.
4. 인사관리의 `staff_members.select('*')` 중복 제거.

### 3차: 구조 개선

1. HR/Admin/Inventory 내부 서브뷰 dynamic import.
2. `/main`을 메뉴별 route segment 또는 얇은 shell + nested route로 전환.
3. 로스터 생성 Web Worker 또는 서버 작업화.

## 6. 계측 제안

다음 단계에서는 실제 수치를 잡아야 한다.

1. Playwright로 메뉴 클릭별 `performance.mark` 측정:
   - click to first loading
   - click to main content visible
   - click to data ready
2. Supabase request count 로깅:
   - 메뉴 클릭 1회당 REST 요청 수
   - 중복 table/select 패턴
   - response size
3. Web Vitals/React Profiler:
   - 메뉴 클릭 후 long task
   - commit 횟수
   - 가장 비싼 컴포넌트

## 7. 결론

지금 현상은 특정 메뉴 하나의 버그라기보다, 단일 `/main` 클라이언트 shell 위에 많은 도메인 기능이 붙으면서 생긴 구조적 비용에 가깝다. 채팅은 그중에서도 방 목록/안 읽음 수/메시지 메타/realtime이 한 번에 몰려 가장 먼저 체감되는 메뉴다.

가장 먼저 할 일은 전체 메뉴 prefetch를 줄이고, 채팅 첫 진입 경로를 "방 목록 + 메시지" 중심으로 가볍게 만드는 것이다. 이 두 작업만으로도 메뉴 클릭 직후의 버벅임은 눈에 띄게 줄 가능성이 높다.

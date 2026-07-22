# 전체 메뉴·기능 오류 및 버그 감사 보고서

- 점검일: 2026-07-22 (KST)
- 대상 리비전: `93c0aa3e`
- 방식: PC·모바일 메뉴, 전용 API, 공용 D1 API·정책, 실시간·파일·세션을 3개 스트림으로 병렬 정적 분석하고, 핵심 브라우저 스모크를 별도 실행했다.
- 변경·배포: 없음. 이 문서는 조사 결과만 기록한다.

## 결론

현재 가장 위험한 문제는 화면 권한 표시가 아니라 **서버의 공용 D1 API와 정책**이다. 로그인한 일반 사용자가 UI를 거치지 않고 `/api/d1/query`, `/api/d1/mutate`를 호출하면 다수의 의료·금융·인사·문서·채팅 데이터를 읽고, 일부는 생성·수정·삭제할 수 있는 구조다. 전자결재, 휴가, 급여, 재고의 전용 API에도 별도 권한·회사 범위 검증 누락이 있다.

발견 건수는 P0 10건, P1 15건, P2 7건이다. P0는 이미 배포된 기능의 데이터 유출·권한 상승·업무 상태 조작으로 이어질 수 있으므로 기능 개선보다 먼저 서버 접근을 차단해야 한다.

## 점검 범위와 검증 현황

| 구분 | 조사 범위 | 결과 |
|---|---|---|
| PC 메인 메뉴 | 내정보, 추가기능, 채팅, 게시판, 공유캘린더, 전자결재, 인사관리, 재고관리, 관리자, 재무회계 | 코드·권한·연결 API 점검 완료 |
| 모바일 메뉴 | 알림, 내정보, 추가기능, 채팅, 게시판, 전자결재, 인사관리, 재고관리, 관리자 | 코드·라우팅·핵심 화면 점검 완료 |
| 서버 공통 | 세션, D1 query/mutate, 정책 레지스트리, 실시간, 파일 객체, 업로드, ICS | 코드 점검 완료 |
| 자동 테스트 자산 | E2E 81개 spec, a11y 14개 spec의 테스트 범위 인벤토리 | 목록·대표 실행 완료 |
| 정적 검사 | `tsc --noEmit`, `npm run lint` | 모두 통과 |
| PC 브라우저 | 로그인·채팅·게시판·결재·재고·급여·인사·관리자 진입 7개 | 7/7 통과 |
| 모바일 브라우저 | 내정보 출퇴근·연차 서브화면 | 2/2 통과 |
| 모바일 브라우저 | 메인 셸·게시판 카드·채팅 목록 | 3건 통과 확인. 전체 묶음은 실행 세션 제한으로 완료 전 중단되어 미판정 |

브라우저 통과는 해당 화면의 기본 렌더링·라우팅을 뜻할 뿐, 아래 API 직접 호출 취약점을 보장하지 않는다. 전체 E2E는 이번 환경에서 장시간 실행 제한 때문에 끝까지 완주하지 못했으며, 보고서의 보안·무결성 항목은 코드 경로를 따라 검증한 정적 발견이다.

## 즉시 조치 우선순위

1. 공용 D1 변경 API의 기본 차단과 `PUBLIC_ALL` 자동 등록 제거
2. `staff_members`의 민감 컬럼 응답 차단 및 디렉터리 전용 projection 도입
3. 결재·휴가·급여·재고·공지방의 직접 변경 경로 차단
4. 최근 30일의 공용 D1 API 호출, 공지 발송, 채팅방 변경, 대량 조회·삭제를 감사
5. 테이블×역할×CRUD 및 전용 API IDOR 회귀 테스트를 추가한 뒤 기능을 단계적으로 재개

## P0 — 즉시 차단 필요

### SEC-P0-01 — 공용 D1 정책이 민감 테이블에 로그인 사용자 CRUD를 부여

**재현 조건**: 일반 직원으로 로그인한 뒤 `/api/d1/query` 또는 `/api/d1/mutate`에 정책 레지스트리에 존재하는 테이블과 CRUD 요청을 직접 전송한다.

**근거**:

- `lib/db/auth/policies.ts:338-343`의 `PUBLIC_ALL`은 select/insert/update/delete 모두 `PUBLIC`이다.
- `ADDITIONAL_PUBLIC_TABLES`의 항목이 `policies.ts:808-812`에서 명시 정책이 없으면 자동으로 `PUBLIC_ALL`로 등록된다.
- 예시: `discharge_reviews`(731), `virtual_account_deposits`(742), `backup_restore_runs`(752), `access_logs`(758), `inventory_transfers`(720), `generated_contracts`(771), `personnel_appointments`(693), `reward_discipline`(694), `journal_entries`(790) 등.
- `/api/d1/query`는 세션 사용자만 확인한 뒤 정책 레지스트리 테이블을 조회한다: `app/api/d1/query/route.ts:226-258`.
- `/api/d1/mutate`도 세션 확인 후 정책만 통과하면 요청 필드를 SQL 변경으로 실행한다: `app/api/d1/mutate/route.ts:349-394,565-646`.

**영향**: 퇴원심사(환자·진단·수술), 가상계좌 입금, 계약서 급여·근무조건, 백업·복구 기록, 인사발령·상벌·출결정정, 재고이동, 재무분개 등을 일반 로그인 계정이 열람·변조·삭제할 수 있다.

**조치**: `ADDITIONAL_PUBLIC_TABLES` 기반 자동 등록을 삭제하고 **미등록은 default-deny**로 바꾼다. 공용 D1 API는 읽기 전용의 좁은 allowlist로 임시 축소하고, 민감·상태 전이 테이블 쓰기는 전용 서버 API로만 제공한다.

### SEC-P0-02 — 조직도 경로에서 전 직원 주민번호·계좌·급여 정보가 노출

**재현 조건**: 일반 계정으로 조직도 화면을 열거나 `staff_members`를 공용 D1 query로 요청한다.

**근거**:

- `staff_members.select`가 `PUBLIC`: `lib/db/auth/policies.ts:356-368`.
- 조회 후 제거하는 컬럼은 `password`, `passwd`뿐: `policies.ts:1174-1183`.
- 조직도는 `select('*')`를 사용: `app/main/기능부품/조직도서브/OrgChart.tsx:290-305`.
- 스키마에는 `resident_no`, 주소, 계좌, 급여·수당, 권한, 시스템 관리자 관련 필드가 존재: `lib/db/schema.ts:1927-1991`.

**영향**: 일반 구성원이 전 직원의 PII와 보상 정보를 대량 수집할 수 있다.

**조치**: 조직도/직원검색에는 이름·부서·직책·공개 프로필 사진만 반환하는 서버 projection을 사용한다. 주민번호·주소·계좌·급여·권한은 본인, 승인된 HR, 시스템 관리자 전용 endpoint로 분리한다.

### APP-P0-01 — 결재 위임 행을 삽입해 타인 결재를 승인·반려 가능

**재현 조건**: 일반 사용자가 공용 mutation으로 `approval_delegation`에 `delegator_id=현재 결재자`, `delegate_id=본인`, `is_active=true` 행을 삽입한 뒤 결재 전이를 호출한다.

**근거**:

- `approval_delegation`은 공개 정책 목록: `lib/db/auth/policies.ts:707,338-343`.
- mutation API는 인증 뒤 해당 정책만 확인: `app/api/d1/mutate/route.ts:349-393`.
- 전이 서비스는 위임 행 존재를 유효 위임으로 보고 기간을 검사하지 않음: `lib/server-approval-transition.ts:377-389`.

**영향**: 휴가·물품·인사 등 후속 처리까지 연결된 타인의 결재를 임의 승인·반려할 수 있다.

**조치**: 위임 생성·변경·해제는 위임자 본인만 가능한 전용 API로 제한한다. 결재 전이 시 활성 여부, 시작·종료일, 회사·결재선 일치를 함께 검증하고, 공용 mutation에서 이 테이블을 제거한다.

### APP-P0-02 — 기안자/현재 결재자의 공용 결재 레코드 직접 수정

**재현 조건**: 기안자 또는 현재 결재자가 `/api/d1/mutate`로 `approvals.status`, `current_approver_id`, 결재선 또는 `meta_data`를 직접 갱신한다.

**근거**:

- `approvals.update`는 `APPROVAL_SCOPE`: `lib/db/auth/policies.ts:578-585`.
- 해당 범위는 기안자 또는 현재 결재자면 통과: `policies.ts:981-989`.
- mutation API가 허용 필드 allowlist 없이 전달 필드를 `SET`으로 실행: `app/api/d1/mutate/route.ts:565-607`.
- 정상 전이 API에는 별도의 현재 결재자 검증이 있으나, 공용 변경으로 우회 가능: `lib/server-approval-transition.ts:367-412`.

**영향**: 결재 상태·결재선·본문·금액성 메타데이터를 바꿔 정상 절차를 무력화할 수 있다.

**조치**: 일반 `approvals` update를 막고, 초안 수정·회수·결재 전이를 분리된 API와 상태 전이표로만 허용한다. 상태·결재선·기안자·금액 메타는 서버 allowlist 밖에서 변경할 수 없게 한다.

### APP-P0-03 — 본인이 휴가를 승인 상태로 삽입하거나 일수를 변경 가능

**재현 조건**: 본인 `staff_id`로 `leave_requests`에 `status='승인'`, 임의 `days`·기간을 공용 mutation으로 삽입·수정한다.

**근거**:

- `leave_requests`에 self insert/update/delete가 허용됨: `lib/db/auth/policies.ts:464-474`.
- 스키마에 상태와 일수가 직접 저장됨: `lib/db/schema.ts:1066-1079`.
- update 가드는 새 status만 보며 days 변경을 제한하지 않음: `policies.ts:203-217`.

**영향**: 결재 없이 승인 휴가를 만들거나 이미 승인된 휴가의 일수·기간을 변경하여 연차와 근태 집계를 왜곡할 수 있다.

**조치**: 신규 요청은 서버가 `대기` 상태와 계산된 일수만 생성하도록 한다. 승인·반려·일수 변경은 결재 처리 서비스만 수행하며, 승인 완료 요청은 기안자가 수정할 수 없게 한다.

### APP-P0-04 — 급여 레코드를 본인이 생성·수정·삭제 가능

**재현 조건**: 본인 `staff_id`의 `payroll_records`를 공용 mutation으로 변경한다.

**근거**:

- `payroll_records`에 self insert/update/delete가 허용: `lib/db/auth/policies.ts:488-493,951-959`.
- 기본급·수당·공제·실수령액이 같은 레코드에 존재: `lib/db/schema.ts:1480-1511`.

**영향**: 급여 산정·명세·회계 연동이 오염되고 급여 레코드가 삭제될 수 있다.

**조치**: 일반 직원은 본인 급여 **조회만** 허용한다. 급여 쓰기는 급여 담당 권한의 서버 서비스로 한정하고, 월 마감 잠금·감사 로그·승인 워크플로를 적용한다.

### APP-P0-05 — 전용 재고 API에 역할·회사·부서·품목 소유 검증이 없음

**재현 조건**: 일반 로그인 계정으로 타 회사/부서의 `itemId`, PO ID, `companyId`를 전용 재고 API 본문에 넣어 요청한다.

**근거**:

- `stock-update`가 인증 뒤 임의 itemId/delta를 반영: `app/api/inventory/stock-update/route.ts:32-52`.
- `stock-transfer`, `po-receive`, `po-inspect`도 대상 소속을 검증하지 않음: 각 `route.ts:84-109`, `:81-106`, `:60-88`.
- `stock-post`는 클라이언트의 `skipClosingCheck`, `skipExpiryCheck`, 음수 최소 재고를 수용: `stock-post/route.ts:39-63,71-142`; 서비스도 그대로 우회: `lib/inventory-movement-service.ts:144-192`.

**영향**: 일반 사용자가 타 조직 재고를 증감·이관하고 마감·유효기간·음수 재고 제어를 우회할 수 있다.

**조치**: 모든 route에서 대상 재고/PO를 먼저 조회하고 `assertInventoryScope(user, target)`으로 회사·부서·역할을 확인한다. 우회 플래그와 절대 수량 조정은 서버 관리자 전용 로직으로 분리한다.

### CHAT-P0-01 — 일반 직원의 전사 공지방 메시지·전 직원 푸시 발송

**재현 조건**: 로그인한 일반 사용자가 `/api/chat/quick-reply`에 공지방 고정 ID `00000000-0000-0000-0000-000000000000`와 문구를 보낸다.

**근거**:

- 공지방 ID: `lib/constants.ts:7,13`.
- quick-reply는 세션 후 멤버십 검사: `app/api/chat/quick-reply/route.ts:16-52`.
- 멤버십 helper가 공지방을 전원 접근 예외로 허용: `lib/chat-room-membership.ts:57-65`.
- 이어서 chat-push를 호출: `quick-reply/route.ts:62-71`; 명시 멤버가 없으면 활성 전 직원에 발송: `lib/chat-push-dispatch.ts:647-655`.

**영향**: 전사 피싱, 허위 공지, 푸시 폭주가 가능하다.

**조치**: 읽기 권한과 쓰기 권한을 분리하고, 공지방 쓰기는 시스템 관리자 또는 별도 `can_post_notice` 권한만 허용한다. quick-reply와 일반 messages insert 양쪽에 같은 검사를 적용한다.

### CHAT-P0-02 — 요청 본문의 `type='notice'`로 채팅방 수정 권한 상승

**재현 조건**: 알려진 채팅방 ID에 `PATCH /api/chat-rooms/:id`를 보내며 본문에 `type: 'notice'`를 넣는다. 고정 공지방 ID도 예측 가능하다.

**근거**:

- 기존 방을 조회한 뒤 `기존 type OR 요청 type`으로 notice를 계산: `app/api/chat-rooms/[id]/route.ts:102-109`.
- notice면 비멤버·구성원 제거 검사를 생략한 뒤 업데이트: `route.ts:110-138`.
- 범용 D1 guard도 다음 type이 notice면 허용: `lib/db/auth/policies.ts:295-329`.
- `POST /api/chat-rooms`는 로그인만 확인하고 클라이언트 ID/created_by를 받은 upsert로 기존 방을 덮어쓸 수 있음: `app/api/chat-rooms/route.ts:93-143`.

**영향**: 비공개 대화의 이름·유형·구성원을 변경하거나 공지방을 위변조할 수 있다.

**조치**: 권한은 요청값이 아닌 DB의 기존 방 속성·생성자·멤버십으로 판정한다. 일반 사용자의 notice 전환과 클라이언트 제공 ID upsert를 금지하고, 공지방 생성·수정은 관리자 전용 경로로 분리한다.

### BOARD-P0-01 — 일반 사용자의 공지 게시물 생성과 전사 방송

**재현 조건**: 일반 계정이 `board_posts`에 공지 유형 글을 공용 mutation으로 만들고 `/api/board/notice-broadcast`에 post ID를 전달한다.

**근거**:

- `board_posts`가 `PUBLIC_ALL`: `lib/db/auth/policies.ts:375`.
- broadcast는 세션과 작성자 본인 여부만 검사: `app/api/board/notice-broadcast/route.ts:80-89,123-162`.
- 공지방 메시지, 전 직원 notification, chat push를 순서대로 생성: `route.ts:181-244`.

**영향**: 허위 전사 공지와 대량 알림이 가능하다.

**조치**: 게시글 생성 시 board type별 서버 권한 검사를 강제하고, broadcast는 글 작성자가 아니라 공지 발송 권한을 가진 역할만 호출할 수 있게 한다.

## P1 — 높은 우선순위

| ID | 메뉴·영역 | 결함과 근거 | 영향 | 권고 |
|---|---|---|---|---|
| SEC-P1-01 | 세션/관리자 | 강제 로그아웃은 `force_logout_at`만 갱신하지만 토큰 검증은 서명·만료만 확인한다. `lib/server-session.ts:12-15,327-384`, `app/api/admin/force-logout/route.ts:65-71`; 최신 사용자 조회가 해당 필드를 선택하지 않아 UI 검사도 무력화된다. | 퇴사·권한 회수 뒤 최대 30일 접근 지속 | 모든 민감 API에서 session version, 재직 상태, `force_logout_at > iat`를 검증하고 변경 시 세션을 폐기 |
| SEC-P1-02 | 실시간 | WebSocket/SSE가 임의 채널·테이블을 구독하며 방 멤버십·테이블 범위를 검사하지 않는다. `lib/realtime/realtime-hub.ts:178-277`, `app/api/realtime/stream/route.ts:34-108`, `tail/route.ts:79-113`. Worker는 SESSION_SECRET 부재 시 개발 기본 비밀값을 사용한다: `cloudflare-worker.ts:174-180`. | 비참여 채팅의 활동 메타데이터 노출·신호 위조, 급여·감사 등 변경 메타데이터 노출 | 서버가 발급한 capability 채널만 구독시키고 production 비밀 부재는 fail-closed |
| SEC-P1-03 | 파일/첨부 | `/api/storage/object`가 로그인·버킷만 보고 object key의 리소스 ACL을 검사하지 않는다. `app/api/storage/object/route.ts:22-62`; 공개 R2 base URL이면 CDN으로 redirect: `lib/object-storage.ts:201-215`. 채팅 업로드는 room_id 없으면 멤버십을 건너뛴다. | URL 유출 시 다른 로그인 사용자 열람, 공개 CDN이면 무인증 노출 | 객체 메타 owner/resource/room을 저장하고 다운로드마다 리소스 ACL 검증, private bucket·짧은 서명 URL 사용 |
| SEC-P1-04 | 수술상담 | 전사 API가 임의 `audioUrl`을 검증 없이 fetch 후 Gemini로 전송: `app/api/consultation/transcribe/route.ts:88-153`. | SSRF 및 민감 음성의 외부 전송 | R2 객체 ID만 수용하고 HTTPS/host/IP/redirect/실제 바이트 제한 |
| CHAT-P1-01 | 채팅 | `chat_room_prefs`, read cursor, reactions, polls, poll votes, scheduled messages, drive links가 공개 CRUD 목록: `lib/db/auth/policies.ts:663-677,808-811`. | 타인의 읽음·뮤트·반응·투표·예약 메시지 변조 | self+room member, 작성자, 방 관리자별 정책으로 분리 |
| CHAT-P1-02 | 채팅 | HR/MSO가 비참여 방의 포괄 관리자: `app/api/chat-rooms/[id]/route.ts:46-52`, `policies.ts:295-300`. 목록 조회는 시스템 관리자만 예외라 쓰기 모델과 모순: `:1116-1148`. | HR/MSO의 비공개 방 임의 수정 | 시스템 관리자 또는 감사 가능한 chat-moderator로 축소 |
| BOARD-P1-01 | 게시판 | 게시글·댓글·좋아요·투표가 공개 정책이다: `policies.ts:679-682,808-811`; 모바일은 글 ID만으로 직접 update/delete: `app/main/모바일/게시판/게시판변경.ts:62-103`; 투표는 전체 JSON overwrite: `board-poll-vote.ts:46-62`. | 타인 글·댓글 조작, 좋아요 위조, 동시 투표 유실 | 작성자/관리자 정책과 사용자별 서버 투표 API 도입 |
| CAL-P1-01 | 공유캘린더 | `nurse_schedules` 공개 CRUD: `policies.ts:782,808-811`. UI의 전체 근무표 권한은 localStorage 필터다: `공유캘린더.tsx:17-25,70-90`. | 인력 배치 조회·변조 | 서버에 팀/회사 범위 조회, 근무표 관리자 전용 write 적용 |
| CAL-P1-02 | 외부 ICS | feed-token은 로그인 세션이면 90일 URL을 발급하고 서버 권한 검증이 없다: `app/api/calendar/feed-token/route.ts:11-28`; token은 revoke 불가: `lib/calendar-feed-token.ts:57-100`. | 비활성 사용자도 피드 취득, 퇴사·유출 뒤 90일 노출 | claims/feature flag 검사, token ID·epoch·폐기·회전 및 짧은 TTL |
| HR-P1-01 | 인사관리 | 평가·징계·발령·상벌·출결정정·증명·인사이동 이력이 공개 목록이다: `policies.ts:395,401,693-694,750,753-755`. | 민감 HR 자료 열람·변조 | 본인/동일 회사 HR/관리자 범위, 전용 승인 API |
| INV-P1-01 | 재고관리 | 공용 `inventory`, `purchase_orders` write가 조회용 `INVENTORY_SCOPE`를 사용하고 관리 권한을 요구하지 않는다: `policies.ts:588-616`; 빈 부서 범위도 write로 해석될 수 있다. | 동일 회사 일반 직원의 재고·발주 우회 변경 | select/write 정책 분리, 관리 권한 필수화 |
| INV-P1-02 | 발주 입고·검수 | 라인별 재고 반영 후 마지막에 PO를 갱신해 중간 실패 시 불일치: `po-receive/route.ts:136-191,253-274`. 반품 실패가 있어도 PO를 불합격 확정: `po-inspect/route.ts:119-232`. | 재고·수령량·검수 상태 불일치·재시도 중복 | 한 트랜잭션/조건부 버전 갱신, 실패 시 롤백·409 반환 |
| FIN-P1-01 | 재무회계 | `journal_entries`, `fixed_assets`, `bank_accounts_sync`가 공개 CRUD: `policies.ts:790-792`; UI도 직접 CRUD: `재무회계.tsx:113-128,224,275,310`. | 메뉴 권한 없는 사용자도 분개·자산·은행 동기화 값 조작 | FINANCE_SCOPE와 전용 서버 API·마감 잠금 도입 |
| PAY-P1-01 | 가상계좌 | 웹훅이 공급자 비밀 없이 입금조회 권한 세션도 허용하고 query `companyId`를 세션 회사보다 우선한다: `virtual-account-webhook/route.ts:34-39,84`; dedupe key는 회사 없는 전역 unique: `schema.ts:2194-2229`. | 타 회사 가짜 입금 주입·덮어쓰기 | HMAC 전용 웹훅, 세션 수동입력 분리, `(company_id,dedupe_key)` unique |
| APP-P1-01 | 전자결재 | 결재 갱신이 id만 조건으로 수행하고 후속처리 선점이 원자적이지 않다: `server-approval-transition.ts:185-198`, `server-approval-processing.ts:204-233`. | 동시 클릭에 따른 중복 전이·휴가·물품 후속처리 | status/current approver/revision CAS와 processing 조건부 선점 |

## P2 — 기능 완성도·운영 품질

| ID | 메뉴·영역 | 발견 | 근거 | 개선 |
|---|---|---|---|---|
| FIN-P2-01 | 재무회계 | 경비청구·지출결의가 화면 state에만 추가되어 새로고침 시 사라짐 | `재무회계.tsx:1218-1227,1316-1324` | 영속화·결재 연계 전에는 메뉴를 준비 중 상태로 제한 |
| FIN-P2-02 | 재무회계 | 급여연동·세무신고 목록은 초기 빈 배열, 월마감은 저장/잠금 없이 안내만, 은행동기화는 updated_at만 갱신 | `재무회계.tsx:66-68,299-336,1357-1435` | 실제 서버 연동 전 실행 버튼 비활성화 |
| FIN-P2-03 | 재무회계 | 자산 내용연수 0/음수/NaN 검증 없이 정액법 나눗셈; 시산표가 같은 amount를 차·대변에 더함 | `재무회계.tsx:252-254,339-357,959` | 입력 범위 검증과 복수 라인 분개·서버 합계 검증 |
| CAL-P2-01 | 공유캘린더 | 게시판 일정 객체에 day가 없어 달력 셀이 렌더하지 않음 | `공유캘린더.tsx:93-112,244-256` | 게시판 일정 → CalendarEvent(start/end) 변환 |
| MOBILE-P2-01 | 모바일 채팅 | 목록의 조직도 탭이 실제 탐색 대신 “곧 추가” placeholder만 표시 | `app/main/모바일/채팅/채팅목록.tsx:1003` | 조직도 탐색을 구현하거나 탭을 숨기고 준비 중 표시 |
| MOBILE-P2-02 | 모바일 조직도 | company를 `'전체'`로 고정하고 hook이 그 경우 회사 필터를 하지 않음 | `모바일/추가기능/조직도.tsx:23-24`, `data-hooks.ts:94-145` | 세션 company/company_id를 서버·화면 모두에서 강제 |
| OPS-P2-01 | 오프라인/운영 | 로그아웃 후 오프라인 큐·Blob DB가 계정 구분 없이 남아 자동 flush될 수 있음. rate limit은 D1 장애 시 허용(fail-open) | `lib/client-logout.ts:101-118`, `offline-queue-storage.ts:24-28`, `PwaBootstrap.tsx:218-289`, `rate-limit.ts:109-172` | 사용자 namespace·로그아웃 삭제, 민감 API rate limit fail-closed |

## 메뉴별 상태 요약

| 메뉴 | 주요 결과 | 우선 조치 |
|---|---|---|
| 내정보 | 기본 진입·출퇴근·연차 타일 브라우저 통과. 세션 무효화·오프라인 큐는 공통 위험 | 서버 세션 폐기, 계정별 오프라인 저장소 |
| 추가기능 | 모바일 조직도 회사 경계 누락 가능 | 서버 회사 범위 강제 |
| 채팅 | 기존 비참여 방 목록 필터는 반영됐으나 쓰기·공지·room mutation 우회가 더 위험 | 공지 write 및 room type/upsert 차단 |
| 게시판 | UI 권한만으로는 부족, 공지 broadcast와 게시글·투표 mutation 우회 | board type별 서버 권한·소유자 정책 |
| 공유캘린더 | 근무표 공개 CRUD, ICS 권한·폐기 부재, 게시판 일정 미표시 | 서버 ACL·revocable token·이벤트 변환 |
| 전자결재 | 위임/상태 직접변경·동시성 | mutation 제거, 상태 전이 API·CAS |
| 인사관리 | PII, 평가·징계·발령 데이터가 공개 정책과 결합 | 컬럼 projection·HR 전용 write |
| 재고관리 | 전용 API와 공용 정책 양쪽에서 범위·권한 우회, 입고 트랜잭션 부족 | 공통 scope helper, 서버 플래그·트랜잭션 |
| 관리자 | 강제 로그아웃이 서버 토큰을 폐기하지 못함 | session version/iat 검증 |
| 재무회계 | 권한 우회와 비영속/가짜 완료 UI·계산 검증 문제 | 공개 CRUD 차단 후 실제 서버 워크플로 도입 |

## 권장 수정 계획

### 0~24시간: 유출·변조 차단

1. `/api/d1/mutate`에서 `PUBLIC` write를 전면 거부하고, `POLICY_REGISTRY`의 자동 `PUBLIC_ALL` 부여를 제거한다.
2. `staff_members` 공용 조회에서 민감 컬럼을 서버에서 제거하고 `select('*')`를 없앤다.
3. `approvals`, `approval_delegation`, `leave_requests`, `payroll_records`, `board_posts`, `messages`, `chat_rooms`, `nurse_schedules`, 재무·의료·금융 테이블의 공용 write를 차단한다.
4. 공지방 write, 공지 게시물 broadcast, 채팅방 notice 전환·fixed ID upsert를 시스템 관리자 전용으로 제한한다.

### 1주: 서버 인가와 무결성 복구

1. 재고·채팅·파일·실시간에 공통 `assertScope`/`assertMembership`을 적용한다.
2. 결재·휴가·급여·발주/입고를 전용 서비스와 조건부 상태 전이로 통일한다.
3. 세션 version, `force_logout_at`, 재직 상태를 모든 민감 API에서 검증한다.
4. ICS token revoke/rotate, R2 객체 ACL, 전사 API SSRF 방어를 도입한다.

### 2주: 회귀 방지와 운영 확인

1. 역할(일반 직원/부서 관리자/HR/MSO/시스템 관리자/비참여자) × 테이블 × CRUD API 테스트를 자동화한다.
2. 공지방 쓰기, 임의 room ID PATCH/POST, approval delegation, payroll/leave insert, 재고 타회사 ID의 403 테스트를 추가한다.
3. 최근 API 감사 로그, 공지·푸시·채팅방 변경, 대량 staff 조회, D1 mutation 삭제·수정 내역을 조사한다.
4. 재무회계의 비영속 기능은 실제 영속·승인·마감 구현 전까지 운영 메뉴에서 숨긴다.

## 검증 재실행 기준

수정 뒤에는 다음을 모두 통과해야 한다.

- 일반 사용자의 민감 테이블 query/mutate가 403 또는 최소 projection을 반환한다.
- 일반 사용자의 공지방 메시지·공지 broadcast·notice type 전환이 403이다.
- 결재 위임/상태, 휴가 승인/일수, 급여 금액의 공용 D1 변경이 403이다.
- 타 회사·부서 item/PO를 사용한 모든 재고 API가 403이다.
- 비참여 room의 REST·WebSocket/SSE·파일 객체 접근이 403이다.
- 기존 PC·모바일 E2E와 a11y 전체를 CI에서 브라우저 설치 후 완주한다.

# 8차 전수조사 — 근본원인 축 (V13 원장 정규화)

입력 308건 / 검증 404 verdict(V01~V12) 조인 완료. 판정 누락 0건, 고아 verdict 0건.
최종: CONFIRMED 277 · PLAUSIBLE 7 · REFUTED 24 / P0 31 · P1 106 · P2 171 / 병합 41건 → 대표 267건

## 축 요약표

| 축 | 제목 | 총건 | CONF | P0 | P1 | P2 | 수정 묶음 | 난이도 | 회귀위험 |
|---|---|---|---|---|---|---|---|---|---|
| S1 | D1 API 게이트웨이의 판정 != 실행 · fail-open (mutate/query/realtime/rate-limit) | 12 | 12 | 4 | 3 | 5 | FB1 D1 게이트웨이 하드닝 | M | 높음 |
| S2 | 정책 레지스트리 과다개방(PUBLIC/AUTHENTICATED) — 소유권·회사 스코프 미검사 | 18 | 17 | 6 | 3 | 9 | FB2 정책 레지스트리 정합 일괄 | M | 높음 |
| S3 | 정책 레지스트리 누락·과소개방 → 권한 보유자에게 조용한 기능 사멸 | 10 | 10 | 0 | 7 | 3 | FB2 정책 레지스트리 정합 일괄 | M | 높음 |
| S4 | 세션 스냅샷·권한 압축으로 서버측 권한 판정 붕괴 | 14 | 12 | 0 | 4 | 10 | FB3 세션 권한 복원 | S | 중 |
| S5 | 스키마 드리프트 — 실 D1 에 없는 컬럼·테이블을 코드가 참조 | 21 | 19 | 6 | 9 | 6 | FB4 스키마 정합 일괄 | L | 중 |
| S6 | 크론·트리거 배선 파손 및 서버에서의 클라이언트 전용 모듈 오용 | 17 | 14 | 2 | 5 | 10 | FB5 크론 배선 | S | 낮음 |
| S7 | 시각 표현 이중화 — created_at 형식 혼재 + UTC/KST 경계 오독 | 25 | 22 | 0 | 8 | 17 | FB6 시각 정규화 | M | 높음 |
| S8 | 연차 SSOT 단절 — leave_ledger 원장 vs staff_members 미러 이중 진실 | 22 | 19 | 2 | 10 | 10 | FB7 연차 SSOT 통일 | L | 높음 |
| S9 | 상태전이 무결성 붕괴 — 결재·재고·구매의 권한 가드·원자성·CAS 부재 | 36 | 33 | 5 | 21 | 10 | FB8 상태전이 무결성 | L | 높음 |
| S10 | 실패의 조용한 성공 보고 — 백업·복원·감사로그·오프라인 큐 | 29 | 28 | 2 | 14 | 13 | FB9 실패 가시화(백업·감사·큐) | M | 중 |
| S11 | 클라이언트 신뢰 경계 붕괴 — 계산·검증·PII 보호를 브라우저가 수행 | 16 | 15 | 3 | 4 | 9 | FB10 서버 권위 이전 | L | 높음 |
| S12 | 운영 스크립트·저장소 위생 — 구 DB 조준·실행 게이트 누락·자격증명/실명 PII 커밋 | 30 | 28 | 1 | 7 | 22 | FB11 스크립트·저장소 위생 | S | 낮음 |
| S13 | 중복 구현 drift — SSOT 부재로 PC/모바일·라우트 사본이 갈라짐 | 37 | 32 | 0 | 11 | 26 | FB12 중복 통합 | L | 중 |
| S14 | 죽은 코드·사문 설정·미실행 품질 게이트 | 21 | 16 | 0 | 0 | 21 | FB13 정리·게이트 복구 | S | 낮음 |

## 수정 묶음 (한 커밋 단위)

| 묶음 | 축 | 대상(CONFIRMED 대표) | P0 | 난이도 | 회귀위험 | 선행조건 |
|---|---|---|---|---|---|---|
| FB3 세션 권한 복원 | S4 | 11 | 0 | S | 중 | 없음 — 최우선 착수 가능 |
| FB5 크론 배선 | S6 | 12 | 2 | S | 낮음 | wrangler.toml [triggers] 수정 + 재배포 |
| FB2 정책 레지스트리 정합 일괄 | S3,S2 | 20 | 3 | M | 높음 | FB3(세션 권한 복원) 선행 |
| FB1 D1 게이트웨이 하드닝 | S1 | 11 | 4 | M | 높음 | FB13(정책 회귀 e2e 복구) 선행 권장 |
| FB4 스키마 정합 일괄 | S5 | 16 | 3 | L | 중 | 운영 D1 실 introspection 1회 필요(로컬 덤프만으로는 확정 불가 항목 존재) |
| FB8 상태전이 무결성 | S9 | 26 | 3 | L | 높음 | FB1 선행 — 컬럼 가드가 mutate 판정 경로에 의존 |
| FB7 연차 SSOT 통일 | S8 | 18 | 1 | L | 높음 | FB2(leave_ledger 정책 등록)·FB4(부재 컬럼) 선행 |
| FB9 실패 가시화(백업·감사·큐) | S10 | 24 | 2 | M | 중 | 없음 |
| FB10 서버 권위 이전 | S11 | 14 | 3 | L | 높음 | FB3·FB1 선행 |
| FB6 시각 정규화 | S7 | 19 | 0 | M | 높음 | 기존 행 형식 혼재 — 양형식 허용 리더 또는 마이그레이션 선행 |
| FB11 스크립트·저장소 위생 | S12 | 23 | 1 | S | 낮음 | 노출 자격증명 회전·폐기가 코드 수정보다 먼저 |
| FB13 정리·게이트 복구 | S14 | 15 | 0 | S | 낮음 | 없음 — 독립 착수 가능 |
| FB12 중복 통합 | S13 | 28 | 0 | L | 중 | FB4·FB6 이후 — 통합 대상이 아직 이동 중이면 재작업 |

권장 착수 순서: 1) FB3 → 2) FB5 → 3) FB2 → 4) FB1 → 5) FB4 → 6) FB8 → 7) FB7 → 8) FB9 → 9) FB10 → 10) FB6 → 11) FB11 → 12) FB13 → 13) FB12

---

## S1 — D1 API 게이트웨이의 판정 != 실행 · fail-open (mutate/query/realtime/rate-limit)

수정 묶음: **FB1 D1 게이트웨이 하드닝** (난이도 M · 회귀위험 높음 · 선행 FB13(정책 회귀 e2e 복구) 선행 권장)

소속 12건 (CONFIRMED 12 / PLAUSIBLE 0 / REFUTED 0)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D01-016 | CONFIRMED | P0 | loadPolicyRowsForMutation 의 예외/미허용 폴백이 where∪set 합성행으로 되돌아가 7차 R1(판정≠실행) 재현 경로가 남아 있음 |  |
| D01-D03 | CONFIRMED | P0 | [7차 A3-11 · 버킷B] 마감보고 부모(daily_closures)만 회사 스코프로 닫히고, 환자명·수납금액을 담은 자식 daily_closure_items 는 AUTHENTICATED×4 로 |  |
| D01-D05 | CONFIRMED | P0 | [7차 A12-02 · 버킷B] staff_members 비밀번호 해시 prefix oracle 은 where/order/orFilters 전면 차단으로 닫힘 → CLOSED |  |
| D06-001 | CONFIRMED | P0 | /api/realtime/tail 이 임의 컬럼 등가필터를 허용해 staff_members 민감컬럼 존재여부 오라클이 된다 |  |
| D01-011 | CONFIRMED | P1 | rate-limit 이 D1 오류·미바인딩 시 전부 fail-open (allowed:true) — 로그인 잠금·API 총량 제한이 조용히 무력화됨 |  |
| D01-D04 | CONFIRMED | P1 | [7차 A12-01 · 버킷B] mutate 판정≠실행 핵심 공격(set 병합 + WHERE 전량)은 닫혔으나 SELECT↔UPDATE TOCTOU 창과 예외 폴백(합성행)이 남음 → PARTIAL | →D01-016 |
| D10-014 | CONFIRMED | P1 | [crossover] OP체크 병동 메시지 insert 가 .select() 없이 실행 — mutate 후처리(RETURNING 기반)가 완전 스킵되어 방 미리보기·푸시 적재 누락 |  |
| D01-014 | CONFIRMED | P2 | /api/admin/verify-unlock 의 레이트리밋 키에 클라이언트가 조작 가능한 x-forwarded-for 가 포함돼 잠금을 헤더 회전으로 우회 가능 |  |
| D01-017 | CONFIRMED | P2 | /api/d1/query 의 count:true 가 행 단위 정책 테이블에서 MAX_LIMIT 1000 캡 후 세어 1000행 초과 시 과소 집계 |  |
| D06-011 | CONFIRMED | P2 | read-cursors 라우트는 D1 바인딩이 없으면 멤버십 필터를 통째로 건너뛴다 |  |
| D06-012 | CONFIRMED | P2 | typing GET 은 세션 userId 가 빈 문자열이면 멤버십 검사를 건너뛴다 |  |
| D10-002 | CONFIRMED | P2 | d1/mutate 의 messages 후처리가 RETURNING 에 created_at 이 없으면 ISO 를 chat_rooms.last_message_at 에 기록 — 시스템 메시지 경로에서 형식 |  |

---

## S2 — 정책 레지스트리 과다개방(PUBLIC/AUTHENTICATED) — 소유권·회사 스코프 미검사

수정 묶음: **FB2 정책 레지스트리 정합 일괄** (난이도 M · 회귀위험 높음 · 선행 FB3(세션 권한 복원) 선행 — 압축된 권한으로 재분류하면 오차단이 생긴다)

소속 18건 (CONFIRMED 17 / PLAUSIBLE 1 / REFUTED 0)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D03-D09 | CONFIRMED | P0 | [7차 A7-04] 징계·평가 PUBLIC_ALL — 징계는 닫힘, 평가는 select/insert AUTHENTICATED 로 열람·작성 잔존 |  |
| D06-017 | CONFIRMED | P0 | [A4-01 델타] 채팅방 UPSERT 침투 — 미수정(OPEN). 임의 사용자가 기존 방을 통째로 탈취할 수 있다 |  |
| D07-010 | CONFIRMED | P0 | board_posts PUBLIC_ALL — 로그인 사용자는 누구나 타인 게시글(공지 포함) 수정·삭제 가능 |  |
| D07-023 | CONFIRMED | P0 | [델타 A3-33] OP체크 수술일정 board_posts 회사필터 없음 + PUBLIC_ALL — 미수정 | →D07-010 |
| D07-024 | CONFIRMED | P0 | [델타 A5-01] board_posts/board_post_reads PUBLIC_ALL — 미수정 | →D07-010 |
| D07-025 | CONFIRMED | P0 | [델타 A5-02] 서버 보드 권한 판정 없음(canAccessBoard 클라 전용) — 미수정 | →D07-010 |
| D06-003 | CONFIRMED | P1 | room_read_cursors·message_reactions 정책이 AUTHENTICATED 라 타인 user_id 로 위조 쓰기/삭제가 가능하다 |  |
| D06-005 | CONFIRMED | P1 | quick-reply 로 보낸 메시지는 푸시가 전혀 나가지 않는다(쿠키 없는 서버간 fetch + 큐 미적재) |  |
| D06-007 | CONFIRMED | P1 | RealtimeHub 가 클라이언트발 signal 프레임을 그대로 전 구독자에게 중계한다 |  |
| D01-010 | CONFIRMED | P2 | /api/storage/object 가 chat/ 경로에만 ACL 을 적용해, 인증만 하면 결재 첨부·서류제출·계약서 등 버킷 내 임의 객체를 열람 가능 |  |
| D05-013 | CONFIRMED | P2 | /api/approvals/upload 는 MIME 검증이 전혀 없고 /api/approval/upload 는 'application/' 접두어를 통째로 허용해 사실상 모든 파일이 R2 에 올라간다 |  |
| D06-004 | PLAUSIBLE | P2 | quick-reply 의 공지방 판정이 하드코딩 UUID 라 다른 notice 타입 방에는 비관리자가 글을 쓸 수 있다 |  |
| D06-006 | CONFIRMED | P2 | PC 첨부 업로드가 room_id 를 보내지 않아 업로드 라우트의 방 멤버십 검증이 항상 건너뛰어진다 |  |
| D06-008 | CONFIRMED | P2 | WS 구독·타이핑에 방 멤버십 검증이 없어 비멤버가 임의 방의 활동을 관측하고 입력중 표시를 위조한다 |  |
| D07-009 | CONFIRMED | P2 | stock-update: 로그 없는 수량 변경 라이브 경로 + 음수 minAllowed 허용 — 호출자 0 인데 열려 있음 |  |
| D07-018 | CONFIRMED | P2 | board_post_reads PUBLIC_ALL — 타인 명의 읽음 기록 위조·삭제 가능 | →D07-010 |
| D07-021 | CONFIRMED | P2 | stock-post: 이관출고/이관입고 타입을 단독 전표로 허용 — 이관 이력 없는 반쪽 이관 로그 위조 가능 |  |
| D12-010 | CONFIRMED | P2 | 같은 결재 첨부의 두 계약이 다른 보안 정책 — approval(presign)은 실행파일 MIME 차단, approvals(multipart)는 MIME 제한 전무 | →D05-013 |

---

## S3 — 정책 레지스트리 누락·과소개방 → 권한 보유자에게 조용한 기능 사멸

수정 묶음: **FB2 정책 레지스트리 정합 일괄** (난이도 M · 회귀위험 높음 · 선행 FB3(세션 권한 복원) 선행)

소속 10건 (CONFIRMED 10 / PLAUSIBLE 0 / REFUTED 0)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D01-001 | CONFIRMED | P1 | leave_ledger 가 POLICY_REGISTRY 미등록 → /api/d1/query 가 admin 포함 전원에게 403, 연차원장 계열 6개 화면 전면 불능 |  |
| D01-D01 | CONFIRMED | P1 | [7차 A3-01 · 버킷B] 인계노트·퇴원심사는 AUTHENTICATED 로 복구, 입금실시간조회는 MANAGE_COMPANY 라 권한 보유 일반직원 db.from() 경로가 여전히 사멸 → PA |  |
| D01-D06 | CONFIRMED | P1 | [7차 A12-03 · 버킷B] ADDITIONAL_PUBLIC_TABLES 루프의 주석-코드 모순은 해소·다수 테이블은 명시 등록으로 구제됐으나, 목록 이름과 동작의 정반대 및 비관리자 실사용 테 |  |
| D03-D11 | CONFIRMED | P1 | [7차 A7-06] leave_ledger 미등록 테이블 조회 403 — 미수정(정책 레지스트리에 여전히 부재) | →D01-001 |
| D07-011 | CONFIRMED | P1 | 별표훅: PolicyDenied 메시지가 폴백 판별식과 불일치 — 별표 토글이 LS 폴백 없이 완전 실패(에러 토스트+롤백) |  |
| D07-026 | CONFIRMED | P1 | [델타 A5-03] notice-broadcast 게이트 절반이 항상 false — 미수정(단 영향은 과잉차단) |  |
| D08-007 | CONFIRMED | P1 | 비관리자(인사 권한자)의 감사 기록이 403 으로 조용히 전부 유실된다 |  |
| D01-019 | CONFIRMED | P2 | /api/consultation/analyze 는 세션만 검사해 extra_수술상담 권한 없는 사용자도 Gemini 분석을 호출 가능 (transcribe 와 게이트 불일치) |  |
| D01-021 | CONFIRMED | P2 | /api/payments/virtual-account-webhook 이 여전히 query string 토큰 폴백을 허용 (경고만 출력) |  |
| D01-D02 | CONFIRMED | P2 | [7차 A3-04 · 버킷A] /api/consultation/analyze 는 여전히 세션만 검사 — extra_수술상담 권한 미보유자도 상담 분석 호출 가능 → OPEN | →D01-019 |

---

## S4 — 세션 스냅샷·권한 압축으로 서버측 권한 판정 붕괴

수정 묶음: **FB3 세션 권한 복원** (난이도 S · 회귀위험 중 · 선행 없음 — 최우선 착수 가능)

소속 14건 (CONFIRMED 12 / PLAUSIBLE 0 / REFUTED 2)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D01-002 | CONFIRMED | P1 | master-login 의 '해당 사번 직원 없음' 분기가 recordFailedAttempt 를 호출하지 않아 MASTER/ADMIN 자격증명이 무제한 대입 가능 |  |
| D01-004 | CONFIRMED | P1 | 세션 토큰 권한 압축(8키+menu_*)으로 finance_* 가 소실 → erp_can_manage_finance 가 항상 false, FINANCE_SCOPE 3테이블이 재무 담당자에게 전면 차 |  |
| D01-018 | CONFIRMED | P1 | erpStaffId 가 UUID 정규식을 요구해, 비UUID staff id 계정에서 SELF_ONLY·SELF_OR_SAME_COMPANY·APPROVAL_SCOPE 판정이 항상 실패 |  |
| D12-002 | CONFIRMED | P1 | userId() SSOT 의 시스템마스터('9999') 분기가 13개 위성 사본에는 없음 — 마스터 세션(id:null)이 13개 API 에서 401 |  |
| D01-005 | CONFIRMED | P2 | 권한 압축 때문에 'mypage_수정 === false' 명시 차단이 서버에서 undefined 로 읽혀 fail-open (프로필 수정 차단 우회) | →D01-004 |
| D01-006 | CONFIRMED | P2 | 세션 스냅샷에 존재하지 않는 session.user.is_master / is_admin 을 관리자 판정에 사용하는 3곳이 항상 false 로 접힘 |  |
| D01-007 | CONFIRMED | P2 | env ADMIN 폴백 로그인이 id:null 세션을 발급 → userId() 가 null 이라 /api/d1/query·mutate 가 전부 401 (그리고 :254-321 특권 분기는 도달 불가 |  |
| D01-013 | REFUTED | P2 | work-shifts 두 라우트가 세션 토큰에서 제거되는 hr_근무형태 키로 권한을 판정 → 근무형태 담당자가 401 |  |
| D01-015 | CONFIRMED | P2 | middleware 가 force-logout 을 검증하지 않고, 토큰에 force_logout_at 이 없어 verifySessionTokenWithSecret 의 강제 로그아웃 검사도 사문 |  |
| D01-022 | REFUTED | P2 | /api/notifications/chat-push-flush 가 임의 인증 사용자에게 전역 푸시 큐 드레인을 허용 (의도적이나 남용 여지) |  |
| D08-015 | CONFIRMED | P2 | 시스템마스터 화면 게이트와 서버 게이트가 달라 9999 가 아닌 system_master 권한자는 빈 화면 + 전 API 401 |  |
| D08-023 | CONFIRMED | P2 | crossover: env 기반 관리자/마스터 로그인은 세션 id 가 null 이라 data-reset·staff-permission·force-logout 이 401 |  |
| D12-013 | CONFIRMED | P2 | 모바일 HR 관리자 게이트(mso/menu_인사관리/관리자/매니저) 인라인 4중 복제 — 정본 canMutateTeamAbnormal 존재 |  |
| D12-017 | CONFIRMED | P2 | master-login route 내부 관리자/마스터 사용자 객체 조립 3중 반복 — 인증 경로 수정 시 3곳 동시 수정 필요 |  |

---

## S5 — 스키마 드리프트 — 실 D1 에 없는 컬럼·테이블을 코드가 참조

수정 묶음: **FB4 스키마 정합 일괄** (난이도 L · 회귀위험 중 · 선행 운영 D1 실 introspection 1회 필요(로컬 덤프만으로는 확정 불가 항목 존재))

소속 21건 (CONFIRMED 19 / PLAUSIBLE 1 / REFUTED 1)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D03-004 | CONFIRMED | P0 | 급여 워크센터 직원 마스터 SELECT 가 staff_members 에 없는 agreed_* 컬럼 참조 → 직원 0명 | →D04-007 |
| D03-027 | CONFIRMED | P0 | 내정보(ESS) 변경 신규 라우트의 payload 계약 불일치 — 클라는 객체, 서버는 문자열만 수용 → 상시 400 |  |
| D03-D01 | CONFIRMED | P0 | [7차 A2-01] 내정보 저장 항상 실패(audit_logs ADMIN_ONLY) — 라우트 신설됐으나 계약 불일치로 여전히 실패 | →D03-027 |
| D04-005 | CONFIRMED | P0 | 근로계약서 '서명완료' UPDATE가 미존재 컬럼 2종을 포함 — 모바일·PC 서명 완료 처리 전면 실패 (b5 스키마갭 실영향 확정) |  |
| D04-007 | CONFIRMED | P0 | payroll-fetch 직원 마스터 SELECT에 staff_members 미존재 컬럼(agreed_* 2종) — 급여 워크센터 직원 0명 (b5 #3 실영향 확정) |  |
| D04-101 | CONFIRMED | P0 | [7차 A8-01 델타] 급여 워크센터 13모듈 빈화면(agreed_* 미존재 컬럼 select) — 미수정 확정 | →D04-007 |
| D03-002 | CONFIRMED | P1 | absent-auto-create 가 휴가자 제외 조건을 leave_ledger 의 존재하지 않는 컬럼(status/start_date/end_date)으로 조회 |  |
| D03-005 | CONFIRMED | P1 | 모바일 증명서 발급이 staff_members 레거시 11컬럼 셀렉트로 전면 불능 |  |
| D03-006 | CONFIRMED | P1 | org_teams.applicable_shifts 부재 컬럼에 INSERT/UPDATE — 팀 생성·수정 저장 실패 |  |
| D03-014 | CONFIRMED | P1 | 오늘 출근자 수 위젯이 attendances.date/check_in(부재 컬럼) 조회로 항상 0 |  |
| D03-018 | CONFIRMED | P1 | 문서보관함 staff_members 셀렉트에 레거시 7+컬럼 포함 — 직원 컨텍스트 조용 소실 |  |
| D04-006 | CONFIRMED | P1 | 복지규정 저장이 미존재 테이블(company_welfare_policies) upsert — 실패를 '(로컬 임시저장)'으로 위장, 실제로는 아무 데도 저장 안 됨 |  |
| D04-103 | PLAUSIBLE | P1 | [7차 A8-03 델타] 전자서명 document_repository 선저장 403 — 정책은 수정됐으나 동일 플로우가 미존재 컬럼으로 여전히 실패 | →D04-005 |
| D07-012 | CONFIRMED | P1 | 공유캘린더 게시판 일정 이중 사문: category 컬럼 부재 + 쿼리를 고쳐도 day 필드가 없어 렌더 불가 |  |
| D07-019 | CONFIRMED | P1 | OP체크 소모품 차감 사문화의 실영향 확정 — '0종 차감' 성공 토스트 + 부활시켜도 잘못된 계층(로그·CAS·정책 부재) |  |
| D03-012 | CONFIRMED | P2 | 연차 자동발생이 isGroupAccount 판정에 필요한 컬럼을 SELECT 하지 않아 단체계정 제외가 무효 |  |
| D03-013 | REFUTED | P2 | staff-shift-resolver 1단계(근태 기반 shift_id 해석)가 부재 컬럼 참조로 상시 실패 |  |
| D04-015 | CONFIRMED | P2 | 복지 요약 위젯 3종이 미존재 컬럼 셀렉트로 상시 에러 (b5 #12~#14 실코드 확정) |  |
| D04-016 | CONFIRMED | P2 | DocsWorkcenter KPI·템플릿 요약이 미존재 컬럼 셀렉트 — 카운트 전면 0 / 가짜 폴백 템플릿을 실데이터처럼 표시 (b5 #7·#8 확정) |  |
| D04-021 | CONFIRMED | P2 | payroll-record-upsert의 에러 판별이 Postgres 전용 코드(22001/42P10/character varying) 잔존 — D1 환경에서 반쪽 사문 |  |
| D09-012 | CONFIRMED | P2 | 모바일 근태이상 resolveTeamAbnormalForStaff — 한글 status 테이블에 영문 status 필터 (현재는 미호출 dead) |  |

---

## S6 — 크론·트리거 배선 파손 및 서버에서의 클라이언트 전용 모듈 오용

수정 묶음: **FB5 크론 배선** (난이도 S · 회귀위험 낮음 · 선행 wrangler.toml [triggers] 수정 + 재배포)

소속 17건 (CONFIRMED 14 / PLAUSIBLE 1 / REFUTED 2)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D02-012 | CONFIRMED | P0 | [7차 A1-03] absent-auto-create 크론 여전히 영구 미실행 — wrangler [triggers] 에 '30 15 * * *' 부재, 워커 매핑만 잔존 |  |
| D03-001 | CONFIRMED | P0 | absent-auto-create 크론이 서버에서 클라이언트 전용 db-client(상대경로 fetch)를 사용해 전면 불능 |  |
| D01-023 | CONFIRMED | P1 | crossover: absent-auto-create 크론이 wrangler [triggers] 에 없어 영구 미실행 (담당 밖 — B6-01 과 동일) | →D02-012 |
| D02-002 | CONFIRMED | P1 | 미열람 재알림(repush)이 SQL LIMIT 50 을 적격성 필터 이전에 적용 — 미열람 채팅 알림이 창을 점유하면 중요 알림이 영구 굶주림 |  |
| D02-004 | CONFIRMED | P1 | WebPush TTL 60초 — 기기가 1분만 오프라인이어도 푸시가 푸시서비스에서 폐기, 재알림은 시도 1회 제한이라 영구 미도달 |  |
| D08-014 | CONFIRMED | P1 | 시스템마스터 운영 패널의 크론 목록이 실제 트리거와 불일치 — todo-reminders 는 아예 실행되지 않는데 '매시간'으로 표시 |  |
| D08-022 | CONFIRMED | P1 | crossover: wrangler [triggers] 에 '30 15 * * *' 슬롯이 없어 absent-auto-create 크론이 영구 미실행 | →D02-012 |
| D02-005 | CONFIRMED | P2 | 데드레터된 chat_push_jobs 는 어떤 정리 경로에도 안 걸려 영구 누적 (retention 은 processed_at IS NOT NULL 만 삭제) |  |
| D02-007 | CONFIRMED | P2 | 연차공지 중복차단 키가 경로마다 달라(크론=targetDate, 즉시=startDate) meta 갱신 실패 시 다음날 이중 공지 가능 |  |
| D02-008 | CONFIRMED | P2 | sendAdminNotifications 가 부서 기준으로만 수신자를 뽑고 status='재직' 필터가 없어 퇴사자에게도 관리자 알림 생성 |  |
| D02-010 | CONFIRMED | P2 | 크론 18개 라우트 전부 CRON_SECRET 을 비상수시간 문자열 비교(!==)로 검증 |  |
| D02-011 | PLAUSIBLE | P2 | [담당 밖 — realtime] 워커 WS 인증이 SESSION_SECRET 미설정 시 dev 기본 시크릿('dev-only-session-secret-change-this')으로 토큰 검증 |  |
| D02-013 | REFUTED | P2 | [7차 A1-01] mutate 라우트 notifications INSERT 푸시 팬아웃 구현 확인 — 수정 완료 |  |
| D02-014 | CONFIRMED | P2 | [7차 A1-02] POST /api/notifications 여전히 푸시·실시간 시그널 모두 미발송 — 미수정 |  |
| D04-020 | CONFIRMED | P2 | 수습/계약 만료 알림 — 만료 7일 전 '정확히 그날' 크론이 돌 때만 발송 (미실행·장애 시 영구 누락) |  |
| D06-018 | REFUTED | P2 | [A4-41 델타] 푸시 큐 드레인 라이브락 — 수정 완료(CLOSED) |  |
| D10-015 | CONFIRMED | P2 | [crossover] auto-report·todo-reminders·inapp-notifications 크론 라우트가 CRON_ROUTES_BY_SCHEDULE 에 미등록 — 스케줄 실행 경로 부 |  |

---

## S7 — 시각 표현 이중화 — created_at 형식 혼재 + UTC/KST 경계 오독

수정 묶음: **FB6 시각 정규화** (난이도 M · 회귀위험 높음 · 선행 기존 행 형식 혼재 — 양형식 허용 리더 또는 마이그레이션 선행)

소속 25건 (CONFIRMED 22 / PLAUSIBLE 0 / REFUTED 3)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D02-001 | CONFIRMED | P1 | 인앱 보강 잡 3종(근태·급여·금지어)의 26h lookback 이 created_at 형식 혼재로 무력화 — 하루 중 KST 09:00~12:00 발생분만 스캔됨 |  |
| D06-002 | CONFIRMED | P1 | 공지봇 크론이 messages.created_at 에 ISO 형식을 넣어 tail 의 max(created_at) 이 하루 종일 고착된다 | →D10-001 |
| D08-012 | CONFIRMED | P1 | data-reset 감사 기록이 created_at 을 빼먹어 UTC 공백형식으로 저장되고 목록에서 밀린다 |  |
| D10-001 | CONFIRMED | P1 | 생일·연차공지 크론이 messages/chat_rooms 에 ISO created_at 을 삽입 — ba80925a 가 고친 형식혼재를 다른 사이트가 재생산, 발생일엔 채팅 변경감지가 UTC 하루  |  |
| D10-003 | CONFIRMED | P1 | 결재 위임 기간 검증이 UTC '오늘' 기준 — 위임 만료 다음날 KST 00:00~08:59 에도 대리결재 허용 |  |
| D10-004 | CONFIRMED | P1 | approvals.created_at(UTC 공백형)을 표시 경로 3곳이 KST 로 오독 — KST 00:00~09:00 기안 문서의 기안일이 전날로 표시(인쇄물·보관문서 포함) |  |
| D10-005 | CONFIRMED | P1 | 문서번호 일련 카운트 창이 KST 자정 ISO 경계 vs 공백형 컬럼의 사전순 비교로 UTC 날짜 창으로 왜곡 — 오전 기안 문서 누락 집계로 문서번호 중복 가능 |  |
| D10-006 | CONFIRMED | P1 | 모바일 채팅 '할 일 등록' task_date 가 UTC 날짜 — KST 00:00~08:59 등록 시 어제 날짜의 할 일로 저장 |  |
| D02-006 | CONFIRMED | P2 | 공지봇 크론(생일·연차공지)이 messages 테이블에 ISO 형식 created_at 을 삽입 — '전 행 공백형식' 전제를 깨고 당일 정렬 역전 유발 | →D10-001 |
| D03-020 | CONFIRMED | P2 | decideUncheckedOutStatus 의 18:00 기준이 서버(UTC) 시간대 — KST 와 9시간 어긋난 조퇴/결근 판정 |  |
| D06-016 | CONFIRMED | P2 | crossover: notifications 읽음 처리에 SQL 공백 포맷 시각을 넣어 컬럼 형식이 다시 섞인다 |  |
| D08-013 | CONFIRMED | P2 | 감사 요약의 '오늘'이 워커 UTC 자정 기준이라 KST 00~09시 로그가 빠진다 |  |
| D08-019 | CONFIRMED | P2 | 감사로그 뷰어의 '새벽 접근' 판정이 브라우저 로컬 타임존과 비ISO 문자열 파싱에 의존한다 |  |
| D08-028 | REFUTED | P2 | [7차 A11-02] audit_logs 무조건 전량 삭제·무기록은 닫혔다 — system_logs 타입에 한정되고 삭제 후 감사 기록을 남긴다 |  |
| D10-007 | CONFIRMED | P2 | 관리자 감사 요약 '오늘 로그' 창이 UTC 자정 기준 — KST 00:00~09:00 활동이 '오늘' 집계에서 빠지고 창이 9시간 밀림 | →D08-013 |
| D10-008 | CONFIRMED | P2 | auto-report 크론의 보고서 대상 월이 UTC 기준 — KST 1일 00:00~08:59 실행 시 전월 period 로 산출 |  |
| D10-009 | CONFIRMED | P2 | 공백형('YYYY-MM-DD HH:MM:SS') 타임스탬프 해석기가 3계열로 상충 — UTC(+00:00)/KST(+09:00)/로컬(무접미) 해석이 파일마다 다름 |  |
| D10-010 | REFUTED | P2 | updated_at 헬퍼 이중화: withUpdatedAt 은 ISO, nowSqlite 는 CURRENT_TIMESTAMP(공백형) — 같은 컬럼에 두 형식 주입 |  |
| D10-011 | CONFIRMED | P2 | 날짜 유틸 4종 KST 처리 방식 상이 + toDateKey≡formatLocalDateKey 글자단위 중복 잔존 (b3 베이스라인 재확인) |  |
| D10-012 | REFUTED | P2 | unified-leave-ledger 의 occurredOn 폴백이 created_at(UTC 공백형)의 날짜부를 그대로 사용 — KST 새벽 신청 건이 전날 발생일로 귀속 |  |
| D10-013 | CONFIRMED | P2 | 24h 백업 폴더키에 KST 날짜와 UTC 시각 문자열이 병기 — KST 00:00 크론에서 두 날짜가 항상 하루 어긋남 |  |
| D10-016 | CONFIRMED | P2 | Pass B: 7차 P0 42건 중 D10(시간대·날짜) 배정 행 0건 — 판정 대상 없음, 관련 커밋(0d848382/ba80925a/c4acdf71)의 동일 패턴 잔존 사이트는 Pass A 신규 |  |
| D11-017 | CONFIRMED | P2 | rebalance-leave-balances.mjs — crypto 미임포트(전역 의존) + updated_at UTC ISO 포맷 혼재 |  |
| D12-012 | CONFIRMED | P2 | formatDateLabel 정본은 timeZone 미지정, 위성 사본 3곳은 Asia/Seoul 고정 — timestamp 입력 시 날짜가 하루 어긋나는 drift |  |
| D12-020 | CONFIRMED | P2 | [crossover] 출결정정 fmtTime 이 PC/모바일 공히 디바이스 로컬 TZ(toTimeString) — 탐지 로직(KST)과 표시 불일치 가능 |  |

---

## S8 — 연차 SSOT 단절 — leave_ledger 원장 vs staff_members 미러 이중 진실

수정 묶음: **FB7 연차 SSOT 통일** (난이도 L · 회귀위험 높음 · 선행 FB2(leave_ledger 정책 등록)·FB4(부재 컬럼) 선행)

소속 22건 (CONFIRMED 19 / PLAUSIBLE 0 / REFUTED 3)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D03-003 | CONFIRMED | P0 | 연차 소멸 처리가 SSOT(leave_ledger)와 단절 — expire 원장 미기록 + summary 동기화가 소멸 결과를 되돌림 |  |
| D03-D12 | CONFIRMED | P0 | [7차 A7-07] 연차소멸 leave_ledger 미기록 → SSOT 재계산으로 소멸분 부활 — 미수정 | →D03-003 |
| D03-009 | CONFIRMED | P1 | 연차촉진 면제(연차계획서 제출)가 연도·만료일 스코프 없이 영구 적용 |  |
| D03-010 | CONFIRMED | P1 | 연차촉진 대상 판정이 SSOT(원장)가 아닌 staff_members 미러(annual_leave_total/used)에 의존 |  |
| D03-011 | CONFIRMED | P1 | admin sync/diagnose 의 recalculateLeaveBalance(year) 가 asOf=12-31 미래 주기로 집계 — 잔액 미러를 0 으로 덮어씀 |  |
| D03-015 | CONFIRMED | P1 | 결근·지각 공제의 분모 폴백이 '기록된 근태일수' — 근태 기록이 성길수록 일할 임금이 부풀어 과대 공제 |  |
| D03-016 | CONFIRMED | P1 | 한국 공휴일 하드코딩이 2026-12-25 에서 끝남 — 2027년부터 공휴일 판정 전면 false |  |
| D03-017 | CONFIRMED | P1 | 수동조정(manual_adjustment)이 주기 필터를 무조건 통과 — 과년도 수동부여가 새 주기 총연차에 영구 합산 |  |
| D03-D07 | CONFIRMED | P1 | [7차 A7-02] 연차 summary IDOR + 이름 조회 허용 — IDOR 닫힘·이름/사번 OR 매칭 잔존 |  |
| D03-D08 | CONFIRMED | P1 | [7차 A7-03] 근태이상 감지 무음 사멸 — 지각은 status 폴백으로 복구, 조퇴 감지는 여전히 상시 0 |  |
| D03-D10 | CONFIRMED | P1 | [7차 A7-05] 연차 잔여 PC(회계연도) vs 모바일(입사일 주기) 불일치 — 미수정 |  |
| D11-010 | CONFIRMED | P1 | reset-leave-usage 와 full-recalc 의 잔액 산식이 'substitute' 처리에서 어긋난다 |  |
| D03-007 | CONFIRMED | P2 | setManualAnnualLeaveTarget 이 원장 기록에 resolve 전 raw staffId 를 사용 — 유령 원장 행 생성 가능 |  |
| D03-008 | REFUTED | P2 | getStaffLeaveContext 의 name/employee_no OR 매칭 — 회사 무관 limit 1 로 동명이인/사번 충돌 시 타인 원장 접근 |  |
| D03-019 | CONFIRMED | P2 | useAnnualLeaveSummary 가 API 실패 시 error:null + 전량 0 표시 — 오류가 정상값으로 위장 |  |
| D03-021 | CONFIRMED | P2 | export-csv 가 year=2026 하드코딩 — 2027년부터 연도 라벨 오기 |  |
| D03-022 | CONFIRMED | P2 | diagnose 라우트: 미사용 import(leave_accruals·leave_balances 등) + 'staff_members 미수정' 계약이 실제와 불일치 |  |
| D03-023 | REFUTED | P2 | attendance-sync toModernStatus 가 미지정 상태('연차'·'외근' 등)를 일괄 'present' 로 매핑 |  |
| D03-024 | CONFIRMED | P2 | substitute-holiday: 원장 기록에 company_id null 고정 + 파일 헤더 주석이 폐기된 동작(annual_leave_total += 1) 설명 |  |
| D03-025 | CONFIRMED | P2 | annual-leave-expiry.ts 의 calculateAnnualLeaveExpiryDate import 미사용 |  |
| D03-026 | CONFIRMED | P2 | 1년 도달 후에는 놓친 월차(1~11개월차) 소급 부여가 영구 차단 |  |
| D03-D05 | REFUTED | P2 | [7차 A2-05] 연차 summary IDOR — 세션 + canAccessStaffRecord 게이트로 해소 |  |

---

## S9 — 상태전이 무결성 붕괴 — 결재·재고·구매의 권한 가드·원자성·CAS 부재

수정 묶음: **FB8 상태전이 무결성** (난이도 L · 회귀위험 높음 · 선행 FB1 선행 — 컬럼 가드가 mutate 판정 경로에 의존)

소속 36건 (CONFIRMED 33 / PLAUSIBLE 1 / REFUTED 2)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D05-001 | CONFIRMED | P0 | approvals 테이블에 컬럼 가드가 없어 기안자 본인이 /api/d1/mutate 로 status='승인' 을 직접 써서 전자결재 전체를 우회할 수 있다 |  |
| D05-002 | CONFIRMED | P0 | 승인 코멘트에 '[전결]' 문자열만 넣거나 기안 시 meta.is_arbitrary 를 심으면 남은 결재선을 통째로 건너뛰고 최종 승인된다 |  |
| D05-019 | CONFIRMED | P0 | [A6-01 판정: PARTIAL] set 병합을 통한 current_approver_id 위조는 막혔으나, 기안자/현재결재자가 approvals 의 status 를 직접 쓰는 경로는 그대로 열려  | →D05-001 |
| D05-021 | CONFIRMED | P0 | [A6-03 판정: OPEN] 승인 코멘트 '[전결]' 로 잔여 결재자를 전원 건너뛰는 코드가 7차 인용 라인 그대로 남아 있다 | →D05-002 |
| D07-001 | CONFIRMED | P0 | stock-consume: 스코프 가드·재고권한 검사 전무 + deprecated 게이트가 클라이언트 헤더로 우회 |  |
| D01-008 | CONFIRMED | P1 | /api/inventory/stock-consume 가 세션만 검사하고 회사·부서 스코프/재고 권한을 전혀 보지 않아 임의 품목 재고를 차감 가능 | →D07-001 |
| D05-003 | CONFIRMED | P1 | 2차 이후 결재자에게 위임(approval_delegate_id)이 설정돼 있으면 current_approver_id 에 결재선에 없는 대리자 id 가 저장돼 문서가 관리자 포함 전원에게 영구 잠긴 |  |
| D05-004 | CONFIRMED | P1 | 후속 처리가 부분 실패해도 'completed_with_warnings' 를 완료로 확정해 연차 차감·인사명령·증명서 발급 실패가 영구 미반영으로 굳는다 |  |
| D05-005 | CONFIRMED | P1 | 공문발송 문서 최종 승인 시 official_doc_log 에 같은 공문이 두 번 기록된다 |  |
| D05-006 | CONFIRMED | P1 | 모바일 결재상세 '코멘트' 탭이 meta.history 를 읽어 항상 비어 있다(서버는 meta.edit_history 에 기록) |  |
| D05-007 | CONFIRMED | P1 | PC '강제 반려' 권한(approval_반려권한)이 서버에 존재하지 않아 해당 권한자가 반려를 눌러도 항상 실패한다 |  |
| D05-008 | CONFIRMED | P1 | 모바일 출결정정 폼이 attendance_corrections insert 결과의 error 를 확인하지 않아 실패해도 성공 토스트가 뜬다(PC 는 throw) |  |
| D05-009 | CONFIRMED | P1 | 결재 전이에 낙관적 잠금이 없어 동시 승인 요청이 두 번 처리되고 후속 처리가 중복 실행될 수 있다 |  |
| D05-010 | CONFIRMED | P1 | 반려·회수 시 모바일이 선삽입한 leave_requests '대기' 행이 정리되지 않아 유령 연차 신청이 남는다 |  |
| D05-011 | CONFIRMED | P1 | 결재 이력 조회가 최근 300건만 훑고 문서번호가 없으면 제목+기안자+회사로 매칭해, 문서보관함 항목을 다른 결재 문서가 덮어쓴다 |  |
| D05-020 | CONFIRMED | P1 | [A6-02 판정: PARTIAL] process-final 에 최종확정 상태 게이트와 멱등 마커가 추가됐으나 기안자 허용 자체는 인용 라인 그대로 남아 있다 | →D05-001 |
| D07-002 | CONFIRMED | P1 | stock-post: '관리자 강제' 플래그(skipClosingCheck/skipExpiryCheck)와 minAllowed 를 관리자 검사 없이 클라이언트 입력 그대로 통과 |  |
| D07-003 | CONFIRMED | P1 | po-receive: 라인 루프 비원자성 — 중간 실패 후 재시도 시 앞 라인 재고 이중 입고 |  |
| D07-004 | CONFIRMED | P1 | po-receive: OVER_RECEIVE 검사 TOCTOU + PO items JSON last-writer-wins — 동시 입고 시 초과 입고 |  |
| D07-005 | CONFIRMED | P1 | po-inspect: 반품 루프 중간 조기 return / 실패 라인 방치 후 상태 확정 — 이중 반품·영구 미반품 |  |
| D07-006 | CONFIRMED | P1 | po-receive/po-inspect: 품목 이름 매칭이 회사 스코프 없이 전체 inventory 첫 일치 행 — 타사 동명 품목이 걸리면 처리 불능 |  |
| D07-007 | CONFIRMED | P1 | stock-transfer executeTransfer: 조회 후 절대값 batch UPDATE — CAS 부재로 동시 이관 시 재고 증발/복제 |  |
| D07-008 | CONFIRMED | P1 | movement-service: 수량 UPDATE 와 inventory_logs INSERT 가 단일 batch 가 아님 — 로그 없는 수량 변경 가능 |  |
| D07-014 | CONFIRMED | P1 | closing: perms.inventory 만으로 임의 회사 월마감 잠금/해제 가능 — 회사 스코프 미검사 |  |
| D07-027 | CONFIRMED | P1 | [델타 A9-01] 재고 이관 절대값 무가드 UPDATE — 미수정 | →D07-007 |
| D07-028 | CONFIRMED | P1 | [델타 A9-02] 월마감 closing 이 payload company 를 무검증 채택 — 미수정 | →D07-014 |
| D05-012 | REFUTED | P2 | 결재선에 같은 사람이 두 번 포함되면 중복 제거로 단계가 사라져 그 사람의 2회차 결재가 건너뛰어진다 |  |
| D05-014 | CONFIRMED | P2 | 이전 단계의 delegated_to_id 가 meta 에 남아, 같은 대리자가 연속 두 결재자를 대행하면 현재 단계가 뒤로 되감긴다 |  |
| D05-015 | CONFIRMED | P2 | 결재 지연 알림 로직이 useApprovalRouting 과 useApprovalDelegation 에 거의 동일하게 두 벌 존재한다 |  |
| D05-016 | CONFIRMED | P2 | buildApprovalSubmitPayload 가 빈 결재선을 걸러내지 않아 current_approver_id='' 인 결재 문서가 만들어질 수 있다 |  |
| D05-017 | CONFIRMED | P2 | /api/approvals/process-final 이 기안자와 참조자에게도 후속 처리 실행 권한을 준다 |  |
| D05-018 | REFUTED | P2 | [담당 밖] leave_requests 정책의 본인 insert 제한과 모바일 선삽입 흐름이 실제로 맞물리는지 미검증 — D06/인사 도메인에서 확인 필요 |  |
| D07-015 | PLAUSIBLE | P2 | 월마감 상태 문자열 드리프트 — GET 은 '확정' 을 잠금으로 표시하지만 전표 차단은 '확정' 을 검사하지 않음 |  |
| D07-016 | CONFIRMED | P2 | po-receive/po-inspect/stock-post 간 에러 매핑 드리프트 — 같은 StockError 가 라우트마다 404/409/500 으로 갈림 |  |
| D09-006 | CONFIRMED | P2 | 모바일 연차신청 2단 기록(leave_requests→approvals)이 비원자적 — 상신 실패 재시도 시 대기 row 중복, 반려 시 대기 row 영구 잔존 |  |
| D12-016 | CONFIRMED | P2 | 결재 지연 알림 파이프라인 ~70L 이 useApprovalDelegation/useApprovalRouting 에 2중 — metadata.dedupe_key 유무 drift | →D05-015 |

---

## S10 — 실패의 조용한 성공 보고 — 백업·복원·감사로그·오프라인 큐

수정 묶음: **FB9 실패 가시화(백업·감사·큐)** (난이도 M · 회귀위험 중 · 선행 없음)

소속 29건 (CONFIRMED 28 / PLAUSIBLE 0 / REFUTED 1)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D08-003 | CONFIRMED | P0 | '전체 백업'(24h)이 스키마 162개 테이블 중 52개만 담는다 — 연차 원장·급여 원본 등 109개 누락 |  |
| D08-004 | CONFIRMED | P0 | 백업 복원이 100행 초과 테이블에서 전부 실패한다 (배치 200 vs 서버 상한 100) |  |
| D02-003 | CONFIRMED | P1 | 일일 백업이 테이블 일부 실패(skipped)여도 ok:true·cron_success 로 보고 — 특정 테이블 영구 미백업을 아무도 모름 |  |
| D08-005 | CONFIRMED | P1 | 가장 파괴적인 '전 직원 삭제'가 감사로그를 남기지 않고 오히려 audit_logs 를 지운다 |  |
| D08-006 | CONFIRMED | P1 | 감사로그 행위자(user_id/user_name)가 클라이언트 제공값이고 관리자가 audit_logs 를 자유롭게 지울 수 있다 |  |
| D08-008 | CONFIRMED | P1 | access_logs 에 기록하는 코드가 저장소에 전혀 없어 '접근 감사 로그' 화면과 KPI 가 영구히 0 |  |
| D08-009 | CONFIRMED | P1 | 백업이 대부분의 테이블에서 실패해도 status='completed' 로 기록돼 '정상'으로 보인다 |  |
| D08-024 | CONFIRMED | P1 | [7차 A10-01] 법인카드 사용액이 여전히 charCodeAt 시드 난수이고 사용자명·회사명이 하드코딩 |  |
| D08-025 | CONFIRMED | P1 | [7차 A10-02] 감사로그는 여전히 브라우저가 직접 INSERT하고 actor 를 클라이언트가 정하며 관리자 update/delete 도 열려 있다 | →D08-006 |
| D08-026 | CONFIRMED | P1 | [7차 A10-03] access_logs 에 INSERT 하는 코드가 여전히 저장소 전체에 0건 | →D08-008 |
| D09-001 | CONFIRMED | P1 | 오프라인 결재·게시판 첨부가 재접속 후 R2에만 올라가고 문서에 영영 연결되지 않음 (고아 첨부) |  |
| D09-002 | CONFIRMED | P1 | 오프라인 큐 재전송에 멱등키가 없어 응답 유실 시 approvals·leave_requests 등 중복 INSERT |  |
| D09-003 | CONFIRMED | P1 | 큐 flush 트리거가 마운트 1회+online 이벤트뿐 — 실패 항목·'다시 시도' 항목이 다음 online 이벤트까지 무기한 정지 |  |
| D09-004 | CONFIRMED | P1 | 오프라인 출퇴근 체크인/아웃은 attendance(단수)만 큐잉 — attendances(복수) 동기화가 영구 누락 |  |
| D09-005 | CONFIRMED | P1 | 근로계약서 서명 저장 — 0행 UPDATE 를 성공으로 오인 + 재시도마다 document_repository 중복 INSERT (b5 :202 실영향 확인) |  |
| D09-D02 | CONFIRMED | P1 | [7차 A13-01 델타] 오프라인 첨부 영구 실패 무통지 — 인용 라인 무변경, 실패배너는 여전히 D1 큐만 구독 |  |
| D02-009 | CONFIRMED | P2 | 백업 페이지네이션이 ORDER BY 없는 LIMIT/OFFSET — 백업 도중 쓰기가 겹치면 행 누락/중복 가능 |  |
| D08-010 | CONFIRMED | P2 | 모든 백업이 requested_by_name='cron' 으로 저장돼 목록에서 항상 '수동'으로 표기된다 |  |
| D08-011 | CONFIRMED | P2 | 백업 산출물에 스키마·인덱스가 없어 D1 복원 절차와 정합이 맞지 않는다 |  |
| D08-016 | CONFIRMED | P2 | reset-staff 는 확인 문구 없이 비밀번호만으로 실행된다 (data-reset 이 막은 curl 우회가 그대로 남음) |  |
| D08-017 | CONFIRMED | P2 | 시스템마스터 개요·무결성 조회가 전량 SELECT 라 워커 메모리와 카운트 정확도를 동시에 해친다 |  |
| D08-018 | CONFIRMED | P2 | 감사로그 마스킹 목록에 salary_info·staff_email 이 빠져 급여·이메일 원문이 audit_logs 에 남는다 |  |
| D08-021 | CONFIRMED | P2 | 급여 이상치 감지가 같은 달의 재정산 행을 '전월'로 오인한다 |  |
| D08-027 | REFUTED | P2 | [7차 A11-01] data-reset 의 curl 우회는 닫혔다 — 서버가 보안암호(bcrypt)와 확인 문구를 재검증 |  |
| D09-009 | CONFIRMED | P2 | subscribeUploadQueue 리스너가 어디서도 통지되지 않아 오프라인배너 첨부 카운트가 마운트 시점에 고정 | →D09-D02 |
| D09-010 | CONFIRMED | P2 | 업로드 큐 failed 항목은 어떤 UI에도 노출·정리되지 않고 localStorage 에 영구 잔존 | →D09-D02 |
| D09-015 | CONFIRMED | P2 | 체크인 성공 시 attendances(복수)를 sync 헬퍼와 직접 upsert 로 이중 기록 + 오프라인 체크인 지각판정 '정상' 폴백 영구화 |  |
| D09-017 | CONFIRMED | P2 | 오프라인 체크아웃 0행 UPDATE 시 낙관적 상태로 성공 처리 — '이미 퇴근/기록 없음' 감지가 todayLog 부재 시에만 동작 |  |
| D11-016 | CONFIRMED | P2 | run-backup-now.mjs — ORDER BY 없는 OFFSET 페이지네이션과 tmp/ 평문 전량 덤프 축적 |  |

---

## S11 — 클라이언트 신뢰 경계 붕괴 — 계산·검증·PII 보호를 브라우저가 수행

수정 묶음: **FB10 서버 권위 이전** (난이도 L · 회귀위험 높음 · 선행 FB3·FB1 선행)

소속 16건 (CONFIRMED 15 / PLAUSIBLE 0 / REFUTED 1)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D01-003 | CONFIRMED | P0 | /api/d1/rpc/register-staff 가 hr 권한만 요구하면서 body 로 role·permissions 를 그대로 받아 저장 → 인사담당자가 admin/system_master 계정을 |  |
| D08-002 | CONFIRMED | P0 | 일반 관리자가 시스템마스터 계정 비밀번호를 덮어쓸 수 있다 |  |
| D09-D01 | CONFIRMED | P0 | [7차 A3-06 델타] 수술상담 PHI 가 여전히 localStorage 에만 평문 저장 — 인용 라인 4곳 전부 무변경 |  |
| D01-012 | CONFIRMED | P1 | 근태 GPS 반경 검증이 전적으로 클라이언트에 있고 localStorage bypass_gps 플래그로 해제 가능, 서버 insert 정책에 위치 검증 없음 |  |
| D04-001 | CONFIRMED | P1 | 계약 PII 암호화가 클라이언트에서 항상 평문 폴백 — 암호화 기능 사실상 무력화 |  |
| D04-008 | CONFIRMED | P1 | 급여 확정 금액이 100% 클라이언트 계산·클라이언트 저장 — 서버 재계산/검증 없음, 잠금 가드도 클라이언트 fail-open |  |
| D09-007 | CONFIRMED | P1 | 출퇴근 지오펜스·시각 검증이 전부 클라이언트 — localStorage 'bypass_gps' 플래그로 누구나 우회 (모바일·PC 공통) |  |
| D01-009 | CONFIRMED | P2 | /api/consultation/transcribe 가 body.audioUrl 을 검증 없이 서버에서 fetch → 인증 후 SSRF |  |
| D01-020 | REFUTED | P2 | /api/notifications/push-config 는 전 라우트 중 유일하게 게이트가 전혀 없음 (반환값은 VAPID 공개키) |  |
| D07-020 | CONFIRMED | P2 | board/upload 서명 URL 플랜 경로: 이미지 무제한 크기 + 클라이언트 신고 fileSize + magic-byte 검사 부재 |  |
| D08-001 | CONFIRMED | P2 | 관리자면 누구나 자신에게 system_master 권한을 부여할 수 있다 (시스템마스터/일반관리자 구분 없음) | →D08-002 |
| D09-011 | CONFIRMED | P2 | 권한 없는 메뉴가 딥링크로 1렌더 사이클 마운트됨 — page.tsx 재고/관리자 인텐트와 MobileShell open_menu 에 게이트 부재 |  |
| D09-014 | CONFIRMED | P2 | PC 마이페이지는 '서명대기'가 아닌 미서명 계약에도 서명 모달을 띄우는데 모바일은 안 띄움 — 판정 불일치 |  |
| D09-016 | CONFIRMED | P2 | 모바일 게시판 권한읽음.ts 가 PC canEditPost/canDeletePost 를 import 아닌 '미러 구현'으로 복제 |  |
| D09-018 | CONFIRMED | P2 | [crossover→D-업로드/서버] /api/approval/upload 가 approvalId 를 받고도 문서 meta 연결을 하지 않음 — 서버측 첨부-문서 연결 부재가 D09-001 의 근인 |  |
| D12-019 | CONFIRMED | P2 | [crossover] 교육자격탭 만료일이 자유 텍스트 입력 — 형식 검증 없이 staff_licenses.expiry_date 에 저장 |  |

---

## S12 — 운영 스크립트·저장소 위생 — 구 DB 조준·실행 게이트 누락·자격증명/실명 PII 커밋

수정 묶음: **FB11 스크립트·저장소 위생** (난이도 S · 회귀위험 낮음 · 선행 노출 자격증명 회전·폐기가 코드 수정보다 먼저)

소속 30건 (CONFIRMED 28 / PLAUSIBLE 1 / REFUTED 1)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D11-009 | CONFIRMED | P0 | deploy.mjs 의 `git add -A` 가 untracked 71개 잔해를 통째로 커밋·푸시하고, 커밋 메시지를 셸 문자열로 직결한다 |  |
| D11-001 | CONFIRMED | P1 | migrate-and-insert-data.mjs 가 현행 운영 DB(pchos-d1-v2)를 확인 없이 삭제 후 7월 구덤프로 재생성한다 |  |
| D11-002 | CONFIRMED | P1 | full-recalc-leave-ledger.mjs 만 --yes 실행 게이트가 없다 (게이트 커밋 7a7b7c21 누락 5번째 스크립트) |  |
| D11-003 | CONFIRMED | P1 | run-leave-accrual-d1.mjs 의 마지막 rebalance 하위호출이 --yes 게이트에 걸려 항상 실패한다 (게이트 커밋의 회귀) |  |
| D11-007 | CONFIRMED | P1 | retry-failed-inserts.mjs 가 현행 운영 DB에 7월 마이그레이션 INSERT 를 게이트 없이 재주입한다 |  |
| D11-019 | CONFIRMED | P1 | restore-d1 5종·wipe-d1·legacy backfill 의 대상이 전부 구 pchos-d1 — '우연한 안전망' 상태의 파괴적 잔해군 |  |
| D11-903 | CONFIRMED | P1 | [Pass B] 7a7b7c21 '인사 스크립트 4종 게이트' — PARTIAL (5번째 full-recalc 누락 + rebalance 하위호출 회귀 유발) | →D11-002 |
| D13-007 | CONFIRMED | P1 | 직원 실명 개인정보 산출물 8개가 git 에 커밋되어 있음 (연차·급여성 데이터) |  |
| D11-004 | CONFIRMED | P2 | backup-cloudflare.mjs 는 여전히 구 DB(pchos-d1)를 백업하고 실패해도 exit 0 — '성공한 빈 백업' |  |
| D11-005 | CONFIRMED | P2 | 연차 감사 XLSX 리포트 2종이 구 DB(pchos-d1)를 조회해 빈/구식 리포트를 생성한다 |  |
| D11-006 | CONFIRMED | P2 | recreate-d1.mjs 는 fs 미임포트로 DB 삭제 후 크래시하는 파괴적 잔해다 |  |
| D11-008 | CONFIRMED | P2 | clean-recreate-and-restore-d1.mjs — v2 재생성+wrangler.toml 재작성+구청크 복원 경로가 상존한다 |  |
| D11-011 | CONFIRMED | P2 | upload-secrets.mjs — 시크릿 평문 .tmp 잔존(실패 시 미삭제) + 폐기된 Supabase 키 2종 계속 업로드 |  |
| D11-012 | CONFIRMED | P2 | deploy-worker.mjs 가 FIREBASE_SERVICE_ACCOUNT JSON 을 cmd.exe echo 파이프로 전달 — 값 훼손·명령행 노출 |  |
| D11-013 | CONFIRMED | P2 | d1Query 셸 이스케이프 패턴(sql.replace(/"/g,'\\"') + shell:true)이 %·cmd 메타문자에서 깨진다 — 안전한 execFileSync 패턴과 혼재 |  |
| D11-014 | CONFIRMED | P2 | 중복 정량화 — runWrangler ×24, .env 파서 4변종 ×12+, extractJson ×3, kstToday ×5, 계정ID 하드코딩 ×41파일, 토큰 취급 상반 2전략(28:2) |  |
| D11-015 | CONFIRMED | P2 | 루트 죽은 코드 3종 — run-wrangler.js(구 DB 조회), backfill-sync.mjs/check-sync.mjs(Supabase 레거시) |  |
| D11-018 | PLAUSIBLE | P2 | run-birthday-announcements-d1.mjs — KST 날짜에 'Z' 를 붙인 created_at 과 문자열 시각 비교의 포맷 혼재 |  |
| D11-020 | CONFIRMED | P2 | untracked 71개(2026-07-26 계정이전 잔해) 분류 — 아카이브 61 / 삭제 7 / 유지 검토 3 |  |
| D11-021 | CONFIRMED | P2 | auto-deploy.mjs 는 빌드→배포 순서를 지키는 안전한 래퍼이나 deploy.mjs 와 기능 중복 + 토큰 전략 이원화의 한 축 |  |
| D11-022 | CONFIRMED | P2 | (담당외) tests/ 가 참조하는 seed-e2e-d1 비밀번호 기본값이 콘솔에 평문 출력됨 |  |
| D11-900 | CONFIRMED | P2 | [Pass B] 7차 P0 42건 중 D11(scripts) 배정 행은 0건 — 판정 대상 없음 |  |
| D11-901 | REFUTED | P2 | [Pass B] cc37f96f '복원 부분실패를 성공보고' 수정 — CLOSED (청크 루프에 실패수집+재시도+exit 1 확인) |  |
| D11-902 | CONFIRMED | P2 | [Pass B] 8ce03332 '수동 백업 옛 DB' 수정 — PARTIAL (run-backup-now 만 교정, backup-cloudflare 는 여전히 구 DB) | →D11-004 |
| D13-006 | CONFIRMED | P2 | 루트 backfill-sync.mjs·check-sync.mjs — 커밋된 Supabase 조작 스크립트, 미설치 의존성으로 실행 불능 | →D11-015 |
| D13-008 | CONFIRMED | P2 | scripts/deploy-worker.mjs 가 FIREBASE_SERVICE_ACCOUNT 를 cmd.exe echo 파이프로 업로드 — 시크릿 오염 사고 동형 재발 사이트 | →D11-012 |
| D13-009 | CONFIRMED | P2 | upload-secrets.mjs — 죽은 Supabase 시크릿 업로드 목록 + 실패 시 평문 시크릿 tmp 파일 잔존 + 멀티라인 값 절단 | →D11-011 |
| D13-011 | CONFIRMED | P2 | 머신 고정 경로 npm.cmd 래퍼와 0바이트 npx 파일이 git 에 커밋됨 — cmd.exe cwd 우선 탐색으로 실제 npm 을 가로챔 |  |
| D13-014 | CONFIRMED | P2 | .gitignore 결함 묶음 — query_result* 패턴 부재, ignore-after-commit 2건, 죽은 패턴 2건, 비앵커 위험 패턴(cd/git/tmp*/) |  |
| D13-017 | CONFIRMED | P2 | 루트 임시파일 전수 분류 — tracked 삭제후보 20개 / untracked 미차단 1개 / ignored 잔존 23개 |  |

---

## S13 — 중복 구현 drift — SSOT 부재로 PC/모바일·라우트 사본이 갈라짐

수정 묶음: **FB12 중복 통합** (난이도 L · 회귀위험 중 · 선행 FB4·FB6 이후 — 통합 대상이 아직 이동 중이면 재작업)

소속 37건 (CONFIRMED 32 / PLAUSIBLE 2 / REFUTED 3)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D04-002 | CONFIRMED | P1 | 정규식 수량자 손상 {N,}→{N } 8곳 — 계약서 닫힘블록 인식·회사정보 치환·본문 정리 전부 무동작 |  |
| D04-003 | CONFIRMED | P1 | 4대보험 모듈 폴백 계산이 국민연금 상한을 '전직원 합계'에 적용 — 합계 보험료 과소 표시 |  |
| D04-004 | CONFIRMED | P1 | 급여대장 CSV — 천단위 콤마 숫자를 비인용으로 콤마 구분 CSV에 삽입 → 1,000원 이상이면 열 전체 붕괴 |  |
| D06-009 | CONFIRMED | P1 | 열려 있는 방에 메시지가 도착하면 창이 비활성이어도 즉시 읽음 커서를 기록해 안읽음이 유실된다 |  |
| D06-010 | CONFIRMED | P1 | 모바일 안읽음 집계에 PC 의 implicit baseline 이 없어 커서 없는 방의 전 히스토리가 안읽음으로 잡힌다 |  |
| D07-013 | CONFIRMED | P1 | chat/approvals 업로드 파일명 정규식 오염 — ' -<' 범위가 숫자·점·하이픈을 지우고 정작 제어문자(널바이트)는 통과 |  |
| D12-001 | CONFIRMED | P1 | chat/approvals 업로드 파일명 정규식이 공백~'<' 범위(0x20-0x3C)를 삭제 — 숫자·점·괄호가 파일명에서 사라짐 | →D07-013 |
| D12-004 | CONFIRMED | P1 | 출결정정 문제날짜 탐지 엔진(~150L)이 PC/모바일에 verbatim 이중 + 제출 경로·에러 처리 drift |  |
| D12-005 | CONFIRMED | P1 | 연차 신청 3중 진입점(모바일 결재탭/모바일 인사탭/PC 양식)의 메타·CC 규칙이 이미 3갈래로 drift |  |
| D12-006 | CONFIRMED | P1 | 모바일 결재 상신 파이프라인이 useApprovalFormBase.submitApproval 과 기안상신.submitApprovalDraft 로 병렬 2중 구현 |  |
| D12-007 | CONFIRMED | P1 | 급여 공제 항목 구성이 PC/모바일 별도 구현 — 기타공제 누락으로 모바일 명세서의 지급-공제≠실지급 |  |
| D04-009 | CONFIRMED | P2 | 4대보험 계산기 2벌(calcStatutoryDeductions vs calculateEmployeeInsuranceDeductions) — 상한·장기요양·두루누리 산식 상이 |  |
| D04-010 | PLAUSIBLE | P2 | 통상시급 산정 — 주 40h 초과 계약의 월 소정근로시간을 1.0x 선형 확장(격일제 분기만 1.5x 가중) → 시급 과대·최저임금 판정 왜곡 |  |
| D04-011 | CONFIRMED | P2 | 주민번호 세기 판정 로직 2벌 불일치 — 계약서 렌더는 성별코드 9/0을 2000년대로 처리 |  |
| D04-012 | CONFIRMED | P2 | 퇴직 재직기간 표시 — 일수 계산이 (workDays%365)%30이 아닌 workDays%30 |  |
| D04-013 | CONFIRMED | P2 | 원천징수 신고 예정일 표기가 귀속월 당월 10일 — '다음 달 10일' 규칙과 불일치 |  |
| D04-014 | CONFIRMED | P2 | 두루누리 적용 판정 로직 2벌 — 정산 화면 사본은 36개월 상한·보수 한도(270만) 미적용 |  |
| D04-017 | CONFIRMED | P2 | handleSignComplete 서명 완료 플로우가 모바일 셸과 마이페이지에 사실상 동일 사본 2벌 |  |
| D04-018 | CONFIRMED | P2 | 2026 건강보험 보수월액 상한이 2025 고시값으로 TODO 상태 |  |
| D04-019 | REFUTED | P2 | 급여 리마인더 — payrollDay가 그 달에 없는 날짜(29~31)면 해당 월 알림 자체가 스킵 |  |
| D04-022 | REFUTED | P2 | 원천징수 신고 파일 빌드 — staffMap에 없는 직원 레코드를 조용히 제외(신고 누락 위험) |  |
| D04-023 | CONFIRMED | P2 | [담당 밖] op-check-utils.ts:99 동일한 정규식 수량자 손상(\s{2 }) — 공백 정규화 무동작 | →D04-002 |
| D04-102 | REFUTED | P2 | [7차 A8-02 델타] contract_templates PUBLIC_ALL(계약본문·직인 임의 변조) — 정책 계층에서 수정 확인 |  |
| D06-014 | CONFIRMED | P2 | 시스템마스터 채팅 금지어 검색의 LIKE 이스케이프가 ESCAPE 절 없이 동작해 오작동한다 |  |
| D06-015 | CONFIRMED | P2 | 방 미리보기 재계산이 서버(트리거 대체)와 클라이언트 두 곳에 중복 구현돼 있다 |  |
| D07-017 | CONFIRMED | P2 | notice-broadcast: 동일 staff 조회 코드 사본 2개 + 중복 발송 방지 부재 |  |
| D07-022 | CONFIRMED | P2 | [crossover] admin logo/seal upload 71L 복제(b3 신규 위험 1위) — 검증 상수 drift 예정지 |  |
| D09-013 | CONFIRMED | P2 | 근로계약서 handleSignComplete ~90L 가 MobileShell 과 PC 마이페이지에 완전 복제 (b3 미등재 신규 축) | →D04-017 |
| D12-003 | CONFIRMED | P2 | po-inspect ↔ po-receive 수량 파싱 5함수 복제 + 이미 갈라진 drift 2건(received_items.rejected 소실, StockError→404 오매핑) |  |
| D12-008 | CONFIRMED | P2 | push 구독 정리 로직 2벌 — cron 은 퇴사자 구독 삭제, 관리도구는 퇴사자 구독 유지 (정리 기준 drift 확정) |  |
| D12-009 | CONFIRMED | P2 | logo/seal upload route 파일의 ~90% 복붙(71L×4) — 현재 drift 없음, 예방적 통합 대상 | →D07-022 |
| D12-011 | CONFIRMED | P2 | normalizeUploadMimeType: lib/upload-mime SSOT 존재에도 board 로컬 재정의 + approval/submission 의 소형 normalizeMime 사본 2벌 |  |
| D12-014 | CONFIRMED | P2 | object-storage R2 함수 4종의 binding-try→presign-fallback 골격 반복 + uploadToR2 의 bucket 인자와 단일 binding 불일치 잠재 위험 |  |
| D12-015 | CONFIRMED | P2 | 모바일 결재 폼 3형제의 결재선 미리보기+참조(CC) JSX 섹션 ~130L×3 verbatim — 로직은 공유, 표피만 중복 |  |
| D12-018 | CONFIRMED | P2 | b3 상위 클러스터 최종 판별 — 나의할일 PC/모바일 174L 은 '무해~중' 하향(useTodoWorkflow 공유 확인), 무해군 재확인 |  |
| D12-021 | CONFIRMED | P2 | [Pass B] b7-delta-index 42건 중 D12(중복코드) 배정 행 0건 — 판정 대상 없음 |  |
| D12-022 | PLAUSIBLE | P2 | [crossover→D03 참고] A7-05 인용 지점 변화 관찰 — PC 연차 잔여가 leave_balances SSOT 우선으로 수렴, 단 balance 부재 시 회계연도 폴백 잔존 |  |

---

## S14 — 죽은 코드·사문 설정·미실행 품질 게이트

수정 묶음: **FB13 정리·게이트 복구** (난이도 S · 회귀위험 낮음 · 선행 없음 — 독립 착수 가능)

소속 21건 (CONFIRMED 16 / PLAUSIBLE 0 / REFUTED 5)

| id | 판정 | sev | 제목 | 병합 |
|---|---|---|---|---|
| D01-024 | CONFIRMED | P2 | crossover: tests/security.spec.ts · tests/security/d1-policies.spec.ts 가 playwright testDir 밖이라 D1 정책 회귀 테스트가  | →D13-019 |
| D03-D02 | REFUTED | P2 | [7차 A2-02] 서류제출/계약서명 불능(document_repository ADMIN_ONLY_ALL) — 정책 재분류로 해소 |  |
| D03-D03 | REFUTED | P2 | [7차 A2-03] 할일(todos) 전면 불능 — SELF_ONLY 명시 정책으로 해소 |  |
| D03-D04 | REFUTED | P2 | [7차 A2-04] 본인 증명서 조회 불능(certificate_issuances) — STAFF_IN_SCOPE/SELF insert 로 해소 |  |
| D03-D06 | REFUTED | P2 | [7차 A7-01] export-csv 무인증 PII 유출 — 관리자 게이트 추가로 해소 |  |
| D06-013 | CONFIRMED | P2 | chat-rooms PATCH 의 notice 분기와 헤더 주석이 실제 동작과 어긋난 죽은 코드 |  |
| D08-020 | REFUTED | P2 | lib/system-master-staff-query.ts 는 어디서도 쓰이지 않는 Postgres 시절 잔재 |  |
| D09-008 | CONFIRMED | P2 | initOfflineQueueFlush·enqueueSupabaseTransaction 죽은 코드 — 남겨두면 이중 flush·프록시 직렬화 사고 유발 잠복 |  |
| D13-001 | CONFIRMED | P2 | lib/db/dual-write.ts 전체가 죽은 코드 — dualInsert/dualWrite 호출부 0곳 |  |
| D13-002 | CONFIRMED | P2 | lib/system-master-staff-query.ts 는 프로덕션 참조 0 — 테스트만 소비하는 Supabase(PostgREST) 잔재 |  |
| D13-003 | CONFIRMED | P2 | DataBackend 'supabase'/'dual-write' 분기 전체 사문화 — getDataBackend/resolveDataBackend 가 'd1' 하드코딩 |  |
| D13-004 | CONFIRMED | P2 | next.config.ts images.remotePatterns 에 supabase.co 스토리지 호스트 잔재 |  |
| D13-005 | CONFIRMED | P2 | e2e.yml 에 SUPABASE_SERVICE_ROLE_KEY 등 Supabase secrets 주입 잔존 |  |
| D13-010 | CONFIRMED | P2 | .env.local 파서가 스크립트마다 4계열로 갈라져 있음 — 따옴표/$ 처리 불일치 (bcrypt-$ 사고 재발 배양지) |  |
| D13-012 | CONFIRMED | P2 | tsconfig exclude 죽은 항목 4건 + scratch/ 미제외 구멍 (scratch .ts 2개가 앱 타입체크에 포함 중) |  |
| D13-013 | CONFIRMED | P2 | npm run lint 게이트 사망 — globalIgnores 누락 6개 디렉터리가 문제의 97.8%를 만들어 상시 exit 1 |  |
| D13-015 | CONFIRMED | P2 | 빈 디렉터리 3개 잔존 — 기능부품/근태기록, 기능부품/알림센터, 기능부품/마이페이지/역할별대시보드(신규 발견) |  |
| D13-016 | CONFIRMED | P2 | lib/db/local.sqlite 0바이트 고아 파일 + 존재하지 않는 client-local.ts/build-sqlite.mjs 를 가리키는 주석 잔존 |  |
| D13-018 | CONFIRMED | P2 | package.json 깨진 스크립트 2건 — legacy-supabase 이동 미반영 경로 (Supabase 잔재) |  |
| D13-019 | CONFIRMED | P2 | 보안 회귀 스펙 2개가 어떤 Playwright 프로젝트에도 매칭되지 않아 영구 미실행 (내용 중복 이중 작성) |  |
| D13-100 | CONFIRMED | P2 | Pass B 판정: 7차 P0 42건 중 D13(죽은코드·설정·위생) 배정 행 0건 — 판정 대상 없음 |  |

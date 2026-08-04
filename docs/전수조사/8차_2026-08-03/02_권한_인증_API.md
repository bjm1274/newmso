# 8차 전수조사 — 권한·인증·API

> 감사일: 2026-08-03 · 대상 리비전: `7a7b7c21` · 판정: R1 감사 → R2 적대적 검증 완료

## 요약

`app/api/**/route.ts` 106개를 전수 스캔한 결과 **게이트가 아예 없는 라우트는 사실상 0건**이다(유일한 무게이트 `/api/notifications/push-config` 는 VAPID 공개키만 반환해 R2 에서 오탐 판정). 이 도메인의 진짜 문제는 "게이트가 없다"가 아니라 **게이트는 있는데 판정 근거가 소실되었거나(S4 세션 권한 압축), 판정 대상 행이 클라이언트가 만든 가짜 행이거나(S1 D1 게이트웨이 fail-open), 정책 레지스트리 등록 자체가 틀린 것(S2 과다개방 · S3 누락)** 이다. P0 4건은 전부 이 구조에서 나왔다 — `daily_closure_items` 무제한 개방(`D01-D03`), mutate 라우트의 비밀번호 해시 접두 오라클(`D01-D05`), mutate 폴백의 회사격리 우회(`D01-016`), 그리고 hr 권한자가 `role`·`permissions` 를 body 로 지정해 admin 계정을 만드는 권한 상승(`D01-003`). 여기에 세션 토큰이 권한 키를 8개 + `menu_*` 로 압축하는 구조 때문에 `finance_*` 는 서버에서 영구 소실되고 `mypage_수정 === false` 명시 차단은 fail-open 이 되며, `/api/auth/session` 은 클라이언트에 DB 원본 권한 전체를 돌려주므로 **"화면에는 보이는데 API 는 거부"** 하는 비대칭이 구조적으로 발생한다. 마지막으로 이 결함들을 잡았어야 할 `tests/security.spec.ts`·`tests/security/d1-policies.spec.ts` 는 playwright `testDir` 밖이라 한 번도 실행된 적이 없다(`D01-024`).

**D01 원장 30건**

| 구분 | CONFIRMED | PLAUSIBLE | REFUTED |
|---|---|---|---|
| P0 | 4 | 0 | 0 |
| P1 | 11 | 0 | 0 |
| P2 | 12 | 0 | 3 |

**타 도메인에서 넘어온 권한·인증 crossover 5건**

| 구분 | CONFIRMED | PLAUSIBLE | REFUTED |
|---|---|---|---|
| P0 | 0 | 0 | 0 |
| P1 | 1 | 0 | 0 |
| P2 | 3 | 1 | 0 |

> D01 30건 중 6건은 병합됨(`D01-005`→`D01-004`, `D01-D02`→`D01-019`, `D01-D04`→`D01-016`, `D01-008`→`D07-001`, `D01-023`→`D02-012`, `D01-024`→`D13-019`). 대표 항목은 24건.
> S2(정책 과다개방)·S3(정책 누락) 축의 나머지 항목 — `board_posts` PUBLIC_ALL(`D07-010` P0), 채팅방 UPSERT 침투(`D06-017` P0), 징계·평가 AUTHENTICATED(`D03-D09` P0), `room_read_cursors`/`message_reactions` 위조 쓰기(`D06-003` P1) 등 — 은 각 기능 도메인 문서가 대표로 다룬다. 이 문서는 게이트웨이·세션·API 표면에 한정한다.

---

## 지적사항

### D01-016 · P0 · loadPolicyRowsForMutation 의 예외 폴백이 where∪set 합성행으로 되돌아가 판정≠실행이 재현된다

- **근본원인 축**: S1 D1 API 게이트웨이의 판정 != 실행 · fail-open (mutate/query/realtime/rate-limit)
- **위치**: `app/api/d1/mutate/route.ts:253-258,267,287-291` (실행문 `:756`, WHERE 스키마 `:184`)
- **병합**: `D01-D04`(7차 A12-01 델타, PARTIAL) 를 흡수
- **결함**: 7차 R1 이 지적한 정상 경로(클라이언트 WHERE 로 실제 행을 SELECT 해 DB 정본으로 판정, `set` 병합 금지, 201행 이상 거부)는 수정됐다. 그러나 세 갈래 폴백이 남아 있다 — (a) 판정 SELECT 가 throw, (b) `ALLOWED_TABLES` 미포함, (c) 패턴이 PUBLIC/AUTHENTICATED 이고 가드가 없는 경우. 이때 판정 대상은 다시 `const fallback = { rows: [{ ...whereProxy, ...setProxy }], tooMany: false, loadedFromDb: false };`(`:255`) 즉 **클라이언트가 통제하는 합성 행 1개**로 되돌아가고, 실제 실행문 `UPDATE ${tableSql} SET ${setSql} WHERE ...`(`:756`)/DELETE 는 클라이언트 WHERE 전체에 LIMIT 없이 적용된다. `whereToRowProxy` 는 `eq` 만 반영하므로 `in` 조건만 쓰면 합성행이 `{}` 가 되고, `COMPANY_SCOPE_OR_NULL` 은 회사 컬럼이 비면 `rowCompanyIsNull()=true` 로 통과시킨다.
- **도달 경로**: 로그인 사용자 → `POST /api/d1/mutate { op:'delete', table:'wiki_documents'|'wiki_folders'|'wiki_document_versions'|'op_check_templates'|'op_patient_checks'|'daily_closures', where:[{field:'company_id',op:'in',value:[타사 company_id × 100]}] }`. 판정 SELECT 에는 `LIMIT` 바인드가 1개 더 붙어(`:272-276`) 실행문보다 파라미터가 항상 1개 많고, `WhereSchema` 의 `in` 배열에는 상한이 없다(`:184`). D1 의 쿼리당 바인드 한도는 100(저장소 스스로 `app/api/d1/query/route.ts:382` 에 `D1_MAX_PARAMS = 100` 으로 명시)이므로 **WHERE 바인드가 정확히 100 이면 SELECT(101)만 죽고 DELETE(100)는 성공**한다. `MAX_POLICY_ROWS_PER_MUTATION` 200행 상한도 함께 무력화된다.
- **영향**: 회사 격리 우회 + 타 회사 행 대량 삭제. 삭제는 감사로그로도 되돌릴 수 없다.
- **검증**: R1 은 스스로 "SELECT 는 실패하고 UPDATE 는 성공하는 조건을 특정하지 못했다 — 못 찾으면 위생 이슈로 강등"이라고 반증조건을 걸었다. R2(V01)가 그 조건을 실제로 특정해 **반증 실패 → P2 에서 P0 으로 승격**시켰다. 다만 병합된 `D01-D04` 행의 V13 재판정은 합성행이 통과시키는 패턴을 `MANAGE_COMPANY_OR_NULL`·`FINANCE_SCOPE` 로 한정해 "이미 manage-company 권한을 쥔 계정의 교차회사 삭제"로 보고 P1 을 매겼다. **원장 내 두 기록(대표 P0 / 병합행 P1)이 어긋나므로, 수정 착수 전에 `rowCompanyIsNull()` 을 만족하는 패턴 집합이 어디까지인지 1회 확인이 필요하다.** 어느 쪽이든 수정 방향은 동일하다.
- **수정 방향**: `catch` 폴백을 fail-closed(403/500)로 바꾸고, 합성행 폴백은 `rowIndependent` 케이스로만 한정한다. 추가로 판정 SELECT 와 실행문을 D1 batch 로 묶고 실행문에 판정된 행의 `PK IN (...)` 을 덧붙여 실행 대상을 판정 대상과 같은 집합으로 고정한다. (난이도 M · 회귀위험 높음 · 묶음 FB1 · 선행 FB13 정책 회귀 e2e 복구 권장)

### D01-D03 · P0 · 마감보고 자식 테이블 daily_closure_items 가 AUTHENTICATED ×4 로 전면 개방 (7차 A3-11 · PARTIAL)

- **근본원인 축**: S1 D1 API 게이트웨이의 판정 != 실행 · fail-open
- **위치**: `lib/db/auth/policies.ts:458-476`, `lib/db/schema.ts:490-498`
- **결함**: 커밋 `e7ae1756` 이 부모 `daily_closures` 를 `PUBLIC_ALL` → `COMPANY_SCOPE_OR_NULL`(`companyIdField:'company_id'`)로 고쳤다. 그런데 7차가 지목한 실제 PII — `patient_name`, `amount`, `payment_method`, `receipt_type`, `memo` — 는 자식 테이블 `daily_closure_items` 에 있고, 이 테이블은 `select/insert/update/delete` 가 **모두 `AUTHENTICATED`** 다. 코드 주석(`:468-470`)이 "하위 항목에는 company_id 가 없고 closure_id 만 있다 … PUBLIC 보다는 좁지만 회사 격리는 되지 않는다. 부모 기준 asyncGuard 가 후속 과제"라고 스스로 인정한다.
- **도달 경로**: 로그인한 임의 계정 → `POST /api/d1/query { table:'daily_closure_items' }` 로 전 회사 환자명·수납금액 조회. `POST /api/d1/mutate { op:'delete', where:[{field:'id',op:'neq',value:''}] }` 로 전량 삭제. 정책이 행 무관(`rowIndependent`)이라 `loadPolicyRowsForMutation` 이 DB 조회를 생략하고 합성행 1개로 판정하므로(`app/api/d1/mutate/route.ts:263-267`) **201행 상한(TOO_MANY_ROWS)조차 적용되지 않는다.**
- **영향**: 타 회사·타 지점 환자명 + 수납금액 전량 열람 및 삭제. 7차 A3-11 의 핵심 피해가 부모에서 자식으로 경로만 바꿔 그대로 남아 있다.
- **검증**: R2 가 두 반증조건(테이블이 `ALLOWED_TABLES` 밖 / `asyncGuards` 존재)을 모두 확인했고 둘 다 불성립. `ALLOWED_TABLES` 는 `Object.keys(POLICY_REGISTRY)` 이므로 등록된 이 테이블은 자동 포함된다. V01·V11 모두 CONFIRMED/P0 로 일치.
- **수정 방향**: `daily_closure_items` 에 `asyncGuards` 를 붙여 `closure_id` → `daily_closures.company_id` 로 회사 스코프를 강제하거나, 스키마에 `company_id` 를 비정규화해 `COMPANY_SCOPE_OR_NULL` 로 전환한다. (난이도 M · 회귀위험 높음 · 묶음 FB1)

### D01-D05 · P0 · 비밀번호 해시 접두 오라클 — query 경로는 닫혔으나 mutate 경로에 동일 오라클 잔존 (7차 A12-02 · CLOSED)

- **근본원인 축**: S1 D1 API 게이트웨이의 판정 != 실행 · fail-open
- **위치**: `app/api/d1/query/route.ts:199-226,302-312`(닫힌 쪽), `app/api/d1/mutate/route.ts:182-185,263-267,272-276,280` · `lib/db/auth/policies.ts:1547-1557,1799-1846`(열린 쪽)
- **결함**: query 라우트는 `findSensitiveFieldUsage` 로 `where`·`order`·`orFilters`(재귀 walk)에 `password`/`passwd` 또는 PII 컬럼이 등장하면 403 을 내고, `count:true` 경로도 이 검사 뒤에 실행되어 COUNT 오라클까지 막았다 → **7차 A12-02 의 query 경로는 CLOSED 가 맞다.** 그러나 **mutate 라우트에는 동일 검사가 전혀 없다**(`findSensitiveFieldUsage`/`STAFF_SECRET_ALWAYS_COLUMNS` 참조 0건). `WhereSchema` 는 `like` 를 허용하고 컬럼명만 정규식으로 본다. `staff_members.update` 는 `SELF_OR_SAME_COMPANY` + `staffPrivilegeGuard` 라 `rowIndependent` 가 아니어서 실제로 `SELECT * FROM staff_members WHERE password LIKE ?` 가 돌고, **0행이면 `assertAccess` 루프가 아예 돌지 않아 200, 1행 이상이면 `PolicyDenied` 403** 이 된다.
- **도달 경로**: 로그인한 일반 직원이 `POST /api/d1/mutate { op:'update', table:'staff_members', set:{<무해컬럼>}, where:[{field:'password',op:'like',value:'$2a$10$ab%'},{field:'id',op:'neq',value:<내 id>}] }` 를 반복. 200/403 이 곧 1비트 답이다. 분당 100회 레이트리밋(`route.ts:168`) 하에서도 수십 분이면 해시 접두를 복원할 수 있고, `resident_no`·`phone`·`base_salary` 등 `STAFF_PII_SENSITIVE_COLUMNS` 도 같은 방식으로 추출된다.
- **영향**: 권한 경계를 넘는 자격증명·주민번호·급여 정보 유출. 무권한 일반 직원이 도달 가능.
- **검증**: R1 은 이 항목을 "CLOSED" 로 보고하면서 falsifier (3) 에 "mutate 라우트에는 동일 검사가 없어 다른 오라클을 만들 수 있는지 — 미검증"이라고 남겼다. R2(V11)가 그 미검증 갈래를 실제로 확인해 **성립함을 확정, CLOSED 판정을 뒤집었다.** 심각도는 V01 P1 vs V11 P0 충돌에서 "무권한자 도달 + 권한 경계 넘는 유출"을 근거로 P0 채택.
- **수정 방향**: `findSensitiveFieldUsage` 를 테이블별 민감컬럼 맵으로 일반화하고 **mutate 라우트에도 동일 검사를 적용**한다. 0행 응답과 403 응답이 구분되지 않도록 응답 형태도 함께 통일한다. (난이도 M · 회귀위험 높음 · 묶음 FB1)

### D01-003 · P0 · /api/d1/rpc/register-staff 가 hr 권한만 요구하면서 role·permissions 를 body 로 받아 저장 (권한 상승)

- **근본원인 축**: S11 클라이언트 신뢰 경계 붕괴 — 계산·검증·PII 보호를 브라우저가 수행
- **위치**: `app/api/d1/rpc/register-staff/route.ts:54,69,106-115,126-131,154-160`, `lib/db/functions/staff.ts:182,199,200`
- **결함**: 게이트는 `hasHrPermission(...) { return Boolean(user.role==='admin'||perms.admin||perms.mso||perms.hr); }`(`:106-115`) 로 **hr 단독 보유자를 통과**시킨다. 그런데 `StaffRowSchema` 가 `permissions: z.record(z.string(), z.unknown())`(`:54`) 과 `role: z.string()`(`:69`) 을 그대로 허용하고, `registerStaffFull` 이 `permissions: JSON.stringify(s.permissions ?? {})`(`staff.ts:182`), `role: s.role ?? 'staff'`(`:199`) 로 **검증 없이 저장**한다. 같은 저장소에 관리자 권한 변경 전용 게이트가 있고(`app/api/admin/staff-permission/route.ts` 주석: "SEC-1 CRITICAL 서버 가드 … 유일한 진입점이며 비관리자 요청은 403"), 신규 등록 경로가 그 게이트를 통째로 우회한다.
- **도달 경로**: hr 권한은 `SESSION_PERMISSION_KEYS` 화이트리스트에 있어 세션 토큰에 살아남는다. 인사담당자 세션으로 UI 없이 POST 한 번 → `permissions:{admin:true,system_master:true}`, `role:'admin'` 계정 생성. 같은 INSERT 가 `password_reset_required: 1` 을 하드코딩하므로(`staff.ts:200`) `master-login` 의 최초 로그인 경로(`route.ts:331-341`, 입력 비밀번호를 새 비밀번호로 설정 후 성공 응답)가 열려 있어 **임의 비밀번호로 즉시 로그인**된다.
- **영향**: hr 단독 권한 → admin/system_master 계정 생성 → 로그인까지의 완전한 권한 상승 체인이 코드만으로 성립한다.
- **검증**: R2 가 두 반증조건을 모두 깼다. `registerStaffFull` 내부에 role/permissions 정규화가 없고 Referer/Origin 검사도 없다. "신규 계정은 비밀번호가 없어 로그인 불가"라는 두 번째 반증도 `password_reset_required:1` + master-login 최초로그인 경로로 무너진다. P0 유지.
- **수정 방향**: `StaffRowSchema` 에서 `role`·`permissions` 를 제거하거나, `isAdminSession` 이 아닌 호출자에 대해서는 `role='staff'` / `permissions={}` 로 강제 덮어쓴 뒤 `registerStaffFull` 에 넘긴다. (난이도 L(묶음 기준) · 실 수정 규모 S · 회귀위험 높음 · 묶음 FB10 · 선행 FB3·FB1)

---

### D01-011 · P1 · rate-limit 이 D1 오류·미바인딩 시 전부 fail-open — 로그인 잠금이 조용히 사라진다

- **근본원인 축**: S1 D1 API 게이트웨이의 판정 != 실행 · fail-open
- **위치**: `lib/rate-limit.ts:46-53,112-116,136-139,155-157,175-178`
- **결함**: 실패 경로 전부가 허용으로 떨어진다 — `const d1 = await resolveD1(); if (!d1) { return { allowed: true }; }`(`:112-116`), `catch (err) { console.error('[rate-limit] checkRateLimit D1 오류, 레이트리밋 건너뜀:', err); return { allowed: true }; }`(`:136-139`), `if (!row) { // RETURNING 실패 시 허용(가용성 우선) … return { allowed: true }; }`(`:161-164`), `consumeRateLimit` 의 catch 도 동일(`:175-178`). 로그는 `console` 뿐이라 관측 수단이 없다.
- **도달 경로**: D1 장애 · 바인딩 누락 · `rate_limit_attempts` 테이블/인덱스 유실 중 하나면 전 시스템 레이트리밋이 통째로 사라진다. 특히 `master-login` 의 `verifyPrivilegedLogin` 은 D1 없이도 동작하므로 **D1 장애 중에도 특권 자격증명 대입만은 계속 가능**하다.
- **영향**: 로그인 무차별 대입 방어와 `/api/d1/query`·`mutate` 총량 제한이 동시에 소멸. `D01-002`(특권 로그인 카운트 미증가)와 결합하면 완전 무제한이 된다.
- **검증**: 반증 절반만 성립. 정상 운영 중 D1 바인딩은 존재하므로 상시 fail-open 은 아니다. 그러나 인용 5곳 전부 정확하고, `:161-164` 는 D1 이 살아 있어도 RETURNING 이 비면 허용한다. 앞단 Cloudflare rate limiting rule 은 `wrangler.toml` 어디에도 근거가 없다. MEMORY 의 "D1 복원은 인덱스를 잃는다" 사례상 테이블/인덱스 유실은 실제로 일어난 이력이 있는 시나리오. P1 유지.
- **수정 방향**: 인증 계열(login/unlock 의 `checkRateLimit`)은 fail-closed 로 전환하고, 실패 시 Sentry/로그 카운터를 올려 조용한 무력화를 관측 가능하게 한다. (난이도 M · 회귀위험 높음 · 묶음 FB1)

### D01-001 · P1 · leave_ledger 가 POLICY_REGISTRY 미등록 — 연차원장 계열 6개 화면이 조용히 0일을 표시

- **근본원인 축**: S3 정책 레지스트리 누락·과소개방 → 권한 보유자에게 조용한 기능 사멸
- **위치**: `lib/db/auth/policies.ts:1370-1375`, `app/api/d1/query/route.ts:56,295-300`, `app/main/기능부품/인사관리서브/휴가신청/연차원장.tsx:112-115`
- **병합**: `D03-D11`(7차 A7-06 델타, 미수정)
- **결함**: `const ALLOWED_TABLES = new Set(Object.keys(POLICY_REGISTRY));`(`query/route.ts:56`) 이므로 레지스트리에 없는 테이블은 세션·권한과 무관하게 `Table not allowed` 403 이다(`:295-300`). `schema.ts` 에 실재하고 클라이언트 6곳이 조회하는 `leave_ledger` 가 `policies.ts` 전체에서 **문자열 0건** — `ADDITIONAL_PUBLIC_TABLES`/`SENSITIVE_STAFF_SCOPED`/`SENSITIVE_ADMIN_WRITE`/`ADMIN_ONLY_TABLES` 어떤 루프에도 없어 런타임 주입 경로도 없다. 관리자도 이 경로로는 통합 연차원장을 읽을 수 없다.
- **도달 경로**: 연차원장(`:113`)·`LeaveWorkcenter/data.ts:186`·`LeaveWorkcenter.tsx:124`(fetch 직접 호출)·연차소멸알림(`:50`)·조직도본문(`:266`)·모바일 연차관리자(`:81`) 6개 화면이 마운트 즉시 403 을 받는다.
- **영향**: 연차 잔액이 SSOT(원장)가 아니라 `leave_balances` 미러 폴백으로만 산정되어 원장 기준값과 어긋난다.
- **검증**: 403 자체는 V01·V12 모두 기계 확인으로 확정. 다만 V01 이 소비처를 정독해 **"전면 불능/빈 화면"은 과대평가**임을 밝혔다 — 연차원장.tsx:113 은 `ledgerError` 를 throw 하지 않고(`:117-119` 는 `error`/`auditError`/`balanceError` 만 검사) `balanceData` 폴백으로 내려가 total/used/remaining 을 0 으로 표시하며, 나머지 5곳도 balance 폴백을 갖고 있다. 실제 증상은 "조용한 오답(잔여 0일)" → V12 의 P0 을 기각하고 P1 채택.
- **수정 방향**: `policies.ts` 에 `leave_ledger` 를 `SELF_OR_SAME_COMPANY`(select) / `ADMIN_OR_MANAGER`(insert·update) / `ADMIN_ONLY`(delete), `staffIdField:'staff_id'` 로 명시 등록한다. (난이도 M · 회귀위험 높음 · 묶음 FB2 · 선행 FB3)

### D01-D01 · P1 · virtual_account_deposits 가 MANAGE_COMPANY 로만 열려 extra 권한 보유자에게 빈 목록 (7차 A3-01 · PARTIAL)

- **근본원인 축**: S3 정책 레지스트리 누락·과소개방
- **위치**: `lib/db/auth/policies.ts:1277-1293,1361-1367`, `app/main/모바일/추가기능/data-hooks.ts:1066`, `lib/data/dashboard-widgets.ts:111`
- **결함**: 7차가 지목한 `ADMIN_ONLY_ALL` 3종 중 `handover_notes`·`discharge_reviews` 는 `AUTHENTICATED` 로 명시 등록되어 닫혔다(`:1277-1293`). 그러나 `virtual_account_deposits` 는 `select:'MANAGE_COMPANY'`(`:1361-1367`) 이고 `erp_can_manage_company = Boolean(perms.admin || perms.mso || perms.hr)`(`lib/d1-api-helpers.ts:89`) 이므로, **화면 게이트는 `extra_입금실시간조회` 인데 데이터 게이트는 hr/mso/admin** 이라는 불일치가 남는다.
- **도달 경로**: 모바일 추가기능 허브(`허브.tsx:52,59-72` → `canAccessExtraFeature`) → 입금조회 카드 → `useDeposits` → `/api/d1/query` → `filterByPolicy` 전건 탈락 → 200 + 빈 배열(에러 없음).
- **영향**: 권한을 정상 부여받은 비-hr 사용자에게 위젯이 조용히 빈 목록으로 실패한다. 전용 라우트 `/api/payments/virtual-account-deposits` 경유 화면은 정상이라 재현이 화면별로 갈린다.
- **검증**: V01 은 소비처가 관리자 화면일 가능성을 남겨 P2 로 봤으나, V11 이 소비처 2곳을 각각 확인해 `dashboard-widgets.ts:111` 은 ExecDashboard(관리자 전용, admin 우회로 정상)이고 **모바일 입금조회는 관리자 화면이 아님**을 확정 → "권한 보유자에게 무에러 빈 목록 = 조용한 실패"로 P1 채택.
- **수정 방향**: `virtual_account_deposits.select` 를 `COMPANY_SCOPE_OR_NULL` 로 낮추고 추가기능 권한 검사는 화면/전용 라우트에 맡긴다. (난이도 M · 회귀위험 높음 · 묶음 FB2 · 선행 FB3)

### D01-D06 · P1 · ADDITIONAL_PUBLIC_TABLES 의 이름-동작 정반대 + board_post_stars 무음 사멸 (7차 A12-03 · PARTIAL)

- **근본원인 축**: S3 정책 레지스트리 누락·과소개방
- **위치**: `lib/db/auth/policies.ts:848,957,987,993-1006,1370-1375`, `app/main/모바일/게시판/별표훅.ts:21,53-66`
- **결함**: 루프 주석-코드 모순은 해소됐고(`:1372` "자동 PUBLIC_ALL 부여 제거 — 미등록 테이블은 Default Deny"), `:993-1006` 블록이 문제 테이블 다수를 최소권한으로 명시 등록해 구제했다. 그러나 상수 이름은 여전히 `ADDITIONAL_PUBLIC_TABLES`(공용)인데 실제 부여 결과는 `ADMIN_ONLY_ALL` 이다 — `for (const tableName of ADDITIONAL_PUBLIC_TABLES) { if (!POLICY_REGISTRY[tableName]) { POLICY_REGISTRY[tableName] = ADMIN_ONLY_ALL(tableName); } }`(`:1370-1375`). 목록에 남은 `board_post_stars`(`:957`)·`inventory_items`(`:987`)는 명시 등록이 없어 관리자 전용으로 강등된 채 비관리자 코드가 계속 호출한다. 같은 파일 주석(`:996-999`)이 7차 결함을 자인한다 — 85개 테이블을 관리자 전용으로 만들었고 그중 54개를 살아있는 코드가 호출하고 있었다는 취지.
- **도달 경로**: 비관리자 모바일 게시판 별표 토글 → `/api/d1/mutate` insert → 403 → LS 롤백 + "즐겨찾기 처리 실패" 토스트. **항상 재현.**
- **영향**: 게시판 즐겨찾기가 서버에 영구화되지 않고, 폴백도 동작하지 않아 눈에 보이는 실패가 된다.
- **검증**: 반증 두 갈래 중 하나만 성립. (a) 별표훅의 localStorage 폴백은 **작동하지 않는다** — `isMissingOrDeniedError`(`별표훅.ts:53-66`)는 `42501`/`permission denied`/`does not exist`/`relation` 만 보는데 서버 문구는 `PolicyDenied` 의 `"policy denied: insert board_post_stars"`(`policies.ts:1649`)라 매칭되지 않아 throw 로 빠진다. (b) `inventory_items` 지목은 **오귀속** — 이 테이블은 `schema.ts` 에도 로컬 D1 165개 테이블에도 없어 근본 원인이 정책 강등이 아니라 테이블 부재이며, `OP체크.tsx:552-556` 의 `relationNames` 폴백이 빈 배열로 흡수한다. V01 P2 vs V11 P1 충돌은 "재현율 100% 기능 파손"을 근거로 P1 채택.
- **수정 방향**: `board_post_stars` = `SELF_ONLY(user_id)` 로 명시 등록, `inventory_items` 는 삭제 또는 `inventory` 로 통합. 상수명을 `DEFAULT_DENY_TABLES` 로 바꿔 이름과 동작을 일치시킨다. (난이도 M · 회귀위험 높음 · 묶음 FB2 · 선행 FB3)

### D01-002 · P1 · master-login 의 '직원 없음' 분기가 실패 카운트를 올리지 않아 MASTER/ADMIN 자격증명이 무제한 대입 가능

- **근본원인 축**: S4 세션 스냅샷·권한 압축으로 서버측 권한 판정 붕괴
- **위치**: `app/api/auth/master-login/route.ts:217-220,254-321,334,419`
- **결함**: 실패 카운트는 `recordFailedAttempt(loginId, WINDOW_MS)` 로만 증가하는데 호출 지점이 `:334`(비밀번호 미설정 계정)와 `:419`(비밀번호 불일치) 두 곳뿐이다. `staff_members` 에 매칭 행이 없는 loginId 는 `if (!userRow) {`(`:254`) 분기를 타고 `:320` 의 `return failureResponse('아이디 또는 비밀번호가 일치하지 않습니다.');` 로 **카운트 증가 없이** 빠져나온다. `checkRateLimit` 은 `recordFailedAttempt` 가 만든 행만 읽고 행이 없으면 허용(`lib/rate-limit.ts:120-122`)하므로 이 키는 영구 허용이다. 같은 블록 `:299-318` 이 `privilegedLogin.kind==='master'` 를 명시 처리한다는 사실 자체가 "마스터 ID 는 staff_members 에 없다"는 설계 전제를 코드가 자인한 것이다.
- **도달 경로**: `MASTER_ID`/`ADMIN_NAME` 을 loginId 로 POST 하면 매 요청이 `:225` privilegedFallbackResponse → 실패 → D1 조회 → `!userRow` → `:320` 으로 흘러 카운트가 0 으로 유지된다. `.env.local` 에 `MASTER_ID`/`MASTER_PASSWORD_HASH`/`ADMIN_NAME`/`ADMIN_PASSWORD_HASH` 4개가 모두 설정돼 있어 경로가 살아 있다.
- **영향**: 시스템마스터(전 데이터 접근·데이터 초기화 권한) 비밀번호에 대해 네트워크 속도만큼의 온라인 대입이 가능하다. 잠금 UI 는 정상 동작하는 것처럼 보여 탐지도 어렵다.
- **검증**: 반증 실패. `:254-321` 블록 전체에 `recordFailedAttempt` 호출이 없음을 직접 확인. 다만 잠금 부재는 "접근 획득"이 아니라 방어선 소실이고 대상이 bcrypt 해시라 온라인 대입 속도가 제한되므로 P0→P1 강등. `D01-011`(rate-limit fail-open)과 결합하면 D1 장애 시 완전 무제한이 된다.
- **수정 방향**: `if (!userRow)` 분기의 모든 실패 반환 직전(`:320`)에 `recordFailedAttempt(loginId, WINDOW_MS)` 를 추가하고, 특권 로그인 실패는 loginId 키와 별개로 IP 키로도 카운트한다. (난이도 S · 회귀위험 중 · 묶음 FB3 · 선행 없음)

### D01-004 · P1 · 세션 토큰 권한 압축으로 finance_* 가 소실 — FINANCE_SCOPE 3테이블이 재무 담당자에게 전면 차단

- **근본원인 축**: S4 세션 스냅샷·권한 압축으로 서버측 권한 판정 붕괴
- **위치**: `lib/server-session.ts:136-154,291-312`, `lib/d1-api-helpers.ts:71-77,90`, `lib/db/auth/policies.ts:1336-1359,1538-1545`
- **병합**: `D01-005`(P2, `mypage_수정 === false` fail-open — 같은 압축이 만든 파생 결함)
- **결함**: `const SESSION_PERMISSION_KEYS = new Set(['admin','mso','system_master','hr','inventory','approval','hr_교대근무','hr_근무표생성']);`(`:136-145`) 와 `if (SESSION_PERMISSION_KEYS.has(key) || key.startsWith('menu_')) acc[key] = value === true;`(`:147-154`) 가 나머지 권한 키를 전부 버린다. `buildClaimsFromSession` 은 이 압축본만 보므로 `hasFinancePermission` 이 참조하는 `finance`/`finance_*` 는 절대 존재할 수 없고, `erp_can_manage_finance` 는 admin/mso 가 아닌 한 항상 false 다(`d1-api-helpers.ts:90`). `policies.ts:1542` 의 `if (!erpCanManageFinance(claims)) return false;` 에서 즉시 탈락한다. `d1-api-helpers.ts:66-70` 주석은 이 문제를 "고쳤다"고 적고 있으나 수정 층이 틀렸다.
  파생(`D01-005`): `app/api/profile-change-request/route.ts:38-41` 은 `perms.mypage_수정 === false` 일 때만 403 을 내는데 이 키도 압축에서 탈락한다. 게다가 `lib/profile-photo.ts:181` 의 `normalizeProfileUser` 가 `mypage_수정` 이 undefined 면 **true 로 채워 넣어** `=== false` 는 구조적으로 성립 불가 — 명시 차단이 서버에서 fail-open 이 된다.
- **도달 경로**: admin/mso 가 아닌 `finance_*` 보유자가 `app/main/기능부품/재무회계.tsx:114-128` 의 `db.from('journal_entries'|'fixed_assets'|'bank_accounts_sync')` 를 호출하면 `filterByPolicy` 가 전 행을 탈락시켜 빈 배열, 쓰기(`:224,:275`)는 403.
- **영향**: 복식부기 분개장·고정자산·금융연동이 재무 권한자에게 조용히 빈 화면이 된다. `/api/auth/session` 은 클라이언트에 DB 원본 권한을 돌려주므로(`route.ts:26,33`) **메뉴는 보이는데 데이터만 없다.**
- **검증**: 두 반증조건 모두 실패. (1) `finance_*` 는 실재하는 부여 가능 키다(`lib/access-control.ts:158-177` FINANCE_PERMISSION_KEYS 10종). (2) query/mutate 어느 쪽도 `resolveLatestSessionUser` 로 DB 원본 권한을 복원하지 않는다 — `query/route.ts:323` 은 압축된 토큰 권한으로 claims 를 만든다. 파생 `D01-005` 는 "승인 대기 요청 생성" 수준이라 P1→P2 로 강등된 뒤 본건에 병합.
- **수정 방향**: `compactSessionPermissions` 에 `finance`/`finance_*`(및 `mypage_*`) 프리픽스를 추가하거나, 서버 라우트가 `buildClaimsFromSession` 전에 `resolveLatestSessionUser` 로 DB 원본 permissions 를 복원해 claims 를 만든다. 파생 게이트는 `!== true` 기준 fail-closed 로 바꾼다. (난이도 S · 회귀위험 중 · 묶음 FB3 · 선행 없음 — 최우선 착수 가능)

### D01-018 · P1 · erpStaffId 의 UUID 정규식 강제로 SELF_ONLY·AUTHENTICATED 판정이 통째로 실패

- **근본원인 축**: S4 세션 스냅샷·권한 압축으로 서버측 권한 판정 붕괴
- **위치**: `lib/db/auth/claims.ts:48,50-54,73`, `lib/db/auth/policies.ts:1487,1518-1521,1547-1557,1576-1584,1863-1866`
- **결함**: `export function claimUuid(...) { if (typeof v !== 'string') return null; return UUID_RE.test(v.trim()) ? v.trim() : null; }`(`claims.ts:50-54`) 이고 `export const erpStaffId = (c: ErpClaims) => claimUuid(c, 'erp_staff_id');`(`:73`) 다. 반면 `userId()`(`lib/d1-api-helpers.ts:12-18`)는 시스템마스터에 `'9999'` 를 넣고 일반 계정에는 `staff_members.id` 원본 문자열을 넣는다. UUID 가 아니면 `erpStaffId` 가 null 이 되어 `SELF_ONLY`·`SELF_OR_SAME_COMPANY`·`APPROVAL_SCOPE` 가 전부 false 로 접힌다. 같은 파일이 이미 `claimsStaffIdRaw`(`policies.ts:1618`, 채팅 경로)라는 우회 헬퍼를 갖고 있다는 사실 자체가 UUID 가정이 깨진 적이 있음을 시사한다.
- **도달 경로**: R2 가 R1 사례보다 강한 **상시 재현 경로**를 찾았다 — 시스템마스터는 `erp_staff_id` 가 `'9999'` 로 강제되고 `claimUuid` 가 이를 null 로 만든다. 그런데 `AUTHENTICATED` 판정(`policies.ts:1487` `erpStaffId(claims)!==null`)이 관리자 단축(`:1489`, `filterByPolicy` 는 `:1867`)보다 **앞**에 있어(`:1863-1866`), `MASTER_ID` 로 로그인한 시스템마스터가 `handover_notes`·`discharge_reviews`·`daily_closure_items`·`daily_checks` 등 AUTHENTICATED select 테이블 전부에서 빈 배열을 받는다.
- **영향**: 시스템마스터의 조회 기능이 상시 무음 실패. 비UUID 일반 계정에서는 본인 todo·결재·연차가 조용히 빈 목록이 되는 재현 난해한 장애가 된다.
- **검증**: "프로덕션 staff id 가 전부 UUID 면 실피해 0" 이라는 반증을 R2 가 위 경로로 무력화. 권한 우회가 아니라 과차단이므로 P2→P1 승격.
- **수정 방향**: `erpStaffId` 를 `claimsStaffIdRaw`(문자열 비교) 기반으로 통일하고, UUID 검증은 필요한 곳에서만 별도로 수행한다. (난이도 S · 회귀위험 중 · 묶음 FB3)

### D01-012 · P1 · 근태 GPS 반경 검증이 전적으로 클라이언트에 있고 localStorage 플래그로 해제 가능

- **근본원인 축**: S11 클라이언트 신뢰 경계 붕괴 — 계산·검증·PII 보호를 브라우저가 수행
- **위치**: `app/main/기능부품/마이페이지/출퇴근기록/index.tsx:623-632`, `app/main/모바일/내정보/출퇴근체크인.tsx:258-265`, `lib/db/auth/policies.ts:633-637`
- **결함**: 두 출퇴근 화면 모두 `const hasBypassFlag = window.localStorage.getItem('bypass_gps') === 'true'; if (isLocal || hasBypassFlag) { setDistance(0); return true; }` 로 거리 검사를 건너뛴다. 환경 분기가 없어 프로덕션 빌드에도 그대로 남는다. 서버에는 대응 검증이 없다 — `attendance` 정책은 `select/insert/update: 'STAFF_IN_SCOPE'`, `delete: 'SELF_ONLY'` 일 뿐 좌표·반경을 보지 않고 `guards`/`asyncGuards` 도 없다.
- **도달 경로**: 직원이 브라우저 콘솔에서 `localStorage.setItem('bypass_gps','true')` 한 줄이면 즉시. 쓰기 경로는 전용 라우트가 아니라 `db.from('attendance').update/insert` → `/api/d1/mutate` 다(`출퇴근기록/index.tsx:749,827-833`).
- **영향**: 병원 반경 밖 원격 출퇴근 체크가 가능해져 근태 데이터 무결성과 급여 산정 근거가 훼손된다.
- **검증**: 세 반증 모두 실패(전용 라우트 없음 · 정책 가드 없음 · NODE_ENV 분기 없음). GPS 는 본질적으로 클라이언트 제출값이라 서버 검증을 넣어도 완전 방어는 아니지만, 현재는 **검증 자체가 0** 인 상태이므로 P1 유지.
- **수정 방향**: bypass 를 `process.env.NODE_ENV !== 'production'` 로 한정하고, 출퇴근 기록을 전용 서버 라우트로 옮겨 서버가 좌표·반경을 재검증하도록 한다. (난이도 L · 회귀위험 높음 · 묶음 FB10 · 선행 FB3·FB1)

### D12-002 · P1 · [crossover] userId() SSOT 의 시스템마스터 분기가 13개 사본에 없어 마스터 세션이 13개 API 에서 401

- **근본원인 축**: S4 세션 스냅샷·권한 압축으로 서버측 권한 판정 붕괴
- **위치**: `lib/d1-api-helpers.ts:10-18`(정본), `app/api/realtime/stream/route.ts:12-17`, `app/api/realtime/tail/route.ts:31-36`, `app/api/chat-rooms/route.ts:42-47`, `app/api/inventory/po-receive/route.ts:35-38`, `app/api/auth/master-login/route.ts:178-196` (사본 총 13개: chat-rooms ×2 · realtime ×2 · inventory ×7 · d1/rpc ×2)
- **결함**: 정본은 `if (user.is_system_master === true || user.login_id === '9999' || user.employee_no === '9999') return '9999';`(`:12`) 로 마스터 세션을 매핑하지만, 13개 라우트의 로컬 `userId` 사본에는 이 분기가 없어 `user.id ?? user.user_id` 만 본다. `master-login` 의 마스터/관리자 폴백 세션은 `id:null` 이므로 이 경로들에서 `userId(null)` → null → 401 이 된다. 같은 세션이 `/api/d1/query`·`mutate` 는 SSOT 를 import 해 정상 통과하므로 **경로별로 인증 결과가 갈린다.**
- **도달 경로**: env 마스터 계정으로 로그인 → 실시간 스트림/tail · 채팅방 목록 · 재고 수불 7종 · 직원등록 라우트가 전부 401.
- **영향**: 마스터 계정 기능 전면 불능 + 감사 로그의 actor id 가 경로마다 달라지는 identity 불일치.
- **검증**: V09·V12 가 사본 13개 전량 실측으로 일치 확인. 권한 우회(더 열림)가 아니라 과차단이므로 P0 이 아닌 P1.
- **수정 방향**: 13개 라우트의 로컬 `userId` 를 삭제하고 `import { userId } from '@/lib/d1-api-helpers'` 로 교체(시그니처 동일, 기계적 치환). (난이도 S · 회귀위험 중 · 묶음 FB3)

---

### P2 항목 (CONFIRMED 12건 → 11행 · 압축)

| ID | 제목 | 위치 | 수정 방향 |
|---|---|---|---|
| D01-006 (S4) | `session.user.is_master`/`is_admin` 은 세션 스냅샷에 없어 관리자 판정 3곳이 항상 false. 실질 영향은 `notice-broadcast` 한 곳(나머지 2곳은 role/perms 폴백 존재) | `lib/server-session.ts:291-312`, `app/api/board/notice-broadcast/route.ts:154-166`, `app/api/storage/object/route.ts:80-82`, `lib/inventory-scope-guard.ts:10-13` | 세 곳 모두 `isAdminSession()`/`isSystemMasterSession()` 로 교체하고 두 필드 참조를 삭제 (FB3) |
| D01-007 (S4) | env ADMIN 폴백 로그인이 `id:null` 세션을 발급 → `userId()` 가 null 이라 d1 query·mutate 가 401. 동시에 `:254-321` 특권 분기 65줄이 도달 불가 사문 | `app/api/auth/master-login/route.ts:152-196,225-228,254-321`, `lib/d1-api-helpers.ts:10-18` | `privilegedFallbackResponse` 를 D1 staff 조회 뒤로 이동하거나 폴백 사용자에게 안정적인 합성 id 부여 (FB3) |
| D01-009 (S11) | `/api/consultation/transcribe` 가 `body.audioUrl` 을 검증 없이 `await fetch(audioUrl)`(`:111`) — 같은 저장소 `/api/download` 에는 `isAllowedPublicStorageUrl` 화이트리스트가 있는데 여기엔 없음 | `app/api/consultation/transcribe/route.ts:88-114,148-165`, `app/api/download/route.ts:13-20,38-43` | `isAllowedPublicStorageUrl` 적용 또는 URL 대신 R2 objectKey 만 받아 바인딩으로 직접 읽기 (FB10) |
| D01-010 (S2) | `/api/storage/object` 의 ACL 이 `chat/` 프리픽스에만 존재(`:61`) — approvals/·submissions/·contracts/ 등은 인증만 하면 R2 원본이 그대로 스트리밍 | `app/api/storage/object/route.ts:44-58,61-120,122-145` | 프리픽스별 ACL 테이블(chat/·approvals/·submissions/·contracts/)을 두고 미등록 프리픽스는 기본 거부 (FB2) |
| D01-014 (S1) | `/api/admin/verify-unlock` 의 레이트리밋 키 `unlock:${ip}:${userId}` 가 클라이언트 조작 가능한 `x-forwarded-for` 첫 값을 사용 — 헤더 회전으로 5회/5분 잠금 우회 | `app/api/admin/verify-unlock/route.ts:9-14,20-31,42-48` | 키를 userId 단독 또는 `cf-connecting-ip` 기반으로 교체 (FB1) |
| D01-015 (S4) | middleware 가 `verifySessionToken` 만 호출하고, 토큰 스냅샷에 `force_logout_at` 이 없어 `:343-349` 강제 로그아웃 검사가 사문 | `middleware.ts:19-24,37-39`, `lib/server-session.ts:291-312,342-349,414-420` | 스냅샷에 `force_logout_at` 을 포함시키거나 middleware 가 edge 에서도 D1 대조 (FB3) |
| D01-017 (S1) | `/api/d1/query` 의 `count:true` 가 행 단위 정책 테이블에서 `limit: MAX_LIMIT(1000)` 조회 후 `filtered.length` 를 반환 — 1000행 초과 시 조용한 과소 집계(관리자는 SQL COUNT 라 증상이 비관리자에게만) | `app/api/d1/query/route.ts:325-374` | 정책 조건을 SQL WHERE 로 내리거나 최소한 응답에 `approximate:true` + 캡 도달 여부 반환 (FB1) |
| D01-019 (S3) `+D01-D02` | `/api/consultation/analyze` 는 세션 id 유무만 검사 — 같은 기능의 `transcribe` 는 `readAuthorizedExtraFeatureUser(req,'수술상담')` 를 요구하는데 게이트가 불일치. 7차 A3-04 는 OPEN(단 'PHI 취득'은 성립하지 않아 P0→P2) | `app/api/consultation/analyze/route.ts:39-44`, `app/api/consultation/transcribe/route.ts:80-86` | analyze 도 `readAuthorizedExtraFeatureUser(request,'수술상담')` 로 교체 (FB2) |
| D01-021 (S3) | `/api/payments/virtual-account-webhook` 이 `providedToken = headerToken \|\| queryToken` 으로 query string 토큰 폴백을 허용, `console.warn` 만 출력 | `app/api/payments/virtual-account-webhook/route.ts:14-32` | 발신측 전환 확인 후 queryToken 폴백 제거, 과도기에는 경고 헤더 + 만료일로 강제 전환 (FB2) |
| D01-005 (S4) | 병합됨 → `D01-004` 본문 참조 (`mypage_수정 === false` 서버 게이트 fail-open) | `app/api/profile-change-request/route.ts:36-43`, `lib/profile-change-request.ts:54-57` | fail-closed(`!== true`) 로 전환 또는 압축 화이트리스트에 `mypage_*` 추가 (FB3) |
| D01-024 (S14) | 타 도메인 병합(`D13-019`) — `tests/security.spec.ts`·`tests/security/d1-policies.spec.ts` 가 playwright `testDir:'./tests/e2e'` 밖이라 D1 정책 회귀 테스트가 한 번도 실행되지 않음. **`D01-003`/`D01-016`/`D01-D03` 이 CI 에서 절대 잡히지 않는 구조적 원인** | `playwright.config.ts:4,73` | `projects` 에 security 프로젝트 추가 (FB13) |

### 타 도메인 대표로 병합된 P1 항목 (2건 · 본문은 해당 도메인 문서)

| ID | 대표 | 제목 | 위치 | 수정 방향 |
|---|---|---|---|---|
| D01-008 (S9) | `D07-001` | `/api/inventory/stock-consume` 이 세션만 검사하고 회사·부서 스코프를 보지 않음. `x-allow-deprecated-stock-consume: 1` 헤더 하나로 deprecated 가드 통과, `atomicStockConsumeWithLog` 내부에도 스코프 검증 없음 | `app/api/inventory/stock-consume/route.ts:38-55,66-81`, `lib/inventory-scope-guard.ts:26-49` | 라우트 삭제(호출자 0) 또는 `assertInventoryItemCompanyScope` 추가 (FB8) |
| D01-023 (S6) | `D02-012` | `absent-auto-create` 크론이 `wrangler.toml [triggers]` 에 없어 영구 미실행. CRON_SECRET 게이트 자체는 정상이라 수동 호출만 가능 | `cloudflare-worker.ts:84` | `wrangler.toml [triggers]` 에 `'30 15 * * *'` 추가 (FB5) |

### 타 도메인 crossover P2 (4건)

| ID | 제목 | 위치 | 수정 방향 |
|---|---|---|---|
| D08-023 (S4) | env 기반 관리자/마스터 로그인 세션의 `id:null` 때문에 `data-reset`·`staff-permission`·`force-logout` 이 401 — 비상 마스터가 잠금해제까지는 성공하고 실행 단계에서 막힌다(`D01-007`·`D12-002` 와 같은 뿌리) | `app/api/auth/master-login/route.ts:152-193`, `app/api/admin/data-reset/route.ts:100-106` | env 로그인 세션에도 안정적인 합성 id 부여 (FB3) |
| D12-017 (S4) | `master-login` 내부 관리자/마스터 사용자 객체 리터럴 3중(권한 블록 기준 6회) 반복 — 이미 미세 분화(fallback admin `employee_no:'1'` vs master `'0'`, 한 분기는 `system_master` 키 부재) | `app/api/auth/master-login/route.ts:160-196,255-318,372-417` | `buildPrivilegedUser(kind)` 헬퍼 + `ADMIN_PERMISSIONS`/`MASTER_PERMISSIONS` 상수로 리터럴 6개 대체 (FB3) |
| D12-013 (S4) | 모바일 HR 관리자 게이트(mso/menu_인사관리/관리자/매니저) 인라인 4중 복제 — 정본 `canMutateTeamAbnormal` 이 같은 디렉터리에 export 돼 있음. 현재 drift 없음 | `app/main/모바일/인사관리/data-hooks.ts:656-671` 외 4개 탭 | 인라인 useMemo 를 정본 호출로 교체(이름을 `canMutateHr` 로 일반화) (FB3) |
| D02-011 (S6, **PLAUSIBLE**) | 워커 WS 인증이 `String(env.SESSION_SECRET \|\| 'dev-only-session-secret-change-this')` 로 dev 기본 시크릿 폴백 — 프로덕션 미설정 여부가 `wrangler secret` 상태에 달려 저장소만으로 확정 불가. 위조로 얻는 것은 RealtimeHub 접속뿐이고 change 프레임에 데이터는 실리지 않음 | `cloudflare-worker.ts:282` | 프로덕션에서 기본값 폴백 제거, 미설정 시 503 (FB5) |

---

## 반증된 주장 (REFUTED)

9차 감사에서 같은 오탐을 반복하지 않기 위한 기록이다.

| ID | 제목 | 반증 근거 |
|---|---|---|
| D01-013 | work-shifts 두 라우트가 세션에서 제거되는 `hr_근무형태` 키로 권한을 판정 → 근무형태 담당자가 401 | `hr_근무형태` 는 **부여 가능한 권한 키가 아니다** — `lib/access-control.ts:95-124` HR_PERMISSION_KEYS 에도 `lib/feature-permissions.ts` 목록에도 없고, 저장소 전체에서 두 라우트의 조건문과 `access-control.ts:271` 별칭 의존성 선언에만 등장한다. 실효 게이트인 admin/mso/hr 셋은 압축 화이트리스트에 있어 정상 통과. 잔존물은 죽은 조건 2곳 + 권한 부족을 401 로 반환하는 상태코드 오용(둘 다 위생) |
| D01-020 | `/api/notifications/push-config` 가 전 라우트 중 유일하게 게이트가 전혀 없음 | 반환값 `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 는 정의상 공개값이며 `app/main/기능부품/알림시스템.tsx:640` 이 직접 참조해 **이미 클라이언트 번들에 인라인**된다. `Cache-Control: public, max-age=86400` + `revalidate = 86400` 도 의도적 공개 캐싱 설계의 증거. 결함이 아니라 설계이며, 남는 것은 "모든 API 는 게이트를 갖는다" 불변식의 예외를 명시하지 않은 문서화 누락뿐 |
| D01-022 | `/api/notifications/chat-push-flush` 가 임의 인증 사용자에게 전역 푸시 큐 드레인을 허용 | `processPendingChatPushJobs`(`lib/chat-push-dispatch.ts:1183-1215`)가 (a) 2분 이상 낡은 잡만 선택, (b) 락 선점을 dispatch 내부 CAS claim 에 위임, (c) 만료 잡은 발송 없이 닫는다 → 중복 발송·오배송이 구조적으로 차단. 자원 소모도 사용자별 분당 30회 · limit 상한 25 로 제한. "순서·시점 조작"은 성립하지 않으며 focus/online flush 라는 의도된 설계 |

---

## 7차 대비 델타

| 7차 ID | 8차 ID | 제목 | 판정 | 근거 |
|---|---|---|---|---|
| A3-01 | D01-D01 | 인계노트·퇴원심사·입금실시간조회 ADMIN_ONLY_ALL | **PARTIAL** | `handover_notes`·`discharge_reviews` 는 `AUTHENTICATED` 명시 등록으로 복구(`policies.ts:1277-1293`). `virtual_account_deposits` 만 `MANAGE_COMPANY` 로 남아 `extra_입금실시간조회` 보유 비-hr 계정이 모바일 위젯에서 빈 목록 |
| A3-04 | D01-D02 → D01-019 | `/api/consultation/analyze` 권한 게이트 부재 | **OPEN** | 인용 라인이 `:40-43` → `:41-44` 로 1줄 밀렸을 뿐 게이트는 세션 id 검사 하나뿐. 단 이 라우트는 업로드된 오디오만 분석하므로(`:53-60`) 7차가 근거로 든 '타인 PHI 열람'은 성립하지 않아 P0→P2 |
| A3-11 | D01-D03 | 마감보고 PUBLIC_ALL — 환자명·수납금액 유출 | **PARTIAL** | 부모 `daily_closures` 는 `COMPANY_SCOPE_OR_NULL` 로 수정(e7ae1756). PII 를 실제로 담은 자식 `daily_closure_items` 는 `AUTHENTICATED` ×4 로 그대로 → 핵심 피해가 경로만 바꿔 잔존(P0) |
| A12-01 | D01-D04 → D01-016 | mutate 판정≠실행(set 병합 + WHERE 전량) | **PARTIAL** | 정본 SELECT 판정 + set 병합 금지 + 201행 거부로 **7차 실증 공격은 닫힘**. 잔존분은 `catch` 폴백의 where∪set 합성행과 실행문 PK 미고정. R2 가 D1 100-바인드 한도를 이용한 결정론적 폴백 유발 경로를 특정 |
| A12-02 | D01-D05 | staff_members 비밀번호 해시 prefix oracle | **CLOSED**(query) / 신규 개방(mutate) | query 라우트는 `findSensitiveFieldUsage` 로 where·order·orFilters 전면 차단 → 7차 익스플로잇 소멸. 그러나 **mutate 라우트에 동일 검사가 0건**이라 200/403 차이로 같은 오라클이 성립(P0) |
| A12-03 | D01-D06 | `ADDITIONAL_PUBLIC_TABLES` 루프의 주석-코드 모순 | **PARTIAL** | 주석 재작성 + `:993-1006` 명시 등록으로 다수 테이블 구제. 상수명(공용)-동작(ADMIN_ONLY) 정반대와 `board_post_stars` 무음 사멸은 잔존. `inventory_items` 지목은 오귀속(테이블 자체가 부재) |
| A7-06 | D03-D11 → D01-001 | `leave_ledger` 미등록 테이블 조회 403 | **OPEN** | 정책 레지스트리에 여전히 부재(문자열 0건). 단 소비처 6곳 전부 `leave_balances` 폴백이 있어 증상은 빈 화면이 아니라 '잔여 0일' 오답 |

---

## 부록 A — API route 106개 전수 게이트 표

> R1 기계 스캔(정규식 export 메서드 + 게이트 호출 탐지) → 무게이트/세션전용 라우트는 정독 확인. 숫자는 파일 내 **최초 등장 라인**.
> 탐지 토큰 — 세션: `readSessionFromRequest`/`verifySessionToken`/`guardAuditAdmin`/`guardSystemMaster` · 권한: `isAdminSession`/`isSystemMasterSession`/`isNamedSystemMasterAccount`/`assertAccess`/`assertChatRoomMember`/`assertInventory*`/`permissions` 직접 참조/`CRON_SECRET` · rate-limit: `checkRateLimit`/`consumeRateLimit`
> **`middleware.ts` matcher 는 `/main/:path*` 뿐이므로 `/api/*` 는 middleware 보호를 전혀 받지 않는다**(`middleware.ts:38`). 각 라우트 자체 게이트가 유일한 방어선이다.

### A.1 집계

| 구분 | 건수 |
|---|---|
| 전체 route.ts | 106 |
| 세션·권한 토큰 둘 다 없음 | 8 (정독 결과 실제 무게이트는 **1건**) |
| 세션 O · 권한 토큰 X | 26 |
| 세션 O · 권한 O | 72 |
| rate-limit 보유 | 11 |
| cron(CRON_SECRET Bearer) | 18 |

### A.2 게이트 토큰 미탐지 8건 — 정독 판정

| 라우트 | 실제 게이트 | 판정 |
|---|---|---|
| `/api/admin/audit/backups/restore` | `export { POST } from '../restore'` → `guardSystemMaster` | 정상(간접) |
| `/api/calendar/feed` | `verifyCalendarFeedToken` 서명 토큰 | 정상(설계) |
| `/api/consultation/transcribe` | `readAuthorizedExtraFeatureUser(req,'수술상담')` | 정상(단 SSRF 별건 `D01-009`) |
| `/api/discharge-review` | `readAuthorizedExtraFeatureUser(req,'퇴원심사')` | 정상 |
| `/api/notifications/mark-read` | `_mark-read-handler.ts:47` 세션 + rate-limit | 정상(간접) |
| `/api/payments/virtual-account-deposits` | `readAuthorizedDepositUser` + 회사 스코프 | 정상 |
| `/api/payments/virtual-account-webhook` | 웹훅 토큰 or 세션+권한 | 정상(단 query token 폴백 잔존 `D01-021`) |
| **`/api/notifications/push-config`** | **없음** | **무게이트 — 반환값이 VAPID 공개키뿐이라 실피해 없음(`D01-020` REFUTED)** |

⇒ **완전 무게이트 라우트는 사실상 0건.** 문제는 "게이트가 없는 라우트"가 아니라 **"게이트가 있으나 판정 근거(session.permissions)가 소실·무효인 라우트"**다(§A.5).

### A.3 전수 표 — 비(非)cron 88개

| 라우트 | 메서드 | 세션검사 | 권한검사 | rate-limit | 비고 |
|---|---|---|---|---|---|
| `/api/admin/annual-leave/accrual-run` | POST | readSessionFromRequest:7 | isAdminSession:5 isSystemMasterSession:6 | — |  |
| `/api/admin/annual-leave/announce-run` | POST | readSessionFromRequest:13 | isAdminSession:11 isSystemMasterSession:12 | — |  |
| `/api/admin/annual-leave/diagnose` | GET,POST | readSessionFromRequest:7 | permissions:144 | — |  |
| `/api/admin/annual-leave/export-csv` | GET | readSessionFromRequest:7 | isAdminSession:5 isSystemMasterSession:6 | — |  |
| `/api/admin/annual-leave/manual-grant` | POST | readSessionFromRequest:2 | isNamedSystemMasterAccount:3 | — |  |
| `/api/admin/annual-leave/promotion-run` | POST | readSessionFromRequest:7 | isAdminSession:5 isSystemMasterSession:6 | — |  |
| `/api/admin/annual-leave/sync` | POST | readSessionFromRequest:4 | canAccess:5 | — |  |
| `/api/admin/approvals/reprocess-salary-increases` | POST | readSessionFromRequest:2 | isAdminSession:2 | — |  |
| `/api/admin/audit/anomalies` | GET | guardAuditAdmin:15 | guardAuditAdmin:15 | — |  |
| `/api/admin/audit/backups/restore` | POST | — | — | — | POST 를 ../restore 에서 re-export → guardSystemMaster 적용(간접) |
| `/api/admin/audit/backups` | GET,POST | guardAuditAdmin:24 | guardAuditAdmin:24 | — |  |
| `/api/admin/audit/payroll-outliers` | GET | guardAuditAdmin:15 | guardAuditAdmin:15 | — |  |
| `/api/admin/audit/restore` | POST | guardSystemMaster:20 | guardSystemMaster:20 | — |  |
| `/api/admin/audit/summary` | GET | guardAuditAdmin:32 | guardAuditAdmin:32 | — |  |
| `/api/admin/data-reset` | POST | readSessionFromRequest:26 | isAdminSession:26 | — |  |
| `/api/admin/force-logout` | POST | readSessionFromRequest:13 | isAdminSession:13 | — |  |
| `/api/admin/logo/upload` | POST | readSessionFromRequest:2 | isAdminSession:2 | — |  |
| `/api/admin/notifications/push-health` | GET | readSessionFromRequest:5 | isAdminSession:3 isSystemMasterSession:4 | — |  |
| `/api/admin/popups/delete` | POST | readSessionFromRequest:2 | isAdminSession:2 | — |  |
| `/api/admin/popups/upload` | POST | readSessionFromRequest:2 | isAdminSession:2 | — |  |
| `/api/admin/reset-staff` | POST | readSessionFromRequest:9 | isAdminSession:9 | — |  |
| `/api/admin/seal/upload` | POST | readSessionFromRequest:2 | isAdminSession:2 | — |  |
| `/api/admin/staff-password` | POST | readSessionFromRequest:2 | isAdminSession:2 | — |  |
| `/api/admin/staff-permission` | POST | readSessionFromRequest:20 | isAdminSession:20 permissions:31 | — |  |
| `/api/admin/system-master` | GET,POST,DELETE | readSessionFromRequest:5 | isNamedSystemMasterAccount:6 | — |  |
| `/api/admin/verify-unlock` | POST | readSessionFromRequest:3 | isAdminSession:3 | checkRateLimit:4 rateLimit:22 | 레이트리밋 키에 x-forwarded-for(`D01-014`) |
| `/api/ai/chat` | POST | readSessionFromRequest:3 | — | — |  |
| `/api/ai/roster-recommendation` | POST | readSessionFromRequest:5 | — | — |  |
| `/api/annual-leave/summary` | GET | readSessionFromRequest:2 | canAccess:3 | — |  |
| `/api/approval/recall` | POST | readSessionFromRequest:14 | — | — |  |
| `/api/approval/upload` | POST | readSessionFromRequest:5 | — | — |  |
| `/api/approvals/process-final` | POST | readSessionFromRequest:6 | isAdminSession:6 canAccess:115 | — |  |
| `/api/approvals/transition` | POST | readSessionFromRequest:2 | isAdminSession:2 | — |  |
| `/api/approvals/upload` | POST | readSessionFromRequest:3 | — | — |  |
| `/api/auth/change-password` | POST | readSessionFromRequest:2 | — | checkRateLimit:16 |  |
| `/api/auth/master-login` | POST | — | permissions:57 | checkRateLimit:3 | 로그인 엔드포인트(무인증 정상). `!userRow` 분기에 recordFailedAttempt 누락(`D01-002`) |
| `/api/auth/session` | GET,DELETE | readSessionFromRequest:7 | — | — | DB 원본 권한을 클라이언트에 반환 / 쿠키에는 압축본 |
| `/api/auth/verify-password` | POST | readSessionFromRequest:3 | — | checkRateLimit:11 |  |
| `/api/board/notice-broadcast` | POST | readSessionFromRequest:2 | — | — | 세션 + `staff_members.role==='admin'`. `is_master`/`is_admin` 은 토큰에 없어 항상 false(`D01-006`) |
| `/api/board/upload` | POST | readSessionFromRequest:8 | canAccess:2 | — |  |
| `/api/calendar/feed` | GET | — | — | — | verifyCalendarFeedToken(서명 토큰) — 세션 불필요 설계 |
| `/api/calendar/feed-token` | GET | readSessionFromRequest:2 | — | — |  |
| `/api/chat/presence` | GET,POST,DELETE | readSessionFromRequest:18 | — | — |  |
| `/api/chat/quick-reply` | POST | readSessionFromRequest:6 | isAdminSession:6 assertChatRoomMember:12 | — |  |
| `/api/chat/read-cursors` | POST | readSessionFromRequest:16 | canAccess:19 | — |  |
| `/api/chat/typing` | GET,POST,DELETE | readSessionFromRequest:18 | assertChatRoomMember:20 | — |  |
| `/api/chat/upload` | POST | readSessionFromRequest:6 | assertChatRoomMember:16 | checkRateLimit:7 |  |
| `/api/chat-rooms` | POST | readSessionFromRequest:21 | isAdminSession:21 | — |  |
| `/api/chat-rooms/[id]` | PATCH | readSessionFromRequest:18 | isAdminSession:18 | — |  |
| `/api/consultation/analyze` | POST | readSessionFromRequest:2 | — | — | 세션만 — transcribe 와 달리 `extra_수술상담` 미검사(`D01-019`) |
| `/api/consultation/transcribe` | POST | — | — | — | readAuthorizedExtraFeatureUser(수술상담) — 세션+권한 O. 단 `body.audioUrl` 임의 fetch(`D01-009`) |
| `/api/d1/mutate` | POST | readSessionFromRequest:20 | assertAccess:157 | consumeRateLimit:163 | 폴백 fail-open(`D01-016`) · 민감컬럼 검사 부재(`D01-D05`) |
| `/api/d1/query` | POST | readSessionFromRequest:26 | — | consumeRateLimit:39 | ALLOWED_TABLES = POLICY_REGISTRY 키(`D01-001`) · count 캡(`D01-017`) |
| `/api/d1/rpc/increment-post-views` | POST | readSessionFromRequest:19 | — | — |  |
| `/api/d1/rpc/register-staff` | POST | readSessionFromRequest:28 | permissions:54 | — | hasHrPermission(hr 포함) — permissions/role 을 body 로 지정 가능(`D01-003` 권한 상승) |
| `/api/discharge-review` | POST | — | — | — | readAuthorizedExtraFeatureUser(퇴원심사) — 세션+권한 O |
| `/api/download` | GET | readSessionFromRequest:3 | — | — | `isAllowedPublicStorageUrl` 화이트리스트 보유(대조군) |
| `/api/inventory/closing` | GET,POST | readSessionFromRequest:17 | isAdminSession:17 permissions:43 | — |  |
| `/api/inventory/po-inspect` | POST | readSessionFromRequest:16 | assertInventoryCompanyScope:20 assertInventoryItemCompanyScope:20 | — |  |
| `/api/inventory/po-receive` | POST | readSessionFromRequest:13 | assertInventoryCompanyScope:17 assertInventoryItemCompanyScope:17 | — |  |
| `/api/inventory/stock-consume` | POST | readSessionFromRequest:14 | — | — | 세션만 + `x-allow-deprecated-stock-consume:1`. 재고 스코프 검사 없음(`D01-008`) |
| `/api/inventory/stock-post` | POST | readSessionFromRequest:15 | assertInventoryItemCompanyScope:16 | — |  |
| `/api/inventory/stock-transfer` | POST | readSessionFromRequest:24 | assertInventoryCompanyScope:27 assertInventoryItemCompanyScope:27 | — |  |
| `/api/inventory/stock-update` | POST | readSessionFromRequest:11 | assertInventoryItemCompanyScope:12 | — |  |
| `/api/license-ce/ocr` | POST | readSessionFromRequest:9 | permissions:120 | — |  |
| `/api/license-ce` | GET,POST | readSessionFromRequest:9 | permissions:20 | — |  |
| `/api/license-ce/[id]` | PATCH,DELETE | readSessionFromRequest:8 | permissions:21 | — |  |
| `/api/notifications/chat-push` | POST | readSessionFromRequest:2 | — | consumeRateLimit:4 |  |
| `/api/notifications/chat-push-flush` | POST | readSessionFromRequest:2 | — | checkRateLimit:3 | 전역 드레인 허용 — 의도된 설계(`D01-022` REFUTED) |
| `/api/notifications/mark-read` | POST | — | — | — | `_mark-read-handler` 에서 readSessionFromRequest + checkRateLimit(120/분) |
| `/api/notifications/push-config` | GET | — | — | — | 게이트 없음 — VAPID **공개키**만 반환(설계상 공개) |
| `/api/notifications/push-self-test` | POST | readSessionFromRequest:6 | — | checkRateLimit:7 |  |
| `/api/notifications/push-subscription` | POST,DELETE | readSessionFromRequest:2 | — | — |  |
| `/api/notifications/repush-unread` | POST | readSessionFromRequest:2 | — | checkRateLimit:4 |  |
| `/api/notifications` | GET,POST,PUT,DELETE | readSessionFromRequest:1 | permissions:15 hasPermission:3 | — |  |
| `/api/payments/virtual-account-deposits` | GET,POST,PATCH,DELETE | — | — | — | readAuthorizedDepositUser(입금실시간조회) + 회사 스코프 |
| `/api/payments/virtual-account-webhook` | POST | — | — | — | VIRTUAL_ACCOUNT_WEBHOOK_TOKEN(header/query) 또는 세션+권한(`D01-021`) |
| `/api/profile-change-request` | POST | readSessionFromRequest:23 | permissions:39 | — | `mypage_수정 === false` 게이트 fail-open(`D01-005`) |
| `/api/realtime/stream` | GET | readSessionFromRequest:1 | — | — | 로컬 userId 사본(`D12-002`) |
| `/api/realtime/tail` | GET | readSessionFromRequest:18 | — | — | 로컬 userId 사본(`D12-002`) · 임의 컬럼 등가필터(`D06-001`) |
| `/api/roster/approval-request` | POST | readSessionFromRequest:2 | permissions:77 | — |  |
| `/api/staff/profile-photo/upload` | POST | readSessionFromRequest:3 | permissions:57 | — |  |
| `/api/storage/object` | GET | readSessionFromRequest:6 | assertChatRoomMember:7 | — | 세션 + `chat/` 경로만 멤버십 ACL. 그 외 키는 인증만 하면 열람(`D01-010`) |
| `/api/submission/upload` | POST | readSessionFromRequest:5 | — | — |  |
| `/api/todos/reminders/dispatch` | POST | readSessionFromRequest:2 | — | — |  |
| `/api/weather` | GET | readSessionFromRequest:2 | — | — |  |
| `/api/work-shifts/bulk-deactivate` | POST | readSessionFromRequest:16 | permissions:30 hasPermission:27 | — | `hr_근무형태` 죽은 조건(`D01-013` REFUTED) |
| `/api/work-shifts` | POST | readSessionFromRequest:16 | permissions:43 hasPermission:40 | — | 권한 부족을 401 로 반환(상태코드 오용) |

### A.4 cron 18개 (전부 `Bearer ${CRON_SECRET}` 검사)

| 라우트 | 메서드 | 세션검사 | 권한검사 | rate-limit | 비고 |
|---|---|---|---|---|---|
| `/api/cron/absent-auto-create` | GET | — | CRON_SECRET:12 | — | 트리거 미등록으로 영구 미실행(`D01-023`→`D02-012`) |
| `/api/cron/annual-leave-accrual` | GET | — | CRON_SECRET:8 | — |  |
| `/api/cron/annual-leave-expiry` | GET | — | CRON_SECRET:8 | — |  |
| `/api/cron/annual-leave-promotion` | GET | — | CRON_SECRET:7 | — |  |
| `/api/cron/appointment-apply` | GET | — | CRON_SECRET:20 | — |  |
| `/api/cron/auto-report` | GET | — | CRON_SECRET:17 | — |  |
| `/api/cron/backup` | GET | — | CRON_SECRET:8 | — |  |
| `/api/cron/birthday-announcements` | GET | — | CRON_SECRET:6 | — |  |
| `/api/cron/chat-push-dispatch` | GET | — | CRON_SECRET:4 | — |  |
| `/api/cron/chat-retention` | GET | — | CRON_SECRET:12 | — |  |
| `/api/cron/inapp-notifications` | GET | — | CRON_SECRET:32 | — |  |
| `/api/cron/leave-notice-announcements` | GET | — | CRON_SECRET:4 | — |  |
| `/api/cron/license-expiry-check` | GET | — | CRON_SECRET:7 | — |  |
| `/api/cron/payroll-notice` | GET | — | CRON_SECRET:7 | — |  |
| `/api/cron/push-subscription-cleanup` | GET | — | CRON_SECRET:31 | — |  |
| `/api/cron/substitute-holiday` | GET | — | CRON_SECRET:8 | — |  |
| `/api/cron/todo-reminders` | GET | — | CRON_SECRET:7 | — |  |
| `/api/cron/unread-notification-repush` | GET | — | CRON_SECRET:7 | — |  |

> 18개 라우트 전부 `CRON_SECRET` 을 비상수시간 문자열 비교(`!==`)로 검증한다(`D02-010`, S6 도메인 소관).

### A.5 표에서 바로 읽히는 구조적 문제

1. **세션 토큰의 권한 압축**(`compactSessionPermissions`, `lib/server-session.ts:136-154`) — 토큰에 남는 권한 키는 `admin, mso, system_master, hr, inventory, approval, hr_교대근무, hr_근무표생성` + `menu_*` **뿐**이다. 그런데 서버 라우트/정책이 읽는 세분 키는 그 밖에도 있다.

   | 읽는 곳 | 키 | 토큰 잔존 | 결과 |
   |---|---|---|---|
   | `lib/d1-api-helpers.ts:71-77` `hasFinancePermission` | `finance`, `finance_*` | ✕ | `erp_can_manage_finance` 항상 false → FINANCE_SCOPE 3테이블 전면 차단(`D01-004`) |
   | `app/api/work-shifts/route.ts:48`, `bulk-deactivate:35` | `hr_근무형태` | ✕ | 부여 불가 키를 보는 죽은 조건(`D01-013` REFUTED) |
   | `app/api/inventory/closing/route.ts:45` | `inventory_월마감` | ✕ | `inventory` 폴백이 있어 실피해 경미 |
   | `app/api/profile-change-request/route.ts:40` | `mypage_수정 === false` | ✕ | **fail-open** — 차단 대상이 통과(`D01-005`) |

2. **`session.user.is_master` / `is_admin` 은 세션 스냅샷(`createSessionUserSnapshot`, `lib/server-session.ts:291-312`)에 아예 없다.** 이 두 필드를 관리자 판정에 쓰는 3곳은 항상 false 로 접힌다 → `notice-broadcast`(role='admin' 계정만 통과), `storage/object`, `lib/inventory-scope-guard.ts:11`(`D01-006`).

3. **`/api/auth/session` GET 은 DB 원본 권한 전체를 클라이언트에 돌려주지만(`:33`), 쿠키에는 압축본만 넣는다(`:43`).** 클라이언트 `lib/access-control.ts` 는 전체 키로 판정하고 서버는 압축본으로 판정 → **화면에는 보이는데 API 는 거부**하는 비대칭이 구조적으로 발생한다. FB3(세션 권한 복원)이 최우선 착수 대상인 이유다.

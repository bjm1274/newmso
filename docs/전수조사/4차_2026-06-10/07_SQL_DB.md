# 4차 전수조사 — ⑦ SQL·DB (2026-06-10)

> 범위: D1 마이그레이션 13개(lib/db/migrations) + supabase_migrations 98개 + 코드 내 raw SQL 19곳 + 스키마 정합성
> 현역 DB: **D1 단독** (wrangler.toml `DATA_BACKEND="d1"`, binding `DB`→`pchos-d1`. supabase_migrations는 컷오버 전 히스토리)
> ✅표시 = Opus 직접 재확인 완료

## CRITICAL

### [C-1] D1 미존재 테이블 5종 — 런타임 무음 기능불능 ✅
schema.ts·lib/db/migrations·실적용 스키마(scripts/migrate-d1/output/d1_schema_final.sql) **3중 확인 결과 모두 부재**:

| 테이블 | 참조 코드 | 깨지는 기능 |
|--------|----------|------------|
| `education_completions` | `인사관리서브/교육내역/education-utils.ts:150,202` | 교육 이수 기록 |
| `email_queue` | `급여명세서발송.tsx:142` | 급여명세서 이메일 발송 |
| `leave_policies` | `CompanyLeaveTab.tsx:84` | 회사별 연차정책 |
| `nurse_schedules` | `간호근무표.tsx:226` | 간호근무표 |
| `work_type_change_history` | `hr-history-ledger.ts:151` | 근무유형 변경 이력 |

호출 시 "no such table" — supabase-compat 폴백이 빈 결과로 삼키면 **화면은 멀쩡해 보이고 데이터만 영원히 비는** 3차 조사와 동일 패턴. 테이블 신설(0007 방식) 또는 기능 제거 결정 필요.

### [C-2] D1 공식 마이그레이션 체인 재현 불가
- `0000_lovely_alice.sql:1-3` — **전체 주석 처리** ("uncomment before executing"). 기반 스키마가 공식 체인에 없음.
- `meta/_journal.json` — entries가 idx 0·9·10뿐. **0001~0008, 0011~0012 누락**.
- idx 10 태그 `0010_married_stardust` ↔ 실파일 `0010_company_payroll_policies.sql` **불일치** — 도구가 태그로 파일을 찾으면 실패.
- 실제 스키마는 `d1_schema_final.sql`을 수동 적용한 상태로 추정 — 새 환경 구축·로컬 재현·롤백이 공식 절차로 불가능.

### [C-3] 0000 마이그레이션 내 빈 컬럼 인덱스 5개 (주석 해제 시 즉시 문법 오류)
- `0000_lovely_alice.sql:542, 830, 1304, 1306, 1338`
- `CREATE UNIQUE INDEX ... ON 테이블 (``);` — drizzle introspect 버그 산출물. 예: `department_private_inventory_unique_item`, `idx_inventory_categories_parent_name`, `idx_op_check_templates_surgery_name`. C-2 정리 시 함께 수정 필수.

### [C-4] 런타임 DDL 패치 — 마이그레이션 이중 관리 ✅
- `app/api/d1/query/route.ts:327-345`, `app/api/d1/mutate/route.ts:267-288`
- 매 요청 `CREATE TABLE IF NOT EXISTS disciplinary_committees` + UNIQUE INDEX 실행. `0012_add_disciplinary_committee_table.sql`(IF NOT EXISTS 없음)과 이중 관리 + schema.ts:731 인덱스 정의와 3원화. 정식 마이그레이션 일원화 후 라우트에서 제거.

## MAJOR

| # | 파일 | 분류 | 내용 |
|---|------|------|------|
| M-1 | `lib/notification-utils.ts:272-276` ✅ | SQL오류 | sql 태그에 JS 배열 IN 직접 바인딩 — inArray() 필요. 상세 [02_라이브러리.md](02_라이브러리.md) |
| M-2 | `lib/db/migrations/0004, 0005, 0011` | 마이그레이션 | ALTER TABLE ADD COLUMN — 재실행 시 duplicate column 실패(멱등성 없음) |
| M-3 | `0012_add_disciplinary_committee_table.sql:1` | 마이그레이션 | CREATE TABLE에 IF NOT EXISTS 없음 — 런타임 DDL이 이미 만든 환경에서 실패 |
| M-4 | `supabase_migrations/` 98개 전체 | 정보+위험 | Postgres 전용 문법(gen_random_uuid 121회·JSONB 73회·RLS/POLICY 121회·plpgsql 26회) — D1 직접 적용 시 전부 실패. 히스토리 보관임을 README로 명시하거나 `docs/_archive`로 이동 권장 |
| M-5 | `supabase_migrations` 내 16개 테이블 중복 CREATE | 마이그레이션 | leave_requests 등은 파일 간 컬럼 정의도 상이(attachment 유무·CHECK 차이) — 히스토리 신뢰성 저하 |
| M-6 | `supabase_migrations/20260529_d1_polling_indexes.sql` | 마이그레이션 | **D1용 폴링 인덱스 10종이 D1 마이그레이션 폴더가 아닌 supabase_migrations에 위치** — 실제 D1 적용 여부 확인 불가. 폴링 성능 직결(idx_messages_created_at 등) |

## MINOR

| # | 파일 | 내용 |
|---|------|------|
| m-1 | `lib/db/schema.ts:340 vs 1235` | chat_push_jobs.message_id→`messages` / message_read_status.message_id→`chat_messages` — 두 메시지 테이블 참조 혼재. 역할 구분 문서화 필요 |
| m-2 | `query.sql` (루트) | room_id 하드코딩 스크래치 쿼리 git 추적 중 — 삭제 |
| m-3 | `0000_lovely_alice.sql:236` | board_post_likes에 post_id 인덱스 없음(user_id만) — 좋아요 집계 풀스캔 |
| m-4 | `lib/db/migrations/meta/0000_snapshot.json` ↔ `0010_snapshot.json` | ~2,170줄 중복(jscpd) — drizzle 구조상 불가피하나 체인 정리 시 재생성 권장 |

## 오탐 기각 ✅

- ~~`leave_requests`·`license_continuing_education`·`medical_devices`·`message_bookmarks` 미존재~~ — **4종 모두 schema.ts와 d1_schema_final.sql에 실존 확인**. 이에 따라 "realtime stream/tail ALLOWED_TABLES가 미존재 테이블 폴링" critical 건도 **기각** (message_bookmarks·leave_requests는 실존 테이블).

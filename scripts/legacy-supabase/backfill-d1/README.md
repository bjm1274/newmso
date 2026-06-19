# Supabase → D1 Backfill 도구

Phase 3 준비용. dual-write가 적용된 테이블의 기존 Supabase 데이터를
Cloudflare D1으로 일괄 복사한다.

## 안전장치

- **DRY RUN 기본**: `--apply` 또는 `--output`을 명시하지 않으면 처음 5개
  INSERT만 콘솔 출력하고 끝낸다.
- **`INSERT OR IGNORE`**: dual-write로 이미 D1에 들어간 row와 충돌하면
  무시한다. PK·unique index만 충돌 기준이므로 다른 컬럼이 다를 때는
  Supabase 원본이 진실이 아니다(따로 reconcile 필요).
- **청크 단위**: 한 SQL 파일에 chunk 단위로 분할 INSERT문 생성. wrangler가
  단일 statement 길이 제한을 가지므로 청크당 ~200 rows 권장.
- **테이블 단위 실행**: `--table` 한 개씩 실행. 전체 backfill은 별도
  orchestrator(`run.mjs`, 향후 작업) 또는 shell 스크립트로 묶는다.

## 사용법

```bash
# 1. 환경변수 확인 (.env.local)
# NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

# 2. DRY RUN — 처음 5개 row의 변환 결과만 콘솔 출력
node scripts/backfill-d1/dump.mjs --table notifications

# 3. SQL 파일 생성
node scripts/backfill-d1/dump.mjs --table notifications \
  --output ./tmp/backfill/notifications.sql \
  --chunk 200

# 4. D1에 적용 (local 먼저 검증, 그 다음 remote)
npx wrangler d1 execute pchos-d1 --file=./tmp/backfill/notifications.sql --local
npx wrangler d1 execute pchos-d1 --file=./tmp/backfill/notifications.sql --remote

# 5. row count 검증
npx wrangler d1 execute pchos-d1 --command="SELECT COUNT(*) FROM notifications" --remote
```

## 지원 테이블 (Phase 2 dual-write 완료분)

| 순서 | 테이블 | 비고 |
|---:|---|---|
| 1 | notifications | metadata jsonb → text |
| 2 | audit_logs | details jsonb → text |
| 3 | todo_reminder_logs | unique=(user_id, todo_id, reminder_at) |
| 4 | org_teams | 단순 |
| 5 | system_settings | value jsonb → text, unique=key |
| 6 | generated_reports | summary jsonb → text |
| 7 | official_doc_log | is_received boolean → 0/1 |
| 8 | attendance | unique=(staff_id, date) |
| 9 | attendances | unique=(staff_id, work_date) |
| 10 | attendance_corrections | unique=(staff_id, attendance_date) |
| 11 | staff_transfer_history | 단순 |
| 12 | certificate_issuances | 단순 |
| 13 | messages | unique=id (FK reply_to_id self) |
| 14 | payroll_records | jsonb 컬럼 다수, unique=(staff_id, year_month, record_type) |
| 15 | push_subscriptions | unique=(staff_id, endpoint) |

> `roster_policy_settings`는 D1 dual-write는 적용돼 있으나 Supabase
> 측 테이블이 아직 없어 backfill 대상에서 제외. Supabase에 생성된 뒤
> [tables.mjs](./tables.mjs)에 항목 복원하면 된다.

## 부모(FK 참조) 테이블 — 1회성 backfill 필수

dual-write 적용 테이블의 FK 참조를 만족시키려면 다음 부모 테이블을
**자식 테이블보다 먼저** import해야 한다. 이들은 dual-write 대상이
아니므로 cutover 후 변경분은 D1에 sync 안 된다. 그래서 cutover 직전
다시 backfill하는 운영 규약이 필요.

| 부모 테이블 | 비고 |
|---|---|
| companies | leave_policy/payment_day 등 단순 컬럼 |
| staff_members | permissions jsonb→text, is_system_master 0/1 |
| chat_rooms | members/member_ids jsonb→text |
| approvals | meta_data/approver_line/approval_line jsonb→text |

적용 순서: `companies → staff_members → chat_rooms → approvals → (자식 15개)`

이 순서는 `BACKFILL_ORDER_PARENTS`/`BACKFILL_ORDER_CHILDREN` 상수로
[tables.mjs](./tables.mjs) 마지막에 export. dump/적용 스크립트가
사용한다.

자세한 컬럼/변환 정의는 [tables.mjs](./tables.mjs) 참고.

## 변환 규칙

Postgres → SQLite 자료형 매핑:

- `jsonb` / `json` → `JSON.stringify` 후 TEXT
- `boolean` → 0 또는 1 (INTEGER)
- `timestamp[ tz]` → ISO 8601 문자열
- `uuid` → TEXT 그대로
- `numeric` / `real` → 그대로
- `text[]` 같은 array → `JSON.stringify`
- `null` → SQL `NULL`
- D1에 존재하지 않는 컬럼(예: payroll_records.company_id) → 자동 제외

## 전체 125개 테이블 백필 (run.mjs)

`run.mjs`로 125개 활성 테이블 전체를 FK 순서대로 한 번에 백필할 수 있다.
테이블 정의는 `tables-full.mjs`에 있다.

```bash
# 1. DRY RUN — SQL 파일만 생성 (기본값, 안전)
node scripts/backfill-d1/run.mjs --dry-run

# 2. 특정 테이블만 dry-run
node scripts/backfill-d1/run.mjs --dry-run --only=companies,staff_members

# 3. D1 로컬에 적용 (검증용)
node scripts/backfill-d1/run.mjs --local

# 4. D1 production에 적용 (컷오버 직전 감독 하에 실행)
node scripts/backfill-d1/run.mjs --remote

# 5. 중단 후 재개 (완료된 테이블 건너뜀)
node scripts/backfill-d1/run.mjs --local --resume

# 6. 출력 디렉터리 지정
node scripts/backfill-d1/run.mjs --dry-run --output=./tmp/my-backfill
```

진행 상태는 `scripts/backfill-d1/.backfill-progress.json`에 저장된다.

### 파일 구조

| 파일 | 역할 |
|---|---|
| `tables.mjs` | 기존 24개 테이블 정의 (하위 호환) |
| `tables-full.mjs` | 125개 전체 테이블 정의 + FK 순서 |
| `dump.mjs` | 단일 테이블 SQL 생성 (125개 지원) |
| `normalize.mjs` | Supabase→SQLite 변환 함수 |
| `run.mjs` | 전체 오케스트레이터 |
| `run-helpers.mjs` | run.mjs 헬퍼 유틸리티 |

## 향후 작업

- 검증 스크립트 (Supabase row count vs D1 row count 비교)
- `wrangler d1 export` 방식과의 비교 (D1 단방향 export는 schema만 가능)

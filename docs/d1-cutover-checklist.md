# Supabase → D1 컷오버 체크리스트

작성일: 2026-05-17  
대상 단계: Phase 3-C (DATA_BACKEND='dual-write' 활성화)

이 문서는 `wrangler.toml`의 `DATA_BACKEND`를 `supabase` → `dual-write`로
바꾸기 전·후에 반드시 확인해야 할 항목을 정리한다.

## 1. 사전 조건

### 1.1 dual-write 적용 테이블

현재 dual-write 미러가 적용된 16개 테이블:

```
notifications, audit_logs, todo_reminder_logs, org_teams,
system_settings, generated_reports, official_doc_log,
attendance, attendances, attendance_corrections,
staff_transfer_history, certificate_issuances,
roster_policy_settings, messages, payroll_records,
push_subscriptions
```

미적용 hotspot (Phase 2.11–2.13 보류 — 클라이언트 → 서버 라우트 추출 필요):

```
chat_rooms (server delete만 일부), work_shifts, inventory
```

> 위 미적용 테이블은 컷오버 후에도 **클라이언트가 Supabase에 직접 쓰면**
> D1에 동기화되지 않는다. 'dual-write' 모드 자체는 Supabase 진실원이라
> 운영은 문제없지만, D1의 데이터는 stale 상태가 된다. 컷오버는 미적용
> 테이블에 대해서는 추후 클라이언트 작업과 묶어 다시 평가한다.

### 1.2 D1 스키마 준비

- [x] `lib/db/migrations/0000_lovely_alice.sql` 136 테이블 적용
- [x] `0001_unique_indexes_for_upsert.sql` 적용 (attendance 등 4개 unique)
- [x] `0002_payroll_records_unique.sql` 적용 (payroll_records 복합 unique)
- [ ] 위 마이그레이션이 **production D1**(`pchos-d1`,
      `e6e054c7-2bba-4a97-a740-b39a42906a74`)에 모두 적용됐는지 확인:
  ```bash
  npx wrangler d1 execute pchos-d1 --remote --command="SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';"
  ```

### 1.3 환경변수

- [ ] `wrangler.toml`의 `[vars].DATA_BACKEND` 현재 `"supabase"` 확인
- [ ] `[[d1_databases]]` binding 이름 `DB` 확인
- [ ] OpenNext 빌드 후 `getCloudflareContext().env.DB`가 binding을 인식하는지
      로컬에서 `wrangler dev --remote` 단발 호출로 확인

## 2. Backfill (코드 변경 전)

D1이 빈 상태라면 dual-write 모드 전환 직후부터 새 데이터만 D1에 들어간다.
기존 데이터를 채우지 않으면 `cleanup_chat_messages_by_retention` 같은
RPC 결과가 Supabase와 크게 달라진다.

### 2.1 DRY RUN

```bash
# 가장 작은 테이블부터 시작 (system_settings)
node scripts/backfill-d1/dump.mjs --table system_settings
node scripts/backfill-d1/dump.mjs --table org_teams
node scripts/backfill-d1/dump.mjs --table notifications
# ...
```

> 콘솔에 처음 5개 INSERT문이 출력된다. jsonb→text, boolean→0/1 변환이
> 정상인지 눈으로 확인. 변환 누락 시 `scripts/backfill-d1/tables.mjs`
> 보강 후 재실행.

### 2.2 SQL 파일 생성

```bash
mkdir -p tmp/backfill
for t in system_settings org_teams notifications audit_logs \
         todo_reminder_logs generated_reports official_doc_log \
         attendance attendances attendance_corrections \
         staff_transfer_history certificate_issuances \
         roster_policy_settings messages payroll_records \
         push_subscriptions; do
  node scripts/backfill-d1/dump.mjs --table "$t" \
    --output "tmp/backfill/$t.sql" --chunk 200 || break
done
```

### 2.3 로컬 적용 + 카운트 검증

```bash
# 로컬 D1에 먼저 (sandbox)
for f in tmp/backfill/*.sql; do
  npx wrangler d1 execute pchos-d1 --file="$f" --local || break
done

# 로컬 row count
npx wrangler d1 execute pchos-d1 --local \
  --command="SELECT 'notifications' AS t, COUNT(*) FROM notifications UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs;"
```

### 2.4 production D1 적용

```bash
# 한 테이블씩, 결과 확인하며 진행
npx wrangler d1 execute pchos-d1 --remote --file=tmp/backfill/system_settings.sql
npx wrangler d1 execute pchos-d1 --remote \
  --command="SELECT COUNT(*) FROM system_settings;"
```

### 2.5 Supabase ↔ D1 row count 비교

```bash
# Supabase 측 (psql 또는 supabase studio)
SELECT 'system_settings' AS t, COUNT(*) FROM system_settings
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
-- ...
;

# D1 측 (wrangler)
npx wrangler d1 execute pchos-d1 --remote --command="..."
```

오차 < 1% 면 dual-write가 시작된 후 갱신분 차이로 간주. 그 이상이면
backfill 누락 가능성 — 재실행.

## 3. 컷오버

### 3.1 wrangler.toml 변경

```diff
- DATA_BACKEND = "supabase"
+ DATA_BACKEND = "dual-write"
```

### 3.2 배포

```bash
npm run build:cloudflare
npm run deploy:cloudflare
```

### 3.3 즉시 확인 (배포 후 ~5분)

```bash
# Workers logs 실시간 모니터링
npx wrangler tail erp-pchos --format json --search 'd1_mirror_failure'

# 1분 안에 1건 이상 'd1_mirror_failure' 발생 시 → 롤백
```

## 4. 안정화 관찰 (24시간)

- `wrangler tail` 또는 Cloudflare 대시보드에서 `event:"d1_mirror_failure"`
  카운트 추이
- 발생 빈도 기준:
  - 0건 / 시간: 정상
  - 1~10건 / 시간: 특정 row의 데이터 타입 mismatch — `tables.mjs`/normalize
    함수 보강
  - 100건 / 시간 초과: 즉시 롤백 후 원인 분석
- `event:"d1_mirror_skipped"` 발생 시 → D1 binding 미접속. wrangler.toml /
  배포 상태 점검

### 4.1 주요 라벨별 카운트 쿼리

```bash
npx wrangler tail erp-pchos --format json \
  | grep '"event":"d1_mirror_failure"' \
  | jq -r '.label' | sort | uniq -c | sort -rn
```

## 5. 롤백

문제 발생 시 `DATA_BACKEND`를 다시 `"supabase"`로 되돌리고 재배포.

```diff
- DATA_BACKEND = "dual-write"
+ DATA_BACKEND = "supabase"
```

D1 측 데이터는 그대로 둔다 (drop하지 않음 — 다음 시도 시 idempotent 미러).
Supabase는 항상 진실원이므로 운영 영향 없음.

## 6. 차기 컷오버 (DATA_BACKEND='d1')

본 체크리스트는 `dual-write` 까지만 다룬다. `'d1'` 모드(Supabase 제거)는
다음 조건이 추가로 충족돼야 한다:

- [ ] 클라이언트 직접 호출(chat_rooms, work_shifts, inventory 등)이
      모두 서버 라우트 + dual-write로 전환
- [ ] read 경로가 D1 우선으로 전환 (현재 dual-write는 write만)
- [ ] Realtime 대체 메커니즘(Durable Objects 또는 polling) 검증
- [ ] RLS 175개 → POLICY_REGISTRY 전체 이식 (현재 ~15개)
- [ ] 최소 1주일 dual-write 무사고 운영

이 단계는 별도 프로젝트로 분리 권장.

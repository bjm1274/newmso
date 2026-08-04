# 8차 전수조사 — scripts·운영코드

> 감사일: 2026-08-03 · 대상 리비전: 7a7b7c21 · 판정: R1 감사 → R2 적대적 검증 완료

## 요약

`scripts/` 는 이 저장소에서 유일하게 **리뷰 게이트를 통과하지 않는 실행 코드** 영역이다. 2026-07-26 Cloudflare 계정 이전 작업의 잔해 71개가 untracked 로 작업트리에 그대로 남아 있고, 그중 39개가 살아있는 Cloudflare API 토큰을 평문 상수로 갖고 있는데, 정규 배포 진입점인 `npm run deploy` 가 `git add -A` → `git push origin main` 을 수행한다 — 다음 배포 1회로 자격증명이 원격에 올라가는 실경로가 지금 열려 있다(D11-009, 이 도메인 유일 P0).

두 번째 축은 **대상 DB 조준 오류**다. 계정 이전 이후 운영 DB 는 `pchos-d1-v2` 인데, 백업·복원·리포트 스크립트 13개가 여전히 폐기된 `pchos-d1` 을 겨눈다. 대부분은 "우연한 안전망"(구 DB 를 때리므로 운영 무해)이지만 `restore-d1-safe.mjs` 는 1단계에서 wrangler.toml 바인딩명 `DB` 로 마이그레이션을 적용해 실제로는 운영 v2 를 건드리고, 반대로 `migrate-and-insert-data.mjs`·`retry-failed-inserts.mjs`·`full-recalc-leave-ledger.mjs` 는 처음부터 v2 를 조준하면서 실행 게이트가 없다.

세 번째 축은 **게이트 커밋 7a7b7c21 의 미완성**이다. 인사 스크립트 4종에 `--yes` 게이트가 들어갔으나 같은 계열에서 가장 파괴적인 `full-recalc-leave-ledger.mjs` 가 빠졌고(D11-002), 동시에 `run-leave-accrual-d1.mjs` 의 rebalance 하위호출이 게이트에 걸려 **정상 운영 경로가 상시 실패**하는 회귀를 만들었다(D11-003). 즉 게이트는 가장 위험한 곳을 못 막고 안전한 곳을 막았다.

R2 적대적 검증은 심각도를 상당폭 조정했다 — 원 감사가 P0 로 본 3건은 "호출자 0인 untracked 잔해"라는 이유로 P1 로 내려갔고, 반대로 P1 이던 `deploy.mjs` 는 노출물이 계정 ID 가 아니라 **살아있는 API 토큰**임이 밝혀져 P0 로 올라갔다.

| 구분 | CONFIRMED | PLAUSIBLE | REFUTED |
|---|---|---|---|
| P0 | 1 | 0 | 0 |
| P1 | 7 | 0 | 0 |
| P2 | 16 | 1 | 1 |

(총 26건. `merged_into` 가 채워진 D11-902→D11-004, D11-903→D11-002 포함.)

---

## 옛 DB(`pchos-d1`) 참조 파일 전량 — 위험도 분류

운영 DB 는 `wrangler.toml:66-68` 의 `pchos-d1-v2` 다. 아래는 여전히 구 `pchos-d1` 을 문자열로 지정하는 파일 13개 전량이며, **파괴적**(구 DB 에 쓰기·삭제) / **오도성**(읽기지만 "성공" 보고로 운영자를 속임) / **읽기전용**(조회만, 오보 여지 낮음) 으로 분류했다.

| 위험도 | 파일 | 인용 | 게이트 | 비고 |
|---|---|---|---|---|
| 파괴적 | `scripts/recreate-d1.mjs:14` | `wrangler d1 delete pchos-d1 --skip-confirmation` | 없음 | 삭제 성공 후 `fs` 미임포트로 L28 크래시 (D11-006) |
| 파괴적 | `scripts/restore-d1.mjs:7` | `wrangler d1 execute pchos-d1 --remote --file=./backups/pchos-d1-dump.sql` | 없음 | D11-019 |
| 파괴적 | `scripts/restore-d1-safe.mjs:36` | 동일 패턴 | 없음 | **단, 같은 파일 `:17` 이 `wrangler d1 migrations apply DB --remote` — 바인딩명 `DB` 는 운영 `pchos-d1-v2` 로 해석된다.** 이 도메인에서 유일하게 구 DB 스크립트가 운영 DB 를 건드리는 접촉면 |
| 파괴적 | `scripts/restore-d1-chunked.mjs:66` | 동일 패턴 | 없음 | D11-019 |
| 파괴적 | `scripts/restore-d1-small.mjs:64` | 동일 패턴 | 없음 | D11-019 |
| 파괴적 | `scripts/restore-d1-with-fk-off.mjs:25` | 동일 패턴 | 없음 | D11-019 |
| 파괴적 | `scripts/legacy-supabase/backfill-d1/wipe-d1.mjs:39` | `wrangler d1 execute pchos-d1 … --file=tmp/wipe.sql` (125개 테이블 DELETE) | `--confirm` 있음 | DB명 하드코딩이라 `--db=pchos-d1-v2` 로 현행 DB 를 때릴 수 없음(V12 정정) |
| 파괴적(기본값) | `scripts/legacy-supabase/backfill-d1/run-helpers.mjs:137` | `applyToD1(sqlPath, mode, dbName = 'pchos-d1')` | — | `--db=` 로 v2 지정 가능한 유일 경로. 단 데이터 소스가 Supabase 라 `.env.local` 에 `SUPABASE_*` 부재 + 패키지 미설치로 SQL 생성 자체가 불가 |
| 파괴적(기본값) | `scripts/legacy-supabase/backfill-d1/run.mjs:66` | `dbName: 'pchos-d1'` (`:76` 에 `--db=NAME` 파싱) | — | 위와 동일 |
| 오도성 | `scripts/backup-cloudflare.mjs:43` | `npx wrangler d1 export pchos-d1 --remote --output=…` | 없음 | 실패해도 `:45-47` catch 가 exit 코드를 설정하지 않아 종료코드 0. 출력 경로도 `backups/cloudflare_migration/` 이라 복원 5종이 읽는 `backups/pchos-d1-dump.sql` 과 어긋남 (D11-004) |
| 오도성 | `scripts/export-leave-audit-xlsx.py:22` | `["npx","wrangler","d1","execute","pchos-d1","--remote","--json","--command", sql]` | 없음 | 리포트 표지에도 `:432` "데이터 소스: Cloudflare D1 pchos-d1 (remote)" 로 찍힘 (D11-005) |
| 오도성 | `scripts/export-leave-compare-xlsx.py:22` | 동일 패턴 (표지 `:442`) | 없음 | 기준일 `TODAY = date(2026, 7, 15)` 하드코딩 — 일회성 산출물 (D11-005) |
| 읽기전용 | `run-wrangler.js:3` | `wrangler.cmd d1 execute pchos-d1 --remote …` (생일봇 메시지 조회) | — | tracked 죽은 디버그 파일 (D11-015) |

**대조 — 현행 운영 DB(`pchos-d1-v2`)를 조준하면서 게이트가 없는 파괴적 스크립트 4종**(옛 DB 표와 별개, 훨씬 위험):

| 파일 | 동작 | 게이트 | id |
|---|---|---|---|
| `scripts/migrate-and-insert-data.mjs:15-33` | v2 삭제 → 재생성 → `wrangler.toml` 덮어쓰기 → 7월 구덤프 복원 | 없음 | D11-001 |
| `scripts/retry-failed-inserts.mjs:15-45` | `backups/d1_inserts` 778청크를 `PRAGMA foreign_keys = OFF` 로 v2 에 재주입 | 없음 | D11-007 |
| `scripts/full-recalc-leave-ledger.mjs:24-27,253-264` | `leave_ledger` auto 부여분 + `leave_accruals` 전량 DELETE 후 재계산 | 없음 (형제 4종에는 있음) | D11-002 |
| `scripts/clean-recreate-and-restore-d1.mjs:15-38` | v2 재생성 + toml 재작성 + `backups/d1_small_chunks` 639청크 복원 | 없음 (v2 존재 시 `d1 create` 실패로 우연히 차단) | D11-008 |

---

## 지적사항

### D11-009 · P0 · deploy.mjs 의 `git add -A` 가 untracked 71개 잔해를 통째로 커밋·푸시한다

- **근본원인 축**: S12 운영 스크립트·저장소 위생 — 구 DB 조준·실행 게이트 누락·자격증명/실명 PII 커밋
- **위치**: `scripts/deploy.mjs:123-131` (`package.json:15` `"deploy": "node scripts/deploy.mjs"`)
- **결함**: 정규 배포 진입점이 커밋할 파일을 선택하지 않는다.

  ```js
  // scripts/deploy.mjs
  L125: runCmd('git add -A');
  L126: runCmd(`git commit -m "${commitMsg}"`);
  L130: runCmd(`git push origin ${branch}`);
  ```

  `L100`·`L111` 에서 `git status --porcelain` 을 출력하긴 하나 **파일 선택·중단 옵션이 없고 커밋 메시지만 묻는다**. 그리고 `L126` 은 사용자 입력 메시지를 셸 문자열에 직접 보간해, 메시지에 `"` 나 셸 메타문자가 들어가면 명령이 깨지거나 의도치 않은 명령이 실행된다(자기 입력이므로 보안보다 신뢰성 문제).
- **도달 경로**: `npm run deploy` → `L100` 에서 `git status` 가 비어있지 않음(현재 untracked 71개) → `L125` `git add -A` → `L126` commit → `L130` `git push origin main` → 원격 `https://github.com/bjm1274/newmso.git`. **분기·조건 없이 다음 배포 1회로 즉시 발생한다.**
- **영향**: 원 감사는 "과거 계정 ID·인프라 구조 노출"로 평가했으나, R2 검증이 실제 노출물을 특정했다 — untracked 71개 중 **39개 파일이 Cloudflare API 토큰을 평문 상수로 보유**한다(예: `scripts/copy-r2-files.mjs:4,7`, `scripts/fast-copy-r2.mjs:4,7`, `scripts/add-pchos-cname.mjs:1` — 신계정 `cfoat_` 접두, 구계정 `cfut_` 접두 2종). `git ls-files` 로 39개 전부 tracked 0건임을 확인했으므로 **아직 git 이력에는 유입되지 않았고, 지금 정리하면 이력 오염을 피할 수 있다.** `.gitignore` 에 이들을 거르는 규칙은 없다.
- **검증**: V08 은 "운영자가 커밋할 파일만 워킹트리에 둔다"는 완화 조건을 반증했고(워킹트리에 71개 실재), 토큰 평문 39파일을 새로 발견해 P1→P0 로 상향했다. V12 는 P1 을 유지했으나 V13 이 직접 코드를 열어 토큰 실재와 push 경로를 확인하고 P0 을 채택했다(merge-log §3).
- **수정 방향**: `git add -A` 전에 상태를 보여주고 파일 선택을 확인, commit 은 `execFileSync('git', ['commit','-m',msg])` 로 인자 배열 전달. **단, 코드 수정보다 노출 자격증명 회전·폐기가 먼저다.** (난이도 S · 회귀위험 낮음 · 묶음 FB11)

### D11-001 · P1 · migrate-and-insert-data.mjs 가 현행 운영 DB 를 확인 없이 삭제 후 7월 구덤프로 재생성한다

- **근본원인 축**: S12 운영 스크립트·저장소 위생
- **위치**: `scripts/migrate-and-insert-data.mjs:15-33`
- **결함**:

  ```js
  L15: const dbName = 'pchos-d1-v2';                 // 현행 운영 DB (wrangler.toml:66-68 과 일치)
  L18: try { runWrangler(`npx wrangler d1 delete ${dbName} --skip-confirmation`); } catch (e) {}
  L31: const dumpPath = path.join('backups', 'pchos-d1-dump.sql');
  ```

  삭제(`L18`) → 재생성(`L19`) → `wrangler.toml` 의 `database_id` 덮어쓰기(`L25-28`) → 2026-07-26 이전 계정 덤프로 복원(`L31`). `--yes`·`--dry-run`·프롬프트 어떤 게이트도 없다.
- **도달 경로**: **자동 호출 경로 없음** — `package.json`·docs·다른 스크립트 어디에도 참조 0건. 운영자가 `node scripts/migrate-and-insert-data.mjs` 를 직접 치는 경우에만 실행되며, 그 1회로 운영 D1 이 삭제되고 `wrangler.toml` 이 새 빈 DB id 로 덮여쓰인다.
- **영향**: 운영 데이터(직원·근태·연차·급여·채팅) 7월 이후 전량 소실. 복원본은 인덱스를 잃는 이력이 있어(과거 D1 복원 인덱스 유실 → 푸시 큐 3일 정지 사고) 2차 장애까지 이어진다. 복구는 R2 백업 의존.
- **검증**: V08 이 falsifier(비대화형 거부·인증 실패)를 반증 — `node_modules/wrangler` 4.81.1 이 실제 설치돼 있고 cli 에 `--skip-confirmation` 이 존재하며, `.env.local` 의 `CLOUDFLARE_API_TOKEN` 이 주석 처리돼 있어 OAuth 세션에 의존하는데 운영자는 통상 로그인 상태다. `backups/pchos-d1-dump.sql`(67.7MB, 2026-07-26) 도 실재해 복원 소스가 갖춰져 있다. 심각도는 "P0 는 실제로 밟히는 경로를 요구한다"는 기준으로 **P0→P1** 재조정(호출자·문서·npm 스크립트 전무한 untracked 잔해), 다만 "DB 삭제는 도달성이 낮아도 P1 이상" 규칙으로 P2 강등은 막았다.
- **수정 방향**: untracked 상태이므로 즉시 `scripts/legacy-migration/` 아카이브 이동 또는 삭제. 남긴다면 dbName 검증 + `--yes` 게이트 + delete 단계 제거. (난이도 S · 회귀위험 낮음 · 묶음 FB11)

### D11-002 · P1 · full-recalc-leave-ledger.mjs 만 `--yes` 실행 게이트가 없다 (게이트 커밋 7a7b7c21 이 놓친 5번째 스크립트)

- **근본원인 축**: S12 운영 스크립트·저장소 위생
- **위치**: `scripts/full-recalc-leave-ledger.mjs:24-27`, `scripts/full-recalc-leave-ledger.mjs:253-264`
- **결함**: 게이트 커밋 7a7b7c21 은 정확히 4파일만 변경했다(`git show --stat` 확인). 같은 계열에서 가장 파괴적인 이 스크립트는 빠졌다.

  ```js
  L25: const DRY = args.includes('--dry-run');   // --yes 검사 없음
  L27: const DB = 'pchos-d1-v2';                 // 현행 운영 DB
  L255-257:
    DELETE FROM leave_ledger WHERE entry_type IN ('auto_monthly','auto_annual');
    DELETE FROM leave_ledger WHERE period_key LIKE 'auto-seed%';
    DELETE FROM leave_accruals;
  ```

  대조군 `scripts/reset-leave-usage.mjs:30-35` 에는 동일 목적의 `--yes` 게이트가 존재한다. 파일 헤더 Usage(`L9-12`)는 오히려 인자 없는 직접 실행을 안내한다.
- **도달 경로**: 호출자 0. 운영자가 `node scripts/full-recalc-leave-ledger.mjs` 를 직접 실행하면 게이트 없이 `L262` `d1File(wipeSql)` 로 진입. 원격 배치 실행이라 **트랜잭션이 없어** 중도 실패 시 wipe 만 반영된 반파 상태가 된다.
- **영향**: R2 검증이 원 감사보다 **강한 손실 근거**를 찾았다 — `L227` 의 staffs 조회는 전 직원 무필터 SELECT 인데 `L271-277` 재부여 루프는 비재직·그룹계정·`TEST_`·hire_date 불량자를 skip 한다. 즉 `DELETE FROM leave_accruals`(전역)와 재생성(필터)이 비대칭이라 **퇴사자 accrual 행은 영구 소실**된다.
- **검증**: 게이트 부재·즉시 wipe 는 확정. 원 감사의 "수동 입력분 소실" 근거는 **틀렸다** — `leave_accruals` 에 수동 입력 경로가 없고(`lib/annual-leave-accrual.ts` 가 `kind:'monthly'|'annual'` 만 INSERT), substitute 는 `leave_ledger` 로 간다(`lib/substitute-holiday.ts:163`). 자동 호출 경로 부재로 P0→P1.
- **수정 방향**: 형제 4종과 동일한 `--dry-run/--yes` 게이트 블록을 `L27` 아래 삽입. (난이도 S · 회귀위험 낮음 · 묶음 FB11) — 병합: D11-903(Pass B PARTIAL 판정)이 이 항목으로 흡수됐다.

### D11-003 · P1 · run-leave-accrual-d1.mjs 의 rebalance 하위호출이 게이트에 걸려 항상 실패한다 (게이트 커밋이 만든 회귀)

- **근본원인 축**: S12 운영 스크립트·저장소 위생
- **위치**: `scripts/run-leave-accrual-d1.mjs:292-304`, `scripts/rebalance-leave-balances.mjs:30-35`
- **결함**:

  ```js
  // run-leave-accrual-d1.mjs
  L295: execSync('node scripts/rebalance-leave-balances.mjs --active-only', …)   // --yes 미전달

  // rebalance-leave-balances.mjs
  L30: if (!process.argv.includes('--dry-run') && !process.argv.includes('--yes')) { … process.exit(1); }
  ```

  자식 프로세스는 `--active-only` 만 받으므로 게이트에서 100% exit 1 한다. 게이트는 자기 `process.argv` 만 검사하며 부모 argv·환경변수 상속 경로가 없다.
- **도달 경로**: `node scripts/run-leave-accrual-d1.mjs --yes` 실행 + 신규 부여분 존재(`inserts.length>0`, `L267` 조기종료 미해당) → `L288` `d1File(sql)` 로 **leave_accruals INSERT 가 이미 커밋됨** → `L295` 자식 exit 1 → `L301-303` catch → 부모 exit 1. **게이트 커밋 7a7b7c21 이후 항상 재현.**
- **영향**: 연차 자동부여 소급 실행 시 accrual 은 쌓이는데 `leave_balances` 재계산은 영구 미수행 → 화면 잔여연차 불일치. 게다가 스크립트가 실패 코드로 끝나므로 운영자가 "부여도 안 됐다"고 오판할 수 있다(실제로는 이미 커밋됨).
- **검증**: falsifier(부모 argv/env 상속으로 게이트 통과) 반증 실패. 게이트 도입이 만든 회귀임이 확정. P1 유지.
- **수정 방향**: `L295` 호출에 `--yes` 추가(부모가 이미 게이트를 통과했으므로) 또는 rebalance 게이트가 env 플래그(예: `OPS_CONFIRM=1`)도 인정하게. (난이도 S · 회귀위험 낮음 · 묶음 FB11)

### D11-007 · P1 · retry-failed-inserts.mjs 가 현행 운영 DB에 7월 마이그레이션 INSERT 를 게이트 없이 재주입한다

- **근본원인 축**: S12 운영 스크립트·저장소 위생
- **위치**: `scripts/retry-failed-inserts.mjs:15-45`
- **결함**:

  ```js
  L15: const dbName = 'pchos-d1-v2';                                   // 현행 운영
  L39: fs.writeFileSync(…, `PRAGMA foreign_keys = OFF;\n${line}`);     // FK 검증 끄고 문장 단위 원격 실행
  ```

  `backups/d1_inserts` 의 2026-07 계정이전 INSERT 문을 문장 단위로 쪼개 각각 FK 검사를 끄고 실행한다. `--yes`/`--dry-run` 게이트 없음. `L55-57` catch 는 실패를 `failCount` 로만 집계한다.
- **도달 경로**: 운영자 직접 실행만. 원 감사가 제시한 유일한 완화 조건("`backups/d1_inserts` 가 없으면 `L29` readdirSync 크래시")이 **이 머신에서 성립하지 않는다** — 디렉터리에 파일 778개가 실재한다.
- **영향**: 실행 시 2026-07-26 스냅샷 INSERT 가 운영 v2 에 재주입된다. 존재하는 PK 는 충돌로 실패 집계되지만 **그 이후 삭제된 행은 부활한다**(삭제된 직원/문서 복귀, FK 검증 꺼진 상태의 정합성 오염).
- **검증**: `ls backups/d1_inserts | wc -l` → 778 로 완화 조건 반증. 자동 경로는 없으나 정합성 오염이 되돌리기 어려워 P1 유지.
- **수정 방향**: 아카이브 이동. `backups/d1_inserts` 잔존 여부도 함께 정리. (난이도 S · 회귀위험 낮음 · 묶음 FB11)

### D11-010 · P1 · reset-leave-usage 와 full-recalc 의 잔액 산식이 'substitute' 처리에서 어긋난다

- **근본원인 축**: S8 연차 SSOT 단절 — leave_ledger 원장 vs staff_members 미러 이중 진실
- **위치**: `scripts/reset-leave-usage.mjs:266-277`, `scripts/full-recalc-leave-ledger.mjs:569-576`
- **결함**: "사이클과 무관하게 보존해야 하는 entry_type" 목록이 두 스크립트에서 다르다.

  ```js
  // reset-leave-usage.mjs L266-271 (isManualKeep)
  … entryType === 'initial_grant' || entryType === 'substitute';

  // full-recalc-leave-ledger.mjs L570-575 (isManual)
  manual_adjustment / manual_used_adjustment / manual_expire_adjustment
  / manual_compensate_adjustment / initial_grant       // ← 'substitute' 없음
  ```

  full-recalc 의 `L567` 은 `'auto-seed:'` 접두만 skip 하므로, substitute 행은 `L576` 의 `isWithinCycle` 필터에 걸려 현재 사이클 밖이면 총계에서 탈락한다. 즉 **어느 스크립트를 마지막에 돌렸는지에 따라 같은 원장에서 다른 잔액이 나온다.**
- **도달 경로**: 두 스크립트 모두 운영자 수동 실행. 직전 사이클 이전에 공휴일 근무 대체휴무를 받은 직원이 있는 상태에서 full-recalc 를 돌리면 그 부여분이 total 에서 빠진다.
- **영향**: 대체휴가를 받은 직원의 잔여연차가 full-recalc 실행 시 조용히 줄어드는 조건부 오계산.
- **검증**: falsifier("`substitute` 행이 실재하지 않거나 항상 사이클 내에서만 부여·사용") 반증 실패 — `lib/substitute-holiday.ts:163-166` 이 `entry_type:'substitute'`, `period_key:'substitute:{workDate}'`, `occurred_on=workDate` 로 INSERT 하고 크론(`cloudflare-worker.ts:77` → `app/api/cron/substitute-holiday/route.ts:29`)이 상시 배선돼 있다. `occurred_on` 은 공휴일 근무일이라 사이클 경계와 무관하다. P1 유지.
- **수정 방향**: 사이클-무관 보존 entry_type 목록을 공용 상수로 추출해 두 스크립트가 공유. (난이도 L · 회귀위험 높음 · 묶음 FB7 연차 SSOT 통일 · 선행 FB2·FB4)

### D11-019 · P1 · restore-d1 5종·wipe-d1·legacy backfill 의 대상이 전부 구 pchos-d1 — 그중 하나가 운영 DB 에 마이그레이션을 적용한다

- **근본원인 축**: S12 운영 스크립트·저장소 위생
- **위치**: `scripts/restore-d1.mjs:7`, `scripts/restore-d1-safe.mjs:24-36`(핵심은 `:17`), `scripts/legacy-supabase/backfill-d1/wipe-d1.mjs:39`, `scripts/legacy-supabase/backfill-d1/run-helpers.mjs:137`
- **결함**: 원 감사는 "`--db=pchos-d1-v2` 를 주면 7월 스냅샷이 현행 DB 를 덮어쓰는 열린 경로"를 주장했으나 **이 부분은 반증됐다**(아래 검증 참조). 대신 R2 검증이 감사자가 못 본 실제 접촉면을 찾았다.

  ```js
  // scripts/restore-d1-safe.mjs:17  ← 1단계
  runWrangler('npx wrangler d1 migrations apply DB --remote');
  ```

  여기서 `DB` 는 DB 이름이 아니라 **wrangler.toml 의 바인딩명**이라 현행 운영 `pchos-d1-v2` 로 해석된다. 파일명이 "구 DB 복원"인 스크립트의 1단계가 게이트 없이 운영 DB 에 마이그레이션을 건다.
- **도달 경로**: `node scripts/restore-d1-safe.mjs` 실행 → `:17` 즉시 운영 v2 에 `d1 migrations apply`(게이트 없음). 나머지 4종·wipe-d1 은 폐기 DB 만 건드리고, legacy backfill 은 Supabase 자격증명·패키지 부재로 실행 불가.
- **영향**: 복원 러너북을 잘못 고르면 운영 DB 스키마에 예기치 않은 마이그레이션이 적용된다. 나머지 4종은 "가짜 복원 성공" 오판(성공 로그를 믿지만 운영 v2 는 그대로).
- **검증**: 두 갈래로 갈렸다. **반증된 부분** — restore 5종과 `wipe-d1.mjs:39` 는 DB 이름을 하드코딩하며 `--db` 인자를 아예 받지 않는다. `--db=` 를 받는 것은 legacy backfill `run.mjs:76` 뿐인데 데이터 소스가 Supabase(`dump.mjs` 가 `NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 요구)이고 두 값 모두 `.env.local` 에 없어 SQL 생성 자체가 불가능하다. **확정된 부분** — `restore-d1-safe.mjs:17` 의 운영 DB 접촉. 이 항목 때문에 V08 은 P2→P1 로 올렸고 V12 는 P2 를 유지했으나, V13 이 "실측 접촉면"을 채택해 **P1** 로 확정했다(merge-log §3).
- **수정 방향**: 5종+wipe 아카이브. `run-helpers.mjs` 의 `dbName` 기본값 제거(필수 인자화). `restore-d1-safe.mjs:17` 은 즉시 제거하거나 명시 DB명으로 교체. (난이도 S · 회귀위험 낮음 · 묶음 FB11)

### D11-903 · P1 · [Pass B] 7a7b7c21 '인사 스크립트 4종 게이트' — PARTIAL

- **근본원인 축**: S12 운영 스크립트·저장소 위생 · **병합**: → D11-002
- **위치**: `scripts/full-recalc-leave-ledger.mjs:24-27`, `scripts/run-leave-accrual-d1.mjs:292-304`
- **결함**: 커밋의 명시 범위(4종)는 완료됐으나 목적("실수 실행이 진짜 데이터를 바꾸는 것을 방지") 기준으로는 부분 달성이다. 게이트 실재 4곳: `rebalance:30` / `reset-leave-usage:30` / `run-birthday-announcements-d1:31` / `run-leave-accrual-d1:27`. 누락 1곳: `full-recalc-leave-ledger:25`.
- **도달 경로**: D11-002(수동 실행 시 무게이트 wipe)와 D11-003(정상 `--yes` 실행 시 상시 실패) 두 경로 모두 살아 있다.
- **영향**: 게이트 목적의 최대 구멍 방치 + 정상 운영 경로 상시 실패.
- **검증**: `git show --stat 7a7b7c21` → 4 files changed(각 +14/-1). 게이트 제외를 정당화하는 결정 기록은 저장소 어디에도 없다(docs 검색 0건). PARTIAL 판정 정확. 심각도는 파생 레코드 D11-002/D11-003 과 정합하게 P0→P1.
- **수정 방향**: D11-002/D11-003 수정으로 종결. (난이도 S · 회귀위험 낮음 · 묶음 FB11)

---

### P2 항목 요약

| ID | 제목 | 위치 | 수정 방향 |
|---|---|---|---|
| D11-004 | backup-cloudflare.mjs 는 여전히 구 DB 를 백업하고 실패해도 exit 0 — '성공한 빈 백업' | `scripts/backup-cloudflare.mjs:39-47` | 아카이브 이동. 유지 시 DB명 `pchos-d1-v2` 교정 + 실패 시 `process.exit(1)` |
| D11-005 | 연차 감사 XLSX 리포트 2종이 구 DB 를 조회해 빈/구식 리포트를 생성 | `scripts/export-leave-audit-xlsx.py:22`, `scripts/export-leave-compare-xlsx.py:22` | DB명 교정 또는 `--db` 인자화(기본값은 wrangler.toml 파싱) |
| D11-006 | recreate-d1.mjs 는 `fs` 미임포트로 DB 삭제 후 크래시하는 파괴적 잔해 | `scripts/recreate-d1.mjs:1-32` | 삭제/아카이브 (고쳐 살릴 가치 없음 — 목적 자체가 소멸) |
| D11-008 | clean-recreate-and-restore-d1.mjs — v2 재생성+toml 재작성+구청크 복원 경로 상존 | `scripts/clean-recreate-and-restore-d1.mjs:15-38` | 아카이브 + 실행부 상단에 '중단됨' 가드(`process.exit(1)`) 삽입 |
| D11-011 | upload-secrets.mjs — 실패 시 평문 시크릿 `.tmp` 잔존 | `upload-secrets.mjs:25-46`, `upload-secrets.mjs:8-15` | tmp 파일 제거(`execSync` `input` 에 값 직접 전달) + 죽은 Supabase 키 목록 삭제 |
| D11-012 | deploy-worker.mjs 가 FIREBASE_SERVICE_ACCOUNT JSON 을 `cmd.exe` echo 파이프로 전달 — 값 훼손 | `scripts/deploy-worker.mjs:30-43` | 아카이브. 유지 시 upload-secrets 방식(`execSync` `input`)으로 교체 |
| D11-013 | d1Query 셸 이스케이프 패턴이 `%`·cmd 메타문자에서 깨진다 — 안전한 `execFileSync` 패턴과 혼재 | `scripts/rebalance-leave-balances.mjs:51-60`, `scripts/run-birthday-announcements-d1.mjs:68-76`, `scripts/run-backup-now.mjs:47-56` | 세 스크립트의 `d1Query` 를 full-recalc 의 `execFileSync` 패턴으로 교체(공용 모듈 추출) |
| D11-014 | 중복 정량화 — `runWrangler` ×24, `.env` 파서 4변종, `extractJson` ×3, `kstToday` ×5, 계정ID 하드코딩 ×41파일 | `scripts/recreate-d1.mjs:5-10`, `scripts/deploy.mjs:73-86`, `scripts/run-backup-now.mjs:18-26`, `scripts/export-dns.mjs:4-7` | `scripts/lib/ops.mjs` 에 `loadEnvLocal()`/`d1Query(execFileSync)`/`extractJson`/`kstToday`/`ACCOUNT_ID` 를 모으고 현행 스크립트 9종부터 전환 |
| D11-015 | 루트 죽은 코드 3종 — run-wrangler.js(구 DB 조회), backfill-sync.mjs/check-sync.mjs(Supabase 레거시) | `run-wrangler.js:1-5`, `backfill-sync.mjs:1-17`, `check-sync.mjs:1-17` | 3파일 삭제(run-wrangler.js 는 tracked 라 커밋 필요) |
| D11-016 | run-backup-now.mjs — ORDER BY 없는 OFFSET 페이지네이션 + tmp/ 평문 전량 덤프 축적 | `scripts/run-backup-now.mjs:157-177`, `scripts/run-backup-now.mjs:193-200` | `ORDER BY rowid`(또는 PK) 추가, 업로드 성공 후 `localFile` 삭제(또는 보존 개수 제한) |
| D11-017 | rebalance-leave-balances.mjs — `updated_at` UTC ISO 포맷 혼재 (crypto 근거는 반증) | `scripts/rebalance-leave-balances.mjs:282-288` | `node:crypto` 명시 임포트, 시각은 `datetime('now')` 로 통일 |
| D11-018 (PLAUSIBLE) | run-birthday-announcements-d1.mjs — KST 날짜에 'Z' 를 붙인 `created_at` + 문자열 시각 비교 포맷 혼재 | `scripts/run-birthday-announcements-d1.mjs:57`, `:219-225` | KST 자정을 UTC 로 환산(전일 15:00Z)해 기록하거나 포맷을 DB 관례에 맞춤 |
| D11-020 | untracked 71개(2026-07-26 계정이전 잔해) 분류 — 아카이브 61 / 삭제 7 / 유지 검토 3 | `scripts/`(디렉터리 전체) | `scripts/_archive/2026-07-account-migration/` 로 이동 + `.gitignore` 등재 또는 별도 브랜치 보관 |
| D11-021 | auto-deploy.mjs 는 안전한 래퍼이나 deploy.mjs 와 기능 중복 + 토큰 전략 이원화의 한 축 | `auto-deploy.mjs:6-27` | `deploy:cloudflare` npm 스크립트가 build 를 선행하도록 package.json 에서 합치고 래퍼 하나 제거 |
| D11-022 (담당외) | tests/ 가 참조하는 seed-e2e-d1 비밀번호 기본값이 콘솔에 평문 출력 | `scripts/seed-e2e-d1.mjs:914-918` | 비밀번호는 마스킹 출력 |
| D11-900 | [Pass B] 7차 P0 42건 중 D11 배정 행 0건 — 판정 대상 없음 | (장부 기록) | 해당 없음 |
| D11-902 | [Pass B] 8ce03332 '수동 백업 옛 DB' — PARTIAL (→D11-004 병합) | `scripts/run-backup-now.mjs:39-43`, `scripts/backup-cloudflare.mjs:39-47` | D11-004 와 동일 |

**P2 중 특히 주목할 3건**

- **D11-020(untracked 71개)** 은 단순 정리 이슈가 아니다. V08 은 "잔해 방치"가 아니라 "**평문 자격증명 39파일이 `git add -A` 사거리 안에 있음**"이라는 이유로 P1 로 올렸으나, V13 이 실피해를 D11-009(P0)에서 이미 계상했으므로 중복 계상을 피해 P2 로 되돌렸다. **작업 우선순위는 P0 D11-009 와 한 묶음이다.**
- **D11-013(셸 이스케이프)** — 원 감사는 "현재 SQL 은 ASCII 안전 서브셋"을 전제했는데 이 전제가 거짓이다. `run-birthday-announcements-d1.mjs:158` 이 이미 `WHERE status = '재직'` 한글 리터럴을 cmd.exe `--command` 경로로 넘기고 있고, 형제 스크립트 `rebalance-leave-balances.mjs:209` 에는 `// status filter in JS (avoid UTF-8 Korean in --command)` 주석이 달려 있다 — **팀이 이미 문서화한 규칙을 한 스크립트가 위반 중이다.** 실제로 0행을 반환하는지는 실행 없이 확정 불가라 P2 로 유지했다.
- **D11-016(tmp/ 평문 덤프)** — `grep unlink|rmSync` 결과 0건. 백업 대상에 `staff_members`·`payroll_records`·`attendance` 가 포함되므로(`L28-35`) 실행할 때마다 민감정보 평문 JSON 이 `tmp/` 에 영구 축적된다. `.gitignore:59 tmp/` 로 커밋 유입만 막혀 있고 디스크 축적은 무제한이다.

---

## 반증된 주장 (REFUTED)

| ID | 제목 | 반증 근거 |
|---|---|---|
| D11-901 | [Pass B] cc37f96f '복원 부분실패를 성공보고' 수정 — CLOSED | 복원 6종 전부에서 실패 수집 또는 catch 후 `process.exit(1)` 실재를 직접 확인했다(`restore-d1.mjs:13-16`, `restore-d1-safe.mjs:38-42`, `restore-d1-chunked.mjs:59-80`, `restore-d1-small.mjs:55-77`, `restore-d1-with-fk-off.mjs:27-30`, `clean-recreate-and-restore-d1.mjs:49-100` — 후자는 실패 목록 수집 → 1회 재시도 → `backups/failed-chunks.json` 기록 후 exit 1). **빈 catch 는 한 곳도 남아 있지 않다.** 원장 규약상 "닫힌 델타"는 열린 결함이 아니므로 REFUTED 로 정규화. 단 5종이 여전히 구 `pchos-d1` 을 겨누는 문제는 이 커밋 범위 밖이며 D11-019 로 별건 존속. |

### 하위주장 단위 반증 (레코드는 CONFIRMED 이나 근거 일부가 틀린 것 — 9차에서 반복 금지)

| ID | 반증된 하위주장 | 근거 |
|---|---|---|
| D11-002 | "leave_accruals 의 **수동 입력분** 포함 전량 삭제" | `leave_accruals` 에 수동 입력 경로가 없다 — `lib/annual-leave-accrual.ts` 가 `kind:'monthly'|'annual'` 만 INSERT 하고 substitute 는 `leave_ledger` 로 간다(`lib/substitute-holiday.ts:163`). 실제 손실은 **퇴사자 accrual**(전역 DELETE vs 필터된 재생성의 비대칭). |
| D11-004 | "실행하면 빈 백업을 **성공 보고**한다" | 이 스크립트는 `.env.local` 을 읽지 않고 `L5` `process.env.CLOUDFLARE_API_TOKEN` 만 쓰는데 `.env.local` 은 `# CLOUDFLARE_API_TOKEN` 으로 주석 처리돼 있다. 토큰 미설정이면 `L14-16` zones fetch 가 `Bearer undefined` 로 실패 → `L19-22` return → D1 export(`L39-47`)에 도달조차 못 한다. **셸에 토큰을 따로 export 한 경우에만 성립.** P1→P2 강등 사유. |
| D11-006 | "구 DB 삭제가 **안전망을 파괴**한다" | 방향이 반대다. 구 `pchos-d1` 이 사라지면 옛 이름을 쓰는 `restore-d1*`/`wipe-d1` 은 "조용한 무해 실행"이 아니라 wrangler 오류로 **즉시 실패**하므로 오히려 더 안전해진다. |
| D11-008 | "운영자가 실행하면 toml 이 오염된다" | `L17` `wrangler d1 create pchos-d1-v2` 는 동명 DB 존재 시 실패하고 `execSync` 가 uncaught throw 하므로 스크립트는 `L17` 에서 즉시 죽는다 — wrangler.toml 재작성(`L30-33`)에 도달조차 못 한다. **정상 상태에서는 완전 무해**, v2 를 지운 직후(재해복구 창)에만 진행되는데 그 시점엔 의도된 복구일 수도 있다. |
| D11-011 | "폐기된 Supabase 키 2종을 **계속 업로드**한다" | `SUPABASE_SERVICE_ROLE_KEY`·`SUPABASE_JWT_SECRET` 가 `.env.local` 에 아예 없어 `L26-27` `if (match && match[1])` 가 false → 두 키는 업로드되지 않는다. `SECRETS_TO_UPLOAD` 목록의 죽은 항목일 뿐이다. |
| D11-014 | "토큰 취급 전략이 상반된다(28:2)" / "파서 [a] 가 JSON 값을 파손한다" | (1) `.env.local` 의 `CLOUDFLARE_API_TOKEN` 이 주석 처리돼 있고 두 로더 모두 `^` 앵커 `/m` 정규식이라 매치되지 않는다 — `deploy.mjs`·`auto-deploy.mjs` 도 실제로는 토큰을 못 싣고 나머지 28개와 똑같이 OAuth 로 떨어진다. (2) `upload-secrets` 의 `L20` 전역 replace 는 **토큰 전용**이고 시크릿 값은 `L28` 에서 양끝 앵커 replace 를 쓴다. 나머지 정량 수치(runWrangler 24, delete-token 28 vs 대입 2, `extractJson` 3, `kstToday` 4+`kstDateOnly` 1, 계정ID 28+17)는 재측정 결과 전부 일치. |
| D11-017 | "Node 19 미만에서 조건부 크래시" | Node 19부터 `globalThis.crypto`(Web Crypto)가 기본 노출되고 `randomUUID` 를 제공한다. 이 머신 런타임은 v24.18.0 이며 Next 16 자체가 Node 20.9+ 를 요구하므로 ReferenceError 는 도달 불가. **시각 포맷 혼재만 성립.** |
| D11-019 | "`--db=pchos-d1-v2` 를 주면 현행 DB 를 덮어쓰는 **열린 경로**" | restore 5종·`wipe-d1.mjs` 는 DB명을 하드코딩하며 `--db` 인자를 받지 않는다. `--db=` 를 받는 legacy backfill 은 Supabase 자격증명·패키지 부재로 SQL 생성 자체가 불가. |
| D11-902 | "커밋이 backup-cloudflare.mjs 를 **빠뜨렸다**" | `git show --stat 8ce03332` → `scripts/run-backup-now.mjs` 단 1파일(+4/-1). `backup-cloudflare.mjs` 는 그때도 지금도 untracked 라 **커밋 사거리 밖**이었다 — "빠뜨렸다"가 아니라 "추적 대상이 아니었다"가 정확하다. 클래스 관점 PARTIAL 판정 자체는 유지. |

---

## 7차 대비 델타

| 7차 ID | 제목 | 판정 | 근거 |
|---|---|---|---|
| (P0 표 배정 0건) | 7차 P0 42건의 담당 컬럼은 D01~D09 만 사용 | — | `b7-delta-index.md:24` 담당 도메인 목록에 D11 scripts 가 정의돼 있으나 P0 델타 표(`:26` 이하)의 담당 값은 D01~D09 뿐이다. D11 은 `:85,86,90` 커밋 매핑에만 "대응 P0 없음 — D11 scripts" 로 등장 → **판정 대상 0건**(D11-900) |
| cc37f96f | 복원 부분실패를 성공보고 | **CLOSED** | 복원 6종 전부 실패수집/재시도/`exit 1` 실재. 빈 catch 0건 (D11-901, REFUTED 로 정규화) |
| 8ce03332 | 수동 백업이 옛 DB 를 가리키던 문제 | **PARTIAL** | `run-backup-now.mjs:43` 은 `pchos-d1-v2` 로 교정 + 경위 주석(`L39-42`) 확인. 그러나 같은 부류의 `backup-cloudflare.mjs:43` 은 여전히 `wrangler d1 export pchos-d1` 이고 실패도 exit 0 (D11-902 → D11-004) |
| 7a7b7c21 | 인사 운영 스크립트 4종이 옛 DB 를 가리키던 문제 + 실행 확인 게이트 | **PARTIAL** | 명시 4종(rebalance/reset/run-birthday/run-leave-accrual)은 완료. 그러나 (1) 가장 파괴적인 `full-recalc-leave-ledger.mjs` 누락, (2) 게이트 추가가 `run-leave-accrual-d1.mjs:295` 의 rebalance 하위호출을 상시 exit 1 로 만드는 회귀 유발 (D11-903 → D11-002/D11-003) |

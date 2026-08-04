#!/usr/bin/env node
// ============================================================
// scripts/backfill-d1/run.mjs
// 125개 테이블 전체를 FK 순서대로 Supabase → D1 백필하는 오케스트레이터.
//
// 사용법:
//   node scripts/backfill-d1/run.mjs --dry-run
//     (SQL 파일 생성만, D1 실행 안 함 — 기본 안전 모드)
//
//   node scripts/backfill-d1/run.mjs --local
//     (D1 로컬 데이터베이스에 적용)
//
//   node scripts/backfill-d1/run.mjs --remote
//     (D1 production에 적용 — 위험! 감독 하에만 실행)
//
//   node scripts/backfill-d1/run.mjs --dry-run --only=staff_members
//     (특정 테이블만)
//
//   node scripts/backfill-d1/run.mjs --local --resume
//     (이전 실패 재개: 이미 성공한 테이블 건너뜀)
//
//   node scripts/backfill-d1/run.mjs --local --only=companies,staff_members
//     (콤마로 여러 테이블 지정)
//
// 플래그:
//   --dry-run   SQL 파일 생성만 (기본값 — 명시적 --local/--remote 없으면 자동 적용)
//   --local     D1 로컬에 적용
//   --remote    D1 production에 적용
//   --resume    .backfill-progress.json의 완료 테이블 건너뜀
//   --only=T    콤마 구분 테이블명만 처리
//   --output=D  SQL 파일 출력 디렉터리 (기본: ./tmp/backfill)
//   --db=NAME   D1 DB 이름 (필수 — 기본값 없음. 운영은 pchos-d1-v2)
//
// 출력:
//   각 테이블 성공/실패/행수를 실시간 출력.
//   마지막에 요약(성공 N, 실패 N, 건너뜀 N).
//   실패해도 나머지 테이블 계속 진행 (격리).
// ============================================================

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadEnv,
  makeSupabase,
  buildSqlFile,
  applyToD1,
  loadProgress,
  saveProgress,
  log,
} from './run-helpers.mjs';
import { TABLE_DEFS, BACKFILL_ORDER_FULL } from './tables-full.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI 인수 파싱
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    dryRun: false,
    local: false,
    remote: false,
    resume: false,
    only: null,       // string[] | null
    outputDir: join(__dir, '../../tmp/backfill'),
    // 기본값 없음 — 예전 기본값이 구 DB 'pchos-d1' 이라 --db 를 빼먹으면
    // 엉뚱한 DB 에 백필하면서도 조용히 성공했다. 대상은 항상 명시하게 한다.
    dbName: null,
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run')          args.dryRun = true;
    else if (arg === '--local')       args.local = true;
    else if (arg === '--remote')      args.remote = true;
    else if (arg === '--resume')      args.resume = true;
    else if (arg.startsWith('--only='))   args.only = arg.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith('--output=')) args.outputDir = arg.slice(9);
    else if (arg.startsWith('--db='))     args.dbName = arg.slice(5);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  // 명시적 --local / --remote 없으면 --dry-run 강제
  if (!args.local && !args.remote) {
    args.dryRun = true;
  }

  // 실제로 D1 에 쓰는 모드라면 대상 DB 를 반드시 명시해야 한다.
  // SQL 을 다 만들어 놓고 마지막에 죽지 않도록 여기서 먼저 막는다.
  if (!args.dryRun && !args.dbName) {
    console.error('오류: --db=NAME 으로 대상 D1 데이터베이스를 명시해야 합니다. (운영: pchos-d1-v2)');
    process.exit(1);
  }

  return args;
}

function printHelp() {
  console.log(`
D1 전체 백필 오케스트레이터 (125개 테이블)

사용법:
  node scripts/backfill-d1/run.mjs [플래그]

플래그:
  --dry-run        SQL 파일만 생성, D1 실행 안 함 (기본값)
  --local          D1 로컬에 적용
  --remote         D1 production에 적용 (주의!)
  --resume         이미 성공한 테이블 건너뜀
  --only=T1,T2     특정 테이블만 처리 (콤마 구분)
  --output=DIR     SQL 출력 디렉터리 (기본: ./tmp/backfill)
  --db=NAME        D1 DB 이름 (--local/--remote 시 필수. 운영: pchos-d1-v2)
  --help           도움말
`);
}

// ---------------------------------------------------------------------------
// 단일 테이블 백필
// ---------------------------------------------------------------------------
async function backfillOne(supabase, def, sqlPath, args) {
  const totalRows = await buildSqlFile(supabase, def, sqlPath);

  if (args.dryRun) {
    log.ok(def.name, `SQL 생성 완료 — ${totalRows}행 → ${sqlPath}`);
    return { rows: totalRows, applied: false };
  }

  const mode = args.remote ? 'remote' : 'local';
  if (totalRows === 0) {
    log.skip(def.name, `0행 — D1 실행 건너뜀`);
    return { rows: 0, applied: false };
  }

  applyToD1(sqlPath, mode, args.dbName);
  log.ok(def.name, `적용 완료 (${mode}) — ${totalRows}행`);
  return { rows: totalRows, applied: true };
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);

  console.log('');
  console.log('  D1 전체 백필 오케스트레이터');
  console.log(`  모드: ${args.dryRun ? 'DRY RUN (SQL 생성만)' : args.remote ? 'REMOTE (production!)' : 'LOCAL'}`);
  console.log(`  출력: ${args.outputDir}`);
  if (args.only) console.log(`  대상: ${args.only.join(', ')}`);
  if (args.resume) console.log('  재개: 이전 완료 테이블 건너뜀');
  log.line();

  await loadEnv();
  const supabase = makeSupabase();

  // 진행 상태 로드
  const progress = args.resume ? await loadProgress() : {};

  // 처리할 테이블 목록 결정
  let tables = BACKFILL_ORDER_FULL;
  if (args.only) {
    const unknown = args.only.filter((t) => !TABLE_DEFS[t]);
    if (unknown.length > 0) {
      console.error(`오류: 알 수 없는 테이블 — ${unknown.join(', ')}`);
      console.error(`지원 테이블: ${Object.keys(TABLE_DEFS).join(', ')}`);
      process.exit(1);
    }
    // FK 순서를 유지하면서 지정된 테이블만 필터
    tables = BACKFILL_ORDER_FULL.filter((t) => args.only.includes(t));
  }

  const stats = { success: 0, failed: 0, skipped: 0, totalRows: 0 };
  const failures = [];

  for (const tableName of tables) {
    const def = TABLE_DEFS[tableName];
    if (!def) {
      log.skip(tableName, 'TABLE_DEFS 미정의 — 건너뜀');
      stats.skipped += 1;
      continue;
    }

    // --resume: 이미 성공한 테이블 건너뜀
    if (args.resume && progress[tableName]?.status === 'success') {
      log.skip(tableName, `이전 성공 (${progress[tableName].rows}행)`);
      stats.skipped += 1;
      continue;
    }

    const sqlPath = join(args.outputDir, `${tableName}.sql`);
    log.info(tableName, '시작...');

    try {
      const result = await backfillOne(supabase, def, sqlPath, args);
      stats.success += 1;
      stats.totalRows += result.rows;
      progress[tableName] = {
        status: 'success',
        rows: result.rows,
        applied: result.applied,
        at: new Date().toISOString(),
      };
    } catch (err) {
      const msg = err?.message ?? String(err);
      log.fail(tableName, `실패: ${msg}`);
      stats.failed += 1;
      failures.push({ table: tableName, error: msg });
      progress[tableName] = {
        status: 'failed',
        error: msg,
        at: new Date().toISOString(),
      };
    }

    // 진행 상태 저장 (테이블마다 — 중단 시 재개 가능)
    await saveProgress(progress);
  }

  // ---------------------------------------------------------------------------
  // 요약
  // ---------------------------------------------------------------------------
  log.line();
  console.log('');
  console.log('  백필 완료 요약');
  console.log(`  성공:    ${stats.success}개 테이블 (총 ${stats.totalRows.toLocaleString()}행)`);
  console.log(`  실패:    ${stats.failed}개 테이블`);
  console.log(`  건너뜀:  ${stats.skipped}개 테이블`);

  if (failures.length > 0) {
    console.log('');
    console.log('  실패 목록:');
    for (const f of failures) {
      console.log(`    - ${f.table}: ${f.error}`);
    }
    console.log('');
    console.log('  재시도: node scripts/backfill-d1/run.mjs --local --resume');
  }

  if (args.dryRun) {
    console.log('');
    console.log('  DRY RUN 완료. SQL 파일이 생성되었습니다.');
    console.log('  D1에 적용하려면 --local 또는 --remote를 명시하세요.');
    console.log('  예) node scripts/backfill-d1/run.mjs --local');
  }

  console.log('');

  if (stats.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[run] 치명적 오류:', err?.message ?? err);
  process.exit(1);
});

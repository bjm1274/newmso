#!/usr/bin/env node
// ============================================================
// build-schema.mjs
// supabase_migrations/ 91개 SQL을 D1 통합 스키마 1개로 변환
//
// 동작:
//  1) supabase/migrations/ + supabase_migrations/ 의 *.sql 파일 모두 읽기
//  2) Postgres 전용 구문을 SQLite 호환 구문으로 변환
//  3) 같은 테이블의 중복 CREATE/ALTER를 마지막 정의 기준으로 통합
//  4) 함수·트리거·정책은 별도 파일에 추출 (D1으로 옮기지 않음)
//  5) d1_schema.sql, extracted_functions.sql, extracted_policies.sql 생성
//
// 사용:
//   node scripts/migrate-d1/build-schema.mjs
//
// 주의:
//  - 자동 변환은 95% 자동화, 5%는 수동 검토 필요 (생성 후 build-report.md 확인)
//  - 변환 후 sqlite3 d1_test.db ".read d1_schema.sql" 로 DDL 적용 검증 권장
// ============================================================

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'scripts', 'migrate-d1', 'output');

const SOURCE_DIRS = [
  join(REPO_ROOT, 'supabase', 'migrations'),
  join(REPO_ROOT, 'supabase_migrations'),
];

// 폴더가 아니라 개별 SQL 파일로 추가할 소스
const EXTRA_SOURCE_FILES = [
  join(REPO_ROOT, 'docs', 'TOTAL_RECOVERY_SCHEMA.sql'),
];

const EXCLUDED_TABLES = new Set([
  'attendances_20260513_bulk_backup', // 5월 13일 사고 임시 백업
]);

// ─────────────────────────────────────────────────────────────
// 1. 파일 수집
// ─────────────────────────────────────────────────────────────
async function collectSqlFiles() {
  const files = [];
  for (const dir of SOURCE_DIRS) {
    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        if (entry.endsWith('.sql')) {
          files.push(join(dir, entry));
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  for (const f of EXTRA_SOURCE_FILES) {
    try {
      await readFile(f, 'utf8');
      files.push(f);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  files.sort();
  return files;
}

// ─────────────────────────────────────────────────────────────
// 2. Postgres → SQLite 변환 규칙
// ─────────────────────────────────────────────────────────────
function pgToSqlite(sql) {
  let out = sql;

  // 확장 제거
  out = out.replace(/CREATE\s+EXTENSION[^;]+;/gi, '');

  // GRANT/REVOKE 제거
  out = out.replace(/GRANT\s+[^;]+;/gi, '');
  out = out.replace(/REVOKE\s+[^;]+;/gi, '');

  // COMMENT ON 제거
  out = out.replace(/COMMENT\s+ON\s+[^;]+;/gi, '');

  // ALTER TABLE ... ENABLE ROW LEVEL SECURITY 제거
  out = out.replace(/ALTER\s+TABLE\s+[^\s;]+\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/gi, '');
  out = out.replace(/ALTER\s+TABLE\s+[^\s;]+\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/gi, '');
  out = out.replace(/ALTER\s+TABLE\s+[^\s;]+\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\s*;/gi, '');

  // 타입 변환 (단어 경계 기준)
  out = out.replace(/\bUUID\b/g, 'TEXT');
  out = out.replace(/\bTIMESTAMPTZ\b/gi, 'TEXT');
  out = out.replace(/\bTIMESTAMP\s+WITH\s+TIME\s+ZONE\b/gi, 'TEXT');
  out = out.replace(/\bTIMESTAMP\s+WITHOUT\s+TIME\s+ZONE\b/gi, 'TEXT');
  out = out.replace(/\bTIMESTAMP\b/g, 'TEXT');
  out = out.replace(/\bJSONB\b/gi, 'TEXT');
  out = out.replace(/\bJSON\b(?!\s*\()/g, 'TEXT'); // JSON_*() 함수는 보존
  out = out.replace(/\bDATE\b/g, 'TEXT');
  out = out.replace(/\bTIME(?!\s*ZONE)\b/g, 'TEXT');
  out = out.replace(/\bBIGSERIAL\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  out = out.replace(/\bSERIAL\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  out = out.replace(/\bBIGINT\b/gi, 'INTEGER');
  out = out.replace(/\bSMALLINT\b/gi, 'INTEGER');
  out = out.replace(/\bINT4\b/gi, 'INTEGER');
  out = out.replace(/\bINT8\b/gi, 'INTEGER');
  out = out.replace(/\bBOOLEAN\b/gi, 'INTEGER');
  out = out.replace(/\bBOOL\b/gi, 'INTEGER');
  out = out.replace(/\bDECIMAL\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\)/gi, 'REAL');
  out = out.replace(/\bNUMERIC\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\)/gi, 'REAL');
  out = out.replace(/\bNUMERIC\b/gi, 'REAL');
  out = out.replace(/\bDOUBLE\s+PRECISION\b/gi, 'REAL');
  out = out.replace(/\bVARCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT');
  out = out.replace(/\bVARCHAR\b/gi, 'TEXT');
  out = out.replace(/\bCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT');
  out = out.replace(/\bBYTEA\b/gi, 'BLOB');

  // 배열 타입: TEXT[], UUID[] → TEXT (JSON 배열로 저장)
  out = out.replace(/\bTEXT\s*\[\]/g, 'TEXT');
  out = out.replace(/\bINTEGER\s*\[\]/g, 'TEXT');

  // 기본값 함수 변환
  out = out.replace(/\bDEFAULT\s+NOW\s*\(\s*\)/gi, "DEFAULT CURRENT_TIMESTAMP");
  out = out.replace(/\bDEFAULT\s+CURRENT_TIMESTAMP\s*\(\s*\)/gi, "DEFAULT CURRENT_TIMESTAMP");
  out = out.replace(/\bDEFAULT\s+gen_random_uuid\s*\(\s*\)/gi, "DEFAULT ('')"); // 앱에서 채워야 함
  out = out.replace(/\bDEFAULT\s+uuid_generate_v4\s*\(\s*\)/gi, "DEFAULT ('')");

  // type cast 제거: 'value'::TYPE, '[]'::JSONB, '{}'::text[] 등
  // SQLite는 ::type 캐스트 미지원 → 그냥 값만 남김
  out = out.replace(/'([^']*)'(?:\s*::\s*\w+\s*(?:\[\s*\])?)/g, "'$1'");
  // 다른 형식: column::type 변환 (CHECK constraint 등에서) → 컬럼만 남김
  out = out.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)::\w+(?:\[\s*\])?/g, '$1');

  // public. schema prefix 제거 (SQLite는 schema 없음)
  out = out.replace(/\bpublic\.([a-zA-Z_가-힣][a-zA-Z0-9_가-힣]*)/g, '$1');

  // PRIMARY KEY 변환: TEXT PRIMARY KEY DEFAULT '' → TEXT PRIMARY KEY NOT NULL
  // (앱에서 ID를 채워야 함)
  out = out.replace(/TEXT\s+PRIMARY\s+KEY\s+DEFAULT\s+\(''\)/g, 'TEXT PRIMARY KEY NOT NULL');

  return out;
}

// ─────────────────────────────────────────────────────────────
// 3. CREATE TABLE 추출 + 중복 처리
// ─────────────────────────────────────────────────────────────
function extractStatements(sql) {
  const stmts = { tables: new Map(), alters: [], indexes: [], other: [] };

  // CREATE TABLE [IF NOT EXISTS] table_name (...)
  const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_가-힣][a-zA-Z0-9_가-힣]*)["`]?\s*\(([\s\S]*?)\)\s*;/gi;

  let m;
  while ((m = createTableRe.exec(sql)) !== null) {
    const tableName = m[1];
    if (EXCLUDED_TABLES.has(tableName)) continue;
    // 마지막 정의로 덮어쓰기 (멱등 통합 의도)
    stmts.tables.set(tableName, m[0]);
  }

  // ALTER TABLE ADD COLUMN
  const alterColRe = /ALTER\s+TABLE\s+[^;]+ADD\s+COLUMN[^;]+;/gi;
  while ((m = alterColRe.exec(sql)) !== null) {
    stmts.alters.push(m[0]);
  }

  // CREATE INDEX
  const createIdxRe = /CREATE\s+(?:UNIQUE\s+)?INDEX[^;]+;/gi;
  while ((m = createIdxRe.exec(sql)) !== null) {
    stmts.indexes.push(m[0]);
  }

  return stmts;
}

// ─────────────────────────────────────────────────────────────
// 4. 함수·트리거·정책 별도 추출
// ─────────────────────────────────────────────────────────────
function extractDropped(sql) {
  const dropped = { functions: [], triggers: [], policies: [], doBlocks: [] };

  // CREATE FUNCTION ... $$ ... $$ LANGUAGE ...;
  const funcRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[\s\S]+?\$\$[\s\S]+?\$\$[^;]*;/gi;
  let m;
  while ((m = funcRe.exec(sql)) !== null) dropped.functions.push(m[0]);

  // CREATE TRIGGER
  const trigRe = /CREATE\s+TRIGGER[\s\S]+?;/gi;
  while ((m = trigRe.exec(sql)) !== null) dropped.triggers.push(m[0]);

  // CREATE POLICY
  const polRe = /CREATE\s+POLICY[\s\S]+?;/gi;
  while ((m = polRe.exec(sql)) !== null) dropped.policies.push(m[0]);

  // DO $$ ... $$;  (멱등 보장 블록)
  const doRe = /DO\s+\$\$[\s\S]+?\$\$\s*;/gi;
  while ((m = doRe.exec(sql)) !== null) dropped.doBlocks.push(m[0]);

  return dropped;
}

// ─────────────────────────────────────────────────────────────
// 5. 메인
// ─────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const files = await collectSqlFiles();
  console.log(`수집된 SQL 파일: ${files.length}개`);

  const allTables = new Map();
  const allAlters = [];
  const allIndexes = [];
  const allFunctions = [];
  const allTriggers = [];
  const allPolicies = [];
  const allDoBlocks = [];
  const fileLog = [];

  for (const file of files) {
    const raw = await readFile(file, 'utf8');

    // 추출 먼저 (원본 기준) — 함수·정책은 D1에 안 들어가니까 변환 불필요
    const dropped = extractDropped(raw);
    allFunctions.push(...dropped.functions.map(s => `-- from: ${basename(file)}\n${s}`));
    allTriggers.push(...dropped.triggers.map(s => `-- from: ${basename(file)}\n${s}`));
    allPolicies.push(...dropped.policies.map(s => `-- from: ${basename(file)}\n${s}`));
    allDoBlocks.push(...dropped.doBlocks.map(s => `-- from: ${basename(file)}\n${s}`));

    // 변환
    const converted = pgToSqlite(raw);
    const stmts = extractStatements(converted);

    for (const [t, ddl] of stmts.tables) allTables.set(t, { ddl, source: basename(file) });
    allAlters.push(...stmts.alters);
    allIndexes.push(...stmts.indexes);

    fileLog.push({
      file: basename(file),
      tables: [...stmts.tables.keys()],
      alters: stmts.alters.length,
      indexes: stmts.indexes.length,
      functions: dropped.functions.length,
      policies: dropped.policies.length,
    });
  }

  // ─────── 통합 D1 스키마 작성 ───────
  const d1Lines = [
    '-- ============================================================',
    '-- D1 통합 스키마 (자동 생성)',
    `-- 생성일: ${new Date().toISOString()}`,
    `-- 원본: supabase/migrations/ + supabase_migrations/ (${files.length}개 파일)`,
    `-- 테이블 수: ${allTables.size}`,
    '-- 주의: 함수·트리거·정책은 별도 파일로 추출됨',
    '-- ============================================================',
    '',
    'PRAGMA foreign_keys = ON;',
    '',
  ];

  // 테이블 정의 (알파벳 순)
  const sortedTables = [...allTables.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [name, { ddl, source }] of sortedTables) {
    d1Lines.push(`-- ── ${name} (from: ${source})`);
    d1Lines.push(ddl);
    d1Lines.push('');
  }

  // ALTER 통합 (멱등 통합본에서는 사실상 누락 컬럼 안전망)
  if (allAlters.length > 0) {
    d1Lines.push('-- ── ALTER TABLE 컬럼 보강 ──');
    d1Lines.push('-- 주의: SQLite는 IF NOT EXISTS for ADD COLUMN 미지원. 통합본에서는 위 CREATE에 이미 포함되어 있을 가능성이 큼.');
    d1Lines.push('-- 실제 적용 전 중복 여부 확인 필요.');
    for (const a of allAlters) d1Lines.push('-- ' + a.replace(/\n/g, '\n-- '));
    d1Lines.push('');
  }

  // 인덱스
  d1Lines.push('-- ── 인덱스 ──');
  for (const idx of allIndexes) d1Lines.push(idx);

  await writeFile(join(OUT_DIR, 'd1_schema.sql'), d1Lines.join('\n'));

  // ─────── 추출 파일: 함수·트리거·정책 ───────
  await writeFile(
    join(OUT_DIR, 'extracted_functions.sql'),
    [
      '-- D1에 적용 불가 — 앱 레이어 TS로 재작성 대상',
      `-- 함수 ${allFunctions.length}개`,
      '',
      ...allFunctions,
    ].join('\n\n'),
  );
  await writeFile(
    join(OUT_DIR, 'extracted_triggers.sql'),
    [
      '-- D1에서는 사용하지 않음 — 앱 레이어에서 매번 호출',
      `-- 트리거 ${allTriggers.length}개`,
      '',
      ...allTriggers,
    ].join('\n\n'),
  );
  await writeFile(
    join(OUT_DIR, 'extracted_policies.sql'),
    [
      '-- D1은 RLS 없음 — 앱 권한 검사로 이식 대상 (Phase 1F)',
      `-- 정책 ${allPolicies.length}개`,
      '',
      ...allPolicies,
    ].join('\n\n'),
  );
  await writeFile(
    join(OUT_DIR, 'extracted_do_blocks.sql'),
    [
      '-- 멱등 보장 DO 블록 — 통합본에서는 불필요. 참고용 보관.',
      `-- 블록 ${allDoBlocks.length}개`,
      '',
      ...allDoBlocks,
    ].join('\n\n'),
  );

  // ─────── 변환 리포트 ───────
  const reportLines = [
    '# D1 스키마 변환 리포트',
    '',
    `생성일: ${new Date().toISOString()}`,
    `소스 SQL 파일: ${files.length}`,
    `생성된 테이블: ${allTables.size}`,
    `ALTER 통합 후보: ${allAlters.length}`,
    `인덱스: ${allIndexes.length}`,
    `추출된 함수: ${allFunctions.length}`,
    `추출된 트리거: ${allTriggers.length}`,
    `추출된 정책: ${allPolicies.length}`,
    `추출된 DO 블록: ${allDoBlocks.length}`,
    `제외된 테이블: ${[...EXCLUDED_TABLES].join(', ')}`,
    '',
    '## 파일별 처리 결과',
    '',
    '| 파일 | 테이블 | ALTER | INDEX | FUNCTION | POLICY |',
    '|---|---:|---:|---:|---:|---:|',
    ...fileLog.map(
      (e) =>
        `| ${e.file} | ${e.tables.length} | ${e.alters} | ${e.indexes} | ${e.functions} | ${e.policies} |`,
    ),
    '',
    '## 다음 단계',
    '',
    '1. `output/d1_schema.sql`을 SQLite로 dry-run:',
    '   ```bash',
    '   sqlite3 /tmp/d1_test.db ".read scripts/migrate-d1/output/d1_schema.sql"',
    '   sqlite3 /tmp/d1_test.db ".schema" | head -200',
    '   ```',
    '2. 오류 발생 시 변환 규칙(`pgToSqlite`) 보완 후 재실행',
    '3. `extracted_functions.sql`의 9개 비즈니스 함수를 TS로 재작성 (Phase 1E)',
    '4. `extracted_policies.sql`의 175개 정책을 앱 권한 검사로 이식 (Phase 1F)',
    '5. `wrangler d1 execute --local <DB> --file output/d1_schema.sql`로 로컬 D1 적용 검증',
  ];
  await writeFile(join(OUT_DIR, 'build-report.md'), reportLines.join('\n'));

  console.log(`\n✓ 출력 디렉토리: ${OUT_DIR}`);
  console.log(`  - d1_schema.sql            (${allTables.size}개 테이블)`);
  console.log(`  - extracted_functions.sql  (${allFunctions.length}개)`);
  console.log(`  - extracted_triggers.sql   (${allTriggers.length}개)`);
  console.log(`  - extracted_policies.sql   (${allPolicies.length}개)`);
  console.log(`  - extracted_do_blocks.sql  (${allDoBlocks.length}개)`);
  console.log(`  - build-report.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

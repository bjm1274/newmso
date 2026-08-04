// ============================================================
// scripts/backfill-d1/run-helpers.mjs
// run.mjs에서 공유하는 유틸리티 함수 모음.
// ============================================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { rowToValueTuple, buildInsertChunk, buildOversizedRowSql } from './normalize.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = join(__dir, '.backfill-progress.json');

// ---------------------------------------------------------------------------
// 환경변수 로드
// ---------------------------------------------------------------------------
export async function loadEnv() {
  try {
    const raw = await readFile(join(__dir, '../../.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env.local 없을 경우 process.env에서 직접 읽음
  }
}

// ---------------------------------------------------------------------------
// Supabase 클라이언트 생성
// ---------------------------------------------------------------------------
export function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local)');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------------------
// 페이지네이션 제너레이터
// ---------------------------------------------------------------------------
const PAGE_SIZE = 1000;
export async function* paginate(supabase, def) {
  let offset = 0;
  while (true) {
    // 정렬 키는 반드시 유일 키(PK). created_at 등 비유일 컬럼으로 정렬하면
    // 같은 값이 페이지 경계에 걸칠 때 행이 누락/중복된다(조용한 데이터 손실).
    const { data, error } = await supabase
      .from(def.name)
      .select(def.select)
      .order(def.pk ?? 'id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Supabase 읽기 오류 [${def.name}]: ${error.message}`);
    if (!data || data.length === 0) return;
    yield data;
    if (data.length < PAGE_SIZE) return;
    offset += PAGE_SIZE;
  }
}

// ---------------------------------------------------------------------------
// SQL 파일 생성
// INSERT 문 하나가 D1 statement 크기 한도(~100KB)를 넘지 않도록 바이트
// 예산으로 청킹 — 컬럼이 많은(넓은) 테이블도 안전.
// ---------------------------------------------------------------------------
const MAX_STMT_BYTES = 50_000;
// 단일 행이 이보다 크면 INSERT+UPDATE 분할 처리(D1 statement 한도 100KB 대응).
const OVERSIZE_ROW_BYTES = 80_000;

export async function buildSqlFile(supabase, def, outPath) {
  let totalRows = 0;
  const sqlChunks = [];
  const conflict = def.onConflict ?? 'ignore';
  const pk = def.pk ?? 'id';

  let pending = [];
  let pendingBytes = 0;
  const flush = () => {
    if (pending.length === 0) return;
    sqlChunks.push(buildInsertChunk(def.name, def.columns, pending, conflict));
    pending = [];
    pendingBytes = 0;
  };

  for await (const page of paginate(supabase, def)) {
    totalRows += page.length;
    for (const row of page) {
      const tuple = rowToValueTuple(row, def.columns, def.defaults ?? {});
      const bytes = Buffer.byteLength(tuple, 'utf8');
      if (bytes > OVERSIZE_ROW_BYTES) {
        // 단일 행이 statement 한도에 근접 → INSERT + UPDATE 연결로 분할
        flush();
        sqlChunks.push(
          buildOversizedRowSql(def.name, def.columns, row, def.defaults ?? {}, conflict, pk),
        );
        continue;
      }
      if (pending.length > 0 && pendingBytes + bytes > MAX_STMT_BYTES) flush();
      pending.push(tuple);
      pendingBytes += bytes;
    }
  }
  flush();

  // PRAGMA foreign_keys=OFF — 백필 중 FK 강제 해제. Supabase 스냅샷을
  // 그대로 복사하므로(고아 행 포함) 로드 시 FK 검증은 끈다. wrangler는
  // 파일을 단일 커넥션에서 순차 실행하므로 첫 문장의 PRAGMA가 유지된다.
  const header = [
    `-- D1 backfill: ${def.name}`,
    `-- generated_at: ${new Date().toISOString()}`,
    `-- total_rows: ${totalRows}`,
    `-- conflict_policy: ${conflict}`,
    'PRAGMA foreign_keys = OFF;',
    '',
  ].join('\n');

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, header + sqlChunks.join('\n') + '\n', 'utf8');
  return totalRows;
}

// ---------------------------------------------------------------------------
// wrangler d1 execute 실행
// ---------------------------------------------------------------------------
// dbName 에 기본값을 두지 않는다. 예전 기본값이 구 DB 'pchos-d1' 이라, 호출부가 이름을
// 넘기지 않으면 엉뚱한 DB 에 쓰면서도 조용히 성공했다. 대상 DB 는 항상 명시해야 한다.
export function applyToD1(sqlPath, mode, dbName) {
  if (!dbName) {
    throw new Error('applyToD1: 대상 D1 데이터베이스 이름을 명시해야 합니다 (예: pchos-d1-v2).');
  }
  const flag = mode === 'remote' ? '--remote' : '--local';
  const cmd = `npx wrangler d1 execute ${dbName} --file="${sqlPath}" ${flag}`;
  execSync(cmd, { stdio: 'inherit', cwd: join(__dir, '../..') });
}

// ---------------------------------------------------------------------------
// 진행 상태 관리 (--resume 지원)
// ---------------------------------------------------------------------------
export async function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return {};
  try {
    return JSON.parse(await readFile(PROGRESS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export async function saveProgress(progress) {
  await writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// 로거 (테이블명 고정 폭 정렬)
// ---------------------------------------------------------------------------
const PAD = 42;
export const log = {
  info: (table, msg) => console.log(`  [${table.padEnd(PAD)}] ${msg}`),
  ok:   (table, msg) => console.log(`✓ [${table.padEnd(PAD)}] ${msg}`),
  skip: (table, msg) => console.log(`- [${table.padEnd(PAD)}] ${msg} (SKIP)`),
  fail: (table, msg) => console.error(`✗ [${table.padEnd(PAD)}] ${msg}`),
  line: ()           => console.log('─'.repeat(60)),
};

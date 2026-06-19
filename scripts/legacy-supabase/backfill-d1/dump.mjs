#!/usr/bin/env node
// ============================================================
// scripts/backfill-d1/dump.mjs
// Supabase 단일 테이블 → D1 backfill SQL 파일 생성 CLI.
//
// 사용:
//   node scripts/backfill-d1/dump.mjs --table notifications
//     (DRY RUN: 처음 5개 row의 INSERT문만 콘솔 출력)
//
//   node scripts/backfill-d1/dump.mjs --table notifications \
//     --output ./tmp/backfill/notifications.sql --chunk 200
//
//   node scripts/backfill-d1/dump.mjs --table payroll_records \
//     --output ./tmp/backfill/payroll.sql --chunk 100 \
//     --conflict replace
//
// 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (.env.local 자동 로드)
// ============================================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { BACKFILL_TABLES } from './tables.mjs';
import { TABLE_DEFS as FULL_TABLE_DEFS } from './tables-full.mjs';
import { rowToValueTuple, buildInsertChunk } from './normalize.mjs';

// tables.mjs(24개)와 tables-full.mjs(125개)를 합쳐 사용.
// 동일 키는 tables-full.mjs가 우선(더 최신 정의).
const ALL_TABLES = { ...BACKFILL_TABLES, ...FULL_TABLE_DEFS };

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_CHUNK = 200;
const DRY_RUN_PREVIEW_ROWS = 5;

async function loadEnvLocal() {
  try {
    const raw = await readFile('.env.local', 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env.local 없어도 process.env에 이미 있으면 진행
  }
}

function parseArgs(argv) {
  const args = { table: null, output: null, chunk: DEFAULT_CHUNK, conflict: 'ignore' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--table') args.table = argv[++i];
    else if (arg === '--output') args.output = argv[++i];
    else if (arg === '--chunk') args.chunk = Number(argv[++i]) || DEFAULT_CHUNK;
    else if (arg === '--conflict') args.conflict = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/backfill-d1/dump.mjs --table <name> [--output <file>] [--chunk N] [--conflict ignore|replace]`);
      process.exit(0);
    }
  }
  return args;
}

async function* paginate(supabase, def, pageSize = DEFAULT_PAGE_SIZE) {
  let offset = 0;
  while (true) {
    // 정렬 키는 반드시 유일 키(PK) — 비유일 컬럼 정렬은 페이지 경계에서
    // 행 누락/중복을 일으킨다.
    const { data, error } = await supabase
      .from(def.name)
      .select(def.select)
      .order(def.pk ?? 'id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) return;
    yield data;
    if (data.length < pageSize) return;
    offset += pageSize;
  }
}

function chunkArray(arr, size) {
  if (size <= 0) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  await loadEnvLocal();
  const args = parseArgs(process.argv);

  if (!args.table) {
    console.error('error: --table is required');
    process.exit(1);
  }
  const def = ALL_TABLES[args.table];
  if (!def) {
    console.error(`error: unknown table '${args.table}'. supported: ${Object.keys(ALL_TABLES).join(', ')}`);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local)');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const dryRun = !args.output;

  let totalRows = 0;
  let printedPreview = 0;
  const sqlChunks = [];

  console.error(`[backfill] table=${def.name}, chunk=${args.chunk}, conflict=${args.conflict}, mode=${dryRun ? 'DRY RUN' : 'WRITE'}`);

  for await (const page of paginate(supabase, def)) {
    totalRows += page.length;

    if (dryRun) {
      for (const row of page) {
        if (printedPreview >= DRY_RUN_PREVIEW_ROWS) break;
        const tuple = rowToValueTuple(row, def.columns, def.defaults);
        const stmt = buildInsertChunk(def.name, def.columns, [tuple], args.conflict);
        process.stdout.write(stmt);
        printedPreview += 1;
      }
      if (printedPreview >= DRY_RUN_PREVIEW_ROWS) {
        console.error(`[backfill] DRY RUN preview done (${printedPreview} rows). total fetched=${totalRows}`);
        return;
      }
      continue;
    }

    for (const chunk of chunkArray(page, args.chunk)) {
      const tuples = chunk.map((row) => rowToValueTuple(row, def.columns, def.defaults));
      sqlChunks.push(buildInsertChunk(def.name, def.columns, tuples, args.conflict));
    }
    console.error(`[backfill] fetched ${totalRows} rows so far...`);
  }

  if (dryRun) {
    console.error(`[backfill] DRY RUN done. total fetched=${totalRows} (no rows to preview — table is empty)`);
    return;
  }

  await mkdir(dirname(args.output), { recursive: true });
  // D1 production은 BEGIN TRANSACTION/COMMIT/SAVEPOINT를 거부한다
  // ("To execute a transaction, please use state.storage.transaction()...").
  // wrangler는 statement 단위 implicit transaction을 사용하므로 명시 호출 불필요.
  // PRAGMA foreign_keys도 connection scope라 wrangler가 매 statement에서
  // reset하므로 의미 없다 — 부모→자식 순서 적용으로 FK 만족시킨다.
  const header = [
    `-- D1 backfill: ${def.name}`,
    `-- generated_at: ${new Date().toISOString()}`,
    `-- total_rows: ${totalRows}`,
    `-- conflict_policy: ${args.conflict}`,
    '',
  ].join('\n');
  const footer = '\n';
  await writeFile(args.output, header + sqlChunks.join('\n') + footer, 'utf8');
  console.error(`[backfill] wrote ${totalRows} rows → ${args.output}`);
}

main().catch((err) => {
  console.error('[backfill] failed:', err?.message || err);
  process.exit(1);
});

#!/usr/bin/env node
// ============================================================
// post-process-schema.mjs
// drizzle-kit pull 후 schema.ts/relations.ts 후처리
//
// 1) default("sql`...`") → default(sql`...`)  (drizzle-kit 버그 우회)
// 2) lib/db/migrations/schema.ts → lib/db/schema.ts 이동
// 3) lib/db/migrations/relations.ts → lib/db/relations.ts 이동
// 4) 메인 entry lib/db/index.ts 생성
// ============================================================

import { readFile, writeFile, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'lib', 'db', 'migrations');
const DB_DIR = join(REPO_ROOT, 'lib', 'db');

function fixDefaults(content) {
  // default("sql`...`") → default(sql`...`)
  let fixed = content.replace(/default\("sql`([^`]+)`"\)/g, 'default(sql`$1`)');
  // default("'value'") → default('value')  (혹시 문자열로 wrap된 string default)
  fixed = fixed.replace(/default\("'([^']*)'"\)/g, "default('$1')");
  return fixed;
}

async function main() {
  // 1) schema.ts 처리
  const schemaSrc = join(MIGRATIONS_DIR, 'schema.ts');
  const schemaDst = join(DB_DIR, 'schema.ts');
  if (!existsSync(schemaSrc)) throw new Error(`schema.ts 없음: ${schemaSrc}`);
  let schemaContent = await readFile(schemaSrc, 'utf8');
  schemaContent = fixDefaults(schemaContent);
  await writeFile(schemaDst, schemaContent);
  await unlink(schemaSrc);

  // 2) relations.ts 처리
  const relSrc = join(MIGRATIONS_DIR, 'relations.ts');
  const relDst = join(DB_DIR, 'relations.ts');
  if (existsSync(relSrc)) {
    let relContent = await readFile(relSrc, 'utf8');
    // import 경로는 같은 디렉토리라 './schema'로 그대로 OK
    await writeFile(relDst, relContent);
    await unlink(relSrc);
  }

  // 3) lib/db/index.ts 메인 entry
  const indexPath = join(DB_DIR, 'index.ts');
  if (!existsSync(indexPath)) {
    const indexContent = `// ============================================================
// lib/db/index.ts
// Drizzle ORM 메인 entry — 모든 schema + relations export
//
// 사용:
//   import { staff_members, eq } from '@/lib/db';
// ============================================================

export * from './schema';
export * from './relations';
export { sql, eq, ne, gt, gte, lt, lte, and, or, not, inArray, like, isNull, isNotNull, desc, asc } from 'drizzle-orm';
`;
    await writeFile(indexPath, indexContent);
  }

  // 4) 결과 보고
  console.log('✓ lib/db/schema.ts (default 후처리 적용)');
  console.log('✓ lib/db/relations.ts');
  console.log('✓ lib/db/index.ts (entry)');

  // migrations 디렉토리에 남은 .sql만 유지
  const remaining = await readdir(MIGRATIONS_DIR);
  console.log(`  migrations/ 잔여 파일: ${remaining.join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

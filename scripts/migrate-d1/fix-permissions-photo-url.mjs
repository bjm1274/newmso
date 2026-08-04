#!/usr/bin/env node
/**
 * fix-permissions-photo-url.mjs
 *
 * staff_members.permissions JSON 내부의 profile_photo_url 필드를
 * Supabase URL → R2 URL 로 일괄 갱신한다.
 *
 * 사용법:
 *   node scripts/migrate-d1/fix-permissions-photo-url.mjs          # dry-run
 *   node scripts/migrate-d1/fix-permissions-photo-url.mjs --remote # 실제 실행
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// 환경 로드
// ---------------------------------------------------------------------------
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  /** @type {Record<string, string>} */
  const values = {};
  for (const line of lines) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const sepIdx = line.indexOf('=');
    const key = line.slice(0, sepIdx).trim();
    let value = line.slice(sepIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
}

const envFromFile = loadEnvFile(path.join(process.cwd(), '.env.local'));

/**
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
function readEnv(name, fallback = '') {
  return String(process.env[name] ?? envFromFile[name] ?? fallback).trim();
}

const SUPABASE_HOST = 'supabase.co';
const R2_BASE = (readEnv('NEXT_PUBLIC_R2_PUBLIC_BASE_URL') || 'https://r2.pchos.kr').replace(/\/+$/, '');
// 운영 DB 이름. 구 DB 'pchos-d1' 을 가리키던 동안에는 실행해도 아무 데이터에 닿지 않으면서
// "성공"으로 끝났다. wrangler.toml 의 database_name 과 일치해야 한다.
const D1_DB_NAME = 'pchos-d1-v2';
const ACCOUNT_ID = readEnv('CLOUDFLARE_ACCOUNT_ID') || process.env.CLOUDFLARE_ACCOUNT_ID || '';

const dryRun = !process.argv.includes('--remote');

// ---------------------------------------------------------------------------
// D1 헬퍼
// ---------------------------------------------------------------------------
/**
 * @param {string} sql
 * @returns {unknown[]}
 */
function runD1Query(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  const cmd = `npx wrangler d1 execute ${D1_DB_NAME} --remote --command "${escaped}"`;
  const out = execSync(cmd, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
  });
  const jsonStart = out.indexOf('[');
  if (jsonStart === -1) throw new Error(`D1 응답에 JSON이 없음: ${out.slice(0, 200)}`);
  const parsed = /** @type {Array<{results: unknown[]}>} */ (JSON.parse(out.slice(jsonStart)));
  return parsed[0]?.results ?? [];
}

/**
 * @param {string} sql
 */
function runD1Exec(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  const cmd = `npx wrangler d1 execute ${D1_DB_NAME} --remote --command "${escaped}"`;
  execSync(cmd, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
  });
}

// ---------------------------------------------------------------------------
// URL 변환
// ---------------------------------------------------------------------------
/**
 * Supabase profiles URL → R2 URL
 * 입력: https://....supabase.co/storage/v1/object/public/profiles/{id}/avatar?v=...
 * 출력: https://r2.pchos.kr/profiles/{id}/avatar
 *
 * @param {string} url
 * @returns {string | null}
 */
function convertToR2Url(url) {
  if (!url || !url.includes(SUPABASE_HOST)) return null;
  // /storage/v1/object/public/profiles/{rest} 추출
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/profiles\/([^?]+)/);
  if (!m) return null;
  const objectPath = decodeURIComponent(m[1]);
  return `${R2_BASE}/profiles/${objectPath}`;
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------
async function main() {
  if (!ACCOUNT_ID) {
    console.error('오류: CLOUDFLARE_ACCOUNT_ID 환경변수가 필요합니다.');
    process.exit(1);
  }

  console.log(`모드: ${dryRun ? 'DRY-RUN (실제 변경 없음)' : 'REMOTE (실제 실행)'}`);
  console.log(`R2 base: ${R2_BASE}`);
  console.log('');

  // 대상 행 조회
  console.log('대상 행 조회 중...');
  const rows = /** @type {Array<{id: string, permissions: string}>} */ (
    runD1Query(
      "SELECT id, permissions FROM staff_members WHERE permissions LIKE '%supabase.co/storage%'"
    )
  );
  console.log(`대상 행: ${rows.length}건`);

  if (rows.length === 0) {
    console.log('처리할 행이 없습니다.');
    return;
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    /** @type {Record<string, unknown>} */
    let perms;
    try {
      perms = JSON.parse(row.permissions || '{}');
    } catch {
      console.warn(`  [SKIP] ${row.id} — permissions 파싱 실패`);
      skipped++;
      continue;
    }

    const oldUrl = typeof perms.profile_photo_url === 'string' ? perms.profile_photo_url : null;
    if (!oldUrl || !oldUrl.includes('supabase.co/storage')) {
      skipped++;
      continue;
    }

    const newUrl = convertToR2Url(oldUrl);
    if (!newUrl) {
      console.warn(`  [SKIP] ${row.id} — URL 변환 실패: ${oldUrl.slice(0, 80)}`);
      skipped++;
      continue;
    }

    console.log(`  ${dryRun ? '[DRY]' : '[UPD]'} ${row.id}`);
    console.log(`    ${oldUrl.slice(0, 80)}`);
    console.log(`    → ${newUrl}`);

    if (!dryRun) {
      try {
        const newPerms = { ...perms, profile_photo_url: newUrl };
        const newPermsJson = JSON.stringify(newPerms).replace(/'/g, "''");
        const safeId = String(row.id).replace(/'/g, "''");
        const sql = `UPDATE staff_members SET permissions = '${newPermsJson}' WHERE id = '${safeId}'`;
        runD1Exec(sql);
        updated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [ERROR] ${row.id}: ${msg}`);
        failed++;
      }
    } else {
      updated++;
    }
  }

  console.log('');
  console.log('='.repeat(50));
  console.log(`갱신: ${updated}건  /  건너뜀: ${skipped}건  /  실패: ${failed}건`);
  if (dryRun) console.log('(dry-run — 실제 변경 없음. --remote 플래그로 실행하세요)');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[fix-permissions-photo-url] 치명적 오류:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

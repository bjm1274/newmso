#!/usr/bin/env node
/**
 * migrate-supabase-storage-to-r2.mjs
 *
 * Supabase Storage → Cloudflare R2 파일 마이그레이션 + D1 URL 갱신.
 *
 * 지원 버킷:
 *   - company-seals  → R2 prefix: seals/    DB: company_seals.image_url
 *   - popups         → R2 prefix: popups/   DB: popups.media_url
 *   - profiles       → R2 prefix: profiles/ DB: staff_members.avatar_url, staff_members.photo_url
 *   - board-attachments → R2 prefix: board/ DB: document_repository.file_url,
 *                                               document_versions.file_url,
 *                                               license_continuing_education.file_url,
 *                                               posts.attachments (JSON 배열 내 url 필드),
 *                                               approvals.meta_data (JSON 내 attachments[].url),
 *                                               messages.file_url (board 업로드 경유 파일만)
 *   - mso-backups    → R2 prefix: backup/   DB 참조 없음 — 파일만 복사
 *
 * 실행:
 *   # dry-run (기본, 실제 변경 없음)
 *   node scripts/migrate-d1/migrate-supabase-storage-to-r2.mjs
 *
 *   # 특정 버킷만
 *   node scripts/migrate-d1/migrate-supabase-storage-to-r2.mjs --bucket=company-seals
 *
 *   # 실제 실행 (R2 업로드 + D1 URL 갱신)
 *   node scripts/migrate-d1/migrate-supabase-storage-to-r2.mjs --remote
 *
 *   # 특정 버킷 실제 실행
 *   node scripts/migrate-d1/migrate-supabase-storage-to-r2.mjs --bucket=profiles --remote
 *
 *   # 건수 제한 (테스트용)
 *   node scripts/migrate-d1/migrate-supabase-storage-to-r2.mjs --bucket=company-seals --remote --limit=5
 *
 * 환경변수 (.env.local 또는 process.env):
 *   NEXT_PUBLIC_SUPABASE_URL       Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY      Supabase service role key
 *   R2_ACCOUNT_ID                  Cloudflare account ID
 *   R2_ACCESS_KEY_ID               R2 S3-compatible access key
 *   R2_SECRET_ACCESS_KEY           R2 S3-compatible secret key
 *   R2_CHAT_BUCKET                 R2 버킷 이름 (기본: pchos-files)
 *   NEXT_PUBLIC_R2_PUBLIC_BASE_URL R2 public base URL (e.g. https://r2.pchos.kr)
 *
 * 멱등성:
 *   R2에 이미 동일 Key가 존재하면 업로드를 건너뜀 (HEAD 요청으로 확인).
 *   D1 URL이 이미 R2/내부 프록시 URL을 가리키면 갱신을 건너뜀.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------
const DEFAULT_R2_BUCKET = 'pchos-files';
const D1_DB_NAME = 'pchos-d1';

/**
 * Supabase 버킷 → R2 prefix 매핑
 * skipDbUpdate: true 면 파일 복사만 하고 DB URL 갱신 없음
 */
const BUCKET_CONFIG = {
  'company-seals': {
    r2Prefix: 'seals/',
    skipDbUpdate: false,
    description: '직인 이미지 → company_seals.image_url',
  },
  'popups': {
    r2Prefix: 'popups/',
    skipDbUpdate: false,
    description: '팝업 미디어 → popups.media_url',
  },
  'profiles': {
    r2Prefix: 'profiles/',
    skipDbUpdate: false,
    description: '프로필 사진 → staff_members.avatar_url / photo_url',
  },
  'board-attachments': {
    r2Prefix: 'board/',
    skipDbUpdate: false,
    description: '게시판 첨부 → 다수 테이블 URL 갱신',
  },
  'mso-backups': {
    r2Prefix: 'backup/',
    skipDbUpdate: true,
    description: '과거 백업 파일 — DB 참조 없음, 파일만 복사',
  },
};

const ALL_BUCKETS = Object.keys(BUCKET_CONFIG);

// ---------------------------------------------------------------------------
// .env.local 파싱
// ---------------------------------------------------------------------------
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
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

const ENV_FILE = path.join(process.cwd(), '.env.local');
const envFromFile = loadEnvFile(ENV_FILE);

function readEnv(name, fallback = '') {
  return String(process.env[name] ?? envFromFile[name] ?? fallback).trim();
}

function readFlag(name) {
  return process.argv.includes(name);
}

function readOption(prefix, fallback = '') {
  const match = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return match ? match.slice(prefix.length + 1) : fallback;
}

// ---------------------------------------------------------------------------
// URL 판별 헬퍼
// ---------------------------------------------------------------------------
function isSupabaseStorageUrl(url, supabaseUrl) {
  if (!url || !supabaseUrl) return false;
  const normalizedSupabase = supabaseUrl.replace(/\/+$/, '');
  return String(url).startsWith(`${normalizedSupabase}/storage/v1/object/`);
}

/**
 * Supabase public URL에서 (bucket, objectKey) 추출.
 * 형식: {supabaseUrl}/storage/v1/object/public/{bucket}/{key}
 *        또는 /sign/{bucket}/{key}?token=...
 */
function parseSupabaseStorageUrl(url) {
  try {
    const u = new URL(url);
    // /storage/v1/object/public/{bucket}/{key...}
    // /storage/v1/object/sign/{bucket}/{key...}
    const m = u.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return {
      bucket: decodeURIComponent(m[1]),
      objectKey: decodeURIComponent(m[2].split('?')[0]),
    };
  } catch {
    return null;
  }
}

function isAlreadyR2OrProxy(url) {
  if (!url) return false;
  const s = String(url);
  // R2 public URL (r2.pchos.kr 등) 또는 내부 프록시 경로
  if (s.startsWith('/api/storage/object')) return true;
  if (s.includes('.r2.cloudflarestorage.com')) return true;
  // NEXT_PUBLIC_R2_PUBLIC_BASE_URL 설정 시
  const r2Base = readEnv('NEXT_PUBLIC_R2_PUBLIC_BASE_URL') || readEnv('R2_PUBLIC_BASE_URL');
  if (r2Base && s.startsWith(r2Base)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// R2 URL 빌더
// ---------------------------------------------------------------------------
function buildR2ObjectUrl(r2Bucket, objectKey) {
  const r2PublicBase = (readEnv('NEXT_PUBLIC_R2_PUBLIC_BASE_URL') || readEnv('R2_PUBLIC_BASE_URL') || '').replace(/\/+$/, '');
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  if (r2PublicBase) {
    return `${r2PublicBase}/${encodedKey}`;
  }
  // 퍼블릭 베이스가 없으면 내부 프록시 URL
  const params = new URLSearchParams({ provider: 'r2', bucket: r2Bucket, key: objectKey });
  return `/api/storage/object?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Supabase Storage 목록 조회
// ---------------------------------------------------------------------------
async function listBucketObjects(supabase, bucket) {
  const queue = [''];
  const files = [];

  while (queue.length > 0) {
    const prefix = queue.shift();
    let offset = 0;

    for (;;) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) {
        throw new Error(`[${bucket}] 목록 조회 실패 (prefix="${prefix || '/'}", offset=${offset}): ${error.message}`);
      }

      const rows = data || [];
      for (const row of rows) {
        if (row.id === null) {
          // 폴더 — 재귀 탐색
          queue.push(prefix ? `${prefix}/${row.name}` : row.name);
          continue;
        }
        files.push({
          key: prefix ? `${prefix}/${row.name}` : row.name,
          size: Number(row.metadata?.size || row.metadata?.contentLength || 0) || 0,
          contentType: String(row.metadata?.mimetype || row.metadata?.contentType || 'application/octet-stream'),
        });
      }

      if (rows.length < 100) break;
      offset += 100;
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// R2 멱등성 확인 (HEAD)
// ---------------------------------------------------------------------------
async function existsInR2(r2Client, r2Bucket, objectKey) {
  try {
    await r2Client.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: objectKey }));
    return true;
  } catch (err) {
    // NoSuchKey / 404 → 없음
    if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return false;
    // 그 외 오류는 상위로 전파
    throw err;
  }
}

// ---------------------------------------------------------------------------
// D1 SQL 실행 (wrangler d1 execute)
// ---------------------------------------------------------------------------
function runD1Sql(sql, remote) {
  const flag = remote ? '--remote' : '--local';
  const cmd = `npx wrangler d1 execute ${D1_DB_NAME} ${flag} --command "${sql.replace(/"/g, '\\"')}"`;
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return out;
  } catch (err) {
    throw new Error(`D1 SQL 실행 실패:\n${err.message}\nSQL: ${sql}`);
  }
}

// ---------------------------------------------------------------------------
// URL 갱신 로직 — 버킷별 전략
// ---------------------------------------------------------------------------

/**
 * 단순 단일 컬럼 UPDATE
 * UPDATE {table} SET {col} = '{newUrl}' WHERE {col} = '{oldUrl}'
 */
async function updateSimpleColumn(table, col, oldUrl, newUrl, dryRun, remote) {
  if (dryRun) {
    console.log(`  [DRY] UPDATE ${table}.${col}: ${oldUrl.slice(0, 80)} → ${newUrl.slice(0, 80)}`);
    return 0;
  }
  const sql = `UPDATE ${table} SET ${col} = '${newUrl.replace(/'/g, "''")}' WHERE ${col} = '${oldUrl.replace(/'/g, "''")}'`;
  runD1Sql(sql, remote);
  return 1;
}

/**
 * JSON 배열 컬럼 갱신 — SQLite REPLACE() 기반.
 * 컬럼이 JSON 배열 문자열이고 내부에 Supabase URL이 포함돼 있을 때.
 * 예: posts.attachments = '[{"url":"https://supabase.../...", ...}]'
 * 주의: URL에 특수문자가 있을 수 있으므로 REPLACE()로 단순 치환.
 */
async function updateJsonColumn(table, col, oldUrl, newUrl, dryRun, remote) {
  if (dryRun) {
    console.log(`  [DRY] UPDATE ${table}.${col} (JSON REPLACE): ${oldUrl.slice(0, 80)}`);
    return 0;
  }
  const escapedOld = oldUrl.replace(/'/g, "''");
  const escapedNew = newUrl.replace(/'/g, "''");
  const sql = `UPDATE ${table} SET ${col} = REPLACE(${col}, '${escapedOld}', '${escapedNew}') WHERE ${col} LIKE '%${escapedOld.replace(/%/g, '')}%'`;
  runD1Sql(sql, remote);
  return 1;
}

/**
 * 버킷별 URL 갱신 디스패처.
 * 각 버킷이 어떤 테이블/컬럼에 URL을 저장하는지 처리.
 */
async function updateDbUrls(bucket, oldUrl, newUrl, dryRun, remote) {
  let count = 0;

  switch (bucket) {
    case 'company-seals':
      count += await updateSimpleColumn('company_seals', 'image_url', oldUrl, newUrl, dryRun, remote);
      // contract_templates.seal_url도 Supabase URL을 가질 수 있음
      count += await updateSimpleColumn('contract_templates', 'seal_url', oldUrl, newUrl, dryRun, remote);
      break;

    case 'popups':
      count += await updateSimpleColumn('popups', 'media_url', oldUrl, newUrl, dryRun, remote);
      break;

    case 'profiles':
      count += await updateSimpleColumn('staff_members', 'avatar_url', oldUrl, newUrl, dryRun, remote);
      count += await updateSimpleColumn('staff_members', 'photo_url', oldUrl, newUrl, dryRun, remote);
      // permissions JSON 컬럼 내 profile_photo 필드 (구조: {"profile_photo": "url", ...})
      count += await updateJsonColumn('staff_members', 'permissions', oldUrl, newUrl, dryRun, remote);
      break;

    case 'board-attachments':
      // 문서보관함
      count += await updateSimpleColumn('document_repository', 'file_url', oldUrl, newUrl, dryRun, remote);
      count += await updateSimpleColumn('document_versions', 'file_url', oldUrl, newUrl, dryRun, remote);
      // 면허 보수교육 첨부
      count += await updateSimpleColumn('license_continuing_education', 'file_url', oldUrl, newUrl, dryRun, remote);
      // 게시글 attachments JSON 배열
      count += await updateJsonColumn('posts', 'attachments', oldUrl, newUrl, dryRun, remote);
      // 결재 meta_data JSON (attachments[].url)
      count += await updateJsonColumn('approvals', 'meta_data', oldUrl, newUrl, dryRun, remote);
      // 메시지 (board 업로드 경유 파일)
      count += await updateSimpleColumn('messages', 'file_url', oldUrl, newUrl, dryRun, remote);
      break;

    case 'mso-backups':
      // DB 참조 없음
      break;

    default:
      console.warn(`  [WARN] 알 수 없는 버킷: ${bucket} — DB 갱신 건너뜀`);
  }

  return count;
}

// ---------------------------------------------------------------------------
// 단일 버킷 마이그레이션
// ---------------------------------------------------------------------------
async function migrateBucket(bucket, supabase, r2Client, r2Bucket, opts) {
  const { dryRun, remote, limit } = opts;
  const config = BUCKET_CONFIG[bucket];
  const r2Prefix = config.r2Prefix;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`버킷: ${bucket}  →  R2 prefix: ${r2Prefix}`);
  console.log(`설명: ${config.description}`);
  console.log(`모드: ${dryRun ? 'DRY-RUN (실제 변경 없음)' : remote ? 'REMOTE (실제 실행)' : 'LOCAL D1 (실제 실행, local D1)'}`);
  console.log(`${'='.repeat(60)}`);

  const allObjects = await listBucketObjects(supabase, bucket);
  const objects = limit > 0 ? allObjects.slice(0, limit) : allObjects;

  const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL');
  const stats = {
    bucket,
    total: objects.length,
    totalBytes: objects.reduce((s, o) => s + o.size, 0),
    uploaded: 0,
    skipped: 0,
    dbUpdated: 0,
    failed: 0,
    errors: [],
  };

  for (const [idx, obj] of objects.entries()) {
    const r2Key = `${r2Prefix}${obj.key}`;
    const sourceUrl = buildSupabasePublicUrl(supabaseUrl, bucket, obj.key);
    const targetUrl = buildR2ObjectUrl(r2Bucket, r2Key);

    const label = `[${idx + 1}/${objects.length}] ${obj.key}`;

    try {
      // 멱등성: R2에 이미 있으면 건너뜀
      if (!dryRun) {
        const alreadyExists = await existsInR2(r2Client, r2Bucket, r2Key);
        if (alreadyExists) {
          console.log(`${label} — R2에 이미 존재, 건너뜀`);
          stats.skipped++;
          // R2 파일은 있지만 DB URL이 아직 Supabase URL일 수 있으므로 DB 갱신은 진행
          if (!config.skipDbUpdate) {
            const updated = await updateDbUrls(bucket, sourceUrl, targetUrl, dryRun, remote);
            stats.dbUpdated += updated;
          }
          continue;
        }
      } else {
        console.log(`${label} size=${obj.size} → ${targetUrl}`);
      }

      if (!dryRun) {
        // Supabase에서 다운로드
        const { data: blob, error: downloadErr } = await supabase.storage
          .from(bucket)
          .download(obj.key);
        if (downloadErr || !blob) {
          throw new Error(`다운로드 실패: ${downloadErr?.message || 'blob 없음'}`);
        }

        const bodyBuffer = Buffer.from(await blob.arrayBuffer());

        // R2 업로드
        await r2Client.send(new PutObjectCommand({
          Bucket: r2Bucket,
          Key: r2Key,
          Body: bodyBuffer,
          ContentType: obj.contentType,
          CacheControl: 'public, max-age=3600',
        }));

        console.log(`${label} — R2 업로드 완료 (${obj.size} bytes)`);
        stats.uploaded++;

        // DB URL 갱신
        if (!config.skipDbUpdate) {
          const updated = await updateDbUrls(bucket, sourceUrl, targetUrl, dryRun, remote);
          stats.dbUpdated += updated;
        }
      } else {
        // dry-run: DB 갱신 시뮬레이션
        if (!config.skipDbUpdate) {
          await updateDbUrls(bucket, sourceUrl, targetUrl, true, remote);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${label} — 오류: ${msg}`);
      stats.failed++;
      stats.errors.push({ key: obj.key, error: msg });
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Supabase public URL 빌더
// ---------------------------------------------------------------------------
function buildSupabasePublicUrl(supabaseUrl, bucket, objectKey) {
  const base = String(supabaseUrl || '').replace(/\/+$/, '');
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/${bucket}/${encodedKey}`;
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------
async function main() {
  const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  const r2AccountId = readEnv('R2_ACCOUNT_ID');
  const r2AccessKeyId = readEnv('R2_ACCESS_KEY_ID');
  const r2SecretAccessKey = readEnv('R2_SECRET_ACCESS_KEY');
  const r2Bucket = readEnv('R2_CHAT_BUCKET') || DEFAULT_R2_BUCKET;

  const bucketArg = readOption('--bucket', '');
  const limitArg = Number(readOption('--limit', '0')) || 0;
  const dryRun = !readFlag('--remote') && !readFlag('--local');
  const remote = readFlag('--remote');

  // 입력 검증
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('오류: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
    process.exit(1);
  }
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
    console.error('오류: R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY가 필요합니다.');
    process.exit(1);
  }

  const bucketsToProcess = bucketArg
    ? [bucketArg]
    : ALL_BUCKETS;

  // 알 수 없는 버킷 체크
  const unknownBuckets = bucketsToProcess.filter((b) => !BUCKET_CONFIG[b]);
  if (unknownBuckets.length > 0) {
    console.error(`오류: 지원하지 않는 버킷: ${unknownBuckets.join(', ')}`);
    console.error(`지원 버킷: ${ALL_BUCKETS.join(', ')}`);
    process.exit(1);
  }

  console.log('Supabase Storage → Cloudflare R2 마이그레이션');
  console.log(`R2 버킷: ${r2Bucket}`);
  console.log(`처리 버킷: ${bucketsToProcess.join(', ')}`);
  console.log(`모드: ${dryRun ? 'DRY-RUN' : remote ? 'REMOTE' : 'LOCAL'}`);
  if (limitArg > 0) console.log(`파일 수 제한: ${limitArg}`);
  console.log('');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
  });

  const allStats = [];

  for (const bucket of bucketsToProcess) {
    const stats = await migrateBucket(bucket, supabase, r2Client, r2Bucket, {
      dryRun,
      remote,
      limit: limitArg,
    });
    allStats.push(stats);
  }

  // 최종 요약
  console.log('\n' + '='.repeat(60));
  console.log('마이그레이션 요약');
  console.log('='.repeat(60));
  for (const s of allStats) {
    console.log(`\n[${s.bucket}]`);
    console.log(`  전체 파일: ${s.total} (${(s.totalBytes / 1024 / 1024).toFixed(2)} MB)`);
    if (!dryRun) {
      console.log(`  업로드 완료: ${s.uploaded}`);
      console.log(`  건너뜀(이미 존재): ${s.skipped}`);
      console.log(`  DB URL 갱신: ${s.dbUpdated}`);
    }
    console.log(`  실패: ${s.failed}`);
    if (s.errors.length > 0) {
      console.log('  실패 목록:');
      for (const e of s.errors) {
        console.log(`    - ${e.key}: ${e.error}`);
      }
    }
  }

  const totalFailed = allStats.reduce((sum, s) => sum + s.failed, 0);
  if (totalFailed > 0) {
    console.error(`\n경고: 총 ${totalFailed}개 파일 처리 실패`);
    process.exit(1);
  }

  console.log('\n완료.');
}

main().catch((err) => {
  console.error('[migrate-supabase-storage-to-r2] 치명적 오류');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

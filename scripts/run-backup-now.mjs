/**
 * 즉시 D1 → R2 전체 백업 (로컬에서 원격 D1/R2 사용)
 * Usage: node scripts/run-backup-now.mjs
 *
 * - D1: wrangler d1 execute --remote
 * - R2: .env.local 의 R2_* 로 PUT
 * - 메타: backup_restore_runs 에 1행 INSERT (가능 시)
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

// load .env.local
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const FULL_BACKUP_TABLES = [
  'companies', 'staff_members', 'staff_transfer_history', 'employment_contracts',
  'work_shifts', 'shift_assignments', 'annual_leave_promotion_logs', 'approval_form_types',
  'approval_templates', 'approvals', 'approval_history', 'certificate_issuances',
  'document_repository', 'attendance', 'attendances', 'attendance_corrections',
  'leave_requests', 'leave_balances', 'leave_accruals', 'payroll_records',
  'chat_rooms', 'messages', 'board_posts', 'board_post_comments', 'board_post_reads',
  'inventory', 'inventory_logs', 'purchase_orders', 'suppliers',
  'todos', 'todo_reminder_logs', 'backup_restore_runs', 'tasks', 'popups', 'audit_logs',
];

// 실제 존재하는 테이블만 백업 (실패 스킵)
// DB 이름은 wrangler.toml 의 database_name 과 반드시 일치해야 한다.
// 예전에는 'pchos-d1'(구 DB)로 하드코딩돼 있어, 운영 DB 가 pchos-d1-v2 로 바뀐 뒤
// 이 스크립트를 돌리면 엉뚱한 DB 를 백업하거나 통째로 실패한다.
const DB = 'pchos-d1-v2';
const R2_BUCKET = 'pchos-files';
const PAGE = 500;

function d1Json(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  const cmd = `npx wrangler d1 execute ${DB} --remote --json --command "${escaped}"`;
  const out = execSync(cmd, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    cwd: root,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const start = out.indexOf('[');
  const startObj = out.indexOf('{');
  let jsonStr = out;
  if (start >= 0 && (startObj < 0 || start <= startObj)) jsonStr = out.slice(start);
  else if (startObj >= 0) jsonStr = out.slice(startObj);
  const parsed = JSON.parse(jsonStr);
  if (Array.isArray(parsed)) {
    for (const block of parsed) {
      if (Array.isArray(block?.results)) return block.results;
    }
    return [];
  }
  return parsed?.results ?? [];
}

function amzDate(d = new Date()) {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amz: `${iso.slice(0, 15)}Z`, date: iso.slice(0, 8) };
}
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}
function sha256hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

async function putR2(objectKey, bodyBuf, contentType) {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY required');
  }
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const { amz, date } = amzDate();
  const payloadHash = sha256hex(bodyBuf);
  const canonicalUri = `/${awsEncode(R2_BUCKET)}/${objectKey.split('/').map(awsEncode).join('/')}`;
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amz}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${date}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amz,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join('\n');
  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  const auth = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = `https://${host}${canonicalUri}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: auth,
      'content-type': contentType,
      'x-amz-date': amz,
      'x-amz-content-sha256': payloadHash,
    },
    body: bodyBuf,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`R2 PUT ${res.status}: ${t.slice(0, 300)}`);
  }
}

function kstDateOnly(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

async function main() {
  const started = Date.now();
  const startedAt = new Date().toISOString();
  console.log(`[backup] start ${startedAt}`);

  const data = {};
  let totalRows = 0;
  const tableErrors = [];

  for (const table of FULL_BACKUP_TABLES) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) continue;
    try {
      const all = [];
      let offset = 0;
      for (;;) {
        const rows = d1Json(`SELECT * FROM "${table}" LIMIT ${PAGE} OFFSET ${offset}`);
        if (!Array.isArray(rows) || rows.length === 0) break;
        all.push(...rows);
        if (rows.length < PAGE) break;
        offset += PAGE;
      }
      data[table] = all;
      totalRows += all.length;
      console.log(`  ${table}: ${all.length} rows`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      tableErrors.push({ table, error: msg.slice(0, 200) });
      console.warn(`  skip ${table}: ${msg.slice(0, 120)}`);
    }
  }

  const iso = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dateOnly = kstDateOnly();
  const objectKey = `backup/24h/mso-full-${dateOnly}-${iso}.json`;
  const payload = {
    meta: {
      type: '24h',
      createdAt: startedAt,
      tables: Object.keys(data).length,
      rows: totalRows,
      errors: tableErrors,
      source: 'scripts/run-backup-now.mjs',
    },
    data,
  };
  const tmpDir = path.join(root, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const localFile = path.join(tmpDir, `mso-full-${dateOnly}-${iso}.json`);
  fs.writeFileSync(localFile, JSON.stringify(payload), 'utf8');
  const bytes = fs.statSync(localFile).size;
  console.log(
    `[backup] local file ${localFile} (${(bytes / 1024 / 1024).toFixed(2)} MB, tables=${Object.keys(data).length}, rows=${totalRows})`,
  );

  // wrangler r2 object put 이 서명/빈 업로드 이슈 없이 안정적
  const putCmd = `npx wrangler r2 object put ${R2_BUCKET}/${objectKey} --file "${localFile}" --content-type application/json --remote -y`;
  console.log(`[backup] ${putCmd}`);
  execSync(putCmd, { cwd: root, stdio: 'inherit', shell: true, maxBuffer: 64 * 1024 * 1024 });
  console.log('[backup] R2 upload OK');

  // meta row (best effort, short JSON)
  const runId = crypto.randomUUID();
  const finishedAt = new Date().toISOString();
  const summary = JSON.stringify({
    path: objectKey,
    bytes,
    tables: Object.keys(data).length,
    rows: totalRows,
    source: 'run-backup-now',
  });
  try {
    const sqlPath = path.join(tmpDir, `backup-meta-${runId}.sql`);
    fs.writeFileSync(
      sqlPath,
      `INSERT INTO backup_restore_runs (id, file_name, result_summary, total_rows, total_tables, status, requested_by_name, started_at, finished_at) VALUES ('${runId}', '${objectKey}', '${summary.replace(/'/g, "''")}', ${totalRows}, ${Object.keys(data).length}, 'completed', 'run-backup-now', '${startedAt}', '${finishedAt}');\n`,
      'utf8',
    );
    execSync(`npx wrangler d1 execute ${DB} --remote --file "${sqlPath}" -y`, {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    });
    console.log('[backup] backup_restore_runs meta inserted');
  } catch (e) {
    console.warn('[backup] meta insert failed (non-fatal):', e instanceof Error ? e.message : e);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        path: objectKey,
        localFile,
        tables: Object.keys(data).length,
        rows: totalRows,
        bytes,
        durationMs: Date.now() - started,
        tableErrors,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error('[backup] FAILED', e);
  process.exit(1);
});

/**
 * 생일자 자동 공지 소급 실행 (원격 D1, CRON_SECRET 불필요)
 *
 * processBirthdayAnnouncements 와 동일 규칙:
 * - 재직 직원 중 대상일(KST) 생일 매칭 (birth_date 또는 resident_no)
 * - congratulations_condolences INSERT OR IGNORE (결정적 id)
 * - 공지방 공지봇 메시지 INSERT OR IGNORE (결정적 id) + chat_rooms last_message 갱신
 * - chat_push_jobs 큐 적재
 *
 * Usage:
 *   node scripts/run-birthday-announcements-d1.mjs --dry-run --date=2026-07-05
 *   node scripts/run-birthday-announcements-d1.mjs --date=2026-07-05
 *   node scripts/run-birthday-announcements-d1.mjs
 */
import { execSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const dateArg = args.find((a) => a.startsWith('--date='));
// 운영 DB 이름. wrangler.toml 의 database_name 과 일치해야 한다.
// 예전에는 구 DB 'pchos-d1' 로 굳어 있었다. 운영이 pchos-d1-v2 로 바뀐 뒤에도
// 그대로여서, 실행해도 사실상 빈 구 DB 에 아무 일도 없이 "성공"으로 끝났다.
const DB = 'pchos-d1-v2';

// 이 스크립트는 운영 데이터를 직접 수정한다. 위 DB 이름을 바로잡은 이상
// 실수로 실행하면 진짜 데이터가 바뀌므로 명시적 확인을 요구한다.
if (!process.argv.includes('--dry-run') && !process.argv.includes('--yes')) {
  console.error(
    `[${DB}] 운영 데이터베이스를 수정합니다. 확인했으면 --yes 를 붙여 다시 실행하세요. (먼저 --dry-run 으로 확인하세요)`,
  );
  process.exit(1);
}
const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';
const WORK = mkdtempSync(join(tmpdir(), 'bday-'));

function kstToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const TODAY = dateArg ? dateArg.split('=')[1] : kstToday();
if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) {
  console.error('Invalid --date=YYYY-MM-DD');
  process.exit(2);
}
const YEAR = TODAY.slice(0, 4);
const kstMonth = Number(TODAY.slice(5, 7));
const kstDay = Number(TODAY.slice(8, 10));
const nowIso = `${TODAY}T00:00:00.000Z`;

function extractJson(out) {
  const start = out.indexOf('[');
  const startObj = out.indexOf('{');
  let jsonStr = out;
  if (start >= 0 && (startObj < 0 || start <= startObj)) jsonStr = out.slice(start);
  else if (startObj >= 0) jsonStr = out.slice(startObj);
  return JSON.parse(jsonStr);
}

function d1Query(commandSql) {
  const escaped = commandSql.replace(/"/g, '\\"');
  const cmd = `npx wrangler d1 execute ${DB} --remote --json --command "${escaped}"`;
  const out = execSync(cmd, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    cwd: process.cwd(),
    shell: true,
  });
  const parsed = extractJson(out);
  if (Array.isArray(parsed)) {
    for (const block of parsed) {
      const rows = block?.results;
      if (Array.isArray(rows) && rows.length > 0) {
        const k = Object.keys(rows[0] || {});
        if (!k.includes('Total queries executed')) return rows;
      }
      if (Array.isArray(rows)) return rows;
    }
    return parsed[0]?.results ?? [];
  }
  return parsed?.results ?? [];
}

function d1File(sql) {
  const path = join(WORK, `w-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(path, sql, 'utf8');
  try {
    const cmd = `npx wrangler d1 execute ${DB} --remote --json --file "${path}"`;
    return execSync(cmd, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      cwd: process.cwd(),
      shell: true,
    });
  } finally {
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
  }
}

function sqlStr(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function buildDeterministicId(namespace, staffId, year) {
  const source = `erp-birthday:${namespace}:${staffId}:${year}`;
  const bytes = createHash('sha256').update(source).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function parseBirthday(staff) {
  let birthMonth = null;
  let birthDay = null;
  if (staff.birth_date) {
    const cleanBirth = String(staff.birth_date).replace(/[^0-9]/g, '');
    if (cleanBirth.length === 8) {
      birthMonth = Number(cleanBirth.slice(4, 6));
      birthDay = Number(cleanBirth.slice(6, 8));
    } else if (cleanBirth.length === 4) {
      birthMonth = Number(cleanBirth.slice(0, 2));
      birthDay = Number(cleanBirth.slice(2, 4));
    } else if (String(staff.birth_date).includes('-')) {
      const parts = String(staff.birth_date).split('-');
      if (parts.length === 3) {
        birthMonth = Number(parts[1]);
        birthDay = Number(parts[2]);
      }
    }
  }
  if ((birthMonth === null || birthDay === null) && staff.resident_no) {
    const digits = String(staff.resident_no).replace(/[^0-9]/g, '');
    if (digits.length >= 6) {
      birthMonth = Number(digits.slice(2, 4));
      birthDay = Number(digits.slice(4, 6));
    }
  }
  return { birthMonth, birthDay };
}

console.log(`[birthday-d1] targetDate=${TODAY} dryRun=${DRY}`);

const staffs = d1Query(
  `SELECT id, name, company, department, position, resident_no, birth_date FROM staff_members WHERE status = '재직'`,
);

const birthdayStaffs = staffs.filter((s) => {
  const { birthMonth, birthDay } = parseBirthday(s);
  return birthMonth === kstMonth && birthDay === kstDay;
});

console.log(`[birthday-d1] matched ${birthdayStaffs.length} staff:`, birthdayStaffs.map((s) => s.name).join(', ') || '(none)');

if (birthdayStaffs.length === 0) {
  console.log('[birthday-d1] nothing to do');
  process.exit(0);
}

let addedToWelfare = 0;
let postedToChat = 0;
let pushQueued = 0;
const errors = [];
const statements = [];

for (const staff of birthdayStaffs) {
  const welfareId = buildDeterministicId('welfare', staff.id, YEAR);
  const messageId = buildDeterministicId('chat', staff.id, YEAR);
  const companyLabel = staff.company || '병원';
  const deptLabel = staff.department ? `${staff.department} ` : '';
  const posLabel = staff.position || '직원';
  const content = `🎉 오늘은 [ ${companyLabel} ] ${deptLabel}${staff.name} ${posLabel}님의 기분 좋은 생일입니다!
마주치면 축하의 말 한마디씩 나누는 행복한 하루가 되었으면 좋겠습니다. 🎂🎈

${staff.name}님, 오늘 세상에서 가장 특별하고 행복한 하루 보내세요! 축하드립니다! 🥳❤️`;

  const existingMsg = d1Query(`SELECT id FROM messages WHERE id = ${sqlStr(messageId)} LIMIT 1`);
  const existingWelfare = d1Query(
    `SELECT id FROM congratulations_condolences WHERE id = ${sqlStr(welfareId)} LIMIT 1`,
  );

  if (existingWelfare.length === 0) {
    statements.push(`INSERT OR IGNORE INTO congratulations_condolences (
      id, staff_id, staff_name, company, department,
      event_type, event_date, relation, recipient,
      amount, wreath_sent, status, memo
    ) VALUES (
      ${sqlStr(welfareId)}, ${sqlStr(staff.id)}, ${sqlStr(staff.name)}, ${sqlStr(staff.company)}, ${sqlStr(staff.department || '')},
      '생일', ${sqlStr(TODAY)}, '본인', ${sqlStr(staff.name)},
      50000, 0, '지급완료', '생일자 자동 등록'
    );`);
    addedToWelfare += 1;
    console.log(`  + welfare: ${staff.name}`);
  } else {
    console.log(`  = welfare already exists: ${staff.name}`);
  }

  if (existingMsg.length === 0) {
    statements.push(`INSERT OR IGNORE INTO messages (
      id, room_id, sender_id, sender_name, content, created_at, message_type, is_deleted
    ) VALUES (
      ${sqlStr(messageId)}, ${sqlStr(NOTICE_ROOM_ID)}, NULL, '공지봇', ${sqlStr(content)}, ${sqlStr(nowIso)}, 'text', 0
    );`);
    // 소급 메시지는 과거 created_at 이므로, 공지방 last_message 는
    // 기존보다 더 최신일 때만 갱신 (목록 정렬 오염 방지).
    const preview = content.slice(0, 80);
    statements.push(`UPDATE chat_rooms SET
      last_message = ${sqlStr(content)},
      last_message_at = ${sqlStr(nowIso)},
      last_message_preview = ${sqlStr(preview)}
    WHERE id = ${sqlStr(NOTICE_ROOM_ID)}
      AND (last_message_at IS NULL OR last_message_at < ${sqlStr(nowIso)});`);
    const pushId = randomUUID();
    statements.push(`INSERT OR IGNORE INTO chat_push_jobs (
      id, message_id, room_id, sender_id, created_at, next_attempt_at, attempt_count
    ) VALUES (
      ${sqlStr(pushId)}, ${sqlStr(messageId)}, ${sqlStr(NOTICE_ROOM_ID)}, NULL, ${sqlStr(new Date().toISOString())}, ${sqlStr(new Date().toISOString())}, 0
    );`);
    postedToChat += 1;
    pushQueued += 1;
    console.log(`  + chat+push: ${staff.name} (${messageId})`);
  } else {
    console.log(`  = chat already exists: ${staff.name}`);
  }
}

if (DRY) {
  console.log(`[birthday-d1] DRY RUN — would execute ${statements.length} SQL statements`);
  console.log(JSON.stringify({ ok: true, targetDate: TODAY, processedCount: birthdayStaffs.length, addedToWelfare, postedToChat, pushQueued, errors }, null, 2));
  process.exit(0);
}

if (statements.length === 0) {
  console.log('[birthday-d1] all rows already present, nothing to insert');
  console.log(JSON.stringify({ ok: true, targetDate: TODAY, processedCount: birthdayStaffs.length, addedToWelfare: 0, postedToChat: 0, pushQueued: 0, errors }, null, 2));
  process.exit(0);
}

try {
  d1File(statements.join('\n'));
  console.log(`[birthday-d1] applied ${statements.length} statements`);
} catch (err) {
  errors.push(err instanceof Error ? err.message : String(err));
  console.error('[birthday-d1] apply failed:', err);
  process.exit(1);
}

const result = {
  ok: true,
  targetDate: TODAY,
  processedCount: birthdayStaffs.length,
  addedToWelfare,
  postedToChat,
  pushQueued,
  errors,
};
console.log(JSON.stringify(result, null, 2));
process.exit(0);

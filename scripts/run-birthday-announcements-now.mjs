/**
 * 생일자 자동 공지 1회 실행 (원격 Worker cron 엔드포인트 호출)
 *
 * Usage:
 *   node scripts/run-birthday-announcements-now.mjs
 *   node scripts/run-birthday-announcements-now.mjs --date=2026-07-05
 *   node scripts/run-birthday-announcements-now.mjs https://erp.pchos.kr --date=2026-07-05
 *
 * CRON_SECRET 은 .env.local 또는 환경변수에서 로드.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

const args = process.argv.slice(2);
const dateArg = args.find((a) => a.startsWith('--date='));
const baseArg = args.find((a) => !a.startsWith('--') && a.startsWith('http'));
const secret = String(process.env.CRON_SECRET || '').trim();
const base = baseArg || process.env.APP_BASE_URL || 'https://erp.pchos.kr';
const date = dateArg ? dateArg.split('=')[1] : '';

if (!secret) {
  console.error(
    'CRON_SECRET 이 .env.local / 환경에 없습니다.\n' +
      '대안: node scripts/run-birthday-announcements-d1.mjs --date=YYYY-MM-DD\n' +
      '(D1 직접 실행, CRON_SECRET 불필요)',
  );
  process.exit(2);
}

const qs = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `?date=${date}` : '';
const url = `${base.replace(/\/$/, '')}/api/cron/birthday-announcements${qs}`;
console.log('[birthday] GET', url);
const res = await fetch(url, {
  method: 'GET',
  headers: { authorization: `Bearer ${secret}` },
});
const text = await res.text();
console.log('[birthday] status', res.status);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text.slice(0, 2000));
}
process.exit(res.ok ? 0 : 1);

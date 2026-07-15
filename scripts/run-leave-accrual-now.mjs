/**
 * 연차 자동부여 1회 실행 (원격 Worker cron 과 동일 로직을 로컬에서 흉내내지 않고
 * 관리자 diagnose rebalance + D1 직접 호출 대안).
 *
 * Worker 에 배포된 /api/cron/annual-leave-accrual 을 CRON_SECRET 으로 호출.
 * CRON_SECRET 이 .env.local 에 없으면 안내 후 종료.
 *
 * Usage: node scripts/run-leave-accrual-now.mjs [baseUrl]
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

const secret = String(process.env.CRON_SECRET || '').trim();
const base = process.argv[2] || process.env.APP_BASE_URL || 'https://erp.pchos.kr';

if (!secret) {
  console.error(
    'CRON_SECRET 이 .env.local / 환경에 없습니다.\n' +
      'Cloudflare Dashboard → Workers → erp-pchos → Settings → Variables 에서 확인 후\n' +
      '  CRON_SECRET=... node scripts/run-leave-accrual-now.mjs\n' +
      '또는 배포 후 자정 cron 을 기다리세요.',
  );
  process.exit(2);
}

const url = `${base.replace(/\/$/, '')}/api/cron/annual-leave-accrual`;
console.log('[accrual] GET', url);
const res = await fetch(url, {
  method: 'GET',
  headers: { authorization: `Bearer ${secret}` },
});
const text = await res.text();
console.log('[accrual] status', res.status);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text.slice(0, 2000));
}
process.exit(res.ok ? 0 : 1);

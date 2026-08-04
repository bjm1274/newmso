#!/usr/bin/env node
/**
 * scripts/verify-cron-wiring.mjs
 *
 * 크론 배선 3자 대조를 강제한다.
 *   wrangler.toml [triggers] crons
 *     ↔ cloudflare-worker.ts CRON_ROUTES_BY_SCHEDULE
 *       ↔ app/api/cron/* 실제 라우트
 *         ↔ 운영 패널이 광고하는 목록 (OPERATION_CRONS)
 *
 * 이 대조가 없어서 같은 사고가 두 번 났다.
 *   - 과거: main 이 .open-next/worker.js 직접 지정 → scheduled 핸들러 부재로 cron 5개 전부 무동작
 *   - 7차~8차: '30 15 * * *' 가 워커 매핑에만 있고 wrangler 트리거에 없어
 *     결근 자동 생성이 영구 미실행 (7차에서 지적됐으나 8차까지 그대로 남아 있었다)
 *
 * 실행: node scripts/verify-cron-wiring.mjs   (문제가 있으면 exit 1)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// 1) wrangler.toml [triggers] crons
const toml = read('wrangler.toml');
const cronsBlock = toml.match(/crons\s*=\s*\[([\s\S]*?)\]/);
const tomlCrons = [...(cronsBlock?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);

// 2) cloudflare-worker.ts 의 스케줄 → 라우트 매핑
const worker = read('cloudflare-worker.ts');
const mapBlock = worker.match(/const CRON_ROUTES_BY_SCHEDULE[^=]*=\s*\{([\s\S]*?)\n\};/);
// 주석 줄을 먼저 걷어낸다 — 주석 안의 따옴표가 라우트로 오인된다.
const mapBody = (mapBlock?.[1] ?? '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');
/** @type {Record<string, string[]>} */
const workerMap = {};
for (const m of mapBody.matchAll(/'([^']+)'\s*:\s*\[([\s\S]*?)\]/g)) {
  workerMap[m[1]] = [...m[2].matchAll(/'([^']+)'/g)]
    .map((x) => x[1])
    .filter((s) => s.startsWith('/api/'));
}

// 3) 실제 존재하는 크론 라우트
const routeDirs = fs
  .readdirSync(path.join(ROOT, 'app/api/cron'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => `/api/cron/${d.name}`);

// 4) 운영 패널이 광고하는 목록
const shared = read('app/api/admin/system-master/_shared.ts');
const opBlock = shared.match(/export const OPERATION_CRONS\s*=\s*\[([\s\S]*?)\]\s*as const;/);
const panelPaths = [...(opBlock?.[1] ?? '').matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]);

let problems = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  problems += 1;
};
const section = (title, run) => {
  const before = problems;
  console.log(`\n[${title}]`);
  run();
  if (problems === before) console.log('  OK');
};

console.log(`wrangler [triggers] crons: ${tomlCrons.length}개`);
for (const c of tomlCrons) {
  console.log(`    ${c}  →  ${(workerMap[c] ?? []).join(', ') || '(매핑 없음)'}`);
}

section('워커 매핑에 라우트가 있는데 wrangler 트리거가 없음 → 영구 미실행', () => {
  for (const [cron, routes] of Object.entries(workerMap)) {
    if (routes.length > 0 && !tomlCrons.includes(cron)) {
      fail(`'${cron}' 미등록인데 라우트 ${routes.length}개 매핑: ${routes.join(', ')}`);
    }
  }
});

section('wrangler 트리거가 있는데 워커 매핑 키가 없음 → 빈 실행', () => {
  for (const cron of tomlCrons) {
    if (!(cron in workerMap)) fail(`'${cron}' 에 대응하는 워커 매핑 키 없음`);
  }
});

section('매핑된 라우트가 실제로 존재하는가', () => {
  for (const [cron, routes] of Object.entries(workerMap)) {
    for (const r of routes) {
      if (!routeDirs.includes(r)) fail(`'${cron}' 의 ${r} 디렉터리 없음`);
    }
  }
});

const wired = new Set(
  Object.entries(workerMap)
    .filter(([cron]) => tomlCrons.includes(cron))
    .flatMap(([, routes]) => routes),
);

section('운영 패널 목록이 실제 배선과 일치하는가', () => {
  for (const p of panelPaths) {
    if (!wired.has(p)) fail(`패널에 표시되지만 배선 안 됨: ${p}`);
  }
  for (const p of wired) {
    if (!panelPaths.includes(p)) fail(`배선돼 있지만 패널에 없음: ${p}`);
  }
});

const orphans = routeDirs.filter((r) => !wired.has(r));
console.log('\n[참고] 어느 스케줄에도 배선되지 않은 라우트 (수동 호출 전용)');
if (orphans.length) orphans.forEach((r) => console.log(`    - ${r}`));
else console.log('    (없음)');

console.log(`\n문제 ${problems}건`);
process.exit(problems ? 1 : 0);

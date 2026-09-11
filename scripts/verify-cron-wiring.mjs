import fs from 'node:fs';
import assert from 'node:assert/strict';
import cron from 'node-cron';
import { CRON_SCHEDULES, INDIRECT_CRONS } from '../lib/cron-schedules.mjs';
const server=fs.readFileSync('server.mjs','utf8');
assert.match(server,/Object\.entries\(CRON_SCHEDULES\)/);
const wired=new Set();
for(const [schedule,routes] of Object.entries(CRON_SCHEDULES)) {
  assert.ok(cron.validate(schedule),`잘못된 스케줄: ${schedule}`);
  for(const route of routes) {
    assert.ok(!wired.has(route),`중복 작업: ${route}`);
    assert.ok(fs.existsSync(`app${route}/route.ts`),`누락된 라우트: ${route}`);
    wired.add(route);
  }
}
for(const [route,{parent,handler}] of Object.entries(INDIRECT_CRONS)) {
  assert.ok(wired.has(parent));
  assert.ok(fs.existsSync(`app${route}/route.ts`));
  assert.ok(fs.readFileSync(`app${parent}/route.ts`,'utf8').includes(`await ${handler}(`),`연결되지 않은 하위 작업: ${route}`);
  wired.add(route);
}
for(const name of fs.readdirSync('app/api/cron')) {
  if(fs.existsSync(`app/api/cron/${name}/route.ts`))assert.ok(wired.has(`/api/cron/${name}`),`스케줄 미등록: ${name}`);
}
const panel=fs.readFileSync('app/api/admin/system-master/_shared.ts','utf8').split('export const OPERATION_CRONS = [')[1].split('] as const')[0];
for(const [,route] of panel.matchAll(/path: '([^']+)'/g))assert.ok(wired.has(route),`패널의 작업이 미등록: ${route}`);
console.log(`자동 작업 검증 통과: 스케줄 ${Object.keys(CRON_SCHEDULES).length}개, 직접·간접 라우트 ${wired.size}개`);

/**
 * upload-secrets.mjs
 *
 * .env.local 의 서버 전용 시크릿을 `wrangler secret put` 으로 올린다.
 *
 * 예전 구현의 문제 세 가지를 고쳤다.
 *  1) 시크릿 값을 저장소 루트에 `<KEY>.tmp` 평문 파일로 쓴 뒤 읽어서 파이프했다.
 *     업로드가 중간에 실패하면 그 파일이 그대로 남고, 당시 deploy 스크립트의
 *     `git add -A` 가 그것까지 커밋 대상에 올렸다. 이제 파일을 만들지 않고
 *     값을 stdin 으로 바로 넘긴다.
 *  2) 폐기된 Supabase 키 2종을 계속 올리고 있었다 (D1 컷오버로 무의미).
 *  3) 실패해도 다음 키로 넘어가고 exit 0 으로 끝나, 일부만 올라간 것을 알 수 없었다.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { loadEnvLocal } from './scripts/_lib/env.mjs';

const ROOT = process.cwd();

// Workers 런타임이 서버에서만 쓰는 값들. NEXT_PUBLIC_* 는 여기 넣지 않는다
// (그건 wrangler.toml 의 [vars] 로 이미 공개 배포된다).
const SECRETS_TO_UPLOAD = [
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'FIREBASE_SERVICE_ACCOUNT',
  'SESSION_SECRET',
  'CRON_SECRET',
];

const env = loadEnvLocal(ROOT);
const cfToken = env.CLOUDFLARE_API_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN ?? '';
if (!cfToken) {
  console.error('오류: CLOUDFLARE_API_TOKEN 이 없습니다 (.env.local 또는 환경변수).');
  process.exit(1);
}

const wranglerJs = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const uploaded = [];
const skipped = [];
const failed = [];

for (const key of SECRETS_TO_UPLOAD) {
  const value = env[key];
  if (!value) {
    skipped.push(key);
    continue;
  }

  console.log(`Uploading secret: ${key}`);
  try {
    // 값은 stdin 으로만 전달한다 — 디스크에도, 명령행에도 남기지 않는다.
    // (명령행 인자는 다른 프로세스에서 볼 수 있다.)
    execFileSync(process.execPath, [wranglerJs, 'secret', 'put', key], {
      cwd: ROOT,
      env: { ...process.env, CLOUDFLARE_API_TOKEN: cfToken },
      input: value,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    uploaded.push(key);
  } catch (err) {
    console.error(`Failed to upload ${key}: ${err.message}`);
    failed.push(key);
  }
}

console.log('');
console.log(`업로드 ${uploaded.length}건: ${uploaded.join(', ') || '(없음)'}`);
if (skipped.length) console.log(`.env.local 에 값이 없어 건너뜀: ${skipped.join(', ')}`);

if (failed.length) {
  console.error(`실패 ${failed.length}건: ${failed.join(', ')}`);
  console.error('일부 시크릿이 올라가지 않았습니다. 위 오류를 확인하고 다시 실행하세요.');
  process.exit(1);
}

console.log('Finished uploading secrets!');

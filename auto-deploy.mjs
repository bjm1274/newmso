/**
 * auto-deploy.mjs
 *
 * 대화형 확인 없이 빌드 → 배포만 수행하는 래퍼.
 * git 작업까지 포함한 대화형 경로는 `npm run deploy` (scripts/deploy.mjs) 를 쓴다.
 *
 * 빌드를 반드시 먼저 돌린다. deploy:cloudflare 만 단독 실행하면 재빌드 없이
 * 옛 번들이 올라가 "성공했지만 아무것도 안 바뀐 배포" 가 된다.
 */

import { execSync } from 'node:child_process';
import process from 'node:process';
import { applyEnvLocal } from './scripts/_lib/env.mjs';

try {
  const applied = applyEnvLocal(process.cwd());
  if (applied.includes('CLOUDFLARE_API_TOKEN')) {
    console.log('Loaded CLOUDFLARE_API_TOKEN from .env.local');
  }

  // `npm.cmd` 를 직접 부르지 않는다. 저장소 루트에 npm.cmd 래퍼 파일이 있으면
  // cmd.exe 가 PATH 보다 현재 디렉터리를 먼저 찾아 그 래퍼가 실행돼 버린다.
  // `npm` 으로 부르면 PATHEXT 규칙에 따라 정상 설치된 npm 이 선택된다.
  console.log('Running build:cloudflare...');
  execSync('npm run build:cloudflare', { stdio: 'inherit' });

  console.log('Running deploy:cloudflare...');
  execSync('npm run deploy:cloudflare', { stdio: 'inherit' });

  console.log('Deployment completed successfully!');
} catch (error) {
  console.error('Deployment failed:', error.message);
  process.exit(1);
}

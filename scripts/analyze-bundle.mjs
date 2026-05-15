#!/usr/bin/env node
/**
 * analyze-bundle.mjs — Windows / Unix 모두에서 동작하는 bundle analyzer 트리거.
 *
 * `npm run analyze` 호출 시 ANALYZE=true 환경변수를 설정해 next build 를 실행한다.
 * next.config.ts 의 withBundleAnalyzer 래퍼가 이 변수를 감지해 분석 리포트를 생성한다.
 */

import { spawn } from 'node:child_process';
import process from 'node:process';

const child = spawn('npx', ['next', 'build', '--webpack'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ANALYZE: 'true' },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error('[analyze-bundle] next build 실행 실패:', err);
  process.exit(1);
});

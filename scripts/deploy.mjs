#!/usr/bin/env node
/**
 * scripts/deploy.mjs
 * 한 번의 명령어로 Git 추가 -> 커밋 -> 푸시 -> Cloudflare 빌드 및 배포까지 처리하는 자동화 스크립트입니다.
 * 
 * 사용법:
 * - npm run deploy  (또는 node scripts/deploy.mjs)
 */

import { execSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import process from 'node:process';

// ANSI 컬러 코드 정의
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  let prefix = `[${timestamp}] ℹ️ `;
  let color = COLORS.reset;

  switch (type) {
    case 'success':
      prefix = `[${timestamp}] ✅ `;
      color = COLORS.green + COLORS.bright;
      break;
    case 'warning':
      prefix = `[${timestamp}] ⚠️ `;
      color = COLORS.yellow + COLORS.bright;
      break;
    case 'error':
      prefix = `[${timestamp}] ❌ `;
      color = COLORS.red + COLORS.bright;
      break;
    case 'info':
      prefix = `[${timestamp}] 🚀 `;
      color = COLORS.cyan;
      break;
    case 'git':
      prefix = `[${timestamp}] 🐙 `;
      color = COLORS.magenta;
      break;
  }
  console.log(`${color}${prefix}${message}${COLORS.reset}`);
}

function runCmd(cmd, stdio = 'pipe') {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio }).trim();
  } catch (error) {
    const errorMsg = error.stderr ? error.stderr.trim() : error.message;
    throw new Error(`[Command Failed: "${cmd}"] ${errorMsg}`);
  }
}

async function main() {
  const rl = readline.createInterface({ input, output });

  try {
    // 1. Git 상태 점검 및 브랜치 가져오기
    runCmd('git rev-parse --is-inside-work-tree');
    const branch = runCmd('git branch --show-current');
    
    if (!branch) {
      log('현재 활성화된 Git 브랜치를 찾을 수 없습니다.', 'error');
      process.exit(1);
    }
    
    log(`현재 배포 대상 브랜치: ${COLORS.bright}${branch}${COLORS.reset}`, 'git');

    // 2. 변경 파일 확인
    const status = runCmd('git status --porcelain');
    if (!status) {
      log('커밋할 변경 사항이 없습니다. 작업 트리가 깨끗합니다.', 'warning');
      const deployOnly = await rl.question('변경사항 없이 Cloudflare 배포만 진행할까요? (Y/n): ');
      if (deployOnly.toLowerCase() === 'n') {
        log('배포를 중단합니다.', 'warning');
        rl.close();
        process.exit(0);
      }
    } else {
      log('감지된 변경 사항:', 'info');
      console.log(status.split('\n').map(line => `  ${line}`).join('\n'));

      // 3. 커밋 메시지 입력 받기
      let commitMsg = await rl.question('\n📝 커밋 메시지를 입력해주세요 (미입력 시 기본 자동 메시지 적용): ');
      commitMsg = commitMsg.trim();
      
      if (!commitMsg) {
        const timeStr = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        commitMsg = `deploy: Auto-commit at ${timeStr}`;
        log(`기본 메시지 설정: "${commitMsg}"`, 'warning');
      }

      // 4. Git add & commit & push
      log('1단계: 변경 파일 스테이징 및 커밋 중...', 'info');
      runCmd('git add -A');
      runCmd(`git commit -m "${commitMsg}"`);
      log('로컬 커밋 완료.', 'success');

      log(`2단계: GitHub 원격 저장소(${branch})에 푸시 중...`, 'info');
      runCmd(`git push origin ${branch}`);
      log('GitHub 원격 저장소 푸시 완료!', 'success');
    }

    // 5. Cloudflare 빌드 및 배포
    log('\n3단계: Cloudflare 빌드 & 배포 진행 여부 확인', 'info');
    const deployAnswer = await rl.question('로컬 빌드 후 Cloudflare Pages/Worker로 직접 배포를 진행할까요? (Y/n): ');
    
    if (deployAnswer.toLowerCase() !== 'n') {
      log('Cloudflare 빌드를 시작합니다 (npm run build:cloudflare)...', 'info');
      log('이 과정은 시간이 다소 소요될 수 있습니다. 잠시만 기다려주세요.', 'warning');
      
      // 빌드와 배포는 실시간 로그 확인이 용이하도록 stdio: 'inherit'으로 실행
      runCmd('npm run build:cloudflare', 'inherit');
      log('Cloudflare 빌드가 정상 완료되었습니다!', 'success');

      log('Cloudflare 배포를 시작합니다 (npm run deploy:cloudflare)...', 'info');
      runCmd('npm run deploy:cloudflare', 'inherit');
      log('Cloudflare 배포가 완벽하게 성공했습니다! 🎉', 'success');
    } else {
      log('Cloudflare 직접 배포 단계를 스킵합니다. (GitHub 연동 자동배포가 설정되어 있는 경우 원격지에서 배포가 시작됩니다.)', 'success');
    }

    log('\n전체 배포 프로세스가 완료되었습니다. 수고하셨습니다! 👍', 'success');

  } catch (error) {
    log(error.message, 'error');
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();

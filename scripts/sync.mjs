#!/usr/bin/env node
/**
 * scripts/sync.mjs
 * PC와 노트북 간의 실시간 작업 연동을 안전하고 빠르게 처리하는 동기화 스크립트입니다.
 * 
 * 사용법:
 * - 저장(Save)할 때: npm run sync:save  (또는 node scripts/sync.mjs save)
 * - 불러올(Load) 때: npm run sync:load  (또는 node scripts/sync.mjs load)
 */

import { execSync } from 'node:child_process';
import os from 'node:os';
import process from 'node:process';

// ANSI 컬러 코드 정의 (콘솔 출력 가독성 향상)
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
      prefix = `[${timestamp}] 🔄 `;
      color = COLORS.cyan;
      break;
    case 'git':
      prefix = `[${timestamp}] 🐙 `;
      color = COLORS.magenta;
      break;
  }
  console.log(`${color}${prefix}${message}${COLORS.reset}`);
}

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (error) {
    // 에러 상세 정보 포함하여 throw
    const errorMsg = error.stderr ? error.stderr.trim() : error.message;
    throw new Error(`[Command Failed: "${cmd}"] ${errorMsg}`);
  }
}

// 메인 실행 함수
async function main() {
  const mode = process.argv[2];
  if (!mode || (mode !== 'save' && mode !== 'load')) {
    log('올바른 인자를 전달해주세요. (save 또는 load)', 'error');
    console.log('\n사용 예시:');
    console.log('  npm run sync:save   # 현재 작업 상태를 저장하여 원격 저장소에 업로드');
    console.log('  npm run sync:load   # 원격 저장소에서 최신 상태를 불러와 로컬에 동기화\n');
    process.exit(1);
  }

  try {
    // 1. Git 환경 확인
    runCmd('git rev-parse --is-inside-work-tree');
    const branch = runCmd('git branch --show-current');
    
    if (!branch) {
      log('현재 활성화된 Git 브랜치를 찾을 수 없습니다. Git 초기화 상태를 확인해주세요.', 'error');
      process.exit(1);
    }
    
    log(`현재 활성화된 브랜치: ${COLORS.bright}${branch}${COLORS.reset}`, 'git');

    if (mode === 'save') {
      log('현재 변경 사항 확인 중...', 'info');
      const status = runCmd('git status --porcelain');

      if (!status) {
        log('보낼 변경 사항이 없습니다. 작업 트리가 깨끗합니다.', 'success');
        log('원격 저장소와의 정렬을 위해 푸시만 시도합니다.', 'info');
      } else {
        log('변경된 파일 목록:', 'info');
        console.log(status.split('\n').map(line => `  ${line}`).join('\n'));
      }

      // 스테이징 및 커밋 생성
      log('변경 사항을 스테이징 영역에 추가하는 중 (git add .)...', 'info');
      runCmd('git add -A');

      const hostname = os.hostname();
      const timeStr = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      const commitMsg = `wip: sync from ${hostname} (${timeStr})`;
      
      log(`임시 커밋 생성 중: "${commitMsg}"...`, 'info');
      // 변경 사항이 없을 경우 커밋하지 않고 넘어감
      try {
        runCmd(`git commit -m "${commitMsg}"`);
        log('임시 커밋 완료.', 'success');
      } catch (e) {
        log('새로운 커밋을 생성할 필요가 없거나 이미 커밋되었습니다.', 'warning');
      }

      // 원격지로 푸시
      log(`GitHub 원격 저장소(${branch})에 작업 내용을 푸시하는 중...`, 'info');
      runCmd(`git push origin ${branch}`);
      log('작업 연동용 푸시가 성공적으로 완료되었습니다!', 'success');
      log('이제 노트북이나 다른 컴퓨터에서 "npm run sync:load"를 실행해 동기화할 수 있습니다.', 'success');

    } else if (mode === 'load') {
      log('로컬에 반영되지 않은 임시 변경 사항이 있는지 확인 중...', 'info');
      const localStatus = runCmd('git status --porcelain');

      if (localStatus) {
        log('로컬에 저장하지 않은 변경 사항이 존재합니다. 안전을 위해 임시 저장(Stash)합니다.', 'warning');
        const stashMsg = `Auto-stash before sync load: ${new Date().toLocaleString()}`;
        runCmd(`git stash push -m "${stashMsg}"`);
        log(`로컬 변경 사항이 Git Stash에 보관되었습니다. 필요시 "git stash pop"으로 복구할 수 있습니다.`, 'success');
      }

      log('원격 저장소의 최신 정보를 가져오는 중 (git fetch)...', 'info');
      runCmd('git fetch origin');

      log(`원격 저장소의 최신 커밋들을 풀(Pull)하는 중 (git pull origin ${branch})...`, 'info');
      const pullOutput = runCmd(`git pull origin ${branch}`);
      console.log(pullOutput);
      log('동기화 완료!', 'success');

      // package.json의 변경 여부 확인하여 npm install 자동화
      if (pullOutput.includes('package.json')) {
        log('동기화 과정에서 package.json 변경이 감지되었습니다. 패키지를 재설치합니다...', 'warning');
        log('npm install 실행 중. 잠시만 기다려주세요...', 'info');
        runCmd('npm install');
        log('의존성 패키지 설치 완료!', 'success');
      }
      
      log('모든 로컬 코드가 최신 상태로 동기화되었습니다. 작업을 계속해주세요!', 'success');
    }

  } catch (error) {
    log(error.message, 'error');
    process.exit(1);
  }
}

main();

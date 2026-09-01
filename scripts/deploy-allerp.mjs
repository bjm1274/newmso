/**
 * scripts/deploy-allerp.mjs
 *
 * AllERP 서버 (Oracle Cloud: 2 OCPU, 12GB RAM) 원클릭 SSH/SCP 자동 배포 도구.
 *
 * 사용법:
 *   node scripts/deploy-allerp.mjs <SERVER_IP>
 *   node scripts/deploy-allerp.mjs --ip=<SERVER_IP>
 *   node scripts/deploy-allerp.mjs --setup  (서버 초기 Docker/방화벽 설정 포함)
 */

import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. 인자 및 설정 파싱
const args = process.argv.slice(2);
let serverIp = args.find((a) => !a.startsWith('--') && !a.includes('='));
const ipArg = args.find((a) => a.startsWith('--ip='));
if (ipArg) serverIp = ipArg.split('=')[1];

if (!serverIp && process.env.ALLERP_HOST) {
  serverIp = process.env.ALLERP_HOST;
}

if (!serverIp) {
  // .env.local 또는 .env.production 에서 ALLERP_HOST 탐색
  const envPaths = [path.join(rootDir, '.env.production'), path.join(rootDir, '.env.local')];
  for (const envFile of envPaths) {
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf8');
      const match = content.match(/^ALLERP_HOST=(.+)$/m);
      if (match) {
        serverIp = match[1].trim();
        break;
      }
    }
  }
}

if (!serverIp) {
  console.error('====================================================');
  console.error(' [ERROR] AllERP 서버 공인 IP가 입력되지 않았습니다.');
  console.error('====================================================');
  console.error('사용법:');
  console.error('  node scripts/deploy-allerp.mjs <ALLERP_SERVER_IP>');
  console.error('  예: node scripts/deploy-allerp.mjs 123.45.67.89');
  process.exit(1);
}

const sshUser = process.env.ALLERP_USER || 'opc';
const keyPath = path.join(rootDir, 'AllERP.key');

if (!fs.existsSync(keyPath)) {
  console.error(`[ERROR] SSH 개인키 파일을 찾을 수 없습니다: ${keyPath}`);
  process.exit(1);
}

const isSetup = args.includes('--setup');
const remoteDir = '/opt/allerp';

console.log('====================================================');
console.log(` Starting One-Click Deploy to AllERP Server `);
console.log(` Target Host: ${sshUser}@${serverIp}`);
console.log(` SSH Key: ${keyPath}`);
console.log(` Remote Directory: ${remoteDir}`);
console.log('====================================================');

const sshOpts = [
  '-i',
  keyPath,
  '-o',
  'StrictHostKeyChecking=no',
  '-o',
  'UserKnownHostsFile=/dev/null',
];

function runSsh(command) {
  console.log(`[SSH] Executing: ${command}`);
  const res = spawnSync('ssh', [...sshOpts, `${sshUser}@${serverIp}`, command], {
    stdio: 'inherit',
    shell: false,
  });
  if (res.status !== 0) {
    throw new Error(`SSH command failed with exit code ${res.status}`);
  }
}

function runScp(localFile, remoteDest) {
  console.log(`[SCP] Uploading ${path.basename(localFile)} -> ${remoteDest}...`);
  const res = spawnSync(
    'scp',
    [...sshOpts, localFile, `${sshUser}@${serverIp}:${remoteDest}`],
    {
      stdio: 'inherit',
      shell: false,
    },
  );
  if (res.status !== 0) {
    throw new Error(`SCP transfer failed with exit code ${res.status}`);
  }
}

async function main() {
  // 1. 서버 연결 테스트
  console.log('\n[1/6] Testing SSH Connection...');
  try {
    runSsh('echo "✔ SSH connection established successfully as $(whoami) on $(hostname)"');
  } catch (err) {
    console.error('[deploy] SSH connection failed. Please check Server IP and Security List.');
    process.exit(1);
  }

  // 2. 서버 초기 설정 (--setup 플래그 시)
  if (isSetup) {
    console.log('\n[2/6] Running Server Setup (Docker & Firewall)...');
    const setupScript = path.join(rootDir, 'scripts', 'setup-allerp-server.sh');
    runScp(setupScript, '~/setup-allerp-server.sh');
    runSsh('sudo bash ~/setup-allerp-server.sh');
  } else {
    console.log('\n[2/6] Ensuring remote directories exist...');
    runSsh(`sudo mkdir -p ${remoteDir}/data ${remoteDir}/backups && sudo chown -R ${sshUser}:${sshUser} ${remoteDir}`);
  }

  // 3. 배포 아카이브 생성
  console.log('\n[3/6] Packaging project bundle for deployment...');
  const archivePath = path.join(rootDir, 'allerp-deploy.tar.gz');

  const tarExclude = [
    '--exclude=.git*',
    '--exclude=.open-next*',
    '--exclude=.wrangler*',
    '--exclude=node_modules*',
    '--exclude=.next*',
    '--exclude=electron-app*',
    '--exclude=.venv*',
    '--exclude=.claude*',
    '--exclude=.scratch*',
    '--exclude=*.exe',
    '--exclude=*.zip',
    '--exclude=data/*.sqlite*',
    '--exclude=data/uploads*',
    '--exclude=backups*',
    '--exclude=AllERP.key',
    '--exclude=agent-claw*',
    '--exclude=*.tar.gz',
    '--exclude=test-results*',
  ];

  try {
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
    execFileSync('tar', ['-czf', archivePath, ...tarExclude, '.'], {
      cwd: rootDir,
      stdio: 'inherit',
    });
    console.log(`✔ Bundle created: ${archivePath} (${(fs.statSync(archivePath).size / 1024 / 1024).toFixed(2)} MB)`);
  } catch (tarErr) {
    console.error('[deploy] Failed to create tar archive. Is tar available on your system?', tarErr.message);
    process.exit(1);
  }

  // 4. 서버로 파일 전송
  console.log('\n[4/6] Transferring bundle and configurations to AllERP server...');
  runScp(archivePath, `${remoteDir}/allerp-deploy.tar.gz`);

  // .env.production 파일 준비 및 토큰 주입 후 전송
  const envProd = path.join(rootDir, '.env.production');
  const envProdExample = path.join(rootDir, '.env.production.example');
  let envContent = fs.existsSync(envProd) ? fs.readFileSync(envProd, 'utf8') : (fs.existsSync(envProdExample) ? fs.readFileSync(envProdExample, 'utf8') : '');

  let cfToken = process.env.CLOUDFLARE_API_TOKEN || '';
  if (!cfToken) {
    const homedir = os.homedir();
    const wranglerConfigFile = path.join(homedir, 'AppData', 'Roaming', 'xdg.config', '.wrangler', 'config', 'default.toml');
    if (fs.existsSync(wranglerConfigFile)) {
      const wContent = fs.readFileSync(wranglerConfigFile, 'utf8');
      const match = wContent.match(/oauth_token\s*=\s*"([^"]+)"/);
      if (match) cfToken = match[1];
    }
  }

  if (cfToken && !envContent.includes('CLOUDFLARE_API_TOKEN=')) {
    envContent += `\nCLOUDFLARE_API_TOKEN=${cfToken}\n`;
  }
  if (!envContent.includes('R2_ACCOUNT_ID=')) {
    envContent += `\nR2_ACCOUNT_ID=462cf9a8da5cfd0edfdca833e2443e19\n`;
  }
  if (!envContent.includes('R2_BUCKET=')) {
    envContent += `\nR2_BUCKET=pchos-files\n`;
  }

  const tempEnv = path.join(rootDir, '.env.production.deploy');
  fs.writeFileSync(tempEnv, envContent, 'utf8');
  runScp(tempEnv, `${remoteDir}/.env.production`);
  try { fs.unlinkSync(tempEnv); } catch {}

  // uploads 디렉토리 전송 (--sync-uploads 플래그 시에만 실행)
  const shouldSyncUploads = args.includes('--sync-uploads');
  const localUploads = path.join(rootDir, 'data', 'uploads');
  if (shouldSyncUploads && fs.existsSync(localUploads) && fs.readdirSync(localUploads).length > 0) {
    console.log('[deploy] Packaging cached uploads directory...');
    const uploadsArchive = path.join(rootDir, 'uploads-deploy.tar.gz');
    if (fs.existsSync(uploadsArchive)) fs.unlinkSync(uploadsArchive);
    execFileSync('tar', ['-czf', uploadsArchive, '.'], { cwd: localUploads, stdio: 'inherit' });
    runSsh(`mkdir -p ${remoteDir}/data/uploads`);
    runScp(uploadsArchive, `${remoteDir}/data/uploads-deploy.tar.gz`);
    runSsh(`cd ${remoteDir}/data/uploads && tar -xzf ../uploads-deploy.tar.gz && rm -f ../uploads-deploy.tar.gz`);
    try { fs.unlinkSync(uploadsArchive); } catch {}
    console.log('✔ Uploads directory synced to AllERP server.');
  }

  // SQLite DB 데이터 파일 전송 (--sync-db 플래그 시에만 실행)
  const shouldSyncDb = args.includes('--sync-db');
  const localDb = path.join(rootDir, 'data', 'allerp.sqlite');
  if (shouldSyncDb && fs.existsSync(localDb)) {
    console.log(`[SCP] Uploading SQLite production data (${(fs.statSync(localDb).size / 1024 / 1024).toFixed(2)} MB)...`);
    runScp(localDb, `${remoteDir}/data/allerp.sqlite`);
  }

  // 홈페이지 (D:\homepage\dist) 패키징 및 전송
  const homepageDist = path.resolve(rootDir, '..', 'homepage', 'dist');
  if (fs.existsSync(homepageDist)) {
    console.log('[deploy] Packaging homepage (pchos.kr) bundle...');
    const hpArchive = path.join(rootDir, 'homepage-deploy.tar.gz');
    if (fs.existsSync(hpArchive)) fs.unlinkSync(hpArchive);
    execFileSync('tar', ['-czf', hpArchive, '.'], { cwd: homepageDist, stdio: 'inherit' });
    runSsh(`mkdir -p ${remoteDir}/homepage/dist`);
    runScp(hpArchive, `${remoteDir}/homepage/homepage-deploy.tar.gz`);
    runSsh(`cd ${remoteDir}/homepage/dist && tar -xzf ../homepage-deploy.tar.gz && rm -f ../homepage-deploy.tar.gz`);
    try { fs.unlinkSync(hpArchive); } catch {}
    console.log('✔ Homepage bundle transferred to AllERP server.');
  }

  // remote-deploy.sh 스크립트 전송 (CRLF 개행 자동 제거)
  const remoteDeployScript = path.join(rootDir, 'scripts', 'remote-deploy.sh');
  const deployScriptContent = fs.readFileSync(remoteDeployScript, 'utf8').replace(/\r\n/g, '\n');
  const tempDeployScript = path.join(rootDir, '.remote-deploy.tmp.sh');
  fs.writeFileSync(tempDeployScript, deployScriptContent, 'utf8');
  runScp(tempDeployScript, `${remoteDir}/remote-deploy.sh`);
  try { fs.unlinkSync(tempDeployScript); } catch {}
  runSsh(`sed -i 's/\\r$//' ${remoteDir}/remote-deploy.sh && chmod +x ${remoteDir}/remote-deploy.sh`);

  // 로컬 임시 아카이브 삭제
  try {
    fs.unlinkSync(archivePath);
  } catch {}

  // 5. 서버에서 압축 해제 및 Docker Compose 빌드 & 실행
  console.log('\n[5/6] Building and running Docker container on server...');
  runSsh(`bash ${remoteDir}/remote-deploy.sh`);

  // 6. 배포 검증 (헬스체크)
  console.log('\n[6/6] Verifying deployment health check...');
  console.log('Waiting 15 seconds for container initialization...');
  await new Promise((resolve) => setTimeout(resolve, 15000));

  try {
    runSsh('curl -s http://localhost:3000/api/health');
    console.log('\n====================================================');
    console.log(' ✔ AllERP Deployment Successfully Completed!');
    console.log(` Web URL: http://${serverIp}:3000`);
    console.log(` Health URL: http://${serverIp}:3000/api/health`);
    console.log('====================================================');
  } catch {
    console.warn('Health check timed out. Container may still be initializing.');
    console.log(`Please check: curl http://${serverIp}:3000/api/health`);
  }
}

main().catch((err) => {
  console.error('[deploy] Fatal error during deployment:', err.message);
  process.exit(1);
});

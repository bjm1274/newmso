import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { refuseArchivedScript } from './_archived-guard.mjs';

refuseArchivedScript({
  name: 'restore-d1-small.mjs',
  what: '덤프를 작은 조각으로 나눠 D1 에 복원한다',
  risk: '대상 DB 의 기존 데이터와 충돌하거나 덮어쓴다',
  insteadUse: '관리자 화면의 복원 기능 또는 scripts/run-backup-now.mjs 로 받은 최신 백업을 사용하세요.',
});

delete process.env.CLOUDFLARE_API_TOKEN;

function runWrangler(cmd) {
  return execSync(`cmd.exe /c "${cmd}"`, {
    env: { ...process.env, CLOUDFLARE_API_TOKEN: undefined },
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 50
  });
}

const dumpPath = path.join('backups', 'pchos-d1-dump.sql');
const content = fs.readFileSync(dumpPath, 'utf-8');

const chunkDir = path.join('backups', 'd1_small_chunks');
if (fs.existsSync(chunkDir)) {
  fs.rmSync(chunkDir, { recursive: true, force: true });
}
fs.mkdirSync(chunkDir, { recursive: true });

const lines = content.split('\n');
let currentStatements = ['PRAGMA foreign_keys = OFF;'];
let chunkIndex = 1;
let currentBytes = 0;

for (const line of lines) {
  currentStatements.push(line);
  currentBytes += Buffer.byteLength(line, 'utf-8');

  // Limit chunk size to 100KB (100,000 bytes) to avoid SQLITE_TOOBIG
  if (currentBytes >= 100000 || currentStatements.length >= 200) {
    const chunkFile = path.join(chunkDir, `chunk_${String(chunkIndex).padStart(5, '0')}.sql`);
    fs.writeFileSync(chunkFile, currentStatements.join('\n'), 'utf-8');
    chunkIndex++;
    currentStatements = ['PRAGMA foreign_keys = OFF;'];
    currentBytes = 0;
  }
}

if (currentStatements.length > 1) {
  const chunkFile = path.join(chunkDir, `chunk_${String(chunkIndex).padStart(5, '0')}.sql`);
  fs.writeFileSync(chunkFile, currentStatements.join('\n'), 'utf-8');
}

const files = fs.readdirSync(chunkDir).sort();
console.log(`Created ${files.length} small chunk files for D1 import.`);

// 실패한 청크의 행은 통째로 사라진다. 예전에는 catch 가 비어 있어 로그조차 없이
// 넘어간 뒤 무조건 "Completed Successfully" 를 찍고 종료 코드 0 으로 끝났다.
// 복원이 성공한 것처럼 보이지만 데이터가 빠져 있는 상태 — 실제로 이 방식으로
// staff_members 9행이 유실됐고 백업으로 되살릴 때까지 아무도 몰랐다.
const failures = [];

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const filePath = path.join(chunkDir, file);
  if (i % 20 === 0 || i === files.length - 1) {
    console.log(`Progress: [${i + 1}/${files.length}] Importing ${file}...`);
  }
  try {
    runWrangler(`npx wrangler d1 execute pchos-d1 --remote --file=${filePath}`);
  } catch (e) {
    failures.push({ file, error: String(e?.stdout || e?.message || e) });
    console.error(`❌ FAILED ${file}\n${String(e?.stdout || e?.message || e)}`);
  }
}

if (failures.length > 0) {
  console.error(
    `\n🛑 RESTORE INCOMPLETE — ${failures.length}/${files.length} chunk(s) failed.` +
    `\n   이 데이터베이스는 원본과 다릅니다. 실패한 청크:\n     ` +
    failures.map((f) => f.file).join('\n     '),
  );
  process.exit(1);
}

console.log('🎉 Small Chunk D1 Restore Completed Successfully!');

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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

const chunkDir = path.join('backups', 'd1_chunks');
if (fs.existsSync(chunkDir)) {
  fs.rmSync(chunkDir, { recursive: true, force: true });
}
fs.mkdirSync(chunkDir, { recursive: true });

// Split statements by ;\n
const lines = content.split('\n');
let currentStatements = ['PRAGMA foreign_keys = OFF;'];
let chunkIndex = 1;
let currentSize = 0;

for (const line of lines) {
  currentStatements.push(line);
  currentSize += line.length;

  // Save chunk every 2000 lines or 500KB
  if (currentStatements.length >= 2000 || currentSize >= 500000) {
    const chunkFile = path.join(chunkDir, `chunk_${String(chunkIndex).padStart(4, '0')}.sql`);
    fs.writeFileSync(chunkFile, currentStatements.join('\n'), 'utf-8');
    chunkIndex++;
    currentStatements = ['PRAGMA foreign_keys = OFF;'];
    currentSize = 0;
  }
}

if (currentStatements.length > 1) {
  const chunkFile = path.join(chunkDir, `chunk_${String(chunkIndex).padStart(4, '0')}.sql`);
  fs.writeFileSync(chunkFile, currentStatements.join('\n'), 'utf-8');
}

console.log(`Created ${chunkIndex} chunk files for D1 import.`);

// Execute import chunk by chunk
const files = fs.readdirSync(chunkDir).sort();
console.log(`Starting chunked import of ${files.length} files...`);

// 실패한 청크의 행은 통째로 사라지는데, 예전에는 실패를 찍기만 하고 마지막에
// 무조건 "Completed" 를 출력하며 종료 코드 0 으로 끝났다. 수백 줄이 흘러가는
// 로그에서 실패 몇 줄은 놓치기 쉬워서, 복원은 성공한 것처럼 보이지만 데이터가
// 빠져 있는 상태가 된다 — 실제로 staff_members 9행이 이렇게 유실됐다.
const failures = [];

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const filePath = path.join(chunkDir, file);
  console.log(`[${i + 1}/${files.length}] Importing ${file}...`);
  try {
    runWrangler(`npx wrangler d1 execute pchos-d1 --remote --file=${filePath}`);
    console.log(`✅ ${file} import success.`);
  } catch (e) {
    failures.push({ file, error: String(e?.stdout || e?.message || e) });
    console.error(`❌ FAILED ${file}\n${String(e?.stdout || e?.message || e)}`);
  }
}

if (failures.length > 0) {
  console.error(
    `\n🛑 IMPORT INCOMPLETE — ${failures.length}/${files.length} chunk(s) failed.` +
    `\n   이 데이터베이스는 원본과 다릅니다. 실패한 청크:\n     ` +
    failures.map((f) => f.file).join('\n     '),
  );
  process.exit(1);
}

console.log('🎉 D1 Chunked Import Completed!');

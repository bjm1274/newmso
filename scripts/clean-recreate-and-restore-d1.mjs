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

const dbName = 'pchos-d1-v2';
console.log(`1. Creating brand new clean D1 database "${dbName}"...`);
const createOut = runWrangler(`npx wrangler d1 create ${dbName}`);
console.log(createOut);

const match = createOut.match(/database_id = "([^"]+)"/);
if (!match) {
  console.error('Failed to parse database_id');
  process.exit(1);
}

const newDbId = match[1];
console.log('✅ New D1 Database ID:', newDbId);

// Update wrangler.toml
let wranglerToml = fs.readFileSync('wrangler.toml', 'utf-8');
wranglerToml = wranglerToml.replace(/database_name = "[^"]+"/, `database_name = "${dbName}"`);
wranglerToml = wranglerToml.replace(/database_id = "[^"]+"/, `database_id = "${newDbId}"`);
fs.writeFileSync('wrangler.toml', wranglerToml, 'utf-8');
console.log('✅ Updated wrangler.toml with new D1 name and ID.');

// Run import on clean new database
const chunkDir = path.join('backups', 'd1_small_chunks');
const files = fs.readdirSync(chunkDir).sort();

console.log(`2. Importing ${files.length} chunks into clean DB ${dbName}...`);

// 청크 하나가 실패하면 그 청크에 든 행이 통째로 사라진다.
// 예전에는 실패를 console.error 로만 찍고 넘어간 뒤 마지막에
// "Successfully imported 3247/3250" 을 출력하고 **종료 코드 0** 으로 끝났다.
// 3250개가 흘러가는 로그에서 3줄을 놓치기 쉬워서, 복원은 성공한 것처럼 보이지만
// 실제로는 데이터가 빠져 있었다 — 2026-07 에 staff_members 9행이 이렇게 유실됐고
// (재직자 45→36) 백업으로 되살릴 때까지 아무도 몰랐다.
// 그래서: 실패 목록을 모으고 → 1회 재시도 → 남으면 파일로 남기고 **exit 1**.
const failures = [];

function importChunk(file) {
  const filePath = path.join(chunkDir, file);
  runWrangler(`npx wrangler d1 execute ${dbName} --remote --file=${filePath}`);
}

let successCount = 0;
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  if (i % 50 === 0 || i === files.length - 1) {
    console.log(`Progress: [${i + 1}/${files.length}] (${Math.round((i+1)/files.length*100)}%)`);
  }
  try {
    importChunk(file);
    successCount++;
  } catch (e) {
    // 원문을 자르지 않는다. 잘린 메시지로는 원인(스키마 불일치/FK/용량)을 구분할 수 없다.
    failures.push({ file, error: String(e?.message || e) });
    console.error(`❌ FAILED ${file}\n${String(e?.message || e)}`);
  }
}

// 3,250회 원격 호출이라 일시적 네트워크·API 오류가 섞인다. 한 번은 다시 시도한다.
if (failures.length > 0) {
  console.log(`\n3. Retrying ${failures.length} failed chunk(s) once...`);
  const stillFailing = [];
  for (const failure of failures) {
    try {
      importChunk(failure.file);
      successCount++;
      console.log(`  ✅ recovered on retry: ${failure.file}`);
    } catch (e) {
      stillFailing.push({ file: failure.file, error: String(e?.message || e) });
      console.error(`  ❌ still failing: ${failure.file}\n${String(e?.message || e)}`);
    }
  }
  failures.length = 0;
  failures.push(...stillFailing);
}

if (failures.length > 0) {
  const reportPath = path.join('backups', 'failed-chunks.json');
  fs.writeFileSync(reportPath, JSON.stringify(failures, null, 2), 'utf-8');
  console.error(
    `\n🛑 RESTORE INCOMPLETE — ${failures.length}/${files.length} chunk(s) failed.` +
    `\n   이 데이터베이스는 원본과 다릅니다. 그대로 쓰면 조용히 행이 빠진 상태로 운영됩니다.` +
    `\n   실패 목록: ${reportPath}` +
    `\n   실패한 청크:\n     ${failures.map((f) => f.file).join('\n     ')}`,
  );
  process.exit(1);
}

console.log(`🎉 Finished! Successfully imported ${successCount}/${files.length} chunks into D1 database.`);

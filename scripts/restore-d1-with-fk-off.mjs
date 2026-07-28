import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

delete process.env.CLOUDFLARE_API_TOKEN;

function runWrangler(cmd) {
  return execSync(`cmd.exe /c "${cmd}"`, {
    env: { ...process.env, CLOUDFLARE_API_TOKEN: undefined },
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 100
  });
}

const dumpPath = path.join('backups', 'pchos-d1-dump.sql');
let dumpSql = fs.readFileSync(dumpPath, 'utf-8');

// Prepend PRAGMA foreign_keys = OFF; and PRAGMA defer_foreign_keys = TRUE;
const modifiedSql = `PRAGMA foreign_keys = OFF;\nPRAGMA defer_foreign_keys = TRUE;\n` + dumpSql;
const outSqlPath = path.join('backups', 'pchos-d1-dump-fkoff.sql');
fs.writeFileSync(outSqlPath, modifiedSql, 'utf-8');

console.log('Executing D1 restore with PRAGMA foreign_keys = OFF...');
try {
  const res = runWrangler(`npx wrangler d1 execute pchos-d1 --remote --file=${outSqlPath}`);
  console.log('D1 Restore Result:\n', res);
} catch (e) {
  // 실패했는데 종료 코드 0 으로 끝나면 호출자·CI 가 복원 성공으로 오인한다.
  console.error('🛑 RESTORE FAILED:\n', e.stdout || e.message);
  process.exit(1);
}

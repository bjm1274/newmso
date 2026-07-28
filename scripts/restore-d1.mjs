import { execSync } from 'child_process';

delete process.env.CLOUDFLARE_API_TOKEN;

console.log('Restoring D1 database dump into new account database...');
try {
  const out = execSync('cmd.exe /c "npx wrangler d1 execute pchos-d1 --remote --file=./backups/pchos-d1-dump.sql"', {
    env: { ...process.env, CLOUDFLARE_API_TOKEN: undefined },
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 100 // 100MB buffer for large dump file
  });
  console.log('Restore Output:', out);
} catch (e) {
  // 실패했는데 종료 코드 0 으로 끝나면 호출자·CI 가 복원 성공으로 오인한다.
  console.error('🛑 RESTORE FAILED:', e.stdout || e.message);
  process.exit(1);
}

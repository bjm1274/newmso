import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const token = process.env.CLOUDFLARE_API_TOKEN;
const backupDir = path.join(process.cwd(), 'backups', 'cloudflare_migration');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

async function backup() {
  console.log('1. Fetching Zone list...');
  const res = await fetch('https://api.cloudflare.com/client/v4/zones', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  
  if (!data.success) {
    // 예전에는 여기서 조용히 return 해서 DNS 도 D1 도 안 받은 채 "정상 종료"했다.
    throw new Error(`Zone 목록 조회 실패: ${JSON.stringify(data.errors)}`);
  }

  const targetDomains = ['allemr.kr', 'pchos.kr'];
  
  for (const zone of data.result) {
    if (targetDomains.includes(zone.name)) {
      console.log(`Exporting DNS for ${zone.name} (Zone ID: ${zone.id})...`);
      const dnsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records/export`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dnsText = await dnsRes.text();
      const filePath = path.join(backupDir, `${zone.name}.dns.txt`);
      fs.writeFileSync(filePath, dnsText, 'utf-8');
      console.log(`Saved DNS to ${filePath}`);
    }
  }

  // 운영 DB 이름. 구 DB 'pchos-d1' 을 가리키던 동안에는 사실상 빈 덤프를 받아 놓고
  // "백업 성공" 으로 끝났다 — 있으나 마나 한 백업이 있다고 믿게 만드는 쪽이 더 위험하다.
  const D1_DB_NAME = 'pchos-d1-v2';
  console.log(`2. Exporting D1 Database (${D1_DB_NAME})...`);
  const d1OutPath = path.join(backupDir, `${D1_DB_NAME}-dump.sql`);
  console.log('Executing wrangler d1 export...');
  execSync(`cmd /c "npx wrangler d1 export ${D1_DB_NAME} --remote --output=${d1OutPath}"`, { stdio: 'inherit' });

  // 산출물이 실제로 생겼는지, 비어 있지 않은지까지 확인해야 "백업했다"고 말할 수 있다.
  if (!fs.existsSync(d1OutPath) || fs.statSync(d1OutPath).size === 0) {
    throw new Error(`D1 덤프가 생성되지 않았거나 비어 있습니다: ${d1OutPath}`);
  }
  console.log(`Saved D1 export to ${d1OutPath} (${fs.statSync(d1OutPath).size} bytes)`);
}

// 실패를 조용히 삼키면 "백업이 있다"고 믿은 채로 복구 시점에 없다는 걸 알게 된다.
backup().catch((err) => {
  console.error('[backup-cloudflare] 백업 실패:', err.message);
  process.exit(1);
});

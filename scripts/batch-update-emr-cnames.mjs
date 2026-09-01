// 자격증명은 소스에 두지 않는다. 토큰은 환경변수에서 읽는다.
//   PowerShell:  $env:CLOUDFLARE_API_TOKEN = '...'
// (2026-07-26 계정 이전 잔해 — 평문 토큰이 박혀 있던 것을 제거했다)
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const accountId = '462cf9a8da5cfd0edfdca833e2443e19';
const alemrZoneId = '14708f327a9a7bb91c8dd375c71e21d6';

const targets = ['api.allemr.kr', 'c.allemr.kr', 'p.allemr.kr', 's.allemr.kr'];

async function batchUpdateCnames() {
  console.log('1. Updating DNS CNAMEs for EMR subdomains to "allemr-client.pages.dev"...');
  
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${alemrZoneId}/dns_records`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  const records = data.result || [];

  for (const r of records) {
    if (targets.includes(r.name)) {
      console.log(`Updating ${r.name} -> allemr-client.pages.dev`);
      await fetch(`https://api.cloudflare.com/client/v4/zones/${alemrZoneId}/dns_records/${r.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'CNAME',
          name: r.name,
          content: 'allemr-client.pages.dev',
          proxied: true
        })
      });
    }
  }

  console.log('\n2. Binding custom domains to allemr-client Pages project...');
  for (const name of targets) {
    const bRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/allemr-client/domains`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    console.log(`  - Bound ${name} to allemr-client:`, (await bRes.json()).success ? '✅ Success' : 'Failed');
  }

  console.log('\n🎉 ALL EMR SUBDOMAINS BATCH UPDATED TO allemr-client.pages.dev!');
}

batchUpdateCnames();

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Get token
let token = process.env.CLOUDFLARE_API_TOKEN || '';
if (!token) {
  const wranglerConfigFile = path.join(os.homedir(), 'AppData', 'Roaming', 'xdg.config', '.wrangler', 'config', 'default.toml');
  if (fs.existsSync(wranglerConfigFile)) {
    const content = fs.readFileSync(wranglerConfigFile, 'utf8');
    const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (match) token = match[1];
  }
}

const accountId = '462cf9a8da5cfd0edfdca833e2443e19';

async function cfGet(endpoint) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}${endpoint}`;
  try {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) {
      return { ok: false, status: res.status, error: await res.text() };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function auditR2() {
  console.log('\n======================================================');
  console.log('1. CLOUDFLARE R2 BUCKETS & FILE AUDIT');
  console.log('======================================================');
  const res = await cfGet('/r2/buckets');
  if (!res.ok) {
    console.error('Failed to list R2 buckets:', res.error);
    return;
  }
  const buckets = res.data?.result?.buckets || [];
  console.log(`Found ${buckets.length} R2 Bucket(s):`);

  for (const b of buckets) {
    let allObjects = [];
    let cursor = null;
    let totalBytes = 0;
    do {
      let listUrl = `/r2/buckets/${b.name}/objects?per_page=1000`;
      if (cursor) listUrl += `&cursor=${encodeURIComponent(cursor)}`;
      const objRes = await cfGet(listUrl);
      if (!objRes.ok) {
        console.error(`  - Failed to list objects in ${b.name}:`, objRes.error);
        break;
      }
      const objs = objRes.data?.result || [];
      allObjects = allObjects.concat(objs);
      for (const o of objs) totalBytes += o.size || 0;
      cursor = objRes.data?.result_info?.cursor || null;
      await sleep(300);
    } while (cursor);

    console.log(`  📁 Bucket "${b.name}": ${allObjects.length} files (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
    if (allObjects.length > 0) {
      console.log(`     Sample keys:`, allObjects.slice(0, 3).map(o => o.key).join(', '));
    }
  }
}

async function auditD1() {
  console.log('\n======================================================');
  console.log('2. CLOUDFLARE D1 DATABASES AUDIT');
  console.log('======================================================');
  const res = await cfGet('/d1/database');
  if (!res.ok) {
    console.error('Failed to list D1 databases:', res.error);
    return;
  }
  const dbs = res.data?.result || [];
  console.log(`Found ${dbs.length} D1 Database(s):`);

  for (const db of dbs) {
    console.log(`  💾 D1 "${db.name}" (UUID: ${db.uuid}, Created: ${db.created_at})`);
    // Query table counts
    const queryUrl = `/d1/database/${db.uuid}/query`;
    try {
      const qRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${queryUrl}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name" })
      });
      if (qRes.ok) {
        const qData = await qRes.json();
        const tables = qData.result?.[0]?.results || [];
        console.log(`     Total tables: ${tables.length}`);
      }
    } catch {}
    await sleep(300);
  }
}

async function auditKV() {
  console.log('\n======================================================');
  console.log('3. CLOUDFLARE KV NAMESPACES AUDIT');
  console.log('======================================================');
  const res = await cfGet('/storage/kv/namespaces');
  if (!res.ok) {
    console.error('Failed to list KV namespaces:', res.error);
    return;
  }
  const kvs = res.data?.result || [];
  console.log(`Found ${kvs.length} KV Namespace(s):`);
  for (const kv of kvs) {
    console.log(`  🔑 KV "${kv.title}" (ID: ${kv.id})`);
  }
}

async function auditPagesAndWorkers() {
  console.log('\n======================================================');
  console.log('4. CLOUDFLARE PAGES & WORKERS AUDIT');
  console.log('======================================================');
  const pagesRes = await cfGet('/pages/projects');
  if (pagesRes.ok) {
    const projects = pagesRes.data?.result || [];
    console.log(`Found ${projects.length} Pages Project(s):`);
    for (const p of projects) {
      console.log(`  📄 Pages "${p.name}" (Subdomain: ${p.subdomain}, Domains: ${p.canonical_deployment?.aliases?.join(', ') || 'none'})`);
    }
  }

  const workersRes = await cfGet('/workers/scripts');
  if (workersRes.ok) {
    const scripts = workersRes.data?.result || [];
    console.log(`\nFound ${scripts.length} Worker Script(s):`);
    for (const w of scripts) {
      console.log(`  ⚙️ Worker "${w.id}" (Created: ${w.created_on}, Modified: ${w.modified_on})`);
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log('🔍 FULL CLOUDFLARE RESOURCE & MIGRATION AUDIT (Account: ' + accountId + ')');
  console.log('================================================================');
  await auditR2();
  await auditD1();
  await auditKV();
  await auditPagesAndWorkers();
  console.log('\n================================================================');
  console.log('✔ Cloudflare Audit Completed!');
  console.log('================================================================');
}

main();

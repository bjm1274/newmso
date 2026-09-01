import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

delete process.env.CLOUDFLARE_API_TOKEN;

function runWrangler(cmd) {
  return execSync(`cmd.exe /c "${cmd}"`, {
    env: { ...process.env, CLOUDFLARE_API_TOKEN: undefined },
    encoding: 'utf-8'
  });
}

const targetUrl = 'https://c6v1c144.allemr-homepage-c6v.pages.dev';
const outDir = path.join('backups', 'allemr-real-site');

async function deployRealAllemr() {
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  console.log('1. Downloading real index.html from original allemr site...');
  const res = await fetch(targetUrl);
  const html = await res.text();
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');

  // Download all linked resources
  const assetRegex = /(?:src|href|url)=["']?([^"'\s>]+\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?|ttf|json))["']?/gi;
  let match;
  const assets = new Set();

  while ((match = assetRegex.exec(html)) !== null) {
    let assetPath = match[1];
    if (!assetPath.startsWith('http') && !assetPath.startsWith('//')) {
      if (!assetPath.startsWith('/')) assetPath = '/' + assetPath;
      assets.add(assetPath);
    }
  }

  console.log(`Found ${assets.size} assets in allemr HTML. Downloading...`);
  for (const assetPath of assets) {
    const fullUrl = `${targetUrl}${assetPath}`;
    const localFile = path.join(outDir, assetPath.replace(/^\//, ''));
    fs.mkdirSync(path.dirname(localFile), { recursive: true });

    try {
      const aRes = await fetch(fullUrl);
      if (aRes.ok) {
        const buf = await aRes.arrayBuffer();
        fs.writeFileSync(localFile, Buffer.from(buf));
        console.log(`  ✅ Downloaded asset: ${assetPath} (${buf.byteLength} bytes)`);
      }
    } catch (e) {
      console.error(`  ❌ Failed asset download: ${assetPath}`);
    }
  }

  console.log('\n2. Deploying complete allemr-homepage Pages project to new account...');
  try {
    const out = runWrangler(`npx wrangler pages deploy ${outDir} --project-name=allemr-homepage --commit-dirty=true`);
    console.log('✅ allemr-homepage Deploy Result:\n', out);
  } catch (e) {
    console.error('❌ allemr-homepage Deploy Error:', e.stdout || e.message);
  }
}

deployRealAllemr();

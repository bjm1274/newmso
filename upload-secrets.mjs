import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const SECRETS_TO_UPLOAD = [
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'FIREBASE_SERVICE_ACCOUNT',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'SESSION_SECRET'
];

let cfToken = '';
const tokenMatch = envContent.match(/^CLOUDFLARE_API_TOKEN\s*=\s*(.*)$/m);
if (tokenMatch && tokenMatch[1]) {
  cfToken = tokenMatch[1].trim().replace(/['"]/g, '');
}

console.log('Found CF Token:', !!cfToken);

for (const key of SECRETS_TO_UPLOAD) {
  const match = envContent.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, 'm'));
  if (match && match[1]) {
    const value = match[1].trim().replace(/^['"]|['"]$/g, '');
    console.log(`Uploading secret: ${key}`);
    try {
      const tmpFile = path.join(process.cwd(), `${key}.tmp`);
      fs.writeFileSync(tmpFile, value);
      
      // Use "wrangler secret put" for Workers (not Pages)
      execSync(`npx wrangler secret put ${key}`, {
        env: { ...process.env, CLOUDFLARE_API_TOKEN: cfToken },
        stdio: ['pipe', 'inherit', 'inherit'],
        input: fs.readFileSync(tmpFile)
      });
      fs.unlinkSync(tmpFile);
      console.log(`Successfully uploaded ${key}`);
    } catch (err) {
      console.error(`Failed to upload ${key}`, err.message);
    }
  }
}

console.log('Finished uploading secrets!');

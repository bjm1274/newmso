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

// Check logged in user info
console.log('Logged in user check:');
console.log(runWrangler('npx wrangler whoami'));

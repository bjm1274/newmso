import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import process from 'process';

try {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^CLOUDFLARE_API_TOKEN\s*=\s*(.*)$/m);
    if (match && match[1]) {
      process.env.CLOUDFLARE_API_TOKEN = match[1].trim().replace(/['"]/g, '');
      console.log('Loaded CLOUDFLARE_API_TOKEN from .env.local');
    }
  }

  console.log('Running build:cloudflare...');
  execSync('npm run build:cloudflare', { stdio: 'inherit' });

  console.log('Running deploy:cloudflare...');
  execSync('npm run deploy:cloudflare', { stdio: 'inherit' });

  console.log('Deployment completed successfully!');
} catch (error) {
  console.error('Deployment failed:', error);
  process.exit(1);
}

import { spawn } from 'child_process';

delete process.env.CLOUDFLARE_API_TOKEN;

console.log('Spawning wrangler login without CLOUDFLARE_API_TOKEN...');
const child = spawn('cmd.exe', ['/c', 'npx', 'wrangler', 'login'], {
  env: { ...process.env, CLOUDFLARE_API_TOKEN: undefined },
  stdio: 'inherit'
});

child.on('exit', (code) => {
  console.log('Login command exited with code:', code);
});

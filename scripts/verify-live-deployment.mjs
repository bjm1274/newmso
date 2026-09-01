import http from 'http';

function checkUrl(urlPath, expectedStatus) {
  return new Promise((resolve) => {
    const options = {
      hostname: '161.33.162.195',
      port: 3000,
      path: urlPath,
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const pass = expectedStatus ? res.statusCode === expectedStatus : res.statusCode < 400;
        console.log(`[${pass ? '✔ PASS' : '❌ FAIL'}] ${urlPath} -> Status: ${res.statusCode} (Expected: ${expectedStatus || '<400'})`);
        resolve({ path: urlPath, status: res.statusCode, pass });
      });
    });

    req.on('error', (err) => {
      console.log(`[❌ ERROR] ${urlPath} -> ${err.message}`);
      resolve({ path: urlPath, status: 0, pass: false, error: err.message });
    });

    req.end();
  });
}

async function run() {
  console.log('=== Verifying Live Deployment on Oracle Server ===\n');

  // 1. Health check & main pages
  await checkUrl('/api/health', 200);
  await checkUrl('/login', 200);

  // 2. Deleted API routes should return 404
  await checkUrl('/api/consultation/analyze', 404);
  await checkUrl('/api/consultation/transcribe', 404);
  await checkUrl('/api/discharge-review', 404);
  await checkUrl('/api/payments/virtual-account-deposits', 404);
  await checkUrl('/api/payments/virtual-account-webhook', 404);

  console.log('\n✔ Live verification completed.');
}

run();

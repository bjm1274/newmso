const Database = require('better-sqlite3');
const db = new Database('/app/data/allerp.sqlite');
const fs = require('fs');

async function testWithServerEnv() {
  // Read .env.production
  const envContent = fs.readFileSync('/app/.env.production', 'utf8');
  let sessionSecret = 'allerp-mso-unified-session-secret-2026-production-v1';
  for (const line of envContent.split('\n')) {
    if (line.startsWith('SESSION_SECRET=')) {
      sessionSecret = line.split('=')[1].trim();
    }
  }
  console.log('Using session secret from .env.production:', sessionSecret);

  const user = db.prepare("SELECT * FROM staff_members WHERE employee_no = '2'").get();
  const crypto = globalThis.crypto;
  const encoder = new TextEncoder();

  function bytesToBase64Url(bytes) {
    return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function importSigningKeyWithSecret(s) {
    return crypto.subtle.importKey('raw', encoder.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  }

  async function signValue(val) {
    const key = await importSigningKeyWithSecret(sessionSecret);
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(val));
    return bytesToBase64Url(new Uint8Array(signature));
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ver: 1,
    iat: now,
    exp: now + 60 * 60 * 24 * 30,
    user: {
      id: user.id,
      employee_no: user.employee_no,
      name: user.name,
      role: user.role,
      company: user.company,
      company_id: user.company_id,
      department: user.department,
      position: user.position,
      is_system_master: user.is_system_master === 1,
      pt: ['admin', 'mso', 'inventory', 'hr', 'approval'],
      permissions: {
        admin: true,
        mso: true,
        inventory: true,
        hr: true,
        approval: true
      }
    }
  };

  const json = JSON.stringify(payload);
  const body = bytesToBase64Url(encoder.encode(json));
  const sig = await signValue(body);
  const token = `${body}.${sig}`;

  // Step 1: Check session endpoint
  const sessionRes = await fetch('http://localhost:3000/api/auth/session', {
    headers: {
      'Cookie': `erp_session=${token}`,
      'Host': 'erp.pchos.kr'
    }
  });
  console.log('1. Session endpoint status:', sessionRes.status);
  const sessionData = await sessionRes.json();
  console.log('   Authenticated:', sessionData.authenticated, 'User:', sessionData.user?.name);

  // Step 2: Test query companies
  const queryRes = await fetch('http://localhost:3000/api/d1/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `erp_session=${token}`,
      'Host': 'erp.pchos.kr'
    },
    body: JSON.stringify({ table: 'companies' })
  });
  console.log('2. Query companies status:', queryRes.status);
  const queryData = await queryRes.json();
  console.log('   Companies count:', Array.isArray(queryData.data) ? queryData.data.length : queryData);

  // Step 3: Test query staff_members
  const staffRes = await fetch('http://localhost:3000/api/d1/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `erp_session=${token}`,
      'Host': 'erp.pchos.kr'
    },
    body: JSON.stringify({ table: 'staff_members' })
  });
  console.log('3. Query staff_members status:', staffRes.status);
  const staffData = await staffRes.json();
  console.log('   Staff count:', Array.isArray(staffData.data) ? staffData.data.length : staffData);
}

testWithServerEnv().catch(console.error);

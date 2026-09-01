const Database = require('better-sqlite3');
const db = new Database('/app/data/allerp.sqlite');

async function testSessionPipeline() {
  const user = db.prepare("SELECT * FROM staff_members WHERE employee_no = '2'").get();
  const crypto = globalThis.crypto;
  const encoder = new TextEncoder();
  const secret = process.env.SESSION_SECRET || 'allerp-mso-unified-session-secret-2026-production-v1';

  function bytesToBase64Url(bytes) {
    return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function importSigningKeyWithSecret(s) {
    return crypto.subtle.importKey('raw', encoder.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  }

  async function signValue(val) {
    const key = await importSigningKeyWithSecret(secret);
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

  // Step 5: Test POST /api/d1/query
  const queryRes = await fetch('http://localhost:3000/api/d1/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `erp_session=${token}`,
      'Host': 'erp.pchos.kr'
    },
    body: JSON.stringify({ table: 'companies' })
  });
  console.log('POST /api/d1/query -> Status:', queryRes.status);
  const queryData = await queryRes.json();
  console.log('Query response JSON:', JSON.stringify(queryData));

  // Step 6: Test POST /api/d1/query for staff_members
  const staffRes = await fetch('http://localhost:3000/api/d1/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `erp_session=${token}`,
      'Host': 'erp.pchos.kr'
    },
    body: JSON.stringify({ table: 'staff_members' })
  });
  console.log('POST /api/d1/query for staff_members -> Status:', staffRes.status);
  const staffData = await staffRes.json();
  console.log('Staff count:', Array.isArray(staffData.data) ? staffData.data.length : staffData);
}

testSessionPipeline().catch(console.error);

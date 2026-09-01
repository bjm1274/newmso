const Database = require('better-sqlite3');
const db = new Database('/app/data/allerp.sqlite');

async function testFullPipeline() {
  const user = db.prepare("SELECT * FROM staff_members WHERE employee_no = '2'").get();
  console.log('User 2:', user.id, user.employee_no, user.name);

  // 1. Check master-login API
  const loginRes = await fetch('http://localhost:3000/api/auth/master-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: '2', password: 'password_test_to_fail_or_pass' })
  });
  console.log('Login endpoint status:', loginRes.status);
  const loginData = await loginRes.json();
  console.log('Login data:', loginData);

  // 2. What if we generate a session token using lib/server-session?
  // Let's import server-session from the built standalone app!
  try {
    const fs = require('fs');
    console.log('Checking standalone files...');
    const serverFiles = fs.readdirSync('/app');
    console.log('Files in /app:', serverFiles);
  } catch (e) {
    console.error('Error listing /app:', e);
  }
}

testFullPipeline().catch(console.error);

const fs = require('fs');

async function checkRoute() {
  const p = '/app/.next/server/app/api/d1/query/route.js';
  console.log('Exists:', fs.existsSync(p));
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf8');
    console.log('File length:', content.length);
    console.log('Contains getD1Binding:', content.includes('getD1Binding'));
    console.log('Contains SqliteD1Adapter:', content.includes('SqliteD1Adapter'));
  }
}

checkRoute().catch(console.error);

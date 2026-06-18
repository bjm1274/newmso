const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join('D:', 'newmso', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject', '327c6afe6741eb5c3878ba0df9d13732dafe263ef8bd4a8c99ab147ffab82dfb.sqlite');

try {
  const db = new Database(dbPath, { readonly: true });
  const shifts = db.prepare(`SELECT name, start_time, weekly_work_days, is_weekend_work FROM work_shifts WHERE company_name LIKE '%박철홍%'`).all();
  
  fs.writeFileSync('scratch_query2.json', JSON.stringify(shifts, null, 2));
  console.log('Done');
} catch (e) {
  console.error(e);
}

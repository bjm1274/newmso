const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join('D:', 'newmso', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject', '327c6afe6741eb5c3878ba0df9d13732dafe263ef8bd0e6ac8a93a1b3198995a.sqlite');
const db = new Database(dbPath);

const output = db.prepare(`SELECT date, check_in, status, staff_id FROM attendance ORDER BY created_at DESC LIMIT 10`).all();

db.close();

fs.writeFileSync('query_result4.json', JSON.stringify(output, null, 2), 'utf-8');

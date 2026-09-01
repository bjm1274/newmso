const Database = require('better-sqlite3');
const db = new Database('./data/allerp.sqlite');

const integrity = db.pragma('integrity_check');
console.log('1. DB Integrity Check Result:', integrity);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
console.log('2. Total Tables in SQLite:', tables.length);

const summary = {};
const keyTables = [
  'staff_members', 'companies', 'departments', 'teams', 'board_posts', 'board_comments',
  'chat_rooms', 'chat_messages', 'approval_documents', 'approval_lines',
  'inventory_items', 'inventory_transactions', 'attendances', 'work_shifts',
  'payroll_records', 'leave_ledger', 'daily_closures'
];

for (const t of keyTables) {
  try {
    const count = db.prepare(`SELECT count(*) as cnt FROM ${t}`).get();
    summary[t] = count.cnt;
  } catch (e) {
    summary[t] = 'error: ' + e.message;
  }
}
console.log('3. Key Table Row Counts:');
console.table(summary);

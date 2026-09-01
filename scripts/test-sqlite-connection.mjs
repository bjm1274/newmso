import Database from 'better-sqlite3';

const db = new Database('./data/allerp.sqlite');
console.log('Journal mode:', db.pragma('journal_mode', { simple: true }));
const count = db.prepare("SELECT count(1) as count FROM sqlite_master WHERE type='table'").get();
console.log('Total tables in SQLite:', count.count);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name LIMIT 10").all();
console.log('Sample tables:', tables.map(t => t.name));
db.close();

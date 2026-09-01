const Database = require('better-sqlite3');
const db = new Database('./data/allerp.sqlite');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log('Tables matching erp data:');
for (const t of tables) {
  try {
    const count = db.prepare(`SELECT count(*) as cnt FROM "${t.name}"`).get();
    if (count.cnt > 0) {
      console.log(`- ${t.name}: ${count.cnt} rows`);
    }
  } catch (e) {
    console.log(`- ${t.name}: error`);
  }
}

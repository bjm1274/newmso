const Database = require('better-sqlite3');
const db = new Database('/app/data/allerp.sqlite');

class SqliteD1PreparedStatement {
  constructor(db, query) {
    this.db = db;
    this.query = query;
    this.params = [];
  }

  bind(...params) {
    this.params = params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
    return this;
  }

  async all() {
    const stmt = this.db.prepare(this.query);
    const results = stmt.all(...this.params);
    return { results, success: true };
  }

  async run() {
    const isSelect = /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(this.query);
    const stmt = this.db.prepare(this.query);
    if (isSelect) {
      const results = stmt.all(...this.params);
      return { results, success: true };
    }
    const info = stmt.run(...this.params);
    return { results: [], success: true };
  }
}

class SqliteD1Adapter {
  constructor(db) {
    this.db = db;
  }
  prepare(query) {
    return new SqliteD1PreparedStatement(this.db, query);
  }
}

async function test() {
  const adapter = new SqliteD1Adapter(db);
  const stmt = adapter.prepare('SELECT * FROM "companies"');
  console.log('stmt.run():', await stmt.run());
  console.log('stmt.all():', await stmt.all());
}

test().catch(console.error);

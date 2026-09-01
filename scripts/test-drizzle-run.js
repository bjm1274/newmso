const { drizzle } = require('drizzle-orm/d1');
const { sql } = require('drizzle-orm');
const Database = require('better-sqlite3');
const db = new Database('./data/allerp.sqlite');

class SqliteD1PreparedStatement {
  constructor(db, query) {
    this.db = db;
    this.query = query;
    this.params = [];
  }
  bind(...params) {
    const next = new SqliteD1PreparedStatement(this.db, this.query);
    next.params = params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
    return next;
  }
  async all() {
    console.log('all() called with query:', this.query, 'params:', this.params);
    const stmt = this.db.prepare(this.query);
    const results = stmt.all(...this.params);
    return { results, success: true };
  }
  async run() {
    console.log('run() called with query:', this.query, 'params:', this.params);
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
  constructor(db) { this.db = db; }
  prepare(query) { return new SqliteD1PreparedStatement(this.db, query); }
}

async function test() {
  const d1 = new SqliteD1Adapter(db);
  const drizzleDb = drizzle(d1);
  const tableSql = sql.identifier('companies');
  const query = sql`SELECT * FROM ${tableSql}`;
  const result = await drizzleDb.run(query);
  console.log('drizzleDb.run result:', result);
}

test().catch(console.error);

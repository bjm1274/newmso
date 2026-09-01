const Database = require('better-sqlite3');
const db = new Database('/app/data/allerp.sqlite');

// Let's test the query builder logic directly
const payload = { table: 'companies' };

// In app/api/d1/query/route.ts:
// buildSelectSql(payload) generates:
// SELECT * FROM "companies"

// Let's test how drizzle executes this with SqliteD1Adapter!
const { SqliteD1Adapter } = require('./lib/db/client-sqlite.js');
const { getD1Drizzle } = require('./lib/db/client-d1.js');
const { sql } = require('drizzle-orm');

async function test() {
  const adapter = new SqliteD1Adapter(db);
  const drizzleDb = getD1Drizzle(adapter);

  console.log('Testing drizzleDb.run with sql:');
  const tableSql = sql.identifier('companies');
  const result = await drizzleDb.run(sql`SELECT * FROM ${tableSql}`);
  console.log('drizzleDb.run result:', result);

  const rawPrepared = adapter.prepare('SELECT * FROM "companies"');
  const allRes = await rawPrepared.all();
  console.log('adapter.prepare.all result:', allRes);

  const runRes = await rawPrepared.run();
  console.log('adapter.prepare.run result:', runRes);
}

test().catch(console.error);

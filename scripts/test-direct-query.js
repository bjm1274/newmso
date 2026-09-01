const Database = require('better-sqlite3');
const db = new Database('/app/data/allerp.sqlite');

async function testDirectD1Query() {
  const { getSqliteD1Adapter } = require('./lib/db/client-sqlite.js');
  const { getD1Drizzle } = require('./lib/db/client-d1.js');
  const { filterByPolicy } = require('./lib/db/auth/policies.js');
  const { buildClaimsFromSession } = require('./lib/d1-api-helpers.js');
  const { sql } = require('drizzle-orm');

  const d1 = getSqliteD1Adapter(db);
  const drizzleDb = getD1Drizzle(d1);

  const tableSql = sql.identifier('companies');
  const query = sql`SELECT * FROM ${tableSql}`;
  const res = await drizzleDb.run(query);
  console.log('1. Raw drizzleDb.run res:', res);

  const user = db.prepare("SELECT * FROM staff_members WHERE employee_no = '2'").get();
  const claims = buildClaimsFromSession(user);
  console.log('2. Claims:', claims);

  const filtered = await filterByPolicy(drizzleDb, claims, 'companies', res.results);
  console.log('3. Filtered companies:', filtered);
}

testDirectD1Query().catch(console.error);

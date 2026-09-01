import Database from 'better-sqlite3';
import { getSqliteD1Adapter } from '@/lib/db/client-sqlite';
import { getD1Drizzle } from '@/lib/db/client-d1';
import { filterByPolicy } from '@/lib/db/auth/policies';
import { buildClaimsFromSession } from '@/lib/d1-api-helpers';
import { sql } from 'drizzle-orm';

const db = new Database('./data/allerp.sqlite');
const d1 = getSqliteD1Adapter(db);
const drizzleDb = getD1Drizzle(d1);

async function test() {
  const tableSql = sql.identifier('companies');
  const res = await drizzleDb.run(sql`SELECT * FROM ${tableSql}`);
  console.log('1. Raw run res count:', res.results?.length);
  
  const user = db.prepare("SELECT * FROM staff_members WHERE employee_no = '2'").get() as any;
  const claims = buildClaimsFromSession(user);
  console.log('2. Claims erp_is_admin:', claims.erp_is_admin);
  
  const filtered = await filterByPolicy(drizzleDb, claims, 'companies', res.results as any);
  console.log('3. Filtered companies count:', filtered.length);
}

test().catch(console.error);

import { getD1Binding, getD1Drizzle, staff_members as staffMembersTable, eq } from '../lib/db/index.js';

async function testUpdate() {
  const d1 = await getD1Binding();
  const db = getD1Drizzle(d1);
  try {
    console.log('Testing update without .run()...');
    const res1 = await db.update(staffMembersTable).set({ position: '이사' }).where(eq(staffMembersTable.employee_no, '2'));
    console.log('Result without .run():', res1);
  } catch (e) {
    console.error('Error without .run():', e.message);
  }

  try {
    console.log('Testing update with .run()...');
    const res2 = await db.update(staffMembersTable).set({ position: '이사' }).where(eq(staffMembersTable.employee_no, '2')).run();
    console.log('Result with .run():', res2);
  } catch (e) {
    console.error('Error with .run():', e.message);
  }
}

testUpdate();

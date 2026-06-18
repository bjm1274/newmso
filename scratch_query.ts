import { getLocalDrizzle } from './lib/db/client-local';
import { staff_members, shift_assignments, attendance, work_shifts, staff_shift_assignments } from './lib/db/schema';
import { eq, like, and } from 'drizzle-orm';

async function main() {
  const db = getLocalDrizzle();
  const staffs = await db.select().from(staff_members).where(like(staff_members.name, '%조현준%'));
  console.log("=== Staff Info ===");
  console.log(staffs);

  if (staffs.length > 0) {
    const staffId = staffs[0].id;
    console.log(`\n=== Shift Assignments for ${staffId} (Today: 2026-06-18) ===`);
    const sa = await db.select().from(shift_assignments).where(and(eq(shift_assignments.staff_id, staffId), like(shift_assignments.work_date, '2026-06-18%')));
    console.log(sa);

    console.log(`\n=== Staff Shift Assignments (Long-term) ===`);
    const ssa = await db.select().from(staff_shift_assignments).where(eq(staff_shift_assignments.staff_id, staffId));
    console.log(ssa);

    console.log(`\n=== Attendance (Today: 2026-06-18) ===`);
    const att = await db.select().from(attendance).where(and(eq(attendance.staff_id, staffId), like(attendance.date, '2026-06-18%')));
    console.log(att);

    console.log(`\n=== Work Shifts Info ===`);
    const shifts = await db.select().from(work_shifts).where(eq(work_shifts.company_name, staffs[0].company));
    console.log(shifts.map(s => ({ id: s.id, name: s.name, start_time: s.start_time, end_time: s.end_time })));
  }
}

main().catch(console.error);

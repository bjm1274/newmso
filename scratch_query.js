const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join('D:', 'newmso', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject', '327c6afe6741eb5c3878ba0df9d13732dafe263ef8bd0e6ac8a93a1b305ab267.sqlite');
const db = new Database(dbPath);

console.log("=== Staff Info ===");
const staffs = db.prepare(`SELECT id, employee_no, name, company, department, position FROM staff_members WHERE name LIKE '%조현준%'`).all();
console.table(staffs);

if (staffs.length > 0) {
    const staffId = staffs[0].id;
    console.log(`\n=== Shift Assignments for ${staffId} (Today: 2026-06-18) ===`);
    const sa = db.prepare(`SELECT * FROM shift_assignments WHERE staff_id = ? AND work_date LIKE '2026-06-18%'`).all(staffId);
    console.table(sa);

    console.log(`\n=== Staff Shift Assignments (Long-term) ===`);
    const ssa = db.prepare(`SELECT * FROM staff_shift_assignments WHERE staff_id = ?`).all(staffId);
    console.table(ssa);

    console.log(`\n=== Attendance (Today: 2026-06-18) ===`);
    const att = db.prepare(`SELECT * FROM attendance WHERE staff_id = ? AND date LIKE '2026-06-18%'`).all(staffId);
    console.table(att);

    console.log(`\n=== Work Shifts Info ===`);
    const shifts = db.prepare(`SELECT id, name, start_time, end_time FROM work_shifts WHERE company_name = ?`).all(staffs[0].company);
    console.table(shifts);
}

db.close();

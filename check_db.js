const Database = require('better-sqlite3');
const db = new Database('lib/db/local.sqlite');

const staff = db.prepare("SELECT * FROM staff_members WHERE name LIKE '%백민%'").get();
console.log("STAFF:", staff);
if (staff) {
  const contract = db.prepare("SELECT * FROM employment_contracts WHERE staff_id = ?").get(staff.id);
  console.log("CONTRACT:", contract);
}

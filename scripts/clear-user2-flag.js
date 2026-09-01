const Database = require('better-sqlite3');
const db = new Database('./data/allerp.sqlite');
db.prepare("UPDATE staff_members SET force_logout_at = NULL WHERE employee_no = '2'").run();
const user = db.prepare("SELECT employee_no, name, password, password_reset_required, force_logout_at FROM staff_members WHERE employee_no = '2'").get();
console.log('User 2 in local DB:', user);

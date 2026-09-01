const Database = require('better-sqlite3');
const db = new Database('./data/allerp.sqlite');
db.prepare("UPDATE staff_members SET password = ?, passwd = ?, password_reset_required = 0, force_logout_at = NULL WHERE employee_no = '2'").run(
  '$2b$10$Dj1MssT9ye1nC1mnFPmGPOOySUQHEGYkX/xvUO5P2YayLi94/1rla',
  '$2b$10$Dj1MssT9ye1nC1mnFPmGPOOySUQHEGYkX/xvUO5P2YayLi94/1rla'
);
console.log('Local DB synced successfully');

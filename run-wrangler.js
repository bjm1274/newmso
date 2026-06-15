const cp = require('child_process');
const query = `SELECT id, created_at FROM messages WHERE room_id = '00000000-0000-0000-0000-000000000000' AND sender_name = '공지봇' AND content LIKE '%생일%' AND created_at >= '2026-06-15'`;
const cmd = `node_modules\\.bin\\wrangler.cmd d1 execute pchos-d1 --remote --command="${query}" --json`;
console.log(cp.execSync(cmd).toString());

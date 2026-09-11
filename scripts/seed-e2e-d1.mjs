// 테스트 전용 고정 경로만 사용한다. 운영 DATABASE_PATH/DB_PATH는 읽지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
const dir=path.resolve('.scratch-r/e2e');
const target=path.join(dir,'allerp.sqlite');
fs.mkdirSync(dir,{recursive:true});
if(fs.lstatSync(dir).isSymbolicLink() || (fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink()))throw Error('테스트 DB 경로는 링크일 수 없습니다.');
if(!process.argv.includes('--verify')&&!process.argv.includes('--cleanup')) {
  const result=spawnSync(process.execPath,['scripts/migrate-sqlite.mjs'],{env:{...process.env,DATABASE_PATH:target,DB_PATH:target},stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
const db=new Database(target,{fileMustExist:true});
const id='test-staff-e2e-001';
if(process.argv.includes('--cleanup')) {
  db.prepare('DELETE FROM staff_members WHERE id=? AND employee_no=?').run(id,'E2E-001');
  console.log('격리 테스트 계정을 삭제했습니다.');
} else if(process.argv.includes('--verify')) {
  if(!db.prepare('SELECT id FROM staff_members WHERE id=? AND employee_no=?').get(id,'E2E-001'))throw Error('테스트 계정이 없습니다.');
  console.log('격리 SQLite 시드 확인 완료');
} else {
  const hash=await bcrypt.hash('E2ePassw0rd!',10);
  db.prepare(`INSERT INTO staff_members(id,employee_no,name,company,role,permissions,password,status) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET password=excluded.password,status=excluded.status,company=excluded.company`).run(id,'E2E-001','검증용 직원','E2E Clinic','user','{}',hash,'재직');
  console.log('격리 SQLite 시드 생성 완료');
}
db.close();

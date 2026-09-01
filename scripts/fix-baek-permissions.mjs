import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const localDbPath = path.join(rootDir, 'data', 'allerp.sqlite');
const db = new Database(localDbPath);

const adminPermissions = {
  hr: true,
  mso: true,
  admin: true,
  approval: true,
  hr_계약: true,
  hr_교육: true,
  hr_근태: true,
  hr_급여: true,
  menu_알림: true,
  menu_채팅: true,
  hr_경조사: true,
  hr_구성원: true,
  hr_증명서: true,
  hr_캘린더: true,
  menu_게시판: true,
  menu_관리자: true,
  menu_내정보: true,
  menu_조직도: true,
  hr_건강검진: true,
  hr_교대근무: true,
  hr_근무형태: true,
  hr_비품대여: true,
  hr_서류제출: true,
  hr_연차휴가: true,
  hr_오프보딩: true,
  hr_인사발령: true,
  hr_직원등록: true,
  hr_포상징계: true,
  menu_근태관리: true,
  menu_인사관리: true,
  menu_재고관리: true,
  menu_전자결재: true,
  menu_추가기능: true,
  menu_재무회계: true,
  approval_결재함: true,
  approval_기안함: true,
  hr_면허자격증: true,
  hr_문서보관함: true,
  hr_사고보고서: true,
  approval_작성하기: true,
  hr_의료기기점검: true,
  approval_참조문서함: true,
  hr_구성원_열람: true,
  hr_구성원_관리: true,
  hr_근태_열람: true,
  hr_근태_수정: true,
  hr_급여_승인: true,
  approval_반려권한: true,
  approval_양식관리: true,
  approval_전체열람: true,
  hr_근무표생성: true,
  menu_공유캘린더: true,
  calendar_근무표조회: true,
  calendar_게시판일정: true,
  calendar_외부동기화: true,
  calendar_전체직원근무표: true,
  chat_접근: true,
  chat_방생성: true,
  chat_파일첨부: true,
  mypage_수정: true,
  mypage_급여조회: true,
  mypage_증명서조회: true,
  payroll_allowances: { agreed_overtime_allowance: 0, agreed_night_allowance: 0 },
  work_conditions: { working_hours_per_week: 40, working_days_per_week: 5, shift_group_ids: [], weekly_rotation_shift_ids: [], secondary_shift_id: null }
};

const user = db.prepare("SELECT * FROM staff_members WHERE employee_no = '2' OR name = '백정민'").get();
if (user) {
  let existingPerms = {};
  try {
    existingPerms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
  } catch {}

  const merged = { ...adminPermissions, ...existingPerms, ...adminPermissions };
  const permsJson = JSON.stringify(merged);

  db.prepare("UPDATE staff_members SET permissions = ?, role = 'admin', company = 'SY INC.', department = '경영지원팀', position = '이사', status = '재직' WHERE id = ?").run(permsJson, user.id);
  console.log(`✔ Updated Baek Jung-min (${user.name}, 사번 ${user.employee_no}) permissions and profile successfully!`);
} else {
  console.log('❌ User not found!');
}

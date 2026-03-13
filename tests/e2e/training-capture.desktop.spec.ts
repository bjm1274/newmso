import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

const OUTPUT_ROOT = path.join(process.cwd(), 'docs', 'manuals', 'ppt_assets');
const RAW_DIR = path.join(OUTPUT_ROOT, 'raw');
const MANIFEST_DIR = path.join(OUTPUT_ROOT, 'manifest');

const employeeUser = {
  ...fakeUser,
  name: '김직원',
  employee_no: 'EMP-001',
  department: '간호부',
  position: '간호사',
  role: 'staff',
  permissions: {
    ...fakeUser.permissions,
    approval: true,
    mso: false,
    admin: false,
    hr: false,
    inventory: false,
  },
};

const managerUser = {
  ...fakeUser,
  name: '이팀장',
  employee_no: 'MGR-001',
  department: '행정팀',
  position: '팀장',
  role: 'manager',
  permissions: {
    ...fakeUser.permissions,
    approval: true,
    mso: false,
    admin: false,
    hr: true,
    inventory: true,
  },
};

const adminUser = {
  ...fakeUser,
  id: '99999999-9999-9999-9999-999999999999',
  name: '박관리',
  employee_no: 'ADM-001',
  company: 'SY INC.',
  company_id: 'mso-company-id',
  department: '운영본부',
  position: '시스템관리자',
  role: 'admin',
  permissions: {
    ...fakeUser.permissions,
    approval: true,
    mso: true,
    admin: true,
    hr: true,
    inventory: true,
    menu_관리자: true,
    menu_인사관리: true,
  },
};

const companies = [
  { id: 'mso-company-id', name: 'SY INC.', type: 'mso', is_active: true },
  { id: employeeUser.company_id, name: employeeUser.company, type: 'hospital', is_active: true },
];

const boardPosts = [
  {
    id: 'post-1',
    board_type: '공지사항',
    title: '원내 공지 테스트',
    content: '공지 게시판 화면을 안내 자료로 캡처합니다.',
    created_at: '2026-03-09T09:00:00.000Z',
    author_id: adminUser.id,
    author_name: adminUser.name,
  },
  {
    id: 'post-2',
    board_type: '자유게시판',
    title: '자유게시판 테스트',
    content: '자유게시판 예시 게시물입니다.',
    created_at: '2026-03-09T09:10:00.000Z',
    author_id: employeeUser.id,
    author_name: employeeUser.name,
  },
];

const inventoryItems = [
  {
    id: 'inv-1',
    item_name: 'A4 용지',
    name: 'A4 용지',
    category: '사무용품',
    company: employeeUser.company,
    company_id: employeeUser.company_id,
    department: '행정팀',
    quantity: 12,
    stock: 12,
    min_quantity: 5,
    lot_number: 'LOT-001',
  },
  {
    id: 'inv-2',
    item_name: '수술용 장갑',
    name: '수술용 장갑',
    category: '의료소모품',
    company: employeeUser.company,
    company_id: employeeUser.company_id,
    department: '수술실',
    quantity: 3,
    stock: 3,
    min_quantity: 10,
    lot_number: 'LOT-002',
  },
];

const chatRooms = [
  {
    id: '00000000-0000-0000-0000-000000000000',
    name: '공지메시지',
    type: 'notice',
    members: [employeeUser.id, managerUser.id, adminUser.id],
    created_at: '2026-03-09T08:00:00.000Z',
    last_message_at: '2026-03-09T08:00:00.000Z',
  },
  {
    id: 'room-1',
    name: '간호부 공용방',
    type: 'group',
    members: [employeeUser.id, managerUser.id],
    created_at: '2026-03-09T08:30:00.000Z',
    last_message_at: '2026-03-09T08:35:00.000Z',
    last_message_preview: '오늘 인수인계 확인 부탁드립니다.',
  },
];

const messages = [
  {
    id: 'msg-1',
    room_id: 'room-1',
    sender_id: managerUser.id,
    content: '오늘 인수인계 확인 부탁드립니다.',
    created_at: '2026-03-09T08:35:00.000Z',
    is_deleted: false,
    staff: { name: managerUser.name, photo_url: null, position: managerUser.position },
  },
];

type HotspotInput = {
  index: number;
  label: string;
  note: string;
  locator?: Locator;
  box?: { x: number; y: number; width: number; height: number };
};

async function ensureOutputDirs() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.mkdir(MANIFEST_DIR, { recursive: true });
}

async function waitForMainReady(page: Page, viewTestId: string) {
  await expect(page.getByTestId('main-shell')).toBeVisible();
  await expect(page.getByTestId(viewTestId)).toBeVisible();
  await expect(page.getByTestId('main-loading-overlay')).toHaveCount(0);
}

async function resolveBox(input: HotspotInput) {
  if (input.box) return input.box;
  if (!input.locator) return null;
  await expect(input.locator).toBeVisible();
  return input.locator.boundingBox();
}

async function saveCapture(page: Page, payload: {
  id: string;
  title: string;
  subtitle: string;
  role: string;
  screenshotName: string;
  notes: string[];
  hotspots: HotspotInput[];
}) {
  await ensureOutputDirs();

  const screenshotPath = path.join(RAW_DIR, payload.screenshotName);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const hotspots = [];
  for (const hotspot of payload.hotspots) {
    const box = await resolveBox(hotspot);
    if (!box) continue;
    hotspots.push({
      index: hotspot.index,
      label: hotspot.label,
      note: hotspot.note,
      box: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      },
    });
  }

  const manifestPath = path.join(MANIFEST_DIR, `${payload.id}.json`);
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        id: payload.id,
        title: payload.title,
        subtitle: payload.subtitle,
        role: payload.role,
        image: screenshotPath,
        notes: payload.notes,
        hotspots,
      },
      null,
      2
    ),
    'utf8'
  );
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('capture_login_screen', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/login');
  await expect(page.getByTestId('login-page')).toBeVisible();

  await saveCapture(page, {
    id: '01_login',
    title: '로그인 화면',
    subtitle: '사번 또는 이름과 비밀번호를 입력해 접속합니다.',
    role: '공통',
    screenshotName: '01_login.png',
    notes: [
      '사번 또는 이름 입력칸입니다.',
      '비밀번호를 입력합니다.',
      '로그인 버튼을 누르면 메인 화면으로 이동합니다.',
    ],
    hotspots: [
      {
        index: 1,
        label: '아이디 입력',
        note: '사번 또는 이름 입력',
        locator: page.getByTestId('login-id-input'),
      },
      {
        index: 2,
        label: '비밀번호 입력',
        note: '비밀번호 입력',
        locator: page.getByTestId('login-password-input'),
      },
      {
        index: 3,
        label: '로그인 버튼',
        note: '입력 후 접속',
        locator: page.getByTestId('login-submit-button'),
      },
    ],
  });
});

test('capture_main_shell_overview', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies,
    boardPosts,
    inventoryItems,
    chatRooms,
    messages,
  });
  await seedSession(page, { user: adminUser });
  await page.goto('/main');
  await waitForMainReady(page, 'mypage-view');

  await saveCapture(page, {
    id: '02_main_shell',
    title: '메인 화면과 사이드바',
    subtitle: '좌측 사이드바에서 전체 기능으로 이동합니다.',
    role: '관리자',
    screenshotName: '02_main_shell.png',
    notes: [
      '내정보로 이동하는 기본 시작 메뉴입니다.',
      '실무 커뮤니케이션과 공지 확인은 채팅에서 진행합니다.',
      '공식 요청과 승인은 전자결재에서 처리합니다.',
      '인사, 재고, 관리자 메뉴는 운영 권한에 따라 사용 범위가 달라집니다.',
    ],
    hotspots: [
      { index: 1, label: '내정보', note: '개인 시작 화면', locator: page.getByTestId('sidebar-menu-home') },
      { index: 2, label: '추가기능', note: '보조 기능 모음', locator: page.getByTestId('sidebar-menu-extra') },
      { index: 3, label: '채팅', note: '공지와 대화', locator: page.getByTestId('sidebar-menu-chat') },
      { index: 4, label: '게시판', note: '공지사항과 커뮤니티', locator: page.getByTestId('sidebar-menu-board') },
      { index: 5, label: '전자결재', note: '기안과 승인', locator: page.getByTestId('sidebar-menu-approval') },
      { index: 6, label: '인사관리', note: '인사, 근태, 급여', locator: page.getByTestId('sidebar-menu-hr') },
      { index: 7, label: '재고관리', note: '재고와 발주', locator: page.getByTestId('sidebar-menu-inventory') },
      { index: 8, label: '관리자', note: 'MSO 운영 화면', locator: page.getByTestId('sidebar-menu-admin') },
    ],
  });
});

test('capture_mypage_employee', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [employeeUser],
    companies: [{ id: employeeUser.company_id, name: employeeUser.company, type: 'hospital', is_active: true }],
    approvals: [
      {
        id: 'approval-1',
        type: '연차/휴가',
        title: '연차 사용 신청',
        content: '테스트 결재입니다.',
        sender_id: employeeUser.id,
        sender_name: employeeUser.name,
        sender_company: employeeUser.company,
        company_id: employeeUser.company_id,
        current_approver_id: managerUser.id,
        approver_line: [managerUser.id],
        status: '대기',
        created_at: '2026-03-09T09:10:00.000Z',
        meta_data: {},
      },
    ],
  });
  await seedSession(page, { user: employeeUser });
  await page.goto('/main');
  await waitForMainReady(page, 'mypage-view');

  await saveCapture(page, {
    id: '03_mypage',
    title: '내정보 화면',
    subtitle: '직원이 가장 자주 쓰는 개인 업무 화면입니다.',
    role: '사원',
    screenshotName: '03_mypage.png',
    notes: [
      '프로필, 출퇴근, 할 일, 증명서, 급여, 서류제출, 알림 탭을 사용합니다.',
      '상단 카드는 오늘 필요한 개인 업무를 빠르게 확인하는 영역입니다.',
      '출퇴근, 증명서, 서류제출은 직원 문의가 가장 많이 발생하는 기능입니다.',
    ],
    hotspots: [
      {
        index: 1,
        label: '프로필 탭',
        note: '기본 정보 확인',
        box: { x: 525, y: 22, width: 122, height: 58 },
      },
      { index: 2, label: '출퇴근 탭', note: '출퇴근 기록 확인', locator: page.getByRole('button', { name: '출퇴근' }) },
      { index: 3, label: '증명서 탭', note: '증명서 신청', locator: page.getByRole('button', { name: '증명서' }) },
      { index: 4, label: '급여 탭', note: '급여명세 확인', locator: page.getByRole('button', { name: '급여' }) },
      { index: 5, label: '서류제출 탭', note: '파일 제출', locator: page.getByRole('button', { name: '서류제출' }) },
      { index: 6, label: '알림 탭', note: '승인/시스템 알림', locator: page.getByRole('button', { name: '🔔 알림' }) },
    ],
  });
});

test('capture_mypage_manager', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [managerUser, employeeUser],
    companies: [{ id: employeeUser.company_id, name: employeeUser.company, type: 'hospital', is_active: true }],
    approvals: [
      {
        id: 'approval-2',
        type: '연차/휴가',
        title: '연차 승인 요청',
        content: '부서장 승인 대기 테스트입니다.',
        sender_id: employeeUser.id,
        sender_name: employeeUser.name,
        sender_company: employeeUser.company,
        company_id: employeeUser.company_id,
        current_approver_id: managerUser.id,
        approver_line: [managerUser.id],
        status: '대기',
        created_at: '2026-03-09T09:15:00.000Z',
        meta_data: {},
      },
    ],
    inventoryItems,
    attendances: [
      { id: 'att-2', staff_id: managerUser.id, work_date: '2026-03-09', check_in_time: '2026-03-09T08:58:00.000Z', check_out_time: null },
    ],
  });
  await seedSession(page, { user: managerUser });
  await page.goto('/main');
  await waitForMainReady(page, 'mypage-view');

  await saveCapture(page, {
    id: '10_mypage_manager',
    title: '부서장 대시보드',
    subtitle: '결재 대기, 팀 인원, 부족 재고를 빠르게 확인하는 시작 화면입니다.',
    role: '부서장',
    screenshotName: '10_mypage_manager.png',
    notes: [
      '부서장은 일반 직원보다 운영 요약 카드가 더 많이 보입니다.',
      '결재 대기와 부족 재고는 우선 확인해야 하는 항목입니다.',
      '내정보 화면을 하루 업무 시작점으로 쓰는 것이 좋습니다.',
    ],
    hotspots: [
      { index: 1, label: '팀 인원 카드', note: '현재 부서 인원 수', box: { x: 120, y: 150, width: 280, height: 100 } },
      { index: 2, label: '결재 대기 카드', note: '승인할 문서 건수', box: { x: 410, y: 150, width: 280, height: 100 } },
      { index: 3, label: '재고 부족 카드', note: '부족 품목 건수', box: { x: 995, y: 150, width: 240, height: 100 } },
    ],
  });
});

test('capture_chat_screen', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [employeeUser, managerUser],
    companies: [{ id: employeeUser.company_id, name: employeeUser.company, type: 'hospital', is_active: true }],
    chatRooms,
    messages,
  });
  await seedSession(page, {
    user: employeeUser,
    localStorage: { erp_chat_last_room: 'room-1' },
  });
  await page.goto('/main?open_menu=채팅');
  await waitForMainReady(page, 'chat-view');

  await saveCapture(page, {
    id: '04_chat',
    title: '채팅 화면',
    subtitle: '채팅방 목록, 메시지 영역, 입력창을 중심으로 사용합니다.',
    role: '사원',
    screenshotName: '04_chat.png',
    notes: [
      '좌측은 채팅방 목록입니다.',
      '가운데는 대화 내용입니다.',
      '하단 입력창과 전송 버튼으로 메시지를 보냅니다.',
    ],
    hotspots: [
      {
        index: 1,
        label: '채팅방 목록',
        note: '공지방과 그룹방 선택',
        box: { x: 70, y: 110, width: 290, height: 620 },
      },
      {
        index: 2,
        label: '대화 내용',
        note: '메시지 확인',
        box: { x: 390, y: 110, width: 720, height: 560 },
      },
      {
        index: 3,
        label: '입력창',
        note: '메시지 작성',
        locator: page.getByTestId('chat-message-input'),
      },
      {
        index: 4,
        label: '전송 버튼',
        note: '메시지 보내기',
        locator: page.getByTestId('chat-send-button'),
      },
    ],
  });
});

test('capture_board_screen', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [employeeUser],
    companies: [{ id: employeeUser.company_id, name: employeeUser.company, type: 'hospital', is_active: true }],
    boardPosts,
  });
  await seedSession(page, { user: employeeUser });
  await page.goto('/main?open_menu=게시판&open_board=공지사항');
  await waitForMainReady(page, 'board-view');

  await saveCapture(page, {
    id: '05_board',
    title: '게시판 화면',
    subtitle: '공지사항과 자유게시판 등 게시판 종류를 선택해 사용합니다.',
    role: '사원',
    screenshotName: '05_board.png',
    notes: [
      '상단에서 게시판 종류를 바꿉니다.',
      '중앙 목록에서 게시물을 열어 확인합니다.',
      '일부 게시판에서는 새 글 작성 버튼이 함께 보입니다.',
    ],
    hotspots: [
      {
        index: 1,
        label: '공지사항 탭',
        note: '공식 공지 확인',
        locator: page.getByRole('button', { name: /공지사항/ }).first(),
      },
      {
        index: 2,
        label: '게시물 목록',
        note: '글 선택 영역',
        box: { x: 260, y: 150, width: 1080, height: 560 },
      },
    ],
  });
});

test('capture_approval_screen', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [employeeUser, managerUser],
    companies: [{ id: employeeUser.company_id, name: employeeUser.company, type: 'hospital', is_active: true }],
    approvals: [
      {
        id: 'approval-1',
        type: '연차/휴가',
        title: '연차 사용 신청',
        content: '테스트 결재입니다.',
        sender_id: employeeUser.id,
        sender_name: employeeUser.name,
        sender_company: employeeUser.company,
        company_id: employeeUser.company_id,
        current_approver_id: managerUser.id,
        approver_line: [managerUser.id],
        status: '대기',
        created_at: '2026-03-09T09:20:00.000Z',
        meta_data: {},
      },
    ],
  });
  await seedSession(page, { user: employeeUser });
  await page.goto('/main?open_menu=전자결재&open_view=작성하기');
  await waitForMainReady(page, 'approval-view');
  await page.getByRole('button', { name: '작성하기' }).click();
  await expect(page.getByTestId('approval-title-input')).toBeVisible();

  await saveCapture(page, {
    id: '06_approval',
    title: '전자결재 작성 화면',
    subtitle: '결재 종류를 고르고 제목과 내용을 작성해 상신합니다.',
    role: '사원',
    screenshotName: '06_approval.png',
    notes: [
      '상단에서 기안함, 결재함, 작성하기 같은 탭을 전환합니다.',
      '제목과 내용 입력 후 상신 버튼으로 제출합니다.',
      '결재선 선택과 문서 유형에 따라 추가 입력 영역이 달라집니다.',
    ],
    hotspots: [
      {
        index: 1,
        label: '작성하기 탭',
        note: '새 결재 작성',
        locator: page.getByRole('button', { name: '작성하기' }).first(),
      },
      {
        index: 2,
        label: '결재선 선택',
        note: '승인자 지정',
        locator: page.getByTestId('approval-approver-select'),
      },
      {
        index: 3,
        label: '제목 입력',
        note: '문서 제목 입력',
        locator: page.getByTestId('approval-title-input'),
      },
      {
        index: 4,
        label: '내용 입력',
        note: '본문 입력',
        locator: page.getByTestId('approval-content-input'),
      },
      {
        index: 5,
        label: '상신 버튼',
        note: '문서 제출',
        locator: page.getByTestId('approval-submit-button'),
      },
    ],
  });
});

test('capture_approval_manager', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [employeeUser, managerUser],
    companies: [{ id: employeeUser.company_id, name: employeeUser.company, type: 'hospital', is_active: true }],
    approvals: [
      {
        id: 'approval-3',
        type: '연차/휴가',
        title: '간호부 연차 승인 요청',
        content: '팀장 승인 대기 문서입니다.',
        sender_id: employeeUser.id,
        sender_name: employeeUser.name,
        sender_company: employeeUser.company,
        company_id: employeeUser.company_id,
        current_approver_id: managerUser.id,
        approver_line: [managerUser.id],
        status: '대기',
        created_at: '2026-03-09T09:25:00.000Z',
        meta_data: {},
      },
    ],
  });
  await seedSession(page, {
    user: managerUser,
    localStorage: { erp_approval_view: '결재함' },
  });
  await page.goto('/main?open_menu=전자결재');
  await waitForMainReady(page, 'approval-view');
  await page.getByRole('button', { name: '결재함' }).click();

  await saveCapture(page, {
    id: '11_approval_manager',
    title: '부서장 결재함',
    subtitle: '팀원이 올린 문서를 검토하고 승인 또는 반려하는 화면입니다.',
    role: '부서장',
    screenshotName: '11_approval_manager.png',
    notes: [
      '부서장은 결재함에서 팀원 요청을 가장 많이 처리합니다.',
      '대기 문서 카드에서 승인 또는 반려 버튼이 나타납니다.',
      '연차, 출결정정, 물품신청은 실제 운영 데이터에 영향을 줍니다.',
    ],
    hotspots: [
      { index: 1, label: '결재함 탭', note: '승인 대상 문서 보기', locator: page.getByRole('button', { name: '결재함' }).first() },
      { index: 2, label: '문서 목록', note: '대기 문서 검토', box: { x: 280, y: 165, width: 1060, height: 520 } },
    ],
  });
});

test('capture_hr_screen', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [managerUser, employeeUser],
    companies: [{ id: employeeUser.company_id, name: employeeUser.company, type: 'hospital', is_active: true }],
    attendances: [
      { id: 'att-1', staff_id: employeeUser.id, work_date: '2026-03-09', check_in_time: '2026-03-09T09:02:00.000Z', check_out_time: null },
    ],
  });
  await seedSession(page, { user: managerUser });
  await page.goto('/main?open_menu=인사관리');
  await waitForMainReady(page, 'hr-view');

  await saveCapture(page, {
    id: '07_hr',
    title: '인사관리 화면',
    subtitle: '인력관리, 근태 · 급여, 복지 · 문서 영역으로 나뉘어 운영합니다.',
    role: '부서장',
    screenshotName: '07_hr.png',
    notes: [
      '상단 워크스페이스에서 업무 성격을 바꿉니다.',
      '좌측 기능 탭에서 세부 화면을 선택합니다.',
      '현재 원본은 메뉴가 많은 편이므로 자주 쓰는 탭을 먼저 익히는 것이 좋습니다.',
    ],
    hotspots: [
      {
        index: 1,
        label: '업무 공간',
        note: '인력관리/근태·급여/복지·문서',
        box: { x: 270, y: 150, width: 320, height: 120 },
      },
      {
        index: 2,
        label: '기능 탭 영역',
        note: '세부 기능 선택',
        box: { x: 270, y: 285, width: 290, height: 500 },
      },
      {
        index: 3,
        label: '본문 화면',
        note: '선택 기능 작업 영역',
        box: { x: 590, y: 150, width: 760, height: 620 },
      },
    ],
  });
});

test('capture_inventory_screen', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [managerUser],
    companies: [{ id: employeeUser.company_id, name: employeeUser.company, type: 'hospital', is_active: true }],
    inventoryItems,
    inventoryLogs: [
      { id: 'log-1', item_id: 'inv-1', type: '입고', quantity: 10, created_at: '2026-03-08T10:00:00.000Z' },
    ],
  });
  await seedSession(page, { user: managerUser });
  await page.goto('/main?open_menu=재고관리');
  await waitForMainReady(page, 'inventory-view');

  await saveCapture(page, {
    id: '08_inventory',
    title: '재고관리 화면',
    subtitle: '재고 현황, 검색, 회사/부서 필터를 중심으로 사용합니다.',
    role: '부서장',
    screenshotName: '08_inventory.png',
    notes: [
      '상단에서 회사와 부서를 바꿔서 재고를 봅니다.',
      '검색으로 품목명을 빠르게 찾습니다.',
      '저재고, 유통기한 임박 품목은 운영 우선순위가 높습니다.',
    ],
    hotspots: [
      {
        index: 1,
        label: '회사/부서 필터',
        note: '조회 범위 변경',
        box: { x: 310, y: 175, width: 420, height: 90 },
      },
      {
        index: 2,
        label: '검색 영역',
        note: '품목 검색',
        box: { x: 740, y: 175, width: 260, height: 90 },
      },
      {
        index: 3,
        label: '재고 목록',
        note: '현재 수량과 품목 확인',
        box: { x: 300, y: 280, width: 1040, height: 470 },
      },
    ],
  });
});

test('capture_admin_screen', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies,
    inventoryItems,
    boardPosts,
  });
  await seedSession(page, { user: adminUser });
  await page.goto('/main?open_menu=관리자');
  await waitForMainReady(page, 'admin-view');

  await saveCapture(page, {
    id: '09_admin',
    title: '관리자 화면',
    subtitle: '경영분석, 감사센터, 직접 운영 탭을 통해 시스템을 관리합니다.',
    role: '관리자',
    screenshotName: '09_admin.png',
    notes: [
      '상단 분석 영역은 경영대시보드, 재무대시보드, 예산관리 등을 확인하는 곳입니다.',
      '좌측 사이드바의 관리자 하위 메뉴와 현재 본문 화면을 함께 이해해야 합니다.',
      '권한, 백업, 초기화, 양식 변경은 운영 영향이 큰 기능입니다.',
    ],
    hotspots: [
      {
        index: 1,
        label: '경영분석 영역',
        note: '분석 보조 탭',
        box: { x: 280, y: 150, width: 1080, height: 110 },
      },
      {
        index: 2,
        label: '본문 작업 영역',
        note: '관리자 기능 화면',
        box: { x: 280, y: 280, width: 1080, height: 470 },
      },
      {
        index: 3,
        label: '관리자 메인 메뉴',
        note: 'MSO 전용 진입 메뉴',
        locator: page.getByTestId('sidebar-menu-admin'),
      },
    ],
  });
});

test('capture_admin_permissions', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [adminUser, managerUser, employeeUser],
    companies,
    inventoryItems,
    boardPosts,
  });
  await seedSession(page, { user: adminUser });
  await page.goto('/main?open_menu=관리자');
  await waitForMainReady(page, 'admin-view');
  await page.getByRole('button', { name: '직원 권한' }).click();

  await saveCapture(page, {
    id: '12_admin_permissions',
    title: '직원 권한 관리 화면',
    subtitle: '직원별 메뉴와 기능 접근 권한을 조정하는 핵심 운영 화면입니다.',
    role: '관리자',
    screenshotName: '12_admin_permissions.png',
    notes: [
      '권한 변경은 화면 노출과 데이터 접근 범위에 직접 영향을 줍니다.',
      '직원 선택 후 필요한 권한만 최소 범위로 부여하는 것이 원칙입니다.',
      '운영 반영 전후로 실제 노출 메뉴를 확인하는 것이 안전합니다.',
    ],
    hotspots: [
      { index: 1, label: '직원 권한 탭', note: '권한 관리 진입', locator: page.getByRole('button', { name: '직원 권한' }).first() },
      { index: 2, label: '직원 목록', note: '권한 대상 선택', box: { x: 290, y: 180, width: 360, height: 560 } },
      { index: 3, label: '권한 상세 영역', note: '메뉴/기능 권한 조정', box: { x: 670, y: 180, width: 670, height: 560 } },
    ],
  });
});

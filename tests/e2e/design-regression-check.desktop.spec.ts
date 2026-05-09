import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

const designUser = {
  ...fakeUser,
  id: 'design-user-001',
  employee_no: '2',
  name: '백정민',
  department: '경영지원팀',
  position: '이사',
  role: 'admin',
  company: 'SY INC.',
  company_id: fakeUser.company_id,
  join_date: '2023-08-01',
  annual_leave_total: 15,
  annual_leave_used: 4,
  annual_leave_remaining: 11,
  current_month_work_days: 7,
  current_month_present_days: 1,
  current_month_late_count: 1,
  pending_approval_count: 0,
  permissions: {
    ...fakeUser.permissions,
    admin: true,
    mso: true,
    menu_추가기능: true,
    menu_게시판: true,
    menu_전자결재: true,
    menu_인사관리: true,
    menu_재고관리: true,
    menu_관리자: true,
    extra_OP체크: true,
    extra_조직도: true,
    extra_퇴원심사: true,
    extra_직원평가: true,
    extra_입금실시간조회: true,
    extra_부서별재고: true,
    extra_근무현황: true,
    extra_마감보고: true,
    extra_수술상담: true,
    extra_ESL관리: true,
    hr_인사발령: true,
    hr_교육: true,
    hr_오프보딩: true,
    hr_서류제출: true,
    inventory_스캔: true,
    inventory_UDI: true,
    inventory_자산: true,
    inventory_거래처: true,
    inventory_카테고리: true,
    inventory_AS반품: true,
    inventory_소모품통계: true,
    inventory_월마감: true,
    inventory_내부서재고: true,
    admin_경영분석: true,
    admin_회사관리: true,
    admin_직원권한: true,
    admin_데이터백업: true,
    admin_데이터초기화: true,
    admin_문서양식: true,
    admin_감사센터: true,
    admin_알림자동화: true,
    admin_수술검사템플릿: true,
    admin_팝업관리: true,
    admin_급여이상치: true,
  },
};

const staffMembers = Array.from({ length: 55 }, (_, index) => ({
  ...designUser,
  id: index === 0 ? designUser.id : `design-staff-${String(index + 1).padStart(3, '0')}`,
  employee_no: String(index + 1),
  name: index === 0 ? designUser.name : `직원${index + 1}`,
  position: index === 0 ? designUser.position : '사원',
  department: index % 3 === 0 ? '경영지원팀' : index % 3 === 1 ? '수술팀' : '진료지원팀',
  status: '재직중',
}));

const inventoryItems = [
  {
    id: 'inventory-design-001',
    item_name: '(3M) 아바가드 손 소독제 (의)',
    name: '(3M) 아바가드 손 소독제 (의)',
    category: '소모품',
    company: 'SY INC.',
    department: '수술팀',
    quantity: 0,
    min_quantity: 5,
    unit: '개',
    created_at: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'inventory-design-002',
    item_name: '(그린) 수액세트 (주황/582) (급)',
    name: '(그린) 수액세트 (주황/582) (급)',
    category: '의료기기',
    company: 'SY INC.',
    department: '진료지원팀',
    quantity: 3,
    min_quantity: 10,
    unit: '개',
    created_at: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'inventory-design-003',
    item_name: '(대경) 스티커(20cm*15M) (산)',
    name: '(대경) 스티커(20cm*15M) (산)',
    category: '소모품',
    company: 'SY INC.',
    department: '경영지원팀',
    quantity: 20,
    min_quantity: 5,
    unit: '개',
    created_at: '2026-05-01T00:00:00.000Z',
  },
];

const boardPosts = [
  {
    id: 'notice-design-004',
    board_type: '공지사항',
    title: '[공지] 신규 메신저 출퇴근 기능 활용 및 선불폰 제한 안내',
    content: '테스트 공지입니다.',
    author_id: designUser.id,
    author_name: '이나림',
    author: '이나림',
    status: '게시중',
    views: 53,
    likes_count: 3,
    created_at: '2026-05-04T09:00:00.000Z',
  },
  {
    id: 'notice-design-003',
    board_type: '공지사항',
    title: '유니폼 착용 및 세탁에 대한 권고 및 교육',
    content: '테스트 공지입니다.',
    author_id: designUser.id,
    author_name: '백정민',
    author: '백정민',
    status: '게시중',
    views: 102,
    likes_count: 0,
    created_at: '2026-04-16T09:00:00.000Z',
  },
  {
    id: 'notice-design-002',
    board_type: '공지사항',
    title: '물품 신청 및 관리 기준 엄격 적용 안내',
    content: '테스트 공지입니다.',
    author_id: designUser.id,
    author_name: '백정민',
    author: '백정민',
    status: '게시중',
    views: 59,
    likes_count: 1,
    created_at: '2026-04-16T09:00:00.000Z',
  },
  {
    id: 'notice-design-001',
    board_type: '공지사항',
    title: '일부 근무자 근무시간 변경.',
    content: '테스트 공지입니다.',
    author_id: designUser.id,
    author_name: '백정민',
    author: '백정민',
    status: '중요',
    views: 108,
    likes_count: 2,
    created_at: '2026-04-13T09:00:00.000Z',
  },
];

const approvals = [
  {
    id: 'approval-design-001',
    type: '출결정정',
    title: '출결정정 신청 - 2026-01-29, 2026-01-30 외 20건',
    content: '출결정정 신청',
    sender_id: designUser.id,
    sender_name: designUser.name,
    sender_company: designUser.company,
    company_id: designUser.company_id,
    current_approver_id: designUser.id,
    approver_line: [designUser.id],
    status: '반려',
    created_at: '2026-03-30T09:00:00.000Z',
    meta_data: {},
  },
  {
    id: 'approval-design-002',
    type: '물품신청',
    title: '1',
    content: '물품신청',
    sender_id: designUser.id,
    sender_name: designUser.name,
    sender_company: designUser.company,
    company_id: designUser.company_id,
    current_approver_id: designUser.id,
    approver_line: [designUser.id],
    status: '반려',
    created_at: '2026-03-28T09:00:00.000Z',
    meta_data: {},
  },
  {
    id: 'approval-design-003',
    type: '연차/휴가',
    title: '테스트 연차 신청',
    content: '테스트 연차 신청',
    sender_id: designUser.id,
    sender_name: designUser.name,
    sender_company: designUser.company,
    company_id: designUser.company_id,
    current_approver_id: designUser.id,
    approver_line: [designUser.id],
    status: '승인',
    created_at: '2026-03-25T09:00:00.000Z',
    meta_data: {},
  },
];

test.describe('latest design regression check', () => {
  test.beforeEach(async ({ page }) => {
    await dismissDialogs(page);
    await seedSession(page, {
      user: designUser,
      localStorage: {
        erp_recent_features: JSON.stringify(['OP체크', '조직도', '퇴원심사', '직원평가', '입금실시간조회']),
        'erp_recent_features:design-user-001': JSON.stringify(['OP체크', '조직도', '퇴원심사', '직원평가', '입금실시간조회']),
        erp_favorites: JSON.stringify([]),
        'erp_favorites:design-user-001': JSON.stringify([]),
        erp_mypage_favorites: JSON.stringify([]),
        'erp_mypage_favorites:design-user-001': JSON.stringify([]),
        erp_mypage_tab: 'profile',
      },
    });
    await mockSupabase(page, {
      staffMembers,
      approvals,
      boardPosts,
      inventoryItems,
      chatRooms: [
        {
          id: '00000000-0000-0000-0000-000000000000',
          name: '공지사항',
          type: 'notice',
          members: [designUser.id],
          created_at: '2026-05-01T00:00:00.000Z',
          last_message_at: '2026-05-01T00:00:00.000Z',
        },
      ],
      notifications: [],
    });
  });

  test('my page uses the latest wide card layout', async ({ page }) => {
    await page.goto('/main?open_menu=내정보');
    await expect(page.getByRole('heading', { name: '내 정보' })).toBeVisible();
    await expect(page.getByRole('button', { name: '정보 수정' })).toBeVisible();
    await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
    await expect(page.getByText('이번 달 근태')).toBeVisible();
    await expect(page.getByText('잔여 연차')).toBeVisible();
    await expect(page.getByText('이번 달 급여')).toBeVisible();
    await expect(page.getByText('미결재')).toBeVisible();
    await expect(page.getByText('연차/휴가 내역')).toBeVisible();
    await expect(page.getByText('반갑습니다')).toHaveCount(0);
    await expect(page.getByText('시스템 안전 로그아웃')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/design-check-mypage.png', fullPage: true });
  });

  test('extra features use recent/overall grid cards', async ({ page }) => {
    await page.goto('/main?open_menu=추가기능');
    await expect(page.getByRole('heading', { name: '추가 기능' })).toBeVisible();
    await expect(page.getByText('최근 사용')).toBeVisible();
    await expect(page.getByText('전체')).toBeVisible();
    await expect(page.getByText('최근 방문')).toHaveCount(0);
    await expect(page.getByTestId('extra-card-org-chart').first()).toBeVisible();
    await expect(page.getByTestId('extra-card-op-check').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/design-check-extra.png', fullPage: true });
  });

  test('hr and inventory sub menus match latest shell', async ({ page }) => {
    await page.goto('/main?open_menu=인사관리&open_subview=구성원');
    await expect(page.getByRole('heading', { name: '인사관리' }).first()).toBeVisible();
    await expect(page.getByText('55명 등록됨')).toBeVisible();
    await expect(page.getByText('업무 공간')).toBeVisible();
    await expect(page.getByRole('button', { name: /인력관리/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /근태 · 급여/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /복지 · 문서/ })).toBeVisible();
    await page.screenshot({ path: 'test-results/design-check-hr.png', fullPage: true });

    await page.goto('/main?open_menu=인사관리&open_subview=근태');
    await expect(page.getByRole('button', { name: /근태 · 급여/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /전문 근태 통합 관리/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: '근태 달력' })).toBeVisible();
    await page.screenshot({ path: 'test-results/design-check-hr-attendance.png', fullPage: true });

    await page.goto('/main?open_menu=재고관리&open_subview=현황');
    await expect(page.getByRole('heading', { name: '재고관리' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '재고 현황' })).toBeVisible();
    await expect(page.getByRole('button', { name: /전체 현황/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /부서별 재고/ })).toBeVisible();
    await expect(page.getByText('총 품목')).toBeVisible();
    await expect(page.getByText('부족 품목')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '품목명' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '현재 재고' })).toBeVisible();
    await page.screenshot({ path: 'test-results/design-check-inventory.png', fullPage: true });
  });

  test('admin, approval, board and chat screens keep the latest desktop shell', async ({ page }) => {
    await page.goto('/main?open_menu=관리자&open_subview=경영분석');
    await expect(page.getByRole('heading', { name: '관리자' }).first()).toBeVisible();
    await expect(page.getByText('경영분석')).toBeVisible();
    await expect(page.getByRole('button', { name: /경영대시보드/ })).toBeVisible();
    await expect(page.getByText('빠른 액세스')).toBeVisible();
    await page.screenshot({ path: 'test-results/design-check-admin.png', fullPage: true });

    await page.goto('/main?open_menu=전자결재&open_subview=기안함');
    await expect(page.getByRole('heading', { name: '전자결재' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '기안함' })).toBeVisible();
    await expect(page.getByText('대기중')).toBeVisible();
    await expect(page.getByText('이번 달 승인')).toBeVisible();
    await expect(page.locator('.erp-stat-card').filter({ hasText: '반려' })).toBeVisible();
    await page.screenshot({ path: 'test-results/design-check-approval.png', fullPage: true });

    await page.goto('/main?open_menu=게시판&open_subview=공지사항');
    await expect(page.getByRole('heading', { name: '게시판' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '공지사항' })).toBeVisible();
    await expect(page.getByTestId('board-toggle-new-post')).toBeVisible();
    await expect(page.getByText('[공지] 신규 메신저 출퇴근 기능 활용 및 선불폰 제한 안내')).toBeVisible();
    await page.screenshot({ path: 'test-results/design-check-board.png', fullPage: true });

    await page.goto('/main?open_menu=채팅');
    await expect(page.getByText('채팅방을 선택하세요.')).toBeVisible();
    await expect(page.getByText('공지사항')).toBeVisible();
    await page.screenshot({ path: 'test-results/design-check-chat.png', fullPage: true });
  });
});

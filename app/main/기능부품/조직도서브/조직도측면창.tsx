import NotificationCenter from '../NotificationCenter';

const MYPAGE_TAB_KEY = 'erp_mypage_tab';

type SubMenuItem = {
  id: string;
  label: string;
  group?: string;
  icon?: string;
};

export const SUB_MENUS: Record<string, SubMenuItem[]> = {
  재고관리: [
    { id: '현황', label: '현황', group: '재고 대시보드', icon: '📊' },
    { id: '이력', label: '이력', group: '재고 대시보드', icon: '🕘' },
    { id: '유통기한', label: '유통기한 알림', group: '재고 대시보드', icon: '⏰' },
    { id: '수요예측', label: '수요 예측', group: '재고 대시보드', icon: '🔮' },
    { id: '등록', label: '등록', group: '입출고 운영', icon: '📝' },
    { id: '스캔', label: '스캔', group: '입출고 운영', icon: '📷' },
    { id: '발주', label: '발주', group: '입출고 운영', icon: '📦' },
    { id: '재고실사', label: '재고 실사', group: '입출고 운영', icon: '🔎' },
    { id: '이관', label: '재고 이관', group: '입출고 운영', icon: '🔄' },
    { id: '명세서', label: '명세서', group: '문서 · 자산', icon: '🧾' },
    { id: '납품확인서', label: '납품 확인서', group: '문서 · 자산', icon: '📋' },
    { id: 'UDI', label: 'UDI', group: '문서 · 자산', icon: '🏷️' },
    { id: '자산', label: '자산 QR', group: '문서 · 자산', icon: '🔖' },
    { id: '거래처', label: '거래처', group: '기준 정보', icon: '🏭' },
    { id: '카테고리', label: '카테고리', group: '기준 정보', icon: '🗂️' },
    { id: 'AS반품', label: 'AS / 반품', group: '기준 정보', icon: '↩️' },
    { id: '소모품통계', label: '소모품 통계', group: '기준 정보', icon: '📉' },
  ],
  게시판: [
    { id: '공지사항', label: '공지사항', icon: '📢' },
    { id: '자유게시판', label: '자유게시판', icon: '📝' },
    { id: '경조사', label: '경조사', icon: '🎊' },
    { id: '수술일정', label: '수술일정', icon: '🏥' },
    { id: 'MRI일정', label: 'MRI일정', icon: '🧠' },
  ],
  전자결재: [
    { id: '기안함', label: '기안함', icon: '📝' },
    { id: '결재함', label: '결재함', icon: '✅' },
    { id: '작성하기', label: '작성하기', icon: '✍️' },
  ],
  인사관리: [
    { id: '구성원', label: '구성원', group: '인력관리', icon: '👥' },
    { id: '인사발령', label: '인사발령', group: '인력관리', icon: '📋' },
    { id: '포상/징계', label: '포상/징계', group: '인력관리', icon: '🏅' },
    { id: '교육', label: '교육', group: '인력관리', icon: '📚' },
    { id: '오프보딩', label: '오프보딩', group: '인력관리', icon: '🚪' },
    { id: '근태', label: '근태', group: '근태/급여', icon: '⏰' },
    { id: '교대근무', label: '교대근무', group: '근태/급여', icon: '🔄' },
    { id: '연차/휴가', label: '연차/휴가', group: '근태/급여', icon: '🌴' },
    { id: '급여', label: '급여', group: '근태/급여', icon: '💰' },
    { id: '건강검진', label: '건강검진', group: '복무/복지', icon: '🩺' },
    { id: '경조사', label: '경조사', group: '복무/복지', icon: '🎊' },
    { id: '비품대여', label: '비품대여', group: '복무/복지', icon: '📦' },
    { id: '계약', label: '계약', group: '문서/기타', icon: '📝' },
    { id: '문서보관함', label: '문서보관함', group: '문서/기타', icon: '📁' },
    { id: '증명서', label: '증명서', group: '문서/기타', icon: '📄' },
    { id: '서류제출', label: '서류제출', group: '문서/기타', icon: '📤' },
    { id: '캘린더', label: '캘린더', group: '문서/기타', icon: '📅' },
  ],
  관리자: [
    { id: '경영분석', label: '경영 분석', group: '경영 분석', icon: '📈' },
    { id: '회사관리', label: '회사 / 조직', group: '조직 / 권한', icon: '🏢' },
    { id: '직원권한', label: '직원 권한', group: '조직 / 권한', icon: '🔐' },
    { id: '알림자동화', label: '알림 자동화', group: '시스템 설정', icon: '🔔' },
    { id: '수술검사템플릿', label: '수술 / 검사 템플릿', group: '시스템 설정', icon: '🧪' },
    { id: '팝업관리', label: '팝업 관리', group: '시스템 설정', icon: '🪟' },
    { id: '문서양식', label: '문서 양식', group: '시스템 설정', icon: '📄' },
    { id: '엑셀등록', label: '엑셀 일괄 등록', group: '데이터 관리', icon: '📥' },
    { id: '급여이상치', label: '급여 이상치 감지', group: '데이터 관리', icon: '⚠️' },
    { id: '데이터백업', label: '백업 / 복원', group: '데이터 관리', icon: '💾' },
    { id: '데이터초기화', label: '데이터 초기화', group: '데이터 관리', icon: '♻️' },
    { id: '공문서대장', label: '공문서 발송 대장', group: '데이터 관리', icon: '📮' },
    { id: '감사센터', label: '감사 센터', group: '감사 센터', icon: '🔍' },
    { id: '시스템마스터센터', label: '시스템마스터센터', group: '시스템 마스터', icon: '🛡️' },
  ],
};

const MAIN_MENUS = [
  { id: '내정보', icon: '👤', label: '내정보', testId: 'sidebar-menu-home' },
  { id: '추가기능', icon: '➕', label: '추가기능', testId: 'sidebar-menu-extra' },
  { id: '채팅', icon: '💬', label: '채팅', testId: 'sidebar-menu-chat' },
  { id: '게시판', icon: '📋', label: '게시판', testId: 'sidebar-menu-board' },
  { id: '전자결재', icon: '✍️', label: '전자결재', testId: 'sidebar-menu-approval' },
  { id: '인사관리', icon: '👥', label: '인사관리', testId: 'sidebar-menu-hr' },
  { id: '재고관리', icon: '📦', label: '재고관리', testId: 'sidebar-menu-inventory' },
  { id: '관리자', icon: '⚙️', label: '관리자', testId: 'sidebar-menu-admin' },
];

export default function Sidebar({ user, mainMenu, onMenuChange }: any) {
  const permissions = user?.permissions || {};
  const isMso = user?.company === 'SY INC.' || permissions.mso === true;

  const canSeeMenu = (menuId: string) => {
    if (menuId === '관리자') {
      return isMso || user?.role === 'admin' || permissions.menu_관리자 === true;
    }

    if (menuId === '인사관리') {
      return isMso || permissions.hr === true || permissions.menu_인사관리 === true;
    }

    return permissions[`menu_${menuId}`] !== false;
  };

  const visibleMenus = MAIN_MENUS.filter((menu) => canSeeMenu(menu.id));

  const handleMenuClick = (menuId: string) => {
    if (menuId === '내정보' && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(MYPAGE_TAB_KEY);
      } catch {
        // ignore localStorage failures
      }
    }

    onMenuChange(menuId);
  };

  return (
    <>
      <aside
        className="relative hidden h-screen w-[72px] shrink-0 flex-col items-center border-r border-[var(--toss-border)] bg-[var(--toss-card)] py-4 shadow-sm md:flex"
        data-testid="desktop-sidebar"
      >
        <div className="mb-3 flex w-full shrink-0 flex-col items-center px-2">
          {user && <NotificationCenter user={user} />}
        </div>

        <div className="no-scrollbar flex w-full flex-1 flex-col space-y-1 overflow-y-auto px-2">
          {visibleMenus.map((menu) => (
            <button
              key={menu.id}
              type="button"
              data-testid={menu.testId}
              onClick={() => handleMenuClick(menu.id)}
              className={`flex w-full flex-col items-center justify-center rounded-[12px] py-2.5 transition-all ${
                mainMenu === menu.id
                  ? 'bg-[var(--toss-blue-light)] text-[var(--toss-blue)]'
                  : 'text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)] hover:text-[var(--foreground)]'
              }`}
            >
              <span className="text-[18px] leading-none">{menu.icon}</span>
              <span className="mt-1 text-[11px] font-medium">{menu.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <nav
        className="safe-area-pb no-scrollbar fixed bottom-0 left-0 right-0 z-[100] flex items-center gap-1 overflow-x-auto border-t border-[var(--toss-border)] bg-[var(--toss-card)] px-2 py-1 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] md:hidden"
        data-testid="mobile-tabbar"
      >
        {visibleMenus.map((menu) => (
          <button
            key={menu.id}
            type="button"
            data-testid={`${menu.testId}-mobile`}
            onClick={() => handleMenuClick(menu.id)}
            className={`flex min-h-[50px] min-w-[70px] flex-none touch-manipulation flex-col items-center justify-center rounded-[12px] px-3 py-1.5 transition-all ${
              mainMenu === menu.id ? 'text-[var(--toss-blue)]' : 'text-[var(--toss-gray-3)]'
            }`}
          >
            <span className="text-[16px] leading-none">{menu.icon}</span>
            <span className="mt-1 w-full truncate text-center text-[10px] font-bold">{menu.label}</span>
          </button>
        ))}
        {user && (
          <div className="flex min-h-[50px] flex-none translate-y-[-2px] flex-col items-center justify-center px-2 py-1.5">
            <NotificationCenter user={user} />
          </div>
        )}
      </nav>
    </>
  );
}

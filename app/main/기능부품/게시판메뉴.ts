export type BoardMenuItem = {
  id: string;
  label: string;
  /** 조직도측면창 ICON_PATHS 키와 동일한 string 식별자 */
  icon: string;
};

export const BOARD_MENU_ITEMS: BoardMenuItem[] = [
  { id: '공지사항', label: '공지사항', icon: 'bell' },
  { id: '자유게시판', label: '자유게시판', icon: 'chat' },
  { id: '익명소리함', label: '익명 소리함', icon: 'lock' },
  { id: '경조사', label: '경조사 소식', icon: 'bell' },
  { id: '수술일정', label: '수술일정표', icon: 'calendar' },
  { id: 'MRI일정', label: 'MRI일정표', icon: 'scan' },
  { id: '직원제안함', label: '직원 제안함', icon: 'lightbulb' },
  { id: '업무가이드', label: '업무공유', icon: 'folder' },
];

export const BOARD_META_MAP: Record<string, { title: string; description: string }> = {
  공지사항: { title: '공지사항', description: '' },
  자유게시판: { title: '자유게시판', description: '' },
  익명소리함: { title: '익명 소리함', description: '' },
  경조사: { title: '경조사 소식', description: '' },
  수술일정: { title: '수술일정', description: '' },
  MRI일정: { title: 'MRI일정', description: '' },
  직원제안함: { title: '직원 제안함', description: '' },
  업무가이드: { title: '업무공유', description: '회사별 / 팀별 메뉴에서 업무자료, 인수인계, 팀 할일을 함께 관리합니다.' },
};

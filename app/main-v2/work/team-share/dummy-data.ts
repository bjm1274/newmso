/**
 * dummy-data.ts — 업무공유 협업센터 더미 데이터
 *
 * JM4: union 타입 선언, any 없음
 * JM5: 가상의 이름/직책 사용
 */

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

export type TabId = 'docs' | 'handover' | 'todo';

export type DocCategory = '공지' | '매뉴얼' | '양식' | '교육' | '안내';
export type HandoverShift = '야간→주간' | '주간→야간';
export type TodoStatus = '진행중' | '지연' | '완료';

export type CompanyId = 'sy-inc' | 'hospital-a';
export type TeamId = 'nursing' | 'admin';

export interface Company {
  id: CompanyId;
  name: string;
}

export interface Team {
  id: TeamId;
  companyId: CompanyId;
  name: string;
}

export interface Comment {
  author: string;
  time: string;
  text: string;
}

export interface Attachment {
  name: string;
  type: string;
  size: string;
  colorClass?: string;
}

// ── 자료 (Docs) ───────────────────────────────────────────────────────────────

export interface DocItem {
  id: string;
  type: 'doc';
  category: DocCategory;
  title: string;
  author: string;
  authorInitial: string;
  date: string;
  companyId: CompanyId;
  teamId: TeamId;
  views: number;
  commentCount: number;
  body: string;
  attachments: Attachment[];
  comments: Comment[];
}

// ── 인수인계 (Handover) ───────────────────────────────────────────────────────

export interface HandoverNote {
  shift: string;
  text: string;
  isWarning?: boolean;
}

export interface HandoverItem {
  id: string;
  type: 'handover';
  shift: HandoverShift;
  title: string;
  author: string;
  authorInitial: string;
  date: string;
  companyId: CompanyId;
  teamId: TeamId;
  specialCount: number;
  notes: HandoverNote[];
}

// ── 팀할일 (Todo) ────────────────────────────────────────────────────────────

export interface TodoMember {
  name: string;
  done: boolean;
}

export interface TodoItem {
  id: string;
  type: 'todo';
  status: TodoStatus;
  title: string;
  date: string;
  dueLabel: string;
  companyId: CompanyId;
  teamId: TeamId;
  doneCount: number;
  totalCount: number;
  dueDate: string;
  members: TodoMember[];
}

export type AnyItem = DocItem | HandoverItem | TodoItem;

// ── 회사 / 팀 목록 ────────────────────────────────────────────────────────────

export const COMPANIES: Company[] = [
  { id: 'sy-inc',     name: 'SY INC. (본사)' },
  { id: 'hospital-a', name: '산하 병원 A' },
];

export const TEAMS: Team[] = [
  { id: 'nursing', companyId: 'sy-inc',     name: '간호팀' },
  { id: 'admin',   companyId: 'sy-inc',     name: '행정팀' },
  { id: 'nursing', companyId: 'hospital-a', name: '간호팀' },
  { id: 'admin',   companyId: 'hospital-a', name: '행정팀' },
];

// ── 더미 자료 ──────────────────────────────────────────────────────────────────

export const DUMMY_DOCS: DocItem[] = [
  {
    id: 'doc-1',
    type: 'doc',
    category: '공지',
    title: '2026년 하반기 감염관리 지침 업데이트',
    author: '김지연',
    authorInitial: '김',
    date: '05/11',
    companyId: 'sy-inc',
    teamId: 'nursing',
    views: 28,
    commentCount: 3,
    body: '2026년 하반기 감염관리 지침이 업데이트되었습니다. 손위생 수행 기준 강화, PPE 착용 범위 확대(N95 마스크), 환경 소독 주기 단축(고위험 구역 2시간) 등 세 가지 주요 변경사항이 적용됩니다. 6월 1일부터 전면 시행되며, 교육 이수 후 서명 시트를 첨부 제출해 주세요.',
    attachments: [
      { name: '감염관리지침_2026하반기.pdf', type: 'PDF', size: '2.3 MB' },
      { name: '서명시트_양식.xlsx',          type: 'XLS', size: '48 KB', colorClass: 'bg-[var(--success-light)] text-[var(--success)]' },
    ],
    comments: [
      { author: '이수진', time: '09:45', text: '확인했습니다. 서명시트 팀원들한테 공유할게요.' },
      { author: '박민수', time: '10:02', text: 'PPE 재고 확인해보겠습니다.' },
      { author: '최현우', time: '10:30', text: 'N95 마스크 추가 구매 요청 올렸습니다.' },
    ],
  },
  {
    id: 'doc-2',
    type: 'doc',
    category: '매뉴얼',
    title: '신규 EMR 시스템 사용법 가이드',
    author: '박민수',
    authorInitial: '박',
    date: '05/10',
    companyId: 'sy-inc',
    teamId: 'nursing',
    views: 14,
    commentCount: 1,
    body: '신규 EMR 시스템 전환에 따른 사용법 가이드입니다. 로그인 방법, 환자 조회, 처방 입력, 간호 기록 작성 순서를 단계별로 안내합니다. 첨부 PDF를 참고하시고, 문의는 IT지원팀(내선 2050)으로 연락 바랍니다.',
    attachments: [
      { name: 'EMR_사용가이드_v2.pdf', type: 'PDF', size: '4.1 MB' },
    ],
    comments: [
      { author: '정아영', time: '11:20', text: '가이드 덕분에 잘 사용하고 있습니다. 감사합니다!' },
    ],
  },
  {
    id: 'doc-3',
    type: 'doc',
    category: '양식',
    title: '월간 업무보고 양식 (간호팀용)',
    author: '이수진',
    authorInitial: '이',
    date: '05/09',
    companyId: 'sy-inc',
    teamId: 'nursing',
    views: 9,
    commentCount: 0,
    body: '5월분 월간 업무보고 양식을 공유합니다. 매월 25일까지 작성하여 팀장에게 제출해 주세요. 항목: 주요업무 실적, 미결 사항, 다음 달 계획 순으로 기재합니다.',
    attachments: [
      { name: '월간업무보고_양식_2026.docx', type: 'DOC', size: '32 KB', colorClass: 'bg-blue-50 text-blue-600' },
    ],
    comments: [],
  },
  {
    id: 'doc-4',
    type: 'doc',
    category: '교육',
    title: '5월 법정의무교육 이수 안내',
    author: '정아영',
    authorInitial: '정',
    date: '05/07',
    companyId: 'sy-inc',
    teamId: 'nursing',
    views: 41,
    commentCount: 2,
    body: '5월 법정의무교육(직장 내 괴롭힘 방지, 개인정보 보호, 성희롱 예방) 이수 마감일은 5월 31일입니다. 온라인 교육 플랫폼 접속 후 이수증을 인사팀 메일로 제출해 주세요.',
    attachments: [
      { name: '법정의무교육_안내문.pdf', type: 'PDF', size: '890 KB' },
      { name: '이수증_제출양식.xlsx',   type: 'XLS', size: '28 KB', colorClass: 'bg-[var(--success-light)] text-[var(--success)]' },
      { name: '교육플랫폼_접속방법.png', type: 'IMG', size: '1.2 MB', colorClass: 'bg-purple-50 text-purple-600' },
    ],
    comments: [
      { author: '최현우', time: '14:00', text: '온라인 링크 공유해 주실 수 있나요?' },
      { author: '정아영', time: '14:15', text: '첨부 PDF 2페이지에 QR코드 있습니다.' },
    ],
  },
  {
    id: 'doc-5',
    type: 'doc',
    category: '안내',
    title: '직원 휴게실 냉장고 정리 협조 요청',
    author: '최현우',
    authorInitial: '최',
    date: '05/08',
    companyId: 'hospital-a',
    teamId: 'admin',
    views: 57,
    commentCount: 7,
    body: '직원 휴게실 냉장고 내 개인 음식물 장기 보관으로 인해 위생 문제가 발생하고 있습니다. 매주 금요일 퇴근 전 개인 음식물을 수거해 주시기 바랍니다. 미수거 음식물은 월요일 일괄 폐기됩니다.',
    attachments: [],
    comments: [
      { author: '한소희', time: '16:00', text: '공지 감사합니다. 지킬게요.' },
      { author: '윤채원', time: '16:10', text: '라벨 붙이는 방법도 안내해 주세요.' },
      { author: '최현우', time: '16:20', text: '이름 + 날짜 스티커 부착 권장합니다.' },
    ],
  },
];

// ── 더미 인수인계 ─────────────────────────────────────────────────────────────

export const DUMMY_HANDOVERS: HandoverItem[] = [
  {
    id: 'handover-1',
    type: 'handover',
    shift: '야간→주간',
    title: '5/11 야간 인수인계 — 간호팀',
    author: '한소희',
    authorInitial: '한',
    date: '05/11',
    companyId: 'sy-inc',
    teamId: 'nursing',
    specialCount: 2,
    notes: [
      { shift: '야간 특이사항', text: '302호 환자 새벽 3시 고열 38.8°C 발생. 의사 지시 해열제 투약 후 안정됨.', isWarning: true },
      { shift: '전달 사항',    text: '401호 환자 오전 10시 CT 예약. 이송 준비 필요.' },
    ],
  },
  {
    id: 'handover-2',
    type: 'handover',
    shift: '주간→야간',
    title: '5/10 주간 인수인계 — 간호팀',
    author: '윤채원',
    authorInitial: '윤',
    date: '05/10',
    companyId: 'sy-inc',
    teamId: 'nursing',
    specialCount: 1,
    notes: [
      { shift: '주간 특이사항', text: '215호 환자 낙상 고위험 평가 완료. 침상 난간 올림 상태 유지 요망.', isWarning: true },
      { shift: '전달 사항',    text: '야간 중 혈압약 복약 지도 필요 — 303호 박씨 환자.' },
    ],
  },
  {
    id: 'handover-3',
    type: 'handover',
    shift: '야간→주간',
    title: '5/10 야간 인수인계 — 간호팀',
    author: '정아영',
    authorInitial: '정',
    date: '05/10',
    companyId: 'sy-inc',
    teamId: 'nursing',
    specialCount: 0,
    notes: [
      { shift: '전반적 경과', text: '전반적으로 안정된 야간이었습니다. 특이 사항 없음.' },
    ],
  },
  {
    id: 'handover-4',
    type: 'handover',
    shift: '주간→야간',
    title: '5/11 주간 인수인계 — 행정팀',
    author: '이수진',
    authorInitial: '이',
    date: '05/11',
    companyId: 'hospital-a',
    teamId: 'admin',
    specialCount: 1,
    notes: [
      { shift: '주요 처리 건', text: '외래 예약 시스템 오류로 오후 2시~4시 수동 접수 처리. IT팀 수리 완료 후 정상화.', isWarning: true },
      { shift: '야간 전달',    text: '응급실 청구 서류 3건 내일 오전 처리 필요.' },
    ],
  },
  {
    id: 'handover-5',
    type: 'handover',
    shift: '야간→주간',
    title: '5/09 야간 인수인계 — 행정팀',
    author: '박민수',
    authorInitial: '박',
    date: '05/09',
    companyId: 'hospital-a',
    teamId: 'admin',
    specialCount: 0,
    notes: [
      { shift: '전반적 경과', text: '야간 방문객 입문 보안 점검 정상 완료. 특이 사항 없음.' },
    ],
  },
];

// ── 더미 팀할일 ───────────────────────────────────────────────────────────────

export const DUMMY_TODOS: TodoItem[] = [
  {
    id: 'todo-1',
    type: 'todo',
    status: '진행중',
    title: '감염관리 체크리스트 전 직원 서명',
    date: 'D-2',
    dueLabel: 'D-2',
    companyId: 'sy-inc',
    teamId: 'nursing',
    doneCount: 3,
    totalCount: 8,
    dueDate: '2026-05-13',
    members: [
      { name: '김지연', done: true },
      { name: '이수진', done: true },
      { name: '박민수', done: true },
      { name: '최현우', done: false },
      { name: '정아영', done: false },
      { name: '한소희', done: false },
      { name: '윤채원', done: false },
      { name: '오지현', done: false },
    ],
  },
  {
    id: 'todo-2',
    type: 'todo',
    status: '지연',
    title: '신규 입사자 OT 일정 확인',
    date: 'D+1',
    dueLabel: 'D+1',
    companyId: 'sy-inc',
    teamId: 'nursing',
    doneCount: 0,
    totalCount: 3,
    dueDate: '2026-05-10',
    members: [
      { name: '김지연', done: false },
      { name: '박민수', done: false },
      { name: '이수진', done: false },
    ],
  },
  {
    id: 'todo-3',
    type: 'todo',
    status: '완료',
    title: '비품 재고 현황 취합',
    date: '05/09',
    dueLabel: '완료',
    companyId: 'sy-inc',
    teamId: 'nursing',
    doneCount: 5,
    totalCount: 5,
    dueDate: '2026-05-09',
    members: [
      { name: '최현우', done: true },
      { name: '정아영', done: true },
      { name: '한소희', done: true },
      { name: '윤채원', done: true },
      { name: '오지현', done: true },
    ],
  },
  {
    id: 'todo-4',
    type: 'todo',
    status: '진행중',
    title: '5월 법정의무교육 이수 확인',
    date: 'D-19',
    dueLabel: 'D-19',
    companyId: 'hospital-a',
    teamId: 'admin',
    doneCount: 2,
    totalCount: 6,
    dueDate: '2026-05-31',
    members: [
      { name: '이수진', done: true },
      { name: '박민수', done: true },
      { name: '최현우', done: false },
      { name: '정아영', done: false },
      { name: '한소희', done: false },
      { name: '오지현', done: false },
    ],
  },
  {
    id: 'todo-5',
    type: 'todo',
    status: '완료',
    title: '4월 근태 데이터 인사팀 제출',
    date: '05/05',
    dueLabel: '완료',
    companyId: 'hospital-a',
    teamId: 'admin',
    doneCount: 4,
    totalCount: 4,
    dueDate: '2026-05-05',
    members: [
      { name: '이수진', done: true },
      { name: '박민수', done: true },
      { name: '윤채원', done: true },
      { name: '오지현', done: true },
    ],
  },
];

// ── 탭별 카운트 헬퍼 ──────────────────────────────────────────────────────────

export const TAB_COUNTS: Record<TabId, number> = {
  docs:     DUMMY_DOCS.length,
  handover: DUMMY_HANDOVERS.length,
  todo:     DUMMY_TODOS.filter((t) => t.status !== '완료').length,
};

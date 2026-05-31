// MSO 모바일 — 메뉴별 더미 데이터
window.MSM = (function () {
  const me = { name: '백정민', initials: '백', role: '이사 · 경영지원팀', empno: 2, joined: '2023.08.01', tenure: '3년차' };

  const quick = [
    { id: 'attend', lbl: '출퇴근', icon: 'clock', tone: 'accent' },
    { id: 'leave', lbl: '연차', icon: 'calendar', tone: 'success' },
    { id: 'payslip', lbl: '급여명세', icon: 'won', tone: 'warn' },
    { id: 'cert', lbl: '증명서', icon: 'file', tone: 'muted' },
    { id: 'approval', lbl: '전자결재', icon: 'checkCircle', tone: 'accent', n: 3 },
    { id: 'stock', lbl: '재고', icon: 'package', tone: 'success' },
    { id: 'org', lbl: '조직도', icon: 'users', tone: 'muted' },
    { id: 'more', lbl: '추가기능', icon: 'plusBox', tone: 'muted' },
  ];

  const homeStats = [
    { id: 'att', ic: 'clock', tone: 'accent', v: '1/4', l: '이번 달 지각' },
    { id: 'leave', ic: 'calendar', tone: 'success', v: '11일', l: '잔여 연차' },
  ];

  // 채팅 대화 (SY INC. 경영지원)
  const thread = {
    room: 'SY INC. 경영지원', members: 4, tone: '#F59E0B',
    msgs: [
      { type: 'date', t: '5월 11일 (월)' },
      { type: 'in', who: '박유진', av: '박', avtone: '#2563EB', text: '오늘 신규 입사자 이력서 정리해서 올렸어요. 확인 부탁드려요.', time: '09:18' },
      { type: 'out', text: '네, 지금 볼게요. 면접 일정도 같이 잡으면 좋겠네요.', time: '09:19' },
      { type: 'in', who: '박유진', av: '박', avtone: '#2563EB', text: '금일 오후 1시 면접 가능하실까요?', time: '09:20' },
      { type: 'out', text: '가능합니다. 3층 회의실 잡아둘게요.', time: '09:22' },
      { type: 'sys', t: '이지나 님이 대화방에 참여했습니다.' },
      { type: 'in', who: '이지나', av: '이', avtone: '#10B981', text: '안녕하세요! 잘 부탁드립니다 🙇', time: '09:24' },
      { type: 'out', text: '환영합니다 👋 첫 출근일은 5월 15일로 잡았습니다.', time: '09:25' },
    ],
  };

  // 채팅
  const chats = [
    { id: 'c1', name: 'SY INC. 경영지원', members: 4, last: '박유진: 이력서 받으세요', time: '09:24', unread: 4, fixed: true, tone: '#F59E0B' },
    { id: 'c2', name: '박철홍정형외과', members: 14, last: '김지오: 오늘 OP 일정 변경됐어요', time: '08:51', unread: 1, tone: '#2563EB' },
    { id: 'c3', name: '수술팀1', members: 6, last: 'op체크 다시 해봤는데 오후 1시', time: '어제', unread: 2, tone: '#10B981' },
    { id: 'c4', name: '병동팀1', members: 5, last: '넵 알겠습니다', time: '어제', unread: 0, tone: '#8B5CF6' },
    { id: 'c5', name: '김지오', dm: true, last: '두분 같이 사무실로 오세요', time: '2일', unread: 0, initials: '김' },
    { id: 'c6', name: '이나림', dm: true, last: '부장님 어제 말씀 드린 외래…', time: '3일', unread: 0, initials: '이' },
    { id: 'c7', name: '박유진', dm: true, last: '식당 근무표 5월.xlsx', time: '5/8', unread: 0, initials: '박' },
  ];

  // 전자결재
  const approvalStats = { mine: 3, approved: 2, rejected: 1, avg: '14시간' };
  const approvals = [
    { id: 'a1', cat: '연차신청', title: '연차신청 · 2일 (5/20~21)', author: '박유진', date: '2026.5.11', status: 'pending', step: '2/3' },
    { id: 'a2', cat: '물품신청', title: '외래팀 의료기기 물품신청 (PSA 1대)', author: '이나림', date: '2026.5.10', status: 'pending', step: '2/3', urgent: true },
    { id: 'a3', cat: '수리요청서', title: '2층 외래 데스크탑 PC 수리요청서', author: '홍자비', date: '2026.5.8', status: 'pending', step: '1/3' },
    { id: 'a4', cat: '업무기안', title: '5월 OP 일정 공유 및 인계', author: '김지오', date: '2026.5.10', status: 'done', step: '3/3' },
    { id: 'a5', cat: '연차계획서', title: '2026년 상반기 연차계획서', author: '송소현', date: '2026.5.8', status: 'done', step: '3/3' },
    { id: 'a6', cat: '출결정정', title: '5/2(금) 출근 08:30 출결정정', author: '백민', date: '2026.5.9', status: 'rejected', step: '반려' },
  ];
  const APV_STATUS = { pending: { lbl: '결재 대기', tone: 'warn' }, done: { lbl: '완료', tone: 'success' }, rejected: { lbl: '반려', tone: 'danger' } };

  // 게시판 종류
  const boards = [
    { id: 'notice', name: '공지사항', sub: '신규 메신저 출·퇴근 기능 안내', icon: 'bell', tone: 'warn', n: 2 },
    { id: 'free', name: '자유게시판', sub: '점심 같이 드실 분~', icon: 'chat', tone: 'success', n: 3 },
    { id: 'family', name: '경조사 소식', sub: '박지영 사원 결혼 (5/25)', icon: 'bookmark', tone: 'danger', n: 1 },
    { id: 'op', name: '수술 일정', sub: '오늘 수술 1건', icon: 'calendar', tone: 'danger', n: 1 },
    { id: 'mri', name: 'MRI 일정', sub: '예약 9건', icon: 'calendar', tone: 'accent', n: 0 },
    { id: 'share', name: '업무가이드', sub: '자료·인수인계·팀 할일', icon: 'fileText', tone: 'accent', n: 6 },
  ];

  // 추가기능 — 모듈 허브 (PC 12 모듈)
  const allMenus = [
    { group: '진료 지원', items: [
      { id: 'note', lbl: '인계노트', icon: 'fileText', tone: 'accent' },
      { id: 'consult', lbl: '수술상담', icon: 'chat', tone: 'success' },
      { id: 'opcheck', lbl: 'OP체크', icon: 'checkCircle', tone: 'accent' },
      { id: 'discharge', lbl: '퇴원심사', icon: 'fileText', tone: 'warn' },
    ]},
    { group: '운영', items: [
      { id: 'org', lbl: '조직도', icon: 'users', tone: 'accent' },
      { id: 'work', lbl: '근무현황', icon: 'clock', tone: 'success' },
      { id: 'dept', lbl: '부서별재고', icon: 'package', tone: 'warn' },
      { id: 'parking', lbl: '주차관제', icon: 'shield', tone: 'muted' },
    ]},
    { group: '정산·문서', items: [
      { id: 'deposit', lbl: '입금조회', icon: 'won', tone: 'accent' },
      { id: 'closing', lbl: '마감보고', icon: 'fileText', tone: 'warn' },
      { id: 'eval', lbl: '직원평가', icon: 'star', tone: 'accent' },
      { id: 'fax', lbl: '웹팩스', icon: 'send', tone: 'muted' },
    ]},
  ];

  // 인사관리 — 급여 워크센터 요약
  const payroll = {
    month: '2026년 5월', stage: '3/4 단계', total: '128,450,000', delta: '+2.1%', headcount: 27,
    steps: [{ l: '근태 마감', done: true }, { l: '수당·공제', done: true }, { l: '결재 상신', done: true }, { l: '지급 처리', done: false, cur: true }, { l: '원천징수', done: false }],
    stats: [
      { v: '27명', l: '정산 대상자' }, { v: '4,632h', l: '총 근로시간' },
      { v: '94.2M', l: '기본급 합계' }, { v: '22.1M', l: '수당' },
    ],
  };

  // 재고관리
  const stockStats = [
    { v: '847종', l: '전체 품목', tone: 'accent' }, { v: '23건', l: '부족 품목', tone: 'warn' },
    { v: '4건', l: '재고 0', tone: 'danger' }, { v: '8건', l: '유효기간 임박', tone: 'warn' },
  ];
  const stockItems = [
    { nm: '라텍스 장갑 (S)', cat: '의료소모품 · MSO 본사', qty: '14 BOX', state: '부족', tone: 'warn' },
    { nm: '멸그루브 18cm', cat: '의료소모품 · 외래팀', qty: '0 EA', state: '재고 0', tone: 'danger' },
    { nm: '주사 바늘 23G', cat: '의료소모품 · MSO 본사', qty: '42 BOX', state: '정상', tone: 'success' },
    { nm: '알코올 솔션 500ml', cat: '약품 · 병동팀', qty: '5 병', state: '부족', tone: 'warn' },
    { nm: 'CT 조영제', cat: '약품 · 촬영실', qty: '12 병', state: '유효기간', tone: 'warn' },
  ];

  // 관리자 — 경영 대시보드
  const adminKpi = [
    { v: '182.4M', l: '5월 매출', sub: '전월 +4.2%', tone: 'accent' },
    { v: '128.7M', l: '5월 비용', sub: '인건비 94M', tone: 'warn' },
    { v: '53.7M', l: '영업이익', sub: '이익률 29.4%', tone: 'success' },
    { v: '1,284명', l: '방문 환자', sub: '신규 142', tone: 'accent' },
  ];

  return { me, quick, homeStats, chats, thread, approvalStats, approvals, APV_STATUS, boards, allMenus, payroll, stockStats, stockItems, adminKpi };
})();

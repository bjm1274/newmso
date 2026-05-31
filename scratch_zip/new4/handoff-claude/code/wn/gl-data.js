// 업무공유 (GuideLibrary) — shared dummy data + helpers
// Mirrors redesign/feature-guide.jsx + app/main/기능부품/게시판서브/업무가이드.tsx

window.GL = (function () {
  const COMPANIES = [
    { id: 'co1', name: '박철홍정형외과', divisions: [
      { name: '진료부', teams: [
        { key: 't1', name: '진료팀', members: 4 },
        { key: 't2', name: '외래팀', members: 6 },
        { key: 't3', name: '병동팀', members: 8 },
        { key: 't4', name: '검사팀', members: 3 },
      ]},
      { name: '경영지원부', teams: [
        { key: 't5', name: '경영지원팀', members: 4 },
        { key: 't6', name: '영양팀', members: 2 },
      ]},
    ]},
    { id: 'co2', name: '수연의원', divisions: [
      { name: '진료부', teams: [{ key: 't7', name: '외래팀', members: 5 }, { key: 't8', name: '병동팀', members: 6 }] },
      { name: '경영지원부', teams: [{ key: 't9', name: '경영지원팀', members: 3 }] },
    ]},
    { id: 'co3', name: 'MSO 본사', divisions: [
      { name: '본부', teams: [{ key: 't10', name: '운영팀', members: 4 }, { key: 't11', name: 'IT팀', members: 3 }] },
    ]},
  ];

  const RESOURCES = [
    { id: 'r1', team: 't2', kind: 'education', audience: 'new_hire', title: '외래 접수 응대 매뉴얼 v2.4',
      desc: '환자 접수 시 본인 확인 → 보험 확인 → 진료 카테고리 분류 순서로 응대합니다. 첫인사 멘트와 자주 묻는 질문 16종 포함.',
      keywords: ['접수', '응대', '매뉴얼'], author: '김지오', date: '2026-05-08 14:22', attach: 3 },
    { id: 'r2', team: 't2', kind: 'education', audience: 'all_staff', title: '환자 등록 시스템 단축키 모음',
      desc: 'EMR 환자 등록·검색·차트 열람에 자주 쓰는 단축키 20종. F5는 새로고침이 아니라 진료 시작입니다.',
      keywords: ['단축키', 'EMR', '속도'], author: '지민수', date: '2026-05-06 11:00', attach: 1 },
    { id: 'r3', team: 't2', kind: 'handover', audience: 'current_staff', title: '5월 2주차 외래 인수인계',
      desc: '주말 동안 미응대 콜 12건. 박OO 환자 재진료 예약 5/13 10:30. MRI 결과지 출력 누락 건 확인 필요.',
      keywords: ['주간인계', '콜', 'MRI'], author: '박지영', date: '2026-05-11 18:30', attach: 0 },
    { id: 'r4', team: 't2', kind: 'education', audience: 'new_hire', title: '보험 청구 코드 빠른 참조표',
      desc: '정형외과 외래에서 가장 자주 쓰는 청구 코드 80개. 출력해서 책상 옆에 붙여두면 좋습니다.',
      keywords: ['청구', '보험', '코드'], author: '김지오', date: '2026-04-29 09:18', attach: 2 },
    { id: 'r5', team: 't2', kind: 'handover', audience: 'all_staff', title: '5월 1주차 외래 인수인계',
      desc: '장기 미수금 환자 3명 (송OO, 박OO, 곽OO). 안내 우선순위는 송OO부터.',
      keywords: ['주간인계', '미수금'], author: '박지영', date: '2026-05-04 18:00', attach: 0 },
    { id: 'r6', team: 't2', kind: 'education', audience: 'current_staff', title: '전자 동의서 흐름 변경 안내',
      desc: '5/15부터 종이 동의서는 폐지됩니다. 태블릿으로 환자 본인 서명 후 자동 PDF 저장됩니다.',
      keywords: ['전자동의서', '태블릿', 'PDF'], author: '지민수', date: '2026-05-10 16:00', attach: 1 },
  ];

  const TASKS = [
    { id: 'k2', team: 't2', title: '5월 외래 미수금 3건 안내 콜', priority: 'urgent', due: '2026-05-13', done: false, author: '박지영', note: '송OO 우선' },
    { id: 'k1', team: 't2', title: 'EMR 신규 단축키 5종 전원 교육', priority: 'high', due: '2026-05-15', done: false, author: '김지오', note: '화요일 점심시간 15분' },
    { id: 'k3', team: 't2', title: '태블릿 전자동의서 동선 리허설', priority: 'medium', due: '2026-05-14', done: false, author: '지민수', note: '박철홍 원장 시연 후 진행' },
    { id: 'k4', team: 't2', title: '4월 응대 클레임 회고록 정리', priority: 'low', due: '2026-05-20', done: true, author: '김지오', note: '완료 — 인계함에 첨부' },
    { id: 'k5', team: 't2', title: '주차장 도색 안내문 게시', priority: 'medium', due: '2026-05-12', done: true, author: '박지영', note: '완료 — 정문/후문 모두 부착' },
  ];

  const KIND_LABEL = { education: '업무자료', handover: '인수인계' };
  const AUD_LABEL = { new_hire: '신규직원', current_staff: '기존직원', all_staff: '전체직원' };
  const PRI = {
    urgent: { lbl: '긴급', tone: 'danger' },
    high: { lbl: '높음', tone: 'warn' },
    medium: { lbl: '보통', tone: 'accent' },
    low: { lbl: '낮음', tone: 'muted' },
  };

  function teamResCount(key) { return RESOURCES.filter(r => r.team === key).length; }
  function teamTaskCount(key) { return TASKS.filter(t => t.team === key && !t.done).length; }

  // relative date label
  function rel(dateStr) {
    const d = new Date(dateStr.replace(' ', 'T'));
    const now = new Date('2026-05-12T10:00:00');
    const days = Math.floor((now - d) / 86400000);
    if (days <= 0) return '오늘';
    if (days === 1) return '어제';
    if (days < 7) return days + '일 전';
    return dateStr.slice(5, 10).replace('-', '.');
  }

  return { COMPANIES, RESOURCES, TASKS, KIND_LABEL, AUD_LABEL, PRI, teamResCount, teamTaskCount, rel };
})();

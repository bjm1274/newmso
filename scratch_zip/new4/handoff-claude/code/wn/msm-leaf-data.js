// MSO 모바일 — 세부메뉴 트리 + Leaf 상세 스펙 (PC 메뉴 기준)
// 구조: 허브 = 상위 메뉴 / 상위 메뉴 = 탭(하위메뉴) / 행·버튼 = 상세·폼 드릴다운
(function () {
  // ════════ 상위 메뉴 (PC SUBMENUS 기준) ════════
  window.HR_TREE = [{ group: '인사관리 메뉴', items: [
    { id: 'hr-member', label: '구성원', icon: 'users', tone: 'accent', sub: '구성원 리스트 · 인사발령 · 교육·자격', badge: '27명', bt: 'muted' },
    { id: 'hr-attend', label: '근태', icon: 'clock', tone: 'success', sub: '대시보드 · 근무표 편성 · 달력' },
    { id: 'hr-leave', label: '연차·휴가', icon: 'calendar', tone: 'accent', sub: '잔여 · 신청 · 소멸 알림 · 계획서' },
    { id: 'hr-payroll', label: '급여 워크센터', icon: 'won', tone: 'warn', sub: '정산 · 대장 · 4대보험 외 13종', badge: '정산 중', bt: 'warn' },
    { id: 'hr-welfare', label: '복지', icon: 'star', tone: 'accent', sub: '경조사 · 건강검진 · 면허·자격 · 의료기기' },
    { id: 'hr-docs', label: '계약·문서', icon: 'fileText', tone: 'muted', sub: '계약 현황 · 자동생성 · 문서함 · 증명서 · 제출' },
  ] }];

  window.STOCK_TREE = [{ group: '재고관리 메뉴', items: [
    { id: 'st-status', label: '재고 현황', icon: 'package', tone: 'accent', sub: '현황 · 내 부서 · 알림 · 유효기간', badge: '부족 23', bt: 'warn' },
    { id: 'st-io', label: '입출고·발주', icon: 'arrowDown', tone: 'success', sub: '입출고 · 발주 · 거래처 · 명세서 · 납품확인', badge: '발주 3', bt: 'warn' },
    { id: 'st-item', label: '물품·자산', icon: 'plusBox', tone: 'accent', sub: '물품등록 · 카테고리 · 자산 · QR · UDI' },
    { id: 'st-analyze', label: '분석·마감', icon: 'bar', tone: 'muted', sub: 'ABC · 수요예측 · 실사 · 월마감 · 통계 · AS' },
  ] }];

  window.ADMIN_TREE = [{ group: '관리자 메뉴', items: [
    { id: 'ad-exec', label: '경영 대시보드', icon: 'bar', tone: 'accent', sub: '매출 · 재무 · 예산 · 보고서 · 법인 손익' },
    { id: 'ad-master', label: '시스템 마스터', icon: 'shield', tone: 'danger', sub: '변경이력 · 권한변경 · 정합성 · 복구', badge: '병원장 전용', bt: 'danger' },
    { id: 'ad-company', label: '회사 관리', icon: 'hr', tone: 'accent', sub: '기본정보 · 근무형태 · 법인카드 · 급여기준' },
    { id: 'ad-roles', label: '권한 관리', icon: 'shield', tone: 'warn', sub: '역할 6종 · 권한 매트릭스', badge: '요청 2', bt: 'warn' },
    { id: 'ad-ops', label: '운영 설정', icon: 'plusBox', tone: 'muted', sub: '운영 설정 · 템플릿 · 팝업 관리' },
    { id: 'ad-forms', label: '결재 양식', icon: 'fileText', tone: 'muted', sub: '양식 12종 관리·편집' },
    { id: 'ad-audit', label: '감사·백업', icon: 'alertTri', tone: 'muted', sub: '감사센터 · 백업 · 이상치 검사' },
  ] }];

  // 구성원 행 데이터 (인사카드 드릴다운용)
  var MEMBERS = [
    { av: '박철홍', nm: '박철홍', badge: '병원장', bt: 'success', sub: '진료부 · 진료팀 · 8년 2개월', val: '정규직', vTone: 'success', p: { name: '박철홍', code: 'HR-0001', dept: '진료부 · 진료팀', pos: '병원장', employ: '정규직', tenure: '8년 2개월', join: '2018.03.02' } },
    { av: '김지오', nm: '김지오', badge: '간호부장', bt: 'success', sub: '간호부 · 병동팀 · 5년 11개월', val: '정규직', vTone: 'success', p: { name: '김지오', code: 'HR-0007', dept: '간호부 · 병동팀', pos: '간호부장', employ: '정규직', tenure: '5년 11개월', join: '2020.06.15' } },
    { av: '박유진', nm: '박유진', badge: '수석', bt: 'accent', sub: '경영지원팀 · 2년 4개월', val: '정규직', vTone: 'success', p: { name: '박유진', code: 'HR-0019', dept: '경영지원팀', pos: '수석', employ: '정규직', tenure: '2년 4개월', join: '2024.01.16' } },
    { av: '송소현', nm: '송소현', badge: '간호사', bt: 'muted', sub: '간호부 · 외래팀 · 1년 2개월', val: '계약직', vTone: 'accent', p: { name: '송소현', code: 'HR-0024', dept: '간호부 · 외래팀', pos: '간호사', employ: '계약직', tenure: '1년 2개월', join: '2025.03.10' } },
    { av: '오민호', nm: '오민호', badge: '간호사', bt: 'muted', sub: '간호부 · 수술팀 · 11개월', val: '수습', vTone: 'warn', p: { name: '오민호', code: 'HR-0026', dept: '간호부 · 수술팀', pos: '간호사', employ: '수습', tenure: '11개월', join: '2025.06.20' } },
    { av: '이가연', nm: '이가연', badge: '간호사', bt: 'muted', sub: '간호부 · 외래팀 · 3년 1개월', val: '정규직', vTone: 'success', p: { name: '이가연', code: 'HR-0015', dept: '간호부 · 외래팀', pos: '간호사', employ: '정규직', tenure: '3년 1개월', join: '2023.04.12' } },
  ].map(function (m) { return { av: m.av, nm: m.nm, badge: m.badge, bt: m.bt, sub: m.sub, val: m.val, vBadge: true, vTone: m.vTone, nav: 'hr-member-card', params: m.p }; });

  window.LEAF = {
    // ════════ 인사관리 ════════
    'hr-member': { tabs: [
      { label: '구성원', cnt: 27, blocks: [
        { kpis: [['users', 'accent', '전체 인원', '정규 22·계약 4·수습 1', '27', '명'], ['users', 'success', '신규 입사', '3개월', '2', '명'], ['clock', 'warn', '퇴사 예정', '60일', '1', '명', true], ['star', 'accent', '평균 근속', '신규 11개월', '4.2', '년']] },
        { btns: [{ t: '신규 직원 등록', ic: 'plus', primary: true, nav: 'hr-member-new' }] },
        { chips: ['전체 27', '진료부 6', '간호부 14', '경영지원 5', '수습 1'] },
        { sec: '구성원', more: '탭하여 인사카드', list: MEMBERS },
      ] },
      { label: '인사발령', cnt: 3, blocks: [
        { btns: [{ t: '새 발령 등록', ic: 'plus', primary: true, nav: 'hr-appoint-new' }] },
        { sec: '인사발령 (5월)', list: [
          { av: '송소현', nm: '송소현', badge: '부서이동', bt: 'accent', sub: '외래팀 → 병동팀 · 5/15', val: '예정', vBadge: true, vTone: 'warn' },
          { av: '박유진', nm: '박유진', badge: '승진', bt: 'success', sub: '책임 → 수석 · 5/10', val: '완료', vBadge: true, vTone: 'success' },
          { av: '홍자비', nm: '홍자비', badge: '직무변경', bt: 'muted', sub: '원무 → 경영지원 · 5/3', val: '완료', vBadge: true, vTone: 'success' },
        ] },
      ] },
      { label: '교육·자격', cnt: 12, blocks: [
        { kpis: [['checkCircle', 'success', '교육 이수', '이번 분기', '8', '건'], ['alertTri', 'warn', '자격 갱신 임박', 'D-30 이내', '2', '명', true]] },
        { btns: [{ t: '교육 등록', ic: 'plus', primary: true, nav: 'hr-edu-new' }] },
        { sec: '법정·직무 교육', list: [
          { ic: 'star', tone: 'success', nm: '감염관리 교육', badge: '이수', bt: 'success', sub: '간호부 18명', val: '완료' },
          { ic: 'star', tone: 'accent', nm: '의료법규 정기교육', badge: '진행', bt: 'accent', sub: '전직원 22/27', val: '81%' },
          { ic: 'star', tone: 'warn', nm: 'CPR 재인증', badge: '예정', bt: 'warn', sub: '수술팀 4명', val: '5/28' },
        ] },
        { sec: '면허·자격', list: [
          { ic: 'shield', tone: 'warn', nm: '간호사 면허', badge: '갱신임박', bt: 'warn', sub: '이가연·정해린', val: 'D-30' },
          { ic: 'shield', tone: 'muted', nm: '간호사 면허', badge: '유효', bt: 'success', sub: '16명', val: '정상' },
        ] },
      ] },
    ] },
    'hr-attend': { tabs: [
      { label: '대시보드', blocks: [
        { kpis: [['checkCircle', 'success', '정상 출근', '오늘', '22', '명'], ['clock', 'warn', '지각', '홍자비 외 1', '2', '명'], ['alertTri', 'danger', '결근', '무단 0', '0', '명'], ['calendar', 'accent', '연차/외출', '근무 외', '3', '명']] },
        { sec: '오늘 출근 현황', list: [
          { av: '김지오', nm: '김지오', badge: '간호부장', bt: 'muted', sub: '08:42 출근', val: '정상', vBadge: true, vTone: 'success' },
          { av: '홍자비', nm: '홍자비', badge: '주임', bt: 'muted', sub: '09:18 출근', val: '지각', vBadge: true, vTone: 'warn' },
          { av: '이나림', nm: '이나림', badge: '수간호사', bt: 'muted', sub: '09:24 출근', val: '지각', vBadge: true, vTone: 'warn' },
          { av: '백정민', nm: '백정민', badge: '이사', bt: 'muted', sub: '08:30 출근', val: '정상', vBadge: true, vTone: 'success' },
        ] },
        { note: { tone: 'warn', t: '근태이상 3건 감지', s: '지각·조퇴·연속야간 자동 분석' } },
        { sec: '근태이상 감지', list: [
          { av: '홍자비', nm: '홍자비', badge: '지각 3회', bt: 'warn', sub: '5/2·5/7·5/11' },
          { av: '조현준', nm: '조현준', badge: '연속야간 4일', bt: 'danger', sub: '근로기준 점검 필요' },
        ] },
      ] },
      { label: '근무표 편성', cnt: 'AI·3교대', blocks: [
        { sec: '팀별 근무표 (5월)', more: '＋ AI 생성', prog: [
          { nm: '외래팀 근무표', sub: '확정 · 6명', p: 100, bt: 'success', ic: 'calendar' },
          { nm: '병동팀 근무표', sub: '편성 중 · 8명', p: 62, bt: 'warn', ic: 'calendar' },
          { nm: '수술팀 근무표', sub: '확정 · 4명', p: 100, bt: 'success', ic: 'calendar' },
          { nm: '검사팀 근무표', sub: '미편성 · 3명', p: 0, bt: 'danger', ic: 'calendar' },
        ] },
        { sec: '3교대 자동 배정', shift: [
          { b: 'Day', bt: 'accent', t: '08:30–17:30', n: 12, staff: ['김지오', '이은혜', '박지영', '최찬'] },
          { b: 'Evening', bt: 'warn', t: '14:30–22:30', n: 5, staff: ['윤서연', '임소현'] },
          { b: 'Night', bt: 'violet', t: '22:00–07:00', n: 3, staff: ['한지수'] },
        ] },
        { btns: [{ t: 'AI 자동 편성 실행', ic: 'refresh', primary: true }] },
      ] },
      { label: '달력', blocks: [
        { cal: { holidays: [5, 24] } },
        { list: [
          { ic: 'calendar', tone: 'muted', nm: '근무일', sub: '평일 21 · 주말 8', val: '29일' },
          { ic: 'calendar', tone: 'danger', nm: '공휴일', sub: '어린이날·부처님오신날', val: '2일', vBadge: true, vTone: 'danger' },
          { ic: 'calendar', tone: 'accent', nm: '내 근무', sub: '주간 21 · 야간 0', val: '21일' },
        ] },
      ] },
    ] },
    'hr-leave': { tabs: [
      { label: '잔여', blocks: [
        { hero: { tone: 'green', label: '2026년 팀 평균 잔여 연차', big: '11', unit: '/ 15일', sub: '소진율 27% · 소멸 임박 2명' } },
        { sec: '직원별 잔여 연차', list: [
          { av: '박철홍', nm: '박철홍', sub: '사용 1일 / 15일', val: '14일' },
          { av: '김지오', nm: '김지오', sub: '사용 6일 / 15일', val: '9일' },
          { av: '박유진', nm: '박유진', sub: '사용 4일 / 15일', val: '11일' },
          { av: '이가연', nm: '이가연', sub: '사용 8일 / 15일', val: '7일' },
        ] },
      ] },
      { label: '신청 내역', blocks: [
        { sec: '신청 내역', list: [
          { av: '박유진', nm: '박유진 · 연차', sub: '5/20-21 · 2일', val: '결재중', vBadge: true, vTone: 'warn' },
          { av: '송소현', nm: '송소현 · 연차', sub: '5/13 · 1일', val: '승인', vBadge: true, vTone: 'success' },
          { av: '이가연', nm: '이가연 · 반차', sub: '5/9 · 0.5일', val: '승인', vBadge: true, vTone: 'success' },
        ] },
      ] },
      { label: '소멸 알림', cnt: 2, blocks: [
        { note: { tone: 'warn', t: '소멸 임박 2명', s: '6월 말 소멸 예정 연차' } },
        { sec: '소멸 예정', list: [
          { av: '이가연', nm: '이가연', sub: '6/30 소멸', val: '3일', vBadge: true, vTone: 'warn' },
          { av: '조현준', nm: '조현준', sub: '6/30 소멸', val: '2일', vBadge: true, vTone: 'warn' },
        ] },
        { btns: [{ t: '소멸 알림 발송', ic: 'send', primary: true }] },
      ] },
      { label: '계획서', blocks: [
        { sec: '상반기 연차 계획서', more: '제출 20/27', list: [
          { av: '박유진', nm: '박유진', sub: '7월 2주 가족여행', val: '제출', vBadge: true, vTone: 'success' },
          { av: '송소현', nm: '송소현', sub: '8월 1주', val: '제출', vBadge: true, vTone: 'success' },
          { av: '홍자비', nm: '홍자비', sub: '미제출', val: '미제출', vBadge: true, vTone: 'danger' },
        ] },
      ] },
    ] },
    'hr-payroll': { blocks: [
      { hero: { tone: 'dark', label: '5월 급여 정산 · 3/4단계', big: '128.4M', unit: '원', sub: '대상 27명 · 전월 대비 +1.8%' } },
      { stat: [['근태마감', '완료', 'success'], ['수당 반영', '완료', 'success'], ['지급 처리', '대기', 'warn'], ['이체', '예정', 'muted']] },
      { sec: '세부 메뉴', more: '14종 · 탭하여 실행', list: [
        { ic: 'won', tone: 'warn', nm: '급여 정산', sub: '월별 정산 워크플로', val: '진행 중', nav: 'pay-settle' },
        { ic: 'fileText', tone: 'muted', nm: '급여 대장', sub: '월별 직원별 내역', val: '열람', nav: 'pay-ledger' },
        { ic: 'bar', tone: 'accent', nm: '급여 시뮬레이터', sub: '예상 지급액 계산', val: '실행', nav: 'pay-sim' },
        { ic: 'won', tone: 'muted', nm: '퇴직 정산', sub: '퇴직금 계산·중간정산', val: '계산', nav: 'pay-retire' },
        { ic: 'won', tone: 'muted', nm: '퇴직연금', sub: 'DC 19 · DB 8', val: '27명', nav: 'pay-pension' },
        { ic: 'shield', tone: 'warn', nm: '4대보험', sub: 'EDI 신고·요율', val: '5/22', nav: 'pay-4ins' },
        { ic: 'fileText', tone: 'warn', nm: '원천징수', sub: '신고·연말정산', val: '5/20', nav: 'pay-withhold' },
        { ic: 'users', tone: 'muted', nm: '임금피크제', sub: '적용 대상·감액률', val: '1명', nav: 'pay-peak' },
        { ic: 'alertTri', tone: 'danger', nm: '최저임금 점검', sub: '2026 미달 자동 경고', val: '2건', vBadge: true, vTone: 'danger', nav: 'pay-minwage' },
        { ic: 'bar', tone: 'muted', nm: '시급직 환산 검토', sub: '환산 시급 vs 최저임금', val: '검토', nav: 'pay-hourly' },
        { ic: 'checkCircle', tone: 'success', nm: '비과세 점검', sub: '식대·교통비 한도', val: '정상', nav: 'pay-nontax' },
        { ic: 'bar', tone: 'muted', nm: '통상임금 계산기', sub: '시급·법정수당 계산', val: '계산', nav: 'pay-ordinary' },
        { ic: 'alertTri', tone: 'danger', nm: '미지급 수당 점검', sub: '야간·휴일·연장', val: '1건', vBadge: true, vTone: 'danger', nav: 'pay-unpaid' },
        { ic: 'won', tone: 'muted', nm: '무급결근 차감', sub: '일할 차감 규칙', val: '0원', nav: 'pay-deduct' },
      ] },
    ] },
    'pay-settle': { title: '급여 정산', blocks: [
      { hero: { tone: 'dark', label: '2026년 5월 급여 정산', big: '128.4M', unit: '원', sub: '대상 27명 · 전월 126.1M (+1.8%)' } },
      { sec: '① 정산 대상 선택', chips: ['전체 27', '진료부 6', '간호부 14', '경영지원 5'] },
      { kv: [{ l: '정산 연월', v: '2026-05' }, { l: '정산 대상', v: '27명 선택' }, { l: '근태 마감', v: '완료', tone: 'success' }] },
      { sec: '② 정산 진행', prog: [
        { nm: '1. 근태 마감', sub: '27/27명', p: 100, bt: 'success', ic: 'checkCircle' },
        { nm: '2. 수당·공제 반영', sub: '완료', p: 100, bt: 'success', ic: 'checkCircle' },
        { nm: '3. 지급 처리', sub: '승인 대기', p: 40, bt: 'warn', ic: 'won' },
        { nm: '4. 계좌 이체', sub: '예정 5/25', p: 0, bt: 'danger', ic: 'send' },
      ] },
      { sec: '③ 직원별 정산 명세', more: '탭하여 명세서', list: [
        { av: '김지오', nm: '김지오 · 간호부장', sub: '간호부 · 병동팀 · 근무 21일', val: '4.3M', nav: 'pay-payslip', params: { name: '김지오' } },
        { av: '이가연', nm: '이가연 · 간호사', sub: '간호부 · 외래팀 · 근무 20일', val: '3.0M', nav: 'pay-payslip', params: { name: '이가연' } },
      ] },
      { sec: '정산 합계 (27명)', kv: [
        { l: '과세 급여', v: '111,240,000원' },
        { l: '비과세 급여', v: '12,400,000원' },
        { l: '공제 합계 (4대보험·세금)', v: '-12,400,000원', tone: 'danger' },
        { l: '실지급 합계', v: '128,400,000원', strong: true, tone: 'accent' },
      ] },
      { btns: [{ t: '확정', ic: 'check', primary: true }, { t: '임시저장', ic: 'fileText' }] },
    ] },
    'pay-payslip': { title: '급여 명세서', build: function (p) { return [
      { profile: { av: p.name, nm: p.name, role: '2026년 5월 · 간호부 · 병동팀', chips: [{ t: '확정 전', tone: 'warn' }] } },
      { sec: '지급 항목', kv: [
        { l: '기본급', v: '4,000,000원' },
        { l: '직책수당', v: '300,000원' },
        { l: '식대', v: '200,000원', note: '비과세' },
        { l: '총 지급액', v: '4,500,000원', strong: true, tone: 'accent' },
      ] },
      { sec: '공제 항목', kv: [
        { l: '국민연금', note: '4.75%', v: '204,250원' },
        { l: '건강보험', note: '3.595%', v: '154,585원' },
        { l: '장기요양보험', note: '0.4724%', v: '20,313원' },
        { l: '고용보험', note: '0.9%', v: '38,700원' },
        { l: '소득세(간이)', v: '142,220원' },
        { l: '지방소득세', v: '14,220원' },
        { l: '공제 합계', v: '574,288원', strong: true, tone: 'danger' },
      ] },
      { kv: [{ l: '차인지급액 (실수령)', v: '3,925,712원', strong: true, tone: 'accent' }] },
      { btns: [{ t: '명세서 PDF', ic: 'fileText', primary: true }, { t: '직원 발송', ic: 'send' }] },
    ]; } },
    'pay-ledger': { title: '급여 대장', blocks: [
      { kpis: [['won', 'accent', '5월 총지급', '대상 27명', '128.4', 'M'], ['won', 'muted', '평균 실수령', '세후', '3.44', 'M']] },
      { sec: '직원별 급여 대장', more: '근무일·지급·공제·차인지급', list: [
        { av: '박철홍', nm: '박철홍', sub: '근무 21일 · 비과세 200K · 과세 6.6M', val: '5.9M', nav: 'pay-payslip', params: { name: '박철홍' } },
        { av: '김지오', nm: '김지오', sub: '근무 21일 · 비과세 200K · 과세 4.3M', val: '4.3M', nav: 'pay-payslip', params: { name: '김지오' } },
        { av: '박유진', nm: '박유진', sub: '근무 21일 · 비과세 200K · 과세 4.0M', val: '3.7M', nav: 'pay-payslip', params: { name: '박유진' } },
        { av: '이가연', nm: '이가연', sub: '근무 20일 · 비과세 200K · 과세 3.2M', val: '3.0M', nav: 'pay-payslip', params: { name: '이가연' } },
        { av: '송소현', nm: '송소현', sub: '근무 19일 · 비과세 200K · 과세 2.8M', val: '2.7M', nav: 'pay-payslip', params: { name: '송소현' } },
      ] },
      { kv: [{ l: '총 지급액 합계', v: '128,400,000원', strong: true, tone: 'accent' }] },
      { btns: [{ t: '대장 내보내기 (CSV)', ic: 'arrowDown', primary: true }, { t: '월별 요약', ic: 'bar' }] },
    ] },
    'pay-sim': { title: '급여 시뮬레이터', blocks: [
      { hero: { tone: 'blue', label: '예상 실수령액', big: '3,356,840', unit: '원', sub: '총지급 3,800,000원 · 총공제 443,160원' } },
      { sec: '기본 급여 설정', form: [
        { l: '기본급', type: 'num', v: '3,200,000' },
        { l: '부양가족 수', type: 'num', v: '1' },
      ] },
      { sec: '수당 항목', form: [
        { l: '식대', type: 'num', v: '200,000' },
        { l: '교통비', type: 'num', v: '0' },
        { l: '직책수당', type: 'num', v: '400,000' },
        { l: '직무수당', type: 'num', v: '0' },
        { l: '연장수당', type: 'num', v: '0' },
        { l: '야간수당', type: 'num', v: '0' },
        { l: '휴일수당', type: 'num', v: '0' },
        { l: '상여금', type: 'num', v: '0' },
        { l: '자격수당', type: 'num', v: '0' },
        { l: '보육수당', type: 'num', v: '0' },
      ], submit: { t: '실수령액 재계산', ic: 'bar' } },
      { sec: '공제 항목', kv: [
        { l: '국민연금', note: '4.75%', v: '171,000원' },
        { l: '건강보험', note: '3.595%', v: '129,420원' },
        { l: '장기요양보험', note: '0.4724%', v: '17,006원' },
        { l: '고용보험', note: '0.9%', v: '32,400원' },
        { l: '소득세(간이)', v: '84,850원' },
        { l: '지방소득세', v: '8,480원' },
        { l: '공제 합계', v: '443,156원', strong: true, tone: 'danger' },
      ] },
      { note: { tone: 'danger', ic: 'shield', t: '산재보험은 회사 부담', s: '산재보험(회사부담) 25,200원 (0.70%) — 근로자 공제 아님' } },
    ] },
    'pay-retire': { title: '퇴직 정산', blocks: [
      { kpis: [['won', 'muted', '퇴직 예정', '60일 내', '0', '명'], ['won', 'accent', '퇴직금 추계', '전 직원', '312', 'M']] },
      { sec: '퇴직급여 계산기 (DC 기준)', form: [
        { l: '월 평균임금', type: 'num', v: '3,600,000' },
        { l: '입사일', type: 'date', v: '2020-06-15' },
        { l: '퇴직(정산)일', type: 'date', v: '2026-05-31' },
      ], submit: { t: '퇴직급여 계산', ic: 'won' } },
      { note: { tone: 'accent', ic: 'won', t: '예상 퇴직급여 21,300,000원', s: '재직 5년 11개월 · DC 연 부담금 1/12 기준 · 1년 미만 시 미발생' } },
      { cap: 'DC(확정기여)는 연간 임금총액의 1/12를 매년 적립하며, 중간정산은 법정 사유에 한해 가능합니다.' },
    ] },
    'pay-pension': { title: '퇴직연금', blocks: [
      { stat: [['19', 'DC 가입', 'accent'], ['8', 'DB 가입', 'muted']] },
      { sec: '가입 현황', list: [
        { ic: 'won', tone: 'accent', nm: '확정기여형 (DC)', badge: 'DC', bt: 'accent', sub: '월 적립 4.2M · 운용 미래에셋', val: '19명' },
        { ic: 'won', tone: 'muted', nm: '확정급여형 (DB)', badge: 'DB', bt: 'muted', sub: '적립금 184M · 적립률 92%', val: '8명' },
      ] },
      { sec: '적립 현황', cols: ['구분', '적립금', '비고'], table: [['DC 누적', '312M', '연 1/12'], ['DB 적립금', '184M', '적립률 92%'], ['미적립금', '16M', '6월 충당']], w: '1.2fr 1fr 0.9fr' },
    ] },
    'pay-4ins': { title: '4대보험', blocks: [
      { note: { tone: 'warn', ic: 'shield', t: 'EDI 신고 예정 5/22', s: '입사 1명 반영 · 퇴사 0명 · 대상 27명' } },
      { sec: '2026년 근로자 부담 요율', cols: ['보험', '요율', '비고'], table: [
        ['국민연금', '4.75%', '상한 적용'], ['건강보험', '3.595%', ''], ['장기요양', '0.4724%', '건보의 12.95%'], ['고용보험', '0.9%', ''],
      ], w: '1.1fr 0.8fr 1.1fr' },
      { sec: '보험별 사업주 부담 합계', cols: ['보험', '대상', '사업주 부담'], table: [
        ['국민연금', '27명', '4.32M'], ['건강보험', '27명', '3.42M'], ['장기요양', '27명', '0.44M'], ['고용보험', '27명', '0.61M'], ['산재보험', '27명', '0.34M'],
      ], w: '1.1fr 0.7fr 1.1fr' },
      { btns: [{ t: 'EDI 신고파일 생성', ic: 'fileText', primary: true }] },
    ] },
    'pay-withhold': { title: '원천징수', blocks: [
      { note: { tone: 'warn', ic: 'fileText', t: '원천세 신고 예정 5/10', s: '귀속 4월 · 대상 27명 · 환급 0건' } },
      { sec: '원천세 요약', cols: ['항목', '금액'], table: [['근로소득세', '4.82M'], ['지방소득세', '0.48M'], ['합계 납부세액', '5.30M']], w: '1.4fr 1fr' },
      { sec: '관련 작업', list: [
        { ic: 'fileText', tone: 'accent', nm: '근로소득 원천징수 신고', sub: '월별 신고 파일', val: '생성' },
        { ic: 'fileText', tone: 'muted', nm: '연말정산 자료', sub: '2025 귀속 마감', val: '완료' },
        { ic: 'fileText', tone: 'muted', nm: '원천징수영수증', sub: '직원 발급', val: '발급' },
      ] },
    ] },
    'pay-peak': { title: '임금피크제', blocks: [
      { sec: '적용 대상', list: [
        { av: '박철홍', nm: '박철홍', badge: '대상', bt: 'accent', sub: '만 57세 · 적용 2년차', val: '90%' },
      ] },
      { sec: '감액 기준', cols: ['적용 연차', '지급률'], table: [['1년차', '95%'], ['2년차', '90%'], ['3년차', '85%'], ['4년차 이후', '80%']], w: '1.4fr 1fr' },
      { cap: '만 57세 이후 연 5%p 감액. 임금피크 지원금 신청 대상 여부는 고용센터 기준을 따릅니다.' },
    ] },
    'pay-minwage': { title: '최저임금 점검', blocks: [
      { note: { tone: 'danger', t: '최저임금 미달 2건', s: '환산 시급이 2026 최저임금에 미달합니다. 즉시 급여 기준 점검 필요.' } },
      { kpis: [['won', 'accent', '2026 최저 시급', '시급', '10,320', '원'], ['won', 'accent', '월 환산', '209h 기준', '2.16', 'M'], ['users', 'danger', '미달 직원', '검토 27명', '2', '명', true], ['won', 'danger', '총 부족액', '월', '0.12', 'M', true]] },
      { sec: '미달 직원 (비교급여 기준)', cols: ['성명', '환산 시급', '판정'], table: [
        ['시급직 A', '9,950원', { v: '미달', bt: 'danger' }], ['시급직 B', '10,100원', { v: '미달', bt: 'danger' }], ['이가연', '11,240원', { v: '정상', bt: 'success' }],
      ], w: '1.2fr 1fr 0.7fr' },
      { cap: '* 기본급+직책수당 합산 비교급여 기준 · 월 환산 209시간(주 40시간)' },
    ] },
    'pay-hourly': { title: '시급직 환산 검토', blocks: [
      { sec: '시급직 환산 시급', cols: ['성명', '월급여', '환산 시급'], table: [
        ['시급직 A', '2,080,000', { v: '9,950', bt: 'danger' }], ['시급직 B', '2,111,000', { v: '10,100', bt: 'danger' }], ['시급직 C', '2,340,000', { v: '11,200', bt: 'success' }],
      ], w: '1.1fr 1.1fr 0.9fr' },
      { note: { tone: 'warn', ic: 'bar', t: '환산 기준 209시간', s: '월급여 ÷ 209h = 환산 시급. 2026 최저 10,320원 미달 시 자동 경고됩니다.' } },
    ] },
    'pay-nontax': { title: '비과세 점검', blocks: [
      { sec: '비과세 한도 점검', list: [
        { ic: 'checkCircle', tone: 'success', nm: '식대', badge: '정상', bt: 'success', sub: '월 20만 한도 이내', val: '200,000' },
        { ic: 'checkCircle', tone: 'success', nm: '자가운전 보조금', badge: '정상', bt: 'success', sub: '월 20만 한도 이내', val: '한도 내' },
        { ic: 'checkCircle', tone: 'success', nm: '보육수당', badge: '정상', bt: 'success', sub: '월 20만 한도(6세 이하)', val: '해당 4명' },
        { ic: 'alertTri', tone: 'warn', nm: '연구보조비', badge: '검토', bt: 'warn', sub: '월 20만 한도 초과 1명', val: '초과' },
      ] },
      { cap: '비과세 한도 초과분은 과세 대상으로 자동 전환됩니다.' },
    ] },
    'pay-ordinary': { title: '통상임금 계산기', blocks: [
      { sec: '통상임금 입력', form: [
        { l: '기본급', type: 'num', v: '3,200,000' },
        { l: '직책수당', type: 'num', v: '400,000' },
        { l: '직무수당', type: 'num', v: '0' },
      ] },
      { sec: '법정수당 계산 입력', form: [
        { l: '연장근무 (시간)', type: 'num', v: '10' },
        { l: '야간근무 (시간)', type: 'num', v: '8' },
        { l: '휴일근무 (시간)', type: 'num', v: '0' },
        { l: '미사용 연차 (일)', type: 'num', v: '3' },
      ], submit: { t: '통상임금 계산', ic: 'bar' } },
      { sec: '계산 결과', cols: ['항목', '금액'], table: [
        ['통상임금 합계', '3,600,000'], ['시간급 통상임금', '17,225'], ['연장수당 (×1.5×10h)', '258,375'], ['야간수당 (×0.5×8h)', '68,900'], ['연차수당 (×8h×3일)', '413,400'],
      ], w: '1.6fr 1fr' },
      { cap: '월 소정근로 209시간 · 휴일 8h 이내 ×1.5, 초과분 ×2.0 (근로기준법 제56조)' },
    ] },
    'pay-unpaid': { title: '미지급 수당 점검', blocks: [
      { note: { tone: 'danger', t: '미지급 수당 1건', s: '병동팀 야간수당 누락 감지' } },
      { sec: '미지급 내역', list: [
        { ic: 'alertTri', tone: 'danger', nm: '야간수당 누락', badge: '미지급', bt: 'danger', sub: '병동팀 조현준 · 5월 8h', val: '+98,810' },
      ] },
      { sec: '점검 항목', cols: ['수당', '대상', '상태'], table: [
        ['연장수당', '27명', { v: '정상', bt: 'success' }], ['야간수당', '8명', { v: '1건 누락', bt: 'danger' }], ['휴일수당', '12명', { v: '정상', bt: 'success' }],
      ], w: '1.1fr 0.8fr 1fr' },
      { btns: [{ t: '소급 반영', ic: 'check', primary: true }] },
    ] },
    'pay-deduct': { title: '무급결근 차감', blocks: [
      { kpis: [['won', 'muted', '이번 달 차감', '무단결근 0', '0', '원'], ['users', 'muted', '차감 대상', '5월', '0', '명']] },
      { sec: '차감 규칙', cols: ['구분', '기준'], table: [['무급결근 1일', '기본급 ÷ 근무일수'], ['지각·조퇴', '시급 × 미근로시간'], ['반영 시점', '익월 급여 정산']], w: '1.2fr 1.4fr' },
      { cap: '일할 계산: 월 기본급 ÷ 해당 월 소정근로일수. 정산은 익월 급여에 자동 반영됩니다.' },
    ] },
    'hr-welfare': { tabs: [
      { label: '경조사', cnt: 14, blocks: [
        { btns: [{ t: '경조사 신청', ic: 'plus', primary: true, nav: 'wf-event-new' }] },
        { sec: '경조사', list: [
          { ic: 'bookmark', tone: 'danger', nm: '박지영 결혼', badge: '결혼', bt: 'danger', sub: '5/25 · 화환 + 경조금', val: '신청', vBadge: true, vTone: 'danger' },
          { ic: 'bookmark', tone: 'muted', nm: '김민정 부친상', badge: '조사', bt: 'muted', sub: '5/8 · 처리 완료', val: '완료', vBadge: true, vTone: 'success' },
        ] },
      ] },
      { label: '건강검진', cnt: '22/27', blocks: [
        { kpis: [['checkCircle', 'success', '수검 완료', '일반검진', '8', '명'], ['clock', 'warn', '미예약', '안내 발송', '4', '명', true]] },
        { sec: '검진 현황', list: [
          { ic: 'checkCircle', tone: 'success', nm: '일반검진', badge: '완료', bt: 'success', sub: '8명 수검', val: '8/12' },
          { ic: 'clock', tone: 'warn', nm: '미예약', badge: '대기', bt: 'warn', sub: '4명 안내 발송' },
        ] },
      ] },
      { label: '면허·자격', cnt: 48, blocks: [
        { kpis: [['shield', 'success', '유효', '정상 추적', '44', '건'], ['alertTri', 'warn', '만료 임박', '90일 이내', '2', '건', true], ['alertTri', 'danger', '만료', '갱신 필요', '2', '건', true], ['users', 'accent', '보유 직원', '면허 등록', '21', '명']] },
        { btns: [{ t: '＋ 면허·자격증 등록', ic: 'plus', primary: true, nav: 'wf-license-new' }] },
        { chips: ['전체 48', '유효 44', '만료 임박 2', '만료 2'] },
        { sec: '면허·자격증', more: '만료일순 · 탭하여 상세', list: [
          { ic: 'shield', tone: 'danger', nm: '간호사 면허', badge: '만료', bt: 'danger', sub: '정해린 · 보건복지부 · 제2-12345호', val: '2026.4.30', vBadge: true, vTone: 'danger', nav: 'wf-license-card', params: { nm: '간호사 면허', name: '정해린', body: '보건복지부', no: '제2-12345호', issued: '2016.04.30', expiry: '2026.04.30', status: '만료', tone: 'danger' } },
          { ic: 'shield', tone: 'warn', nm: 'BLS 자격', badge: 'D-30', bt: 'warn', sub: '이가연 · 대한심폐소생협회 · BLS-9981', val: '2026.6.30', vBadge: true, vTone: 'warn', nav: 'wf-license-card', params: { nm: 'BLS 자격', name: '이가연', body: '대한심폐소생협회', no: 'BLS-9981', issued: '2024.06.30', expiry: '2026.06.30', status: '만료 임박', tone: 'warn' } },
          { ic: 'shield', tone: 'success', nm: '간호사 면허', badge: '유효', bt: 'success', sub: '김지오 · 보건복지부 · 제2-08842호', val: '2031.3.15', vBadge: true, vTone: 'success', nav: 'wf-license-card', params: { nm: '간호사 면허', name: '김지오', body: '보건복지부', no: '제2-08842호', issued: '2021.03.15', expiry: '2031.03.15', status: '유효', tone: 'success' } },
          { ic: 'shield', tone: 'success', nm: '임상병리사 면허', badge: '유효', bt: 'success', sub: '한지수 · 보건복지부 · 제3-04417호', val: '2030.9.1', vBadge: true, vTone: 'success', nav: 'wf-license-card', params: { nm: '임상병리사 면허', name: '한지수', body: '보건복지부', no: '제3-04417호', issued: '2020.09.01', expiry: '2030.09.01', status: '유효', tone: 'success' } },
        ] },
        { cap: '만료 임박(90일 이내)·만료 면허는 자동 알림이 발송됩니다.' },
      ] },
      { label: '의료기기 점검', cnt: 12, blocks: [
        { sec: '점검 일정', list: [
          { ic: 'shield', tone: 'accent', nm: '제세동기(AED)', badge: '5/30', bt: 'accent', sub: '2대 정기 점검 예정' },
          { ic: 'shield', tone: 'success', nm: 'PSA 압박기', badge: '완료', bt: 'success', sub: '4/28 점검 완료' },
        ] },
      ] },
    ] },
    'hr-docs': { tabs: [
      { label: '계약 현황', cnt: 27, blocks: [
        { note: { tone: 'warn', ic: 'fileText', t: '계약 만료 임박 1명', s: '송소현 계약직 · 6/30' } },
        { sec: '계약 현황', list: [
          { av: '송소현', nm: '송소현', badge: '만료임박', bt: 'warn', sub: '계약직 · 6/30', val: '갱신' },
          { av: '오민호', nm: '오민호', badge: '수습종료', bt: 'accent', sub: '정규 전환 검토 · 6/1', val: '전환' },
        ] },
      ] },
      { label: '계약서 자동생성', blocks: [
        { sec: '계약서 템플릿', list: [
          { ic: 'fileText', tone: 'accent', nm: '정규직 근로계약서', badge: '기본', bt: 'accent' },
          { ic: 'fileText', tone: 'muted', nm: '계약직 근로계약서' },
          { ic: 'fileText', tone: 'muted', nm: '연봉계약서 · NDA', val: '+2종' },
        ] },
        { btns: [{ t: '계약서 생성', ic: 'edit', primary: true }, { t: '전자서명 요청', ic: 'send' }] },
      ] },
      { label: '문서보관함', cnt: 142, blocks: [
        { sec: '문서보관함', cols: ['분류', '건수'], table: [['근로계약서', '312건'], ['인사기록카드', '27건'], ['증명서 발급 이력', '945건']], w: '1.6fr 1fr' },
      ] },
      { label: '증명서 발급', blocks: [
        { sec: '발급 가능 서류', list: [
          { ic: 'fileText', tone: 'success', nm: '재직증명서', badge: '즉시', bt: 'success', sub: 'PDF' },
          { ic: 'fileText', tone: 'success', nm: '경력증명서', badge: '즉시', bt: 'success', sub: 'PDF' },
          { ic: 'fileText', tone: 'warn', nm: '원천징수영수증', badge: '연1회', bt: 'warn' },
        ] },
        { btns: [{ t: '서류 발급', ic: 'arrowDown', primary: true }] },
      ] },
      { label: '서류 제출', cnt: 5, blocks: [
        { note: { tone: 'danger', t: '미제출 서류 3건', s: '건강검진 결과 2명 · 통장사본 1명' } },
        { sec: '미제출', list: [
          { ic: 'alertTri', tone: 'danger', nm: '건강검진 결과', badge: '미제출', bt: 'danger', sub: '2명' },
          { ic: 'alertTri', tone: 'danger', nm: '통장사본', badge: '미제출', bt: 'danger', sub: '1명' },
        ] },
      ] },
    ] },

    // ════════ 재고관리 ════════
    'st-status': { tabs: [
      { label: '재고현황', blocks: [
        { kpis: [['package', 'accent', '전체 품목', '소모품 412', '847', '종'], ['alertTri', 'warn', '부족 품목', '발주 권장 12', '23', '건', true], ['alertTri', 'danger', '재고 0', '긴급 보충', '4', '건', true], ['clock', 'warn', '유효기간 임박', '30일 이내', '8', '건']] },
        { sec: '품목 현황', more: '탭하여 상세', list: [
          { ic: 'package', tone: 'muted', nm: '멸그루브 18cm', sub: '의료기기 · 외래팀', val: '0 EA', vBadge: true, vTone: 'danger', nav: 'st-item-card', params: { nm: '멸그루브 18cm', cat: '의료기기', dept: '외래팀', qty: '0 EA', safe: '12 EA', tone: 'danger', state: '재고 0' } },
          { ic: 'package', tone: 'muted', nm: '라텍스 장갑 (S)', sub: '의료소모품', val: '6 BOX', vBadge: true, vTone: 'warn', nav: 'st-item-card', params: { nm: '라텍스 장갑 (S)', cat: '의료소모품', dept: '공통', qty: '6 BOX', safe: '20 BOX', tone: 'warn', state: '부족' } },
          { ic: 'package', tone: 'muted', nm: '주사 바늘 23G', sub: '의료소모품', val: '42 BOX', vBadge: true, vTone: 'success', nav: 'st-item-card', params: { nm: '주사 바늘 23G', cat: '의료소모품', dept: '공통', qty: '42 BOX', safe: '20 BOX', tone: 'success', state: '정상' } },
        ] },
      ] },
      { label: '내 부서 재고', blocks: [
        { kpis: [['package', 'accent', '외래팀 품목', '관리 중', '86', '종'], ['alertTri', 'warn', '부족', '발주 권장', '5', '건', true]] },
        { sec: '내 부서 재고', list: [
          { ic: 'package', tone: 'muted', nm: '멸그루브 18cm', sub: '안전재고 12', val: '0 EA', vBadge: true, vTone: 'danger' },
          { ic: 'package', tone: 'muted', nm: '거즈 4x4', sub: '안전재고 30', val: '24 BOX', vBadge: true, vTone: 'warn' },
        ] },
      ] },
      { label: '재고 알림', cnt: 23, blocks: [
        { note: { tone: 'warn', t: '재고 알림 23건', s: '부족 19 · 과다 4 — 발주 권장 12건' } },
        { sec: '부족 알림', list: [
          { ic: 'alertTri', tone: 'danger', nm: '멸그루브 18cm', badge: '재고 0', bt: 'danger', sub: '외래팀 · 자동 발주 권장' },
          { ic: 'alertTri', tone: 'warn', nm: '라텍스 장갑 (S)', badge: '부족', bt: 'warn', sub: '안전재고 미만' },
        ] },
      ] },
      { label: '유효기간 알림', cnt: 8, blocks: [
        { sec: '유효기간 임박 (30일)', list: [
          { ic: 'clock', tone: 'danger', nm: '리도카인 주사액', badge: 'D-8', bt: 'danger', sub: '약품 · 12개', val: '6/9' },
          { ic: 'clock', tone: 'warn', nm: '생리식염수 500ml', badge: 'D-21', bt: 'warn', sub: '약품 · 40병', val: '6/22' },
        ] },
      ] },
    ] },
    'st-io': { tabs: [
      { label: '입출고관리', blocks: [
        { kpis: [['arrowDown', 'accent', '오늘 입출고', '입12·출14·반2', '28', '건'], ['clock', 'warn', '발주 대기', '결재 후 발송', '3', '건'], ['send', 'accent', '배송 중', '금주 도착', '5', '건'], ['won', 'success', '이번 달 발주액', '전월 -2.1%', '28.4', 'M']] },
        { sec: '오늘 입출고', more: '＋ 수동 등록', list: [
          { nm: '라텍스 장갑 (S)', badge: '입고', bt: 'success', sub: '24 BOX · 백민 · 14:23' },
          { nm: '주사 바늘 23G', badge: '출고', bt: 'accent', sub: '8 BOX · 이나림 · 13:48' },
          { nm: '주사기 1ml (불량)', badge: '반품', bt: 'danger', sub: '3 BOX · 박유진 · 09:18' },
        ] },
      ] },
      { label: '구매 발주', cnt: 3, blocks: [
        { btns: [{ t: '새 발주서', ic: 'plus', primary: true, nav: 'st-order-new' }] },
        { sec: '발주 관리', more: '대기 3', list: [
          { ic: 'send', tone: 'warn', nm: '멸그루브 18cm 20EA', badge: '결재중', bt: 'warn', sub: '메디칼서플라이 · 2/3', val: '480K', nav: 'st-order-card', params: { nm: '멸그루브 18cm', qty: '20 EA', vendor: '메디칼서플라이', amt: '480,000', step: '2/3', state: '결재중', tone: 'warn' } },
          { ic: 'send', tone: 'accent', nm: '라텍스 장갑 30BOX', badge: '발송', bt: 'accent', sub: '한국의료기 · 배송 중', val: '555K', nav: 'st-order-card', params: { nm: '라텍스 장갑 (S)', qty: '30 BOX', vendor: '한국의료기', amt: '555,000', step: '발송', state: '배송 중', tone: 'accent' } },
          { ic: 'send', tone: 'success', nm: '거즈 4x4 50BOX', badge: '입고완료', bt: 'success', sub: '대한위생 · 5/10', val: '320K', nav: 'st-order-card', params: { nm: '거즈 4x4', qty: '50 BOX', vendor: '대한위생', amt: '320,000', step: '완료', state: '입고완료', tone: 'success' } },
        ] },
      ] },
      { label: '거래처관리', cnt: 14, blocks: [
        { sec: '거래처', more: '14곳', list: [
          { ic: 'users', tone: 'accent', nm: '메디칼서플라이', sub: '의료기기 · 결제 30일', val: '주요', nav: 'st-vendor-card', params: { nm: '메디칼서플라이', cat: '의료기기', term: '월말 결제 30일', tel: '02-512-3300', items: 42, ytd: '24.8M' } },
          { ic: 'users', tone: 'accent', nm: '한국의료기', sub: '소모품 · 결제 30일', val: '주요', nav: 'st-vendor-card', params: { nm: '한국의료기', cat: '소모품', term: '월말 결제 30일', tel: '031-880-1200', items: 88, ytd: '31.1M' } },
          { ic: 'users', tone: 'muted', nm: '대한위생', sub: '위생용품 · 결제 15일', nav: 'st-vendor-card', params: { nm: '대한위생', cat: '위생용품', term: '결제 15일', tel: '02-333-7788', items: 26, ytd: '9.0M' } },
        ] },
      ] },
      { label: '명세서관리', blocks: [
        { sec: '거래명세서 (5월)', cols: ['거래처', '건수', '금액'], table: [['메디칼서플라이', '4건', '2.4M'], ['한국의료기', '6건', '3.1M'], ['대한위생', '3건', '0.9M']], w: '1.6fr 0.8fr 1fr' },
      ] },
      { label: '납품확인서', blocks: [
        { sec: '납품 확인', list: [
          { ic: 'checkCircle', tone: 'success', nm: '거즈 4x4 50BOX', badge: '확인', bt: 'success', sub: '대한위생 · 5/10' },
          { ic: 'clock', tone: 'warn', nm: '라텍스 장갑 30BOX', badge: '대기', bt: 'warn', sub: '한국의료기 · 배송 중' },
        ] },
      ] },
    ] },
    'st-item': { tabs: [
      { label: '물품등록', blocks: [
        { sec: '물품 등록', form: [
          { l: '품목명', type: 'text', ph: '예: 멸그루브 18cm' },
          { l: '분류', type: 'select', v: '의료소모품', opts: ['의료소모품', '의료기기', '약품', '사무용품'] },
          { l: '바코드 / SKU', type: 'text', ph: 'MS-25-0000' },
          { l: '단위 · 안전재고', type: 'text', ph: 'BOX · 12' },
        ], submit: { t: '품목 등록', ic: 'plus' } },
      ] },
      { label: '카테고리관리', cnt: 7, blocks: [
        { sec: '카테고리', list: [
          { ic: 'package', tone: 'accent', nm: '의료소모품', val: '412종' },
          { ic: 'package', tone: 'accent', nm: '의료기기', val: '94종' },
          { ic: 'package', tone: 'muted', nm: '약품', val: '168종' },
          { ic: 'package', tone: 'muted', nm: '사무용품 외 4종', val: '173종' },
        ] },
      ] },
      { label: '품목자산', cnt: 218, blocks: [
        { kpis: [['package', 'accent', '고정자산', '대장 등록', '218', '건'], ['won', 'muted', '장부가액', '감가상각 후', '1.8', '억']] },
        { sec: '주요 자산', cols: ['자산', '취득', '장부가'], table: [['PSA 압박기', '2024', '2.4M'], ['초음파 진단기', '2023', '18.2M'], ['전동 수술대', '2022', '9.6M']], w: '1.5fr 0.8fr 1fr' },
      ] },
      { label: '자산 QR', blocks: [
        { kpis: [['package', 'accent', '자산 등록', 'QR 부착', '218', '건'], ['plusBox', 'success', '이번 달 스캔', '점검', '42', '회']] },
        { sec: '대시보드', list: [
          { ic: 'plusBox', tone: 'accent', nm: 'QR 라벨 발행', sub: '신규 자산 QR 생성', val: '발행' },
          { ic: 'checkCircle', tone: 'success', nm: '스캔 점검 이력', sub: '이번 달 42건', val: '42' },
        ] },
        { sec: '내 대여 자산', list: [
          { ic: 'package', tone: 'muted', nm: '노트북 (Dell)', badge: '대여중', bt: 'accent', sub: '백민 · 5/2 대여', val: '반납' },
        ] },
        { btns: [{ t: 'QR 스캔', ic: 'plusBox', primary: true }, { t: '라벨 발행', ic: 'fileText' }] },
      ] },
      { label: 'UDI 관리', cnt: 94, blocks: [
        { sec: 'UDI 추적', cols: ['기기', 'UDI', '상태'], table: [['제세동기', '(01)088...', { v: '등록', bt: 'success' }], ['PSA 압박기', '(01)089...', { v: '등록', bt: 'success' }], ['초음파 진단기', '미등록', { v: '필요', bt: 'warn' }]], w: '1.3fr 1fr 0.7fr' },
      ] },
    ] },
    'st-analyze': { tabs: [
      { label: 'ABC 분석', blocks: [
        { sec: 'ABC 분석 (금액 기준)', cols: ['등급', '품목', '비중'], table: [[{ v: 'A', bt: 'danger' }, '64종', '72%'], [{ v: 'B', bt: 'warn' }, '180종', '21%'], [{ v: 'C', bt: 'muted' }, '603종', '7%']], w: '0.7fr 1fr 1fr' },
        { cap: 'A등급 품목은 안전재고·발주주기를 우선 관리합니다.' },
      ] },
      { label: '재고 수요예측', blocks: [
        { sec: '수요예측 (다음 달)', prog: [
          { nm: '라텍스 장갑 (S)', sub: '예측 32 BOX', p: 80, bt: 'accent', ic: 'bar' },
          { nm: '거즈 4x4', sub: '예측 40 BOX', p: 92, bt: 'warn', ic: 'bar' },
        ] },
        { cap: 'AI가 최근 90일 소비 추세를 기반으로 예측합니다.' },
      ] },
      { label: '재고 실사', blocks: [
        { note: { tone: 'accent', ic: 'checkCircle', t: '정기 실사 예정 5/30', s: '대상 847종 · 담당 백민' } },
        { list: [{ ic: 'checkCircle', tone: 'success', nm: '4월 실사', badge: '완료', bt: 'success', sub: '차이 3건 조정', val: '완료' }] },
      ] },
      { label: '월마감', blocks: [
        { stat: [['완료', '4월 마감', 'success'], ['진행', '5월 마감', 'warn']] },
        { list: [{ ic: 'fileText', tone: 'success', nm: '4월 월마감', badge: '확정', bt: 'success', sub: '재고 평가액 184M', val: '열람' }] },
      ] },
      { label: '소모품 통계', blocks: [
        { sec: '부서별 소비 (5월)', cols: ['부서', '소비액', '비중'], table: [['외래팀', '6.2M', '34%'], ['병동팀', '5.4M', '30%'], ['수술팀', '4.1M', '22%'], ['검사팀', '2.5M', '14%']], w: '1.2fr 1fr 0.8fr' },
      ] },
      { label: 'AS·반품', cnt: 2, blocks: [
        { chips: ['AS 접수 1', '반품 1', '이력 12'] },
        { btns: [{ t: '＋ AS 접수', ic: 'plus', primary: true }, { t: '＋ 반품 등록', ic: 'plus' }] },
        { sec: 'AS 접수', list: [
          { ic: 'alertTri', tone: 'accent', nm: 'PSA 압박기 AS', badge: '접수', bt: 'accent', sub: '메디칼서플라이 · 5/9', val: '처리중' },
        ] },
        { sec: '반품', list: [
          { ic: 'alertTri', tone: 'warn', nm: '주사기 1ml (불량)', badge: '반품', bt: 'warn', sub: '한국의료기 · 3 BOX · 5/8', val: '승인' },
        ] },
        { sec: '처리 이력', cols: ['항목', '구분', '상태'], table: [
          ['주사 바늘 23G', 'AS', { v: '완료', bt: 'success' }], ['거즈 4x4', '반품', { v: '완료', bt: 'success' }], ['혈압계', 'AS', { v: '완료', bt: 'success' }],
        ], w: '1.4fr 0.7fr 0.8fr' },
      ] },
      { label: '재고 이관', cnt: 2, blocks: [
        { btns: [{ t: '＋ 이관 신청', ic: 'plus', primary: true, nav: 'st-transfer-new' }] },
        { sec: '이관 신청', list: [
          { ic: 'send', tone: 'warn', nm: '라텍스 장갑 10BOX', badge: '승인 대기', bt: 'warn', sub: '외래팀 → 병동팀 · 5/11' },
        ] },
        { sec: '이관 이력', cols: ['품목', '경로', '상태'], table: [
          ['거즈 4x4 20BOX', '병동→수술', { v: '완료', bt: 'success' }], ['주사기 1ml 30BOX', '외래→검사', { v: '완료', bt: 'success' }],
        ], w: '1.4fr 1fr 0.8fr' },
      ] },
    ] },

    // ════════ 관리자 ════════
    'ad-exec': { tabs: [
      { label: '경영', blocks: [
        { hero: { tone: 'dark', label: '2026년 5월 · 박철홍정형외과 통합', big: '182.4M', unit: '원', sub: '전월 동기 +4.2% · 목표 달성률 38%' } },
        { kpis: [['won', 'success', '5월 매출', '누적', '182.4', 'M'], ['bar', 'accent', '영업이익', '이익률 22%', '40.1', 'M'], ['users', 'accent', '내원 환자', '일평균 142', '3,124', '명'], ['won', 'warn', '미수금', '회수 관리', '8.2', 'M']] },
        { sec: '부문별 매출', prog: [
          { nm: '외래 진료', sub: '112M', p: 61, bt: 'accent', ic: 'won' },
          { nm: '수술', sub: '48M', p: 26, bt: 'accent', ic: 'won' },
          { nm: '검사·영상', sub: '22M', p: 13, bt: 'warn', ic: 'won' },
        ] },
      ] },
      { label: '재무', blocks: [
        { kpis: [['won', 'success', '현금 잔고', '운영 계좌', '124', 'M'], ['won', 'warn', '미지급금', '월말 결제', '32', 'M']] },
        { sec: '현금흐름 (5월)', cols: ['구분', '금액'], table: [['영업활동', '+40.1M'], ['투자활동', '-12.4M'], ['재무활동', '-6.0M'], ['순증감', '+21.7M']], w: '1.4fr 1fr' },
      ] },
      { label: '예산', blocks: [
        { sec: '예산 집행 (2026)', prog: [
          { nm: '인건비', sub: '집행 48%', p: 48, bt: 'accent', ic: 'bar' },
          { nm: '재료비', sub: '집행 42%', p: 42, bt: 'accent', ic: 'bar' },
          { nm: '마케팅', sub: '집행 71%', p: 71, bt: 'warn', ic: 'bar' },
        ] },
      ] },
      { label: '통합 보고서', blocks: [
        { list: [
          { ic: 'fileText', tone: 'accent', nm: '2026.5 월간 경영 리포트', badge: '작성중', bt: 'warn', val: '미발행' },
          { ic: 'fileText', tone: 'success', nm: '2026.4 월간 경영 리포트', badge: '발행', bt: 'success', val: '열람' },
        ] },
      ] },
      { label: '법인 손익', blocks: [
        { sec: '4법인 손익 (5월)', cols: ['법인', '매출', '손익'], table: [['박철홍정형외과', '182.4M', { v: '+40.1M', bt: 'success' }], ['수연의원', '64.2M', { v: '+12.8M', bt: 'success' }], ['MSO 본사', '28.0M', { v: '-3.2M', bt: 'danger' }], ['통합', '274.6M', { v: '+49.7M', bt: 'success' }]], w: '1.5fr 1fr 1fr' },
      ] },
      { label: '경영 분석', blocks: [
        { kpis: [['bar', 'accent', '환자 증감', '전월 대비', '+6.4', '%'], ['bar', 'muted', '재방문율', '3개월', '72', '%']] },
        { list: [
          { ic: 'bar', tone: 'accent', nm: '진료과별 추세', sub: '정형·재활 상승세' },
          { ic: 'bar', tone: 'muted', nm: '시간대별 내원 분석', sub: '오전 집중 · 대기 관리 권장' },
        ] },
      ] },
    ] },
    'ad-master': { tabs: [
      { label: '개요', blocks: [
        { kpis: [['users', 'accent', '활성 직원', '로그인 24h', '24', '명'], ['shield', 'success', '시스템 상태', '정상', '99.9', '%'], ['fileText', 'muted', '감사 로그 30일', '기록', '1,842', '건'], ['alertTri', 'warn', '경고', '미해결', '2', '건', true]] },
      ] },
      { label: '운영 대시보드', blocks: [
        { kpis: [['bar', 'accent', '동시 접속', '현재', '18', '명'], ['chat', 'muted', '채팅 24h', '메시지', '342', '건']] },
        { sec: '실시간 모니터', list: [
          { ic: 'checkCircle', tone: 'success', nm: 'API 응답', sub: '평균 124ms', val: '정상' },
          { ic: 'alertTri', tone: 'warn', nm: '푸시 발송 실패', sub: '최근 1시간 3건', val: '3건' },
        ] },
      ] },
      { label: '변경이력', cnt: 8, blocks: [
        { sec: '변경이력 (오늘)', list: [
          { av: '백정민', nm: '급여 기준표 수정', badge: '설정', bt: 'accent', sub: '09:42 · 호봉 테이블', val: '09:42' },
          { av: '박유진', nm: '직원 정보 변경', badge: '인사', bt: 'muted', sub: '11:10 · 송소현 부서', val: '11:10' },
        ] },
      ] },
      { label: '권한 변경', blocks: [
        { sec: '권한 변경 이력', list: [
          { av: '백정민', nm: '홍자비 권한 상향', badge: '승인', bt: 'success', sub: '직원 → 부장 · 5/10' },
          { av: '박철홍', nm: '관리자 권한 부여', badge: '승인', bt: 'success', sub: '백정민 · 4/28' },
        ] },
      ] },
      { label: '전체 채팅', blocks: [
        { note: { tone: 'muted', ic: 'chat', t: '전체 채팅 모니터링', s: '관리자 감사 목적 · 접근 시 로그 기록' } },
        { list: [
          { ic: 'chat', tone: 'accent', nm: 'SY INC. 경영지원', sub: '활성 · 7명', val: '342건' },
          { ic: 'chat', tone: 'muted', nm: '병동팀 간호', sub: '활성 · 8명', val: '128건' },
        ] },
      ] },
      { label: '정합성 점검', blocks: [
        { note: { tone: 'success', ic: 'checkCircle', t: '정합성 정상', s: '최근 검사 오늘 03:00 · 오류 0건' } },
        { list: [{ ic: 'checkCircle', tone: 'success', nm: '급여-근태 정합성', sub: '불일치 0', val: '정상' }] },
        { btns: [{ t: '정합성 검사 실행', ic: 'refresh', primary: true }] },
      ] },
      { label: '복구 센터', blocks: [
        { note: { tone: 'danger', ic: 'shield', t: '복구 센터', s: '스냅샷 복원은 병원장 승인이 필요합니다.' } },
        { list: [{ ic: 'shield', tone: 'muted', nm: '오늘 03:00 스냅샷', sub: '전체 데이터', val: '복원' }] },
      ] },
    ] },
    'ad-company': { tabs: [
      { label: '기본정보', blocks: [
        { sec: '법인 기본 정보', list: [
          { ic: 'hr', tone: 'accent', nm: '박철홍정형외과', sub: '대표 박철홍 · 직원 27', val: '주사업장' },
          { ic: 'hr', tone: 'muted', nm: '수연의원', sub: '직원 8', val: '운영' },
          { ic: 'hr', tone: 'muted', nm: 'MSO 본사', sub: '직원 5', val: '운영' },
        ] },
      ] },
      { label: '근무형태', blocks: [
        { sec: '근무형태', shift: [
          { b: 'Day', bt: 'accent', t: '08:30–17:30', n: 12, staff: ['주간'] },
          { b: 'Evening', bt: 'warn', t: '14:30–22:30', n: 5, staff: ['오후'] },
          { b: 'Night', bt: 'violet', t: '22:00–07:00', n: 3, staff: ['야간'] },
        ] },
      ] },
      { label: '법인카드', blocks: [
        { sec: '법인카드 (5월)', cols: ['카드', '사용액', '한도'], table: [['신한 ****1234', '4.2M', '10M'], ['국민 ****5678', '2.8M', '8M'], ['삼성 ****9012', '1.1M', '5M']], w: '1.5fr 1fr 0.8fr' },
      ] },
      { label: '계약 템플릿', blocks: [
        { list: [
          { ic: 'fileText', tone: 'accent', nm: '정규직 근로계약서', badge: '기본', bt: 'accent' },
          { ic: 'fileText', tone: 'muted', nm: 'NDA · 비밀유지 서약', val: '2종' },
        ] },
      ] },
      { label: '휴가·공휴일', blocks: [
        { cal: { sec: '2026년 5월 공휴일', holidays: [5, 24] } },
        { list: [
          { ic: 'calendar', tone: 'danger', nm: '어린이날', sub: '5/5', val: '5/5', vBadge: true, vTone: 'danger' },
          { ic: 'calendar', tone: 'danger', nm: '부처님오신날', sub: '5/24', val: '5/24', vBadge: true, vTone: 'danger' },
        ] },
      ] },
      { label: '급여기준', blocks: [
        { sec: '호봉·수당 기준표', cols: ['구분', '기준'], table: [['기본 호봉', '1~15호봉'], ['직책수당', '주임 20만~부장 60만'], ['야간수당', '통상시급 50% 가산'], ['연장수당', '통상시급 50% 가산']], w: '1.3fr 1.4fr' },
      ] },
      { label: '문서 보관', blocks: [
        { sec: '법인 문서', cols: ['분류', '건수'], table: [['사업자 등록증', '4건'], ['임대차 계약', '3건'], ['인허가 서류', '12건'], ['기타', '1,265건']], w: '1.6fr 1fr' },
      ] },
    ] },
    'ad-roles': { blocks: [
      { kpis: [['shield', 'accent', '정의된 역할', '병원장 외', '6', '종'], ['clock', 'warn', '권한 요청 대기', '결재 중', '2', '건', true]] },
      { sec: '역할', more: '탭하여 권한', list: [
        { ic: 'shield', tone: 'danger', nm: '병원장', sub: '전체 권한', val: 'ALL', nav: 'rl-role-card', params: { role: '병원장', scope: '전체 권한', rtone: 'danger', perms: [['전자결재', { v: '결재', bt: 'success' }], ['인사관리', { v: '전체', bt: 'success' }], ['재고관리', { v: '전체', bt: 'success' }], ['관리자', { v: '전체', bt: 'success' }]] } },
        { ic: 'shield', tone: 'danger', nm: '관리자', sub: '관리 권한', val: '관리', nav: 'rl-role-card', params: { role: '관리자', scope: '관리 권한', rtone: 'danger', perms: [['전자결재', { v: '결재', bt: 'success' }], ['인사관리', { v: '관리', bt: 'accent' }], ['재고관리', { v: '관리', bt: 'accent' }], ['관리자', { v: '일부', bt: 'warn' }]] } },
        { ic: 'shield', tone: 'muted', nm: '부장', sub: '1차 결재 + HR 조회', nav: 'rl-role-card', params: { role: '부장', scope: '1차 결재 + HR 조회', rtone: 'accent', perms: [['전자결재', { v: '1차 결재', bt: 'success' }], ['인사관리', { v: '조회', bt: 'accent' }], ['재고관리', { v: '입출고', bt: 'success' }], ['관리자', { v: '불가', bt: 'danger' }]] } },
        { ic: 'shield', tone: 'muted', nm: '직원', sub: '본인 결재·명세서·근태', nav: 'rl-role-card', params: { role: '직원', scope: '제한 권한', rtone: 'muted', perms: [['전자결재', { v: '신청', bt: 'muted' }], ['인사관리', { v: '본인', bt: 'muted' }], ['재고관리', { v: '조회', bt: 'muted' }], ['관리자', { v: '불가', bt: 'danger' }]] } },
        { ic: 'shield', tone: 'muted', nm: '시급직 · 수습', sub: '최소 권한', val: '2종', nav: 'rl-role-card', params: { role: '시급직·수습', scope: '최소 권한', rtone: 'muted', perms: [['전자결재', { v: '신청', bt: 'muted' }], ['인사관리', { v: '본인', bt: 'muted' }], ['재고관리', { v: '불가', bt: 'danger' }], ['관리자', { v: '불가', bt: 'danger' }]] } },
      ] },
      { note: { tone: 'warn', ic: 'clock', t: '권한 요청 2건 대기', s: '이나림·홍자비 · 결재 승인 시 적용' } },
    ] },
    'ad-ops': { tabs: [
      { label: '운영 설정', blocks: [
        { sec: '운영 설정', form: [
          { l: '근무 시작 시각', type: 'time', v: '08:30' },
          { l: '지각 기준', type: 'select', v: '시작 후 10분', opts: ['시작 후 0분', '시작 후 10분', '시작 후 30분'] },
          { l: '자동 발주', type: 'select', v: '안전재고 미만 시', opts: ['사용 안 함', '안전재고 미만 시', '재고 0 시'] },
        ], submit: { t: '설정 저장', ic: 'check' } },
      ] },
      { label: '템플릿 관리', blocks: [
        { list: [
          { ic: 'fileText', tone: 'accent', nm: '알림 템플릿', sub: '결재·근태·재고', val: '8종' },
          { ic: 'fileText', tone: 'muted', nm: '문서 템플릿', sub: '계약·증명서', val: '5종' },
        ] },
      ] },
      { label: '팝업 관리', blocks: [
        { btns: [{ t: '새 팝업', ic: 'plus', primary: true, nav: 'op-popup-new' }] },
        { list: [
          { ic: 'bell', tone: 'warn', nm: '신규 출퇴근 기능 안내', badge: '노출중', bt: 'success', sub: '~5/31', val: '편집' },
          { ic: 'bell', tone: 'muted', nm: '건강검진 안내', badge: '예약', bt: 'muted', sub: '6/1~6/7', val: '편집' },
        ] },
      ] },
    ] },
    'ad-forms': { blocks: [
      { sec: '결재 양식', more: '12종', list: [
        { ic: 'fileText', tone: 'accent', nm: '연차신청 · 출결정정 · 연차계획서', sub: '근태·휴가 양식', val: '4종' },
        { ic: 'fileText', tone: 'muted', nm: '물품신청 · 수리요청서 · 업무기안', sub: '업무·지원 양식', val: '5종' },
        { ic: 'fileText', tone: 'muted', nm: '양식신청 · 연차촉진통보서 외', sub: '기타 양식', val: '3종' },
      ] },
      { btns: [{ t: '양식 편집', ic: 'edit', primary: true }] },
    ] },
    'ad-audit': { tabs: [
      { label: '감사센터', blocks: [
        { sec: '감사 로그', more: '오늘 8건', list: [
          { av: '백정민', nm: '민감정보 열람', badge: '접근', bt: 'warn', sub: '급여 대장 · 14:02', val: '14:02' },
          { av: '백민', nm: '재고 데이터 내보내기', badge: '내보내기', bt: 'accent', sub: 'CSV · 10:30', val: '10:30' },
        ] },
      ] },
      { label: '백업·복원', blocks: [
        { note: { tone: 'success', ic: 'shield', t: '백업 정상', s: '최근 백업 오늘 03:00 · 보관 30일' } },
        { list: [{ ic: 'shield', tone: 'success', nm: '오늘 03:00 자동 백업', sub: '전체 · 1.2GB', val: '정상' }] },
        { btns: [{ t: '지금 백업', ic: 'shield', primary: true }, { t: '복원', ic: 'refresh' }] },
      ] },
      { label: '급여 이상치', cnt: 1, blocks: [
        { note: { tone: 'danger', t: '급여 이상치 1건', s: '병동팀 야간수당 누락 감지' } },
        { list: [{ ic: 'alertTri', tone: 'danger', nm: '야간수당 누락', badge: '이상', bt: 'danger', sub: '병동팀 1건 · +98,810', val: '확인' }] },
      ] },
      { label: '시스템 로그', blocks: [
        { sec: '시스템 로그', list: [
          { ic: 'fileText', tone: 'warn', nm: '푸시 발송 실패', badge: 'WARN', bt: 'warn', sub: '13:24 · 토큰 만료 3건' },
          { ic: 'fileText', tone: 'danger', nm: 'API 타임아웃', badge: 'ERROR', bt: 'danger', sub: '02:11 · 외부 결제 연동' },
        ] },
      ] },
    ] },

    // ════════ 드릴다운: 상세 · 폼 ════════
    'hr-member-card': { title: '인사카드', build: function (p) { return [
      { profile: { av: p.name, nm: p.name, code: p.code, role: (p.dept || '') + ' · ' + (p.pos || ''), chips: [{ t: '재직중', tone: 'success' }, { t: p.employ || '정규직', tone: 'accent' }] } },
      { meta: [['입사일', p.join || '-'], ['근속', p.tenure || '-'], ['직급', p.pos || '-']] },
      { sec: '인사 이력 타임라인', timeline: [
        { d: p.join || '-', t: '입사 · ' + (p.dept || ''), tone: 'muted' },
        { d: '2023.06.01', t: '승진 · 책임 → 선임', tone: 'accent' },
        { d: '2024.09.15', t: '교육 이수 · BLS 자격 갱신', tone: 'warn' },
        { d: '2025.12.30', t: '우수사원 표창', tone: 'success' },
      ] },
      { sec: '최근 활동', list: [
        { ic: 'clock', tone: 'accent', nm: '출근', sub: '5/10 09:02 (정상)' },
        { ic: 'calendar', tone: 'warn', nm: '연차 신청', sub: '5/20-21 결재 진행 중' },
        { ic: 'fileText', tone: 'muted', nm: '재직증명서 발급', sub: '5/8' },
      ] },
      { sec: '급여·계약', list: [
        { ic: 'won', tone: 'success', nm: '기본급', sub: '월 지급', val: '3,200,000' },
        { ic: 'fileText', tone: 'accent', nm: '근로계약서', sub: '영구 보관', val: '열람' },
      ] },
      { sec: '교육·자격', list: [
        { ic: 'star', tone: 'success', nm: '간호사 면허', badge: '유효', bt: 'success', val: '정상' },
        { ic: 'star', tone: 'warn', nm: 'BLS 자격', badge: 'D-30', bt: 'warn', val: '갱신 임박' },
      ] },
      { btns: [{ t: '정보 수정', ic: 'edit', primary: true }, { t: '발령 등록', ic: 'send', nav: 'hr-appoint-new' }] },
    ]; } },
    'hr-member-new': { title: '신규 직원 등록', blocks: [
      { wizard: { submit: '정보 저장하기', steps: [
        { title: '인적사항', fields: [
          { k: 'photo' },
          { k: 'head', l: '필수 입력' },
          { k: 'row', cols: [
            { k: 'text', l: '성명', req: true, ph: '성명을 입력하세요' },
            { k: 'text', l: '주민번호', ph: '000000-0000000' },
          ] },
          { k: 'tel', l: '연락처 (개인)', ph: '010-1234-5678' },
          { k: 'text', l: '주소', ph: '상세 주소 입력' },
          { k: 'head', l: '부가 정보' },
          { k: 'text', l: '내선번호', ph: '1234' },
          { k: 'head', l: '면허 / 자격 사항' },
          { k: 'row', cols: [
            { k: 'text', l: '자격 명칭', ph: '간호사 등' },
            { k: 'text', l: '면허 번호', ph: '번호 입력' },
          ] },
          { k: 'date', l: '취득 일자' },
          { k: 'textarea', l: '기타 내용', ph: '발급기관, 세부 자격 범위, 특이사항 등을 자유롭게 입력' },
        ] },
        { title: '소속·근무', fields: [
          { k: 'head', l: '소속 및 직책' },
          { k: 'row', cols: [
            { k: 'select', l: '사업체', v: '박철홍정형외과', opts: ['박철홍정형외과', '수연의원', 'MSO 본사'] },
            { k: 'select', l: '부서/팀', v: '진료부', opts: ['진료부', '간호부 · 병동팀', '간호부 · 외래팀', '간호부 · 수술팀', '경영지원팀'] },
          ] },
          { k: 'select', l: '직함', v: '간호사', opts: ['병원장', '간호부장', '수석', '책임', '주임', '간호사', '임상병리사', '사원', '이사'] },
          { k: 'head', l: '근무 조건' },
          { k: 'row', cols: [
            { k: 'date', l: '입사일', req: true, v: '2026-05-12' },
            { k: 'seg', l: '고용형태', v: '정규직', opts: ['정규직', '계약직'] },
          ] },
          { k: 'select', l: '수습 기간 설정', v: '수습 없음', opts: ['수습 없음', '1개월', '2개월', '3개월', '6개월'] },
          { k: 'head', l: '⏱ 상세 근로 시간 설정' },
          { k: 'row', cols: [
            { k: 'num', l: '주당 근로시간 (시간)', v: '40' },
            { k: 'num', l: '주당 근무일수 (일)', v: '5' },
          ] },
          { k: 'multiselect', l: '지정 스케줄 (근무형태)', sub: '중복 선택 가능', action: '＋ 새 유형 추가', v: ['주간(Day)'], opts: ['주간(Day)', '오후(Evening)', '야간(Night)', '교대(3교대)'] },
          { k: 'cap', l: '회사·조직에 등록된 근무유형만 선택할 수 있습니다. 추가 유형을 등록하면 주간 로테이션 스케줄로 활용됩니다.' },
        ] },
        { title: '급여·보험', fields: [
          { k: 'summary', items: [['총 급여', '0원'], ['시급', '0원']], note: '과세 0원 · 비과세 0원 · 월 소정근로시간 209시간 기준' },
          { k: 'head', l: '월 급여 및 고정 수당 (과세)' },
          { k: 'row', cols: [{ k: 'num', l: '기본급 (월)', ph: '0' }, { k: 'num', l: '직책수당', ph: '0' }] },
          { k: 'row', cols: [{ k: 'num', l: '연장근로수당', ph: '0' }, { k: 'num', l: '야간근로수당', ph: '0' }] },
          { k: 'row', cols: [{ k: 'num', l: '휴일근로수당', ph: '0' }, { k: 'num', l: '연차휴가수당', ph: '0' }] },
          { k: 'head', l: '비과세 수당 항목' },
          { k: 'row', cols: [{ k: 'num', l: '식대', v: '200,000' }, { k: 'num', l: '자가운전', ph: '0' }] },
          { k: 'row', cols: [{ k: 'num', l: '보육수당', ph: '0' }, { k: 'num', l: '연구비', ph: '0' }] },
          { k: 'num', l: '기타 비과세', ph: '0' },
          { k: 'head', l: '사회보험 및 복지 설정' },
          { k: 'toggle', l: '국민연금', v: true },
          { k: 'toggle', l: '건강보험', v: true },
          { k: 'toggle', l: '고용보험', v: true },
          { k: 'toggle', l: '산재보험', v: true },
          { k: 'toggle', l: '두루누리 지원 (80%)', sub: '소규모 사업장 보험료 지원', v: false },
          { k: 'toggle', l: '기초생활수급 / 차상위', v: false },
        ] },
      ] } },
    ] },
    'hr-appoint-new': { title: '새 발령 등록', blocks: [
      { sec: '발령 정보', form: [
        { l: '대상 직원', type: 'select', v: '송소현', opts: ['박철홍', '김지오', '박유진', '송소현', '오민호', '이가연'] },
        { l: '발령 종류', type: 'select', v: '부서이동', opts: ['부서이동', '승진', '직무변경', '정직원 전환'] },
        { l: '현재', type: 'text', v: '간호부 · 외래팀' },
        { l: '변경', type: 'text', ph: '간호부 · 병동팀' },
        { l: '발령일', type: 'date', v: '2026-05-15' },
        { l: '사유', type: 'textarea', ph: '발령 사유를 입력하세요' },
      ], submit: { t: '발령 상신', ic: 'send' } },
    ] },
    'hr-edu-new': { title: '교육 등록', blocks: [
      { sec: '교육 정보', form: [
        { l: '교육명', type: 'text', ph: '예: 감염관리 교육' },
        { l: '구분', type: 'select', v: '법정교육', opts: ['법정교육', '직무교육', '자격 재인증'] },
        { l: '대상', type: 'select', v: '전직원', opts: ['전직원', '간호부', '진료부', '수술팀', '외래팀'] },
        { l: '마감일', type: 'date', v: '2026-05-28' },
      ], submit: { t: '교육 등록', ic: 'check' } },
    ] },
    'wf-license-card': { title: '면허·자격증 상세', build: function (p) { return [
      { profile: { av: '면', nm: p.nm, role: p.name + ' · ' + p.body, chips: [{ t: p.status, tone: p.tone }] } },
      { meta: [['발급일', p.issued], ['만료일', p.expiry], ['상태', p.status]] },
      { sec: '상세 정보', kv: [
        { l: '면허·자격증명', v: p.nm },
        { l: '보유 직원', v: p.name },
        { l: '발급기관', v: p.body },
        { l: '자격증 번호', v: p.no },
        { l: '발급일', v: p.issued },
        { l: '만료일', v: p.expiry, tone: p.tone === 'success' ? 'success' : 'danger' },
      ] },
      { note: p.tone === 'danger'
        ? { tone: 'danger', ic: 'alertTri', t: '만료된 면허입니다', s: '즉시 갱신이 필요합니다. 갱신 후 만료일을 업데이트하세요.' }
        : (p.tone === 'warn' ? { tone: 'warn', ic: 'alertTri', t: '만료 임박 (90일 이내)', s: '갱신 절차를 시작하세요.' } : { tone: 'success', ic: 'checkCircle', t: '유효한 면허', s: '추적 중입니다.' }) },
      { btns: [{ t: '정보 수정', ic: 'edit', primary: true }, { t: '갱신 등록', ic: 'refresh', nav: 'wf-license-new' }] },
    ]; } },
    'wf-license-new': { title: '면허·자격증 등록', blocks: [
      { sec: '면허·자격증 정보', form: [
        { l: '직원', type: 'select', v: '이가연', opts: ['박철홍', '김지오', '박유진', '이가연', '송소현', '한지수', '정해린'] },
        { l: '면허·자격증명 *', type: 'text', ph: '예: 간호사 면허' },
        { l: '자격증 번호', type: 'text', ph: '예: 제12345호' },
        { l: '발급기관', type: 'text', ph: '예: 보건복지부' },
        { l: '발급일', type: 'date' },
        { l: '만료일', type: 'date' },
        { l: '메모', type: 'textarea', ph: '비고 사항' },
      ], submit: { t: '면허·자격증 등록', ic: 'check' } },
    ] },
    'wf-event-new': { title: '경조사 신청', blocks: [
      { sec: '경조사 정보', form: [
        { l: '구분', type: 'select', v: '결혼', opts: ['결혼', '출산', '조사', '회갑', '기타'] },
        { l: '대상 직원', type: 'select', v: '박지영', opts: ['박지영', '김민정', '이가연', '오민호'] },
        { l: '일자', type: 'date', v: '2026-05-25' },
        { l: '지원 항목', type: 'select', v: '화환 + 경조금', opts: ['화환 + 경조금', '경조금', '화환'] },
        { l: '비고', type: 'textarea', ph: '추가 메모' },
      ], submit: { t: '경조사 신청', ic: 'check' } },
    ] },
    'st-transfer-new': { title: '재고 이관 신청', blocks: [
      { sec: '이관 신청서', form: [
        { l: '품목', type: 'text', ph: '예: 라텍스 장갑 (S)' },
        { l: '수량', type: 'text', ph: '10 BOX' },
        { l: '출고 부서', type: 'select', v: '외래팀', opts: ['외래팀', '병동팀', '수술팀', '검사팀'] },
        { l: '입고 부서', type: 'select', v: '병동팀', opts: ['외래팀', '병동팀', '수술팀', '검사팀'] },
        { l: '이관 사유', type: 'textarea', ph: '이관 사유를 입력하세요' },
      ], submit: { t: '이관 신청', ic: 'send' } },
    ] },
    'st-order-new': { title: '새 발주서', blocks: [
      { sec: '발주 정보', form: [
        { l: '품목', type: 'text', ph: '예: 멸그루브 18cm' },
        { l: '거래처', type: 'select', v: '메디칼서플라이', opts: ['메디칼서플라이', '한국의료기', '대한위생', '서울약품'] },
        { l: '수량', type: 'text', ph: '20 EA' },
        { l: '희망 납기', type: 'date', v: '2026-05-20' },
        { l: '비고', type: 'textarea', ph: '발주 메모' },
      ], submit: { t: '발주 상신', ic: 'send' } },
    ] },
    'st-order-card': { title: '발주 상세', build: function (p) { return [
      { profile: { av: '발', nm: p.nm, code: p.qty, role: p.vendor + ' · ' + p.state, chips: [{ t: p.state, tone: p.tone }] } },
      { meta: [['수량', p.qty], ['금액', p.amt + '원'], ['진행', p.step]] },
      { sec: '발주 상태', list: [
        { ic: 'send', tone: p.tone, nm: p.vendor, badge: p.state, bt: p.tone, sub: '결제 조건 월말 30일' },
        { ic: 'won', tone: 'muted', nm: '발주 금액', val: p.amt + '원' },
      ] },
      { sec: '결재선', timeline: [
        { d: '기안', t: '백민 · 재고담당', tone: 'success' },
        { d: '검토', t: '박유진 · 경영지원', tone: (p.step === '완료' || p.step === '발송') ? 'success' : 'accent' },
        { d: '승인', t: '박철홍 · 병원장', tone: (p.step === '완료' || p.step === '발송') ? 'success' : 'muted' },
      ] },
      { btns: [{ t: '발주서 출력', ic: 'fileText', primary: true }] },
    ]; } },
    'st-vendor-card': { title: '거래처 상세', build: function (p) { return [
      { profile: { av: p.nm, nm: p.nm, role: p.cat + ' · ' + p.term, chips: [{ t: p.cat, tone: 'accent' }] } },
      { meta: [['공급 품목', p.items + '종'], ['연 거래액', p.ytd], ['결제', p.term]] },
      { sec: '연락처', list: [
        { ic: 'phone', tone: 'accent', nm: '대표 번호', val: p.tel },
        { ic: 'fileText', tone: 'muted', nm: '거래명세서', sub: '월별 발행', val: '열람' },
      ] },
      { btns: [{ t: '발주서 작성', ic: 'plus', primary: true, nav: 'st-order-new' }] },
    ]; } },
    'st-item-card': { title: '품목 상세', build: function (p) { return [
      { profile: { av: '품', nm: p.nm, role: p.cat + ' · ' + p.dept, chips: [{ t: p.state, tone: p.tone }] } },
      { meta: [['현재 재고', p.qty], ['안전재고', p.safe], ['상태', p.state]] },
      { note: p.tone === 'danger'
        ? { tone: 'danger', t: '재고 부족 — 발주 권장', s: '안전재고 미만입니다.' }
        : (p.tone === 'warn' ? { tone: 'warn', t: '재고 주의', s: '안전재고에 근접했습니다.' } : { tone: 'success', ic: 'checkCircle', t: '재고 정상', s: '안전재고 이상 확보' }) },
      { sec: '최근 입출고', list: [
        { nm: p.nm, badge: '입고', bt: 'success', sub: '24 · 백민 · 5/11' },
        { nm: p.nm, badge: '출고', bt: 'accent', sub: '8 · 이나림 · 5/10' },
      ] },
      { btns: [{ t: '발주하기', ic: 'send', primary: true, nav: 'st-order-new' }, { t: '입출고 등록', ic: 'plus' }] },
    ]; } },
    'rl-role-card': { title: '역할 권한', build: function (p) { return [
      { profile: { av: '권', nm: p.role, role: p.scope, chips: [{ t: p.scope, tone: p.rtone || 'muted' }] } },
      { sec: '모듈별 권한', cols: ['모듈', '권한'], table: p.perms, w: '1.4fr 1fr' },
      { btns: [{ t: '권한 수정', ic: 'edit', primary: true }] },
    ]; } },
    'op-popup-new': { title: '새 팝업', blocks: [
      { sec: '팝업 설정', form: [
        { l: '제목', type: 'text', ph: '공지 제목' },
        { l: '내용', type: 'textarea', ph: '팝업 본문' },
        { l: '노출 시작', type: 'date', v: '2026-05-12' },
        { l: '노출 종료', type: 'date', v: '2026-05-31' },
        { l: '대상', type: 'select', v: '전직원', opts: ['전직원', '간호부', '관리자'] },
      ], submit: { t: '팝업 등록', ic: 'check' } },
    ] },
  };
})();

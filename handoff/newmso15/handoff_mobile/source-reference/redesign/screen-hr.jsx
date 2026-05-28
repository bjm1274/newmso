// MSO redesign — 인사관리 (HR)
// 37장 → 7개 통합 서브메뉴. 사이드바2 3안 비교.

// ═══════════════════════════════════════════════════════════════════
// 서브메뉴 정의 (3안 공통 데이터 + 변형)
// ═══════════════════════════════════════════════════════════════════

const HR_SUBMENUS = {
  member:   { id:'member',   label:'구성원',         icon:'users',     merge: ['구성원 리스트', '인사발령', '교육·자격 이동'],            cnt: 3 },
  attend:   { id:'attend',   label:'근태',           icon:'clock',     merge: ['근태 대시보드', '근무표 생성', '근무표 AI 자동생성', '3교대 마법사', '근태달력'], cnt: 5 },
  leave:    { id:'leave',    label:'연차·휴가',      icon:'calendar',  merge: ['연차 잔여', '연차 신청', '소멸 알림', '계획서'],          cnt: 4 },
  abnormal: { id:'abnormal', label:'근태이상 감지',  icon:'alertTri',  merge: ['지각·조퇴 분석', '조기퇴근 감지'],                       cnt: 2 },
  payroll:  { id:'payroll',  label:'급여 워크센터',  icon:'won',       merge: ['급여 대시보드', '정산', '대장', '퇴직정산', '원천징수', '4대보험', '시뮬레이터', '퇴직연금', '임금피크제', '최저임금·비과세', '통상임금', '미지급 수당', '무급결근 차감'], cnt: 13, primary:true },
  welfare:  { id:'welfare',  label:'복지',           icon:'star',      merge: ['경조사', '건강검진', '면허·자격', '의료기기 점검'],       cnt: 5 },
  docs:     { id:'docs',     label:'계약·문서',      icon:'fileText',  merge: ['계약 관리', '계약서 자동생성', '문서보관함', '증명서', '서류제출'], cnt: 5 },
};

const HR_LAYOUTS = {
  A: {
    label: 'A · 평면 7개',
    desc:  '단일 평면 리스트. 그룹 없음. 가장 단순.',
    groups: [{ label:null, items:['member','attend','leave','abnormal','payroll','welfare','docs'] }]
  },
  B: {
    label: 'B · 4그룹',
    desc:  '인력 / 근태·휴가 / 보상 / 복지·문서 — 의미 단위로 묶음.',
    groups: [
      { label:'인력',          items:['member'] },
      { label:'근태·휴가',     items:['attend','leave','abnormal'] },
      { label:'보상',          items:['payroll'] },
      { label:'복지·문서',     items:['welfare','docs'] },
    ]
  },
  C: {
    label: 'C · 활동 흐름',
    desc:  '일상(근태) → 보상(급여) → 인력관리 → 문서. 자주 쓰는 순.',
    groups: [
      { label:'일상 업무',     items:['attend','leave','abnormal'] },
      { label:'보상',          items:['payroll'] },
      { label:'인력 관리',     items:['member','welfare'] },
      { label:'문서',          items:['docs'] },
    ]
  },
};

// ═══════════════════════════════════════════════════════════════════
// 사이드바2
// ═══════════════════════════════════════════════════════════════════

const HrSidebar2 = ({ active, onPick, layout = 'B' }) => {
  const cfg = HR_LAYOUTS[layout];
  return (
    <aside className="sidebar2">
      <div className="s2-scroll" style={{display:'grid', gap: 2, flex: 1, overflow:'auto'}}>
        {cfg.groups.map((g, gi) => (
          <React.Fragment key={gi}>
            {g.label && <div className={'s2-group-lbl '+(gi>0?'mt':'')}>{g.label}</div>}
            {g.items.map(id => {
              const m = HR_SUBMENUS[id];
              return (
                <div key={id} className={'s2-item board-item '+(id===active?'on':'')} onClick={()=>onPick(id)}>
                  <Icon name={m.icon} size={14}/>
                  <span style={{flex: 1}}>{m.label}</span>
                  {m.primary && <span className="s2-tag" style={{background:'#FEF3C7', color:'#92400E'}}>★</span>}
                  <span className="board-cnt">{m.cnt}</span>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="s2-foot">
        <div className="small" style={{padding: '0 6px', fontSize: 11}}>현재 {cfg.label}</div>
      </div>
    </aside>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 메인 화면
// ═══════════════════════════════════════════════════════════════════

const HrScreen = ({ active = 'payroll', layout, setLayout }) => {
  const m = HR_SUBMENUS[active] || HR_SUBMENUS.payroll;
  const [attendTab, setAttendTab] = React.useState('dash');
  return (
    <div className="main"><div className="content">
      <div className="mod-pageheader">
        <div>
          <div className="addon-h1">{m.label}</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <div className="seg" style={{padding: 2}}>
            <button className={layout==='A'?'on':''} onClick={()=>setLayout('A')} style={{padding:'6px 12px', fontSize: 11}}>A · 평면</button>
            <button className={layout==='B'?'on':''} onClick={()=>setLayout('B')} style={{padding:'6px 12px', fontSize: 11}}>B · 그룹</button>
            <button className={layout==='C'?'on':''} onClick={()=>setLayout('C')} style={{padding:'6px 12px', fontSize: 11}}>C · 활동</button>
          </div>
          {active==='payroll' && (
            <>
              <Btn icon="file">정산 마감</Btn>
              <Btn variant="primary" icon="send">이번달 지급 처리</Btn>
            </>
          )}
          {active==='member' && (
            <>
              <Btn icon="filter">필터</Btn>
              <Btn variant="primary" icon="plus">구성원 추가</Btn>
            </>
          )}
          {active==='attend' && (
            <>
              <Btn>오늘</Btn>
              <Btn variant="primary" icon="calendar" onClick={()=>setAttendTab('schedule')}>근무표 편성</Btn>
            </>
          )}
          {active==='leave' && (
            <>
              <Btn>연차 정책</Btn>
              <Btn variant="primary" icon="plus">연차 신청</Btn>
            </>
          )}
          {active==='abnormal' && (
            <>
              <Btn>이번 주</Btn>
              <Btn variant="primary">규칙 설정</Btn>
            </>
          )}
          {active==='welfare' && (
            <Btn variant="primary" icon="plus">새 기록</Btn>
          )}
          {active==='docs' && (
            <>
              <Btn icon="file">템플릿</Btn>
              <Btn variant="primary" icon="plus">새 계약서</Btn>
            </>
          )}
        </div>
      </div>

      {/* 통합 매핑 안내 */}
      <div className="hr-merge-banner">
        <div className="hr-merge-l">
          <span className="hr-merge-kicker">통합된 원본 화면 {m.cnt}장</span>
          <div className="hr-merge-chips">
            {m.merge.map((t,i) => <span key={i} className="hr-merge-chip">#{i+1} {t}</span>)}
          </div>
        </div>
        <div className="hr-merge-r"></div>
      </div>

      {active==='payroll'   && <PayrollDashboard/>}
      {active==='member'    && <MemberWorkcenter/>}
      {active==='attend'    && <AttendWorkcenter tab={attendTab} setTab={setAttendTab}/>}
      {active==='leave'     && <LeaveWorkcenter/>}
      {active==='abnormal'  && <AbnormalWorkcenter/>}
      {active==='welfare'   && <WelfareWorkcenter/>}
      {active==='docs'      && <DocsWorkcenter/>}
    </div></div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 급여 워크센터 — 메인 대시보드 (이 한 화면이 13장 대체)
// ═══════════════════════════════════════════════════════════════════

const PAYROLL_MODULES = [
  { id:'settle',   n:'급여 정산',     d:'월별 정산 워크플로',    badge:'진행 중', tone:'warn' },
  { id:'ledger',   n:'급여 대장',     d:'월별 직원별 내역',      badge:null },
  { id:'sim',      n:'급여 시뮬레이터', d:'예상 지급액 미리보기', badge:null },
  { id:'retsettle',n:'퇴직 정산',     d:'정산서·중간정산',       badge:null },
  { id:'retpen',   n:'퇴직연금',      d:'DC/DB 가입자 현황',    badge:null },
  { id:'social',   n:'4대보험',       d:'EDI 신고·증명서',       badge:'5/22', tone:'warn' },
  { id:'wht',      n:'원천징수',      d:'파일 생성·연말정산',    badge:'5/20', tone:'warn' },
  { id:'peak',     n:'임금피크제',    d:'적용 대상·비율',        badge:'1명' },
  { id:'minwage',  n:'최저임금 점검', d:'2026 시급 검증',        badge:'2건', tone:'danger' },
  { id:'taxfree',  n:'비과세 점검',   d:'식대·교통비 한도',      badge:null },
  { id:'normal',   n:'통상임금 계산기', d:'평균임금·연차수당',   badge:null },
  { id:'unpaid',   n:'미지급 수당 점검', d:'야간·휴일·연장',     badge:'1건', tone:'danger' },
  { id:'absent',   n:'무급결근 차감', d:'자동 차감 규칙',        badge:null },
];

const PayrollDashboard = () => {
  const [mod, setMod] = React.useState(null);
  if (mod) return <PayrollModule modKey={mod} onBack={()=>setMod(null)}/>;
  return <PayrollMain onPick={setMod}/>;
};

const PayrollMain = ({ onPick }) => {
  const month = '2026년 5월';
  return (
    <>
      {/* 이번 달 정산 상태 — 다크 hero */}
      <div className="pr-hero">
        <div className="pr-hero-l">
          <div className="pr-hero-kicker">이번 달 정산 · {month}</div>
          <div className="pr-hero-title">정산 중 <span className="pr-hero-frac">3/4 단계</span></div>
          <div className="pr-hero-steps">
            <div className="pr-step done"><div className="pr-step-num"><Icon name="check" size={11}/></div><div className="pr-step-lbl">근태 마감</div><div className="pr-step-ts">5/3</div></div>
            <div className="pr-step done"><div className="pr-step-num"><Icon name="check" size={11}/></div><div className="pr-step-lbl">수당·공제</div><div className="pr-step-ts">5/7</div></div>
            <div className="pr-step done"><div className="pr-step-num"><Icon name="check" size={11}/></div><div className="pr-step-lbl">결재 상신</div><div className="pr-step-ts">5/10</div></div>
            <div className="pr-step on"><div className="pr-step-num">4</div><div className="pr-step-lbl">지급 처리</div><div className="pr-step-ts">예정 5/15</div></div>
            <div className="pr-step pending"><div className="pr-step-num">5</div><div className="pr-step-lbl">원천징수 신고</div><div className="pr-step-ts">예정 5/20</div></div>
          </div>
        </div>
        <div className="pr-hero-r">
          <div className="pr-hero-amt-lbl">이번 달 총 지급 예정</div>
          <div className="pr-hero-amt">128,450,000<span className="u">원</span></div>
          <div className="pr-hero-amt-sub">27명 · 전월 대비 <span className="up">+2.1%</span></div>
          <button className="pr-hero-cta">5/15 지급 처리 시작 →</button>
        </div>
      </div>

      {/* 8 KPI 그리드 */}
      <div className="pr-kpi-grid">
        <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="users" size={18} color="#3B82F6"/></div><div className="pr-kpi-r"><div className="lbl">정산 대상자</div><div className="v">27<span className="u">명</span></div><div className="sub">상시 25 · 시급 2</div></div></div>
        <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="clock" size={18} color="#F59E0B"/></div><div className="pr-kpi-r"><div className="lbl">총 근로시간</div><div className="v">4,632<span className="u">h</span></div><div className="sub">초과 312h · 야간 184h</div></div></div>
        <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="won" size={18} color="#10B981"/></div><div className="pr-kpi-r"><div className="lbl">기본급 합계</div><div className="v">94,200,000<span className="u">원</span></div><div className="sub">전월 대비 +1.2%</div></div></div>
        <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="plus" size={18} color="#8B5CF6"/></div><div className="pr-kpi-r"><div className="lbl">수당</div><div className="v">22,150,000<span className="u">원</span></div><div className="sub">초과 14M · 야간 6M · 기타 2M</div></div></div>
        <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="arrowDown" size={18} color="#EF4444"/></div><div className="pr-kpi-r"><div className="lbl">공제</div><div className="v">18,900,000<span className="u">원</span></div><div className="sub">4대보험 14M · 소득세 4.9M</div></div></div>
        <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="shield" size={18} color="#EC4899"/></div><div className="pr-kpi-r"><div className="lbl">4대보험 신고</div><div className="v">5/22<span className="u">예정</span></div><div className="sub">국민·건강·고용·산재</div></div></div>
        <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="fileText" size={18} color="#06B6D4"/></div><div className="pr-kpi-r"><div className="lbl">원천징수 신고</div><div className="v">5/20<span className="u">예정</span></div><div className="sub">간이 25 · 일반 2</div></div></div>
        <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="bookmark" size={18} color="#7C3AED"/></div><div className="pr-kpi-r"><div className="lbl">퇴직금 충당</div><div className="v">4,820,000<span className="u">원</span></div><div className="sub">DC형 19 · DB형 8</div></div></div>
      </div>

      {/* 경고·점검 + 통합 모듈 빠른 이동 */}
      <div className="pr-row">
        <div className="card pr-alerts">
          <div className="card-row">
            <div className="ctitle">점검 필요 · 5건</div>
            <Btn size="sm">전체 점검 →</Btn>
          </div>
          <div className="pr-alert-list">
            <div className="pr-alert danger">
              <div className="pr-alert-tag">미지급 수당</div>
              <div className="pr-alert-body"><b>홍자비</b> · 야간수당 12시간 미반영 (4월) <span className="pr-alert-amt">+ 184,000원</span></div>
              <button className="pr-alert-act">반영 처리</button>
            </div>
            <div className="pr-alert warn">
              <div className="pr-alert-tag">최저임금</div>
              <div className="pr-alert-body">시급 직원 <b>2명</b> 2026 최저시급 미달 가능성 (시급 9,800원 / 기준 10,030원)</div>
              <button className="pr-alert-act">시뮬레이션 →</button>
            </div>
            <div className="pr-alert warn">
              <div className="pr-alert-tag">통상임금</div>
              <div className="pr-alert-body">정기상여 포함 재산정 필요 — 평균 통상임금 변동 <b>+3.2%</b></div>
              <button className="pr-alert-act">계산기 →</button>
            </div>
            <div className="pr-alert">
              <div className="pr-alert-tag">무급결근</div>
              <div className="pr-alert-body"><b>이나림</b> · 5월 1일(노동절) 결근 차감 확정 (-127,000원)</div>
              <button className="pr-alert-act">상세</button>
            </div>
            <div className="pr-alert">
              <div className="pr-alert-tag">임금피크</div>
              <div className="pr-alert-body"><b>박철홍</b> 임금피크 적용일 (만 60세 도래) — 6월부터 80% 적용</div>
              <button className="pr-alert-act">설정</button>
            </div>
          </div>
        </div>

        <div className="card pr-modules">
          <div className="card-row">
            <div className="ctitle">통합된 13개 모듈 빠른 이동</div>
          </div>
          <div className="pr-mod-grid">
            {PAYROLL_MODULES.map(mod => (
              <button key={mod.id} className="pr-mod" onClick={()=>onPick(mod.id)}>
                <div className="pr-mod-top">
                  <span className="pr-mod-name">{mod.n}</span>
                  {mod.badge && <span className={'pr-mod-badge'+(mod.tone==='danger'?' danger':mod.tone==='warn'?'':'')}
                    style={mod.tone==='danger'?{background:'var(--danger-soft)', color:'var(--danger)'}:undefined}>{mod.badge}</span>}
                </div>
                <div className="pr-mod-desc">{mod.d}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 공통 모듈 디테일 렌더러
const PayrollModule = ({ modKey, onBack }) => {
  const mod = PAYROLL_MODULES.find(m => m.id === modKey);
  if (!mod) return null;
  return (
    <>
      <div className="pr-mod-head">
        <button className="pr-mod-back" onClick={onBack}>← 급여 워크센터 대시보드</button>
      </div>
      <div className="pr-mod-title-row">
        <div>
          <div className="pr-mod-h1">{mod.n}</div>
          <div className="pr-mod-sub">{mod.d}</div>
        </div>
        {mod.badge && <Chip tone={mod.tone||'accent'}>{mod.badge}</Chip>}
      </div>
      {modKey==='settle'    && <ModSettle/>}
      {modKey==='ledger'    && <ModLedger/>}
      {modKey==='sim'       && <ModSim/>}
      {modKey==='retsettle' && <ModRetSettle/>}
      {modKey==='retpen'    && <ModRetPen/>}
      {modKey==='social'    && <ModSocial/>}
      {modKey==='wht'       && <ModWHT/>}
      {modKey==='peak'      && <ModPeak/>}
      {modKey==='minwage'   && <ModMinWage/>}
      {modKey==='taxfree'   && <ModTaxFree/>}
      {modKey==='normal'    && <ModNormal/>}
      {modKey==='unpaid'    && <ModUnpaid/>}
      {modKey==='absent'    && <ModAbsent/>}
    </>
  );
};

const ModSettle = () => (
  <>
    <div className="hr-kpi-row">
      <div className="hr-kpi tone-warn"><div className="lbl">정산 진행 단계</div><div className="v">3/4</div><div className="sub">지급 5/15 화요일</div></div>
      <div className="hr-kpi"><div className="lbl">정산 대상자</div><div className="v">27<span className="u">명</span></div><div className="sub">상시 25 · 시급 2</div></div>
      <div className="hr-kpi tone-success"><div className="lbl">계산 완료</div><div className="v">22<span className="u">명</span></div><div className="sub">5명 확인 필요</div></div>
      <div className="hr-kpi"><div className="lbl">총 지급 예정액</div><div className="v">128.4<span className="u">M원</span></div><div className="sub">전월 +2.1%</div></div>
    </div>
    <div className="card">
      <div className="card-row"><div className="ctitle">정산 5단계 워크플로</div><Btn size="sm" variant="primary">다음 단계 시작</Btn></div>
      <div className="cl-steps">
        <div className="cl-step done"><div className="cl-step-num"><Icon name="check" size={11}/></div><div className="cl-step-body"><div className="cl-step-t">1. 근태 마감 (5/3)</div><div className="cl-step-d">5월 월간 근로시간 확정 · 지각·조퇴 반영</div></div></div>
        <div className="cl-step done"><div className="cl-step-num"><Icon name="check" size={11}/></div><div className="cl-step-body"><div className="cl-step-t">2. 수당·공제 계산 (5/7)</div><div className="cl-step-d">초과·야간·휴일 수당 + 4대보험·소득세 자동 산정</div></div></div>
        <div className="cl-step done"><div className="cl-step-num"><Icon name="check" size={11}/></div><div className="cl-step-body"><div className="cl-step-t">3. 결재 상신 (5/10)</div><div className="cl-step-d">월급지급 결재 — 검토 · 전결 주안</div></div></div>
        <div className="cl-step on"><div className="cl-step-num">4</div><div className="cl-step-body"><div className="cl-step-t">4. 지급 처리 — 예정 5/15 (화)</div><div className="cl-step-d">은행 이체 파일 생성 + 발송</div></div></div>
        <div className="cl-step pending"><div className="cl-step-num">5</div><div className="cl-step-body"><div className="cl-step-t">5. 원천징수 신고 — 예정 5/20</div><div className="cl-step-d">국세청 제출 계산 · 지방세 포함</div></div></div>
      </div>
    </div>
  </>
);

const ModLedger = () => (
  <div className="card" style={{padding: 0}}>
    <div className="card-row" style={{padding:'12px 16px', margin:0, borderBottom:'1px solid var(--border)'}}>
      <div className="row" style={{gap: 6}}>
        <select className="board-sort"><option>2026년 5월</option><option>2026년 4월</option></select>
        <select className="board-sort"><option>전체 부서</option><option>진료부</option><option>간호부</option><option>경영지원팀</option></select>
      </div>
      <div className="row" style={{gap: 8}}>
        <Btn size="sm" icon="file">엑셀 내보내기</Btn>
        <Btn size="sm" variant="primary" icon="send">명세서 일괄 발송</Btn>
      </div>
    </div>
    <table className="data-tbl" style={{width:'100%'}}>
      <thead><tr><th>이름</th><th>부서</th><th style={{textAlign:'right'}}>기본급</th><th style={{textAlign:'right'}}>수당</th><th style={{textAlign:'right'}}>공제</th><th style={{textAlign:'right'}}>실수령</th><th>부대</th></tr></thead>
      <tbody>
        {[
          { n:'박철홍', d:'진료팀',   base: 8500000, allo: 1200000, ded: 1450000, net: 8250000 },
          { n:'김지오', d:'병동팀',   base: 4200000, allo: 1480000, ded:  890000, net: 4790000 },
          { n:'이나림', d:'외래팀',   base: 3800000, allo: 1240000, ded:  812000, net: 4228000 },
          { n:'백민',   d:'경영지원', base: 3200000, allo:  450000, ded:  620000, net: 3030000 },
          { n:'박유진', d:'경영지원', base: 3600000, allo:  680000, ded:  742000, net: 3538000 },
          { n:'홍자비', d:'경영지원', base: 2900000, allo:  420000, ded:  548000, net: 2772000 },
          { n:'송소현', d:'외래팀',   base: 2800000, allo:  380000, ded:  524000, net: 2656000 },
        ].map((r,i) => (
          <tr key={i}>
            <td><b style={{fontSize: 12.5}}>{r.n}</b></td>
            <td><span className="small">{r.d}</span></td>
            <td className="tnum" style={{textAlign:'right'}}>{r.base.toLocaleString()}</td>
            <td className="tnum" style={{textAlign:'right'}}><span style={{color:'var(--accent)'}}>+{r.allo.toLocaleString()}</span></td>
            <td className="tnum" style={{textAlign:'right'}}><span style={{color:'var(--danger)'}}>-{r.ded.toLocaleString()}</span></td>
            <td className="tnum" style={{textAlign:'right', fontWeight: 800}}>{r.net.toLocaleString()}</td>
            <td><Btn size="sm">PDF</Btn></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ModSim = () => (
  <div className="hr-row">
    <div className="card">
      <div className="card-row"><div className="ctitle">직원 선택 · 계산 조건</div></div>
      <div className="ap-form">
        <label><div className="lbl">대상 직원</div><select className="input"><option>이나림 · 외래팀 · 수간호사</option></select></label>
        <div className="row" style={{gap: 10}}>
          <label style={{flex: 1}}><div className="lbl">월 기본급</div><input className="input" defaultValue="3,800,000" style={{textAlign:'right'}}/></label>
          <label style={{flex: 1}}><div className="lbl">소정근로 (h)</div><input className="input" defaultValue="209" style={{textAlign:'right'}}/></label>
        </div>
        <div className="row" style={{gap: 10}}>
          <label style={{flex: 1}}><div className="lbl">예상 초과(h)</div><input className="input" defaultValue="18" style={{textAlign:'right'}}/></label>
          <label style={{flex: 1}}><div className="lbl">예상 야간(h)</div><input className="input" defaultValue="12" style={{textAlign:'right'}}/></label>
          <label style={{flex: 1}}><div className="lbl">예상 휴일(h)</div><input className="input" defaultValue="4" style={{textAlign:'right'}}/></label>
        </div>
        <Btn variant="primary">시뮬레이션 실행</Btn>
      </div>
    </div>
    <div className="card">
      <div className="card-row"><div className="ctitle">예상 지급액 (5월)</div></div>
      <div className="pr-sim-net">
        <div className="lbl">실수령 예상</div>
        <div className="v">4,228,000<span className="u">원</span></div>
        <div className="sub">전월 +152,000 (3.7%)</div>
      </div>
      <div className="pr-sim-breakdown">
        <div className="pr-sim-row"><span>기본급</span><b className="tnum">3,800,000</b></div>
        <div className="pr-sim-row"><span>초과수당</span><b className="tnum" style={{color:'var(--accent)'}}>+ 780,000</b></div>
        <div className="pr-sim-row"><span>야간수당</span><b className="tnum" style={{color:'var(--accent)'}}>+ 360,000</b></div>
        <div className="pr-sim-row"><span>휴일수당</span><b className="tnum" style={{color:'var(--accent)'}}>+ 100,000</b></div>
        <div className="pr-sim-row"><span>4대보험</span><b className="tnum" style={{color:'var(--danger)'}}>- 542,000</b></div>
        <div className="pr-sim-row"><span>소득세</span><b className="tnum" style={{color:'var(--danger)'}}>- 218,000</b></div>
        <div className="pr-sim-row"><span>지방세</span><b className="tnum" style={{color:'var(--danger)'}}>- 21,800</b></div>
      </div>
    </div>
  </div>
);

const ModRetSettle = () => (
  <div className="card">
    <div className="card-row"><div className="ctitle">올해 퇴직 정산 현황</div></div>
    <table className="data-tbl" style={{width:'100%'}}>
      <thead><tr><th>이름</th><th>퇴직일</th><th>근속</th><th style={{textAlign:'right'}}>퇴직금</th><th style={{textAlign:'right'}}>세액</th><th style={{textAlign:'right'}}>실수령</th><th>상태</th></tr></thead>
      <tbody>
        {[
          { n:'이종도', d:'2026.4.30', t:'1년 8개월', r: 18420000, tax:  892000, net: 17528000, s:'완료',   tone:'success' },
          { n:'경조원', d:'2026.5.15', t:'4년 2개월', r: 38260000, tax: 2840000, net: 35420000, s:'세액 대기', tone:'warn'    },
          { n:'(예정)',d:'2026.6.30',  t:'8년',       r: 64820000, tax: 7912000, net: 56908000, s:'예정',     tone:'muted'   },
        ].map((r,i) => (
          <tr key={i}>
            <td><b>{r.n}</b></td>
            <td className="tnum"><span className="small">{r.d}</span></td>
            <td><span className="small">{r.t}</span></td>
            <td className="tnum" style={{textAlign:'right', fontWeight: 800}}>{r.r.toLocaleString()}</td>
            <td className="tnum" style={{textAlign:'right'}}><span style={{color:'var(--danger)'}}>-{r.tax.toLocaleString()}</span></td>
            <td className="tnum" style={{textAlign:'right', fontWeight: 800, color:'var(--accent)'}}>{r.net.toLocaleString()}</td>
            <td><Chip tone={r.tone}>{r.s}</Chip></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ModRetPen = () => (
  <div className="hr-row">
    <div className="card">
      <div className="card-row"><div className="ctitle">가입 현황</div></div>
      <div className="hr-dept-list">
        <div className="hr-dept-row" style={{gridTemplateColumns:'90px 1fr 90px'}}>
          <div className="hr-dept-name">DC형</div>
          <div className="hr-dept-bar"><div className="hr-dept-seg" style={{width:'70%', background:'linear-gradient(90deg, #3B82F6, #2563EB)'}}/></div>
          <div className="tnum" style={{fontWeight: 800, textAlign:'right'}}>19<span className="small">/27</span></div>
        </div>
        <div className="hr-dept-row" style={{gridTemplateColumns:'90px 1fr 90px'}}>
          <div className="hr-dept-name">DB형</div>
          <div className="hr-dept-bar"><div className="hr-dept-seg" style={{width:'30%', background:'linear-gradient(90deg, #8B5CF6, #7C3AED)'}}/></div>
          <div className="tnum" style={{fontWeight: 800, textAlign:'right'}}>8<span className="small">/27</span></div>
        </div>
      </div>
      <div className="hr-prof-meta" style={{marginTop: 14}}>
        <div><span className="lbl">DC 납입</span><span className="tnum">84,250,000</span></div>
        <div><span className="lbl">DB 재용</span><span className="tnum">44,180,000</span></div>
        <div><span className="lbl">수익률</span><span className="tnum">+4.8%</span></div>
      </div>
    </div>
    <div className="card">
      <div className="card-row"><div className="ctitle">DC 납입금 현황 (이번달)</div></div>
      <table className="data-tbl" style={{width:'100%'}}>
        <thead><tr><th>직원</th><th style={{textAlign:'right'}}>납입액</th><th>납입일</th></tr></thead>
        <tbody>
          {[
            { n:'김지오', a: 350000, d:'5/5' },
            { n:'이나림', a: 316000, d:'5/5' },
            { n:'백민',   a: 266000, d:'5/5' },
            { n:'홍자비', a: 241000, d:'5/5' },
          ].map((r,i) => (
            <tr key={i}><td><b>{r.n}</b></td><td className="tnum" style={{textAlign:'right'}}>{r.a.toLocaleString()}</td><td className="tnum"><span className="small">{r.d}</span></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const ModSocial = () => (
  <>
    <div className="hr-kpi-row">
      {[
        { n:'국민연금', e: 5810, d: 5810, t: 11620 },
        { n:'건강보험', e: 4582, d: 4582, t:  9164 },
        { n:'고용보험', e:  890, d: 1156, t:  2046 },
        { n:'산재보험', e:    0, d: 1247, t:  1247 },
      ].map((b,i) => (
        <div key={i} className="hr-kpi">
          <div className="lbl">{b.n}</div>
          <div className="v tnum">{b.t.toLocaleString()}<span className="u">천원</span></div>
          <div className="sub">근로자 {b.e.toLocaleString()} · 사업주 {b.d.toLocaleString()}</div>
        </div>
      ))}
    </div>
    <div className="card">
      <div className="card-row"><div className="ctitle">EDI 신고 일정 (5/22)</div><Btn size="sm" variant="primary" icon="send">EDI 신고서 생성</Btn></div>
      <div className="cl-steps">
        <div className="cl-step done"><div className="cl-step-num"><Icon name="check" size={11}/></div><div className="cl-step-body"><div className="cl-step-t">1. 수행 상세 산정</div><div className="cl-step-d">5월 근로자·사업주 부담금 계산 완료</div></div></div>
        <div className="cl-step on"><div className="cl-step-num">2</div><div className="cl-step-body"><div className="cl-step-t">2. 입사/퇴사 반영</div><div className="cl-step-d">5월 입사 1 · 퇴사 0 — 확인 필요</div></div></div>
        <div className="cl-step pending"><div className="cl-step-num">3</div><div className="cl-step-body"><div className="cl-step-t">3. EDI 제출 — 예정 5/22</div><div className="cl-step-d">국민·건강·고용·산재 동시 신고</div></div></div>
        <div className="cl-step pending"><div className="cl-step-num">4</div><div className="cl-step-body"><div className="cl-step-t">4. 증명서 다운로드</div><div className="cl-step-d">자격상실 · 취득 증명 발급</div></div></div>
      </div>
    </div>
  </>
);

const ModWHT = () => (
  <>
    <div className="hr-kpi-row">
      <div className="hr-kpi"><div className="lbl">5월 지급 대상</div><div className="v">27<span className="u">명</span></div></div>
      <div className="hr-kpi"><div className="lbl">원천징수액</div><div className="v">4,920<span className="u">천원</span></div><div className="sub">소득 4,470 · 지방 450</div></div>
      <div className="hr-kpi tone-warn"><div className="lbl">신고 예정일</div><div className="v">5/20</div><div className="sub">D-9</div></div>
      <div className="hr-kpi"><div className="lbl">연말정산 완료</div><div className="v">27<span className="u">/27</span></div></div>
    </div>
    <div className="card">
      <div className="card-row"><div className="ctitle">국세청 제출 파일 생성</div><Btn size="sm" variant="primary" icon="file">파일 생성</Btn></div>
      <div className="ap-form">
        <div className="row" style={{gap: 12}}>
          <label style={{flex: 1}}><div className="lbl">신고 월</div><select className="input"><option>2026년 5월</option></select></label>
          <label style={{flex: 1}}><div className="lbl">제출 세무서</div><select className="input"><option>동대문세무서</option></select></label>
        </div>
        <div className="row" style={{gap: 12}}>
          <label style={{flex: 1}}><div className="lbl">사업자등록번호</div><input className="input" defaultValue="123-45-67890"/></label>
          <label style={{flex: 1}}><div className="lbl">대표자</div><input className="input" defaultValue="박철홍"/></label>
        </div>
      </div>
    </div>
  </>
);

const ModPeak = () => (
  <div className="hr-row">
    <div className="card">
      <div className="card-row"><div className="ctitle">적용 대상자</div></div>
      <div className="hr-expire-list">
        <div className="hr-expire-row" style={{background:'var(--accent-soft)'}}>
          <Chip tone="accent">적용 중</Chip>
          <div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}><b>박철홍</b><span className="small">· 만 60세 · 6월부터 80% 적용</span></div>
          <Btn size="sm">상세</Btn>
        </div>
      </div>
    </div>
    <div className="card">
      <div className="card-row"><div className="ctitle">임금피크 규정</div></div>
      <div className="hr-rules">
        <div className="hr-rule"><span>적용 나이</span><span>만 60세 · 6월 첫날</span></div>
        <div className="hr-rule"><span>1적관</span><span>3년 관 80% 지급</span></div>
        <div className="hr-rule"><span>2적관</span><span>4년차 70% 지급</span></div>
        <div className="hr-rule"><span>3적관</span><span>5년차 60% 지급</span></div>
      </div>
    </div>
  </div>
);

const ModMinWage = () => (
  <>
    <div className="hr-kpi-row">
      <div className="hr-kpi tone-danger"><div className="lbl">미달 가능성</div><div className="v">2<span className="u">명</span></div><div className="sub">2026 최저시급 10,030원</div></div>
      <div className="hr-kpi tone-success"><div className="lbl">적합</div><div className="v">25<span className="u">명</span></div></div>
      <div className="hr-kpi"><div className="lbl">2026 최저시급</div><div className="v">10,030<span className="u">원</span></div></div>
      <div className="hr-kpi"><div className="lbl">2027 고시</div><div className="v">8월<span className="u">예정</span></div></div>
    </div>
    <div className="card">
      <div className="card-row"><div className="ctitle">시급 직원 환산 표</div></div>
      <table className="data-tbl" style={{width:'100%'}}>
        <thead><tr><th>이름</th><th>고용</th><th style={{textAlign:'right'}}>시급</th><th style={{textAlign:'right'}}>환산 시급</th><th>상태</th></tr></thead>
        <tbody>
          {[
            { n:'조혜원', e:'시급직', cur: 9800, conv: 9912, s:'미달', tone:'danger' },
            { n:'이다혜', e:'시급직', cur: 9900, conv: 9988, s:'미달', tone:'danger' },
            { n:'박술',   e:'일용',  cur: 10200, conv: 10400, s:'적합', tone:'success' },
          ].map((r,i) => (
            <tr key={i}>
              <td><b>{r.n}</b></td>
              <td><Chip tone="muted">{r.e}</Chip></td>
              <td className="tnum" style={{textAlign:'right'}}>{r.cur.toLocaleString()}</td>
              <td className="tnum" style={{textAlign:'right', fontWeight: 800, color: r.s==='미달'?'var(--danger)':'var(--success)'}}>{r.conv.toLocaleString()}</td>
              <td><Chip tone={r.tone}>{r.s}</Chip></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

const ModTaxFree = () => (
  <div className="card">
    <div className="card-row"><div className="ctitle">비과세 항목별 한도 점검</div></div>
    <div className="hr-rules">
      <div className="hr-rule"><span>식대</span><span><b className="tnum" style={{color:'var(--accent)'}}>200,000</b>원/월 · 27명 적용</span></div>
      <div className="hr-rule"><span>교통비</span><span><b className="tnum" style={{color:'var(--accent)'}}>200,000</b>원/월 · 8명 적용</span></div>
      <div className="hr-rule"><span>생산직 야간수당</span><span><b className="tnum" style={{color:'var(--success)'}}>240,000</b>원/월</span></div>
      <div className="hr-rule"><span>자가운전 보조</span><span><b className="tnum" style={{color:'var(--warning)'}}>미적용</b></span></div>
      <div className="hr-rule"><span>출장비 식대</span><span><b className="tnum">100,000</b>원/일</span></div>
      <div className="hr-rule"><span>경조·휴양휴가수당</span><span><b>한도 없음</b></span></div>
    </div>
  </div>
);

const ModNormal = () => (
  <div className="hr-row">
    <div className="card">
      <div className="card-row"><div className="ctitle">통상임금 계산 설정</div></div>
      <div className="ap-form">
        <label><div className="lbl">대상 직원</div><select className="input"><option>이나림 · 수간호사</option></select></label>
        <div className="row" style={{gap: 10}}>
          <label style={{flex: 1}}><div className="lbl">기본급</div><input className="input" defaultValue="3,800,000" style={{textAlign:'right'}}/></label>
          <label style={{flex: 1}}><div className="lbl">연 정기상여</div><input className="input" defaultValue="3,800,000" style={{textAlign:'right'}}/></label>
        </div>
        <Btn variant="primary">재계산</Btn>
      </div>
    </div>
    <div className="card">
      <div className="card-row"><div className="ctitle">계산 결과</div></div>
      <div className="pr-sim-net">
        <div className="lbl">평균 통상임금 (시간당)</div>
        <div className="v">19,761<span className="u">원</span></div>
        <div className="sub">일일 158,088 · 월 4,130,000</div>
      </div>
      <div className="pr-sim-breakdown">
        <div className="pr-sim-row"><span>초과근로수당 1h</span><b className="tnum">29,641원</b></div>
        <div className="pr-sim-row"><span>야간근로수당 1h</span><b className="tnum">9,881원</b></div>
        <div className="pr-sim-row"><span>연차수당 1일</span><b className="tnum">158,088원</b></div>
        <div className="pr-sim-row"><span>휴일근로수당 1h</span><b className="tnum">29,641원</b></div>
      </div>
    </div>
  </div>
);

const ModUnpaid = () => (
  <div className="card">
    <div className="card-row"><div className="ctitle">미지급 의심 수당 · 과거 3개월</div><Btn size="sm" variant="primary">일괄 반영</Btn></div>
    <div className="hr-expire-list">
      <div className="hr-expire-row" style={{background:'var(--danger-soft)'}}>
        <Chip tone="danger">야간수당</Chip>
        <div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}><b>홍자비</b><span className="small">· 4월 야간 12h 미반영</span><span className="tnum" style={{fontWeight: 800, color:'var(--danger)', marginLeft: 8}}>+184,000원</span></div>
        <Btn size="sm" variant="primary">반영</Btn>
      </div>
      <div className="hr-expire-row" style={{background:'var(--warning-soft)'}}>
        <Chip tone="warn">휴일근로</Chip>
        <div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}><b>이나림</b><span className="small">· 5/5 출근 8h · 대체휴 미사용</span><span className="tnum" style={{fontWeight: 800, color:'var(--warning)', marginLeft: 8}}>+126,400원</span></div>
        <Btn size="sm" variant="primary">수당</Btn>
      </div>
    </div>
  </div>
);

const ModAbsent = () => (
  <>
    <div className="card">
      <div className="card-row"><div className="ctitle">자동 차감 규칙</div></div>
      <div className="hr-rules">
        <div className="hr-rule"><span>무통보 결근</span><span><b>1일당 통상임금 단아 차감</b></span></div>
        <div className="hr-rule"><span>주간 주휴수당</span><span>출근률 100% 미만 시 미지급</span></div>
        <div className="hr-rule"><span>구제명령 휴직</span><span>차감 않음</span></div>
        <div className="hr-rule"><span>윈텍도 통보 휴직</span><span>구조조정 일부 지급</span></div>
      </div>
    </div>
    <div className="card">
      <div className="card-row"><div className="ctitle">이번달 대상</div></div>
      <div className="hr-expire-list">
        <div className="hr-expire-row">
          <Chip tone="muted">5/1</Chip>
          <div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}><b>이나림</b><span className="small">· 노동절 무통보 결근 1일</span></div>
          <span className="tnum" style={{fontWeight: 800, color:'var(--danger)'}}>-127,000원</span>
          <Btn size="sm" variant="primary">확정</Btn>
        </div>
      </div>
    </div>
  </>
);

// ═════════════════════════════════════════════════════════════════
// 구성원 워크센터 (3장 → 1장)
// ═════════════════════════════════════════════════════════════════

const MEMBER_ROWS = [
  { name:'박철홍', code:'2018-001', dept:'진료부 · 진료팀', position:'병원장',     join:'2018-03-02', tenure:'8년 2개월', tone:'pink',   status:'재직', employ:'정규직', license:'전문의·정형외과' },
  { name:'김지오', code:'2020-014', dept:'간호부 · 병동팀', position:'간호부장',   join:'2020-06-15', tenure:'5년 11개월',tone:'blue',   status:'재직', employ:'정규직', license:'간호사·BLS' },
  { name:'정해영', code:'2019-007', dept:'진료부 · 진료팀', position:'전문의',     join:'2019-09-01', tenure:'6년 8개월', tone:'violet', status:'재직', employ:'정규직', license:'전문의·정형외과' },
  { name:'이나림', code:'2021-022', dept:'간호부 · 외래팀', position:'수간호사',   join:'2021-04-12', tenure:'5년 1개월', tone:'green',  status:'재직', employ:'정규직', license:'간호사·CPR' },
  { name:'백민',   code:'2022-031', dept:'경영지원팀',     position:'경영지원',    join:'2022-08-29', tenure:'2년 8개월', tone:'amber',  status:'재직', employ:'정규직', license:'전산회계 1급' },
  { name:'박유진', code:'2023-008', dept:'경영지원팀',     position:'책임',       join:'2023-01-16', tenure:'2년 4개월', tone:'pink',   status:'재직', employ:'정규직', license:'노무사 2차' },
  { name:'홍자비', code:'2024-002', dept:'경영지원팀',     position:'대리',       join:'2024-02-05', tenure:'1년 3개월', tone:'cyan',   status:'재직', employ:'정규직', license:null },
  { name:'송소현', code:'2025-018', dept:'간호부 · 외래팀', position:'간호사',     join:'2025-03-10', tenure:'1년 2개월', tone:'green',  status:'재직', employ:'계약직', license:'간호사' },
  { name:'오민호', code:'2025-024', dept:'간호부 · 수술팀', position:'간호사',     join:'2025-06-01', tenure:'11개월',    tone:'gray',   status:'수습', employ:'정규직', license:'간호사·BLS' },
];

const MemberWorkcenter = () => {
  const [tab, setTab] = React.useState('list');
  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const selected = MEMBER_ROWS[selectedIdx];
  return (
    <>
      <div className="tabs" style={{marginBottom: 12}}>
        <button className={'tab-item '+(tab==='list'?'on':'')} onClick={()=>setTab('list')}>구성원<span className="cnt">27</span></button>
        <button className={'tab-item '+(tab==='move'?'on':'')} onClick={()=>setTab('move')}>인사발령<span className="cnt">3</span></button>
        <button className={'tab-item '+(tab==='edu' ?'on':'')} onClick={()=>setTab('edu')}>교육·자격<span className="cnt">12</span></button>
      </div>

      <div className="hr-kpi-row">
        <div className="hr-kpi"><div className="lbl">전체 인원</div><div className="v">27<span className="u">명</span></div><div className="sub">정규 22 · 계약 4 · 수습 1</div></div>
        <div className="hr-kpi"><div className="lbl">신규 입사 (3개월)</div><div className="v">2<span className="u">명</span></div><div className="sub">송소현 · 오민호</div></div>
        <div className="hr-kpi tone-warn"><div className="lbl">퇴사 예정 (60일)</div><div className="v">1<span className="u">명</span></div><div className="sub">계약 만료 1명</div></div>
        <div className="hr-kpi"><div className="lbl">평균 근속</div><div className="v">4.2<span className="u">년</span></div><div className="sub">병원장 8.2년 · 신규 11개월</div></div>
      </div>

      {tab === 'list' && (
        <div className="hr-split">
          <div className="card" style={{padding: 0, overflow:'hidden'}}>
            <div className="card-row" style={{padding: '12px 14px', margin: 0, borderBottom:'1px solid var(--border)', background:'var(--z-50)'}}>
              <div className="row" style={{gap: 6, flexWrap:'wrap'}}>
                <button className="todo-chip tone-accent on">전체<span className="cnt">27</span></button>
                <button className="todo-chip">진료부<span className="cnt">6</span></button>
                <button className="todo-chip">간호부<span className="cnt">14</span></button>
                <button className="todo-chip">경영지원<span className="cnt">5</span></button>
                <button className="todo-chip">수습<span className="cnt">1</span></button>
              </div>
            </div>
            <table className="data-tbl" style={{width:'100%'}}>
              <thead><tr>
                <th style={{width: 28}}></th>
                <th>이름</th>
                <th>부서·팀</th>
                <th>직급</th>
                <th>입사일</th>
                <th>근속</th>
                <th>고용</th>
              </tr></thead>
              <tbody>
                {MEMBER_ROWS.map((r,i) => (
                  <tr key={i} className={i===selectedIdx?'on':''} onClick={()=>setSelectedIdx(i)} style={{cursor:'pointer', background: i===selectedIdx?'var(--accent-soft)':undefined}}>
                    <td><div className={'chat-room-pic tone-'+r.tone} style={{width:24, height:24, fontSize:10, borderRadius: 6}}>{r.name.charAt(0)}</div></td>
                    <td>
                      <div style={{fontSize: 13, fontWeight: 800}}>{r.name}</div>
                      <div className="small" style={{fontSize: 10}}>{r.code}</div>
                    </td>
                    <td><span className="small">{r.dept}</span></td>
                    <td><span style={{fontSize: 12, fontWeight: 700}}>{r.position}</span></td>
                    <td className="tnum"><span className="small">{r.join}</span></td>
                    <td className="tnum"><span className="small">{r.tenure}</span></td>
                    <td><Chip tone={r.employ==='정규직'?'success':r.status==='수습'?'warn':'muted'}>{r.employ}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card hr-drawer-card">
            <div className="hr-prof-head">
              <div className={'chat-room-pic lg tone-'+selected.tone} style={{width: 56, height: 56, fontSize: 22, borderRadius: 14}}>{selected.name.charAt(0)}</div>
              <div style={{minWidth: 0, flex: 1}}>
                <div className="hr-prof-name">{selected.name} <span className="small" style={{marginLeft: 6}}>· {selected.code}</span></div>
                <div className="hr-prof-dept">{selected.dept} · {selected.position}</div>
                <div className="row" style={{gap: 4, marginTop: 6}}>
                  <Chip tone="success">{selected.status}</Chip>
                  <Chip tone="accent">{selected.employ}</Chip>
                  {selected.license && <Chip tone="muted">{selected.license}</Chip>}
                </div>
              </div>
            </div>
            <div className="hr-prof-meta">
              <div><span className="lbl">입사일</span><span>{selected.join}</span></div>
              <div><span className="lbl">근속</span><span>{selected.tenure}</span></div>
              <div><span className="lbl">소속</span><span>{selected.dept}</span></div>
            </div>
            <div className="hr-prof-section">
              <div className="section-title">인사 이력 타임라인</div>
              <div className="hr-timeline">
                <div className="hr-tl-row"><div className="hr-tl-dot"/><div><b>{selected.join}</b><div className="small">입사 · {selected.dept}</div></div></div>
                <div className="hr-tl-row"><div className="hr-tl-dot accent"/><div><b>2023-06-01</b><div className="small">승진 · 책임 → 선임</div></div></div>
                <div className="hr-tl-row"><div className="hr-tl-dot warn"/><div><b>2024-09-15</b><div className="small">교육 이수 · BLS 자격 갱신</div></div></div>
                <div className="hr-tl-row"><div className="hr-tl-dot success"/><div><b>2025-12-30</b><div className="small">우수사원 표창</div></div></div>
              </div>
            </div>
            <div className="hr-prof-section">
              <div className="section-title">최근 활동</div>
              <div className="hr-act">
                <div className="hr-act-row"><Chip tone="accent">근태</Chip><span>5/10 09:02 출근 (정상)</span></div>
                <div className="hr-act-row"><Chip tone="warn">연차</Chip><span>5/20-21 연차 신청 (결재 진행 중)</span></div>
                <div className="hr-act-row"><Chip tone="muted">서류</Chip><span>5/8 재직증명서 발급</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'move' && (
        <div className="card">
          <div className="card-row">
            <div className="ctitle">인사발령 (5월)</div>
            <Btn variant="primary" icon="plus" size="sm">새 발령</Btn>
          </div>
          <div className="hr-move-list">
            {[
              { name:'박유진', from:'책임', to:'선임', date:'2026.5.1', kind:'승진', tone:'success' },
              { name:'송소현', from:'-',   to:'간호사 · 외래팀', date:'2026.5.10', kind:'배치 이동', tone:'accent' },
              { name:'오민호', from:'수습', to:'정직원 전환', date:'2026.6.1', kind:'전환 예정', tone:'warn' },
            ].map((r,i) => (
              <div key={i} className="hr-move-row">
                <Chip tone={r.tone}>{r.kind}</Chip>
                <div className="hr-move-body"><b>{r.name}</b> · {r.from} → <b>{r.to}</b></div>
                <span className="small tnum">{r.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'edu' && (
        <div className="card">
          <div className="card-row">
            <div className="ctitle">교육·자격 이력</div>
            <Btn variant="primary" icon="plus" size="sm">교육 등록</Btn>
          </div>
          <div className="hr-edu-grid">
            {[
              { name:'BLS 기본 소생술', target:'간호부 전원', due:'2026.7.30', completed: 11, total: 14, tone:'success' },
              { name:'의료법 정기 교육', target:'전원',         due:'2026.8.15', completed: 18, total: 27, tone:'warn' },
              { name:'개인정보 보호',    target:'전원',         due:'2026.9.10', completed:  6, total: 27, tone:'danger' },
              { name:'감염관리 워크숍',  target:'수술팀·외래팀', due:'2026.6.25', completed:  8, total:  9, tone:'success' },
            ].map((c,i) => (
              <div key={i} className="hr-edu-card">
                <div className="hr-edu-name">{c.name}</div>
                <div className="small">{c.target} · 마감 {c.due}</div>
                <div className="hr-edu-bar"><div className={'fill tone-'+c.tone} style={{width: (c.completed/c.total*100)+'%'}}/></div>
                <div className="row" style={{justifyContent:'space-between', marginTop: 4}}>
                  <span className="small">이수 {c.completed}/{c.total}</span>
                  <span className={'small'} style={{fontWeight: 800, color: c.tone==='danger'?'var(--danger)':c.tone==='warn'?'var(--warning)':'var(--success)'}}>{Math.round(c.completed/c.total*100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

// ═════════════════════════════════════════════════════════════════
// 근태 워크센터 (5장 → 1장)
// ═════════════════════════════════════════════════════════════════

const AttendWorkcenter = ({ tab = 'dash', setTab = () => {} }) => {
  return (
    <>
      <div className="tabs" style={{marginBottom: 12}}>
        <button className={'tab-item '+(tab==='dash'    ?'on':'')} onClick={()=>setTab('dash')}>대시보드</button>
        <button className={'tab-item '+(tab==='schedule'?'on':'')} onClick={()=>setTab('schedule')}>근무표 편성<span className="cnt">AI · 3교대</span></button>
        <button className={'tab-item '+(tab==='calendar'?'on':'')} onClick={()=>setTab('calendar')}>달력</button>
      </div>

      <div className="hr-kpi-row">
        <div className="hr-kpi tone-success"><div className="lbl">정상 출근</div><div className="v">22<span className="u">명</span></div><div className="sub">전체 27명 중 81.5%</div></div>
        <div className="hr-kpi tone-warn"><div className="lbl">지각</div><div className="v">2<span className="u">명</span></div><div className="sub">홍자비 09:18 · 이나림 09:24</div></div>
        <div className="hr-kpi tone-danger"><div className="lbl">결근</div><div className="v">1<span className="u">명</span></div><div className="sub">미신고 · 확인 필요</div></div>
        <div className="hr-kpi"><div className="lbl">휴가 중</div><div className="v">2<span className="u">명</span></div><div className="sub">연차 1 · 경조 1</div></div>
      </div>

      {tab === 'dash' && (
        <div className="hr-row">
          <div className="card">
            <div className="card-row">
              <div className="ctitle">시간대별 출·퇴근</div>
              <span className="small">2026.5.11 (월)</span>
            </div>
            <div className="hr-chart">
              {[
                { h:'07', i: 3,  o: 0  },
                { h:'08', i: 14, o: 0  },
                { h:'09', i: 7,  o: 0  },
                { h:'10', i: 1,  o: 0  },
                { h:'12', i: 0,  o: 12 },
                { h:'13', i: 12, o: 0  },
                { h:'17', i: 0,  o: 4  },
                { h:'18', i: 0,  o: 11 },
                { h:'19', i: 0,  o: 6  },
                { h:'20', i: 0,  o: 3  },
              ].map((b,i) => {
                const max = 16;
                return (
                  <div key={i} className="hr-bar">
                    <div className="hr-bar-stack">
                      <div className="hr-bar-in"  style={{height: (b.i/max*120)+'px'}} title={b.i+'명 출근'}>{b.i>0 && b.i}</div>
                      <div className="hr-bar-out" style={{height: (b.o/max*120)+'px'}} title={b.o+'명 퇴근'}>{b.o>0 && b.o}</div>
                    </div>
                    <div className="hr-bar-h">{b.h}</div>
                  </div>
                );
              })}
            </div>
            <div className="hr-chart-legend">
              <span><span className="hr-leg-dot in"/> 출근</span>
              <span><span className="hr-leg-dot out"/> 퇴근</span>
            </div>
          </div>

          <div className="card">
            <div className="card-row">
              <div className="ctitle">부서별 출근 현황</div>
            </div>
            <div className="hr-dept-list">
              {[
                { d:'진료팀',     ok: 2, late: 0, off: 0, leave: 0, total: 2 },
                { d:'병동팀',     ok: 5, late: 0, off: 0, leave: 0, total: 5 },
                { d:'외래팀',     ok: 4, late: 1, off: 0, leave: 1, total: 6 },
                { d:'수술팀',     ok: 5, late: 1, off: 0, leave: 0, total: 6 },
                { d:'경영지원', ok: 4, late: 0, off: 1, leave: 0, total: 5 },
                { d:'수습',        ok: 2, late: 0, off: 0, leave: 1, total: 3 },
              ].map((d, i) => {
                const pct = (d.ok/d.total)*100;
                return (
                  <div key={i} className="hr-dept-row">
                    <div className="hr-dept-name">{d.d}</div>
                    <div className="hr-dept-bar">
                      <div className="hr-dept-seg ok" style={{width: (d.ok/d.total*100)+'%'}}/>
                      <div className="hr-dept-seg late" style={{width: (d.late/d.total*100)+'%'}}/>
                      <div className="hr-dept-seg leave" style={{width: (d.leave/d.total*100)+'%'}}/>
                      <div className="hr-dept-seg off" style={{width: (d.off/d.total*100)+'%'}}/>
                    </div>
                    <div className="hr-dept-vals">
                      <span className="ok">{d.ok}</span>
                      {d.late>0 && <span className="late">{d.late}</span>}
                      {d.leave>0 && <span className="leave">{d.leave}</span>}
                      {d.off>0 && <span className="off">{d.off}</span>}
                      <span className="small">/ {d.total}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'schedule' && (
        <>
          <div className="hr-sched-banner">
            <div>
              <div className="hr-sched-kicker">근무표 편성 도구 — 3장 통합</div>
              <div className="hr-sched-title">월간 근무표 · AI 자동 제안 · 3교대 마법사를 한 흐름으로</div>
            </div>
            <div className="row" style={{gap: 8}}>
              <Btn size="sm" icon="file">이전달 복제</Btn>
              <Btn size="sm" variant="primary">✨ AI 자동 편성</Btn>
              <Btn size="sm">3교대 마법사</Btn>
            </div>
          </div>
          <div className="card" style={{padding: 0, overflow:'auto'}}>
            <div className="hr-sched-grid">
              <div className="hr-sched-corner">직원 / 날짜</div>
              {Array.from({length: 14}, (_,i)=> i+11).map(d => (
                <div key={d} className={'hr-sched-h '+(d===11?'today':'')}>5/{d}<div className="small">{['월','화','수','목','금','토','일'][(d-1)%7]}</div></div>
              ))}
              {[
                { name:'김지오', shifts:['D','D','D','OFF','N','N','N','OFF','E','E','D','D','OFF','D'] },
                { name:'이나림', shifts:['E','E','D','D','D','OFF','OFF','D','D','D','OFF','N','N','N'] },
                { name:'송소현', shifts:['N','N','OFF','D','D','D','E','E','E','OFF','D','D','D','OFF'] },
                { name:'오민호', shifts:['OFF','D','D','D','E','E','OFF','N','N','D','D','OFF','E','E'] },
              ].map((emp, ri) => (
                <React.Fragment key={ri}>
                  <div className="hr-sched-name">{emp.name}</div>
                  {emp.shifts.map((s, i) => (
                    <div key={i} className={'hr-sched-cell sh-'+s.toLowerCase()}>{s==='OFF'?'·':s}</div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="hr-sched-legend">
            <span><span className="hr-leg-shift sh-d"></span> D · 낮(09-18)</span>
            <span><span className="hr-leg-shift sh-e"></span> E · 저녁(14-22)</span>
            <span><span className="hr-leg-shift sh-n"></span> N · 밤(22-09)</span>
            <span><span className="hr-leg-shift sh-off"></span> OFF</span>
          </div>
        </>
      )}

      {tab === 'calendar' && (
        <div className="card">
          <div className="card-row">
            <div className="ctitle">2026년 5월 근태 달력</div>
            <div className="row" style={{gap: 8}}>
              <Btn size="sm">‹</Btn>
              <Btn size="sm">›</Btn>
              <Btn size="sm">오늘</Btn>
            </div>
          </div>
          <div className="hr-cal">
            {['월','화','수','목','금','토','일'].map(d => <div key={d} className="hr-cal-h">{d}</div>)}
            {Array.from({length: 35}, (_,i) => {
              const day = i - 2;
              if (day < 1 || day > 31) return <div key={i} className="hr-cal-d empty"/>;
              const tone = day===1?'off':day===11?'today':day%7===0?'rest':'';
              const events = day===5 ? [{t:'어린이날', tone:'rest'}] : day===15 ? [{t:'스승의 날', tone:'rest'}] : [];
              return (
                <div key={i} className={'hr-cal-d '+tone}>
                  <div className="hr-cal-d-num">{day}</div>
                  {day<=11 && <div className="hr-cal-d-stats">
                    <span className="hr-cal-st ok">정상 {Math.floor(20+Math.random()*5)}</span>
                    {Math.random()>0.5 && <span className="hr-cal-st late">지각 {Math.floor(Math.random()*3)+1}</span>}
                  </div>}
                  {events.map((e,j) => <div key={j} className={'hr-cal-d-ev tone-'+e.tone}>{e.t}</div>)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};

// ═════════════════════════════════════════════════════════════════
// 연차·휴가 워크센터 (4장 → 1장)
// ═════════════════════════════════════════════════════════════════

const LeaveWorkcenter = () => {
  const rows = [
    { name:'박철홍', dept:'진료팀',   total: 16, used: 7,  remain: 9,   expire: 0, status:null,    tone:'pink' },
    { name:'김지오', dept:'병동팀',   total: 15, used: 4,  remain: 11,  expire: 0, status:null,    tone:'blue' },
    { name:'이나림', dept:'외래팀',   total: 15, used: 2,  remain: 13,  expire: 3, status:'소멸',    tone:'green' },
    { name:'송소현', dept:'외래팀',   total: 11, used: 0,  remain: 11,  expire: 5, status:'소멸',    tone:'green' },
    { name:'백민',   dept:'경영지원', total: 15, used: 13, remain: 2,   expire: 0, status:null,    tone:'amber' },
    { name:'박유진', dept:'경영지원', total: 15, used: 5,  remain: 10,  expire: 0, status:'신청',    tone:'pink' },
    { name:'정해영', dept:'진료팀',   total: 16, used: 8,  remain: 8,   expire: 0, status:null,    tone:'violet' },
    { name:'홍자비', dept:'경영지원', total: 15, used: 11, remain: 4,   expire: 0, status:null,    tone:'cyan' },
  ];
  const totalRemain = rows.reduce((a,b)=>a+b.remain, 0);
  const totalUsed   = rows.reduce((a,b)=>a+b.used, 0);
  const totalTotal  = rows.reduce((a,b)=>a+b.total, 0);
  const expireCnt   = rows.filter(r=>r.expire>0).length;
  return (
    <>
      <div className="hr-kpi-row">
        <div className="hr-kpi"><div className="lbl">전체 잔여 연차</div><div className="v">{totalRemain}<span className="u">일</span></div><div className="sub">27명 이동평균 7.4일</div></div>
        <div className="hr-kpi tone-success"><div className="lbl">사용률</div><div className="v">{Math.round(totalUsed/totalTotal*100)}<span className="u">%</span></div><div className="sub">{totalUsed} / {totalTotal}일</div></div>
        <div className="hr-kpi tone-warn"><div className="lbl">소멸 예정</div><div className="v">{expireCnt}<span className="u">명</span></div><div className="sub">6월 말 이전 사용 권고</div></div>
        <div className="hr-kpi tone-accent"><div className="lbl">신청 대기</div><div className="v">{rows.filter(r=>r.status==='신청').length}<span className="u">건</span></div><div className="sub">결재 필요</div></div>
      </div>

      <div className="hr-row">
        <div className="card" style={{padding: 0}}>
          <div className="card-row" style={{padding: '12px 16px', margin: 0, borderBottom:'1px solid var(--border)'}}>
            <div className="ctitle">직원별 연차 현황</div>
            <Btn size="sm" icon="plus">연차 수동 조정</Btn>
          </div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr><th>이름</th><th>부서</th><th style={{textAlign:'center'}}>부여</th><th style={{textAlign:'center'}}>사용</th><th style={{textAlign:'center'}}>잔여</th><th>상태</th></tr></thead>
            <tbody>
              {rows.map((r,i) => (
                <tr key={i}>
                  <td>
                    <div className="row" style={{gap: 6, alignItems:'center'}}>
                      <div className={'chat-room-pic tone-'+r.tone} style={{width: 22, height: 22, fontSize: 10, borderRadius: 6}}>{r.name.charAt(0)}</div>
                      <span style={{fontSize: 12, fontWeight: 800}}>{r.name}</span>
                    </div>
                  </td>
                  <td><span className="small">{r.dept}</span></td>
                  <td className="tnum" style={{textAlign:'center'}}>{r.total}</td>
                  <td className="tnum" style={{textAlign:'center'}}><span style={{color: 'var(--z-600)'}}>{r.used}</span></td>
                  <td className="tnum" style={{textAlign:'center'}}><span style={{fontWeight: 800, color: r.remain<=3?'var(--danger)':'var(--accent)'}}>{r.remain}</span></td>
                  <td>
                    <div className="row" style={{gap: 4}}>
                      {r.status==='소멸' && <Chip tone="warn">소멸 {r.expire}일</Chip>}
                      {r.status==='신청' && <Chip tone="accent">신청 중</Chip>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-row">
            <div className="ctitle">빠른 연차 신청</div>
            <Chip tone="accent">나 · 박유진</Chip>
          </div>
          <div className="ap-form">
            <div className="row" style={{gap: 10}}>
              <label style={{flex: 1}}><div className="lbl">시작일</div><input className="input" type="date" defaultValue="2026-05-20"/></label>
              <label style={{flex: 1}}><div className="lbl">종료일</div><input className="input" type="date" defaultValue="2026-05-21"/></label>
            </div>
            <div className="row" style={{gap: 10}}>
              <label style={{flex: 1}}><div className="lbl">유형</div><select className="input"><option>연차</option><option>오전반차</option><option>오후반차</option><option>경조사</option></select></label>
              <label style={{flex: 1}}><div className="lbl">일수</div><input className="input" defaultValue="2" style={{textAlign:'right', fontFeatureSettings:'"tnum"', fontWeight: 800}}/></label>
            </div>
            <label><div className="lbl">사유</div><textarea className="op-textarea" rows={2} placeholder="간단한 사유"/></label>
            <div className="hr-leave-summary">
              <span>사용 후 잔여</span>
              <span><b className="tnum">8</b>일</span>
            </div>
            <Btn variant="primary" icon="send">신청 상신</Btn>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-row">
          <div className="ctitle">소멸 예정 알림 · {expireCnt}명</div>
          <Btn size="sm">일괄 권고 알림 발송</Btn>
        </div>
        <div className="hr-expire-list">
          {rows.filter(r=>r.expire>0).map((r,i) => (
            <div key={i} className="hr-expire-row">
              <Chip tone="warn">소멸 {r.expire}일</Chip>
              <div className="row" style={{gap: 6, alignItems:'center', flex: 1}}>
                <div className={'chat-room-pic tone-'+r.tone} style={{width: 22, height: 22, fontSize: 10, borderRadius: 6}}>{r.name.charAt(0)}</div>
                <b>{r.name}</b><span className="small">· {r.dept} · 잔여 {r.remain}일 중 {r.expire}일이 6월 말 소멸</span>
              </div>
              <Btn size="sm">권고 알림</Btn>
              <Btn size="sm" variant="primary">연차 추시</Btn>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

// ═════════════════════════════════════════════════════════════════
// 복지 워크센터 (5장 → 1장)
// ═════════════════════════════════════════════════════════════════

const WelfareWorkcenter = () => {
  const [tab, setTab] = React.useState('family');
  const expireUpcoming = [
    { who:'김지오', kind:'면허 갱신', what:'BLS 제공자', until:'2026.7.18', days: 68, tone:'warn'   },
    { who:'이나림', kind:'건강검진', what:'별정계 차수 미이수', until:'2026.6.30', days: 50, tone:'warn'   },
    { who:'백민',   kind:'면허 갱신', what:'전산회계 1급 재이수', until:'2026.5.31', days: 20, tone:'danger' },
    { who:'CT 장비',   kind:'의료기기 점검', what:'정기 연차 점검', until:'2026.6.5',  days: 25, tone:'danger' },
    { who:'초음파 장비', kind:'의료기기 점검', what:'계측 점검', until:'2026.7.15', days: 65, tone:'warn'   },
  ];
  return (
    <>
      <div className="tabs" style={{marginBottom: 12}}>
        <button className={'tab-item '+(tab==='family'?'on':'')} onClick={()=>setTab('family')}>경조사<span className="cnt">14</span></button>
        <button className={'tab-item '+(tab==='check'  ?'on':'')} onClick={()=>setTab('check')}>건강검진<span className="cnt">22/27</span></button>
        <button className={'tab-item '+(tab==='license'?'on':'')} onClick={()=>setTab('license')}>면허·자격<span className="cnt">48</span></button>
        <button className={'tab-item '+(tab==='device' ?'on':'')} onClick={()=>setTab('device')}>의료기기 점검<span className="cnt">12</span></button>
      </div>

      <div className="card">
        <div className="card-row">
          <div className="ctitle">만료 알림 · 공통 보드</div>
          <Btn size="sm">알림 규칙 설정</Btn>
        </div>
        <div className="hr-expire-list">
          {expireUpcoming.map((e,i) => (
            <div key={i} className="hr-expire-row">
              <Chip tone={e.tone}>D-{e.days}</Chip>
              <div className="row" style={{gap: 6, alignItems:'center', flex: 1}}>
                <span className="hr-expire-kind">{e.kind}</span>
                <b>{e.who}</b><span className="small">· {e.what} · 만료 {e.until}</span>
              </div>
              <Btn size="sm">알림 발송</Btn>
              <Btn size="sm" variant="primary">처리</Btn>
            </div>
          ))}
        </div>
      </div>

      {tab === 'family' && (
        <div className="hr-grid-2">
          <div className="card">
            <div className="card-row"><div className="ctitle">최근 경조사</div><Btn size="sm" icon="plus">새 등록</Btn></div>
            <div className="hr-family-list">
              {[
                { who:'김지오', kind:'결혼', date:'2026.5.18', tone:'success' },
                { who:'이나림', kind:'조부모 상', date:'2026.4.22', tone:'muted'   },
                { who:'박유진', kind:'출산',        date:'2026.4.5',  tone:'success' },
                { who:'송소현', kind:'부친상',     date:'2026.3.18', tone:'muted'   },
              ].map((f,i) => (
                <div key={i} className="hr-family-row">
                  <Chip tone={f.tone}>{f.kind}</Chip>
                  <b>{f.who}</b>
                  <span className="small tnum" style={{marginLeft:'auto'}}>{f.date}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-row"><div className="ctitle">경조사 규정</div></div>
            <div className="hr-rules">
              <div className="hr-rule"><span>본인 결혼</span><span>편도 5일 · 경조금 500,000원</span></div>
              <div className="hr-rule"><span>자녀 결혼</span><span>편도 1일 · 경조금 200,000원</span></div>
              <div className="hr-rule"><span>부모·조부모 상</span><span>편도 3일 · 조의금 300,000원</span></div>
              <div className="hr-rule"><span>배우자·자녀 상</span><span>편도 5일 · 조의금 500,000원</span></div>
              <div className="hr-rule"><span>출산</span><span>편도 3일 · 축하금 100,000원</span></div>
            </div>
          </div>
        </div>
      )}

      {tab === 'check' && (
        <div className="card">
          <div className="card-row">
            <div className="ctitle">2026년 건강검진 현황</div>
            <Btn size="sm" icon="send">미수검 일괄 알림</Btn>
          </div>
          <div className="hr-check-bar">
            <div className="hr-check-seg done" style={{flex: 22}}><span>수검 완료 22명</span></div>
            <div className="hr-check-seg wait" style={{flex: 3}}><span>예약 완료 3</span></div>
            <div className="hr-check-seg none" style={{flex: 2}}><span>미수검 2</span></div>
          </div>
          <div className="hr-check-list">
            {[
              { who:'김지오', when:'2026.4.18', place:'서울의료원', status:'완료',     tone:'success' },
              { who:'이나림', when:'-',          place:'별정계 상안',  status:'미수검', tone:'danger'  },
              { who:'박유진', when:'2026.5.30',  place:'서울의료원', status:'예약',     tone:'warn'    },
              { who:'홍자비', when:'2026.4.5',   place:'아산병원',     status:'완료',     tone:'success' },
            ].map((c,i) => (
              <div key={i} className="hr-check-row">
                <b>{c.who}</b>
                <span className="small">{c.place}</span>
                <span className="small tnum" style={{marginLeft:'auto'}}>{c.when || '안내 재발송'}</span>
                <Chip tone={c.tone}>{c.status}</Chip>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'license' && (
        <div className="hr-grid-3">
          {[
            { who:'박철홍', cert:'전문의', sub:'정형외과', exp:'영구',     tone:'success' },
            { who:'정해영', cert:'전문의', sub:'정형외과', exp:'영구',     tone:'success' },
            { who:'김지오', cert:'간호사', sub:'BLS 제공자',  exp:'2026.7.18', tone:'warn'    },
            { who:'이나림', cert:'간호사', sub:'CPR',         exp:'2027.3.10', tone:'success' },
            { who:'송소현', cert:'간호사', sub:'신규',         exp:'-',         tone:'muted'    },
            { who:'백민',   cert:'전산회계 1급', sub:'재이수', exp:'2026.5.31', tone:'danger' },
          ].map((c,i) => (
            <div key={i} className="hr-license-card">
              <div className="row" style={{gap: 8, alignItems:'center'}}>
                <div className="chat-room-pic tone-gray" style={{width: 28, height: 28, fontSize: 11, borderRadius: 8}}>{c.who.charAt(0)}</div>
                <div style={{minWidth: 0, flex: 1}}>
                  <div style={{fontSize: 13, fontWeight: 800}}>{c.who}</div>
                  <div className="small">{c.cert}</div>
                </div>
                <Chip tone={c.tone}>{c.exp}</Chip>
              </div>
              <div className="hr-license-sub">{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'device' && (
        <div className="card">
          <div className="card-row"><div className="ctitle">의료기기 점검 일정</div><Btn size="sm" icon="plus">점검 등록</Btn></div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr><th>장비</th><th>설치 위치</th><th>마지막 점검</th><th>다음 점검</th><th>담당</th><th>상태</th></tr></thead>
            <tbody>
              {[
                { d:'CT 장비',       loc:'촬영실 1', last:'2025.6.5',  next:'2026.6.5',  who:'초음파 업체',    s:'예정',     tone:'warn'    },
                { d:'초음파 장비',  loc:'촬영실 2', last:'2025.7.15', next:'2026.7.15', who:'초음파 업체',    s:'예정',     tone:'muted'   },
                { d:'X-ray',         loc:'영상실',  last:'2026.1.20', next:'2026.7.20', who:'의료기기 업체',  s:'수시',     tone:'muted'   },
                { d:'자동 제세 기',     loc:'수술방 1', last:'2024.11.5', next:'2026.5.5',  who:'내부 관리',    s:'지연',    tone:'danger'  },
              ].map((r,i) => (
                <tr key={i}>
                  <td><b>{r.d}</b></td>
                  <td><span className="small">{r.loc}</span></td>
                  <td className="tnum"><span className="small">{r.last}</span></td>
                  <td className="tnum"><span className="small">{r.next}</span></td>
                  <td><span className="small">{r.who}</span></td>
                  <td><Chip tone={r.tone}>{r.s}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// ═════════════════════════════════════════════════════════════════
// 근태이상 감지 워크센터 (2장 → 1장)
// ═════════════════════════════════════════════════════════════════

const AbnormalWorkcenter = () => {
  const patterns = [
    { who:'홍자비', dept:'경영지원팀', kind:'지각 반복',     desc:'최근 4주 지각 7회 (월평균 1.8회) — 이전 3개월 0으로 급증', sev:'주의',   tone:'warn',    suggest:'개인 면담 권고' },
    { who:'백민',   dept:'경영지원팀', kind:'조기퇴근 반복', desc:'최근 2주 6회 계약시간 이전 퇴근 (평균 -22분)',          sev:'주의',   tone:'warn',    suggest:'업무량 점검' },
    { who:'이나림', dept:'외래팀',     kind:'연속 결근',     desc:'5/2 결근 이후 연차 1일 — 구체적 사유 미제출',                sev:'경고',   tone:'danger',  suggest:'HR 언급 + 증빙자료 요청' },
    { who:'송소현', dept:'외래팀',     kind:'수습자 적응',   desc:'입사 후 60일 내 지각 2회 (수습기간 평균 0.4회)',                sev:'관찰',   tone:'accent',  suggest:'멘토 연결' },
    { who:'오민호', dept:'수술팀',     kind:'장시간 근무',  desc:'최근 3주 월간 초과근무 38h — 구조적 업무량 재검토 필요',   sev:'경고',   tone:'danger',  suggest:'근무표 재편성' },
    { who:'김지오', dept:'병동팀',     kind:'주말 출근 반복',  desc:'최근 4주 주말·공휴일 자발 출근 5회 — 보상 점검',          sev:'관찰',   tone:'accent',  suggest:'대체휴가 안내' },
  ];
  return (
    <>
      <div className="hr-kpi-row">
        <div className="hr-kpi tone-warn"><div className="lbl">이번 주 지각</div><div className="v">11<span className="u">회</span></div><div className="sub">상위 3명이 전체 70%</div></div>
        <div className="hr-kpi tone-warn"><div className="lbl">조기퇴근</div><div className="v">6<span className="u">회</span></div><div className="sub">평균 -22분</div></div>
        <div className="hr-kpi tone-danger"><div className="lbl">연속 결근</div><div className="v">1<span className="u">건</span></div><div className="sub">이나림 · HR 조치 권고</div></div>
        <div className="hr-kpi tone-accent"><div className="lbl">패턴 알람</div><div className="v">6<span className="u">명</span></div><div className="sub">AI 감지 — 관찰/주의/경고 단계별</div></div>
      </div>

      <div className="card">
        <div className="card-row">
          <div className="ctitle">패턴 자동 감지 · 최근 4주</div>
          <div className="row" style={{gap: 8}}>
            <select className="board-sort">
              <option>전체 단계</option>
              <option>경고만</option>
              <option>주의만</option>
              <option>관찰만</option>
            </select>
            <Btn size="sm">규칙 설정</Btn>
          </div>
        </div>
        <div className="abn-list">
          {patterns.map((p,i) => (
            <div key={i} className={'abn-card tone-'+p.tone}>
              <div className="abn-card-l">
                <Chip tone={p.tone}>{p.sev}</Chip>
                <div className="abn-kind">{p.kind}</div>
              </div>
              <div className="abn-card-m">
                <div className="abn-who"><b>{p.who}</b><span className="small"> · {p.dept}</span></div>
                <div className="abn-desc">{p.desc}</div>
              </div>
              <div className="abn-card-r">
                <div className="abn-suggest">권장: <b>{p.suggest}</b></div>
                <div className="row" style={{gap: 6, marginTop: 8}}>
                  <Btn size="sm">상세 패턴</Btn>
                  <Btn size="sm" variant="primary" icon="send">{p.suggest}</Btn>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hr-row">
        <div className="card">
          <div className="card-row"><div className="ctitle">감지 규칙 설정</div></div>
          <div className="abn-rules">
            {[
              { name:'지각 임계',     v:'4주 5회 이상',      sev:'주의' },
              { name:'조기퇴근 임계', v:'2주 4회 이상',      sev:'주의' },
              { name:'연속 결근',     v:'2일 이상 미제출',   sev:'경고' },
              { name:'초과근무',     v:'월간 30h 이상',     sev:'경고' },
              { name:'수습자 적응',   v:'60일 내 지각 2회+', sev:'관찰' },
              { name:'주말 과다 출근', v:'4주 4회 이상',      sev:'관찰' },
            ].map((r,i) => (
              <div key={i} className="abn-rule">
                <div className="abn-rule-name">{r.name}</div>
                <div className="abn-rule-v">{r.v}</div>
                <Chip tone={r.sev==='경고'?'danger':r.sev==='주의'?'warn':'accent'}>{r.sev}</Chip>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-row"><div className="ctitle">이번 달 조치 이력</div></div>
          <div className="hr-timeline" style={{paddingLeft: 4}}>
            <div className="hr-tl-row"><div className="hr-tl-dot accent"/><div><b>5/10</b><div className="small">이나림 · HR 면담 완료 — 증빙자료 제출 요청</div></div></div>
            <div className="hr-tl-row"><div className="hr-tl-dot warn"/><div><b>5/8</b><div className="small">홍자비 · 개인 면담 일정 잡힘 (5/12)</div></div></div>
            <div className="hr-tl-row"><div className="hr-tl-dot warn"/><div><b>5/6</b><div className="small">백민 · 업무량 점검 메모 전달</div></div></div>
            <div className="hr-tl-row"><div className="hr-tl-dot success"/><div><b>5/3</b><div className="small">속결과 · 수술팀 근무표 재편성으로 초과근무 22h→28h 안정화</div></div></div>
          </div>
        </div>
      </div>
    </>
  );
};

// ═════════════════════════════════════════════════════════════════
// 계약·문서 워크센터 (5장 → 1장)
// ═════════════════════════════════════════════════════════════════

const DocsWorkcenter = () => {
  const [tab, setTab] = React.useState('contract');
  return (
    <>
      <div className="tabs" style={{marginBottom: 12}}>
        <button className={'tab-item '+(tab==='contract'?'on':'')} onClick={()=>setTab('contract')}>계약 현황<span className="cnt">27</span></button>
        <button className={'tab-item '+(tab==='gen'  ?'on':'')} onClick={()=>setTab('gen')}>계약서 자동생성</button>
        <button className={'tab-item '+(tab==='store'?'on':'')} onClick={()=>setTab('store')}>문서보관함<span className="cnt">142</span></button>
        <button className={'tab-item '+(tab==='cert' ?'on':'')} onClick={()=>setTab('cert')}>증명서 발급</button>
        <button className={'tab-item '+(tab==='subm' ?'on':'')} onClick={()=>setTab('subm')}>서류 제출<span className="cnt">5</span></button>
      </div>

      <div className="hr-kpi-row">
        <div className="hr-kpi"><div className="lbl">전체 계약</div><div className="v">27<span className="u">건</span></div><div className="sub">정규 22 · 계약 4 · 수습 1</div></div>
        <div className="hr-kpi tone-warn"><div className="lbl">만료 임박 (90일)</div><div className="v">3<span className="u">건</span></div><div className="sub">재계약 권고 대상</div></div>
        <div className="hr-kpi tone-accent"><div className="lbl">문서보관</div><div className="v">142<span className="u">건</span></div><div className="sub">계약 27 · 증빙 84 · 기타 31</div></div>
        <div className="hr-kpi tone-danger"><div className="lbl">서류 미제출</div><div className="v">5<span className="u">건</span></div><div className="sub">건강검진 2 · 가족관계 1 · 기타 2</div></div>
      </div>

      {tab === 'contract' && (
        <div className="card" style={{padding: 0}}>
          <div className="card-row" style={{padding:'12px 16px', margin: 0, borderBottom:'1px solid var(--border)'}}>
            <div className="ctitle">계약 현황 · 27건</div>
            <div className="row" style={{gap: 8}}>
              <select className="board-sort"><option>전체 고용형</option><option>정규직</option><option>계약직</option><option>수습</option></select>
              <Btn size="sm" variant="primary" icon="plus">새 계약</Btn>
            </div>
          </div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr><th>이름</th><th>고용</th><th>계약 종류</th><th>시작일</th><th>종료일</th><th>자동 연장</th><th>상태</th></tr></thead>
            <tbody>
              {[
                { name:'박유진', e:'정규직', kind:'근로계약', start:'2023.1.16', end:'영구',     auto:'-',      s:'유효', tone:'success' },
                { name:'송소현', e:'계약직', kind:'개별근로계약', start:'2025.3.10', end:'2026.6.10', auto:'자동 연장', s:'만료 D-30', tone:'warn'    },
                { name:'박민지', e:'계약직', kind:'개별근로계약', start:'2024.7.15', end:'2026.5.31', auto:'일회사용', s:'만료 D-20', tone:'danger'  },
                { name:'이종도', e:'수습',  kind:'수습계약',   start:'2025.10.1', end:'2026.4.30', auto:'-',      s:'종료',  tone:'muted'    },
                { name:'오민호', e:'정규직', kind:'근로계약',   start:'2025.6.1',  end:'영구',     auto:'-',      s:'유효', tone:'success' },
              ].map((r,i) => (
                <tr key={i}>
                  <td><b style={{fontSize: 12.5}}>{r.name}</b></td>
                  <td><Chip tone={r.e==='정규직'?'success':r.e==='계약직'?'accent':'warn'}>{r.e}</Chip></td>
                  <td><span className="small">{r.kind}</span></td>
                  <td className="tnum"><span className="small">{r.start}</span></td>
                  <td className="tnum"><span className="small">{r.end}</span></td>
                  <td><span className="small">{r.auto}</span></td>
                  <td><Chip tone={r.tone}>{r.s}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'gen' && (
        <div className="hr-row">
          <div className="card">
            <div className="card-row"><div className="ctitle">계약서 템플릿</div><Btn size="sm" icon="plus">템플릿 추가</Btn></div>
            <div className="doc-tpl-grid">
              {[
                { name:'근로계약서 (정규직)', kind:'근로', used: 22, tone:'success' },
                { name:'개별근로계약서',    kind:'근로', used:  4, tone:'success' },
                { name:'수습계약서',         kind:'근로', used:  1, tone:'muted'   },
                { name:'보안서약서 (NDA)',    kind:'특약', used: 18, tone:'accent'  },
                { name:'지적재산동의서',     kind:'특약', used:  9, tone:'accent'  },
                { name:'원교의료기관 계약',  kind:'기타', used:  6, tone:'muted'   },
              ].map((t,i) => (
                <div key={i} className="doc-tpl">
                  <div className="doc-tpl-name">{t.name}</div>
                  <div className="row" style={{justifyContent:'space-between', marginTop: 4}}>
                    <span className="small">{t.kind}</span>
                    <span className="small tnum">사용 {t.used}회</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-row"><div className="ctitle">계약서 생성 흐름</div></div>
            <div className="cl-steps">
              <div className="cl-step done"><div className="cl-step-num"><Icon name="check" size={11}/></div><div className="cl-step-body"><div className="cl-step-t">1. 템플릿 선택</div><div className="cl-step-d">근로계약서 (정규직)</div></div></div>
              <div className="cl-step done"><div className="cl-step-num"><Icon name="check" size={11}/></div><div className="cl-step-body"><div className="cl-step-t">2. 직원 데이터 자동 채움</div><div className="cl-step-d">이름·주민번호·입사일·직급 — 구성원 DB에서 로드</div></div></div>
              <div className="cl-step on"><div className="cl-step-num">3</div><div className="cl-step-body"><div className="cl-step-t">3. 미리보기 · 수정</div><div className="cl-step-d">근무조건·임금·출퇴근 시간 확인</div></div></div>
              <div className="cl-step pending"><div className="cl-step-num">4</div><div className="cl-step-body"><div className="cl-step-t">4. 전자서명 요청</div><div className="cl-step-d">대표자 + 해당 직원에게 동시 전송</div></div></div>
              <div className="cl-step pending"><div className="cl-step-num">5</div><div className="cl-step-body"><div className="cl-step-t">5. 문서보관함 자동 저장</div><div className="cl-step-d">PDF + 메타데이터 자동 입력</div></div></div>
            </div>
            <Btn variant="primary" icon="send" style={{marginTop: 14}}>이 흐름으로 생성 시작</Btn>
          </div>
        </div>
      )}

      {tab === 'store' && (
        <div className="card" style={{padding: 0}}>
          <div className="card-row" style={{padding:'12px 16px', margin:0, borderBottom:'1px solid var(--border)'}}>
            <div className="row" style={{gap: 6}}>
              <button className="todo-chip tone-accent on">전체<span className="cnt">142</span></button>
              <button className="todo-chip">계약서<span className="cnt">27</span></button>
              <button className="todo-chip">증빙서류<span className="cnt">84</span></button>
              <button className="todo-chip">설론서<span className="cnt">12</span></button>
              <button className="todo-chip">기타<span className="cnt">19</span></button>
            </div>
            <div className="input-wrap" style={{minWidth: 220}}>
              <Icon name="search" size={13} className="ico"/>
              <input className="input" placeholder="문서명·이름·태그" style={{paddingLeft: 28, height: 30, fontSize: 12}}/>
            </div>
          </div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr><th>문서명</th><th>관련 직원</th><th>분류</th><th>보관 시작</th><th>보관 기간</th><th>보안</th><th></th></tr></thead>
            <tbody>
              {[
                { name:'근로계약서 (박유진)',   who:'박유진', cat:'계약서', from:'2023.1.16', period:'영구',   sec:'일반', t:'success' },
                { name:'공제증명서',                who:'김지오', cat:'증빙',  from:'2021.4.10', period:'영구',   sec:'일반', t:'success' },
                { name:'주민등록등본',                who:'이나림', cat:'증빙',  from:'2021.4.12', period:'영구',   sec:'대외비',  t:'warn'    },
                { name:'자격증 사본 (BLS)',          who:'김지오', cat:'증빙',  from:'2024.9.15', period:'자격 종료 시',sec:'일반', t:'success' },
                { name:'NDA 서명본',                   who:'전원',  cat:'설론서', from:'2025.3.10', period:'5년',   sec:'대외비',  t:'warn'    },
              ].map((r,i) => (
                <tr key={i}>
                  <td><b style={{fontSize: 12.5}}>{r.name}</b></td>
                  <td><span className="small">{r.who}</span></td>
                  <td><span className="small">{r.cat}</span></td>
                  <td className="tnum"><span className="small">{r.from}</span></td>
                  <td><span className="small">{r.period}</span></td>
                  <td><Chip tone={r.t}>{r.sec}</Chip></td>
                  <td><button className="board-tag" style={{height: 22, padding:'0 8px', fontSize: 10}}>뷰</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'cert' && (
        <div className="hr-row">
          <div className="card">
            <div className="card-row"><div className="ctitle">증명서 종류</div></div>
            <div className="doc-cert-grid">
              {[
                { name:'재직증명서',      iss: 142, last:'5/8' },
                { name:'경력증명서',      iss:  18, last:'5/3' },
                { name:'근로소득원천징수', iss:  86, last:'4/22' },
                { name:'원천징수영수증',  iss:  12, last:'4/15' },
                { name:'휴직증명서',      iss:   3, last:'3/8' },
                { name:'결근증명서',      iss:   5, last:'4/30' },
              ].map((c,i) => (
                <div key={i} className="doc-cert-card">
                  <div className="doc-cert-name">{c.name}</div>
                  <div className="row" style={{justifyContent:'space-between', marginTop: 4}}>
                    <span className="small">누적 {c.iss}회</span>
                    <span className="small tnum">{c.last}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-row"><div className="ctitle">증명서 발급 요청</div></div>
            <div className="ap-form">
              <label><div className="lbl">직원</div><select className="input"><option>박유진</option><option>김지오</option></select></label>
              <label><div className="lbl">증명서 종류</div><select className="input"><option>재직증명서</option><option>경력증명서</option></select></label>
              <div className="row" style={{gap: 10}}>
                <label style={{flex: 1}}><div className="lbl">부수</div><input className="input" defaultValue="1" style={{textAlign:'right'}}/></label>
                <label style={{flex: 1}}><div className="lbl">용도</div><select className="input"><option>은행제출</option><option>관공서</option><option>기타</option></select></label>
              </div>
              <label><div className="lbl">소속과 직위 명기</div>
                <div className="row" style={{gap: 6}}>
                  <Chip tone="accent">✓ 포함</Chip>
                  <Chip tone="muted">제외</Chip>
                </div>
              </label>
              <Btn variant="primary" icon="send">발급 요청 (결재 주안)</Btn>
            </div>
          </div>
        </div>
      )}

      {tab === 'subm' && (
        <div className="card">
          <div className="card-row"><div className="ctitle">직원 서류 제출 현황</div><Btn size="sm">서류 항목 설정</Btn></div>
          <div className="hr-expire-list">
            {[
              { who:'송소현', doc:'건강검진서',     due:'D-7',  tone:'warn'   },
              { who:'오민호', doc:'주민등록등본',     due:'D-3',  tone:'danger' },
              { who:'박민지', doc:'공제증명서',     due:'D-12', tone:'warn'   },
              { who:'이종도', doc:'통장사본',         due:'D-21', tone:'muted'  },
              { who:'조혜원', doc:'가족관계증명서', due:'D-30', tone:'muted'  },
            ].map((r,i) => (
              <div key={i} className="hr-expire-row">
                <Chip tone={r.tone}>{r.due}</Chip>
                <div className="row" style={{gap: 6, alignItems:'center', flex: 1}}>
                  <b>{r.who}</b><span className="small">· {r.doc}</span>
                </div>
                <Btn size="sm">알림</Btn>
                <Btn size="sm" variant="primary">첨부 요청</Btn>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

// ═════════════════════════════════════════════════════════════════
// 그 외 서브메뉴 — placeholder (개략 KPI + 통합 목록 + 본문 예고)
// ═══════════════════════════════════════════════════════════════════

const PlaceholderSubmenu = ({ m }) => (
  <>
    <div className="hr-placeholder">
      <div className="hr-ph-icon"><Icon name={m.icon} size={26}/></div>
      <div className="hr-ph-body">
        <div className="hr-ph-title">{m.label} 워크센터 — 디자인 진행 중</div>
        <div className="hr-ph-sub">
          원래 {m.cnt}장 화면을 1개로 통합합니다. 다음 차수에 본문 디자인을 채울 예정입니다.
        </div>
        <div className="hr-ph-merge">
          <div className="lbl">통합 예정 원본 화면</div>
          <div className="row" style={{gap: 4, flexWrap:'wrap'}}>
            {m.merge.map((t,i) => <span key={i} className="hr-merge-chip">{t}</span>)}
          </div>
        </div>
        <div className="hr-ph-plan">
          <div className="lbl">예상 구성</div>
          <ul>
            {m.id === 'member'   && <>
              <li>상단 KPI: 전체 인원 / 신규 입사 / 퇴사 예정 / 평균 근속</li>
              <li>구성원 표 (정렬·필터·일괄 작업) + 클릭 시 사이드 드로어 (인사 이력 타임라인)</li>
              <li>탭: 구성원 / 인사발령 / 교육·자격</li>
            </>}
            {m.id === 'attend'   && <>
              <li>상단 KPI: 정상 출근 / 지각 / 결근 / 휴가 중</li>
              <li>탭: 대시보드 / 근무표 / 달력</li>
              <li>근무표는 AI 자동 편성 + 3교대 마법사를 하나의 편성 워크플로로 통합</li>
            </>}
            {m.id === 'leave'    && <>
              <li>상단 KPI: 잔여 연차 / 사용 / 소멸 예정 / 신청 대기</li>
              <li>잔여 그리드 + 신청 폼 + 소멸 알림 (인라인)</li>
              <li>경영진은 회사 전체 사용률·소멸률 보드 추가</li>
            </>}
            {m.id === 'abnormal' && <>
              <li>상단 KPI: 지각 빈도 상위 / 조기 퇴근 / 연속 결근 / 패턴 알람</li>
              <li>이상 패턴 자동 감지 카드 + 규칙 설정 + 인계 액션</li>
            </>}
            {m.id === 'welfare'  && <>
              <li>탭: 경조사 / 건강검진 / 면허·자격 / 의료기기 점검</li>
              <li>공통 만료 알림 보드 + 직원별 이력 타임라인 연결</li>
            </>}
            {m.id === 'docs'     && <>
              <li>탭: 계약 현황 / 계약서 자동생성 / 문서보관함 / 증명서 발급 / 서류 제출</li>
              <li>계약서 템플릿 → 자동 생성 → 전자서명 → 보관함 한 흐름으로</li>
            </>}
          </ul>
        </div>
      </div>
    </div>
  </>
);

// ═══════════════════════════════════════════════════════════════════
// 노트
// ═══════════════════════════════════════════════════════════════════

const HrNotes = ({ active, layout }) => {
  const m = HR_SUBMENUS[active] || HR_SUBMENUS.payroll;
  const cfg = HR_LAYOUTS[layout];
  return (
    <Notes
      kicker={'§ 인사관리 — ' + m.label}
      title={'37장 → 7개 통합. 사이드바2 ' + cfg.label + ' 적용 중'}
      points={[
        `현재 보고있는 화면: ${m.label} — 원래 ${m.cnt}장 (${m.merge.join(', ')})을 1개 통합 워크센터로.`,
        `사이드바2 변형 3안: A 평면 7개 / B 4그룹(인력·근태·휴가/보상/복지·문서) / C 활동 흐름. 헤더 우측 segmented로 즉시 전환.`,
        '급여 워크센터는 13장을 1장으로 통합 — 다크 hero (정산 진행 단계) + 8 KPI + 점검 필요 카드 + 13 모듈 빠른 이동 패널.',
        '나머지 서브메뉴는 다음 차수에 본문 디자인 — 현재는 통합 매핑·예상 구성 placeholder.',
        '통합 매핑 배너로 어떤 원본 화면들이 합쳐졌는지 사용자에게 항상 공개.',
        '구성원·근태·연차·복지·계약문서는 각각 탭으로 세분화 (1 화면 안에서 컨텍스트 전환).',
      ]}
    />
  );
};

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

Object.assign(window, {
  HrSidebar2, HrScreen, HrNotes, HR_SUBMENUS, HR_LAYOUTS,
});

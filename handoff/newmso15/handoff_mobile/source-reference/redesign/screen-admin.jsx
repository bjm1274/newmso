// MSO redesign — 관리자 (Admin)
// 26장 → 6개 통합 워크센터

const ADMIN_SUBMENUS = {
  exec:    { id:'exec',    label:'경영 대시보드', icon:'arrowUp',   merge:['경영 대시보드','재무 대시보드','예산 관리','통합 보고서','법인 손익','경영 분석 a','경영 분석 b','정산 분석','경영 분석 (개인 a)','경영 분석 (개인 b)','예결산 a','예결산 b'], cnt: 12 },
  master:  { id:'master',  label:'시스템 마스터', icon:'shield',    merge:['개요','운영대시보드','변경이력','권한변경','전체채팅','정합성점검','복구센터','연차수동부여'], cnt: 8, tag:'NEW' },
  company: { id:'company', label:'회사 관리',     icon:'hr',        merge:['기본정보','근무형태','법인카드','계약 템플릿','휴가·공휴일','급여기준','문서 보관'], cnt: 7 },
  roles:   { id:'roles',   label:'권한 관리',     icon:'shield',    merge:['직원 권한'], cnt: 1 },
  ops:     { id:'ops',     label:'운영 설정',     icon:'plusBox',   merge:['운영 설정','템플릿 a','템플릿 b','템플릿 c','팝업 관리'], cnt: 5 },
  forms:   { id:'forms',   label:'결재 양식',     icon:'fileText',  merge:['양식 관리','양식 편집'], cnt: 2 },
  audit:   { id:'audit',   label:'감사·백업',     icon:'alertTri',  merge:['감사센터 a','감사센터 b','백업·복원','급여 이상치 검사'], cnt: 4 },
};

const AdminSidebar2 = ({ active, onPick }) => (
  <aside className="sidebar2">
    <div className="s2-scroll" style={{display:'grid', gap: 2, flex: 1, overflow:'auto'}}>
      <div className="s2-group-lbl" style={{marginTop: 4}}>관리자</div>
      {Object.values(ADMIN_SUBMENUS).map(m => (
        <div key={m.id} className={'s2-item board-item '+(m.id===active?'on':'')} onClick={()=>onPick(m.id)}>
          <Icon name={m.icon} size={14}/>
          <span style={{flex: 1}}>{m.label}</span>
          {m.primary && <span className="s2-tag" style={{background:'#FEF3C7', color:'#92400E'}}>★</span>}
          {m.tag && <span className="s2-tag" style={{background:'var(--accent)', color:'#FFF'}}>{m.tag}</span>}
          <span className="board-cnt">{m.cnt}</span>
        </div>
      ))}
    </div>
    <div className="s2-foot">
      <div className="small" style={{padding: '0 6px', fontSize: 11}}>26장 → 6개 통합 + 시스템 마스터(신규)</div>
    </div>
  </aside>
);

const AdminScreen = ({ active = 'exec' }) => {
  const m = ADMIN_SUBMENUS[active] || ADMIN_SUBMENUS.exec;
  return (
    <div className="main"><div className="content">
      <div className="mod-pageheader">
        <div><div className="addon-h1">{m.label}</div></div>
        <div className="row" style={{gap: 8}}>
          {active==='exec'    && (<><Btn icon="file">통합 보고서</Btn><Btn variant="primary" icon="send">월말 마감 보고</Btn></>)}
          {active==='master'  && (<><Btn icon="file">감사 로그 CSV</Btn><Btn variant="primary" icon="send">즉시 백업 실행</Btn></>)}
          {active==='company' && (<><Btn>이전 회사</Btn><Btn variant="primary" icon="plus">새 회사·병원 추가</Btn></>)}
          {active==='roles'   && (<><Btn icon="file">감사 로그</Btn><Btn variant="primary" icon="plus">권한 정책 추가</Btn></>)}
          {active==='ops'     && (<Btn variant="primary" icon="plus">새 템플릿</Btn>)}
          {active==='forms'   && (<Btn variant="primary" icon="plus">새 결재 양식</Btn>)}
          {active==='audit'   && (<><Btn>이번 달 리포트</Btn><Btn variant="primary" icon="send">백업 즉시 실행</Btn></>)}
        </div>
      </div>

      <div className="hr-merge-banner">
        <div className="hr-merge-l">
          <span className="hr-merge-kicker">통합된 원본 화면 {m.cnt}장</span>
          <div className="hr-merge-chips">{m.merge.map((t,i) => <span key={i} className="hr-merge-chip">#{i+1} {t}</span>)}</div>
        </div>
        <div className="hr-merge-r"></div>
      </div>

      {active==='exec'    && <ExecDashboard/>}
      {active==='master'  && (window.MasterCenter ? <window.MasterCenter/> : <div className="card">시스템 마스터 센터 로딩 중…</div>)}
      {active==='company' && <CompanyWorkcenter/>}
      {active==='roles'   && <RolesWorkcenter/>}
      {active==='ops'     && <OpsWorkcenter/>}
      {active==='forms'   && <FormsWorkcenter/>}
      {active==='audit'   && <AuditWorkcenter/>}
    </div></div>
  );
};

// ─────────────────────────────────────────────────────────────
// 1. 경영 대시보드 (7장 → 1) — 다크 hero + 8 KPI + 손익·예산 + 분석
// ─────────────────────────────────────────────────────────────

const ExecDashboard = () => (
  <>
    <div className="pr-hero">
      <div className="pr-hero-l">
        <div className="pr-hero-kicker">2026년 5월 (1~11일) · 박철홍정형외과 통합</div>
        <div className="pr-hero-title">매출 <span className="pr-hero-frac">5/31 마감 예정</span></div>
        <div className="pr-hero-steps">
          <div className="pr-step done"><div className="pr-step-num"><Icon name="check" size={11}/></div><div className="pr-step-lbl">4월 마감</div><div className="pr-step-ts">5/3</div></div>
          <div className="pr-step done"><div className="pr-step-num"><Icon name="check" size={11}/></div><div className="pr-step-lbl">손익 확정</div><div className="pr-step-ts">5/4</div></div>
          <div className="pr-step on"><div className="pr-step-num">3</div><div className="pr-step-lbl">5월 진행</div><div className="pr-step-ts">진행 중</div></div>
          <div className="pr-step pending"><div className="pr-step-num">4</div><div className="pr-step-lbl">5월 마감</div><div className="pr-step-ts">예정 6/3</div></div>
          <div className="pr-step pending"><div className="pr-step-num">5</div><div className="pr-step-lbl">분기 보고</div><div className="pr-step-ts">예정 6/30</div></div>
        </div>
      </div>
      <div className="pr-hero-r">
        <div className="pr-hero-amt-lbl">5월 누적 매출 (1-11일)</div>
        <div className="pr-hero-amt">182,420,000<span className="u">원</span></div>
        <div className="pr-hero-amt-sub">전월 동기 <span className="up">+4.2%</span> · 목표 달성률 38%</div>
        <button className="pr-hero-cta">전체 보고서 →</button>
      </div>
    </div>

    <div className="pr-kpi-grid">
      <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="won" size={18} color="#10B981"/></div><div className="pr-kpi-r"><div className="lbl">5월 매출</div><div className="v">182.4<span className="u">M원</span></div><div className="sub">전월 동기 +4.2%</div></div></div>
      <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="arrowDown" size={18} color="#EF4444"/></div><div className="pr-kpi-r"><div className="lbl">5월 비용</div><div className="v">128.7<span className="u">M원</span></div><div className="sub">인건비 94 · 임차료 18 · 기타 16</div></div></div>
      <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="arrowUp" size={18} color="#3B82F6"/></div><div className="pr-kpi-r"><div className="lbl">영업이익</div><div className="v">53.7<span className="u">M원</span></div><div className="sub">이익률 29.4%</div></div></div>
      <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="users" size={18} color="#8B5CF6"/></div><div className="pr-kpi-r"><div className="lbl">방문 환자</div><div className="v">1,284<span className="u">명</span></div><div className="sub">신규 142 · 재진 1,142</div></div></div>
      <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="badge" size={18} color="#F59E0B"/></div><div className="pr-kpi-r"><div className="lbl">예산 집행률</div><div className="v">42<span className="u">%</span></div><div className="sub">5월 누적 / 목표</div></div></div>
      <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="shield" size={18} color="#EC4899"/></div><div className="pr-kpi-r"><div className="lbl">현금 잔고</div><div className="v">412<span className="u">M원</span></div><div className="sub">법인 4개 합산</div></div></div>
      <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="alertCircle" size={18} color="#EF4444"/></div><div className="pr-kpi-r"><div className="lbl">미수금</div><div className="v">14.2<span className="u">M원</span></div><div className="sub">30일 이상 4건</div></div></div>
      <div className="pr-kpi"><div className="pr-kpi-l"><Icon name="bookmark" size={18} color="#06B6D4"/></div><div className="pr-kpi-r"><div className="lbl">결재 대기</div><div className="v">12<span className="u">건</span></div><div className="sub">긴급 2 · 일반 10</div></div></div>
    </div>

    <div className="pr-row">
      <div className="card">
        <div className="card-row"><div className="ctitle">월별 매출·비용·이익 (최근 6개월)</div><Btn size="sm">표 보기</Btn></div>
        <div className="adm-chart">
          {[
            { m:'12월', rev: 312, cost: 234, prof: 78  },
            { m:'1월',  rev: 295, cost: 218, prof: 77  },
            { m:'2월',  rev: 318, cost: 232, prof: 86  },
            { m:'3월',  rev: 342, cost: 246, prof: 96  },
            { m:'4월',  rev: 368, cost: 258, prof: 110 },
            { m:'5월',  rev: 182, cost: 128, prof: 54, partial:true },
          ].map((b,i) => {
            const max = 400;
            return (
              <div key={i} className="adm-bar-group">
                <div className="adm-bar-stack">
                  <div className="adm-bar rev"  style={{height:(b.rev/max*120)+'px'}} title={b.rev+'M'}><span>{b.rev}</span></div>
                  <div className="adm-bar cost" style={{height:(b.cost/max*120)+'px'}} title={b.cost+'M'}><span>{b.cost}</span></div>
                  <div className="adm-bar prof" style={{height:(b.prof/max*120)+'px'}} title={b.prof+'M'}><span>{b.prof}</span></div>
                </div>
                <div className={'adm-bar-lbl '+(b.partial?'partial':'')}>{b.m}{b.partial && ' (1-11)'}</div>
              </div>
            );
          })}
        </div>
        <div className="adm-chart-legend">
          <span><span className="adm-leg rev"/>매출</span>
          <span><span className="adm-leg cost"/>비용</span>
          <span><span className="adm-leg prof"/>이익</span>
        </div>
      </div>

      <div className="card">
        <div className="card-row"><div className="ctitle">예산 vs 집행</div><span className="small">2026 회계연도</span></div>
        <div className="hr-dept-list">
          {[
            { d:'인건비',    plan: 1080, used: 472, pct: 44 },
            { d:'임차료',    plan:  216, used: 108, pct: 50 },
            { d:'의료소모품', plan:  180, used:  68, pct: 38 },
            { d:'마케팅',    plan:   60, used:  18, pct: 30 },
            { d:'기타 운영', plan:  120, used:  56, pct: 47 },
          ].map((d,i) => (
            <div key={i} className="hr-dept-row" style={{gridTemplateColumns:'80px 1fr 120px'}}>
              <div className="hr-dept-name">{d.d}</div>
              <div className="hr-dept-bar"><div className={'hr-dept-seg '+(d.pct>50?'late':'ok')} style={{width: d.pct+'%', background: d.pct>50?'var(--warning)':'linear-gradient(90deg, #3B82F6, #2563EB)'}}/></div>
              <div className="tnum" style={{fontWeight: 800, fontSize: 11, textAlign:'right'}}>{d.used}/{d.plan}<span className="small" style={{fontWeight: 600, marginLeft: 2}}>M ({d.pct}%)</span></div>
            </div>
          ))}
        </div>
        <div className="card-row" style={{marginTop: 16}}><div className="ctitle">법인별 손익 (4법인)</div></div>
        <div className="hr-expire-list">
          <div className="hr-expire-row"><Chip tone="success">+38M</Chip><div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}><b>박철홍정형외과</b><span className="small">· 5월 누적</span></div><span className="tnum" style={{fontWeight: 800}}>이익률 29%</span></div>
          <div className="hr-expire-row"><Chip tone="success">+12M</Chip><div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}><b>수연의원</b><span className="small">· 5월 누적</span></div><span className="tnum" style={{fontWeight: 800}}>이익률 24%</span></div>
          <div className="hr-expire-row"><Chip tone="warn">-2M</Chip><div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}><b>MSO 본사</b><span className="small">· 5월 누적</span></div><span className="tnum" style={{fontWeight: 800}}>적자 진행</span></div>
          <div className="hr-expire-row"><Chip tone="success">+6M</Chip><div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}><b>지점 A</b><span className="small">· 5월 누적</span></div><span className="tnum" style={{fontWeight: 800}}>이익률 18%</span></div>
        </div>
      </div>
    </div>
  </>
);

// ─────────────────────────────────────────────────────────────
// 2. 회사 관리 (7장 → 1) — 7 탭
// ─────────────────────────────────────────────────────────────

const CompanyWorkcenter = () => {
  const [tab, setTab] = React.useState('info');
  return (
    <>
      <div className="tabs" style={{marginBottom: 12}}>
        <button className={'tab-item '+(tab==='info'?'on':'')} onClick={()=>setTab('info')}>기본 정보</button>
        <button className={'tab-item '+(tab==='shift'?'on':'')} onClick={()=>setTab('shift')}>근무 형태</button>
        <button className={'tab-item '+(tab==='card'?'on':'')} onClick={()=>setTab('card')}>법인카드</button>
        <button className={'tab-item '+(tab==='ctpl'?'on':'')} onClick={()=>setTab('ctpl')}>계약 템플릿</button>
        <button className={'tab-item '+(tab==='hol'?'on':'')} onClick={()=>setTab('hol')}>휴가·공휴일</button>
        <button className={'tab-item '+(tab==='pay'?'on':'')} onClick={()=>setTab('pay')}>급여 기준</button>
        <button className={'tab-item '+(tab==='docs'?'on':'')} onClick={()=>setTab('docs')}>문서 보관</button>
      </div>

      {tab === 'info' && (
        <div className="hr-row">
          <div className="card">
            <div className="card-row"><div className="ctitle">박철홍정형외과 — 기본 정보</div><Btn size="sm" variant="primary">저장</Btn></div>
            <div className="ap-form">
              <div className="row" style={{gap: 12}}>
                <label style={{flex: 1}}><div className="lbl">사업자등록번호</div><input className="input" defaultValue="123-45-67890"/></label>
                <label style={{flex: 1}}><div className="lbl">법인 구분</div><select className="input"><option>의료법인</option></select></label>
              </div>
              <label><div className="lbl">대표자</div><input className="input" defaultValue="박철홍"/></label>
              <label><div className="lbl">주소</div><input className="input" defaultValue="서울특별시 강남구 테헤란로 213"/></label>
              <div className="row" style={{gap: 12}}>
                <label style={{flex: 1}}><div className="lbl">대표 전화</div><input className="input" defaultValue="02-1234-5678"/></label>
                <label style={{flex: 1}}><div className="lbl">팩스</div><input className="input" defaultValue="02-1234-5679"/></label>
              </div>
              <label><div className="lbl">의료기관 코드</div><input className="input" defaultValue="11135-001"/></label>
            </div>
          </div>
          <div className="card">
            <div className="card-row"><div className="ctitle">소속 법인 · 지점 (4)</div><Btn size="sm" icon="plus">새 법인</Btn></div>
            <div className="adm-corp-list">
              {[
                { n:'박철홍정형외과', t:'본사·진료', emp: 18, badge:'기본' },
                { n:'수연의원',     t:'지점·진료', emp:  8, badge:null   },
                { n:'MSO 본사',     t:'경영지원',   emp:  5, badge:null   },
                { n:'지점 A',       t:'지점·진료', emp:  6, badge:null   },
              ].map((c,i) => (
                <div key={i} className="adm-corp-row">
                  <div className="adm-corp-name">{c.n}</div>
                  <div className="small">{c.t} · {c.emp}명</div>
                  {c.badge && <Chip tone="accent">{c.badge}</Chip>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'shift' && (
        <div className="card">
          <div className="card-row"><div className="ctitle">근무 형태 (10)</div><Btn size="sm" icon="plus">새 형태</Btn></div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr><th>형태명</th><th>시작</th><th>종료</th><th>휴게</th><th>적용 대상</th><th>상태</th></tr></thead>
            <tbody>
              {[
                { n:'주간 일반 (D)',     s:'09:00', e:'18:00', b:'60분', t:'외래팀·경영지원', a:'활성', tone:'success' },
                { n:'저녁 (E)',         s:'14:00', e:'22:00', b:'60분', t:'외래팀',     a:'활성', tone:'success' },
                { n:'야간 (N)',         s:'22:00', e:'09:00', b:'120분',t:'병동·수술',   a:'활성', tone:'success' },
                { n:'오전 단축',         s:'09:00', e:'13:00', b:'없음',  t:'시급직',     a:'활성', tone:'success' },
                { n:'오후 단축',         s:'13:00', e:'18:00', b:'없음',  t:'시급직',     a:'활성', tone:'success' },
                { n:'주말 일반',         s:'09:00', e:'13:00', b:'없음',  t:'당직',       a:'비활성', tone:'muted'   },
              ].map((r,i) => (
                <tr key={i}>
                  <td><b style={{fontSize: 12.5}}>{r.n}</b></td>
                  <td className="tnum">{r.s}</td>
                  <td className="tnum">{r.e}</td>
                  <td className="tnum"><span className="small">{r.b}</span></td>
                  <td><span className="small">{r.t}</span></td>
                  <td><Chip tone={r.tone}>{r.a}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'card' && (
        <div className="card">
          <div className="card-row"><div className="ctitle">법인카드 사용 내역</div><Btn size="sm" icon="plus">카드 등록</Btn></div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr><th>카드</th><th>사용자</th><th>이번달</th><th>한도</th><th>사용률</th><th>상태</th></tr></thead>
            <tbody>
              {[
                { n:'KB 비즈 (****1234)', who:'박철홍', used: 3.4, lim: 10, pct: 34, t:'정상',  tone:'success' },
                { n:'신한 (****5678)',   who:'김지오', used: 1.2, lim:  5, pct: 24, t:'정상',  tone:'success' },
                { n:'우리 (****9012)',   who:'박유진', used: 4.8, lim:  5, pct: 96, t:'한도 임박', tone:'warn'    },
                { n:'하나 (****3456)',   who:'백민',   used: 0.6, lim:  3, pct: 20, t:'정상',  tone:'success' },
              ].map((r,i) => (
                <tr key={i}>
                  <td><b style={{fontSize: 12}} className="tnum">{r.n}</b></td>
                  <td>{r.who}</td>
                  <td className="tnum">{r.used}M</td>
                  <td className="tnum">{r.lim}M</td>
                  <td><div className="hr-dept-bar" style={{width: 100, height: 8, display:'inline-block'}}><div className={'hr-dept-seg '+(r.pct>90?'late':'ok')} style={{width: r.pct+'%'}}/></div> <span className="tnum small">{r.pct}%</span></td>
                  <td><Chip tone={r.tone}>{r.t}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ctpl' && (
        <div className="hr-grid-3">
          {['근로계약서 (정규직)','개별근로계약서','수습계약서','보안서약서 (NDA)','지적재산동의서','원격의료기관 계약'].map((n,i) => (
            <div key={i} className="cat-card">
              <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
                <b style={{fontSize: 13}}>{n}</b>
                <Btn size="sm">편집</Btn>
              </div>
              <div className="small">버전 v2.3 · 사용 {18-i*3}회 · 최근 4/{12+i}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'hol' && (
        <div className="hr-row">
          <div className="card">
            <div className="card-row"><div className="ctitle">2026 공휴일 (15)</div><Btn size="sm" icon="plus">공휴일 추가</Btn></div>
            <div className="adm-hol-list">
              {[
                { d:'1/1',  n:'신정',       t:'법정' },
                { d:'1/28-30', n:'설날',     t:'법정' },
                { d:'3/1',  n:'삼일절',     t:'법정' },
                { d:'5/5',  n:'어린이날',   t:'법정' },
                { d:'5/15', n:'스승의 날',  t:'기념일' },
                { d:'6/6',  n:'현충일',     t:'법정' },
                { d:'8/15', n:'광복절',     t:'법정' },
                { d:'10/3', n:'개천절',     t:'법정' },
                { d:'12/25',n:'성탄절',     t:'법정' },
              ].map((h,i) => (
                <div key={i} className="hr-rule"><span><b style={{color:'var(--danger)'}} className="tnum">{h.d}</b> · {h.n}</span><Chip tone={h.t==='법정'?'danger':'muted'}>{h.t}</Chip></div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-row"><div className="ctitle">휴가 기준 (정책)</div></div>
            <div className="hr-rules">
              <div className="hr-rule"><span>입사 1년 미만</span><span>월 1일 · 누적</span></div>
              <div className="hr-rule"><span>1~3년차</span><span>연 15일</span></div>
              <div className="hr-rule"><span>3~5년차</span><span>연 16일</span></div>
              <div className="hr-rule"><span>5년차 이상</span><span>연 16~25일 (가산)</span></div>
              <div className="hr-rule"><span>경조사 휴가</span><span>본인 결혼 5일 · 부모상 5일</span></div>
              <div className="hr-rule"><span>출산·육아</span><span>법정 기준 + 회사 가산</span></div>
              <div className="hr-rule"><span>연차 소멸</span><span>발생 후 1년 (단, 사전 통보 시 6개월)</span></div>
            </div>
          </div>
        </div>
      )}

      {tab === 'pay' && (
        <div className="card">
          <div className="card-row"><div className="ctitle">급여 기준 정책</div></div>
          <div className="hr-rules">
            <div className="hr-rule"><span>급여일</span><span>매월 15일 · 전월 1일~말일 정산</span></div>
            <div className="hr-rule"><span>시급 계산 기준</span><span>월 209시간 (주 40h × 4.345주)</span></div>
            <div className="hr-rule"><span>초과근로 수당</span><span>통상임금 × 1.5</span></div>
            <div className="hr-rule"><span>야간근로 수당</span><span>통상임금 × 0.5 (22:00~06:00)</span></div>
            <div className="hr-rule"><span>휴일근로 수당</span><span>통상임금 × 1.5 (8h 이내) / × 2.0 (8h 초과)</span></div>
            <div className="hr-rule"><span>주휴수당</span><span>1주 15h 이상 + 출근율 100%</span></div>
            <div className="hr-rule"><span>퇴직금</span><span>1년 이상 근속 · 평균임금 30일분</span></div>
            <div className="hr-rule"><span>4대보험</span><span>법정 요율 · 자동 적용</span></div>
          </div>
        </div>
      )}

      {tab === 'docs' && (
        <div className="card">
          <div className="card-row"><div className="ctitle">회사 문서 보관함 (38)</div><Btn size="sm" icon="plus">문서 업로드</Btn></div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr><th>문서명</th><th>분류</th><th>업로드</th><th>크기</th><th>접근</th></tr></thead>
            <tbody>
              {[
                { n:'2025년 사업자등록증 사본',    cat:'법인',  date:'2024.12.18', size:'248KB', a:'전사' },
                { n:'법인 인감증명서 (2026)',     cat:'법인',  date:'2026.1.10',  size:'124KB', a:'관리자' },
                { n:'의료기관 개설신고증 사본',   cat:'법인',  date:'2024.3.5',   size:'420KB', a:'전사' },
                { n:'2026 사업자 정관',         cat:'규정',  date:'2026.2.18',  size:'1.2MB', a:'관리자' },
                { n:'2025 결산보고서',          cat:'재무',  date:'2026.3.31',  size:'3.4MB', a:'경영진' },
                { n:'근로기준 운영 매뉴얼',      cat:'인사',  date:'2026.4.1',   size:'860KB', a:'전사' },
              ].map((r,i) => (
                <tr key={i}>
                  <td><b style={{fontSize: 12.5}}>{r.n}</b></td>
                  <td><span className="small">{r.cat}</span></td>
                  <td className="tnum"><span className="small">{r.date}</span></td>
                  <td className="tnum"><span className="small">{r.size}</span></td>
                  <td><Chip tone={r.a==='관리자'?'danger':r.a==='경영진'?'warn':'muted'}>{r.a}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// 3. 권한 관리 — 매트릭스
// ─────────────────────────────────────────────────────────────

const RolesWorkcenter = () => {
  const roles = ['병원장','관리자','부장','직원','시급직','수습'];
  const modules = ['전자결재','인사관리','급여','재고관리','관리자','경영분석'];
  const matrix = [
    ['전체','전체','전체','전체','전체','전체'],
    ['전체','전체','전체','전체','전체','전체'],
    ['전체','부서','부서','부서','-','부서'],
    ['본인','본인','본인','요청','-','-'],
    ['본인','-','본인','-','-','-'],
    ['본인','-','본인','-','-','-'],
  ];
  return (
    <>
      <div className="hr-kpi-row">
        <div className="hr-kpi"><div className="lbl">정의된 역할</div><div className="v">6<span className="u">종</span></div><div className="sub">병원장 / 관리자 / 부장 / 직원 / 시급 / 수습</div></div>
        <div className="hr-kpi tone-accent"><div className="lbl">관리 대상 모듈</div><div className="v">6<span className="u">개</span></div><div className="sub">결재 · 인사 · 급여 · 재고 · 관리자 · 분석</div></div>
        <div className="hr-kpi"><div className="lbl">개별 권한 예외</div><div className="v">4<span className="u">건</span></div><div className="sub">특별 부여 권한</div></div>
        <div className="hr-kpi tone-warn"><div className="lbl">권한 요청 대기</div><div className="v">2<span className="u">건</span></div><div className="sub">결재 진행 중</div></div>
      </div>

      <div className="card" style={{padding: 0, overflow:'auto'}}>
        <div className="card-row" style={{padding:'12px 16px', margin:0, borderBottom:'1px solid var(--border)'}}>
          <div className="ctitle">권한 매트릭스 · 역할 × 모듈</div>
          <Btn size="sm" icon="file">감사 로그 보기</Btn>
        </div>
        <table className="data-tbl adm-role-tbl" style={{width:'100%'}}>
          <thead><tr><th style={{textAlign:'left', minWidth: 120}}>역할 \\ 모듈</th>{modules.map((m,i)=><th key={i} style={{textAlign:'center'}}>{m}</th>)}</tr></thead>
          <tbody>
            {roles.map((r,ri) => (
              <tr key={ri}>
                <td><b>{r}</b></td>
                {matrix[ri].map((v,ci) => (
                  <td key={ci} style={{textAlign:'center'}}>
                    <Chip tone={v==='전체'?'success':v==='부서'?'accent':v==='본인'?'warn':v==='요청'?'muted':'muted'}>
                      {v}
                    </Chip>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-row"><div className="ctitle">개별 권한 예외</div></div>
        <div className="hr-expire-list">
          <div className="hr-expire-row"><Chip tone="accent">특별 부여</Chip><div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}><b>박유진</b><span className="small">· 경영지원팀 책임 · 급여 모듈 부서 → <b>전체</b> 권한 부여</span></div><span className="small tnum">2025.11.5 · 박철홍</span></div>
          <div className="hr-expire-row"><Chip tone="accent">특별 부여</Chip><div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}><b>이재훈</b><span className="small">· 경영분석 모듈 본인 → <b>전체</b> 권한 부여</span></div><span className="small tnum">2026.1.18 · 박철홍</span></div>
          <div className="hr-expire-row"><Chip tone="warn">요청 중</Chip><div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}><b>김지오</b><span className="small">· 재고관리 모듈 부서 → <b>전체</b> 권한 요청</span></div><Btn size="sm">승인</Btn><Btn size="sm">반려</Btn></div>
        </div>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// 4. 운영 설정
// ─────────────────────────────────────────────────────────────

const OpsWorkcenter = () => {
  const [tab, setTab] = React.useState('general');
  return (
    <>
      <div className="tabs" style={{marginBottom: 12}}>
        <button className={'tab-item '+(tab==='general'?'on':'')} onClick={()=>setTab('general')}>일반 설정</button>
        <button className={'tab-item '+(tab==='msg'?'on':'')} onClick={()=>setTab('msg')}>메시지 템플릿<span className="cnt">12</span></button>
        <button className={'tab-item '+(tab==='popup'?'on':'')} onClick={()=>setTab('popup')}>팝업 관리</button>
        <button className={'tab-item '+(tab==='int'?'on':'')} onClick={()=>setTab('int')}>외부 연동</button>
      </div>

      {tab === 'general' && (
        <div className="hr-grid-2">
          <div className="card">
            <div className="card-row"><div className="ctitle">알림 설정</div></div>
            <div className="adm-toggle-list">
              {[
                { n:'이메일 알림', s:true },
                { n:'카카오톡 알림 (알림톡)', s:true },
                { n:'SMS 알림', s:false },
                { n:'푸시 알림', s:true },
                { n:'결재 요청 시 즉시 발송', s:true },
                { n:'근태 이상 자동 감지 알림', s:true },
              ].map((t,i) => (
                <div key={i} className="adm-toggle">
                  <span>{t.n}</span>
                  <div className={'adm-switch '+(t.s?'on':'')}><div className="adm-switch-thumb"/></div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-row"><div className="ctitle">시스템 설정</div></div>
            <div className="ap-form">
              <label><div className="lbl">기본 언어</div><select className="input"><option>한국어</option><option>English</option></select></label>
              <label><div className="lbl">시간대</div><select className="input"><option>Asia/Seoul (UTC+9)</option></select></label>
              <label><div className="lbl">통화</div><select className="input"><option>KRW (원)</option></select></label>
              <label><div className="lbl">세션 만료</div><select className="input"><option>4시간</option><option>1시간</option><option>30분</option></select></label>
              <label><div className="lbl">2단계 인증</div>
                <div className="row" style={{gap: 6}}>
                  <Chip tone="success">필수</Chip>
                  <Chip tone="muted">선택</Chip>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {tab === 'msg' && (
        <div className="hr-grid-2">
          {[
            { n:'결재 요청 알림',     ch:'카카오', use: 142 },
            { n:'결재 승인 알림',     ch:'카카오', use:  98 },
            { n:'결재 반려 알림',     ch:'카카오', use:  12 },
            { n:'근태 이상 알림',     ch:'이메일', use:  18 },
            { n:'급여 명세 발송',     ch:'이메일', use:  27 },
            { n:'생일 축하 메시지',   ch:'카카오', use:  22 },
            { n:'증명서 발급 완료',   ch:'카카오', use:  86 },
            { n:'재고 부족 경고',     ch:'슬랙',   use:  42 },
          ].map((t,i) => (
            <div key={i} className="adm-msg-card">
              <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
                <b style={{fontSize: 13}}>{t.n}</b>
                <Chip tone={t.ch==='카카오'?'warn':t.ch==='이메일'?'accent':'success'}>{t.ch}</Chip>
              </div>
              <div className="small" style={{marginTop: 6}}>발송 {t.use}회 · 최근 4/30</div>
              <div className="row" style={{gap: 6, marginTop: 10}}>
                <Btn size="sm">편집</Btn>
                <Btn size="sm">미리보기</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'popup' && (
        <div className="card">
          <div className="card-row"><div className="ctitle">로그인 팝업 (3 활성)</div><Btn size="sm" variant="primary" icon="plus">팝업 추가</Btn></div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr><th>제목</th><th>표시 기간</th><th>대상</th><th>표시</th><th>상태</th></tr></thead>
            <tbody>
              {[
                { n:'2026 신년 인사',        d:'1/1 ~ 1/7',   t:'전체',  show: 27, s:'종료', tone:'muted' },
                { n:'개인정보 동의 갱신',     d:'4/1 ~ 4/30',  t:'전체',  show: 24, s:'종료', tone:'muted' },
                { n:'5월 어린이날 휴진 안내', d:'5/1 ~ 5/7',   t:'전체',  show: 27, s:'활성', tone:'success' },
                { n:'근무표 자동편성 안내',   d:'5/10 ~ 5/20', t:'관리자', show:  3, s:'활성', tone:'success' },
                { n:'백업 점검 일정',         d:'5/15 ~ 5/22', t:'전체',  show:  0, s:'예약', tone:'warn' },
              ].map((r,i) => (
                <tr key={i}>
                  <td><b>{r.n}</b></td>
                  <td><span className="small">{r.d}</span></td>
                  <td><span className="small">{r.t}</span></td>
                  <td className="tnum">{r.show}</td>
                  <td><Chip tone={r.tone}>{r.s}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'int' && (
        <div className="hr-grid-2">
          {[
            { n:'카카오톡 알림톡', state:'연결됨', sub:'발신 프로필 sy_inc', tone:'success' },
            { n:'네이버웍스',     state:'연결됨', sub:'OAuth 활성', tone:'success' },
            { n:'슬랙',          state:'연결됨', sub:'#mso-알림 채널', tone:'success' },
            { n:'국세청 홈택스',  state:'연결됨', sub:'전자세금계산서·원천징수', tone:'success' },
            { n:'4대보험 EDI',   state:'연결됨', sub:'국민·건강·고용·산재', tone:'success' },
            { n:'은행 펌뱅킹',    state:'연결 안됨', sub:'급여 자동이체용 — 설정 필요', tone:'warn' },
          ].map((it,i) => (
            <div key={i} className="adm-int-card">
              <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
                <b style={{fontSize: 13.5}}>{it.n}</b>
                <Chip tone={it.tone}>{it.state}</Chip>
              </div>
              <div className="small" style={{marginTop: 4}}>{it.sub}</div>
              <div className="row" style={{gap: 6, marginTop: 12}}>
                <Btn size="sm">설정</Btn>
                {it.tone==='success' && <Btn size="sm">연결 끊기</Btn>}
                {it.tone==='warn' && <Btn size="sm" variant="primary">연결하기</Btn>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// 5. 결재 양식
// ─────────────────────────────────────────────────────────────

const FormsWorkcenter = () => (
  <>
    <div className="hr-kpi-row">
      <div className="hr-kpi"><div className="lbl">전체 양식</div><div className="v">14<span className="u">종</span></div></div>
      <div className="hr-kpi tone-success"><div className="lbl">활성</div><div className="v">12<span className="u">종</span></div></div>
      <div className="hr-kpi tone-muted"><div className="lbl">비활성·보류</div><div className="v">2<span className="u">종</span></div></div>
      <div className="hr-kpi"><div className="lbl">이번 달 사용</div><div className="v">142<span className="u">회</span></div><div className="sub">물품신청 38 · 연차 28 · 기타</div></div>
    </div>

    <div className="hr-grid-3">
      {[
        { n:'물품신청',      g:'근태·휴가',  v:'v2.4', use: 38, s:'활성',   tone:'success' },
        { n:'연차/휴가',     g:'근태·휴가',  v:'v1.8', use: 28, s:'활성',   tone:'success' },
        { n:'연차계획서',     g:'근태·휴가',  v:'v1.2', use:  8, s:'활성',   tone:'success' },
        { n:'연장근무',      g:'근태·휴가',  v:'v1.5', use: 18, s:'활성',   tone:'success' },
        { n:'출결정정',      g:'근태·휴가',  v:'v1.3', use: 12, s:'활성',   tone:'success' },
        { n:'수리요청서',    g:'업무·지원', v:'v1.6', use:  6, s:'활성',   tone:'success' },
        { n:'보고서 작성',   g:'업무·지원', v:'v1.4', use:  9, s:'활성',   tone:'success' },
        { n:'업무기안',      g:'업무·지원', v:'v2.1', use: 14, s:'활성',   tone:'success' },
        { n:'업무협조',      g:'업무·지원', v:'v1.2', use:  4, s:'활성',   tone:'success' },
        { n:'공문발송',      g:'업무·지원', v:'v1.0', use:  2, s:'권한 필요', tone:'warn' },
        { n:'양식신청',      g:'양식·기타', v:'v1.1', use:  3, s:'활성',   tone:'success' },
        { n:'연차촉진통보서', g:'양식·기타', v:'v1.0', use:  0, s:'활성',   tone:'success' },
        { n:'외부협력 동의서', g:'기타',     v:'v0.9', use:  0, s:'초안',   tone:'muted' },
        { n:'장기근속 보상',  g:'기타',     v:'v0.5', use:  0, s:'보류',   tone:'muted' },
      ].map((f,i) => (
        <div key={i} className="adm-form-card">
          <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
            <div>
              <b style={{fontSize: 13.5}}>{f.n}</b>
              <div className="small" style={{marginTop: 2}}>{f.g} · {f.v}</div>
            </div>
            <Chip tone={f.tone}>{f.s}</Chip>
          </div>
          <div className="row" style={{justifyContent:'space-between', marginTop: 12, alignItems:'center'}}>
            <span className="small tnum">사용 {f.use}회</span>
            <Btn size="sm">편집</Btn>
          </div>
        </div>
      ))}
    </div>
  </>
);

// ─────────────────────────────────────────────────────────────
// 6. 감사·백업
// ─────────────────────────────────────────────────────────────

const AuditWorkcenter = () => {
  const [tab, setTab] = React.useState('log');
  return (
    <>
      <div className="tabs" style={{marginBottom: 12}}>
        <button className={'tab-item '+(tab==='log'?'on':'')} onClick={()=>setTab('log')}>감사 로그<span className="cnt">today</span></button>
        <button className={'tab-item '+(tab==='abn'?'on':'')} onClick={()=>setTab('abn')}>이상 감지<span className="cnt">3</span></button>
        <button className={'tab-item '+(tab==='salary'?'on':'')} onClick={()=>setTab('salary')}>급여 이상치<span className="cnt">2</span></button>
        <button className={'tab-item '+(tab==='backup'?'on':'')} onClick={()=>setTab('backup')}>백업·복원</button>
      </div>

      <div className="hr-kpi-row">
        <div className="hr-kpi"><div className="lbl">오늘 로그</div><div className="v">1,284<span className="u">건</span></div><div className="sub">로그인 86 · 수정 142 · 조회 1,056</div></div>
        <div className="hr-kpi tone-warn"><div className="lbl">이상 감지</div><div className="v">3<span className="u">건</span></div><div className="sub">대량 수정 1 · 비정상 시간 2</div></div>
        <div className="hr-kpi tone-danger"><div className="lbl">급여 이상치</div><div className="v">2<span className="u">건</span></div><div className="sub">전월 대비 30%+ 차이</div></div>
        <div className="hr-kpi tone-success"><div className="lbl">마지막 백업</div><div className="v">12<span className="u">시간 전</span></div><div className="sub">자동 백업 정상</div></div>
      </div>

      {tab === 'log' && (
        <div className="card" style={{padding: 0}}>
          <div className="card-row" style={{padding:'12px 16px', margin:0, borderBottom:'1px solid var(--border)'}}>
            <div className="row" style={{gap: 6}}>
              <button className="todo-chip tone-accent on">전체<span className="cnt">1.2k</span></button>
              <button className="todo-chip">로그인<span className="cnt">86</span></button>
              <button className="todo-chip">수정<span className="cnt">142</span></button>
              <button className="todo-chip">조회<span className="cnt">1,056</span></button>
              <button className="todo-chip tone-danger">실패<span className="cnt">8</span></button>
            </div>
            <Btn size="sm" icon="file">CSV 내보내기</Btn>
          </div>
          <table className="data-tbl" style={{width:'100%'}}>
            <thead><tr><th>시각</th><th>사용자</th><th>동작</th><th>대상</th><th>IP</th><th></th></tr></thead>
            <tbody>
              {[
                { time:'14:23:48', who:'박유진', act:'급여 정산 결재', t:'2026.5 정산', ip:'192.168.1.42', s:'성공', tone:'success' },
                { time:'14:15:22', who:'백민',   act:'직원 정보 수정', t:'송소현 (2025-018)', ip:'192.168.1.18', s:'성공', tone:'success' },
                { time:'13:48:11', who:'김지오', act:'근무표 편성', t:'2026.5 외래팀', ip:'192.168.1.34', s:'성공', tone:'success' },
                { time:'13:32:05', who:'(미인증)', act:'로그인 시도', t:'admin', ip:'58.224.x.x', s:'실패', tone:'danger' },
                { time:'12:58:34', who:'박철홍', act:'결재 승인', t:'PO-2026-0512-001', ip:'192.168.1.10', s:'성공', tone:'success' },
                { time:'11:42:18', who:'홍자비', act:'증명서 발급', t:'재직증명서 (이나림)', ip:'192.168.1.28', s:'성공', tone:'success' },
              ].map((r,i) => (
                <tr key={i}>
                  <td className="tnum"><span className="small">{r.time}</span></td>
                  <td><b style={{fontSize: 12}}>{r.who}</b></td>
                  <td><span className="small">{r.act}</span></td>
                  <td><span className="small">{r.t}</span></td>
                  <td className="tnum"><span className="small">{r.ip}</span></td>
                  <td><Chip tone={r.tone}>{r.s}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'abn' && (
        <div className="card">
          <div className="card-row"><div className="ctitle">이상 감지 · 최근 7일</div></div>
          <div className="abn-list">
            <div className="abn-card tone-warn">
              <div className="abn-card-l"><Chip tone="warn">대량 수정</Chip><div className="abn-kind">일괄 데이터 수정</div></div>
              <div className="abn-card-m"><div className="abn-who"><b>백민</b><span className="small"> · 경영지원팀</span></div><div className="abn-desc">5/10 14:22 — 직원 정보 14건 일괄 수정 (계약·전화·주소 필드)</div></div>
              <div className="abn-card-r"><div className="abn-suggest">권장: <b>사유 확인 + 결재 의무화</b></div><div className="row" style={{gap: 6, marginTop: 8}}><Btn size="sm">상세</Btn><Btn size="sm" variant="primary">사유 요청</Btn></div></div>
            </div>
            <div className="abn-card tone-danger">
              <div className="abn-card-l"><Chip tone="danger">비정상 시간</Chip><div className="abn-kind">새벽 접속</div></div>
              <div className="abn-card-m"><div className="abn-who"><b>(미인증)</b><span className="small"> · IP 58.224.x.x</span></div><div className="abn-desc">5/11 03:18 ~ 03:32 — admin 계정 로그인 시도 8회 실패</div></div>
              <div className="abn-card-r"><div className="abn-suggest">권장: <b>IP 차단 + 2단계 인증 점검</b></div><div className="row" style={{gap: 6, marginTop: 8}}><Btn size="sm">상세</Btn><Btn size="sm" variant="primary">IP 차단</Btn></div></div>
            </div>
            <div className="abn-card tone-accent">
              <div className="abn-card-l"><Chip tone="accent">관찰</Chip><div className="abn-kind">권한 외 시도</div></div>
              <div className="abn-card-m"><div className="abn-who"><b>이나림</b><span className="small"> · 외래팀</span></div><div className="abn-desc">5/9 11:12 — 급여 모듈 접근 시도 (권한 없음)</div></div>
              <div className="abn-card-r"><div className="abn-suggest">권장: <b>권한 정책 안내</b></div><div className="row" style={{gap: 6, marginTop: 8}}><Btn size="sm">상세</Btn><Btn size="sm">안내</Btn></div></div>
            </div>
          </div>
        </div>
      )}

      {tab === 'salary' && (
        <div className="card">
          <div className="card-row"><div className="ctitle">급여 이상치 검사 · 2026년 5월</div></div>
          <div className="hr-expire-list">
            <div className="hr-expire-row" style={{background:'var(--danger-soft)'}}>
              <Chip tone="danger">+38%</Chip>
              <div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}>
                <b>김지오</b><span className="small">· 전월 대비 +1,820,000 — 인사발령 (책임 → 부장)에 따른 정상 증가 가능성</span>
              </div>
              <Btn size="sm">사유 확인</Btn>
              <Btn size="sm" variant="primary">정상 처리</Btn>
            </div>
            <div className="hr-expire-row" style={{background:'var(--warning-soft)'}}>
              <Chip tone="warn">-22%</Chip>
              <div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}>
                <b>이나림</b><span className="small">· 전월 대비 -642,000 — 5/1 무급결근 · 야간 수당 감소 추정</span>
              </div>
              <Btn size="sm">상세 분석</Btn>
            </div>
          </div>
        </div>
      )}

      {tab === 'backup' && (
        <div className="hr-row">
          <div className="card">
            <div className="card-row"><div className="ctitle">최근 백업 (10)</div><Btn size="sm" variant="primary" icon="send">즉시 백업</Btn></div>
            <div className="hr-expire-list">
              {[
                { d:'2026.5.11 02:00', size:'1.84GB', dur:'18분', t:'자동',   tone:'success' },
                { d:'2026.5.10 02:00', size:'1.82GB', dur:'17분', t:'자동',   tone:'success' },
                { d:'2026.5.9 14:30',  size:'1.82GB', dur:'18분', t:'수동',   tone:'accent'  },
                { d:'2026.5.9 02:00',  size:'1.81GB', dur:'17분', t:'자동',   tone:'success' },
              ].map((b,i) => (
                <div key={i} className="hr-expire-row">
                  <Chip tone={b.tone}>{b.t}</Chip>
                  <div className="row" style={{gap: 6, flex: 1, alignItems:'center'}}><b className="tnum">{b.d}</b><span className="small">· {b.size} · {b.dur}</span></div>
                  <Btn size="sm">다운로드</Btn>
                  <Btn size="sm">복원</Btn>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-row"><div className="ctitle">백업 정책</div></div>
            <div className="hr-rules">
              <div className="hr-rule"><span>자동 백업</span><span>매일 02:00 (KST)</span></div>
              <div className="hr-rule"><span>보관 기간</span><span>30일 (이후 압축 보관)</span></div>
              <div className="hr-rule"><span>저장 위치</span><span>S3 / 이중화</span></div>
              <div className="hr-rule"><span>암호화</span><span>AES-256</span></div>
              <div className="hr-rule"><span>복원 권한</span><span>관리자 + 2단계 인증</span></div>
            </div>
            <div className="card-row" style={{marginTop: 16}}><div className="ctitle">DR (재해 복구)</div></div>
            <div className="hr-rules">
              <div className="hr-rule"><span>RPO</span><span>1시간 이내</span></div>
              <div className="hr-rule"><span>RTO</span><span>4시간 이내</span></div>
              <div className="hr-rule"><span>마지막 DR 훈련</span><span>2026.2.15 · 성공</span></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const AdminNotes = ({ active }) => {
  if (active === 'master' && window.MasterCenterNotes) {
    return <window.MasterCenterNotes/>;
  }
  const m = ADMIN_SUBMENUS[active] || ADMIN_SUBMENUS.exec;
  return (
    <Notes
      kicker={'§ 관리자 — ' + m.label}
      title={`26장 → 6개 통합. 현재 ${m.label} (원본 ${m.cnt}장)`}
      points={[
        '경영 대시보드 = 경영/재무/예산/통합보고서/법인손익/분석 a/b 7장을 1장으로 통합 — 다크 hero + 8 KPI + 매출·비용·이익 6개월 차트 + 예산·법인 손익.',
        '회사 관리 = 기본정보·근무형태·법인카드·계약템플릿·휴가/공휴일·급여기준·문서보관 7개를 단일 7-탭 워크센터로.',
        '권한 관리 = 역할 × 모듈 매트릭스 + 개별 권한 예외 + 권한 요청 처리.',
        '운영 설정 = 일반 설정 + 메시지 템플릿(12종) + 팝업 관리 + 외부 연동 6개 (카카오·웍스·슬랙·홈택스·EDI·은행).',
        '결재 양식 = 14종 카드 그리드 — 그룹·버전·사용 횟수·상태(활성/권한 필요/초안/보류).',
        '감사·백업 = 감사 로그 + 이상 감지 카드 + 급여 이상치 검사 + 백업·복원 + DR 정책. 4-탭 통합.',
      ]}
    />
  );
};

Object.assign(window, {
  AdminSidebar2, AdminScreen, AdminNotes, ADMIN_SUBMENUS,
});

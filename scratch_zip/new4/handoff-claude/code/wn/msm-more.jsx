// MSO 모바일 — 전체 메뉴 그리드 + 인사/재고/관리자 + 게시판 홈
function AddonScreen({ topInset, bottomInset, onOpen }) {
  const D = window.MSM;
  const [sub, setSub] = React.useState(null);
  const A = window.ADDON_SCREENS || {};
  return (
    <>
      <MsmAppbar topInset={topInset} eyebrow="MSO" title="추가기능" actions={<button className="msm-ibtn"><Icon name="search" size={19} /></button>} />
      <div className="msm-scroll">
        <div className="msm-body">
          {D.allMenus.map(sec => (
            <div key={sec.group}>
              <div className="msm-sec" style={{ marginBottom: 10 }}><span className="msm-sec-t">{sec.group}</span></div>
              <div className="msm-quick">
                {sec.items.map(it => {
                  const t = msmTone(it.tone);
                  return (
                    <button key={it.id} className="msm-quick-item" onClick={() => A[it.id] ? setSub(it.id) : (onOpen && onOpen(it.id))}>
                      <span className="msm-quick-ic" style={{ background: t.bg, color: t.fg }}><Icon name={it.icon} size={23} /></span>
                      <span className="msm-quick-lbl">{it.lbl}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ height: bottomInset + 8 }} />
        </div>
      </div>
      {/* 모듈 상세 */}
      {Object.keys(A).map(k => (
        <MsmSubScreen key={k} open={sub === k} title={A[k].title} backLabel="추가기능"
          topInset={topInset} bottomInset={bottomInset} onClose={() => setSub(null)}>
          {sub === k ? A[k].body : null}
        </MsmSubScreen>
      ))}
    </>
  );
}

// 인사관리 — 7개 통합 서브메뉴 허브 (PC redesign/screen-hr.jsx 사양)
const HR_MENUS = [
  { id: 'member', label: '구성원', icon: 'users', tone: 'accent', sub: '구성원 리스트 · 인사발령 · 교육·자격', n: 27, unit: '명' },
  { id: 'attend', label: '근태', icon: 'clock', tone: 'success', sub: '대시보드 · 근무표 · 3교대 · 근태달력 · 이상감지', n: 24, unit: '명 근무' },
  { id: 'leave', label: '연차·휴가', icon: 'calendar', tone: 'accent', sub: '잔여 · 신청 · 소멸 알림 · 계획서', n: 11, unit: '일 평균' },
  { id: 'payroll', label: '급여 워크센터', icon: 'won', tone: 'warn', sub: '정산 · 대장 · 4대보험 · 원천징수 외 13종', n: 0, unit: '', badge: '정산 중' },
  { id: 'welfare', label: '복지', icon: 'star', tone: 'accent', sub: '경조사 · 건강검진 · 면허·자격 · 의료기기', n: 5, unit: '건' },
  { id: 'docs', label: '계약·문서', icon: 'fileText', tone: 'muted', sub: '계약 관리 · 자동생성 · 문서함 · 증명서', n: 5, unit: '건' },
];
const HR_MEMBERS = [
  { name: '박철홍', dept: '진료부 · 진료팀', position: '병원장', employ: '정규직', tenure: '8년 2개월' },
  { name: '김지오', dept: '간호부 · 병동팀', position: '간호부장', employ: '정규직', tenure: '5년 11개월' },
  { name: '박유진', dept: '경영지원팀', position: '책임', employ: '정규직', tenure: '2년 4개월' },
  { name: '송소현', dept: '간호부 · 외래팀', position: '간호사', employ: '계약직', tenure: '1년 2개월' },
  { name: '오민호', dept: '간호부 · 수술팀', position: '간호사', employ: '수습', tenure: '11개월' },
];

const HR_CO = {
  '박철홍정형외과': { total: 27, sub: '정규 22·계약 4·수습 1', work: 24, late: 2, leave: 11, rate: '27%', tenure: '4.2', tenureSub: '신규 11개월' },
  '수연의원': { total: 8, sub: '정규 6·계약 2', work: 7, late: 0, leave: 9, rate: '31%', tenure: '3.1', tenureSub: '신규 5개월' },
  'MSO 본사': { total: 5, sub: '정규 5', work: 5, late: 1, leave: 13, rate: '18%', tenure: '5.6', tenureSub: '신규 0명' },
};
function HrHubBody({ onOpen, company, setCompany }) {
  const COS = ['박철홍정형외과', '수연의원', 'MSO 본사'];
  return (
    <>
      <select className="mm-select" style={{ width: '100%' }} value={company} onChange={e => setCompany(e.target.value)}>
        {COS.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <div className="mm-kpis">
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="users" size={16} /></span><div className="info"><div className="lbl">전체 인원</div><div className="sub">{HR_CO[company].sub}</div></div><div className="v">{HR_CO[company].total}<small>명</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--success-soft)', color: '#047857' }}><Icon name="clock" size={16} /></span><div className="info"><div className="lbl">오늘 근무</div><div className="sub">지각 {HR_CO[company].late}</div></div><div className="v">{HR_CO[company].work}<small>명</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--warning-soft)', color: '#B45309' }}><Icon name="calendar" size={16} /></span><div className="info"><div className="lbl">평균 잔여연차</div><div className="sub">소진율 {HR_CO[company].rate}</div></div><div className="v">{HR_CO[company].leave}<small>일</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="star" size={16} /></span><div className="info"><div className="lbl">평균 근속</div><div className="sub">{HR_CO[company].tenureSub}</div></div><div className="v">{HR_CO[company].tenure}<small>년</small></div></div>
      </div>
    </>
  );
}

function HrAttendBody() {
  const [tab, setTab] = React.useState('board');
  const rows = [
    { n: '김지오', t: '간호부장', in: '08:42', state: '정상', tone: 'success' },
    { n: '홍자비', t: '주임', in: '09:18', state: '지각', tone: 'warn' },
    { n: '이나림', t: '수간호사', in: '09:24', state: '지각', tone: 'warn' },
    { n: '백정민', t: '이사', in: '08:30', state: '정상', tone: 'success' },
  ];
  const TABS = [['board', '근태 대시보드'], ['sched', '근무표'], ['shift', '3교대 마법사'], ['cal', '근태달력']];
  return (
    <>
      <div className="mm-kpis">
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--success-soft)', color: '#047857' }}><Icon name="checkCircle" size={16} /></span><div className="info"><div className="lbl">정상 출근</div><div className="sub">오늘</div></div><div className="v">22<small>명</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--warning-soft)', color: '#B45309' }}><Icon name="clock" size={16} /></span><div className="info"><div className="lbl">지각</div><div className="sub">홍자비 외 1</div></div><div className="v">2<small>명</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Icon name="alertTri" size={16} /></span><div className="info"><div className="lbl">결근</div><div className="sub">무단 0</div></div><div className="v">0<small>명</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="calendar" size={16} /></span><div className="info"><div className="lbl">연차/외출</div><div className="sub">근무 외</div></div><div className="v">3<small>명</small></div></div>
      </div>
      <div className="glm-chiprow" style={{ display: 'flex', gap: 7, overflowX: 'auto' }}>
        {TABS.map(([id, lbl]) => <button key={id} className={'glm-chip' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>{lbl}</button>)}
      </div>
      {tab === 'board' && (
        <>
          <div className="msm-sec"><span className="msm-sec-t">오늘 출근 현황</span></div>
          <div className="msm-list">
            {rows.map(r => (
              <div key={r.n} className="msm-row" style={{ cursor: 'default' }}>
                <span className="org-pic sm" style={{ background: avTone(r.n) }}>{r.n[0]}</span>
                <div className="main"><div className="nm">{r.n} <span className="msm-badge muted" style={{ fontSize: 10 }}>{r.t}</span></div><div className="sub" style={{ fontFeatureSettings: '"tnum"' }}>{r.in} 출근</div></div>
                <div className="meta"><span className={'msm-badge ' + r.tone}>{r.state}</span></div>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'sched' && (
        <>
          <div className="msm-sec"><span className="msm-sec-t">근무표 (5월)</span><span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}><button className="msm-mini-btn"><Icon name="plus" size={13} /> 수동</button><button className="msm-mini-btn solid"><Icon name="star" size={13} /> AI 생성</button></span></div>
          <div className="msm-list">
            {[{ t: '외래팀 근무표', s: '확정 · 6명', v: '100%', bt: 'success', p: 100 }, { t: '병동팀 근무표', s: '편성 중 · 8명', v: '62%', bt: 'warn', p: 62 }, { t: '수술팀 근무표', s: '확정 · 4명', v: '100%', bt: 'success', p: 100 }, { t: '검사팀 근무표', s: '미편성 · 3명', v: '0%', bt: 'danger', p: 0 }].map((r, i) => (
              <div key={i} className="dc-row">
                <div className="dc-row-top"><span className="lead" style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-700)', display: 'grid', placeItems: 'center' }}><Icon name="calendar" size={15} /></span><span className="dc-row-nm" style={{ fontSize: 14 }}>{r.t}</span><span className={'msm-badge ' + r.bt} style={{ marginLeft: 'auto' }}>{r.s}</span></div>
                <div className="msm-prog"><i className={r.p >= 100 ? 'success' : r.p > 0 ? 'warn' : 'danger'} style={{ width: r.p + '%' }} /></div>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'shift' && (
        <>
          <div className="msm-sec"><span className="msm-sec-t">3교대 마법사</span><button className="msm-sec-more">자동 배정 ▶</button></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { b: 'Day', bt: 'accent', t: '08:30–17:30', staff: ['김지오', '이은혜', '박지영', '최찬'], n: 12 },
              { b: 'Evening', bt: 'warn', t: '14:30–22:30', staff: ['윤서연', '임소현'], n: 5 },
              { b: 'Night', bt: 'violet', t: '22:00–07:00', staff: ['한지수'], n: 3 },
            ].map((g, i) => (
              <div key={i} className={'wn-shiftcard b-' + (g.bt === 'violet' ? 'violet' : g.bt)}>
                <div className="wn-sc-head">
                  <div><span className={'wn-band-badge b-' + (g.bt === 'violet' ? 'violet' : g.bt)}>{g.b}</span><div className="wn-sc-time" style={{ marginTop: 4 }}>{g.t}</div></div>
                  <span className="wn-count">{g.n}명</span>
                </div>
                <div className="wn-staffs" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                  {g.staff.map(n => <div key={n} className="wn-staff" style={{ textAlign: 'center', padding: '7px 4px' }}><span className="org-pic sm" style={{ background: avTone(n), margin: '0 auto 4px' }}>{n[0]}</span><div style={{ fontSize: 11, fontWeight: 700 }}>{n}</div></div>)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'cal' && (
        <>
          <div className="msm-sec"><span className="msm-sec-t">근태달력 · 2026년 5월</span></div>
          <div className="wn-monthcal">
            <div className="mm-cal" style={{ marginBottom: 4 }}>
              {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => <div key={d} className={'mm-cal-h' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{d}</div>)}
            </div>
            <div className="mm-cal">
              {[...Array(5)].map((_, i) => <div key={'e' + i} className="wn-mc-d empty" />)}
              {[...Array(31)].map((_, idx) => {
                const d = idx + 1; const wd = new Date(2026, 4, d).getDay();
                const holiday = d === 24; const today = d === 31;
                return (
                  <div key={d} className={'wn-mc-d' + (today ? ' today sel' : '') + (wd === 0 || holiday ? ' sun' : '') + (wd === 6 ? ' sat' : '')}>
                    <span className="dn">{d}</span>
                    {holiday ? <span className="cn" style={{ color: 'var(--danger)' }}>휴일</span> : (wd !== 0 && wd !== 6) ? <span className="cn">근무</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="msm-list">
            {[{ t: '근무일', s: '평일 21 · 주말 8', v: '29일' }, { t: '공휴일', s: '부처님오신날', v: '5/24', bt: 'danger' }, { t: '내 근무', s: '주간 21 · 야간 0', v: '21일' }].map((r, i) => (
              <div key={i} className="msm-row" style={{ cursor: 'default' }}><span className="lead" style={{ background: 'var(--z-100)', color: 'var(--z-600)' }}><Icon name="calendar" size={17} /></span>
                <div className="main"><div className="nm">{r.t}</div><div className="sub">{r.s}</div></div><div className="meta"><span className={'msm-badge ' + (r.bt || 'muted')}>{r.v}</span></div></div>
            ))}
          </div>
        </>
      )}
      {tab === 'board' && (
      <>
      <div className="msm-sec"><span className="msm-sec-t">근태이상 감지</span><span className="msm-badge warn" style={{ marginLeft: 6 }}>3건</span></div>
      <div className="msm-list">
        {[{ n: '홍자비', b: '지각 3회', s: '5/2·5/7·5/11', bt: 'warn' }, { n: '이나림', b: '조퇴 2회', s: '5/6·5/9', bt: 'warn' }, { n: '조현준', b: '연속야간 4일', s: '근로기준 점검', bt: 'danger' }].map((r, i) => (
          <div key={i} className="msm-row" style={{ cursor: 'default' }}><span className="org-pic sm" style={{ background: avTone(r.n) }}>{r.n[0]}</span>
            <div className="main"><div className="nm">{r.n} <span className={'msm-badge ' + r.bt} style={{ fontSize: 10 }}>{r.b}</span></div><div className="sub">{r.s}</div></div></div>
        ))}
      </div>
      </>
      )}
    </>
  );
}

function HrLeaveBody() {
  const [ltab, setLtab] = React.useState('bal');
  const rows = [
    { n: '박유진', type: '연차', d: '5/20-21', days: '2일', state: '결재중', tone: 'warn' },
    { n: '송소현', type: '연차', d: '5/13', days: '1일', state: '승인', tone: 'success' },
    { n: '이가연', type: '반차(오후)', d: '5/9', days: '0.5일', state: '승인', tone: 'success' },
    { n: '조현준', type: '연차', d: '5/2', days: '1일', state: '승인', tone: 'success' },
  ];
  return (
    <>
      <div className="msm-hero" style={{ background: 'linear-gradient(135deg,#047857,#10B981)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>2026년 팀 평균 잔여 연차</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}><div style={{ fontSize: 34, fontWeight: 800 }}>11</div><div style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)' }}>/ 15일</div></div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>소진율 27% · 소멸 임박 2명</div>
      </div>
      <div className="glm-chiprow" style={{ display: 'flex', gap: 7, overflowX: 'auto' }}>
        {[['bal', '연차 잔여'], ['req', '신청 내역'], ['exp', '소멸 알림'], ['plan', '계획서']].map(([id, lbl]) => <button key={id} className={'glm-chip' + (ltab === id ? ' on' : '')} onClick={() => setLtab(id)}>{lbl}</button>)}
      </div>
      {ltab === 'bal' && (
        <>
          <div className="msm-sec"><span className="msm-sec-t">직원별 잔여 연차</span></div>
          <div className="msm-list">
            {[{ n: '박철홍', v: '14일', u: 1 }, { n: '김지오', v: '9일', u: 6 }, { n: '박유진', v: '11일', u: 4 }, { n: '송소현', v: '13일', u: 2 }, { n: '이가연', v: '7일', u: 8 }].map((r, i) => (
              <div key={i} className="msm-row" style={{ cursor: 'default' }}>
                <span className="org-pic sm" style={{ background: avTone(r.n) }}>{r.n[0]}</span>
                <div className="main"><div className="nm">{r.n}</div><div className="sub">사용 {r.u}일 / 15일</div></div>
                <div className="meta"><span className="msm-row-val" style={{ fontSize: 14 }}>{r.v}</span></div>
              </div>
            ))}
          </div>
        </>
      )}
      {ltab === 'req' && (
        <>
          <div className="msm-sec"><span className="msm-sec-t">신청 내역</span></div>
          <div className="msm-list">
            {rows.map((r, i) => (
              <div key={i} className="msm-row" style={{ cursor: 'default' }}>
                <span className="lead" style={{ background: 'var(--success-soft)', color: '#047857' }}><Icon name="calendar" size={18} /></span>
                <div className="main"><div className="nm">{r.n} · {r.type}</div><div className="sub" style={{ fontFeatureSettings: '"tnum"' }}>{r.d} · {r.days}</div></div>
                <div className="meta"><span className={'msm-badge ' + r.tone}>{r.state}</span></div>
              </div>
            ))}
          </div>
        </>
      )}
      {ltab === 'exp' && (
        <>
          <div className="msm-row" style={{ cursor: 'default', background: 'var(--warning-soft)', borderColor: '#FDE9C8' }}>
            <span className="lead" style={{ background: '#fff', color: '#B45309' }}><Icon name="alertTri" size={18} /></span>
            <div className="main"><div className="nm" style={{ color: '#B45309' }}>소멸 임박 2명</div><div className="sub">6월 말 소멸 예정 연차</div></div>
          </div>
          <div className="msm-list">
            {[{ n: '이가연', v: '3일', d: '6/30 소멸' }, { n: '조현준', v: '2일', d: '6/30 소멸' }].map((r, i) => (
              <div key={i} className="msm-row" style={{ cursor: 'default' }}>
                <span className="org-pic sm" style={{ background: avTone(r.n) }}>{r.n[0]}</span>
                <div className="main"><div className="nm">{r.n}</div><div className="sub">{r.d}</div></div>
                <div className="meta"><span className="msm-badge warn">{r.v}</span></div>
              </div>
            ))}
          </div>
        </>
      )}
      {ltab === 'plan' && (
        <>
          <div className="msm-sec"><span className="msm-sec-t">상반기 연차 계획서</span><span className="msm-sec-more" style={{ color: 'var(--z-400)' }}>제출 20/27</span></div>
          <div className="msm-list">
            {[{ n: '박유진', s: '7월 2주 가족여행', v: '제출', bt: 'success' }, { n: '송소현', s: '8월 1주', v: '제출', bt: 'success' }, { n: '홍자비', s: '미제출', v: '미제출', bt: 'danger' }].map((r, i) => (
              <div key={i} className="msm-row" style={{ cursor: 'default' }}>
                <span className="org-pic sm" style={{ background: avTone(r.n) }}>{r.n[0]}</span>
                <div className="main"><div className="nm">{r.n}</div><div className="sub">{r.s}</div></div>
                <div className="meta"><span className={'msm-badge ' + r.bt}>{r.v}</span></div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function HrAbnormalBody() {
  const rows = [
    { n: '홍자비', issue: '지각 3회 (이번 달)', detail: '5/2·5/7·5/11 — 면담 권장', tone: 'warn' },
    { n: '이나림', issue: '조기퇴근 2회', detail: '5/6 17:10 · 5/9 17:25', tone: 'warn' },
    { n: '조현준', issue: '연속 야간 4일', detail: '근로기준 점검 필요', tone: 'danger' },
  ];
  return (
    <>
      <div className="msm-row" style={{ cursor: 'default', background: 'var(--warning-soft)', borderColor: '#FDE9C8' }}>
        <span className="lead" style={{ background: '#fff', color: '#B45309' }}><Icon name="alertTri" size={18} /></span>
        <div className="main"><div className="nm" style={{ color: '#B45309' }}>이상 징후 3건 감지</div><div className="sub">지각·조퇴·과다 야간 자동 분석</div></div>
      </div>
      <div className="msm-sec"><span className="msm-sec-t">감지 내역</span></div>
      <div className="msm-list">
        {rows.map((r, i) => (
          <div key={i} className="msm-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>
            <span className="org-pic sm" style={{ background: avTone(r.n) }}>{r.n[0]}</span>
            <div className="main"><div className="nm">{r.n} <span className={'msm-badge ' + r.tone} style={{ fontSize: 10 }}>{r.issue}</span></div><div className="sub" style={{ whiteSpace: 'normal' }}>{r.detail}</div></div>
          </div>
        ))}
      </div>
    </>
  );
}

function HrWelfareBody() {
  return (
    <>
      <div className="msm-sec"><span className="msm-sec-t">복지 세부 메뉴</span></div>
      <StockSimpleBody items={[
        { t: '경조사', s: '박지영 결혼 (5/25)', ic: 'bookmark', tone: 'danger', v: '신청', detail: <MiniRows rows={[
          { b: '결혼', bt: 'danger', t: '박지영', s: '5/25 · 화환+경조금' },
          { b: '조사', bt: 'muted', t: '김민정 부친상', s: '5/8 · 처리 완료' },
        ]} /> },
        { t: '건강검진', s: '대상 12명 · 예약 8명', ic: 'checkCircle', tone: 'success', v: '8/12', detail: <MiniRows rows={[
          { b: '완료', bt: 'success', t: '일반검진', s: '8명 수검' },
          { b: '대기', bt: 'warn', t: '미예약', s: '4명 안내 발송' },
        ]} /> },
        { t: '면허·자격', s: '간호사 면허 갱신 임박 2명', ic: 'star', tone: 'warn', v: '2건', detail: <MiniRows rows={[
          { b: 'D-30', bt: 'warn', t: '간호사 면허', s: '이가연·정해린' },
          { t: '보유 자격', s: '간호사 18·임상병리 3', v: '21건' },
        ]} /> },
        { t: '의료기기 점검', s: 'PSA·제세동기 정기 점검', ic: 'shield', tone: 'accent', v: '예정', detail: <MiniRows rows={[
          { b: '5/30', bt: 'accent', t: '제세동기(AED)', s: '2대 정기 점검' },
          { b: '완료', bt: 'success', t: 'PSA 압박기', s: '4/28 점검' },
        ]} /> },
      ]} />
    </>
  );
}

function HrDocsBody() {
  return (
    <>
      <div className="msm-sec"><span className="msm-sec-t">계약·문서 세부 메뉴</span></div>
      <StockSimpleBody items={[
        { t: '계약 관리', s: '계약 만료 임박 1명', ic: 'fileText', tone: 'warn', v: '1건', detail: <MiniRows rows={[
          { b: '만료임박', bt: 'warn', t: '송소현', s: '계약직 · 6/30' },
          { t: '정규 전환 검토', s: '오민호 (수습 종료)', v: '6/1' },
        ]} /> },
        { t: '계약서 자동생성', s: '템플릿 5종 · 전자서명', ic: 'edit', tone: 'accent', detail: <MiniRows rows={[
          { b: '템플릿', bt: 'accent', t: '정규직 근로계약서', v: '기본' },
          { t: '계약직·NDA·연봉계약', s: '+ 4종', v: '5종' },
        ]} /> },
        { t: '문서보관함', s: '인사 문서 1,284건', ic: 'fileText', tone: 'muted', v: '1,284', detail: <MiniRows rows={[
          { t: '근로계약서', v: '312' }, { t: '인사기록카드', v: '27' }, { t: '증명서 발급 이력', v: '945' },
        ]} /> },
        { t: '증명서 발급', s: '재직·경력·원천징수', ic: 'fileText', tone: 'accent', detail: <MiniRows rows={[
          { b: '즉시', bt: 'success', t: '재직증명서', s: 'PDF' },
          { b: '즉시', bt: 'success', t: '경력증명서', s: 'PDF' },
          { b: '연1회', bt: 'warn', t: '원천징수영수증' },
        ]} /> },
        { t: '서류 제출', s: '미제출 3건', ic: 'alertTri', tone: 'danger', v: '3건', detail: <MiniRows rows={[
          { b: '미제출', bt: 'danger', t: '건강검진 결과', s: '2명' },
          { b: '미제출', bt: 'danger', t: '통장사본', s: '1명' },
        ]} /> },
      ]} />
    </>
  );
}

function HrMemberBody() {
  const [tab, setTab] = React.useState('list');
  return (
    <>
      <div className="glm-chiprow" style={{ display: 'flex', gap: 7, overflowX: 'auto' }}>
        <button className={'glm-chip' + (tab === 'list' ? ' on' : '')} onClick={() => setTab('list')}>구성원 <span className="ccnt">27</span></button>
        <button className={'glm-chip' + (tab === 'move' ? ' on' : '')} onClick={() => setTab('move')}>인사발령 <span className="ccnt">3</span></button>
        <button className={'glm-chip' + (tab === 'edu' ? ' on' : '')} onClick={() => setTab('edu')}>교육·자격 <span className="ccnt">12</span></button>
      </div>
      {tab === 'list' && (
        <div className="msm-list">
          {HR_MEMBERS.map(m => (
            <div key={m.name} className="msm-row" style={{ cursor: 'default' }}>
              <span className="org-pic sm" style={{ background: avTone(m.name) }}>{m.name[0]}</span>
              <div className="main"><div className="nm">{m.name} <span className="msm-badge muted" style={{ fontSize: 10 }}>{m.position}</span></div><div className="sub">{m.dept} · {m.tenure}</div></div>
              <div className="meta"><span className={'msm-badge ' + (m.employ === '수습' ? 'warn' : m.employ === '계약직' ? 'accent' : 'success')}>{m.employ}</span></div>
            </div>
          ))}
        </div>
      )}
      {tab === 'move' && (
        <>
          <div className="msm-sec"><span className="msm-sec-t">인사발령 (5월)</span><button className="msm-sec-more">＋ 새 발령</button></div>
          <div className="msm-list">
          {[
            { b: '부서이동', bt: 'accent', n: '송소현', s: '외래팀 → 병동팀', d: '5/15', st: '예정', stt: 'warn' },
            { b: '승진', bt: 'success', n: '박유진', s: '책임 → 수석', d: '5/10', st: '완료', stt: 'success' },
            { b: '직무변경', bt: 'muted', n: '홍자비', s: '원무 → 경영지원', d: '5/3', st: '완료', stt: 'success' },
          ].map((r, i) => (
            <div key={i} className="msm-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>
              <span className="org-pic sm" style={{ background: avTone(r.n) }}>{r.n[0]}</span>
              <div className="main"><div className="nm">{r.n} <span className={'msm-badge ' + r.bt} style={{ fontSize: 10 }}>{r.b}</span></div><div className="sub">{r.s} · 발령일 {r.d}</div></div>
              <div className="meta"><span className={'msm-badge ' + r.stt}>{r.st}</span></div>
            </div>
          ))}
          </div>
        </>
      )}
      {tab === 'edu' && (
        <>
          <div className="mm-kpis">
            <div className="mm-kpi"><span className="ic" style={{ background: 'var(--success-soft)', color: '#047857' }}><Icon name="checkCircle" size={16} /></span><div className="info"><div className="lbl">교육 이수</div><div className="sub">이번 분기</div></div><div className="v">8<small>건</small></div></div>
            <div className="mm-kpi"><span className="ic" style={{ background: 'var(--warning-soft)', color: '#B45309' }}><Icon name="alertTri" size={16} /></span><div className="info"><div className="lbl">자격 갱신 임박</div><div className="sub">D-30 이내</div></div><div className="v" style={{ color: '#B45309' }}>2<small>명</small></div></div>
          </div>
          <div className="msm-sec"><span className="msm-sec-t">법정·직무 교육</span><button className="msm-sec-more">＋ 교육 등록</button></div>
          <div className="msm-list">
          {[
            { b: '이수', bt: 'success', t: '감염관리 교육', s: '간호부 18명 이수', v: '완료' },
            { b: '진행', bt: 'accent', t: '의료법규 정기교육', s: '전직원 · 22/27명', v: '81%' },
            { b: '예정', bt: 'warn', t: 'CPR 재인증', s: '수술팀 4명', v: '5/28' },
          ].map((r, i) => (
            <div key={i} className="msm-row" style={{ cursor: 'default' }}>
              <span className="lead" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="star" size={17} /></span>
              <div className="main"><div className="nm">{r.t} <span className={'msm-badge ' + r.bt} style={{ fontSize: 10 }}>{r.b}</span></div><div className="sub">{r.s}</div></div>
              <div className="meta"><span className="time">{r.v}</span></div>
            </div>
          ))}
          </div>
          <div className="msm-sec"><span className="msm-sec-t">면허·자격 관리</span></div>
          <div className="msm-list">
          {[
            { b: '갱신임박', bt: 'warn', t: '간호사 면허', s: '이가연·정해린', v: 'D-30' },
            { b: '유효', bt: 'success', t: '간호사 면허', s: '16명', v: '정상' },
            { b: '유효', bt: 'muted', t: '임상병리사', s: '검사팀 3명', v: '정상' },
          ].map((r, i) => (
            <div key={i} className="msm-row" style={{ cursor: 'default' }}>
              <span className="lead" style={{ background: 'var(--z-100)', color: 'var(--z-600)' }}><Icon name="shield" size={17} /></span>
              <div className="main"><div className="nm">{r.t} <span className={'msm-badge ' + r.bt} style={{ fontSize: 10 }}>{r.b}</span></div><div className="sub">{r.s}</div></div>
              <div className="meta"><span className="time">{r.v}</span></div>
            </div>
          ))}
          </div>
        </>
      )}
    </>
  );
}

function HrScreen({ topInset, bottomInset }) {
  const nav = useLeafStack();
  const [company, setCompany] = React.useState('박철홍정형외과');
  return (
    <>
      <MsmAppbar topInset={topInset} eyebrow="운영" title="인사관리" actions={<button className="msm-ibtn"><Icon name="search" size={19} /></button>} />
      <div className="msm-scroll"><div className="msm-body">
        <HrHubBody company={company} setCompany={setCompany} />
        <LeafHub tree={window.HR_TREE} onOpen={nav.open} />
        <div style={{ height: bottomInset + 8 }} />
      </div></div>
      <MsmSubScreen open={!!nav.top} title={nav.top ? nav.top.title : ''} backLabel={nav.stack.length > 1 ? '뒤로' : '인사관리'} topInset={topInset} bottomInset={bottomInset} scrollKey={nav.stack.length} onClose={nav.back}>
        {nav.top ? <LeafView id={nav.top.id} params={nav.top.params} onOpen={nav.open} /> : null}
      </MsmSubScreen>
    </>
  );
}
// ── 재고관리 — 4개 통합 워크센터 허브 ──
const STOCK_MENUS = [
  { id: 'status', label: '재고 현황', icon: 'package', tone: 'accent', sub: '현황 · 내 부서 · 알림 · 유효기간', badge: '부족 23', bt: 'warn' },
  { id: 'io', label: '입출고·발주', icon: 'arrowDown', tone: 'success', sub: '입출고 · 발주 · 거래처 · 명세서', badge: '발주 3', bt: 'warn' },
  { id: 'item', label: '물품·자산', icon: 'plusBox', tone: 'accent', sub: '물품등록 · 카테고리 · 자산 QR · UDI' },
  { id: 'analyze', label: '분석·마감', icon: 'bar', tone: 'muted', sub: 'ABC 분석 · 수요예측 · 실사 · 월마감' },
];
const STOCK_IO_MOVES = [
  { time: '14:23', kind: '입고', item: '라텍스 장갑 (S)', qty: '24 BOX', who: '백민', tone: 'success' },
  { time: '13:48', kind: '출고', item: '주사 바늘 23G', qty: '8 BOX', who: '이나림', tone: 'accent' },
  { time: '11:12', kind: '이관', item: '알코올 솔션 500ml', qty: '4 병', who: '김지오', tone: 'muted' },
  { time: '10:35', kind: '출고', item: '멸그루브 18cm', qty: '12 EA', who: '이나림', tone: 'accent' },
  { time: '09:18', kind: '반품', item: '주사기 1ml (불량)', qty: '3 BOX', who: '박유진', tone: 'danger' },
];
function StockIOBody() {
  return (
    <>
      <div className="mm-kpis">
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="arrowDown" size={16} /></span><div className="info"><div className="lbl">오늘 입출고</div><div className="sub">입12·출14·반2</div></div><div className="v">28<small>건</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--warning-soft)', color: '#B45309' }}><Icon name="clock" size={16} /></span><div className="info"><div className="lbl">발주 대기</div><div className="sub">결재 후 발송</div></div><div className="v">3<small>건</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="send" size={16} /></span><div className="info"><div className="lbl">배송 중</div><div className="sub">금주 도착</div></div><div className="v">5<small>건</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--success-soft)', color: '#047857' }}><Icon name="won" size={16} /></span><div className="info"><div className="lbl">이번 달 발주액</div><div className="sub">전월 -2.1%</div></div><div className="v">28.4<small>M</small></div></div>
      </div>
      <div className="glm-chiprow" style={{ display: 'flex', gap: 7, overflowX: 'auto' }}>
        {['입출고 기록', '발주 관리', '거래처·명세서'].map((t, i) => <button key={t} className={'glm-chip' + (i === 0 ? ' on' : '')}>{t}</button>)}
      </div>
      <div className="msm-sec"><span className="msm-sec-t">오늘 입출고</span><span className="msm-sec-more">＋ 수동 등록</span></div>
      <div className="msm-list">
        {STOCK_IO_MOVES.map((m, i) => (
          <div key={i} className="msm-row" style={{ cursor: 'default' }}>
            <span className={'msm-badge ' + m.tone} style={{ minWidth: 36, textAlign: 'center' }}>{m.kind}</span>
            <div className="main"><div className="nm">{m.item}</div><div className="sub">{m.qty} · {m.who} · {m.time}</div></div>
          </div>
        ))}
      </div>
    </>
  );
}
function StockSimpleBody({ items }) {
  const [open, setOpen] = React.useState(null);
  return (
    <div className="msm-list">
      {items.map((it, i) => {
        const t = typeof it === 'string' ? { t: it } : it;
        const tn = msmTone(t.tone || 'muted');
        const isOpen = open === i;
        return (
          <div key={i} className="msm-rowcard" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 13, overflow: 'hidden' }}>
            <button className="msm-row" style={{ border: 'none', borderRadius: 0, width: '100%' }} onClick={() => t.detail ? setOpen(isOpen ? null : i) : null}>
              <span className="lead" style={{ background: tn.bg, color: tn.fg }}><Icon name={t.ic || 'plusBox'} size={18} /></span>
              <div className="main"><div className="nm">{t.t}</div>{t.s && <div className="sub">{t.s}</div>}</div>
              <div className="meta">{t.v && <span className="msm-row-val" style={{ fontSize: 13, fontWeight: 800 }}>{t.v}</span>}<span style={{ transition: 'transform .2s', transform: isOpen ? 'rotate(90deg)' : 'none', display: 'inline-flex' }}><Icon name="chevR" size={16} color="var(--z-300)" /></span></div>
            </button>
            {isOpen && t.detail && <div style={{ borderTop: '1px solid var(--z-100)', padding: '12px 14px', background: 'var(--z-50)' }}>{t.detail}</div>}
          </div>
        );
      })}
    </div>
  );
}
// 미니 상세 헬퍼
function MiniRows({ rows }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          {r.b && <span className={'msm-badge ' + (r.bt || 'muted')} style={{ fontSize: 10 }}>{r.b}</span>}
          <span style={{ fontWeight: 700, color: 'var(--z-800)' }}>{r.t}</span>
          {r.s && <span style={{ color: 'var(--z-500)', fontWeight: 600 }}>{r.s}</span>}
          {r.v && <span style={{ marginLeft: 'auto', fontWeight: 800, color: 'var(--z-700)', fontFeatureSettings: '"tnum"' }}>{r.v}</span>}
        </div>
      ))}
    </div>
  );
}
function StockScreen({ topInset, bottomInset }) {
  const nav = useLeafStack();
  return (
    <>
      <MsmAppbar topInset={topInset} eyebrow="운영" title="재고관리" actions={<button className="msm-ibtn accent" style={{ background: 'var(--accent)', color: '#fff' }}><Icon name="plus" size={19} /></button>} />
      <div className="msm-scroll"><div className="msm-body">
        <div className="mm-kpis">
          <div className="mm-kpi"><span className="ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="package" size={16} /></span><div className="info"><div className="lbl">전체 품목</div><div className="sub">소모품 412</div></div><div className="v">847<small>종</small></div></div>
          <div className="mm-kpi"><span className="ic" style={{ background: 'var(--warning-soft)', color: '#B45309' }}><Icon name="alertTri" size={16} /></span><div className="info"><div className="lbl">부족 품목</div><div className="sub">발주 권장 12</div></div><div className="v" style={{ color: '#B45309' }}>23<small>건</small></div></div>
          <div className="mm-kpi"><span className="ic" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Icon name="alertTri" size={16} /></span><div className="info"><div className="lbl">재고 0</div><div className="sub">긴급 보충</div></div><div className="v" style={{ color: 'var(--danger)' }}>4<small>건</small></div></div>
          <div className="mm-kpi"><span className="ic" style={{ background: 'var(--warning-soft)', color: '#B45309' }}><Icon name="clock" size={16} /></span><div className="info"><div className="lbl">유효기간 임박</div><div className="sub">30일 이내</div></div><div className="v">8<small>건</small></div></div>
        </div>
        <LeafHub tree={window.STOCK_TREE} onOpen={nav.open} />
        <div style={{ height: bottomInset + 8 }} />
      </div></div>
      <MsmSubScreen open={!!nav.top} title={nav.top ? nav.top.title : ''} backLabel={nav.stack.length > 1 ? '뒤로' : '재고관리'} topInset={topInset} bottomInset={bottomInset} scrollKey={nav.stack.length} onClose={nav.back}>
        {nav.top ? <LeafView id={nav.top.id} params={nav.top.params} onOpen={nav.open} /> : null}
      </MsmSubScreen>
    </>
  );
}
// ── 관리자 — 6개 통합 워크센터 허브 ──
const ADMIN_MENUS = [
  { id: 'exec', label: '경영 대시보드', icon: 'bar', tone: 'accent', sub: '매출·손익·예산·법인 손익' },
  { id: 'master', label: '시스템 마스터', icon: 'shield', tone: 'danger', sub: '변경이력·권한변경·정합성·복구', badge: '병원장 전용', bt: 'danger' },
  { id: 'company', label: '회사 관리', icon: 'hr', tone: 'accent', sub: '기본정보·근무형태·법인카드·급여기준' },
  { id: 'roles', label: '권한 관리', icon: 'shield', tone: 'warn', sub: '역할 6종 · 모듈별 권한 매트릭스', badge: '요청 2', bt: 'warn' },
  { id: 'ops', label: '운영 설정', icon: 'plusBox', tone: 'muted', sub: '운영 설정·템플릿·팝업 관리' },
  { id: 'audit', label: '감사·백업', icon: 'alertTri', tone: 'muted', sub: '감사센터·백업·복원·이상치 검사' },
];
const ADMIN_ROLES = ['병원장', '관리자', '부장', '직원', '시급직', '수습'];
function AdminRolesBody() {
  return (
    <>
      <div className="mm-kpis">
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent-700)' }}><Icon name="shield" size={16} /></span><div className="info"><div className="lbl">정의된 역할</div><div className="sub">병원장·관리자 외</div></div><div className="v">6<small>종</small></div></div>
        <div className="mm-kpi"><span className="ic" style={{ background: 'var(--warning-soft)', color: '#B45309' }}><Icon name="clock" size={16} /></span><div className="info"><div className="lbl">권한 요청 대기</div><div className="sub">결재 진행 중</div></div><div className="v" style={{ color: '#B45309' }}>2<small>건</small></div></div>
      </div>
      <div className="msm-sec"><span className="msm-sec-t">역할</span></div>
      <div className="msm-list">
        {ADMIN_ROLES.map((r, i) => (
          <div key={r} className="msm-row" style={{ cursor: 'default' }}>
            <span className="lead" style={{ background: i < 2 ? 'var(--danger-soft)' : 'var(--z-100)', color: i < 2 ? 'var(--danger)' : 'var(--z-600)' }}><Icon name="shield" size={17} /></span>
            <div className="main"><div className="nm">{r}</div><div className="sub">{i === 0 ? '전체 권한' : i === 1 ? '관리 권한' : '제한 권한'}</div></div>
            <Icon name="chevR" size={16} color="var(--z-300)" />
          </div>
        ))}
      </div>
    </>
  );
}
function AdminScreen({ topInset, bottomInset }) {
  const nav = useLeafStack();
  return (
    <>
      <MsmAppbar topInset={topInset} eyebrow="운영" title="관리자" actions={<button className="msm-ibtn"><Icon name="bell" size={19} /></button>} />
      <div className="msm-scroll"><div className="msm-body">
        <div className="msm-hero" style={{ background: 'linear-gradient(135deg,#0B0B0E,#1A1A21)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>2026년 5월 · 박철홍정형외과 통합</div>
          <div style={{ marginTop: 8, position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>5월 누적 매출</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>182,420,000<span style={{ fontSize: 14 }}>원</span></div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#34D399', marginTop: 2 }}>전월 동기 +4.2% · 목표 달성률 38%</div>
          </div>
        </div>
        <LeafHub tree={window.ADMIN_TREE} onOpen={nav.open} />
        <div style={{ height: bottomInset + 8 }} />
      </div></div>
      <MsmSubScreen open={!!nav.top} title={nav.top ? nav.top.title : ''} backLabel={nav.stack.length > 1 ? '뒤로' : '관리자'} topInset={topInset} bottomInset={bottomInset} scrollKey={nav.stack.length} onClose={nav.back}>
        {nav.top ? <LeafView id={nav.top.id} params={nav.top.params} onOpen={nav.open} /> : null}
      </MsmSubScreen>
    </>
  );
}

// 게시판 홈 — 게시판 종류 목록 (업무공유 진입)
function BoardHomeScreen({ topInset, bottomInset, onOpenShare }) {
  const D = window.MSM;
  return (
    <>
      <MsmAppbar topInset={topInset} eyebrow="협업" title="게시판" actions={<button className="msm-ibtn"><Icon name="search" size={19} /></button>} />
      <div className="msm-scroll">
        <div className="msm-body">
          <div className="msm-list">
            {D.boards.map(b => {
              const t = msmTone(b.tone);
              return (
                <button key={b.id} className="msm-row" onClick={() => b.id === 'share' && onOpenShare && onOpenShare()}>
                  <span className="lead" style={{ background: t.bg, color: t.fg }}><Icon name={b.icon} size={19} /></span>
                  <div className="main">
                    <div className="nm">{b.name}</div>
                    <div className="sub">{b.sub}</div>
                  </div>
                  <div className="meta">{b.n > 0 && <span className="msm-unread">{b.n}</span>}<Icon name="chevR" size={16} color="var(--z-300)" /></div>
                </button>
              );
            })}
          </div>
          <div style={{ height: bottomInset + 8 }} />
        </div>
      </div>
    </>
  );
}

// 풀스크린 서브 화면 (인사/재고/관리자)
function MsmSubScreen({ open, title, topInset, bottomInset, onClose, backLabel = '전체', scrollKey, children }) {
  const scRef = React.useRef(null);
  React.useEffect(() => { if (scRef.current) scRef.current.scrollTop = 0; }, [scrollKey, open]);
  return (
    <div className={'glm-screen' + (open ? ' open' : '')}>
      <div className="glm-screen-head" style={{ paddingTop: topInset + 8 }}>
        <button className="glm-back" onClick={onClose}><Icon name="chevL" size={20} /> {backLabel}</button>
        <div className="glm-screen-title">{title}</div>
        <div className="glm-screen-action" />
      </div>
      <div className="msm-scroll" ref={scRef}>
        <div className="msm-body">{children}<div style={{ height: bottomInset + 8 }} /></div>
      </div>
    </div>
  );
}

function PayrollBody() {
  const p = window.MSM.payroll;
  return (
    <>
      <div className="msm-hero" style={{ background: 'linear-gradient(135deg,#0B0B0E,#1A1A21)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>이번 달 정산 · {p.month}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>정산 중 <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{p.stage}</span></div>
        </div>
        <div style={{ marginTop: 14, position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>총 지급 예정</div>
          <div style={{ fontSize: 26, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>{p.total}<span style={{ fontSize: 14 }}>원</span></div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#34D399', marginTop: 2 }}>{p.headcount}명 · 전월 대비 {p.delta}</div>
        </div>
      </div>
      {/* 단계 */}
      <div style={{ display: 'flex', gap: 6 }}>
        {p.steps.map((s, i) => (
          <div key={i} style={{ flex: 1, padding: '10px 4px', borderRadius: 10, textAlign: 'center', background: s.cur ? '#7C5B12' : s.done ? '#10241F' : 'var(--z-100)', color: s.cur || s.done ? '#fff' : 'var(--z-400)' }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{s.done ? '✓' : s.cur ? (i + 1) : (i + 1)}</div>
            <div style={{ fontSize: 9.5, fontWeight: 700, marginTop: 3, lineHeight: 1.2 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div className="msm-stat2">
        {p.stats.map((s, i) => (
          <div key={i} className="msm-statcard"><div className="v">{s.v}</div><div className="l">{s.l}</div></div>
        ))}
      </div>
      <div className="msm-sec"><span className="msm-sec-t">세부 메뉴</span><span className="msm-sec-more" style={{ color: 'var(--z-400)' }}>13</span></div>
      <StockSimpleBody items={[
        { t: '급여 정산', s: '월별 정산 워크플로', ic: 'won', tone: 'warn', v: '진행 중', detail: <MiniRows rows={[{ b: '3/4단계', bt: 'warn', t: '지급 처리 대기', s: '근태마감·수당·상신 완료' }, { t: '총 지급 예정', v: '128.4M원' }, { t: '대상자', v: '27명' }]} /> },
        { t: '급여 대장', s: '월별 직원별 내역', ic: 'fileText', tone: 'muted', detail: <MiniRows rows={[{ t: '2026.5 대장', s: '확정 전', v: '미확정' }, { t: '2026.4 대장', s: '확정', v: '열람' }, { t: '평균 실수령', v: '3.44M' }]} /> },
        { t: '급여 시뮬레이터', s: '예상 지급액 미리보기', ic: 'bar', tone: 'accent', detail: <MiniRows rows={[{ t: '기본급 입력', v: '3.2M' }, { b: '예상', bt: 'accent', t: '실수령액', v: '3.44M' }, { t: '4대보험+세', v: '-0.49M' }]} /> },
        { t: '퇴직 정산', s: '정산서·중간정산', ic: 'won', tone: 'muted', detail: <MiniRows rows={[{ t: '퇴직 예정', s: '없음', v: '0명' }, { t: '중간정산 신청', v: '0건' }]} /> },
        { t: '퇴직연금', s: 'DC/DB 가입자 현황', ic: 'won', tone: 'muted', detail: <MiniRows rows={[{ b: 'DC', bt: 'accent', t: '확정기여형', v: '19명' }, { b: 'DB', bt: 'muted', t: '확정급여형', v: '8명' }]} /> },
        { t: '4대보험', s: 'EDI 신고·증명서', ic: 'shield', tone: 'warn', v: '5/22', detail: <MiniRows rows={[{ b: '예정', bt: 'warn', t: 'EDI 신고', v: '5/22' }, { t: '입사 반영', v: '1명' }, { t: '퇴사 반영', v: '0명' }]} /> },
        { t: '원천징수', s: '파일 생성·연말정산', ic: 'fileText', tone: 'warn', v: '5/20', detail: <MiniRows rows={[{ b: '예정', bt: 'warn', t: '원천세 신고', v: '5/20' }, { t: '대상 인원', v: '27명' }]} /> },
        { t: '임금피크제', s: '적용 대상·비율', ic: 'users', tone: 'muted', v: '1명', detail: <MiniRows rows={[{ t: '대상자', s: '박철홍', v: '1명' }, { t: '적용 비율', v: '90%' }]} /> },
        { t: '최저임금 점검', s: '2026 시급 검증', ic: 'alertTri', tone: 'danger', v: '2건', detail: <MiniRows rows={[{ b: '미달', bt: 'danger', t: '시급직 2명', s: '환산 시급 검토 필요' }, { t: '2026 최저', v: '10,320원' }]} /> },
        { t: '비과세 점검', s: '식대·교통비 한도', ic: 'checkCircle', tone: 'muted', detail: <MiniRows rows={[{ b: '정상', bt: 'success', t: '식대', s: '한도 20만 이내' }, { t: '자가운전 보조', v: '한도 내' }]} /> },
        { t: '통상임금 계산기', s: '평균임금·연차수당', ic: 'bar', tone: 'muted', detail: <MiniRows rows={[{ t: '시간당 통상임금', v: '19,762원' }, { t: '연차수당 1일', v: '158,088원' }]} /> },
        { t: '미지급 수당 점검', s: '야간·휴일·연장', ic: 'alertTri', tone: 'danger', v: '1건', detail: <MiniRows rows={[{ b: '미지급', bt: 'danger', t: '야간수당', s: '병동팀 1건 누락' }, { t: '예상 지급액', v: '+98,810' }]} /> },
        { t: '무급결근 차감', s: '자동 차감 규칙', ic: 'won', tone: 'muted', detail: <MiniRows rows={[{ t: '이번 달 차감', s: '무단결근 0', v: '0원' }, { t: '차감 규칙', s: '일할 계산' }]} /> },
      ]} />
    </>
  );
}

function StockBody() {
  const D = window.MSM;
  return (
    <>
      <div className="msm-stat2">
        {D.stockStats.map((s, i) => {
          const t = msmTone(s.tone);
          return <div key={i} className="msm-statcard"><div className="v" style={{ color: t.fg }}>{s.v}</div><div className="l">{s.l}</div></div>;
        })}
      </div>
      <div className="msm-sec"><span className="msm-sec-t">품목 현황</span></div>
      <div className="msm-list">
        {D.stockItems.map((it, i) => (
          <div key={i} className="msm-row">
            <span className="lead" style={{ background: 'var(--z-100)', color: 'var(--z-600)' }}><Icon name="package" size={18} /></span>
            <div className="main"><div className="nm">{it.nm}</div><div className="sub">{it.cat}</div></div>
            <div className="meta"><span className="msm-badge muted" style={{ fontFeatureSettings: '"tnum"' }}>{it.qty}</span><span className={'msm-badge ' + it.tone}>{it.state}</span></div>
          </div>
        ))}
      </div>
      <div className="msm-sec"><span className="msm-sec-t">세부 메뉴</span></div>
      <StockSimpleBody items={[
        { t: '재고 현황', s: '전체 품목 현황', ic: 'package', tone: 'accent' },
        { t: '내 부서 재고', s: '소속 부서 86종', ic: 'package', tone: 'muted', v: '86종' },
        { t: '재고 알림', s: '부족·과다 알림', ic: 'alertTri', tone: 'warn', v: '23건' },
        { t: '유효기간 알림', s: '30일 이내 만료', ic: 'clock', tone: 'warn', v: '8건' },
      ]} />
    </>
  );
}

function AdminBody() {
  const D = window.MSM;
  return (
    <>
      <div className="msm-hero" style={{ background: 'linear-gradient(135deg,#0B0B0E,#1A1A21)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>2026년 5월 · 박철홍정형외과 통합</div>
        <div style={{ marginTop: 8, position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>5월 누적 매출</div>
          <div style={{ fontSize: 26, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>182,420,000<span style={{ fontSize: 14 }}>원</span></div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#34D399', marginTop: 2 }}>전월 동기 +4.2% · 목표 달성률 38%</div>
        </div>
      </div>
      <div className="msm-stat2">
        {D.adminKpi.map((k, i) => {
          const t = msmTone(k.tone);
          return <div key={i} className="msm-statcard"><div className="v" style={{ color: t.fg }}>{k.v}</div><div className="l">{k.l}</div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--z-400)' }}>{k.sub}</div></div>;
        })}
      </div>
      <div className="msm-sec"><span className="msm-sec-t">세부 메뉴</span></div>
      <StockSimpleBody items={[
        { t: '경영 대시보드', s: '매출·이익 종합', ic: 'bar', tone: 'accent' },
        { t: '재무 대시보드', s: '현금흐름·잔고', ic: 'won', tone: 'success' },
        { t: '예산 관리', s: '집행률 42%', ic: 'bar', tone: 'warn', v: '42%' },
        { t: '통합 보고서', s: '월간 경영 리포트', ic: 'fileText', tone: 'muted' },
        { t: '법인 손익', s: '4법인 손익 비교', ic: 'won', tone: 'accent', v: '4법인' },
        { t: '경영 분석', s: '추세·예측 분석', ic: 'bar', tone: 'muted' },
      ]} />
    </>
  );
}

Object.assign(window, { AddonScreen, BoardHomeScreen, MsmSubScreen, PayrollBody, StockBody, AdminBody, HrScreen, StockScreen, AdminScreen });

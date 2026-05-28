// MSO redesign — 내정보 (MyPage) — home / attend / todo / docs / alert 탭

// ------------ 탭 콘텐츠: 내정보(home) ------------
const TabHome = () => {
  const kpis = [
    { icon: 'clock',    iconTone: '',         label: '이번 달 근태',    sub: '지각 3회',          value: <>1<span className="kpi-frac">/4</span></> },
    { icon: 'calendar', iconTone: 'success',  label: '연차휴가',       sub: '사용 내역 확인',     value: <>11<span className="kpi-unit2">일</span></> },
    { icon: 'won',      iconTone: '',         label: '급여명세서',     sub: '월별 명세서 확인',   value: null },
    { icon: 'fileText', iconTone: '',         label: '증명서',         sub: '발급 문서 확인',     value: null },
    { icon: 'alertTri', iconTone: 'warn',     label: '미결재',         sub: '결재 대기중',        value: <>0<span className="kpi-unit2">건</span></> },
  ];
  return (
    <>
      <div className="card">
        <div className="profile">
          <div className="pfp" style={{
            background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)',
            color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em'
          }}>백</div>
          <div style={{flex: 1}}>
            <div style={{display:'flex', alignItems:'baseline', gap: 10}}>
              <div className="pname">백정민</div>
              <span className="small">이사 · 경영지원팀</span>
            </div>
            <div className="pchips">
              <Chip tone="success">재직중</Chip>
              <Chip>정규직</Chip>
              <Chip tone="muted">입사 3년차</Chip>
            </div>
          </div>
          <div style={{textAlign: 'right'}}>
            <div className="small">사번</div>
            <div className="strong" style={{fontSize: 16}}>2</div>
            <div className="small" style={{marginTop: 6}}>입사일</div>
            <div className="strong" style={{fontSize: 13, fontFeatureSettings: '"tnum"'}}>2023.08.01</div>
          </div>
        </div>
      </div>

      <div className="kpi-simple-row">
        {kpis.map((k, i) => (
          <div key={i} className={'kpi-simple' + (k.value ? '' : ' nav')} role="button" tabIndex={0}>
            <div className={'kpi-ico ' + (k.iconTone || '')}><Icon name={k.icon} size={16}/></div>
            <div className="kpi-info">
              <div className="kpi-lbl">{k.label}</div>
              <div className="kpi-sub">{k.sub}</div>
            </div>
            <div className="kpi-right">
              {k.value
                ? <div className="kpi-simple-val">{k.value}</div>
                : <Icon name="chevR" size={18} color="var(--z-400)"/>
              }
            </div>
          </div>
        ))}
      </div>

      {/* 페이지 하단 액션 — 원본 위치 그대로 */}
      <div className="home-foot">
        <Btn icon="out">로그아웃</Btn>
        <Btn variant="primary" icon="edit">정보 수정</Btn>
      </div>
    </>
  );
};

// ------------ 탭 콘텐츠: 출퇴근(attend) ------------
const TabAttend = () => {
  const [view, setView] = React.useState('list');
  const days = [
    { d: 1, h: 8.2, s: 'normal' }, { d: 2, h: 7.8, s: 'normal' },
    { d: 3, h: 0,   s: 'off' },    { d: 4, h: 0,   s: 'off' },
    { d: 5, h: 8.1, s: 'normal' }, { d: 6, h: 7.5, s: 'late' },
    { d: 7, h: 8.0, s: 'normal' }, { d: 8, h: 0,   s: 'missing' },
    { d: 9, h: 0,   s: 'absent' }, { d: 10,h: 3.3, s: 'early' },
  ];
  const maxH = 10;
  const history = [
    { mo: 5, day: 10, dow: '일요일', tone: 'warn',    status: '조퇴',   inT: '오후 12:23', outT: '오후 03:40' },
    { mo: 5, day: 9,  dow: '토요일', tone: 'danger',  status: '결근',   inT: '오후 12:14', outT: '-' },
    { mo: 5, day: 8,  dow: '금요일', tone: 'muted',   status: '미기록', inT: '-',          outT: '-' },
    { mo: 5, day: 7,  dow: '목요일', tone: 'success', status: '정상',   inT: '오전 08:54', outT: '오후 06:12' },
    { mo: 5, day: 6,  dow: '수요일', tone: 'warn',    status: '지각',   inT: '오전 09:21', outT: '오후 06:08' },
    { mo: 5, day: 5,  dow: '화요일', tone: 'success', status: '정상',   inT: '오전 08:48', outT: '오후 06:04' },
  ];
  const colorMap = {normal:'var(--accent)', late:'var(--warning)', missing:'var(--z-300)', absent:'var(--danger)', early:'var(--warning)', off:'transparent'};

  return (
    <>
      {/* 출근 hero */}
      <div className="att-hero">
        <div className="att-hero-left">
          <div className="att-date">2026년 5월 11일 (월요일)</div>
          <div className="att-time">
            <span className="ampm">오후</span>
            <span className="hms">4:14<span className="sec">:58</span></span>
          </div>
          <div className="att-status">
            <span className="status-dot"/>
            <span className="status-label">출근 전</span>
            <span className="status-sep">·</span>
            <span className="status-loc">병원 거리 <b>38m</b></span>
            <span className="status-ok"><Icon name="check" size={11}/> GPS 인증됨</span>
          </div>
        </div>
        <div className="att-hero-right">
          <button className="att-cta">
            <Icon name="clock" size={18}/>
            <span>출근하기</span>
          </button>
          <div className="att-cta-sub">탭하면 즉시 기록됩니다</div>
        </div>
      </div>

      {/* 3 KPI */}
      <div className="att-stat-row">
        <div className="kpi-simple">
          <div className="kpi-ico"><Icon name="calendar" size={16}/></div>
          <div className="kpi-info">
            <div className="kpi-lbl">이번 달 근무</div>
            <div className="kpi-sub">총 근무일</div>
          </div>
          <div className="kpi-right"><div className="kpi-simple-val">1<span className="kpi-unit2">일</span></div></div>
        </div>
        <div className="kpi-simple">
          <div className="kpi-ico warn"><Icon name="clock" size={16}/></div>
          <div className="kpi-info">
            <div className="kpi-lbl">지각</div>
            <div className="kpi-sub">이번 달 누계</div>
          </div>
          <div className="kpi-right"><div className="kpi-simple-val">0<span className="kpi-unit2">회</span></div></div>
        </div>
        <div className="kpi-simple">
          <div className="kpi-ico success"><Icon name="checkCircle" size={16}/></div>
          <div className="kpi-info">
            <div className="kpi-lbl">정상 출근</div>
            <div className="kpi-sub">이번 달 누계</div>
          </div>
          <div className="kpi-right"><div className="kpi-simple-val">0<span className="kpi-unit2">회</span></div></div>
        </div>
      </div>

      {/* 차트 */}
      <div className="card">
        <div className="card-row">
          <div>
            <div className="ctitle">이번 달 근무시간</div>
            <div className="small" style={{marginTop: 2}}>일별 근무 기록 · 2026년 5월</div>
          </div>
          <div className="row" style={{gap: 16}}>
            <div className="row" style={{gap: 16, fontSize: 11, color: 'var(--z-500)', fontWeight: 700}}>
              <span>총 <b style={{color:'var(--z-900)', fontSize:14}}>32h</b></span>
              <span>평균 <b style={{color:'var(--z-900)', fontSize:14}}>3.3h</b></span>
            </div>
            <div className="att-legend">
              <span><i className="ld-dot" style={{background:'var(--accent)'}}/>정상</span>
              <span><i className="ld-dot" style={{background:'var(--warning)'}}/>지각</span>
              <span><i className="ld-dot" style={{background:'var(--z-300)'}}/>미기록</span>
              <span><i className="ld-dot" style={{background:'var(--danger)'}}/>결근</span>
            </div>
          </div>
        </div>
        <div className="att-chart">
          {days.map(({d, h, s}) => {
            const heightPct = Math.max((h / maxH) * 100, h > 0 ? 6 : 0);
            return (
              <div className="att-bar" key={d}>
                <div className="att-bar-track">
                  {h > 0 && <div className="att-bar-val">{h}h</div>}
                  <div className="att-bar-fill" style={{height: heightPct + '%', background: colorMap[s]}}/>
                </div>
                <div className="att-bar-day">{d}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 히스토리 */}
      <div className="card">
        <div className="card-row">
          <div className="ctitle">근무 히스토리</div>
          <div className="row" style={{gap: 8}}>
            <div className="seg" style={{padding: 2}}>
              <button className={view==='list' ? 'on' : ''} onClick={() => setView('list')} style={{padding: '4px 12px', fontSize: 11}}>목록</button>
              <button className={view==='calendar' ? 'on' : ''} onClick={() => setView('calendar')} style={{padding: '4px 12px', fontSize: 11}}>달력</button>
            </div>
            <div className="att-month">
              <button className="att-mo-btn">‹</button>
              <span className="att-mo-lbl">2026. 5</span>
              <button className="att-mo-btn">›</button>
            </div>
          </div>
        </div>
        <div className="att-history">
          {history.map((h, i) => (
            <div className="att-row" key={i}>
              <div className={'att-date-badge tone-' + h.tone}>
                <div className="dm">{h.mo}월</div>
                <div className="dd">{h.day}일</div>
              </div>
              <div className="att-row-mid">
                <div className="att-row-dow">{h.dow}</div>
                <div className={'att-row-status tone-' + h.tone}>{h.status}</div>
              </div>
              <div className="att-row-times">
                <div className="t-block">
                  <div className="t-lbl">출근</div>
                  <div className="t-val">{h.inT}</div>
                </div>
                <div className="t-block">
                  <div className="t-lbl">퇴근</div>
                  <div className="t-val">{h.outT}</div>
                </div>
              </div>
              <Btn size="sm">정정 요청</Btn>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

const TabPlaceholder = ({ label }) => (
  <div style={{
    padding: 60, textAlign:'center', background:'#FFF', border:'1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', color: 'var(--z-500)'
  }}>
    <div style={{fontSize: 16, fontWeight: 800, color:'var(--z-900)'}}>{label} 화면</div>
    <div style={{marginTop: 6, fontSize: 12}}>준비중 — 이 탭을 다음 차례에 디자인합니다.</div>
  </div>
);

// ------------ 탭 콘텐츠: 할일(todo) ------------
const TabTodo = () => {
  const [pri, setPri] = React.useState('all');
  const [range, setRange] = React.useState('day');
  const items = [
    { p: 'urgent',  title: '5월 급여 검토 — 박철홍정형외과 27명', due: '오늘 18:00', tag: '인사관리 · 급여대장', repeat: '반복 없음' },
    { p: 'high',    title: '의료기기 점검 결재 회신', due: '내일 17:00',  tag: '전자결재 · 기안함', repeat: '반복 없음' },
    { p: 'normal',  title: '3교대 마법사 — 6월 근무표 초안 작성', due: '2026-05-22', tag: '인사관리 · 근무표', repeat: '주 1회' },
    { p: 'normal',  title: '회사 행사 일정 공유 — 전사 메일', due: '2026-05-15', tag: '게시판 · 공지사항', repeat: '반복 없음' },
    { p: 'low',     title: '백업 데이터 외부 보관 점검', due: '2026-05-28', tag: '관리자 · 백업복원', repeat: '월 1회' },
  ];
  const counts = { all: items.length, urgent: 1, high: 1, normal: 2, low: 1 };
  const labels = { all:'전체', urgent:'긴급', high:'높음', normal:'보통', low:'낮음' };
  const tones  = { urgent:'danger', high:'warn', normal:'accent', low:'muted' };
  const filtered = pri === 'all' ? items : items.filter(i => i.p === pri);

  return (
    <>
      {/* 컨트롤 바 */}
      <div className="card" style={{padding: '14px 16px'}}>
        <div className="card-row" style={{margin: 0, alignItems: 'center'}}>
          <div className="row" style={{gap: 8, flexWrap:'wrap'}}>
            {Object.keys(labels).map(k => (
              <button
                key={k}
                className={'todo-chip' + (pri === k ? ' on' : '') + ' tone-' + (tones[k] || 'accent')}
                onClick={() => setPri(k)}
              >
                {labels[k]} <span className="cnt">{counts[k]}</span>
              </button>
            ))}
          </div>
          <div className="row" style={{gap: 10}}>
            <div className="seg" style={{padding: 2}}>
              {['day','week','month'].map(r => (
                <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)} style={{padding: '4px 14px', fontSize: 12}}>
                  {{day:'일별', week:'주간', month:'월간'}[r]}
                </button>
              ))}
            </div>
            <div className="att-month">
              <button className="att-mo-btn">‹</button>
              <span className="att-mo-lbl">2026-05-11</span>
              <button className="att-mo-btn">›</button>
            </div>
          </div>
        </div>
      </div>

      {/* 빠른 등록 */}
      <div className="todo-quickadd">
        <Icon name="plus" size={18} color="var(--z-400)"/>
        <input
          className="todo-input"
          placeholder="할 일을 입력하고 Enter — 예: '내일 오후 3시 의료기기 점검 결재'"
        />
        <div className="todo-quick-meta">
          <span><Icon name="alertCircle" size={12}/> 보통</span>
          <span><Icon name="refresh" size={12}/> 반복 없음</span>
          <span><Icon name="user" size={12}/> 내 작업</span>
          <span><Icon name="calendar" size={12}/> 2026-05-11</span>
        </div>
        <Btn variant="primary">등록</Btn>
      </div>

      {/* 리스트 */}
      <div className="card">
        <div className="card-row">
          <div>
            <div className="ctitle">{labels[pri]} 할 일</div>
            <div className="small" style={{marginTop: 2}}>{filtered.length}건 · 오름차순 마감순</div>
          </div>
          <div className="row" style={{gap: 6}}>
            <Btn size="sm" icon="filter">필터</Btn>
            <Btn size="sm">정렬</Btn>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-pad">
            <div className="empty-ico"><Icon name="check" size={26}/></div>
            <div className="empty-title">선택한 우선순위에 할 일이 없습니다.</div>
            <div className="empty-sub">위 빠른 등록으로 추가하거나, 우선순위 필터를 바꿔보세요.</div>
          </div>
        ) : (
          <div className="todo-list">
            {filtered.map((it, i) => (
              <label className="todo-row" key={i}>
                <input type="checkbox" className="todo-check"/>
                <span className={'pri-pill tone-' + (tones[it.p] || 'accent')}>{labels[it.p]}</span>
                <div className="todo-title">{it.title}</div>
                <div className="todo-meta">
                  <span><Icon name="calendar" size={12}/> {it.due}</span>
                  <span><Icon name="tag" size={12}/> {it.tag}</span>
                  <span><Icon name="refresh" size={12}/> {it.repeat}</span>
                </div>
                <Btn size="sm" icon="moreH"/>
              </label>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

// ------------ 탭 콘텐츠: 서류제출(docs) ------------
const TabDocs = () => {
  const docs = [
    { l: '가족관계증명서',    s: 'pending' },
    { l: '개인정보 보호교육',  s: 'pending' },
    { l: '면허(자격)증 사본', s: 'pending' },
    { l: '보건선결과(보건증)', s: 'pending' },
    { l: '산업안전 보건교육',  s: 'pending' },
    { l: '성희롱 예방교육',    s: 'pending' },
    { l: '신분증 사본',       s: 'submitted', date: '2026-04-12' },
    { l: '일반 건강검진',      s: 'pending' },
    { l: '잠복결핵 검진결과',  s: 'submitted', date: '2026-03-22' },
    { l: '장애인 인식개선교육', s: 'pending' },
    { l: '주민등록등본',      s: 'submitted', date: '2026-04-01' },
    { l: '주민등록초본',      s: 'pending' },
    { l: '직장내 괴롭힘 예방교육', s: 'pending' },
    { l: '통장사본',          s: 'submitted', date: '2026-04-01' },
    { l: '퇴직연금교육',       s: 'pending' },
    { l: '특수 건강검진',      s: 'pending' },
  ];
  return (
    <>
      {/* 전자서명 hero */}
      <div className="docs-hero">
        <div className="dh-left">
          <div className="dh-kicker">직원 문서 전자서명</div>
          <div className="dh-title">표준근로계약서</div>
          <div className="dh-meta">
            <Chip tone="warn">서명대기</Chip>
            <span className="small">요청일 2026.5.7</span>
            <span className="small">서명일 2026.4.28</span>
          </div>
          <div className="dh-sub">전자서명이 필요한 근로계약서가 있습니다. 우측 버튼으로 다시 열 수 있습니다.</div>
        </div>
        <div className="dh-right">
          <Btn>서명본 보기</Btn>
          <Btn variant="primary" icon="edit">전자서명 진행</Btn>
        </div>
      </div>

      {/* 서류 카드 그리드 */}
      <div className="docs-grid">
        {docs.map((d, i) => (
          <div className={'doc-card ' + d.s} key={i}>
            <div className="dc-head">
              <div className="dc-ico"><Icon name="fileText" size={18}/></div>
              {d.s === 'submitted'
                ? <Chip tone="success">제출 완료</Chip>
                : <Chip tone="muted">미제출</Chip>
              }
            </div>
            <div className="dc-label">{d.l}</div>
            <div className="dc-sub">{d.date ? '제출일 ' + d.date : '제출 필요'}</div>
            <div className="dc-actions">
              <button className="dc-act"><Icon name="image" size={13}/> 촬영</button>
              <button className="dc-act"><Icon name="file" size={13}/> 파일</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

// ------------ 탭 콘텐츠: 알림(alert) ------------
const TabAlert = () => {
  const [chip, setChip] = React.useState('all');
  const [view, setView] = React.useState('list');
  const items = [
    { ch: 'chat',     fr: '홍자비',  to: '백정민',     time: '44분 전', kind: '채팅',
      body: '교수님께서 퇴직연금 납입할 사람들 리스트 정리해달라 하셔서 정리했으며, 먼저 부장님께 보고드립니다. 일전에 보고드린대로 입사시 최초급여에 대하여…', unread: true, action: '바로가기' },
    { ch: 'chat',     fr: '김이지',  to: '백정민',     time: '1시간 전', kind: '채팅',
      body: '사진 다운로드 해서 보려고 하면 오류납니다.', unread: true, action: '바로가기' },
    { ch: 'approval', fr: '김지오',  to: '백정민',     time: '1시간 전', kind: '결재',
      body: '의료기기 점검 보고서 — 결재 회신이 도착했습니다. 반려 사유: 첨부 파일 누락', unread: true, action: '결재 열기' },
    { ch: 'hr',       fr: '시스템',  to: '인사관리',    time: '2시간 전', kind: '인사',
      body: '근태 이상감지 — 이가연 외 6명 지각 7회 누적. 면담 요청 검토 필요.', unread: false, action: '확인' },
    { ch: 'stock',    fr: '시스템',  to: '재고관리',    time: '오전 09:14', kind: '재고',
      body: '품목 "주사기 10ml" 안전재고 임계치 도달 — 부서 외래팀.', unread: false, action: '발주' },
  ];
  const counts = { all: items.length, chat: 2, approval: 3, hr: 2, stock: 1, etc: 1 };
  const labels = { all:'전체', chat:'채팅', approval:'결재', hr:'인사', stock:'재고', etc:'기타' };
  const filtered = chip === 'all' ? items : items.filter(i => i.ch === chip);
  return (
    <>
      {/* 헤더 요약 + 컨트롤 */}
      <div className="card" style={{padding: '16px 18px'}}>
        <div className="card-row" style={{margin: 0}}>
          <div className="row" style={{gap: 18}}>
            <div className="alert-stat">
              <div className="as-val">5</div>
              <div className="as-lbl">안 읽음</div>
            </div>
            <div style={{width: 1, height: 32, background:'var(--border)'}}/>
            <div className="alert-stat">
              <div className="as-val" style={{color: 'var(--warning)'}}>17</div>
              <div className="as-lbl">액션 필요</div>
            </div>
            <div style={{width: 1, height: 32, background:'var(--border)'}}/>
            <div className="alert-stat">
              <div className="as-val" style={{color:'var(--z-500)'}}>128</div>
              <div className="as-lbl">전체</div>
            </div>
          </div>
          <div className="row" style={{gap: 8}}>
            <div className="input-wrap">
              <Icon name="search" size={14} className="ico"/>
              <input className="input sm" placeholder="제목·본문·발신자 검색" style={{height: 32, minWidth: 240, paddingLeft: 30, fontSize: 12}}/>
            </div>
            <div className="seg" style={{padding: 2}}>
              <button className={view==='list'?'on':''} onClick={()=>setView('list')} style={{padding: '4px 12px', fontSize: 11}}>알림</button>
              <button className={view==='setting'?'on':''} onClick={()=>setView('setting')} style={{padding: '4px 12px', fontSize: 11}}>설정</button>
            </div>
            <Btn size="sm">모두 읽음</Btn>
          </div>
        </div>
        <div className="row" style={{gap: 6, marginTop: 12, flexWrap:'wrap'}}>
          {Object.keys(labels).map(k => (
            <button
              key={k}
              className={'todo-chip tone-accent' + (chip === k ? ' on' : '')}
              onClick={() => setChip(k)}
            >
              {labels[k]} <span className="cnt">{counts[k] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 알림 리스트 */}
      <div className="alert-section-lbl">오늘</div>
      <div className="alert-list">
        {filtered.map((n, i) => (
          <div className={'alert-row' + (n.unread ? ' unread' : '')} key={i}>
            <div className={'alert-ico kind-' + n.ch}>
              <Icon name={{chat:'chat', approval:'approval', hr:'users', stock:'package', etc:'tag'}[n.ch] || 'bell'} size={16}/>
            </div>
            <div className="alert-body">
              <div className="alert-row1">
                <span className="alert-kind">{n.kind}</span>
                <span className="alert-sep">·</span>
                <span className="alert-from"><b>{n.fr}</b> → {n.to}</span>
                {n.unread && <span className="alert-dot-unread"/>}
              </div>
              <div className="alert-msg">{n.body}</div>
            </div>
            <div className="alert-right">
              <div className="alert-time">{n.time}</div>
              <div className="row" style={{gap: 6, marginTop: 6}}>
                <button className="alert-link">{n.action}</button>
                <button className="alert-link mute">읽음</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

const TAB_CONTENT = {
  home:   <TabHome/>,
  attend: <TabAttend/>,
  todo:   <TabTodo/>,
  docs:   <TabDocs/>,
  alert:  <TabAlert/>,
};

const TAB_TITLES = {
  home:   { title: '내정보',   crumb: ['내정보', '메인'] },
  attend: { title: '출퇴근',   crumb: ['내정보', '출퇴근'] },
  todo:   { title: '할일',     crumb: ['내정보', '할일'] },
  docs:   { title: '서류제출', crumb: ['내정보', '서류제출'] },
  alert:  { title: '알림',     crumb: ['내정보', '알림'] },
};

const MyPageScreen = ({ tab = 'home', setTab = () => {} }) => {
  const tabs = [
    { id: 'home',    label: '내정보',  icon: 'user' },
    { id: 'attend',  label: '출퇴근',  icon: 'clock' },
    { id: 'todo',    label: '할일',    icon: 'check' },
    { id: 'docs',    label: '서류제출', icon: 'send' },
    { id: 'alert',   label: '알림',    icon: 'bell' },
  ];

  return (
    <div className="main">
      <Tabs tabs={tabs} active={tab} onPick={setTab} right={
        <Btn icon="star" size="sm">즐겨찾기 추가</Btn>
      }/>
      <div className="content">
        {TAB_CONTENT[tab]}
      </div>
    </div>
  );
};

// ------------ Notes (탭별) ------------
const NOTES_BY_TAB = {
  attend: {
    kicker: '§ MyPage — 출퇴근',
    title: '시계 · 상태 · CTA를 한 카드로. 그래프는 정보용으로만 남기고 시각 정돈.',
    points: [
      { t: 'Hero 카드 — 정보 우선순위 재배치', b: '오후 시간(거대) + "출근 전" 상태 dot + GPS 인증 칩을 좌측 한 묶음. 우측은 단일 CTA "출근하기"만. 부수 텍스트는 CTA 아래로 빠짐.' },
      { t: 'GPS 인증 시각화', b: '"병원 거리 38m" + check 칩으로 분리. 사용자가 출근 가능 여부를 한 줄에서 즉시 확인.' },
      { t: '3 KPI — 단색 → 의미 톤', b: '원본은 1일/0회/0회 모두 빨간 글씨. 개선: 근무일=중립, 지각=주의(warn), 정상출근=안정(success). 같은 카드라도 의미가 색으로 전달.' },
      { t: '일별 차트 — 막대 위 시간 라벨', b: '원본은 막대만, 시간은 호버해야 보였음. 막대 위에 hh 라벨 항상 노출. 미기록/결근은 회색/빨강으로 일관 구분.' },
      { t: '히스토리 row — 날짜 + 상태 토큰화', b: '월/일 박스를 상태색(warn/danger/muted/success)으로 통일된 4톤 시스템에 매핑. 출근/퇴근 시간 우측 정렬, 정정 요청 인라인 액션.' },
      { t: '목록/달력 토글 + 월 페이저', b: '우상단에 segmented control "목록 / 달력". 월 이동을 ‹ 2026. 5 › 표준 페이저로 통일.' },
    ],
  },
  todo: {
    kicker: '§ MyPage — 할일',
    title: '빠른 등록은 한 줄, 우선순위는 칩, 리스트는 위계 명확하게.',
    points: [
      { t: '우선순위 칩 — 카운트 통합', b: '전체/긴급/높음/보통/낮음을 5개 칩으로 일렬화. 카운트는 칩 내부 작은 배지로. 선택 시 칩 색이 우선순위 톤(danger/warn/accent/muted)으로 채워짐.' },
      { t: '빠른 등록 — 1줄 인풋 + 메타 미리보기', b: '원본의 5개 셀렉트 박스 (우선순위/반복/성격/날짜/시간) → 한 줄 입력 + 우측에 미세한 메타 칩(보통·반복없음·내작업·날짜). 클릭하면 펼침.' },
      { t: '리스트 row — 체크 · 우선순위 · 제목 · 메타 · 액션', b: '5열 그리드로 일관. 우선순위 핀은 22px pill로 가장 먼저, 제목은 700, 메타(마감/태그/반복)는 작은 한 줄.' },
      { t: '빈 상태 — 안내 + 다음 액션', b: '원본의 단순 "비어있습니다" → 아이콘 + 제목 + "위 빠른 등록으로 추가하거나 필터를 바꿔보세요" 가이드를 표준화.' },
      { t: '일별/주간/월간 + 날짜 페이저', b: '우상단 segmented + ‹ 날짜 › 페이저로 시간 범위 전환. 출퇴근 페이저와 같은 토큰.' },
      { t: '정렬/필터 — 우상단 인라인', b: '리스트 카드 우상단에 정렬/필터 작은 버튼. 자주 쓰는 단순 옵션만 노출.' },
    ],
  },
  docs: {
    kicker: '§ MyPage — 서류제출',
    title: '진행률을 먼저, 가이드는 작게, 그리드는 한 줄로 호흡.',
    points: [
      { t: '전자서명 hero — 보라 톤 분리', b: '직원 문서 전자서명은 일반 서류 제출과 다른 흐름이므로 보라 톤 그라데이션 카드로 분리. 좌측 정보 + 우측 2개 액션.' },
      { t: '진행률 카드 — 제출/미제출 + 게이지', b: '4/16 같은 단순 카운트만 있던 원본 → 좌측 통계 + 중앙 게이지(% 진행) + 우측 검색·필터로 한 줄 정돈.' },
      { t: '스마트 스캔 안내 — 풀라이트 배너', b: '원본의 박스형 안내 → 1줄 배너 + 아이콘 + 가이드 보기 액션. 시각 호흡 작게.' },
      { t: '서류 카드 — 4열 그리드', b: '원본 6열은 1366에서 카드 폭 200px 미만으로 너무 작음. 4열로 줄여 카드당 폭 270px+ 확보. 라벨 + 상태 칩 + 촬영/파일 2액션.' },
      { t: '제출 완료 상태 시각화', b: '제출된 서류는 라이트 그린 톤 배경 + 녹색 아이콘 박스 + "제출일 yyyy-mm-dd" 메타로 한눈에 구분. 호버 시 미세 상승.' },
      { t: '검색 + 상태 segmented', b: '서류명 검색 인풋 + 전체/미제출/제출완료 segmented control. 16종 그리드에서 빠르게 좁히기.' },
    ],
  },
  alert: {
    kicker: '§ MyPage — 알림',
    title: '읽음/액션 필요/전체를 헤더 stat으로, 분류는 칩으로, 본문은 1줄로.',
    points: [
      { t: 'Stat 3종 — 안읽음/액션 필요/전체', b: '원본의 작은 상단 라벨 → 큰 숫자 + 라벨 stat 3종. 액션 필요는 주의 톤(warning)으로 강조.' },
      { t: '분류 칩 — 카운트 통합', b: '채팅/결재/인사/재고/기타를 칩으로 일렬화. 카운트는 칩 내부 배지. 할일 탭과 같은 디자인 토큰 재사용.' },
      { t: 'unread row — 좌측 배경 톤', b: '안 읽음 알림은 row 배경을 옅은 파랑(--accent-soft 변형)으로 칠해 안읽음/읽음 구분이 한눈에. 우측에 작은 dot도.' },
      { t: '아이콘 박스 — 카테고리 컬러', b: '채팅=파랑, 결재=주황, 인사=보라, 재고=녹색. 같은 색을 칩/배지/아이콘 모두에 일관 매핑.' },
      { t: '본문 — 1줄 truncate + 우측 시간/액션', b: '원본은 본문 2-3줄 노출 → 한 줄 + ... 처리. 우측에 작은 시간 라벨 + 인라인 액션 2종(바로가기/읽음).' },
      { t: '검색 + 알림/설정 토글', b: '제목·본문·발신자 검색 1개 인풋으로 통합. 우측에 알림/설정 segmented control로 설정 화면 진입.' },
    ],
  },
  home: {
    kicker: '§ MyPage — 내정보 메인',
    title: '원본 5 KPI 구조는 유지하고, 위계 · 정렬 · 여백만 정돈.',
    points: [
      { t: 'PageHeader — 22 H1 + breadcrumb', b: '17px 단순 제목 → "내정보 · 메인" breadcrumb + 22px H1로 위계 6px → 10px 확보.' },
      { t: 'KPI 카드 — 원본 구조 유지', b: '5장 단순 카드 그대로. icon → label·서브 → 값(또는 →) 한 줄 정렬, 그래프·전월 대비 제외.' },
      { t: '카드 전체가 클릭 영역', b: '"열기" 버튼 제거, 카드 자체가 클릭 타깃. 값이 없는 카드는 우측에 미세한 chevron만.' },
      { t: '아이콘 톤 = 상태 단서', b: '근태/급여명세서/증명서=중립, 연차=안정, 미결재=주의. 같은 카드라도 한눈에 상태가 읽히도록.' },
      { t: '컨트롤 36px / 본문 14px', b: '버튼·탭·인풋 32 → 36px, body 13 → 14px. 데스크톱 호흡 회복 + H1 22 위계 강화.' },
      { t: '프로필 카드 — 사번·입사일 우측 정렬', b: '좌측은 인물/태그, 우측은 시간 메타. 좌/우 정보 영역 분리로 시선 흐름 단축.' },
    ],
  },
};

const MyPageNotes = ({ tab = 'home' }) => {
  const n = NOTES_BY_TAB[tab] || NOTES_BY_TAB.home;
  return <Notes kicker={n.kicker} title={n.title} points={n.points}/>;
};

Object.assign(window, { MyPageScreen, MyPageNotes });
